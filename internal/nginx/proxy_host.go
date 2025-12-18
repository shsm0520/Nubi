package nginx

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/google/uuid"
)

// Backend represents a single backend server for load balancing
type Backend struct {
	Address string `json:"address"` // e.g., "127.0.0.1:3000"
	Weight  int    `json:"weight"`  // Load balancing weight (1-100)
	Backup  bool   `json:"backup"`  // Is this a backup server?
}

// ProxyHost represents a single reverse proxy configuration
type ProxyHost struct {
	ID            string    `json:"id"`
	Domain        string    `json:"domain"`        // e.g., "example.com" or "*.example.com"
	Target        string    `json:"target"`        // e.g., "http://127.0.0.1:3000" (used for single backend)
	Backends      []Backend `json:"backends"`      // Multiple backends for load balancing
	LBMethod      string    `json:"lbMethod"`      // Load balancing method: round_robin, least_conn, ip_hash
	SSL           bool      `json:"ssl"`           // Enable SSL/HTTPS
	ForceSSL      bool      `json:"forceSSL"`      // Redirect HTTP to HTTPS
	CertificateID string    `json:"certificateId"` // ID of the certificate to use
	CertPath      string    `json:"certPath"`      // Path to SSL certificate
	KeyPath       string    `json:"keyPath"`       // Path to SSL private key
	Enabled       bool      `json:"enabled"`       // Whether this host is active
	Maintenance   bool      `json:"maintenance"`   // Show maintenance page instead of proxying
	WebSocket     bool      `json:"websocket"`     // Enable WebSocket support
	CustomNginx   string    `json:"customNginx"`   // Custom nginx configuration
	Tags          []string  `json:"tags"`          // Tags for grouping and bulk operations
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// HasLoadBalancing returns true if the host has multiple backends configured
func (h *ProxyHost) HasLoadBalancing() bool {
	return len(h.Backends) > 1
}

// UpstreamName returns the nginx upstream name for this host
func (h *ProxyHost) UpstreamName() string {
	// Create a safe name from domain
	safe := regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(h.Domain, "_")
	return "nubi_" + safe
}

// ProxyHostManager handles CRUD operations for proxy hosts
type ProxyHostManager struct {
	mu         sync.RWMutex
	hosts      map[string]*ProxyHost
	configDir  string // e.g., /etc/nginx/sites-available
	enabledDir string // e.g., /etc/nginx/sites-enabled
	dataFile   string // e.g., /var/lib/nubi/proxy_hosts.json
	tmpl       *template.Template
}

const proxyHostTemplate = `# Nubi managed proxy host: {{ .Domain }}
# Do not edit manually - changes will be overwritten
# Host ID: {{ .ID }}

{{- if .HasLoadBalancing }}
# Load Balancing Upstream
upstream {{ .UpstreamName }} {
{{- if eq .LBMethod "least_conn" }}
    least_conn;
{{- else if eq .LBMethod "ip_hash" }}
    ip_hash;
{{- end }}
{{- range .Backends }}
    server {{ .Address }}{{ if gt .Weight 1 }} weight={{ .Weight }}{{ end }}{{ if .Backup }} backup{{ end }};
{{- end }}
}
{{- end }}

server {
    listen 80;
{{- if .SSL }}
    listen 443 ssl http2;
{{- end }}
    server_name {{ .Domain }};

{{- if and .SSL .ForceSSL }}
    # Force HTTPS redirect
    if ($scheme = http) {
        return 301 https://$host$request_uri;
    }
{{- end }}

{{- if .SSL }}
    # SSL Configuration (placeholder - integrate with Let's Encrypt)
    # ssl_certificate /etc/letsencrypt/live/{{ .Domain }}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/{{ .Domain }}/privkey.pem;
{{- end }}

{{- if .Maintenance }}
    # Maintenance mode - return 503 with custom page
    root /var/lib/nubi/html;
    error_page 503 /nubi_maintenance.html;
    location / {
        return 503;
    }
    location = /nubi_maintenance.html {
        internal;
    }
{{- else }}
    location / {
{{- if .HasLoadBalancing }}
        proxy_pass http://{{ .UpstreamName }};
{{- else }}
        proxy_pass {{ .Target }};
{{- end }}
        proxy_http_version 1.1;
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

{{- if .WebSocket }}
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
{{- end }}
    }
{{- end }}

{{- if .CustomNginx }}

    # Custom configuration
{{ .CustomNginx }}
{{- end }}
}
`

// NewProxyHostManager creates a new proxy host manager
func NewProxyHostManager(configDir, enabledDir, dataFile string) (*ProxyHostManager, error) {
	if configDir == "" {
		configDir = "/etc/nginx/sites-available"
	}
	if enabledDir == "" {
		enabledDir = "/etc/nginx/sites-enabled"
	}
	if dataFile == "" {
		dataFile = "/var/lib/nubi/proxy_hosts.json"
	}

	tmpl, err := template.New("proxy_host").Parse(proxyHostTemplate)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proxy host template: %w", err)
	}

	mgr := &ProxyHostManager{
		hosts:      make(map[string]*ProxyHost),
		configDir:  configDir,
		enabledDir: enabledDir,
		dataFile:   dataFile,
		tmpl:       tmpl,
	}

	// Load existing hosts from data file
	if err := mgr.load(); err != nil {
		// Not a fatal error - might be first run
		fmt.Printf("Note: Could not load existing proxy hosts: %v\n", err)
	}

	return mgr, nil
}

