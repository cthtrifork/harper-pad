// Package metrics exposes Prometheus metrics: Go runtime and process collectors, the pgx pool's statistics and per-route HTTP
// request counts and latencies. It uses its own registry (nothing global), and the handler is meant for a separate listener
// (see internal/server) that only Prometheus can reach, never for the public route.
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics is a registry plus the HTTP instruments.
type Metrics struct {
	reg      *prometheus.Registry
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

// New returns a registry with the Go and process collectors. app is the command name ("sync" or "admin"), a constant label.
func New(app string) *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	m := &Metrics{
		reg: reg,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name:        "harper_pad_http_requests_total",
			Help:        "HTTP requests by method, route pattern and status code.",
			ConstLabels: prometheus.Labels{"app": app},
		}, []string{"method", "route", "code"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:        "harper_pad_http_request_duration_seconds",
			Help:        "HTTP request latency by method and route pattern.",
			Buckets:     prometheus.DefBuckets,
			ConstLabels: prometheus.Labels{"app": app},
		}, []string{"method", "route"}),
	}
	reg.MustRegister(m.requests, m.duration)
	return m
}

// Handler serves the metrics in the Prometheus text format.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{Registry: m.reg})
}

// Instrument wraps next, which must be the *http.ServeMux that routes the requests: the route label is the mux pattern that
// matched ("GET /healthz"), so the number of label values is bounded by the code and never by what clients send. A request no
// pattern matched is "unmatched".
func (m *Metrics) Instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		route := r.Pattern // set by the mux on this same request
		if route == "" {
			route = "unmatched"
		}
		m.requests.WithLabelValues(r.Method, route, strconv.Itoa(rec.status)).Inc()
		m.duration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// RegisterPool exports the pool's statistics as harper_pad_db_pool_* metrics, read when Prometheus scrapes.
func (m *Metrics) RegisterPool(pool *pgxpool.Pool) {
	m.reg.MustRegister(&poolCollector{pool: pool})
}

type poolCollector struct{ pool *pgxpool.Pool }

var (
	connsDesc = prometheus.NewDesc("harper_pad_db_pool_connections", "Pool connections by state.", []string{"state"}, nil)
	maxDesc   = prometheus.NewDesc("harper_pad_db_pool_max_connections", "Configured maximum pool size.", nil, nil)
	acqDesc   = prometheus.NewDesc("harper_pad_db_pool_acquires_total", "Connection acquisitions.", nil, nil)
	waitDesc  = prometheus.NewDesc("harper_pad_db_pool_empty_acquires_total", "Acquisitions that had to wait because every connection was busy.", nil, nil)
	waitSec   = prometheus.NewDesc("harper_pad_db_pool_acquire_wait_seconds_total", "Total time spent waiting for a connection.", nil, nil)
)

func (c *poolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- connsDesc
	ch <- maxDesc
	ch <- acqDesc
	ch <- waitDesc
	ch <- waitSec
}

func (c *poolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.pool.Stat()
	ch <- prometheus.MustNewConstMetric(connsDesc, prometheus.GaugeValue, float64(s.AcquiredConns()), "acquired")
	ch <- prometheus.MustNewConstMetric(connsDesc, prometheus.GaugeValue, float64(s.IdleConns()), "idle")
	ch <- prometheus.MustNewConstMetric(connsDesc, prometheus.GaugeValue, float64(s.ConstructingConns()), "constructing")
	ch <- prometheus.MustNewConstMetric(maxDesc, prometheus.GaugeValue, float64(s.MaxConns()))
	ch <- prometheus.MustNewConstMetric(acqDesc, prometheus.CounterValue, float64(s.AcquireCount()))
	ch <- prometheus.MustNewConstMetric(waitDesc, prometheus.CounterValue, float64(s.EmptyAcquireCount()))
	ch <- prometheus.MustNewConstMetric(waitSec, prometheus.CounterValue, s.AcquireDuration().Seconds())
}
