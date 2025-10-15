---
description: Comprehensive architectural patterns and design principles for building scalable, maintainable Go services with proper observability, API design, and event-driven patterns.
mode: design
model: 
tools: ["@workspace", "copilot-chat"]
inputVariables: ["service-scale", "architecture-style", "deployment-target"]
---

# Go Design & Architecture Standards
_Last updated: 2025-09-04 15:47_

# Go Design & Architecture Standards
_Last updated: 2025-09-04 15:47_

## Architectural Principles

### Clean Architecture in Go
```go
// Domain Layer - Core business logic, no external dependencies
package domain

type User struct {
    ID       string
    Email    string
    Name     string
    Status   UserStatus
    CreatedAt time.Time
}

type UserRepository interface {
    Save(ctx context.Context, user *User) error
    FindByID(ctx context.Context, id string) (*User, error)
    FindByEmail(ctx context.Context, email string) (*User, error)
}

type UserService interface {
    CreateUser(ctx context.Context, req CreateUserRequest) (*User, error)
    ActivateUser(ctx context.Context, userID string) error
}

// Application Layer - Use cases and business workflows
package application

type UserUseCase struct {
    repo      domain.UserRepository
    validator UserValidator
    publisher EventPublisher
}

func (uc *UserUseCase) CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    // Business logic orchestration
    if err := uc.validator.Validate(req); err != nil {
        return nil, fmt.Errorf("validation failed: %w", err)
    }
    
    user := domain.NewUser(req.Email, req.Name)
    
    if err := uc.repo.Save(ctx, user); err != nil {
        return nil, fmt.Errorf("failed to save user: %w", err)
    }
    
    // Publish domain event
    event := UserCreatedEvent{UserID: user.ID, Email: user.Email}
    uc.publisher.Publish(ctx, event)
    
    return user, nil
}

// Infrastructure Layer - External concerns
package repository

type PostgreSQLUserRepository struct {
    db *sql.DB
}

func (r *PostgreSQLUserRepository) Save(ctx context.Context, user *domain.User) error {
    // Database-specific implementation
}

// Presentation Layer - HTTP handlers
package handler

type UserHandler struct {
    useCase application.UserUseCase
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
    // HTTP-specific concerns
}
```

### Hexagonal Architecture (Ports & Adapters)
```go
// Port (interface defined by the core)
type PaymentGateway interface {
    ProcessPayment(ctx context.Context, req PaymentRequest) (*PaymentResult, error)
    RefundPayment(ctx context.Context, transactionID string) error
}

// Core business logic depends on port, not adapter
type OrderService struct {
    gateway PaymentGateway // Port
    repo    OrderRepository
}

// Adapter implementations
type StripeGateway struct {
    client *stripe.Client
    config StripeConfig
}

func (s *StripeGateway) ProcessPayment(ctx context.Context, req PaymentRequest) (*PaymentResult, error) {
    // Stripe-specific implementation
}

type MockGateway struct {
    responses map[string]*PaymentResult
}

func (m *MockGateway) ProcessPayment(ctx context.Context, req PaymentRequest) (*PaymentResult, error) {
    // Mock implementation for testing
}

// Dependency injection at startup
func NewOrderService(cfg Config) *OrderService {
    var gateway PaymentGateway
    
    switch cfg.PaymentProvider {
    case "stripe":
        gateway = NewStripeGateway(cfg.Stripe)
    case "mock":
        gateway = NewMockGateway()
    default:
        panic("unsupported payment provider")
    }
    
    return &OrderService{
        gateway: gateway,
        repo:    NewOrderRepository(cfg.Database),
    }
}
```

