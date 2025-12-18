package nginx

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/go-acme/lego/v4/certcrypto"
	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/challenge"
	"github.com/go-acme/lego/v4/challenge/dns01"
	"github.com/go-acme/lego/v4/lego"
	"github.com/go-acme/lego/v4/registration"

	// DNS provider imports - uncomment and add as needed
	"github.com/go-acme/lego/v4/providers/dns/cloudflare"
	// "github.com/go-acme/lego/v4/providers/dns/route53"
	// "github.com/go-acme/lego/v4/providers/dns/digitalocean"
	// "github.com/go-acme/lego/v4/providers/dns/gcloud"
	// "github.com/go-acme/lego/v4/providers/dns/azure"
)

// DNSProvider represents a DNS provider configuration
type DNSProvider struct {
	Provider string            `json:"provider"` // cloudflare, route53, etc.
	Config   map[string]string `json:"config"`   // API keys, tokens, etc.
}

// LetsEncryptUser implements registration.User interface
type LetsEncryptUser struct {
	Email        string
	Registration *registration.Resource
	key          crypto.PrivateKey
}

func (u *LetsEncryptUser) GetEmail() string {
	return u.Email
}

func (u *LetsEncryptUser) GetRegistration() *registration.Resource {
	return u.Registration
}

func (u *LetsEncryptUser) GetPrivateKey() crypto.PrivateKey {
	return u.key
}

// LetsEncryptManager handles Let's Encrypt certificate operations
type LetsEncryptManager struct {
	certManager *CertificateManager
	email       string
	dataDir     string
	staging     bool // Use staging environment for testing
}

// NewLetsEncryptManager creates a new Let's Encrypt manager
func NewLetsEncryptManager(certManager *CertificateManager, email string, staging bool) *LetsEncryptManager {
	return &LetsEncryptManager{
		certManager: certManager,
		email:       email,
		dataDir:     filepath.Join(certManager.certsDir, "letsencrypt"),
		staging:     staging,
	}
}

