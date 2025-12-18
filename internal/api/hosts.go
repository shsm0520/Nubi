package api

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shsm0520/nubi/internal/nginx"
)

// handleListHosts returns all proxy hosts
func (s *Server) handleListHosts(ctx *gin.Context) {
	hosts := s.proxyHosts.List()
	ctx.JSON(http.StatusOK, gin.H{
		"hosts": hosts,
		"count": len(hosts),
	})
}

// handleGetHost returns a single proxy host by ID
func (s *Server) handleGetHost(ctx *gin.Context) {
	id := ctx.Param("id")

	host, err := s.proxyHosts.Get(id)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"host": host})
}

// BackendRequest represents a backend server in the request
type BackendRequest struct {
	Address string `json:"address"`
	Weight  int    `json:"weight"`
	Backup  bool   `json:"backup"`
}

// CreateHostRequest represents the request body for creating a host
type CreateHostRequest struct {
	Domain      string           `json:"domain" binding:"required"`
	Target      string           `json:"target"`
	Backends    []BackendRequest `json:"backends"`
	LBMethod    string           `json:"lbMethod"`
	SSL         bool             `json:"ssl"`
	ForceSSL    bool             `json:"forceSSL"`
	Enabled     bool             `json:"enabled"`
	Maintenance bool             `json:"maintenance"`
	WebSocket   bool             `json:"websocket"`
	CustomNginx string           `json:"customNginx"`
	Tags        []string         `json:"tags"`
}

// handleCreateHost creates a new proxy host
func (s *Server) handleCreateHost(ctx *gin.Context) {
	var req CreateHostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert backends
	var backends []nginx.Backend
	for _, b := range req.Backends {
		backends = append(backends, nginx.Backend{
			Address: b.Address,
			Weight:  b.Weight,
			Backup:  b.Backup,
		})
	}

	// Require either target or backends
	if req.Target == "" && len(backends) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Either target or backends is required"})
		return
	}

	host := &nginx.ProxyHost{
		Domain:      req.Domain,
		Target:      req.Target,
		Backends:    backends,
		LBMethod:    req.LBMethod,
		SSL:         req.SSL,
		ForceSSL:    req.ForceSSL,
		Enabled:     req.Enabled,
		Maintenance: req.Maintenance,
		WebSocket:   req.WebSocket,
		CustomNginx: req.CustomNginx,
		Tags:        req.Tags,
	}

	if err := s.proxyHosts.Create(context.Background(), host); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if host.Enabled {
		if err := s.nginx.Reload(context.Background()); err != nil {
			ctx.JSON(http.StatusOK, gin.H{
				"host":    host,
				"warning": "Host created but nginx reload failed: " + err.Error(),
			})
			return
		}
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"host":    host,
		"message": "Proxy host created successfully",
	})
}

// handleUpdateHost updates an existing proxy host
func (s *Server) handleUpdateHost(ctx *gin.Context) {
	id := ctx.Param("id")

	var req CreateHostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert backends
	var backends []nginx.Backend
	for _, b := range req.Backends {
		backends = append(backends, nginx.Backend{
			Address: b.Address,
			Weight:  b.Weight,
			Backup:  b.Backup,
		})
	}

	updates := &nginx.ProxyHost{
		Domain:      req.Domain,
		Target:      req.Target,
		Backends:    backends,
		LBMethod:    req.LBMethod,
		SSL:         req.SSL,
		ForceSSL:    req.ForceSSL,
		Enabled:     req.Enabled,
		Maintenance: req.Maintenance,
		WebSocket:   req.WebSocket,
		CustomNginx: req.CustomNginx,
		Tags:        req.Tags,
	}

	if err := s.proxyHosts.Update(context.Background(), id, updates); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(context.Background()); err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"message": "Host updated but nginx reload failed: " + err.Error(),
		})
		return
	}

	host, _ := s.proxyHosts.Get(id)
	ctx.JSON(http.StatusOK, gin.H{
		"host":    host,
		"message": "Proxy host updated successfully",
	})
}

// handleDeleteHost deletes a proxy host
func (s *Server) handleDeleteHost(ctx *gin.Context) {
	id := ctx.Param("id")

	if err := s.proxyHosts.Delete(context.Background(), id); err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(context.Background()); err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"message": "Host deleted but nginx reload failed: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Proxy host deleted successfully",
	})
}

// ToggleHostRequest represents the request body for toggling a host
type ToggleHostRequest struct {
	Enabled bool `json:"enabled"`
}

