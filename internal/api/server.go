package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shsm0520/nubi/internal/nginx"
)

// Server wires the HTTP routes together.
type Server struct {
	router *gin.Engine
	nginx  *nginx.Controller
}

// NewServer constructs the HTTP server and registers routes.
func NewServer(ctrl *nginx.Controller, staticDir string) *Server {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	srv := &Server{
		router: router,
		nginx:  ctrl,
	}

	api := router.Group("/api/nginx")
	{
		api.GET("/status", srv.handleStatus)
		api.POST("/reload", srv.handleReload)
		api.POST("/test", srv.handleConfigTest)
	}

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