### Domain-Driven Design (DDD) Patterns
```go
// Value Objects - Immutable, behavior-rich
type Money struct {
    amount   int64  // Store as cents to avoid floating point issues
    currency string
}

func NewMoney(amount float64, currency string) (Money, error) {
    if amount < 0 {
        return Money{}, errors.New("amount cannot be negative")
    }
    if currency == "" {
        return Money{}, errors.New("currency is required")
    }
    
    return Money{
        amount:   int64(amount * 100), // Convert to cents
        currency: strings.ToUpper(currency),
    }, nil
}

func (m Money) Add(other Money) (Money, error) {
    if m.currency != other.currency {
        return Money{}, errors.New("cannot add different currencies")
    }
    
    return Money{
        amount:   m.amount + other.amount,
        currency: m.currency,
    }, nil
}

func (m Money) ToFloat() float64 {
    return float64(m.amount) / 100
}

// Aggregates - Consistency boundaries
type Order struct {
    id       OrderID
    userID   UserID
    items    []OrderItem
    total    Money
    status   OrderStatus
    version  int // For optimistic locking
}

func NewOrder(userID UserID) *Order {
    return &Order{
        id:     GenerateOrderID(),
        userID: userID,
        items:  make([]OrderItem, 0),
        status: OrderStatusPending,
        version: 1,
    }
}

func (o *Order) AddItem(productID ProductID, quantity int, price Money) error {
    if o.status != OrderStatusPending {
        return errors.New("cannot modify confirmed order")
    }
    
    item := OrderItem{
        ProductID: productID,
        Quantity:  quantity,
        Price:     price,
    }
    
    o.items = append(o.items, item)
    o.recalculateTotal()
    
    return nil
}

func (o *Order) Confirm() error {
    if len(o.items) == 0 {
        return errors.New("cannot confirm empty order")
    }
    
    o.status = OrderStatusConfirmed
    o.version++
    
    return nil
}

// Repository for Aggregate
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
    FindByID(ctx context.Context, id OrderID) (*Order, error)
    FindByUserID(ctx context.Context, userID UserID) ([]*Order, error)
}

// Domain Services - Business logic that doesn't belong to a single entity
type OrderPricingService struct {
    discountRules []DiscountRule
    taxCalculator TaxCalculator
}

func (s *OrderPricingService) CalculateTotal(order *Order, userType UserType) (Money, error) {
    subtotal := order.Subtotal()
    
    // Apply discounts
    discount := s.calculateDiscount(order, userType)
    discountedAmount, err := subtotal.Subtract(discount)
    if err != nil {
        return Money{}, err
    }
    
    // Calculate tax
    tax := s.taxCalculator.Calculate(discountedAmount, order.ShippingAddress())
    
    return discountedAmount.Add(tax)
}
```

## Service Design Patterns

### Microservice Communication Patterns
```go
// Service Registry Pattern
type ServiceRegistry interface {
    Register(ctx context.Context, service ServiceInfo) error
    Discover(ctx context.Context, serviceName string) ([]ServiceInstance, error)
    Deregister(ctx context.Context, serviceID string) error
}

type ServiceInfo struct {
    ID       string
    Name     string
    Version  string
    Address  string
    Port     int
    Health   string
    Metadata map[string]string
}

// Circuit Breaker Pattern
type CircuitBreaker struct {
    maxFailures  int
    resetTimeout time.Duration
    state        State
    failures     int
    lastFailTime time.Time
    mutex        sync.RWMutex
}

func (cb *CircuitBreaker) Call(ctx context.Context, fn func() error) error {
    cb.mutex.RLock()
    state := cb.state
    cb.mutex.RUnlock()
    
    if state == StateOpen {
        if time.Since(cb.lastFailTime) > cb.resetTimeout {
            cb.mutex.Lock()
            cb.state = StateHalfOpen
            cb.mutex.Unlock()
        } else {
            return ErrCircuitBreakerOpen
        }
    }
    
    err := fn()
    
    cb.mutex.Lock()
    defer cb.mutex.Unlock()
    
    if err != nil {
        cb.failures++
        cb.lastFailTime = time.Now()
        
        if cb.failures >= cb.maxFailures {
            cb.state = StateOpen
        }
        
        return err
    }
    
    // Success - reset circuit breaker
    cb.failures = 0
    cb.state = StateClosed
    
    return nil
}

// Retry Pattern with Exponential Backoff
type RetryConfig struct {
    MaxAttempts int
    BaseDelay   time.Duration
    MaxDelay    time.Duration
    Multiplier  float64
    Jitter      bool
}

func RetryWithBackoff(ctx context.Context, cfg RetryConfig, fn func() error) error {
    var lastErr error
    
    for attempt := 0; attempt < cfg.MaxAttempts; attempt++ {
        if attempt > 0 {
            delay := calculateDelay(cfg, attempt)
            
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(delay):
            }
        }
        
        if err := fn(); err != nil {
            lastErr = err
            continue
        }
        
        return nil
    }
    
    return fmt.Errorf("max attempts exceeded: %w", lastErr)
}

func calculateDelay(cfg RetryConfig, attempt int) time.Duration {
    delay := float64(cfg.BaseDelay) * math.Pow(cfg.Multiplier, float64(attempt-1))
    
    if cfg.Jitter {
        jitter := rand.Float64() * 0.1 * delay // 10% jitter
        delay += jitter
    }
    
    if time.Duration(delay) > cfg.MaxDelay {
        delay = float64(cfg.MaxDelay)
    }
    
    return time.Duration(delay)
}
```

### Event-Driven Architecture
```go
// Event Sourcing Pattern
type Event interface {
    EventType() string
    EventVersion() string
    OccurredAt() time.Time
    AggregateID() string
}

type UserCreatedEvent struct {
    ID        string    `json:"id"`
    UserID    string    `json:"user_id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    Timestamp time.Time `json:"timestamp"`
}

