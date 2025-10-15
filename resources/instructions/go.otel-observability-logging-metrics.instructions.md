---
description: Quick reference for implementing OpenTelemetry observability in Go applications with tracing, metrics, and logging best practices.
mode: reference
model: 
tools: ["copilot-chat", "inline-completion"]
inputVariables: ["otel-version", "instrumentation-scope", "export-target"]
---

# OTEL Observability Quickstart
_Last updated: 2025-09-04 15:47_

## Setup & Configuration

### SDK Initialization
```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/sdk/metric"
    "go.opentelemetry.io/otel/sdk/resource"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

// Initialize OTEL SDK with proper resource detection
func initOTEL(ctx context.Context, serviceName, version string) (func(), error) {
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceNameKey.String(serviceName),
            semconv.ServiceVersionKey.String(version),
            semconv.DeploymentEnvironmentKey.String(os.Getenv("ENV")),
        ),
        resource.WithFromEnv(),
        resource.WithTelemetrySDK(),
        resource.WithHost(),
    )
    
    // Tracing
    tp := trace.NewTracerProvider(
        trace.WithBatcher(otlptrace.New(ctx, otlptrace.NewClient())),
        trace.WithResource(res),
    )
    otel.SetTracerProvider(tp)
    
    // Metrics
    mp := metric.NewMeterProvider(
        metric.WithReader(metric.NewPeriodicReader(otlpmetric.New(ctx))),
        resource.WithResource(res),
    )
    otel.SetMeterProvider(mp)
    
    return func() {
        tp.Shutdown(ctx)
        mp.Shutdown(ctx)
    }, nil
}
```

## Tracing

## Tracing

### Manual Instrumentation
```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/codes"
    "go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("myservice")

func (s *Service) ProcessOrder(ctx context.Context, orderID string) error {
    ctx, span := tracer.Start(ctx, "Service.ProcessOrder",
        trace.WithAttributes(
            attribute.String("order.id", orderID),
            attribute.String("user.id", getUserID(ctx)),
        ),
    )
    defer span.End()
    
    // Business logic
    if err := s.validateOrder(ctx, orderID); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, "validation failed")
        return fmt.Errorf("validation error: %w", err)
    }
    
    span.AddEvent("order.validated")
    span.SetAttributes(attribute.String("order.status", "processed"))
    return nil
}
```

## HTTP
- Use otelhttp for servers/clients.
- Name spans: `HTTP {METHOD} {ROUTE}`.
- Attributes: client_ip, status_code, user_agent.

### HTTP Server Middleware
```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

func main() {
    handler := otelhttp.NewHandler(mux, "myservice",
        otelhttp.WithSpanNameFormatter(func(operation string, r *http.Request) string {
            return fmt.Sprintf("HTTP %s %s", r.Method, r.URL.Path)
        }),
    )
    http.ListenAndServe(":8080", handler)
}
```

### HTTP Client
```go
client := &http.Client{
    Transport: otelhttp.NewTransport(http.DefaultTransport),
}
```

## Database
- Use otelsql wrapper.
- Attributes: db.system, db.statement (bounded), rows_affected.

### Database Instrumentation
```go
import (
    "github.com/XSAM/otelsql"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

func connectDB() (*sql.DB, error) {
    db, err := otelsql.Open("postgres", dsn,
        otelsql.WithAttributes(
            semconv.DBSystemPostgreSQL,
        ),
        otelsql.WithSpanOptions(otelsql.SpanOptions{
            Ping: true,
            RowsNext: true,
            RowsClose: true,
        }),
    )
    if err != nil {
        return nil, err
    }
    
    // Register stats to export connection pool metrics
    if err := otelsql.RegisterDBStatsMetrics(db, otelsql.WithAttributes(
        semconv.DBSystemPostgreSQL,
    )); err != nil {
        return nil, err
    }
    
    return db, nil
}
```

## Metrics
- RED: Rate, Errors, Duration.
- Keep labels low-cardinality: service.name, env, version.