// handleToggleHost enables or disables a proxy host
func (s *Server) handleToggleHost(ctx *gin.Context) {
	id := ctx.Param("id")

	var req ToggleHostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.proxyHosts.Toggle(context.Background(), id, req.Enabled); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(context.Background()); err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"message": "Host toggled but nginx reload failed: " + err.Error(),
		})
		return
	}

	host, _ := s.proxyHosts.Get(id)
	ctx.JSON(http.StatusOK, gin.H{
		"host":    host,
		"message": "Proxy host " + map[bool]string{true: "enabled", false: "disabled"}[req.Enabled],
	})
}

// MaintenanceHostRequest represents the request body for toggling maintenance mode
type MaintenanceHostRequest struct {
	Maintenance bool `json:"maintenance"`
}

// handleToggleMaintenance enables or disables maintenance mode for a host
func (s *Server) handleToggleMaintenance(ctx *gin.Context) {
	id := ctx.Param("id")

	var req MaintenanceHostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.proxyHosts.SetMaintenance(context.Background(), id, req.Maintenance); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(context.Background()); err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"message": "Maintenance toggled but nginx reload failed: " + err.Error(),
		})
		return
	}

	host, _ := s.proxyHosts.Get(id)
	ctx.JSON(http.StatusOK, gin.H{
		"host":    host,
		"message": "Maintenance mode " + map[bool]string{true: "enabled", false: "disabled"}[req.Maintenance],
	})
}

// handleExportHosts exports all hosts as JSON
func (s *Server) handleExportHosts(ctx *gin.Context) {
	hosts := s.proxyHosts.List()

	// Set headers for file download
	ctx.Header("Content-Disposition", "attachment; filename=nubi-hosts-export.json")
	ctx.Header("Content-Type", "application/json")

	ctx.JSON(http.StatusOK, gin.H{
		"version":   "1.0",
		"exportedAt": ctx.GetHeader("Date"),
		"hosts":     hosts,
	})
}

// ImportHostsRequest represents the request body for importing hosts
type ImportHostsRequest struct {
	Hosts      []nginx.ProxyHost `json:"hosts"`
	Overwrite  bool              `json:"overwrite"`
}

// handleImportHosts imports hosts from JSON
func (s *Server) handleImportHosts(ctx *gin.Context) {
	var req ImportHostsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Hosts) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "No hosts to import"})
		return
	}

	imported := 0
	skipped := 0
	errors := []string{}

	for _, host := range req.Hosts {
		// Check if host with same domain exists
		existingHosts := s.proxyHosts.List()
		exists := false
		for _, existing := range existingHosts {
			if existing.Domain == host.Domain {
				exists = true
				if req.Overwrite {
					// Update existing host
					updates := &nginx.ProxyHost{
						Domain:      host.Domain,
						Target:      host.Target,
						Backends:    host.Backends,
						LBMethod:    host.LBMethod,
						SSL:         host.SSL,
						ForceSSL:    host.ForceSSL,
						Enabled:     host.Enabled,
						Maintenance: host.Maintenance,
						WebSocket:   host.WebSocket,
						CustomNginx: host.CustomNginx,
					}
					if err := s.proxyHosts.Update(context.Background(), existing.ID, updates); err != nil {
						errors = append(errors, "Failed to update "+host.Domain+": "+err.Error())
					} else {
						imported++
					}
				} else {
					skipped++
				}
				break
			}
		}

		if !exists {
			// Create new host
			newHost := &nginx.ProxyHost{
				Domain:      host.Domain,
				Target:      host.Target,
				Backends:    host.Backends,
				LBMethod:    host.LBMethod,
				SSL:         host.SSL,
				ForceSSL:    host.ForceSSL,
				Enabled:     host.Enabled,
				Maintenance: host.Maintenance,
				WebSocket:   host.WebSocket,
				CustomNginx: host.CustomNginx,
			}
			if err := s.proxyHosts.Create(context.Background(), newHost); err != nil {
				errors = append(errors, "Failed to create "+host.Domain+": "+err.Error())
			} else {
				imported++
			}
		}
	}

	// Reload nginx
	if imported > 0 {
		if err := s.nginx.Reload(context.Background()); err != nil {
			ctx.JSON(http.StatusOK, gin.H{
				"imported": imported,
				"skipped":  skipped,
				"errors":   errors,
				"warning":  "Hosts imported but nginx reload failed: " + err.Error(),
			})
			return
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"imported": imported,
		"skipped":  skipped,
		"errors":   errors,
		"message":  "Import completed",
	})
}
