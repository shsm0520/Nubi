package api

import (
	"context"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

var (
	maintenanceMu sync.RWMutex
)

// MaintenanceConfig represents the maintenance mode settings
type MaintenanceConfig struct {
	Enabled bool   `json:"enabled"`
	Message string `json:"message,omitempty"`
}

func (s *Server) handleGetMaintenance(ctx *gin.Context) {
	maintenanceMu.RLock()
	enabled := s.maintenanceMode
	msg := s.maintenanceMessage
	maintenanceMu.RUnlock()

	ctx.JSON(http.StatusOK, gin.H{
		"enabled": enabled,
		"message": msg,
	})
}

func (s *Server) handleSetMaintenance(ctx *gin.Context) {
	var req MaintenanceConfig
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	maintenanceMu.Lock()
	s.maintenanceMode = req.Enabled
	s.maintenanceMessage = req.Message
	maintenanceMu.Unlock()

	// Apply maintenance mode via default route
	if req.Enabled {
		// Create a maintenance page
		maintenanceHTML := `<!DOCTYPE html>
<html>
<head>
  <title>Maintenance</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 3rem; margin: 0; color: #f59e0b; }
    p { font-size: 1.25rem; color: #94a3b8; margin-top: 1rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔧</div>
    <h1>Under Maintenance</h1>
    <p>` + escapeHTML(req.Message) + `</p>
    <p style="font-size: 0.875rem; margin-top: 2rem;">We'll be back shortly.</p>
  </div>
</body>
</html>`
		if req.Message == "" {
			maintenanceHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Maintenance</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 3rem; margin: 0; color: #f59e0b; }
    p { font-size: 1.25rem; color: #94a3b8; margin-top: 1rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔧</div>
    <h1>Under Maintenance</h1>
    <p>The server is currently undergoing maintenance.</p>
    <p style="font-size: 0.875rem; margin-top: 2rem;">We'll be back shortly.</p>
  </div>
</body>
</html>`
		}

		// Save previous config and apply maintenance
		s.defaultRoute.ApplyMaintenance(context.Background(), maintenanceHTML)
	} else {
		// Restore previous config
		s.defaultRoute.DisableMaintenance(context.Background())
	}

	// Reload nginx
	if err := s.nginx.Reload(context.Background()); err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{
			"message": "maintenance mode set but nginx reload failed",
			"error":   err.Error(),
		})
		return
	}

	// Broadcast to all WebSocket clients
	s.hub.Broadcast(StatusMessage{
		Type: "maintenance_mode",
		Payload: map[string]interface{}{
			"enabled": req.Enabled,
			"message": req.Message,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"message": "maintenance mode updated",
		"enabled": req.Enabled,
	})
}

func escapeHTML(s string) string {
	result := ""
	for _, c := range s {
		switch c {
		case '<':
			result += "&lt;"
		case '>':
			result += "&gt;"
		case '&':
			result += "&amp;"
		case '"':
			result += "&quot;"
		case '\'':
			result += "&#39;"
		default:
			result += string(c)
		}
	}
	return result
}