### Metrics Implementation
```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/metric"
)

type Metrics struct {
    requestCounter    metric.Int64Counter
    requestDuration   metric.Float64Histogram
    activeConnections metric.Int64UpDownCounter
    queueDepth        metric.Int64Gauge
}

func NewMetrics() (*Metrics, error) {
    meter := otel.Meter("myservice")
    
    requestCounter, err := meter.Int64Counter(
        "http_requests_total",
        metric.WithDescription("Total number of HTTP requests"),
        metric.WithUnit("1"),
    )
    if err != nil {
        return nil, err
    }
    
    requestDuration, err := meter.Float64Histogram(
        "http_request_duration_seconds",
        metric.WithDescription("HTTP request duration"),
        metric.WithUnit("s"),
        metric.WithExplicitBucketBoundaries(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    )
    if err != nil {
        return nil, err
    }
    
    activeConnections, err := meter.Int64UpDownCounter(
        "db_connections_active",
        metric.WithDescription("Active database connections"),
        metric.WithUnit("1"),
    )
    if err != nil {
        return nil, err
    }
    
    queueDepth, err := meter.Int64Gauge(
        "queue_depth",
        metric.WithDescription("Current queue depth"),
        metric.WithUnit("1"),
    )
    if err != nil {
        return nil, err
    }
    
    return &Metrics{
        requestCounter:    requestCounter,
        requestDuration:   requestDuration,
        activeConnections: activeConnections,
        queueDepth:        queueDepth,
    }, nil
}

func (m *Metrics) RecordRequest(ctx context.Context, method, status string, duration float64) {
    attrs := []attribute.KeyValue{
        attribute.String("method", method),
        attribute.String("status", status),
    }
    
    m.requestCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
    m.requestDuration.Record(ctx, duration, metric.WithAttributes(attrs...))
}

func (m *Metrics) SetQueueDepth(ctx context.Context, depth int64) {
    m.queueDepth.Record(ctx, depth)
}
```

### Golden Signals (RED/USE)
```go
// Rate: Requests per second
requests_total{method="GET", status="200"}

// Errors: Error rate percentage  
sum(rate(requests_total{status=~"5.."}[5m])) / sum(rate(requests_total[5m])) * 100

// Duration: Response time percentiles
histogram_quantile(0.95, request_duration_seconds_bucket)

// Utilization: Resource usage
process_cpu_seconds_total
go_memstats_alloc_bytes

// Saturation: Queue depth, connection pools
queue_depth
db_connections_active
```

## Logs
- Structured logger, inject trace/span IDs.
- Avoid PII, sample noisy logs.

### Structured Logging with OTEL Integration
```go
import (
    "log/slog"
    "go.opentelemetry.io/otel/trace"
)

// Custom slog handler that adds trace context
type OTELHandler struct {
    slog.Handler
}

func (h OTELHandler) Handle(ctx context.Context, r slog.Record) error {
    if span := trace.SpanFromContext(ctx); span.SpanContext().IsValid() {
        spanCtx := span.SpanContext()
        r.AddAttrs(
            slog.String("trace_id", spanCtx.TraceID().String()),
            slog.String("span_id", spanCtx.SpanID().String()),
        )
    }
    return h.Handler.Handle(ctx, r)
}

func NewLogger() *slog.Logger {
    handler := &OTELHandler{
        Handler: slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        }),
    }
    return slog.New(handler)
}

// Usage in service methods
func (s *Service) ProcessOrder(ctx context.Context, orderID string) error {
    logger := slog.With(
        "service", "order",
        "operation", "process",
        "order_id", orderID,
    )
    
    logger.InfoContext(ctx, "processing order started")
    
    if err := s.validate(ctx, orderID); err != nil {
        logger.ErrorContext(ctx, "validation failed", 
            "error", err,
            "order_id", orderID,
        )
        return err
    }
    
    logger.InfoContext(ctx, "order processed successfully",
        "duration_ms", time.Since(start).Milliseconds(),
    )
    return nil
}
```