func (e UserCreatedEvent) EventType() string    { return "user.created" }
func (e UserCreatedEvent) EventVersion() string { return "v1" }
func (e UserCreatedEvent) OccurredAt() time.Time { return e.Timestamp }
func (e UserCreatedEvent) AggregateID() string   { return e.UserID }

// Event Store
type EventStore interface {
    SaveEvents(ctx context.Context, aggregateID string, events []Event, expectedVersion int) error
    LoadEvents(ctx context.Context, aggregateID string) ([]Event, error)
    LoadEventsFromVersion(ctx context.Context, aggregateID string, version int) ([]Event, error)
}

// Event Bus for Pub/Sub
type EventBus interface {
    Publish(ctx context.Context, event Event) error
    Subscribe(ctx context.Context, eventType string, handler EventHandler) error
}

type EventHandler func(ctx context.Context, event Event) error

// CQRS Pattern - Command and Query Responsibility Segregation
type Command interface {
    CommandType() string
    AggregateID() string
}

type Query interface {
    QueryType() string
}

// Command Side
type CreateUserCommand struct {
    UserID string
    Email  string
    Name   string
}

func (c CreateUserCommand) CommandType() string  { return "create_user" }
func (c CreateUserCommand) AggregateID() string  { return c.UserID }

type CommandHandler interface {
    Handle(ctx context.Context, cmd Command) error
}

// Query Side
type GetUserQuery struct {
    UserID string
}

func (q GetUserQuery) QueryType() string { return "get_user" }

type QueryHandler interface {
    Handle(ctx context.Context, query Query) (interface{}, error)
}

