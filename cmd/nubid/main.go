package main

import (
	"flag"
	"log"

	"github.com/shsm0520/nubi/internal/api"
	"github.com/shsm0520/nubi/internal/nginx"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	staticDir := flag.String("static", "web/dist", "path to static assets to serve")
	nginxBin := flag.String("nginx-bin", "", "path to the nginx binary (defaults to looking up on PATH)")

	flag.Parse()

	controller := nginx.NewController(*nginxBin)
	srv := api.NewServer(controller, *staticDir)

	if err := srv.Router().Run(*addr); err != nil {
		log.Fatalf("failed to start http server: %v", err)
	}
}