// load reads hosts from the JSON data file
func (m *ProxyHostManager) load() error {
	data, err := os.ReadFile(m.dataFile)
	if err != nil {
		return err
	}

	var hosts []*ProxyHost
	if err := json.Unmarshal(data, &hosts); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.hosts = make(map[string]*ProxyHost)
	for _, h := range hosts {
		m.hosts[h.ID] = h
	}

	return nil
}

// save writes hosts to the JSON data file
func (m *ProxyHostManager) save() error {
	m.mu.RLock()
	hosts := make([]*ProxyHost, 0, len(m.hosts))
	for _, h := range m.hosts {
		hosts = append(hosts, h)
	}
	m.mu.RUnlock()

	data, err := json.MarshalIndent(hosts, "", "  ")
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(m.dataFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(m.dataFile, data, 0644)
}

// List returns all proxy hosts
func (m *ProxyHostManager) List() []*ProxyHost {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hosts := make([]*ProxyHost, 0, len(m.hosts))
	for _, h := range m.hosts {
		hosts = append(hosts, h)
	}
	return hosts
}

// Get returns a proxy host by ID
func (m *ProxyHostManager) Get(id string) (*ProxyHost, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	host, ok := m.hosts[id]
	if !ok {
		return nil, fmt.Errorf("proxy host not found: %s", id)
	}
	return host, nil
}

// Create adds a new proxy host
func (m *ProxyHostManager) Create(ctx context.Context, host *ProxyHost) error {
	// Validate domain
	if err := validateDomain(host.Domain); err != nil {
		return err
	}

	// Validate target URL (only if not using load balancing)
	if len(host.Backends) == 0 {
		if err := validateTarget(host.Target); err != nil {
			return err
		}
	}

	// Check for duplicate domain
	m.mu.RLock()
	for _, h := range m.hosts {
		if h.Domain == host.Domain {
			m.mu.RUnlock()
			return fmt.Errorf("domain already exists: %s", host.Domain)
		}
	}
	m.mu.RUnlock()

	// Generate ID and timestamps
	host.ID = uuid.New().String()
	host.CreatedAt = time.Now()
	host.UpdatedAt = time.Now()

	// Write nginx config
	if err := m.writeNginxConfig(host); err != nil {
		return err
	}

	// Add to memory
	m.mu.Lock()
	m.hosts[host.ID] = host
	m.mu.Unlock()

	// Save to disk
	return m.save()
}

// Update modifies an existing proxy host
func (m *ProxyHostManager) Update(ctx context.Context, id string, updates *ProxyHost) error {
	m.mu.Lock()
	host, ok := m.hosts[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("proxy host not found: %s", id)
	}

	// Check domain change doesn't conflict
	if updates.Domain != host.Domain {
		for _, h := range m.hosts {
			if h.ID != id && h.Domain == updates.Domain {
				m.mu.Unlock()
				return fmt.Errorf("domain already exists: %s", updates.Domain)
			}
		}
	}

	oldDomain := host.Domain

	// Update fields
	host.Domain = updates.Domain
	host.Target = updates.Target
	host.Backends = updates.Backends
	host.LBMethod = updates.LBMethod
	host.SSL = updates.SSL
	host.ForceSSL = updates.ForceSSL
	host.Enabled = updates.Enabled
	host.Maintenance = updates.Maintenance
	host.WebSocket = updates.WebSocket
	host.CustomNginx = updates.CustomNginx
	host.CertificateID = updates.CertificateID
	host.CertPath = updates.CertPath
	host.KeyPath = updates.KeyPath
	host.Tags = updates.Tags
	host.UpdatedAt = time.Now()

	m.mu.Unlock()

	// Remove old config if domain changed
	if oldDomain != host.Domain {
		m.removeNginxConfig(oldDomain)
	}

	// Write new nginx config
	if err := m.writeNginxConfig(host); err != nil {
		return err
	}

	return m.save()
}

// Delete removes a proxy host
func (m *ProxyHostManager) Delete(ctx context.Context, id string) error {
	m.mu.Lock()
	host, ok := m.hosts[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("proxy host not found: %s", id)
	}

	delete(m.hosts, id)
	m.mu.Unlock()

	// Remove nginx config
	m.removeNginxConfig(host.Domain)

	return m.save()
}

// Toggle enables or disables a proxy host
func (m *ProxyHostManager) Toggle(ctx context.Context, id string, enabled bool) error {
	m.mu.Lock()
	host, ok := m.hosts[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("proxy host not found: %s", id)
	}

	host.Enabled = enabled
	host.UpdatedAt = time.Now()
	m.mu.Unlock()

	// Update symlink
	if err := m.updateSymlink(host); err != nil {
		return err
	}

	return m.save()
}

// SetMaintenance enables or disables maintenance mode for a proxy host
func (m *ProxyHostManager) SetMaintenance(ctx context.Context, id string, maintenance bool) error {
	m.mu.Lock()
	host, ok := m.hosts[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("proxy host not found: %s", id)
	}

	host.Maintenance = maintenance
	host.UpdatedAt = time.Now()
	m.mu.Unlock()

	// Rewrite nginx config with new maintenance status
	if err := m.writeNginxConfig(host); err != nil {
		return err
	}

	return m.save()
}

// writeNginxConfig generates and writes the nginx configuration file
func (m *ProxyHostManager) writeNginxConfig(host *ProxyHost) error {
	configPath := m.configPath(host.Domain)

	// Ensure directory exists
	if err := os.MkdirAll(m.configDir, 0755); err != nil {
		return err
	}

	f, err := os.Create(configPath)
	if err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}
	defer f.Close()

	if err := m.tmpl.Execute(f, host); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	// Update symlink based on enabled status
	return m.updateSymlink(host)
}

