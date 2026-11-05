package syncapi

import (
	"flag"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
)

var update = flag.Bool("update", false, "rewrite docs/openapi.yaml from the routes")

// openAPIHeader tells a reader of the generated file where it comes from.
const openAPIHeader = "# Generated from the Go types of the routes by `make openapi` in backend/ (internal/syncapi/openapi_test.go).\n" +
	"# Do not edit by hand: the test fails when this file differs from what the code describes.\n"

// The OpenAPI description is generated from the code, not written beside it, and this test keeps the committed copy honest: it
// fails when a route, a field or a constraint changes without the file being regenerated.
func TestOpenAPIIsUpToDate(t *testing.T) {
	api := New("https://sync.example.com", nil, nil, auth.NewVerifier())
	api.Register(http.NewServeMux())
	yaml, err := api.Huma().OpenAPI().YAML()
	if err != nil {
		t.Fatal(err)
	}
	got := openAPIHeader + string(yaml)
	path := filepath.Join("..", "..", "..", "docs", "openapi.yaml")

	if *update {
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v: run `make openapi` in backend/", err)
	}
	if string(want) != got {
		t.Fatal("docs/openapi.yaml is out of date: run `make openapi` in backend/ and commit the result")
	}
}

// The generator must give the same bytes every time, or the test above would flap.
func TestOpenAPIIsDeterministic(t *testing.T) {
	gen := func() string {
		api := New("https://sync.example.com", nil, nil, auth.NewVerifier())
		api.Register(http.NewServeMux())
		y, err := api.Huma().OpenAPI().YAML()
		if err != nil {
			t.Fatal(err)
		}
		return string(y)
	}
	first := gen()
	for range 5 {
		if gen() != first {
			t.Fatal("the generated document changes between runs")
		}
	}
}