### Log Sampling & PII Protection
```go
// High-frequency log sampling
type SamplingHandler struct {
    handler slog.Handler
    sampler *rate.Limiter
}

func NewSamplingHandler(handler slog.Handler, rps int) *SamplingHandler {
    return &SamplingHandler{
        handler: handler,
        sampler: rate.NewLimiter(rate.Limit(rps), rps),
    }
}

func (h *SamplingHandler) Handle(ctx context.Context, r slog.Record) error {
    // Sample high-frequency debug logs
    if r.Level == slog.LevelDebug && !h.sampler.Allow() {
        return nil
    }
    return h.handler.Handle(ctx, r)
}

// PII redaction
func sanitizeUserID(userID string) string {
    if len(userID) <= 8 {
        return strings.Repeat("*", len(userID))
    }
    return userID[:4] + strings.Repeat("*", len(userID)-8) + userID[len(userID)-4:]
}
```

## Error Handling & Observability

### Error Recording Best Practices
```go
func (s *Service) ProcessPayment(ctx context.Context, req PaymentRequest) error {
    ctx, span := tracer.Start(ctx, "Service.ProcessPayment")
    defer span.End()
    
    // Add request attributes
    span.SetAttributes(
        attribute.String("payment.id", req.ID),
        attribute.Float64("payment.amount", req.Amount),
        attribute.String("payment.currency", req.Currency),
    )
    
    if err := s.validatePayment(ctx, req); err != nil {
        // Record error with additional context
        span.RecordError(err, trace.WithAttributes(
            attribute.String("error.type", "validation"),
            attribute.String("validation.field", getValidationField(err)),
        ))
        span.SetStatus(codes.Error, "validation failed")
        
        // Log with structured data
        slog.ErrorContext(ctx, "payment validation failed",
            "error", err,
            "payment_id", req.ID,
            "validation_errors", getValidationErrors(err),
        )
        
        return fmt.Errorf("payment validation failed: %w", err)
    }
    
    // Process payment...
    result, err := s.gateway.Process(ctx, req)
    if err != nil {
        // Classify error types
        var gatewayErr *GatewayError
        if errors.As(err, &gatewayErr) {
            span.SetAttributes(
                attribute.String("gateway.response_code", gatewayErr.Code),
                attribute.Bool("gateway.retryable", gatewayErr.Retryable),
            )
        }
        
        span.RecordError(err)
        span.SetStatus(codes.Error, "gateway processing failed")
        return err
    }
    
    // Record success metrics
    span.SetAttributes(
        attribute.String("payment.status", "processed"),
        attribute.String("gateway.transaction_id", result.TransactionID),
    )
    
    return nil
}
```

## Alerting & SLI/SLO

### Service Level Indicators (SLIs)
```go
// Example SLI definitions for alerting
const (
    // Availability: 99.9% of requests return 2xx/3xx status
    SLI_AVAILABILITY = `
        sum(rate(http_requests_total{status=~"[23].."}[5m])) / 
        sum(rate(http_requests_total[5m]))
    `
    
    // Latency: 95% of requests complete within 500ms
    SLI_LATENCY_P95 = `
        histogram_quantile(0.95, 
            rate(http_request_duration_seconds_bucket[5m])
        )
    `
    
    // Error Rate: <1% of requests return 5xx status
    SLI_ERROR_RATE = `
        sum(rate(http_requests_total{status=~"5.."}[5m])) / 
        sum(rate(http_requests_total[5m]))
    `
)

// Alert thresholds
// - Availability < 99.9% for 2 minutes
// - P95 latency > 500ms for 1 minute  
// - Error rate > 1% for 30 seconds
```

## Testing
- In-memory exporters in tests.
- Golden tests for span names + attributes.

