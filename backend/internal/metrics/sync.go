package metrics

import (
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Reasons a request failed device authentication. They are internal: the client always gets the same 401, so this is the only
// place the cause shows. The set is fixed, so the label is bounded.
const (
	AuthMissing      = "missing_credentials" // no DPoP authorization header, a wrong scheme or an oversized token
	AuthInvalidProof = "invalid_proof"       // a missing, repeated, malformed, stale or replayed proof
	AuthUnknownToken = "unknown_token"
	AuthKeyMismatch  = "key_mismatch" // a valid proof, made with a key other than the device's
	EnrollOK         = "ok"
	EnrollInvalid    = "invalid_invite" // wrong, spent or expired
	EnrollBadName    = "bad_name"
	EnrollError      = "error"
	WriteOK          = "ok"
	WriteDeleted     = "deleted"
	WriteConflict    = "conflict"
	WriteTooLarge    = "too_large"
	WriteInvalid     = "invalid"
	WriteError       = "error"
)

// SyncMetrics counts what happens in the sync API that the HTTP status alone does not tell. Every method is safe on a nil
// receiver, so the API runs without metrics.
type SyncMetrics struct {
	authFailures *prometheus.CounterVec
	enrollments  *prometheus.CounterVec
	docWrites    *prometheus.CounterVec
	cors         prometheus.Counter
	lastWrite    atomic.Int64 // Unix seconds of the last accepted write by this process; 0 until there is one
}

// Sync registers the sync API's metrics on m's registry and returns them.
func (m *Metrics) Sync() *SyncMetrics {
	labels := prometheus.Labels{"app": m.app}
	s := &SyncMetrics{
		authFailures: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "harper_pad_auth_failures_total", ConstLabels: labels,
			Help: "Requests refused for device authentication, by cause (the client sees one 401 for all of them).",
		}, []string{"reason"}),
		enrollments: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "harper_pad_enrollments_total", ConstLabels: labels,
			Help: "Device enrollment attempts that passed the proof check, by outcome.",
		}, []string{"outcome"}),
		docWrites: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "harper_pad_doc_writes_total", ConstLabels: labels,
			Help: "Draft writes (PUT /docs/{id}) by outcome: ok, deleted, conflict, too_large, invalid, error.",
		}, []string{"outcome"}),
		cors: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "harper_pad_cors_rejected_total", ConstLabels: labels,
			Help: "Requests whose Origin is not in CORS_ALLOWED_ORIGINS.",
		}),
	}
	last := prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "harper_pad_last_doc_write_timestamp_seconds", ConstLabels: labels,
		Help: "Unix time of the last accepted draft write in this process; 0 if there has been none since it started.",
	}, func() float64 { return float64(s.lastWrite.Load()) })
	m.reg.MustRegister(s.authFailures, s.enrollments, s.docWrites, s.cors, last)
	// Zero values for the known outcomes, so rate() and absence alerts work before the first event.
	for _, r := range []string{AuthMissing, AuthInvalidProof, AuthUnknownToken, AuthKeyMismatch} {
		s.authFailures.WithLabelValues(r)
	}
	for _, o := range []string{EnrollOK, EnrollInvalid, EnrollBadName, EnrollError} {
		s.enrollments.WithLabelValues(o)
	}
	for _, o := range []string{WriteOK, WriteDeleted, WriteConflict, WriteTooLarge, WriteInvalid, WriteError} {
		s.docWrites.WithLabelValues(o)
	}
	return s
}

// AuthFailure counts a refused authentication; reason is one of the Auth* constants.
func (s *SyncMetrics) AuthFailure(reason string) {
	if s != nil {
		s.authFailures.WithLabelValues(reason).Inc()
	}
}

// Enrollment counts an enrollment attempt; outcome is one of the Enroll* constants.
func (s *SyncMetrics) Enrollment(outcome string) {
	if s != nil {
		s.enrollments.WithLabelValues(outcome).Inc()
	}
}

// DocWrite counts a draft write; outcome is one of the Write* constants. An accepted write also sets the last-write time.
func (s *SyncMetrics) DocWrite(outcome string) {
	if s == nil {
		return
	}
	s.docWrites.WithLabelValues(outcome).Inc()
	if outcome == WriteOK || outcome == WriteDeleted {
		s.lastWrite.Store(time.Now().Unix())
	}
}

// CORSRejected counts a request from an origin that is not allowed.
func (s *SyncMetrics) CORSRejected() {
	if s != nil {
		s.cors.Inc()
	}
}
