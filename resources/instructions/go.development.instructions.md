---
description: Comprehensive Go development standards, coding guidelines, project structure, and ready-to-use prompts for common development tasks.
applyTo:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
  - "**/Dockerfile"
---

# Go Development Standards & Guidelines
_Last updated: 2025-09-04 15:47_

# Go Development Standards & Guidelines
_Last updated: 2025-09-04 15:47_

## Project Structure Standards

### Standard Go Project Layout
```
myservice/
├── cmd/                    # Main applications
│   └── server/
│       └── main.go
├── internal/               # Private application code
│   ├── config/            # Configuration
│   ├── handler/           # HTTP handlers
│   ├── service/           # Business logic
│   ├── repository/        # Data access
│   └── middleware/        # HTTP middleware
├── pkg/                   # Public library code
│   ├── client/            # Client libraries
│   └── types/             # Shared types
├── api/                   # API definitions
│   ├── openapi/           # OpenAPI specs
│   └── proto/             # Protocol buffers
├── web/                   # Web assets (if needed)
├── scripts/               # Build/deployment scripts
├── deployments/           # Docker, k8s, configs
├── docs/                  # Documentation
├── go.mod
├── go.sum
├── Makefile
├── README.md
└── .golangci.yml
```

### Package Organization Rules
- **`cmd/`**: One directory per executable, minimal main.go
- **`internal/`**: Application-specific code, not importable by other projects
- **`pkg/`**: Library code that's OK for others to import
- **Package names**: Short, lowercase, no underscores or camelCase
- **Import groups**: stdlib, external, internal (separated by blank lines)

## Coding Standards

### Naming Conventions
```go
// Good: Clear, concise names
type UserService struct {
    repo UserRepository
    log  *slog.Logger
}

func (s *UserService) CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    // Implementation
}

// Bad: Unclear abbreviations, stuttering
type UserServiceImpl struct {
    userRepo UserRepositoryInterface
    userLog  *slog.Logger
}

func (s *UserServiceImpl) CreateUserUser(ctx context.Context, userReq CreateUserUserRequest) (*UserUser, error) {
    // Implementation
}
```

### Interface Design
```go
// Good: Small, focused interfaces
type UserReader interface {
    GetUser(ctx context.Context, id string) (*User, error)
    ListUsers(ctx context.Context, filter UserFilter) ([]User, error)
}

type UserWriter interface {
    CreateUser(ctx context.Context, user *User) error
    UpdateUser(ctx context.Context, user *User) error
    DeleteUser(ctx context.Context, id string) error
}

type UserRepository interface {
    UserReader
    UserWriter
}

// Bad: Large, monolithic interfaces
type UserService interface {
    CreateUser(ctx context.Context, user *User) error
    UpdateUser(ctx context.Context, user *User) error
    DeleteUser(ctx context.Context, id string) error
    GetUser(ctx context.Context, id string) (*User, error)
    ListUsers(ctx context.Context, filter UserFilter) ([]User, error)
    SendEmail(ctx context.Context, userID string, subject, body string) error
    GenerateReport(ctx context.Context, userID string) ([]byte, error)
    // ... many more methods
}
```

### Error Handling Standards
```go
import (
    "errors"
    "fmt"
)

// Define package-level sentinel errors
var (
    ErrUserNotFound    = errors.New("user not found")
    ErrInvalidEmail    = errors.New("invalid email address")
    ErrUserExists      = errors.New("user already exists")
)

// Custom error types for rich context
type ValidationError struct {
    Field   string
    Value   string
    Message string
}

func (e ValidationError) Error() string {
    return fmt.Sprintf("validation failed for field %s: %s", e.Field, e.Message)
}

// Error wrapping and checking
func (s *UserService) CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    if err := s.validateUser(req); err != nil {
        return nil, fmt.Errorf("user validation failed: %w", err)
    }
    
    user, err := s.repo.CreateUser(ctx, req.ToUser())
    if err != nil {
        if errors.Is(err, repository.ErrDuplicateKey) {
            return nil, ErrUserExists
        }
        return nil, fmt.Errorf("failed to create user: %w", err)
    }
    
    return user, nil
}

// Error handling in callers
user, err := userService.CreateUser(ctx, req)
if err != nil {
    var validationErr ValidationError
    if errors.As(err, &validationErr) {
        // Handle validation error
        return handleValidationError(validationErr)
    }
    
    if errors.Is(err, ErrUserExists) {
        // Handle duplicate user
        return handleDuplicateUser()
    }
    
    // Generic error handling
    return fmt.Errorf("unexpected error: %w", err)
}
```