// updateSymlink creates or removes the symlink in sites-enabled
func (m *ProxyHostManager) updateSymlink(host *ProxyHost) error {
	configPath := m.configPath(host.Domain)
	symlinkPath := m.symlinkPath(host.Domain)

	// Remove existing symlink
	_ = os.Remove(symlinkPath)

	// Create symlink if enabled
	if host.Enabled {
		if err := os.MkdirAll(m.enabledDir, 0755); err != nil {
			return err
		}
		if err := os.Symlink(configPath, symlinkPath); err != nil {
			return fmt.Errorf("failed to create symlink: %w", err)
		}
	}

	return nil
}

// removeNginxConfig deletes the nginx configuration files
func (m *ProxyHostManager) removeNginxConfig(domain string) {
	configPath := m.configPath(domain)
	symlinkPath := m.symlinkPath(domain)

	_ = os.Remove(symlinkPath)
	_ = os.Remove(configPath)
}

// ApplyCertificate applies a certificate to a host
func (m *ProxyHostManager) ApplyCertificate(ctx context.Context, hostID, certID, certPath, keyPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	host, ok := m.hosts[hostID]
	if !ok {
		return fmt.Errorf("host not found: %s", hostID)
	}

	host.CertificateID = certID
	host.CertPath = certPath
	host.KeyPath = keyPath
	host.SSL = true
	host.UpdatedAt = time.Now()

	if err := m.save(); err != nil {
		return err
	}

	// Regenerate nginx config
	return m.writeConfig(host)
}

func (m *ProxyHostManager) writeConfig(host *ProxyHost) error {
	panic("unimplemented")
}

// AddTag adds a tag to a host
func (m *ProxyHostManager) AddTag(ctx context.Context, hostID, tagID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	host, ok := m.hosts[hostID]
	if !ok {
		return fmt.Errorf("host not found: %s", hostID)
	}

	// Check if tag already exists
	for _, t := range host.Tags {
		if t == tagID {
			return nil // Already has this tag
		}
	}

	host.Tags = append(host.Tags, tagID)
	host.UpdatedAt = time.Now()

	return m.save()
}

// RemoveTag removes a tag from a host
func (m *ProxyHostManager) RemoveTag(ctx context.Context, hostID, tagID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	host, ok := m.hosts[hostID]
	if !ok {
		return fmt.Errorf("host not found: %s", hostID)
	}

	newTags := make([]string, 0, len(host.Tags))
	for _, t := range host.Tags {
		if t != tagID {
			newTags = append(newTags, t)
		}
	}

	host.Tags = newTags
	host.UpdatedAt = time.Now()

	return m.save()
}

// configPath returns the path to the nginx config file
func (m *ProxyHostManager) configPath(domain string) string {
	// Sanitize domain for filename
	safeDomain := strings.ReplaceAll(domain, "*", "_wildcard_")
	safeDomain = strings.ReplaceAll(safeDomain, ".", "_")
	return filepath.Join(m.configDir, "nubi-host-"+safeDomain+".conf")
}

// symlinkPath returns the path to the symlink in sites-enabled
func (m *ProxyHostManager) symlinkPath(domain string) string {
	safeDomain := strings.ReplaceAll(domain, "*", "_wildcard_")
	safeDomain = strings.ReplaceAll(safeDomain, ".", "_")
	return filepath.Join(m.enabledDir, "nubi-host-"+safeDomain+".conf")
}

// validateDomain checks if a domain name is valid
func validateDomain(domain string) error {
	if domain == "" {
		return fmt.Errorf("domain is required")
	}

	// Allow wildcards like *.example.com
	domain = strings.TrimPrefix(domain, "*.")

	// Basic domain validation
	domainRegex := regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$`)
	if !domainRegex.MatchString(domain) {
		return fmt.Errorf("invalid domain format: %s", domain)
	}

	return nil
}

// validateTarget checks if a target URL is valid
func validateTarget(target string) error {
	if target == "" {
		return fmt.Errorf("target is required")
	}

	// Basic URL validation - should start with http:// or https://
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		return fmt.Errorf("target must start with http:// or https://")
	}

	return nil
}