// Read Model (Projection)
type UserReadModel struct {
    ID        string    `json:"id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    Status    string    `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

type UserProjection struct {
    store ReadModelStore
}

func (p *UserProjection) Handle(ctx context.Context, event Event) error {
    switch e := event.(type) {
    case UserCreatedEvent:
        model := UserReadModel{
            ID:        e.UserID,
            Email:     e.Email,
            Name:      e.Name,
            Status:    "active",
            CreatedAt: e.Timestamp,
            UpdatedAt: e.Timestamp,
        }
        return p.store.Save(ctx, "users", e.UserID, model)
        
    case UserDeactivatedEvent:
        return p.store.Update(ctx, "users", e.UserID, map[string]interface{}{
            "status":     "inactive",
            "updated_at": e.Timestamp,
        })
        
    default:
        return nil // Ignore unknown events
    }
}
```

### Saga Pattern for Distributed Transactions
```go
// Saga Orchestrator Pattern
type OrderSaga struct {
    id    string
    state SagaState
    steps []SagaStep
}

type SagaStep struct {
    Name        string
    Action      func(ctx context.Context, data interface{}) error
    Compensation func(ctx context.Context, data interface{}) error
    Status      StepStatus
}

type SagaOrchestrator struct {
    eventBus EventBus
    storage  SagaStorage
}

func (o *SagaOrchestrator) Execute(ctx context.Context, saga *OrderSaga) error {
    for i, step := range saga.steps {
        if err := step.Action(ctx, saga); err != nil {
            // Execute compensations for completed steps
            for j := i - 1; j >= 0; j-- {
                if compErr := saga.steps[j].Compensation(ctx, saga); compErr != nil {
                    // Log compensation failure
                    slog.ErrorContext(ctx, "compensation failed",
                        "saga_id", saga.id,
                        "step", saga.steps[j].Name,
                        "error", compErr,
                    )
                }
            }
            return fmt.Errorf("saga failed at step %s: %w", step.Name, err)
        }
        
        step.Status = StepStatusCompleted
        o.storage.UpdateSaga(ctx, saga)
    }
    
    saga.state = SagaStateCompleted
    return o.storage.UpdateSaga(ctx, saga)
}

// Example: Order Processing Saga
func NewOrderProcessingSaga(orderID string) *OrderSaga {
    return &OrderSaga{
        id:    fmt.Sprintf("order-saga-%s", orderID),
        state: SagaStatePending,
        steps: []SagaStep{
            {
                Name: "reserve_inventory",
                Action: func(ctx context.Context, data interface{}) error {
                    return inventoryService.Reserve(ctx, orderID)
                },
                Compensation: func(ctx context.Context, data interface{}) error {
                    return inventoryService.Release(ctx, orderID)
                },
            },
            {
                Name: "process_payment",
                Action: func(ctx context.Context, data interface{}) error {
                    return paymentService.Charge(ctx, orderID)
                },
                Compensation: func(ctx context.Context, data interface{}) error {
                    return paymentService.Refund(ctx, orderID)
                },
            },
            {
                Name: "ship_order",
                Action: func(ctx context.Context, data interface{}) error {
                    return shippingService.Ship(ctx, orderID)
                },
                Compensation: func(ctx context.Context, data interface{}) error {
                    return shippingService.Cancel(ctx, orderID)
                },
            },
        },
    }
}
```

## API Design Standards

### RESTful API Design
```go
// Resource-based URLs with proper HTTP methods
// GET    /api/v1/users          - List users
// POST   /api/v1/users          - Create user
// GET    /api/v1/users/{id}     - Get user
// PUT    /api/v1/users/{id}     - Update user (full)
// PATCH  /api/v1/users/{id}     - Update user (partial)
// DELETE /api/v1/users/{id}     - Delete user

// Nested resources
// GET    /api/v1/users/{id}/orders     - Get user's orders
// POST   /api/v1/users/{id}/orders     - Create order for user

type APIResponse struct {
    Data   interface{} `json:"data,omitempty"`
    Error  *APIError   `json:"error,omitempty"`
    Meta   *Meta       `json:"meta,omitempty"`
}

type APIError struct {
    Type     string            `json:"type"`
    Title    string            `json:"title"`
    Detail   string            `json:"detail"`
    Status   int               `json:"status"`
    Instance string            `json:"instance"`
    Fields   map[string]string `json:"fields,omitempty"`
}

type Meta struct {
    RequestID   string     `json:"request_id"`
    Timestamp   time.Time  `json:"timestamp"`
    Pagination  *Pagination `json:"pagination,omitempty"`
}

type Pagination struct {
    Page       int `json:"page"`
    PageSize   int `json:"page_size"`
    TotalPages int `json:"total_pages"`
    TotalItems int `json:"total_items"`
}

// Error Response Handler
func WriteErrorResponse(w http.ResponseWriter, r *http.Request, err error) {
    var apiErr *APIError
    
    switch {
    case errors.Is(err, ErrUserNotFound):
        apiErr = &APIError{
            Type:     "https://example.com/errors/not-found",
            Title:    "Resource Not Found",
            Detail:   "The requested user was not found",
            Status:   http.StatusNotFound,
            Instance: r.URL.Path,
        }
    case errors.Is(err, ErrValidation):
        var validationErr ValidationError
        errors.As(err, &validationErr)
        apiErr = &APIError{
            Type:     "https://example.com/errors/validation",
            Title:    "Validation Error",
            Detail:   "Input validation failed",
            Status:   http.StatusBadRequest,
            Instance: r.URL.Path,
            Fields:   validationErr.Fields,
        }
    default:
        apiErr = &APIError{
            Type:     "https://example.com/errors/internal",
            Title:    "Internal Server Error",
            Detail:   "An unexpected error occurred",
            Status:   http.StatusInternalServerError,
            Instance: r.URL.Path,
        }
    }
    
    response := APIResponse{
        Error: apiErr,
        Meta: &Meta{
            RequestID: GetRequestID(r.Context()),
            Timestamp: time.Now(),
        },
    }
    
    w.Header().Set("Content-Type", "application/problem+json")
    w.WriteStatus(apiErr.Status)
    json.NewEncoder(w).Encode(response)
}
```

### GraphQL API Design
```go
import (
    "github.com/99designs/gqlgen/graphql/handler"
    "github.com/99designs/gqlgen/graphql/playground"
)

// Schema definition in schema.graphql
/*
type User {
  id: ID!
  email: String!
  name: String!
  orders: [Order!]!
  createdAt: Time!
}

type Order {
  id: ID!
  user: User!
  items: [OrderItem!]!
  total: Money!
  status: OrderStatus!
  createdAt: Time!
}

type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection!
  order(id: ID!): Order
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
}
*/

// Resolver implementation
type Resolver struct {
    userService  UserService
    orderService OrderService
}

func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
    user, err := r.userService.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }
    
    return &model.User{
        ID:        user.ID,
        Email:     user.Email,
        Name:      user.Name,
        CreatedAt: user.CreatedAt,
    }, nil
}

func (r *userResolver) Orders(ctx context.Context, obj *model.User) ([]*model.Order, error) {
    orders, err := r.orderService.GetOrdersByUserID(ctx, obj.ID)
    if err != nil {
        return nil, err
    }
    
    var result []*model.Order
    for _, order := range orders {
        result = append(result, &model.Order{
            ID:        order.ID,
            Total:     order.Total.ToFloat(),
            Status:    order.Status.String(),
            CreatedAt: order.CreatedAt,
        })
    }
    
    return result, nil
}

// DataLoader for N+1 query problem
func (r *Resolver) NewDataLoaders() *DataLoaders {
    return &DataLoaders{
        UserLoader: dataloader.NewBatchedLoader(r.batchUsers),
        OrderLoader: dataloader.NewBatchedLoader(r.batchOrders),
    }
}

