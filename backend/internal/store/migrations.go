package store

import "embed"

// Migrations holds the SQL files applied in name order by harper-pad-sync (the runner comes with the sync service).
//
//go:embed migrations/*.sql
var Migrations embed.FS
