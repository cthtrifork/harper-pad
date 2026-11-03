package store

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The rule: all SQL lives in Go functions in this package, and the frontend only reaches the data through the Wails
// bindings of PadService (typed methods such as ListDrafts). Nothing in the app can send SQL from JavaScript. These
// tests fail if that changes, so the rule does not depend on remembering it.

var sqlStatement = regexp.MustCompile(`(?is)\b(select\s.{1,200}\sfrom\s+\w+|insert\s+into\s+\w+|delete\s+from\s+\w+|update\s+\w+\s+set\s|create\s+(table|index|view|trigger)\s|drop\s+(table|index)\s|alter\s+table\s|pragma\s+\w+)`)

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

// walk calls fn for every file under root, skipping dependencies, build output and git data.
func walk(t *testing.T, root string, fn func(path, rel string)) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			switch d.Name() {
			case ".git", "node_modules", "dist", ".vite":
				return filepath.SkipDir
			}
			return nil
		}
		fn(path, rel)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSQLAndDatabaseDriversStayInThisPackage(t *testing.T) {
	root := repoRoot(t)
	forbidden := []string{"database/sql", "modernc.org/sqlite", "github.com/mattn/go-sqlite3", "/pkg/services/sqlite", "/pkg/services/kvstore"}
	walk(t, root, func(path, rel string) {
		if !strings.HasSuffix(rel, ".go") || strings.HasPrefix(rel, "internal/store/") {
			return
		}
		f, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly|parser.SkipObjectResolution)
		if err != nil {
			t.Errorf("%s: %v", rel, err)
			return
		}
		for _, imp := range f.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			for _, bad := range forbidden {
				if strings.Contains(p, bad) {
					t.Errorf("%s imports %s: database code belongs in internal/store, behind PadService methods", rel, p)
				}
			}
		}
		full, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.SkipObjectResolution)
		if err != nil {
			return
		}
		ast.Inspect(full, func(n ast.Node) bool {
			if lit, ok := n.(*ast.BasicLit); ok && lit.Kind == token.STRING {
				if v, err := strconv.Unquote(lit.Value); err == nil && sqlStatement.MatchString(v) {
					t.Errorf("%s has SQL in a string literal: %.60q", rel, v)
				}
			}
			return true
		})
	})
}

func TestMainRegistersOnlyPadService(t *testing.T) {
	root := repoRoot(t)
	src, err := os.ReadFile(filepath.Join(root, "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	// One service, ours. A Wails service such as sqlite or kvstore would put generic data access in the frontend's reach.
	if n := strings.Count(string(src), "application.NewService("); n != 1 {
		t.Errorf("main.go registers %d services, want exactly PadService", n)
	}
	if strings.Contains(string(src), "/pkg/services/") {
		t.Error("main.go imports a built-in Wails service")
	}
}

func TestFrontendHasNoSQLAndExposesNoGenericQuery(t *testing.T) {
	root := repoRoot(t)
	exts := map[string]bool{".js": true, ".ts": true, ".vue": true, ".html": true, ".mjs": true}
	walk(t, filepath.Join(root, "frontend"), func(path, rel string) {
		if !exts[filepath.Ext(path)] || strings.HasSuffix(rel, "package-lock.json") {
			return
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Error(err)
			return
		}
		if m := sqlStatement.Find(data); m != nil {
			t.Errorf("frontend/%s has SQL: %.60q; the frontend calls PadService methods, never SQL", rel, m)
		}
	})
	// frontend/bindings/github.com/wailsapp holds Wails' own event types; its built-in services (sqlite, kvstore, ...) live under pkg/services.
	if _, err := os.Stat(filepath.Join(root, "frontend", "bindings", "github.com", "wailsapp", "wails", "v3", "pkg", "services")); err == nil {
		t.Error("frontend/bindings has bindings of a built-in Wails service")
	}
	svc, err := os.ReadFile(filepath.Join(root, "frontend", "bindings", "github.com", "cthtrifork", "harper-pad", "internal", "app", "padservice.js"))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range regexp.MustCompile(`(?m)^export function (\w+)`).FindAllSubmatch(svc, -1) {
		if regexp.MustCompile(`(?i)^(exec|query|sql|raw|select|prepare)`).Match(name[1]) {
			t.Errorf("PadService exposes %s to the frontend: bindings must be specific operations, not generic queries", name[1])
		}
	}
}