### Context Usage Standards
```go
// Always pass context as first parameter
func (s *Service) ProcessOrder(ctx context.Context, orderID string) error {
    // Use context for timeouts
    ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()
    
    // Pass context to all downstream calls
    user, err := s.userService.GetUser(ctx, order.UserID)
    if err != nil {
        return err
    }
    
    // Check for cancellation
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Continue processing
    }
    
    return nil
}

// Context values for request-scoped data
type contextKey string

const (
    UserIDKey     contextKey = "user_id"
    RequestIDKey  contextKey = "request_id"
    TraceIDKey    contextKey = "trace_id"
)

func GetUserID(ctx context.Context) string {
    if userID, ok := ctx.Value(UserIDKey).(string); ok {
        return userID
    }
    return ""
}

func WithUserID(ctx context.Context, userID string) context.Context {
    return context.WithValue(ctx, UserIDKey, userID)
}
```

## Dependency Injection Standards

### Constructor Injection Pattern
```go
// Service dependencies
type UserService struct {
    repo      UserRepository
    validator UserValidator
    logger    *slog.Logger
    metrics   *Metrics
}

// Constructor with validation
func NewUserService(repo UserRepository, validator UserValidator, logger *slog.Logger, metrics *Metrics) (*UserService, error) {
    if repo == nil {
        return nil, errors.New("repository is required")
    }
    if validator == nil {
        return nil, errors.New("validator is required")
    }
    if logger == nil {
        return nil, errors.New("logger is required")
    }
    if metrics == nil {
        return nil, errors.New("metrics is required")
    }
    
    return &UserService{
        repo:      repo,
        validator: validator,
        logger:    logger,
        metrics:   metrics,
    }, nil
}

// Functional options pattern for complex configuration
type ServiceOption func(*UserService)

func WithCacheSize(size int) ServiceOption {
    return func(s *UserService) {
        s.cacheSize = size
    }
}

func WithTimeout(timeout time.Duration) ServiceOption {
    return func(s *UserService) {
        s.timeout = timeout
    }
}

func NewUserServiceWithOptions(repo UserRepository, opts ...ServiceOption) *UserService {
    service := &UserService{
        repo:      repo,
        cacheSize: 1000,        // defaults
        timeout:   30 * time.Second,
    }
    
    for _, opt := range opts {
        opt(service)
    }
    
    return service
}
```

## Testing Standards

