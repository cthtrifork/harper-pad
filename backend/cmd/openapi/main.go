// Command openapi writes docs/openapi.yaml from the sync API's Go types. Run it with `make openapi` in backend/.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/syncapi"
)

const header = "# Generated from the Go types of the routes by `make openapi` in backend/ (cmd/openapi).\n" +
	"# Do not edit by hand: regenerate it when a route, a field or a constraint changes.\n"

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: openapi <output file>")
	}
	api := syncapi.New("https://sync.example.com", nil, nil, auth.NewVerifier())
	api.Register(http.NewServeMux())
	yaml, err := api.Huma().OpenAPI().YAML()
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(os.Args[1], append([]byte(header), yaml...), 0o644); err != nil {
		log.Fatal(err)
	}
}
