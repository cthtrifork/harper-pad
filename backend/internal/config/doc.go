// Package config reads the environment of both commands (LISTEN_ADDR, DATABASE_URL or the libpq PG* variables, and for
// harper-pad-sync PUBLIC_URL). PUBLIC_URL must be https: or the service refuses to start.
package config