func (r *Resolver) batchUsers(ctx context.Context, keys dataloader.Keys) []*dataloader.Result {
    userIDs := make([]string, len(keys))
    for i, key := range keys {
        userIDs[i] = key.String()
    }
    
    users, err := r.userService.GetUsersByIDs(ctx, userIDs)
    if err != nil {
        return dataloader.NewResultsWithError(len(keys), err)
    }
    
    userMap := make(map[string]*User)
    for _, user := range users {
        userMap[user.ID] = user
    }
    
    results := make([]*dataloader.Result, len(keys))
    for i, key := range keys {
        user, exists := userMap[key.String()]
        if exists {
            results[i] = &dataloader.Result{Data: user}
        } else {
            results[i] = &dataloader.Result{Error: ErrUserNotFound}
        }
    }
    
    return results
}
```

### API Versioning Strategy
```go
// URL Versioning
func setupRoutes() *chi.Mux {
    r := chi.NewRouter()
    
    // Version 1
    r.Route("/api/v1", func(r chi.Router) {
        r.Get("/users", v1.ListUsers)
        r.Post("/users", v1.CreateUser)
        r.Get("/users/{id}", v1.GetUser)
    })
    
    // Version 2 with backward compatibility
    r.Route("/api/v2", func(r chi.Router) {
        r.Get("/users", v2.ListUsers)
        r.Post("/users", v2.CreateUser)
        r.Get("/users/{id}", v2.GetUser)
        
        // New endpoints in v2
        r.Get("/users/{id}/profile", v2.GetUserProfile)
        r.Patch("/users/{id}/preferences", v2.UpdateUserPreferences)
    })
    
    return r
}

// Header Versioning
func VersionMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        version := r.Header.Get("API-Version")
        if version == "" {
            version = "v1" // Default version
        }
        
        ctx := context.WithValue(r.Context(), "api-version", version)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Version-aware response formatting
func FormatResponse(ctx context.Context, data interface{}) interface{} {
    version := ctx.Value("api-version").(string)
    
    switch version {
    case "v1":
        return formatV1Response(data)
    case "v2":
        return formatV2Response(data)
    default:
        return formatV1Response(data) // Fallback
    }
}
```

## Data Architecture Patterns

### Repository Pattern with Unit of Work
```go
// Unit of Work pattern for transaction management
type UnitOfWork interface {
    Users() UserRepository
    Orders() OrderRepository
    Commit(ctx context.Context) error
    Rollback(ctx context.Context) error
}

type SQLUnitOfWork struct {
    db           *sql.DB
    tx           *sql.Tx
    userRepo     UserRepository
    orderRepo    OrderRepository
    committed    bool
    rolledBack   bool
}

func NewUnitOfWork(db *sql.DB) *SQLUnitOfWork {
    return &SQLUnitOfWork{db: db}
}

func (uow *SQLUnitOfWork) Begin(ctx context.Context) error {
    tx, err := uow.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    
    uow.tx = tx
    uow.userRepo = NewSQLUserRepository(tx)
    uow.orderRepo = NewSQLOrderRepository(tx)
    
    return nil
}

func (uow *SQLUnitOfWork) Users() UserRepository {
    return uow.userRepo
}

func (uow *SQLUnitOfWork) Orders() OrderRepository {
    return uow.orderRepo
}

func (uow *SQLUnitOfWork) Commit(ctx context.Context) error {
    if uow.committed || uow.rolledBack {
        return errors.New("transaction already completed")
    }
    
    err := uow.tx.Commit()
    uow.committed = true
    return err
}

func (uow *SQLUnitOfWork) Rollback(ctx context.Context) error {
    if uow.committed || uow.rolledBack {
        return errors.New("transaction already completed")
    }
    
    err := uow.tx.Rollback()
    uow.rolledBack = true
    return err
}

// Usage in service layer
func (s *OrderService) CreateOrderWithItems(ctx context.Context, req CreateOrderRequest) (*Order, error) {
    uow := NewUnitOfWork(s.db)
    
    if err := uow.Begin(ctx); err != nil {
        return nil, err
    }
    defer func() {
        if !uow.committed {
            uow.Rollback(ctx)
        }
    }()
    
    // Create order
    order := NewOrder(req.UserID)
    if err := uow.Orders().Save(ctx, order); err != nil {
        return nil, err
    }
    
    // Add items
    for _, item := range req.Items {
        if err := order.AddItem(item.ProductID, item.Quantity, item.Price); err != nil {
            return nil, err
        }
    }
    
    // Update user's order count
    user, err := uow.Users().FindByID(ctx, req.UserID)
    if err != nil {
        return nil, err
    }
    
    user.IncrementOrderCount()
    if err := uow.Users().Save(ctx, user); err != nil {
        return nil, err
    }
    
    if err := uow.Commit(ctx); err != nil {
        return nil, err
    }
    
    return order, nil
}
```

### CQRS with Separate Read/Write Models
```go
// Command Model (Write Side)
type WriteUserRepository interface {
    Save(ctx context.Context, user *User) error
    Delete(ctx context.Context, userID string) error
}

