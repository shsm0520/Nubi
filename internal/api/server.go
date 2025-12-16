package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shsm0520/nubi/internal/nginx"
)

// Server wires the HTTP routes together.
type Server struct {
	router             *gin.Engine
	nginx              *nginx.Controller
	defaultRoute       *nginx.DefaultRouteManager
	hub                *Hub
	maintenanceMode    bool
	maintenanceMessage string
	startTime          time.Time // Nubi service start time
}

// NewServer constructs the HTTP server and registers routes.
func NewServer(ctrl *nginx.Controller, staticDir string) *Server {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	defaultRoute, _ := nginx.NewDefaultRouteManager("")
	hub := NewHub()
	go hub.Run()

	srv := &Server{
		router:       router,
		nginx:        ctrl,
		defaultRoute: defaultRoute,
		hub:          hub,
		startTime:    time.Now(),
	}

	// WebSocket endpoint
	router.GET("/ws", srv.HandleWebSocket)

	api := router.Group("/api/nginx")
	{
		api.GET("/status", srv.handleStatus)
		api.POST("/status", srv.handleStatus)
		api.POST("/reload", srv.handleReload)
		api.POST("/test", srv.handleConfigTest)
		api.GET("/metrics", srv.handleMetrics)
	}

	// Default route API
	routeAPI := router.Group("/api/route")
	{
		routeAPI.GET("/default", srv.handleGetDefaultRoute)
		routeAPI.POST("/default", srv.handleSetDefaultRoute)
		routeAPI.DELETE("/default", srv.handleDeleteDefaultRoute)
	}

	// Maintenance API
	router.GET("/api/maintenance", srv.handleGetMaintenance)
	router.POST("/api/maintenance", srv.handleSetMaintenance)

	if staticDir != "" {
		indexPath := filepath.Join(staticDir, "index.html")
		router.StaticFile("/favicon.ico", filepath.Join(staticDir, "favicon.ico"))
		router.StaticFS("/assets", gin.Dir(filepath.Join(staticDir, "assets"), true))

		handleIndex := func(ctx *gin.Context) {
			if _, err := os.Stat(indexPath); err != nil {
				ctx.JSON(http.StatusNotFound, gin.H{"error": "index file not found"})
				return
			}
			ctx.File(indexPath)
		}

		router.GET("/", handleIndex)
		router.NoRoute(func(ctx *gin.Context) {
			if strings.HasPrefix(ctx.Request.URL.Path, "/api/") {
				ctx.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
				return
			}
			handleIndex(ctx)
		})
	} else {
		router.GET("/", func(ctx *gin.Context) {
			ctx.JSON(http.StatusOK, gin.H{"message": "Nubi backend running"})
		})
	}

	return srv
}

// Router exposes the configured gin engine for the daemon entry point.
func (s *Server) Router() *gin.Engine {
	return s.router
}

func (s *Server) handleStatus(ctx *gin.Context) {
	status, err := s.nginx.Status(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{
			"status": status,
			"error":  err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"status": status})
}

func (s *Server) handleReload(ctx *gin.Context) {
	if err := s.nginx.Reload(ctx.Request.Context()); err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "nginx reload triggered"})
}

func (s *Server) handleConfigTest(ctx *gin.Context) {
	output, err := s.nginx.CheckConfig(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{
			"output": output,
			"error":  err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"output": output})
}

func (s *Server) handleMetrics(ctx *gin.Context) {
	// Get nginx metrics from stub_status
	stubURL := ctx.Query("stub_url")
	if stubURL == "" {
		stubURL = "http://127.0.0.1:8081/nginx_status"
	}

	metrics, err := nginx.GetMetrics(stubURL)
	if err != nil {
		// Return empty metrics if stub_status is not available
		metrics = &nginx.Metrics{}
	}

	// Get network metrics
	iface := ctx.Query("iface")
	if iface == "" {
		iface = "eth0"
	}

	netMetrics, _ := nginx.GetNetworkMetrics(iface)
	if netMetrics == nil {
		netMetrics = &nginx.SystemMetrics{}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"nginx":   metrics,
		"network": netMetrics,
	})
}

// Default Route handlers

func (s *Server) handleGetDefaultRoute(ctx *gin.Context) {
	config, err := s.defaultRoute.GetConfig()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"config": config})
}

func (s *Server) handleSetDefaultRoute(ctx *gin.Context) {
	var req nginx.DefaultRouteConfig
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Enabled = true
	if err := s.defaultRoute.Apply(ctx.Request.Context(), &req); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(ctx.Request.Context()); err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{
			"message": "config saved but nginx reload failed",
			"error":   err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "default route configured and nginx reloaded"})
}

func (s *Server) handleDeleteDefaultRoute(ctx *gin.Context) {
	if err := s.defaultRoute.Disable(ctx.Request.Context()); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Reload nginx to apply changes
	if err := s.nginx.Reload(ctx.Request.Context()); err != nil {
		ctx.JSON(http.StatusBadGateway, gin.H{
			"message": "config removed but nginx reload failed",
			"error":   err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "default route removed and nginx reloaded"})
}
