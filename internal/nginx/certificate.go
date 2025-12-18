package nginx

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Certificate represents an SSL certificate
type Certificate struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`        // Display name
	Domains     []string  `json:"domains"`     // Domains covered by this cert
	CertPath    string    `json:"certPath"`    // Path to certificate file
	KeyPath     string    `json:"keyPath"`     // Path to private key file
	ChainPath   string    `json:"chainPath"`   // Path to CA chain (optional)
	Type        string    `json:"type"`        // "uploaded", "letsencrypt", "self-signed"
	ExpiresAt   time.Time `json:"expiresAt"`   // Certificate expiration date
	AutoRenew   bool      `json:"autoRenew"`   // Auto-renew (for Let's Encrypt)
	Tags        []string  `json:"tags"`        // Associated tags for bulk operations
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Tag represents a tag for grouping hosts
type Tag struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`     // Hex color for UI
	CreatedAt time.Time `json:"createdAt"`
}

// CertificateManager handles certificate operations
type CertificateManager struct {
	mu           sync.RWMutex
	certs        map[string]*Certificate
	tags         map[string]*Tag
	dataFile     string
	tagsFile     string
	certsDir     string // Directory to store cert files
}

// NewCertificateManager creates a new certificate manager
func NewCertificateManager(dataDir string) (*CertificateManager, error) {
	certsDir := filepath.Join(dataDir, "certs")
	if err := os.MkdirAll(certsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create certs directory: %w", err)
	}

	m := &CertificateManager{
		certs:    make(map[string]*Certificate),
		tags:     make(map[string]*Tag),
		dataFile: filepath.Join(dataDir, "certificates.json"),
		tagsFile: filepath.Join(dataDir, "tags.json"),
		certsDir: certsDir,
	}

	if err := m.load(); err != nil {
		// Ignore error if file doesn't exist
		if !os.IsNotExist(err) {
			return nil, err
		}
	}

	return m, nil
}

func (m *CertificateManager) load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Load certificates
	data, err := os.ReadFile(m.dataFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var certList []*Certificate
	if err := json.Unmarshal(data, &certList); err != nil {
		return err
	}

	for _, c := range certList {
		m.certs[c.ID] = c
	}

	// Load tags
	tagsData, err := os.ReadFile(m.tagsFile)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
	} else {
		var tagList []*Tag
		if err := json.Unmarshal(tagsData, &tagList); err != nil {
			return err
		}
		for _, t := range tagList {
			m.tags[t.ID] = t
		}
	}

	return nil
}

func (m *CertificateManager) save() error {
	// Save certificates
	certs := make([]*Certificate, 0, len(m.certs))
	for _, c := range m.certs {
		certs = append(certs, c)
	}

	data, err := json.MarshalIndent(certs, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(m.dataFile, data, 0644); err != nil {
		return err
	}

	// Save tags
	tags := make([]*Tag, 0, len(m.tags))
	for _, t := range m.tags {
		tags = append(tags, t)
	}

	tagsData, err := json.MarshalIndent(tags, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(m.tagsFile, tagsData, 0644)
}

// ListCertificates returns all certificates
func (m *CertificateManager) ListCertificates(ctx context.Context) ([]*Certificate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	certs := make([]*Certificate, 0, len(m.certs))
	for _, c := range m.certs {
		certs = append(certs, c)
	}
	return certs, nil
}

// GetCertificate returns a certificate by ID
func (m *CertificateManager) GetCertificate(ctx context.Context, id string) (*Certificate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cert, ok := m.certs[id]
	if !ok {
		return nil, fmt.Errorf("certificate not found: %s", id)
	}
	return cert, nil
}

// CreateCertificate creates a new certificate entry
func (m *CertificateManager) CreateCertificate(ctx context.Context, cert *Certificate, certContent, keyContent []byte) (*Certificate, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cert.ID = uuid.New().String()
	cert.CreatedAt = time.Now()
	cert.UpdatedAt = time.Now()

	// Save certificate files
	certPath := filepath.Join(m.certsDir, cert.ID+".crt")
	keyPath := filepath.Join(m.certsDir, cert.ID+".key")

	if err := os.WriteFile(certPath, certContent, 0644); err != nil {
		return nil, fmt.Errorf("failed to save certificate: %w", err)
	}

	if err := os.WriteFile(keyPath, keyContent, 0600); err != nil {
		os.Remove(certPath) // Cleanup
		return nil, fmt.Errorf("failed to save key: %w", err)
	}

	cert.CertPath = certPath
	cert.KeyPath = keyPath

	m.certs[cert.ID] = cert

	if err := m.save(); err != nil {
		return nil, err
	}

	return cert, nil
}

// UpdateCertificate updates a certificate
func (m *CertificateManager) UpdateCertificate(ctx context.Context, id string, updates *Certificate) (*Certificate, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cert, ok := m.certs[id]
	if !ok {
		return nil, fmt.Errorf("certificate not found: %s", id)
	}

	cert.Name = updates.Name
	cert.Domains = updates.Domains
	cert.Tags = updates.Tags
	cert.AutoRenew = updates.AutoRenew
	cert.UpdatedAt = time.Now()

	if err := m.save(); err != nil {
		return nil, err
	}

	return cert, nil
}

// DeleteCertificate deletes a certificate
func (m *CertificateManager) DeleteCertificate(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cert, ok := m.certs[id]
	if !ok {
		return fmt.Errorf("certificate not found: %s", id)
	}

	// Remove cert files
	if cert.CertPath != "" {
		os.Remove(cert.CertPath)
	}
	if cert.KeyPath != "" {
		os.Remove(cert.KeyPath)
	}
	if cert.ChainPath != "" {
		os.Remove(cert.ChainPath)
	}

	delete(m.certs, id)

	return m.save()
}

// Tag operations

// ListTags returns all tags
func (m *CertificateManager) ListTags(ctx context.Context) ([]*Tag, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tags := make([]*Tag, 0, len(m.tags))
	for _, t := range m.tags {
		tags = append(tags, t)
	}
	return tags, nil
}

// CreateTag creates a new tag
func (m *CertificateManager) CreateTag(ctx context.Context, tag *Tag) (*Tag, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tag.ID = uuid.New().String()
	tag.CreatedAt = time.Now()

	m.tags[tag.ID] = tag

	if err := m.save(); err != nil {
		return nil, err
	}

	return tag, nil
}

// UpdateTag updates a tag
func (m *CertificateManager) UpdateTag(ctx context.Context, id string, updates *Tag) (*Tag, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tag, ok := m.tags[id]
	if !ok {
		return nil, fmt.Errorf("tag not found: %s", id)
	}

	tag.Name = updates.Name
	tag.Color = updates.Color

	if err := m.save(); err != nil {
		return nil, err
	}

	return tag, nil
}

// DeleteTag deletes a tag
func (m *CertificateManager) DeleteTag(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.tags[id]; !ok {
		return fmt.Errorf("tag not found: %s", id)
	}

	delete(m.tags, id)

	return m.save()
}

// GetCertificatePaths returns the cert and key paths for a certificate ID
func (m *CertificateManager) GetCertificatePaths(ctx context.Context, id string) (certPath, keyPath string, err error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cert, ok := m.certs[id]
	if !ok {
		return "", "", fmt.Errorf("certificate not found: %s", id)
	}

	return cert.CertPath, cert.KeyPath, nil
}
