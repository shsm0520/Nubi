package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/shsm0520/nubi/internal/nginx"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// StatusMessage represents a status update sent via WebSocket
type StatusMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// NginxStatusPayload contains nginx status information
type NginxStatusPayload struct {
	Running     bool   `json:"running"`
	ConfigValid bool   `json:"configValid"`
	Version     string `json:"version,omitempty"`
}

// MetricsPayload contains nginx and system metrics
type MetricsPayload struct {
	ActiveConnections int64  `json:"activeConnections"`
	Uptime            int64  `json:"uptime"`
	UptimeString      string `json:"uptimeString"`
	Reading           int64  `json:"reading"`
	Writing           int64  `json:"writing"`
	Waiting           int64  `json:"waiting"`
	RxBytes           int64  `json:"rxBytes"`
	TxBytes           int64  `json:"txBytes"`
}

// Hub maintains active WebSocket connections
type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan StatusMessage
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan StatusMessage),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.register:
			h.mu.Lock()
			h.clients[conn] = true
			h.mu.Unlock()
			log.Printf("WebSocket client connected. Total: %d", len(h.clients))

		case conn := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[conn]; ok {
				delete(h.clients, conn)
				conn.Close()
			}
			h.mu.Unlock()
			log.Printf("WebSocket client disconnected. Total: %d", len(h.clients))

		case msg := <-h.broadcast:
			h.mu.RLock()
			for conn := range h.clients {
				if err := conn.WriteJSON(msg); err != nil {
					log.Printf("WebSocket write error: %v", err)
					conn.Close()
					delete(h.clients, conn)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(msg StatusMessage) {
	h.broadcast <- msg
}

// HandleWebSocket handles WebSocket connection upgrades
func (s *Server) HandleWebSocket(ctx *gin.Context) {
	conn, err := upgrader.Upgrade(ctx.Writer, ctx.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.hub.register <- conn

	// Send initial status
	go s.sendInitialStatus(conn)

	// Handle incoming messages
	go s.handleWSMessages(conn)
}

func (s *Server) sendInitialStatus(conn *websocket.Conn) {
	status, _ := s.nginx.Status(context.Background())
	configTest, _ := s.nginx.CheckConfig(context.Background())

	payload := NginxStatusPayload{
		Running:     status.ConfigTest != "" && (containsAny(status.ConfigTest, "syntax is ok", "successful")),
		ConfigValid: containsAny(configTest, "successful"),
		Version:     status.Version,
	}

	conn.WriteJSON(StatusMessage{
		Type:    "nginx_status",
		Payload: payload,
	})

	// Send maintenance mode status
	conn.WriteJSON(StatusMessage{
		Type:    "maintenance_mode",
		Payload: map[string]bool{"enabled": s.maintenanceMode},
	})

	// Send metrics
	s.sendMetrics(conn)
}

func (s *Server) sendMetrics(conn *websocket.Conn) {
	metrics, _ := nginx.GetMetrics("")
	if metrics == nil {
		metrics = &nginx.Metrics{}
	}

	netMetrics, _ := nginx.GetNetworkMetrics("")
	if netMetrics == nil {
		netMetrics = &nginx.SystemMetrics{}
	}

	// Calculate Nubi service uptime
	uptime := int64(time.Since(s.startTime).Seconds())
	uptimeStr := formatUptime(uptime)

	payload := MetricsPayload{
		ActiveConnections: metrics.ActiveConnections,
		Uptime:            uptime,
		UptimeString:      uptimeStr,
		Reading:           metrics.Reading,
		Writing:           metrics.Writing,
		Waiting:           metrics.Waiting,
		RxBytes:           netMetrics.RxBytes,
		TxBytes:           netMetrics.TxBytes,
	}

	conn.WriteJSON(StatusMessage{
		Type:    "metrics",
		Payload: payload,
	})
}

func (s *Server) handleWSMessages(conn *websocket.Conn) {
	defer func() {
		s.hub.unregister <- conn
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg struct {
			Action string          `json:"action"`
			Data   json.RawMessage `json:"data,omitempty"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Action {
		case "reload":
			s.nginx.Reload(context.Background())
			s.broadcastNginxStatus()
		case "test":
			s.broadcastNginxStatus()
		case "get_status":
			s.sendInitialStatus(conn)
		}
	}
}

func (s *Server) broadcastNginxStatus() {
	status, _ := s.nginx.Status(context.Background())
	configTest, _ := s.nginx.CheckConfig(context.Background())

	payload := NginxStatusPayload{
		Running:     status.ConfigTest != "" && containsAny(status.ConfigTest, "syntax is ok", "successful"),
		ConfigValid: containsAny(configTest, "successful"),
		Version:     status.Version,
	}

	s.hub.Broadcast(StatusMessage{
		Type:    "nginx_status",
		Payload: payload,
	})
}

// StartStatusBroadcaster periodically broadcasts nginx status and metrics to all clients
func (s *Server) StartStatusBroadcaster(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			s.broadcastNginxStatus()
			s.broadcastMetrics()
		}
	}()
}

func (s *Server) broadcastMetrics() {
	metrics, _ := nginx.GetMetrics("")
	if metrics == nil {
		metrics = &nginx.Metrics{}
	}

	netMetrics, _ := nginx.GetNetworkMetrics("")
	if netMetrics == nil {
		netMetrics = &nginx.SystemMetrics{}
	}

	// Calculate Nubi service uptime
	uptime := int64(time.Since(s.startTime).Seconds())
	uptimeStr := formatUptime(uptime)

	payload := MetricsPayload{
		ActiveConnections: metrics.ActiveConnections,
		Uptime:            uptime,
		UptimeString:      uptimeStr,
		Reading:           metrics.Reading,
		Writing:           metrics.Writing,
		Waiting:           metrics.Waiting,
		RxBytes:           netMetrics.RxBytes,
		TxBytes:           netMetrics.TxBytes,
	}

	s.hub.Broadcast(StatusMessage{
		Type:    "metrics",
		Payload: payload,
	})
}

func containsAny(s string, substrs ...string) bool {
	for _, substr := range substrs {
		if len(s) > 0 && len(substr) > 0 {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
		}
	}
	return false
}

// formatUptime formats seconds into human readable string
func formatUptime(seconds int64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, minutes, secs)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, secs)
	}
	return fmt.Sprintf("%ds", secs)
}
