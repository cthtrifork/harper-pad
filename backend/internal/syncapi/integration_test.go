package syncapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

// pgLogin points the libpq variables at the end-to-end stack's PostgreSQL as one role (TLS 1.3, its client certificate, no
// password), the way the cluster configures the services. Skipped unless TEST_PG_CERTS is set (`make test-db`).
func pgLogin(t *testing.T, role, cert string) {
	t.Helper()
	dir := os.Getenv("TEST_PG_CERTS")
	if dir == "" {
		t.Skip("TEST_PG_CERTS is not set: run `make test-db` in backend/")
	}
	port := os.Getenv("TEST_PG_PORT")
	if port == "" {
		port = "15432"
	}
	for k, v := range map[string]string{
		"PGHOST": "localhost", "PGPORT": port, "PGDATABASE": "harper", "PGUSER": role, "PGSSLMODE": "verify-full",
		"PGSSLROOTCERT": dir + "/ca.crt", "PGSSLCERT": dir + "/" + cert + ".crt", "PGSSLKEY": dir + "/" + cert + ".key",
		"PGPASSWORD": "", "DATABASE_URL": "",
	} {
		t.Setenv(k, v)
	}
}

// The whole path across the two roles on a real database: harper_admin creates an invite (as the admin UI does), a device enrolls
// with it through the handler (harper_sync), the same device authenticates with its token and key, a copied token with another
// key is refused, and revoking the device (harper_admin deletes the row) ends access at once.
func TestEnrollmentAcrossTheRoles(t *testing.T) {
	ctx := context.Background()

	pgLogin(t, "harper_sync", "client")
	syncPool, err := store.Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	defer syncPool.Close()
	if _, err := store.Migrate(ctx, syncPool, store.Migrations); err != nil {
		t.Fatal(err)
	}
	if _, err := syncPool.Exec(ctx, `TRUNCATE devices, invites`); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = syncPool.Exec(ctx, `TRUNCATE devices, invites`) }()

	pgLogin(t, "harper_admin", "admin")
	adminPool, err := store.Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	defer adminPool.Close()
	admin := store.NewAdmin(adminPool)

	token, _, err := admin.CreateInvite(ctx, "Desk Linux", 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	v := auth.NewVerifier()
	api := New(publicURL, nil, store.NewSync(syncPool), v)
	mux := http.NewServeMux()
	api.Register(mux)
	var seenDevice store.Device
	mux.HandleFunc("GET /docs", api.Authenticated(func(w http.ResponseWriter, _ *http.Request, d store.Device) {
		seenDevice = d
		w.WriteHeader(http.StatusNoContent)
	}))
	h := api.CORS(mux)

	// Proofs are made with the real clock here: the verifier is the real one.
	k := authtest.NewKey(t)
	n := 0
	prove := func(key authtest.Key, method, path, tok string) map[string]string {
		n++
		c := authtest.Claims{JTI: time.Now().Format(time.RFC3339Nano) + string(rune('a'+n)), HTM: method, HTU: publicURL + path, IAT: time.Now().Unix()}
		if tok != "" {
			c.ATH = authtest.ATH(tok)
		}
		hdr := map[string]string{"DPoP": key.Proof(t, nil, c)}
		if tok != "" {
			hdr["Authorization"] = "DPoP " + tok
		}
		return hdr
	}

	rec := do(h, "POST", "/enroll", map[string]string{"invite": token, "deviceName": "x"}, prove(k, "POST", "/enroll", ""))
	if rec.Code != 200 {
		t.Fatalf("enroll = %d %s", rec.Code, rec.Body)
	}
	var got enrollResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}

	devs, err := admin.Devices(ctx)
	if err != nil || len(devs) != 1 || devs[0].Name != "Desk Linux" {
		t.Fatalf("the admin sees %+v, %v", devs, err)
	}
	if pend, err := admin.PendingInvites(ctx, time.Now()); err != nil || len(pend) != 0 {
		t.Errorf("pending invites after use: %v, %v", pend, err)
	}

	if rec := do(h, "GET", "/docs", "", prove(k, "GET", "/docs", got.DeviceToken)); rec.Code != http.StatusNoContent || seenDevice.ID != devs[0].ID || seenDevice.ClientID != 1 {
		t.Fatalf("authenticated request = %d, device %+v", rec.Code, seenDevice)
	}
	if rec := do(h, "GET", "/docs", "", prove(authtest.NewKey(t), "GET", "/docs", got.DeviceToken)); rec.Code != 401 {
		t.Errorf("token with another key = %d, want 401", rec.Code)
	}
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": token}, prove(authtest.NewKey(t), "POST", "/enroll", "")); rec.Code != 401 {
		t.Errorf("spent invite = %d, want 401", rec.Code)
	}

	if err := admin.RevokeDevice(ctx, devs[0].ID); err != nil {
		t.Fatal(err)
	}
	if rec := do(h, "GET", "/docs", "", prove(k, "GET", "/docs", got.DeviceToken)); rec.Code != 401 {
		t.Errorf("after revoke = %d, want 401", rec.Code)
	}
}
