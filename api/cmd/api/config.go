package main

import (
	"fmt"
	"log/slog"
	"strconv"
	"strings"
)

type config struct {
	Port        string
	LogLevel    slog.Level
	CORSOrigins []string
}

// loadConfig reads configuration through getenv, applying defaults.
func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{Port: "8080", LogLevel: slog.LevelInfo}

	if p := getenv("PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return config{}, fmt.Errorf("PORT must be 1-65535, got %q", p)
		}
		cfg.Port = p
	}
	if l := getenv("LOG_LEVEL"); l != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(l)); err != nil {
			return config{}, fmt.Errorf("LOG_LEVEL must be debug|info|warn|error, got %q", l)
		}
	}
	for _, origin := range strings.Split(getenv("CORS_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, origin)
		}
	}
	return cfg, nil
}