// Query Model (Read Side)
type ReadUserRepository interface {
    FindByID(ctx context.Context, userID string) (*UserReadModel, error)
    FindByEmail(ctx context.Context, email string) (*UserReadModel, error)
    Search(ctx context.Context, query SearchQuery) ([]*UserReadModel, error)
}

// Write Model - Optimized for commands
type User struct {
    id       string
    email    string
    name     string
    status   UserStatus
    version  int
    events   []DomainEvent
}

// Read Model - Optimized for queries
type UserReadModel struct {
    ID              string    `json:"id"`
    Email           string    `json:"email"`
    Name            string    `json:"name"`
    Status          string    `json:"status"`
    OrderCount      int       `json:"order_count"`
    TotalSpent      float64   `json:"total_spent"`
    LastOrderDate   *time.Time `json:"last_order_date"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}

// Command Handler
type UserCommandHandler struct {
    writeRepo WriteUserRepository
    eventBus  EventBus
}

func (h *UserCommandHandler) Handle(ctx context.Context, cmd CreateUserCommand) error {
    user := NewUser(cmd.Email, cmd.Name)
    
    if err := h.writeRepo.Save(ctx, user); err != nil {
        return err
    }
    
    // Publish events for read model updates
    for _, event := range user.Events() {
        if err := h.eventBus.Publish(ctx, event); err != nil {
            return err
        }
    }
    
    return nil
}

// Query Handler
type UserQueryHandler struct {
    readRepo ReadUserRepository
}

func (h *UserQueryHandler) Handle(ctx context.Context, query GetUserQuery) (*UserReadModel, error) {
    return h.readRepo.FindByID(ctx, query.UserID)
}

// Event Handler for Read Model Updates
type UserReadModelUpdater struct {
    readRepo ReadUserRepository
}

func (u *UserReadModelUpdater) Handle(ctx context.Context, event DomainEvent) error {
    switch e := event.(type) {
    case UserCreatedEvent:
        model := &UserReadModel{
            ID:        e.UserID,
            Email:     e.Email,
            Name:      e.Name,
            Status:    "active",
            CreatedAt: e.Timestamp,
            UpdatedAt: e.Timestamp,
        }
        return u.readRepo.Save(ctx, model)
        
    case OrderCompletedEvent:
        return u.readRepo.UpdateOrderStats(ctx, e.UserID, e.Amount, e.Timestamp)
        
    default:
        return nil
    }
}
```

### Database Design Patterns
```go
// Database Connection Management
type DBManager struct {
    writeDB *sql.DB // Master database
    readDB  *sql.DB // Read replica
}

func (m *DBManager) Writer() *sql.DB {
    return m.writeDB
}

func (m *DBManager) Reader() *sql.DB {
    return m.readDB
}

// Repository with read/write splitting
type SQLUserRepository struct {
    dbManager *DBManager
}

func (r *SQLUserRepository) Save(ctx context.Context, user *User) error {
    db := r.dbManager.Writer() // Use write database
    const query = `
        INSERT INTO users (id, email, name, status, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at
    `
    
    _, err := db.ExecContext(ctx, query,
        user.ID, user.Email, user.Name, user.Status,
        user.Version, user.CreatedAt, user.UpdatedAt,
    )
    
    return err
}

func (r *SQLUserRepository) FindByID(ctx context.Context, userID string) (*User, error) {
    db := r.dbManager.Reader() // Use read database
    const query = `
        SELECT id, email, name, status, version, created_at, updated_at
        FROM users
        WHERE id = $1
    `
    
    var user User
    err := db.QueryRowContext(ctx, query, userID).Scan(
        &user.ID, &user.Email, &user.Name, &user.Status,
        &user.Version, &user.CreatedAt, &user.UpdatedAt,
    )
    
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrUserNotFound
        }
        return nil, err
    }
    
    return &user, nil
}

// Connection Pool Configuration
func NewDBManager(writeURL, readURL string) (*DBManager, error) {
    writeDB, err := sql.Open("postgres", writeURL)
    if err != nil {
        return nil, fmt.Errorf("failed to open write database: %w", err)
    }
    
    writeDB.SetMaxOpenConns(25)
    writeDB.SetMaxIdleConns(10)
    writeDB.SetConnMaxLifetime(time.Hour)
    writeDB.SetConnMaxIdleTime(15 * time.Minute)
    
    readDB, err := sql.Open("postgres", readURL)
    if err != nil {
        return nil, fmt.Errorf("failed to open read database: %w", err)
    }
    
    readDB.SetMaxOpenConns(50) // More connections for read replica
    readDB.SetMaxIdleConns(20)
    readDB.SetConnMaxLifetime(time.Hour)
    readDB.SetConnMaxIdleTime(15 * time.Minute)
    
    return &DBManager{
        writeDB: writeDB,
        readDB:  readDB,
    }, nil
}
```

## Event-Driven Architecture

### Outbox Pattern Implementation
```go
// Outbox table for transactional messaging
type OutboxEvent struct {
    ID          string    `db:"id"`
    AggregateID string    `db:"aggregate_id"`
    EventType   string    `db:"event_type"`
    EventData   []byte    `db:"event_data"`
    CreatedAt   time.Time `db:"created_at"`
    ProcessedAt *time.Time `db:"processed_at"`
}

type OutboxRepository interface {
    Save(ctx context.Context, tx *sql.Tx, event OutboxEvent) error
    GetUnprocessed(ctx context.Context, limit int) ([]OutboxEvent, error)
    MarkProcessed(ctx context.Context, eventID string) error
}

// Service with outbox pattern
func (s *UserService) CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil {
        return nil, err
    }
    defer tx.Rollback()
    
    // Create user in database
    user := NewUser(req.Email, req.Name)
    if err := s.userRepo.SaveWithTx(ctx, tx, user); err != nil {
        return nil, err
    }
    
    // Save event to outbox table
    eventData, _ := json.Marshal(UserCreatedEvent{
        UserID: user.ID,
        Email:  user.Email,
        Name:   user.Name,
    })
    
    outboxEvent := OutboxEvent{
        ID:          uuid.New().String(),
        AggregateID: user.ID,
        EventType:   "user.created",
        EventData:   eventData,
        CreatedAt:   time.Now(),
    }
    
    if err := s.outboxRepo.Save(ctx, tx, outboxEvent); err != nil {
        return nil, err
    }
    
    if err := tx.Commit(); err != nil {
        return nil, err
    }
    
    return user, nil
}

// Outbox Processor (separate process)
type OutboxProcessor struct {
    outboxRepo OutboxRepository
    eventBus   EventBus
    ticker     *time.Ticker
}

func (p *OutboxProcessor) Start(ctx context.Context) error {
    p.ticker = time.NewTicker(5 * time.Second)
    defer p.ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-p.ticker.C:
            if err := p.processEvents(ctx); err != nil {
                slog.ErrorContext(ctx, "failed to process outbox events", "error", err)
            }
        }
    }
}

func (p *OutboxProcessor) processEvents(ctx context.Context) error {
    events, err := p.outboxRepo.GetUnprocessed(ctx, 100)
    if err != nil {
        return err
    }
    
    for _, event := range events {
        if err := p.publishEvent(ctx, event); err != nil {
            slog.ErrorContext(ctx, "failed to publish event",
                "event_id", event.ID,
                "event_type", event.EventType,
                "error", err,
            )
            continue
        }
        
        if err := p.outboxRepo.MarkProcessed(ctx, event.ID); err != nil {
            slog.ErrorContext(ctx, "failed to mark event as processed",
                "event_id", event.ID,
                "error", err,
            )
        }
    }
    
    return nil
}
```

## Security Architecture

### Authentication and Authorization Framework
```go
// JWT-based authentication with refresh tokens
type TokenManager struct {
    accessSecret  []byte
    refreshSecret []byte
    accessTTL     time.Duration
    refreshTTL    time.Duration
}

type Claims struct {
    UserID      string   `json:"user_id"`
    Email       string   `json:"email"`
    Roles       []string `json:"roles"`
    Permissions []string `json:"permissions"`
    jwt.RegisteredClaims
}

func (tm *TokenManager) GenerateTokenPair(userID, email string, roles []string) (*TokenPair, error) {
    permissions := tm.getPermissionsForRoles(roles)
    
    // Access token (short-lived)
    accessClaims := Claims{
        UserID:      userID,
        Email:       email,
        Roles:       roles,
        Permissions: permissions,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(tm.accessTTL)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            Subject:   userID,
        },
    }
    
    accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
    accessString, err := accessToken.SignedString(tm.accessSecret)
    if err != nil {
        return nil, err
    }
    
    // Refresh token (long-lived)
    refreshClaims := jwt.RegisteredClaims{
        ExpiresAt: jwt.NewNumericDate(time.Now().Add(tm.refreshTTL)),
        IssuedAt:  jwt.NewNumericDate(time.Now()),
        Subject:   userID,
    }
    
    refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
    refreshString, err := refreshToken.SignedString(tm.refreshSecret)
    if err != nil {
        return nil, err
    }
    
    return &TokenPair{
        AccessToken:  accessString,
        RefreshToken: refreshString,
        ExpiresIn:    int(tm.accessTTL.Seconds()),
    }, nil
}

// Role-based access control (RBAC)
type Permission string

const (
    PermissionReadUsers   Permission = "users:read"
    PermissionWriteUsers  Permission = "users:write"
    PermissionDeleteUsers Permission = "users:delete"
    PermissionReadOrders  Permission = "orders:read"
    PermissionWriteOrders Permission = "orders:write"
)

type Role struct {
    Name        string
    Permissions []Permission
}

var Roles = map[string]Role{
    "admin": {
        Name: "admin",
        Permissions: []Permission{
            PermissionReadUsers, PermissionWriteUsers, PermissionDeleteUsers,
            PermissionReadOrders, PermissionWriteOrders,
        },
    },
    "user": {
        Name: "user",
        Permissions: []Permission{
            PermissionReadUsers, PermissionReadOrders,
        },
    },
}

// Authorization middleware
func RequirePermission(permission Permission) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims, ok := r.Context().Value("claims").(*Claims)
            if !ok {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }
            
            if !hasPermission(claims.Permissions, permission) {
                http.Error(w, "forbidden", http.StatusForbidden)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}

func hasPermission(userPermissions []string, required Permission) bool {
    for _, perm := range userPermissions {
        if perm == string(required) {
            return true
        }
    }
    return false
}

// Resource-based authorization
func RequireResourceAccess(resourceType string, getResourceID func(*http.Request) string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims, ok := r.Context().Value("claims").(*Claims)
            if !ok {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }
            
            resourceID := getResourceID(r)
            
            // Check if user can access this specific resource
            if !canAccessResource(claims.UserID, resourceType, resourceID) {
                http.Error(w, "forbidden", http.StatusForbidden)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}

// Usage example
func setupProtectedRoutes() *chi.Mux {
    r := chi.NewRouter()
    
    r.Use(JWTMiddleware)
    
    // Require specific permission
    r.With(RequirePermission(PermissionReadUsers)).Get("/users", listUsers)
    r.With(RequirePermission(PermissionWriteUsers)).Post("/users", createUser)
    
    // Resource-based access control
    r.With(RequireResourceAccess("user", func(r *http.Request) string {
        return chi.URLParam(r, "userID")
    })).Get("/users/{userID}/profile", getUserProfile)
    
    return r
}
```

### Message Queue Integration
```go
// Message Queue abstraction
type MessageQueue interface {
    Publish(ctx context.Context, topic string, message []byte) error
    Subscribe(ctx context.Context, topic string, handler MessageHandler) error
    Close() error
}

type MessageHandler func(ctx context.Context, message []byte) error

// RabbitMQ implementation
type RabbitMQQueue struct {
    conn    *amqp.Connection
    channel *amqp.Channel
}

func (q *RabbitMQQueue) Publish(ctx context.Context, topic string, message []byte) error {
    return q.channel.Publish(
        "",    // exchange
        topic, // routing key
        false, // mandatory
        false, // immediate
        amqp.Publishing{
            ContentType: "application/json",
            Body:        message,
        },
    )
}

func (q *RabbitMQQueue) Subscribe(ctx context.Context, topic string, handler MessageHandler) error {
    msgs, err := q.channel.Consume(
        topic, // queue
        "",    // consumer
        false, // auto-ack
        false, // exclusive
        false, // no-local
        false, // no-wait
        nil,   // args
    )
    if err != nil {
        return err
    }
    
    go func() {
        for {
            select {
            case <-ctx.Done():
                return
            case msg := <-msgs:
                if err := handler(ctx, msg.Body); err != nil {
                    msg.Nack(false, true) // Requeue on error
                } else {
                    msg.Ack(false)
                }
            }
        }
    }()
    
    return nil
}

// Event Handler with retry logic
type EventProcessor struct {
    queue       MessageQueue
    maxRetries  int
    retryDelay  time.Duration
}

func (p *EventProcessor) ProcessUserEvents(ctx context.Context, message []byte) error {
    var envelope EventEnvelope
    if err := json.Unmarshal(message, &envelope); err != nil {
        return fmt.Errorf("failed to unmarshal event: %w", err)
    }
    
    return p.retryWithBackoff(ctx, func() error {
        switch envelope.EventType {
        case "user.created":
            return p.handleUserCreated(ctx, envelope.Data)
        case "user.updated":
            return p.handleUserUpdated(ctx, envelope.Data)
        default:
            return nil // Ignore unknown events
        }
    })
}

func (p *EventProcessor) retryWithBackoff(ctx context.Context, fn func() error) error {
    var lastErr error
    
    for attempt := 0; attempt <= p.maxRetries; attempt++ {
        if attempt > 0 {
            delay := time.Duration(attempt) * p.retryDelay
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(delay):
            }
        }
        
        if err := fn(); err != nil {
            lastErr = err
            continue
        }
        
        return nil
    }
    
    return fmt.Errorf("max retries exceeded: %w", lastErr)
}
```
