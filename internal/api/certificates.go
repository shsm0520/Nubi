package api

import (
	"crypto/x509"
	"encoding/pem"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shsm0520/nubi/internal/nginx"
)

// handleListCertificates returns all certificates
func (s *Server) handleListCertificates(ctx *gin.Context) {
	certs, err := s.certManager.ListCertificates(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"certificates": certs})
}

// handleGetCertificate returns a specific certificate
func (s *Server) handleGetCertificate(ctx *gin.Context) {
	id := ctx.Param("id")

	cert, err := s.certManager.GetCertificate(ctx.Request.Context(), id)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"certificate": cert})
}

// handleUploadCertificate uploads a new certificate
func (s *Server) handleUploadCertificate(ctx *gin.Context) {
	// Get form data
	name := ctx.PostForm("name")
	if name == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	// Get certificate file
	certFile, err := ctx.FormFile("certificate")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "certificate file is required"})
		return
	}

	// Get key file
	keyFile, err := ctx.FormFile("key")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "key file is required"})
		return
	}

	// Read certificate content
	certReader, err := certFile.Open()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read certificate"})
		return
	}
	defer certReader.Close()
	certContent, _ := io.ReadAll(certReader)

	// Read key content
	keyReader, err := keyFile.Open()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read key"})
		return
	}
	defer keyReader.Close()
	keyContent, _ := io.ReadAll(keyReader)

	// Parse certificate to extract domains and expiry
	block, _ := pem.Decode(certContent)
	var expiresAt time.Time
	var domains []string

	if block != nil {
		cert, err := x509.ParseCertificate(block.Bytes)
		if err == nil {
			expiresAt = cert.NotAfter
			domains = cert.DNSNames
			if cert.Subject.CommonName != "" && !contains(domains, cert.Subject.CommonName) {
				domains = append([]string{cert.Subject.CommonName}, domains...)
			}
		}
	}

	newCert := &nginx.Certificate{
		Name:      name,
		Domains:   domains,
		Type:      "uploaded",
		ExpiresAt: expiresAt,
		AutoRenew: false,
	}

	created, err := s.certManager.CreateCertificate(ctx.Request.Context(), newCert, certContent, keyContent)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message":     "Certificate uploaded successfully",
		"certificate": created,
	})
}

// handleUpdateCertificate updates certificate metadata
func (s *Server) handleUpdateCertificate(ctx *gin.Context) {
	id := ctx.Param("id")

	var updates nginx.Certificate
	if err := ctx.ShouldBindJSON(&updates); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, err := s.certManager.UpdateCertificate(ctx.Request.Context(), id, &updates)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":     "Certificate updated",
		"certificate": updated,
	})
}

// handleDeleteCertificate deletes a certificate
func (s *Server) handleDeleteCertificate(ctx *gin.Context) {
	id := ctx.Param("id")

	if err := s.certManager.DeleteCertificate(ctx.Request.Context(), id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Certificate deleted"})
}

// Tag handlers

// handleListTags returns all tags
func (s *Server) handleListTags(ctx *gin.Context) {
	tags, err := s.certManager.ListTags(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"tags": tags})
}

// handleCreateTag creates a new tag
func (s *Server) handleCreateTag(ctx *gin.Context) {
	var tag nginx.Tag
	if err := ctx.ShouldBindJSON(&tag); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := s.certManager.CreateTag(ctx.Request.Context(), &tag)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "Tag created",
		"tag":     created,
	})
}

// handleUpdateTag updates a tag
func (s *Server) handleUpdateTag(ctx *gin.Context) {
	id := ctx.Param("id")

	var updates nginx.Tag
	if err := ctx.ShouldBindJSON(&updates); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, err := s.certManager.UpdateTag(ctx.Request.Context(), id, &updates)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Tag updated",
		"tag":     updated,
	})
}

// handleDeleteTag deletes a tag
func (s *Server) handleDeleteTag(ctx *gin.Context) {
	id := ctx.Param("id")

	if err := s.certManager.DeleteTag(ctx.Request.Context(), id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Tag deleted"})
}

// handleBulkApplyCertificate applies a certificate to multiple hosts
func (s *Server) handleBulkApplyCertificate(ctx *gin.Context) {
	var req struct {
		CertificateID string   `json:"certificateId"`
		HostIDs       []string `json:"hostIds"`
		TagID         string   `json:"tagId"` // Apply to all hosts with this tag
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get certificate paths
	certPath, keyPath, err := s.certManager.GetCertificatePaths(ctx.Request.Context(), req.CertificateID)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Get host IDs to update
	hostIDs := req.HostIDs

	// If tag ID is provided, get all hosts with that tag
	if req.TagID != "" {
		hosts := s.proxyHosts.List()

		for _, host := range hosts {
			for _, tag := range host.Tags {
				if tag == req.TagID {
					hostIDs = append(hostIDs, host.ID)
					break
				}
			}
		}
	}

	// Apply certificate to each host
	updated := 0
	for _, hostID := range hostIDs {
		err := s.proxyHosts.ApplyCertificate(ctx.Request.Context(), hostID, req.CertificateID, certPath, keyPath)
		if err == nil {
			updated++
		}
	}

	// Reload nginx
	if updated > 0 {
		s.nginx.Reload(ctx.Request.Context())
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":      "Certificate applied",
		"updatedHosts": updated,
	})
}

// handleBulkTagHosts applies a tag to multiple hosts
func (s *Server) handleBulkTagHosts(ctx *gin.Context) {
	var req struct {
		TagID   string   `json:"tagId"`
		HostIDs []string `json:"hostIds"`
		Action  string   `json:"action"` // "add" or "remove"
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Action == "" {
		req.Action = "add"
	}

	updated := 0
	for _, hostID := range req.HostIDs {
		var err error
		if req.Action == "add" {
			err = s.proxyHosts.AddTag(ctx.Request.Context(), hostID, req.TagID)
		} else {
			err = s.proxyHosts.RemoveTag(ctx.Request.Context(), hostID, req.TagID)
		}
		if err == nil {
			updated++
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":      "Tags updated",
		"updatedHosts": updated,
	})
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