### OTEL Testing Patterns
```go
import (
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/sdk/trace/tracetest"
    "go.opentelemetry.io/otel/sdk/metric"
    "go.opentelemetry.io/otel/sdk/metric/metrictest"
)

func TestServiceWithOTEL(t *testing.T) {
    // Setup in-memory exporters
    spanRecorder := tracetest.NewSpanRecorder()
    tp := trace.NewTracerProvider(trace.WithSpanProcessor(spanRecorder))
    
    metricReader := metrictest.NewManualReader()
    mp := metric.NewMeterProvider(metric.WithReader(metricReader))
    
    // Setup service with test providers
    service := NewService(
        WithTracerProvider(tp),
        WithMeterProvider(mp),
    )
    
    // Execute test
    ctx := context.Background()
    err := service.ProcessOrder(ctx, "order-123")
    require.NoError(t, err)
    
    // Verify spans
    spans := spanRecorder.Ended()
    require.Len(t, spans, 1)
    
    span := spans[0]
    assert.Equal(t, "Service.ProcessOrder", span.Name())
    assert.Equal(t, "order-123", span.Attributes()["order.id"])
    
    // Verify metrics
    metrics := metricReader.GetMetrics()
    // Assert on metric values...
}

// Golden test for span structure
func TestSpanStructure(t *testing.T) {
    tests := []struct {
        name     string
        operation func(context.Context) error
        wantSpans []SpanAssertion
    }{
        {
            name: "successful_order_processing",
            operation: func(ctx context.Context) error {
                return service.ProcessOrder(ctx, "order-123")
            },
            wantSpans: []SpanAssertion{
                {
                    Name: "Service.ProcessOrder",
                    Attributes: map[string]interface{}{
                        "order.id": "order-123",
                        "order.status": "processed",
                    },
                    Events: []string{"order.validated"},
                },
            },
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation...
        })
    }
}
```

### Performance Testing with OTEL
```go
func BenchmarkServiceWithOTEL(b *testing.B) {
    // Use no-op providers for performance testing
    tp := trace.NewNoopTracerProvider()
    mp := metric.NewNoopMeterProvider()
    
    service := NewService(
        WithTracerProvider(tp),
        WithMeterProvider(mp),
    )
    
    ctx := context.Background()
    b.ResetTimer()
    
    for i := 0; i < b.N; i++ {
        _ = service.ProcessOrder(ctx, fmt.Sprintf("order-%d", i))
    }
}
```

## Production Deployment

### Environment Configuration
```go
type OTELConfig struct {
    ServiceName     string `env:"OTEL_SERVICE_NAME" default:"myservice"`
    ServiceVersion  string `env:"OTEL_SERVICE_VERSION" default:"unknown"`
    Environment     string `env:"OTEL_ENVIRONMENT" default:"development"`
    
    // Tracing
    TraceEndpoint   string `env:"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"`
    TraceSampling   float64 `env:"OTEL_TRACE_SAMPLING_RATIO" default:"0.1"`
    
    // Metrics  
    MetricEndpoint  string `env:"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"`
    MetricInterval  time.Duration `env:"OTEL_METRIC_EXPORT_INTERVAL" default:"30s"`
    
    // Resource detection
    EnableK8s       bool `env:"OTEL_ENABLE_K8S_DETECTION" default:"true"`
    EnableAWS       bool `env:"OTEL_ENABLE_AWS_DETECTION" default:"true"`
}

func (c OTELConfig) NewSDK(ctx context.Context) (*SDK, error) {
    // Resource detection
    detectors := []resource.Detector{
        resource.FromEnv{},
        resource.TelemetrySDK{},
    }
    
    if c.EnableK8s {
        detectors = append(detectors, k8sdetector.New())
    }
    
    if c.EnableAWS {
        detectors = append(detectors, ec2.NewResourceDetector())
    }
    
    res, err := resource.New(ctx,
        resource.WithDetectors(detectors...),
        resource.WithAttributes(
            semconv.ServiceNameKey.String(c.ServiceName),
            semconv.ServiceVersionKey.String(c.ServiceVersion),
            semconv.DeploymentEnvironmentKey.String(c.Environment),
        ),
    )
    if err != nil {
        return nil, err
    }
    
    // Configure sampling
    sampler := trace.TraceIDRatioBased(c.TraceSampling)
    
    // Production-ready SDK setup...
    return sdk, nil
}
```

### Monitoring & Troubleshooting
```bash
# Common OTEL debugging commands
export OTEL_LOG_LEVEL=debug
export OTEL_TRACES_EXPORTER=console  # For local debugging
export OTEL_METRICS_EXPORTER=console

# Verify instrumentation
curl http://localhost:8080/metrics  # Prometheus metrics
curl http://localhost:8080/health   # Health with trace context

# Check trace sampling
grpcurl -plaintext localhost:4317 list  # OTLP receiver
```