### Test Organization
```go
func TestUserService_CreateUser(t *testing.T) {
    tests := []struct {
        name    string
        req     CreateUserRequest
        setup   func(*MockUserRepository)
        want    *User
        wantErr error
    }{
        {
            name: "successful_creation",
            req: CreateUserRequest{
                Email: "user@example.com",
                Name:  "John Doe",
            },
            setup: func(repo *MockUserRepository) {
                repo.EXPECT().CreateUser(mock.Anything, mock.Anything).
                    Return(&User{ID: "123", Email: "user@example.com"}, nil)
            },
            want: &User{ID: "123", Email: "user@example.com"},
        },
        {
            name: "duplicate_email",
            req: CreateUserRequest{
                Email: "duplicate@example.com",
                Name:  "Jane Doe",
            },
            setup: func(repo *MockUserRepository) {
                repo.EXPECT().CreateUser(mock.Anything, mock.Anything).
                    Return(nil, repository.ErrDuplicateKey)
            },
            wantErr: ErrUserExists,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup
            repo := NewMockUserRepository(t)
            if tt.setup != nil {
                tt.setup(repo)
            }
            
            service := NewUserService(repo, NewValidator(), slog.Default(), NewMetrics())
            
            // Execute
            got, err := service.CreateUser(context.Background(), tt.req)
            
            // Assert
            if tt.wantErr != nil {
                assert.Error(t, err)
                assert.True(t, errors.Is(err, tt.wantErr))
                return
            }
            
            require.NoError(t, err)
            assert.Equal(t, tt.want, got)
        })
    }
}

// Integration test pattern
func TestUserService_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }
    
    // Setup test database
    db := setupTestDB(t)
    defer cleanupTestDB(t, db)
    
    repo := repository.NewUserRepository(db)
    service := NewUserService(repo, NewValidator(), slog.Default(), NewMetrics())
    
    // Test scenarios...
}

// Benchmark pattern
func BenchmarkUserService_CreateUser(b *testing.B) {
    repo := NewMockUserRepository(b)
    repo.EXPECT().CreateUser(mock.Anything, mock.Anything).
        Return(&User{}, nil).Times(b.N)
    
    service := NewUserService(repo, NewValidator(), slog.Default(), NewMetrics())
    req := CreateUserRequest{Email: "test@example.com", Name: "Test"}
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = service.CreateUser(context.Background(), req)
    }
}
```

### Mock Generation
```go
//go:generate mockery --name=UserRepository --output=mocks --outpkg=mocks
type UserRepository interface {
    CreateUser(ctx context.Context, user *User) (*User, error)
    GetUser(ctx context.Context, id string) (*User, error)
    UpdateUser(ctx context.Context, user *User) error
    DeleteUser(ctx context.Context, id string) error
}
```

## Configuration Standards

### Environment-Based Configuration
```go
type Config struct {
    Server   ServerConfig   `env:",prefix=SERVER_"`
    Database DatabaseConfig `env:",prefix=DB_"`
    Redis    RedisConfig    `env:",prefix=REDIS_"`
    OTEL     OTELConfig     `env:",prefix=OTEL_"`
    Log      LogConfig      `env:",prefix=LOG_"`
}

type ServerConfig struct {
    Host         string        `env:"HOST" default:"localhost"`
    Port         int           `env:"PORT" default:"8080"`
    ReadTimeout  time.Duration `env:"READ_TIMEOUT" default:"30s"`
    WriteTimeout time.Duration `env:"WRITE_TIMEOUT" default:"30s"`
    IdleTimeout  time.Duration `env:"IDLE_TIMEOUT" default:"60s"`
}

type DatabaseConfig struct {
    URL             string        `env:"URL,required"`
    MaxConnections  int           `env:"MAX_CONNECTIONS" default:"25"`
    MaxIdleTime     time.Duration `env:"MAX_IDLE_TIME" default:"15m"`
    ConnMaxLifetime time.Duration `env:"CONN_MAX_LIFETIME" default:"1h"`
}

func LoadConfig() (*Config, error) {
    var cfg Config
    
    if err := env.Parse(&cfg); err != nil {
        return nil, fmt.Errorf("failed to parse config: %w", err)
    }
    
    if err := cfg.Validate(); err != nil {
        return nil, fmt.Errorf("invalid config: %w", err)
    }
    
    return &cfg, nil
}

func (c *Config) Validate() error {
    if c.Server.Port < 1 || c.Server.Port > 65535 {
        return errors.New("server port must be between 1 and 65535")
    }
    
    if c.Database.MaxConnections < 1 {
        return errors.New("database max connections must be positive")
    }
    
    return nil
}
```

## Code Quality Standards

### Static Analysis Tools
```makefile
# Makefile targets for code quality
.PHONY: lint test vet fmt imports security

lint:
	golangci-lint run

test:
	go test -race -cover -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

vet:
	go vet ./...

fmt:
	gofmt -s -w .
	goimports -w .

imports:
	goimports -local github.com/myorg/myproject -w .

security:
	gosec ./...
	govulncheck ./...

# Pre-commit hook
pre-commit: fmt imports vet lint test security
```