// IssueCertificate issues a new Let's Encrypt certificate using DNS challenge
func (m *LetsEncryptManager) IssueCertificate(ctx context.Context, domains []string, dnsProvider DNSProvider) (*Certificate, error) {
	// Create data directory
	if err := os.MkdirAll(m.dataDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Create or load user private key
	privateKey, err := m.getOrCreateUserKey()
	if err != nil {
		return nil, fmt.Errorf("failed to get user key: %w", err)
	}

	// Create user
	user := &LetsEncryptUser{
		Email: m.email,
		key:   privateKey,
	}

	// Configure ACME client
	config := lego.NewConfig(user)
	if m.staging {
		config.CADirURL = lego.LEDirectoryStaging
	} else {
		config.CADirURL = lego.LEDirectoryProduction
	}
	config.Certificate.KeyType = certcrypto.RSA2048

	// Create ACME client
	client, err := lego.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create ACME client: %w", err)
	}

	// Setup DNS provider
	provider, err := m.setupDNSProvider(dnsProvider)
	if err != nil {
		return nil, fmt.Errorf("failed to setup DNS provider: %w", err)
	}

	err = client.Challenge.SetDNS01Provider(provider,
		dns01.AddDNSTimeout(120*time.Second),
		dns01.AddRecursiveNameservers([]string{"8.8.8.8:53", "1.1.1.1:53"}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to set DNS provider: %w", err)
	}

	// Register user if needed
	if user.Registration == nil {
		reg, err := client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
		if err != nil {
			return nil, fmt.Errorf("failed to register: %w", err)
		}
		user.Registration = reg
	}

	// Request certificate
	request := certificate.ObtainRequest{
		Domains: domains,
		Bundle:  true,
	}

	certificates, err := client.Certificate.Obtain(request)
	if err != nil {
		return nil, fmt.Errorf("failed to obtain certificate: %w", err)
	}

	// Parse expiration date
	expiresAt := time.Now().Add(90 * 24 * time.Hour) // Let's Encrypt certs are valid for 90 days

	// Create certificate entry
	cert := &Certificate{
		Name:      domains[0],
		Domains:   domains,
		Type:      "letsencrypt",
		ExpiresAt: expiresAt,
		AutoRenew: true,
	}

	// Save certificate to manager
	created, err := m.certManager.CreateCertificate(ctx, cert, certificates.Certificate, certificates.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to save certificate: %w", err)
	}

	return created, nil
}

// RenewCertificate renews an existing Let's Encrypt certificate
func (m *LetsEncryptManager) RenewCertificate(ctx context.Context, certID string, dnsProvider DNSProvider) error {
	// Get certificate
	cert, err := m.certManager.GetCertificate(ctx, certID)
	if err != nil {
		return fmt.Errorf("certificate not found: %w", err)
	}

	if cert.Type != "letsencrypt" {
		return fmt.Errorf("certificate is not a Let's Encrypt certificate")
	}

	// Issue new certificate
	newCert, err := m.IssueCertificate(ctx, cert.Domains, dnsProvider)
	if err != nil {
		return fmt.Errorf("failed to renew certificate: %w", err)
	}

	// Update existing certificate with new paths
	cert.CertPath = newCert.CertPath
	cert.KeyPath = newCert.KeyPath
	cert.ExpiresAt = newCert.ExpiresAt
	cert.UpdatedAt = time.Now()

	m.certManager.mu.Lock()
	m.certManager.certs[certID] = cert
	m.certManager.mu.Unlock()

	return m.certManager.save()
}

// AutoRenewCheck checks all certificates and renews if needed (within 30 days of expiry)
func (m *LetsEncryptManager) AutoRenewCheck(ctx context.Context, dnsProviders map[string]DNSProvider) error {
	certs, err := m.certManager.ListCertificates(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, cert := range certs {
		if !cert.AutoRenew || cert.Type != "letsencrypt" {
			continue
		}

		// Check if certificate expires in less than 30 days
		expiresAt := cert.ExpiresAt

		if expiresAt.IsZero() || now.Add(30*24*time.Hour).After(expiresAt) {
			// Find DNS provider (you might want to store this with the certificate)
			// For now, try the first available provider
			for _, provider := range dnsProviders {
				if err := m.RenewCertificate(ctx, cert.ID, provider); err != nil {
					return fmt.Errorf("failed to renew %s: %w", cert.Name, err)
				}
				break
			}
		}
	}

	return nil
}

func (m *LetsEncryptManager) getOrCreateUserKey() (crypto.PrivateKey, error) {
	keyPath := filepath.Join(m.dataDir, "user.key")

	// Try to load existing key
	if data, err := os.ReadFile(keyPath); err == nil {
		key, err := certcrypto.ParsePEMPrivateKey(data)
		if err == nil {
			return key, nil
		}
	}

	// Create new key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}

	// Save key
	keyBytes := certcrypto.PEMEncode(privateKey)
	if err := os.WriteFile(keyPath, keyBytes, 0600); err != nil {
		return nil, err
	}

	return privateKey, nil
}

func (m *LetsEncryptManager) setupDNSProvider(config DNSProvider) (challenge.Provider, error) {
	// Set environment variables for DNS provider
	for key, value := range config.Config {
		os.Setenv(key, value)
	}

	// Create DNS provider based on type
	var provider challenge.Provider
	var err error
	
	switch config.Provider {
	case "cloudflare":
		provider, err = cloudflare.NewDNSProvider()
	// Uncomment and add other providers as needed:
	// case "route53":
	// 	provider, err = route53.NewDNSProvider()
	// case "digitalocean":
	// 	provider, err = digitalocean.NewDNSProvider()
	// case "googlecloud", "gcp":
	// 	provider, err = gcloud.NewDNSProvider()
	// case "azure":
	// 	provider, err = azure.NewDNSProvider()
	default:
		return nil, fmt.Errorf("unsupported DNS provider: %s (only cloudflare is currently implemented)", config.Provider)
	}
	
	if err != nil {
		return nil, fmt.Errorf("failed to create %s provider: %w", config.Provider, err)
	}
	
	return provider, nil
}

// DNS Provider configurations for reference
var DNSProviderConfigs = map[string][]string{
	"cloudflare": {
		"CF_DNS_API_TOKEN",
		// Alternative: CF_API_EMAIL + CF_API_KEY
	},
	// Uncomment when providers are implemented:
	// "route53": {
	// 	"AWS_ACCESS_KEY_ID",
	// 	"AWS_SECRET_ACCESS_KEY",
	// 	"AWS_REGION",
	// },
	// "digitalocean": {
	// 	"DO_AUTH_TOKEN",
	// },
	// "googlecloud": {
	// 	"GCE_PROJECT",
	// 	"GCE_SERVICE_ACCOUNT_FILE",
	// },
	// "azure": {
	// 	"AZURE_CLIENT_ID",
	// 	"AZURE_CLIENT_SECRET",
	// 	"AZURE_SUBSCRIPTION_ID",
	// 	"AZURE_TENANT_ID",
	// 	"AZURE_RESOURCE_GROUP",
	// },
}
