package nginx

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"text/template"
)

// ErrorPageConfig holds custom error page configuration.
type ErrorPageConfig struct {
	Code       int    `json:"code"`       // e.g., 404, 500, 502, 503
	CustomHTML string `json:"customHtml"` // Custom HTML content (optional)
}

// DefaultRouteMode specifies the type of default route behavior.
type DefaultRouteMode string

const (
	ModeNginxDefault DefaultRouteMode = "nginx_default" // Use nginx built-in pages
	ModeCustomPage   DefaultRouteMode = "custom_page"   // Custom HTML page
	ModeErrorCode    DefaultRouteMode = "error_code"    // Return specific error code
	ModeProxy        DefaultRouteMode = "proxy"         // Reverse proxy to backend
	ModeRedirect     DefaultRouteMode = "redirect"      // 302 redirect
)

// DefaultRouteConfig holds the configuration for the default server block.
type DefaultRouteConfig struct {
	Enabled     bool              `json:"enabled"`
	Mode        DefaultRouteMode  `json:"mode"`        // Route mode
	Target      string            `json:"target"`      // For proxy mode
	RedirectURL string            `json:"redirectUrl"` // For redirect mode
	ErrorCode   int               `json:"errorCode"`   // For error_code mode (e.g., 404, 503)
	CustomHTML  string            `json:"customHtml"`  // For custom_page mode
	ErrorPages  []ErrorPageConfig `json:"errorPages"`  // Custom error pages for each code
}

const defaultServerTemplate = `# Nubi managed default server block
# Do not edit manually - changes will be overwritten

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Nubi metrics endpoint - internal access only
    location = /.nubi/status {
        stub_status on;
        allow 127.0.0.1;
        deny all;
    }

{{- if eq .Mode "nginx_default" }}
    # Default nginx behavior - serve default welcome page
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
{{- else }}
    # Error pages directory
    root /var/lib/nubi/html;
{{- end }}

{{- range .ErrorPages }}
    error_page {{ .Code }} /nubi_error_{{ .Code }}.html;
    location = /nubi_error_{{ .Code }}.html {
        internal;
    }
{{- end }}

{{- if eq .Mode "redirect" }}
    # Redirect all unmatched requests
    location / {
        return 302 {{ .RedirectURL }};
    }
{{- else if eq .Mode "proxy" }}
    # Proxy all unmatched requests to default backend
    location / {
        proxy_pass {{ .Target }};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
{{- else if eq .Mode "error_code" }}
    # Return specific error code
    location / {
        return {{ .ErrorCode }};
    }
{{- else if eq .Mode "custom_page" }}
    # Serve custom page
    location / {
        try_files /nubi_default.html =404;
    }
{{- else }}
    # Default nginx welcome page
    location / {
        try_files $uri $uri/ =404;
    }
{{- end }}
}
`

// DefaultRouteManager handles the default server block configuration.
type DefaultRouteManager struct {
	configPath string
	tmpl       *template.Template
}

// NewDefaultRouteManager creates a manager for the default route configuration.
// configPath should be something like "/etc/nginx/sites-available/00-default" or similar.
func NewDefaultRouteManager(configPath string) (*DefaultRouteManager, error) {
	if configPath == "" {
		configPath = "/etc/nginx/sites-available/00-nubi-default"
	}

	tmpl, err := template.New("default_server").Parse(defaultServerTemplate)
	if err != nil {
		return nil, fmt.Errorf("failed to parse default server template: %w", err)
	}

	return &DefaultRouteManager{
		configPath: configPath,
		tmpl:       tmpl,
	}, nil
}

// ConfigPath returns the path where the default config is written.
func (m *DefaultRouteManager) ConfigPath() string {
	return m.configPath
}

// SymlinkPath returns the path in sites-enabled.
func (m *DefaultRouteManager) SymlinkPath() string {
	return filepath.Join("/etc/nginx/sites-enabled", filepath.Base(m.configPath))
}

