package api

import (
	"net/http"
	"time"

	"github.com/shsm0520/nubi/internal/nginx"

	"github.com/gin-gonic/gin"
)

type IssueLetsEncryptRequest struct {
	Domains     []string            `json:"domains" binding:"required"`
	DNSProvider nginx.DNSProvider   `json:"dnsProvider" binding:"required"`
	Email       string              `json:"email" binding:"required,email"`
	AutoRenew   bool                `json:"autoRenew"`
}

type RenewCertificateRequest struct {
	CertificateID string            `json:"certificateId" binding:"required"`
	DNSProvider   nginx.DNSProvider `json:"dnsProvider" binding:"required"`
}

type DNSProviderConfigResponse struct {
	Provider       string   `json:"provider"`
	RequiredFields []string `json:"requiredFields"`
}

// handleIssueLetsEncrypt issues a new Let's Encrypt certificate
func (s *Server) handleIssueLetsEncrypt(c *gin.Context) {
	var req IssueLetsEncryptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create Let's Encrypt manager (staging=false for production)
	leManager := nginx.NewLetsEncryptManager(s.certManager, req.Email, false)

	// Issue certificate
	cert, err := leManager.IssueCertificate(c.Request.Context(), req.Domains, req.DNSProvider)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, cert)
}

// handleRenewLetsEncrypt renews an existing Let's Encrypt certificate
func (s *Server) handleRenewLetsEncrypt(c *gin.Context) {
	var req RenewCertificateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get certificate to check it exists
	cert, err := s.certManager.GetCertificate(c.Request.Context(), req.CertificateID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
		return
	}

	leManager := nginx.NewLetsEncryptManager(s.certManager, "", false)

	if err := leManager.RenewCertificate(c.Request.Context(), req.CertificateID, req.DNSProvider); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "certificate renewed", "certificate": cert})
}

// handleCheckAutoRenew triggers auto-renewal check for all certificates
func (s *Server) handleCheckAutoRenew(c *gin.Context) {
	// For now, just check without renewing (return which certs need renewal)
	certs, err := s.certManager.ListCertificates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	needsRenewal := []map[string]interface{}{}

	for _, cert := range certs {
		if !cert.AutoRenew || cert.Type != "letsencrypt" {
			continue
		}

		expiresAt := cert.ExpiresAt
		daysUntilExpiry := int(expiresAt.Sub(now).Hours() / 24)

		if daysUntilExpiry < 30 {
			needsRenewal = append(needsRenewal, map[string]interface{}{
				"id":              cert.ID,
				"name":            cert.Name,
				"domains":         cert.Domains,
				"expiresAt":       cert.ExpiresAt,
				"daysUntilExpiry": daysUntilExpiry,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"needsRenewal": needsRenewal,
		"total":        len(needsRenewal),
	})
}

// handleGetDNSProviders returns list of supported DNS providers and their required fields
func (s *Server) handleGetDNSProviders(c *gin.Context) {
	providers := []DNSProviderConfigResponse{}

	for provider, fields := range nginx.DNSProviderConfigs {
		providers = append(providers, DNSProviderConfigResponse{
			Provider:       provider,
			RequiredFields: fields,
		})
	}

	c.JSON(http.StatusOK, providers)
}