### golangci-lint Configuration
```yaml
# .golangci.yml
run:
  timeout: 5m
  issues-exit-code: 1
  tests: true

linters-settings:
  gocyclo:
    min-complexity: 15
  goconst:
    min-len: 3
    min-occurrences: 3
  misspell:
    locale: US
  lll:
    line-length: 120

linters:
  enable:
    - bodyclose
    - deadcode
    - depguard
    - dogsled
    - errcheck
    - gochecknoinits
    - goconst
    - gocyclo
    - gofmt
    - goimports
    - golint
    - gomnd
    - goprintffuncname
    - gosec
    - gosimple
    - govet
    - ineffassign
    - lll
    - misspell
    - nakedret
    - rowserrcheck
    - staticcheck
    - structcheck
    - stylecheck
    - typecheck
    - unconvert
    - unparam
    - unused
    - varcheck
    - whitespace

issues:
  exclude-rules:
    - path: _test\.go
      linters:
        - gomnd
        - lll
```
```text
func (s *AccountService) Transfer(ctx context.Context, from, to string, amount decimal.Decimal) error
Requirements:
- Validate inputs and return typed errors (package-local).
- Use context deadline/timeout; fail fast if exceeded.
- OTEL span "AccountService.Transfer", attributes: user.id, amount.
- Metrics: counter "transfers_total", histogram "transfer_amount".
- Structured logs with trace/span correlation.
- No global state; constructor injection for repository and logger.
- Add table-driven tests and a race test.
```

## Development Workflow Standards

### Git Workflow
```bash
# Feature branch workflow
git checkout -b feature/user-authentication
git add .
git commit -m "feat: add user authentication service

- Implement JWT token generation
- Add user validation middleware
- Include comprehensive test coverage

Closes #123"

# Commit message format: type(scope): description
# Types: feat, fix, docs, style, refactor, test, chore
```

### Code Review Checklist
- [ ] **Functionality**: Code works as intended
- [ ] **Tests**: Adequate test coverage (>80%)
- [ ] **Performance**: No obvious performance issues
- [ ] **Security**: No security vulnerabilities
- [ ] **Style**: Follows Go conventions and team standards
- [ ] **Documentation**: Public APIs are documented
- [ ] **Error Handling**: Proper error handling and logging
- [ ] **Dependencies**: No unnecessary dependencies added

### CI/CD Pipeline Standards
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      
      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: ~/go/pkg/mod
          key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
      
      - name: Download dependencies
        run: go mod download
      
      - name: Vet
        run: go vet ./...
      
      - name: Test
        run: go test -race -coverprofile=coverage.out ./...
      
      - name: Lint
        uses: golangci/golangci-lint-action@v3
        with:
          version: latest
      
      - name: Security scan
        run: |
          go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest
          gosec ./...
      
      - name: Vulnerability check
        run: |
          go install golang.org/x/vuln/cmd/govulncheck@latest
          govulncheck ./...