// Apply writes the default server configuration and creates symlink if enabled.
func (m *DefaultRouteManager) Apply(ctx context.Context, config *DefaultRouteConfig) error {
	if !config.Enabled {
		return m.Disable(ctx)
	}

	// Ensure directories exist
	dir := filepath.Dir(m.configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	htmlDir := "/var/lib/nubi/html"
	if err := os.MkdirAll(htmlDir, 0755); err != nil {
		return fmt.Errorf("failed to create html directory: %w", err)
	}

	// Write custom HTML page if in custom_page mode
	if config.Mode == ModeCustomPage && config.CustomHTML != "" {
		customPath := filepath.Join(htmlDir, "nubi_default.html")
		if err := os.WriteFile(customPath, []byte(config.CustomHTML), 0644); err != nil {
			return fmt.Errorf("failed to write custom page: %w", err)
		}
	}

	// Write error pages
	for _, ep := range config.ErrorPages {
		if ep.CustomHTML != "" {
			epPath := filepath.Join(htmlDir, fmt.Sprintf("nubi_error_%d.html", ep.Code))
			if err := os.WriteFile(epPath, []byte(ep.CustomHTML), 0644); err != nil {
				return fmt.Errorf("failed to write error page %d: %w", ep.Code, err)
			}
		}
	}

	// Write config file
	f, err := os.Create(m.configPath)
	if err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}
	defer f.Close()

	if err := m.tmpl.Execute(f, config); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	// Create symlink in sites-enabled
	symlinkPath := m.SymlinkPath()
	_ = os.Remove(symlinkPath) // Remove existing symlink if any
	if err := os.Symlink(m.configPath, symlinkPath); err != nil {
		return fmt.Errorf("failed to create symlink: %w", err)
	}

	// Save state to JSON file for persistence
	if err := m.saveState(config); err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}

	return nil
}

// Disable removes the default server configuration.
func (m *DefaultRouteManager) Disable(ctx context.Context) error {
	// Remove symlink first
	_ = os.Remove(m.SymlinkPath())
	// Remove config file
	_ = os.Remove(m.configPath)
	// Remove state file
	_ = os.Remove(m.stateFilePath())
	return nil
}

// stateFilePath returns path to the JSON state file.
func (m *DefaultRouteManager) stateFilePath() string {
	return "/var/lib/nubi/default_route_state.json"
}

// saveState persists the configuration to a JSON file.
func (m *DefaultRouteManager) saveState(config *DefaultRouteConfig) error {
	dir := filepath.Dir(m.stateFilePath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(m.stateFilePath(), data, 0644)
}

// GetConfig reads the current state from the JSON file.
func (m *DefaultRouteManager) GetConfig() (*DefaultRouteConfig, error) {
	config := &DefaultRouteConfig{Enabled: false, Mode: ModeNginxDefault}

	// Read state file
	data, err := os.ReadFile(m.stateFilePath())
	if err != nil {
		// File doesn't exist, return default
		return config, nil
	}

	if err := json.Unmarshal(data, config); err != nil {
		return config, nil
	}

	// Verify symlink still exists
	if _, err := os.Lstat(m.SymlinkPath()); err != nil {
		config.Enabled = false
	}

	return config, nil
}

// maintenanceStateFilePath returns path to the maintenance backup state file.
func (m *DefaultRouteManager) maintenanceStateFilePath() string {
	return "/var/lib/nubi/maintenance_backup_state.json"
}

// ApplyMaintenance enables maintenance mode with custom HTML.
func (m *DefaultRouteManager) ApplyMaintenance(ctx context.Context, html string) error {
	// Backup current config
	currentConfig, _ := m.GetConfig()
	if currentConfig.Enabled {
		data, _ := json.MarshalIndent(currentConfig, "", "  ")
		os.WriteFile(m.maintenanceStateFilePath(), data, 0644)
	}

	// Apply maintenance page
	maintenanceConfig := &DefaultRouteConfig{
		Enabled:    true,
		Mode:       ModeCustomPage,
		CustomHTML: html,
	}
	return m.Apply(ctx, maintenanceConfig)
}

// DisableMaintenance restores the previous configuration.
func (m *DefaultRouteManager) DisableMaintenance(ctx context.Context) error {
	// Try to restore backup
	data, err := os.ReadFile(m.maintenanceStateFilePath())
	if err != nil {
		// No backup, just disable
		return m.Disable(ctx)
	}

	var config DefaultRouteConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return m.Disable(ctx)
	}

	// Remove backup file
	os.Remove(m.maintenanceStateFilePath())

	// Restore previous config
	return m.Apply(ctx, &config)
}
