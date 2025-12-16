package main

import (
	"context"
	"flag"
	"log"
	"time"

	"github.com/shsm0520/nubi/internal/api"
	"github.com/shsm0520/nubi/internal/nginx"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	staticDir := flag.String("static", "web/dist", "path to static assets to serve")
	nginxBin := flag.String("nginx-bin", "", "path to the nginx binary (defaults to looking up on PATH)")

	flag.Parse()

	controller := nginx.NewController(*nginxBin)

	// Ensure stub_status is configured for metrics
	if err := nginx.EnsureStubStatus(); err != nil {
		log.Printf("warning: failed to setup stub_status: %v", err)
	} else {
		log.Println("Nginx stub_status endpoint configured")
	}

	// Initialize default route on startup
	defaultRoute, err := nginx.NewDefaultRouteManager("")
	if err != nil {
		log.Printf("warning: failed to create default route manager: %v", err)
	} else {
		// Check if default route exists, if not create one
		config, _ := defaultRoute.GetConfig()
		if !config.Enabled {
			log.Println("No default route configured, creating Nubi default...")
			defaultConfig := &nginx.DefaultRouteConfig{
				Enabled: true,
				Mode:    nginx.ModeNginxDefault,
			}
			if err := defaultRoute.Apply(context.Background(), defaultConfig); err != nil {
				log.Printf("warning: failed to create default route: %v", err)
			} else {
				// Reload nginx to apply
				if err := controller.Reload(context.Background()); err != nil {
					log.Printf("warning: nginx reload failed: %v", err)
				} else {
					log.Println("Nubi default route created and nginx reloaded")
				}
			}
		}
	}

	srv := api.NewServer(controller, *staticDir)

	// Start WebSocket status broadcaster (every 5 seconds)
	srv.StartStatusBroadcaster(5 * time.Second)

	log.Printf("Starting Nubi server on %s", *addr)
	if err := srv.Router().Run(*addr); err != nil {
		log.Fatalf("failed to start http server: %v", err)
	}
}
