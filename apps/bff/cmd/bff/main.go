package main

import (
	"context"
	"errors"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/adapter/appsscript"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/adapter/cache"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/adapter/firebase"
	httpadapter "github.com/firstTimeFreeNow/UDM/apps/bff/internal/adapter/http"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/application"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/config"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	cfg := config.Config{Project: os.Getenv("UDM_FIREBASE_PROJECT_ID"), SharedSecret: os.Getenv("UDM_BFF_SHARED_SECRET"), UpstreamURL: os.Getenv("AF_EXEC_URL")}
	for _, origin := range strings.Split(os.Getenv("UDM_ALLOWED_ORIGINS"), ",") {
		if v := strings.TrimSpace(origin); v != "" {
			cfg.Origins = append(cfg.Origins, v)
		}
	}
	if e := cfg.Validate(); e != nil {
		log.Fatal("BFF configuration is incomplete or invalid")
	}
	client := &http.Client{Timeout: 26 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) >= 10 || r.URL.Scheme != "https" || (r.URL.Host != "script.google.com" && r.URL.Host != "script.googleusercontent.com") {
			return errors.New("unexpected redirect")
		}
		return nil
	}}
	service := application.New(appsscript.New(cfg, client), cache.New(), time.Now)
	handler := httpadapter.New(cfg.Origins, service, firebase.New(cfg.Project, client, time.Now).Verify)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: net.JoinHostPort("", port), Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	log.Print("BFF listening")
	if e := server.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		log.Fatal("BFF server stopped unexpectedly")
	}
}