```

## Ready-to-Use Implementation Prompts

### Service Implementation
```text
func (s *AccountService) Transfer(ctx context.Context, from, to string, amount decimal.Decimal) error
Requirements:
- Validate inputs and return typed errors (package-local).
- Use context deadline/timeout; fail fast if exceeded.
- OTEL span "AccountService.Transfer", attributes: user.id, amount.
- Metrics: counter "transfers_total", histogram "transfer_amount".
- Structured logs with trace/span correlation.
- No global state; constructor injection for repository and logger.
- Add table-driven tests and a race test.
```
```text
Create an HTTP handler with chi router.
- JSON in/out, validate, RFC 7807 on error.
- Use otelhttp middleware. Name spans `HTTP {METHOD} {route}`.
- Metrics for request count, errors, latency histogram.
- Context deadlines enforced.
- Recover middleware returns 500 with incident ID.
```

### HTTP Handlers
```text
Create an HTTP handler with chi router.
- JSON in/out, validate, RFC 7807 on error.
- Use otelhttp middleware. Name spans `HTTP {METHOD} {route}`.
- Metrics for request count, errors, latency histogram.
- Context deadlines enforced.
- Recover middleware returns 500 with incident ID.
```

### Data Access Layer
```text
Implement a repository with database/sql + otelsql.
- Use prepared statements, ExecContext/QueryContext.
- Map sql.ErrNoRows to domain ErrNotFound.
- Explicit tx with rollback on error.
- Add benchmarks for hot path.
```

### Concurrency Patterns
```text
Worker pool:
- Bounded queue with back-pressure.
- Context cancels workers; drain and close cleanly.
- Metrics: in-flight, processed_total, error_total, queue_depth.
- Functional options for configuration.
- Table-driven tests with timeouts.
```

### Middleware Implementation
```text
Create HTTP middleware for:
- Request logging with structured fields
- Authentication/authorization with JWT
- Rate limiting with Redis backend
- CORS with configurable origins
- Request/response size limits
- Panic recovery with stack traces
```

### Event Handling
```text
Implement event publisher/subscriber:
- Use channels for in-process events
- Support multiple subscribers per event type
- Context cancellation for graceful shutdown
- Dead letter queue for failed events
- Metrics for event throughput and errors
- At-least-once delivery guarantees
```

### Configuration Loading
```text
Create config loader:
- Environment variables with defaults
- Support for .env files in development
- Validation with clear error messages
- Hot reload capability for non-critical settings
- Secrets management integration
- Configuration documentation generation
```

## Performance Standards

### Memory Management
```go
// Use sync.Pool for frequently allocated objects
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 0, 1024)
    },
}

func processData(data []byte) error {
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf[:0])
    
    // Use buf for processing
    return nil
}

// Avoid memory leaks in slices
func processLargeSlice(items []Item) []Result {
    // Don't keep reference to original slice
    results := make([]Result, 0, len(items))
    
    for _, item := range items {
        if result := processItem(item); result != nil {
            results = append(results, *result)
        }
    }
    
    return results
}
```

### Database Connection Management
```go
func configureDB(config DatabaseConfig) (*sql.DB, error) {
    db, err := sql.Open("postgres", config.URL)
    if err != nil {
        return nil, err
    }
    
    // Connection pool settings
    db.SetMaxOpenConns(config.MaxConnections)
    db.SetMaxIdleConns(config.MaxConnections / 2)
    db.SetConnMaxLifetime(config.ConnMaxLifetime)
    db.SetConnMaxIdleTime(config.MaxIdleTime)
    
    // Verify connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }
    
    return db, nil
}
```

## Security Standards

### Input Validation
```go
import (
    "github.com/go-playground/validator/v10"
    "github.com/google/uuid"
)

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email,max=255"`
    Name     string `json:"name" validate:"required,min=2,max=100"`
    Password string `json:"password" validate:"required,min=8,max=128"`
    Age      int    `json:"age" validate:"min=13,max=120"`
}

func (r CreateUserRequest) Validate() error {
    validate := validator.New()
    return validate.Struct(r)
}

// SQL injection prevention
func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
    const query = `SELECT id, email, name, created_at FROM users WHERE email = $1`
    
    row := r.db.QueryRowContext(ctx, query, email)
    
    var user User
    err := row.Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("failed to get user: %w", err)
    }
    
    return &user, nil
}
```

### Authentication & Authorization
```go
// JWT middleware
func JWTMiddleware(secret []byte) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := extractTokenFromHeader(r)
            if token == "" {
                http.Error(w, "missing authorization token", http.StatusUnauthorized)
                return
            }
            
            claims, err := validateJWT(token, secret)
            if err != nil {
                http.Error(w, "invalid token", http.StatusUnauthorized)
                return
            }
            
            // Add user context
            ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

// Rate limiting
func RateLimitMiddleware(store RateLimitStore, limit int, window time.Duration) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            key := getClientKey(r) // IP or user ID
            
            count, err := store.Increment(r.Context(), key, window)
            if err != nil {
                http.Error(w, "internal error", http.StatusInternalServerError)
                return
            }
            
            if count > limit {
                w.Header().Set("Retry-After", fmt.Sprintf("%.0f", window.Seconds()))
                http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```
