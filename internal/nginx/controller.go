package nginx

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const (
	defaultBinary = "nginx"
	cmdTimeout    = 5 * time.Second
)

// Controller provides a thin wrapper around the nginx binary.
type Controller struct {
	binary string
}

// NewController returns a Controller, falling back to the default binary name when empty.
func NewController(binary string) *Controller {
	if strings.TrimSpace(binary) == "" {
		binary = defaultBinary
	}

	return &Controller{binary: binary}
}

// Status summarises nginx health.
type Status struct {
	ConfigTest string `json:"configTest"`
	Version    string `json:"version"`
}

func (c *Controller) run(ctx context.Context, args ...string) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	ctxWithTimeout, cancel := context.WithTimeout(ctx, cmdTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctxWithTimeout, c.binary, args...)
	output, err := cmd.CombinedOutput()

	result := strings.TrimSpace(string(output))
	if err != nil {
		if result == "" {
			return result, fmt.Errorf("nginx command failed: %w", err)
		}
		return result, fmt.Errorf("nginx command failed: %w", errors.New(result))
	}

	return result, nil
}

// CheckConfig runs `nginx -t` and returns the raw output.
func (c *Controller) CheckConfig(ctx context.Context) (string, error) {
	return c.run(ctx, "-t")
}

// Reload asks nginx to reload its configuration.
func (c *Controller) Reload(ctx context.Context) error {
	_, err := c.run(ctx, "-s", "reload")
	return err
}

// Version returns the nginx version string.
func (c *Controller) Version(ctx context.Context) (string, error) {
	return c.run(ctx, "-v")
}

// Status collects version and config test results.
func (c *Controller) Status(ctx context.Context) (*Status, error) {
	configOutput, configErr := c.CheckConfig(ctx)
	versionOutput, versionErr := c.Version(ctx)

	status := &Status{
		ConfigTest: configOutput,
		Version:    versionOutput,
	}

	if configErr != nil {
		return status, fmt.Errorf("config test error: %w", configErr)
	}

	if versionErr != nil {
		return status, fmt.Errorf("version error: %w", versionErr)
	}

	return status, nil
}
