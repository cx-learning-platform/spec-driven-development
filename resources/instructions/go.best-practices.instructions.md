---
description: Comprehensive Go best practices covering naming conventions, error handling, concurrency patterns, performance optimization, and idiomatic Go code style with practical examples.
mode: reference
model: 
tools: ["copilot-chat"]
inputVariables: ["go-version", "code-review-focus", "team-guidelines"]
---

# Go Best Practices & Style Guide
_Last updated: 2025-09-04 15:47_

# Go Best Practices & Style Guide
_Last updated: 2025-09-04 15:47_

## Naming Conventions

### Package Names
```go
// Good: Short, descriptive, lowercase
package user
package httputil
package stringutil

// Bad: Underscores, mixed case, generic names
package user_service
package httpUtil
package utils
```

### Variable and Function Names
```go
// Good: Clear, concise names
var userCount int
var maxRetries = 3

func GetUser(id string) (*User, error) { }
func ParseConfigFile(filename string) (*Config, error) { }

// Bad: Abbreviated or unclear names
var usrCnt int
var mr = 3

func GetUsrData(i string) (*User, error) { }
func PrcCfgFl(fn string) (*Config, error) { }

// Constants: Use camelCase, not ALL_CAPS
const (
    MaxRetries = 3
    DefaultTimeout = 30 * time.Second
)

// Exception: When mimicking external constants
const (
    HTTP_GET  = "GET"  // When matching HTTP spec
    HTTP_POST = "POST"
)
```

### Interface Names
```go
// Good: Single method interfaces end with -er
type Reader interface {
    Read([]byte) (int, error)
}

type Writer interface {
    Write([]byte) (int, error)
}

type UserFinder interface {
    FindUser(id string) (*User, error)
}

// Good: Multi-method interfaces are descriptive
type UserRepository interface {
    Create(user *User) error
    FindByID(id string) (*User, error)
    Update(user *User) error
    Delete(id string) error
}

// Bad: Generic Interface suffix
type UserRepositoryInterface interface {
    Create(user *User) error
}
```

### Receiver Names
```go
// Good: Consistent, short receiver names
type User struct {
    ID   string
    Name string
}

func (u *User) SetName(name string) {
    u.Name = name
}

func (u *User) GetID() string {
    return u.ID
}

// Bad: Inconsistent or verbose receiver names
func (user *User) SetName(name string) {
    user.Name = name
}

func (this *User) GetID() string {
    return this.ID
}
```

## Function and Method Design

### Function Parameters and Return Values
```go
// Good: Context first, options last
func ProcessOrder(ctx context.Context, orderID string, opts ...ProcessOption) error {
    // Implementation
}

// Good: Named return values for complex functions
func ParseUserData(data []byte) (user *User, metadata *Metadata, err error) {
    if len(data) == 0 {
        err = errors.New("empty data")
        return
    }
    // Implementation
    return
}

// Good: Return early to reduce nesting
func ValidateUser(user *User) error {
    if user == nil {
        return errors.New("user cannot be nil")
    }
    
    if user.Email == "" {
        return errors.New("email is required")
    }
    
    if !isValidEmail(user.Email) {
        return errors.New("invalid email format")
    }
    
    return nil
}

// Bad: Deep nesting
func ValidateUserBad(user *User) error {
    if user != nil {
        if user.Email != "" {
            if isValidEmail(user.Email) {
                return nil
            } else {
                return errors.New("invalid email format")
            }
        } else {
            return errors.New("email is required")
        }
    } else {
        return errors.New("user cannot be nil")
    }
}
```

### Method Receivers
```go
type Cache struct {
    data map[string]interface{}
    mu   sync.RWMutex
}

// Pointer receiver: Method modifies the receiver
func (c *Cache) Set(key string, value interface{}) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}

// Pointer receiver: Large struct (avoid copying)
func (c *Cache) Clear() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data = make(map[string]interface{})
}

// Value receiver: Small, immutable data
type Point struct {
    X, Y float64
}

func (p Point) Distance(other Point) float64 {
    dx := p.X - other.X
    dy := p.Y - other.Y
    return math.Sqrt(dx*dx + dy*dy)
}

// Consistency: Use pointer receivers for all methods if any method needs it
type User struct {
    ID   string
    Name string
    age  int
}

func (u *User) SetName(name string) { u.Name = name }
func (u *User) SetAge(age int)      { u.age = age }
func (u *User) GetName() string     { return u.Name } // Consistent with other methods
```

### Defer Usage
```go
// Good: Defer immediately after acquiring resource
func ProcessFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer file.Close() // Defer immediately
    
    // Process file
    return nil
}

// Good: Defer for cleanup in loops
func ProcessFiles(filenames []string) error {
    for _, filename := range filenames {
        func() error {
            file, err := os.Open(filename)
            if err != nil {
                return err
            }
            defer file.Close() // Defer in anonymous function
            
            // Process file
            return nil
        }()
    }
    return nil
}

// Good: Defer with error handling
func WriteToFile(filename string, data []byte) (err error) {
    file, err := os.Create(filename)
    if err != nil {
        return err
    }
    
    defer func() {
        if closeErr := file.Close(); closeErr != nil && err == nil {
            err = closeErr
        }
    }()
    
    _, err = file.Write(data)
    return err
}
```

## Error Handling Best Practices

### Error Types and Patterns
```go
// Sentinel errors for common cases
var (
    ErrUserNotFound    = errors.New("user not found")
    ErrInvalidInput    = errors.New("invalid input")
    ErrUnauthorized    = errors.New("unauthorized access")
    ErrServiceUnavailable = errors.New("service unavailable")
)

// Custom error types for rich error information
type ValidationError struct {
    Field   string
    Message string
    Value   interface{}
}

func (e ValidationError) Error() string {
    return fmt.Sprintf("validation failed for field %s: %s", e.Field, e.Message)
}

type NetworkError struct {
    Op   string
    URL  string
    Err  error
    Code int
}

func (e NetworkError) Error() string {
    return fmt.Sprintf("network error during %s to %s: %v (status: %d)", e.Op, e.URL, e.Err, e.Code)
}

func (e NetworkError) Unwrap() error {
    return e.Err
}

// Temporary interface for retry logic
func (e NetworkError) Temporary() bool {
    return e.Code >= 500 && e.Code < 600
}
```

### Error Handling Patterns
```go
// Good: Error wrapping with context
func GetUserFromAPI(ctx context.Context, userID string) (*User, error) {
    resp, err := httpClient.Get(ctx, "/users/"+userID)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch user %s: %w", userID, err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode == 404 {
        return nil, ErrUserNotFound
    }
    
    if resp.StatusCode >= 400 {
        return nil, NetworkError{
            Op:   "GET",
            URL:  "/users/" + userID,
            Code: resp.StatusCode,
            Err:  fmt.Errorf("HTTP %d", resp.StatusCode),
        }
    }
    
    var user User
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
        return nil, fmt.Errorf("failed to decode user response: %w", err)
    }
    
    return &user, nil
}

// Good: Error checking patterns
func ProcessUser(userID string) error {
    user, err := GetUserFromAPI(context.Background(), userID)
    if err != nil {
        // Check for specific error types
        var netErr NetworkError
        if errors.As(err, &netErr) && netErr.Temporary() {
            return fmt.Errorf("temporary network error, retry later: %w", err)
        }
        
        // Check for sentinel errors
        if errors.Is(err, ErrUserNotFound) {
            return fmt.Errorf("user %s does not exist: %w", userID, err)
        }
        
        return fmt.Errorf("unexpected error processing user: %w", err)
    }
    
    // Process user
    return nil
}

// Error aggregation for multiple operations
type MultiError struct {
    Errors []error
}

func (m MultiError) Error() string {
    if len(m.Errors) == 0 {
        return "no errors"
    }
    
    if len(m.Errors) == 1 {
        return m.Errors[0].Error()
    }
    
    return fmt.Sprintf("multiple errors: %s (and %d more)", m.Errors[0].Error(), len(m.Errors)-1)
}

func (m MultiError) Unwrap() []error {
    return m.Errors
}

func ProcessMultipleUsers(userIDs []string) error {
    var multiErr MultiError
    
    for _, userID := range userIDs {
        if err := ProcessUser(userID); err != nil {
            multiErr.Errors = append(multiErr.Errors, err)
        }
    }
    
    if len(multiErr.Errors) > 0 {
        return multiErr
    }
    
    return nil
}
```

## Concurrency Best Practices

### Goroutine Management
```go
// Good: Bounded goroutines with worker pool
func ProcessItemsConcurrently(items []Item) error {
    const numWorkers = 10
    itemCh := make(chan Item, len(items))
    resultCh := make(chan error, len(items))
    
    // Start workers
    for i := 0; i < numWorkers; i++ {
        go func() {
            for item := range itemCh {
                resultCh <- processItem(item)
            }
        }()
    }
    
    // Send items
    for _, item := range items {
        itemCh <- item
    }
    close(itemCh)
    
    // Collect results
    var firstErr error
    for i := 0; i < len(items); i++ {
        if err := <-resultCh; err != nil && firstErr == nil {
            firstErr = err
        }
    }
    
    return firstErr
}

// Good: Context-aware goroutines
func ProcessWithTimeout(ctx context.Context, items []Item) error {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
    defer cancel()
    
    resultCh := make(chan error, 1)
    
    go func() {
        defer close(resultCh)
        
        for _, item := range items {
            select {
            case <-ctx.Done():
                resultCh <- ctx.Err()
                return
            default:
                if err := processItem(item); err != nil {
                    resultCh <- err
                    return
                }
            }
        }
    }()
    
    select {
    case err := <-resultCh:
        return err
    case <-ctx.Done():
        return ctx.Err()
    }
}

// Good: Graceful shutdown pattern
type Server struct {
    httpServer *http.Server
    workers    []Worker
    shutdown   chan struct{}
    wg         sync.WaitGroup
}

func (s *Server) Start() error {
    // Start workers
    for _, worker := range s.workers {
        s.wg.Add(1)
        go func(w Worker) {
            defer s.wg.Done()
            w.Run(s.shutdown)
        }(worker)
    }
    
    // Start HTTP server
    return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
    // Signal shutdown
    close(s.shutdown)
    
    // Shutdown HTTP server
    if err := s.httpServer.Shutdown(ctx); err != nil {
        return err
    }
    
    // Wait for workers with timeout
    done := make(chan struct{})
    go func() {
        s.wg.Wait()
        close(done)
    }()
    
    select {
    case <-done:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

### Channel Patterns
```go
// Producer-consumer with buffered channel
func ProducerConsumer() {
    const bufferSize = 100
    dataCh := make(chan Data, bufferSize)
    
    // Producer
    go func() {
        defer close(dataCh)
        for i := 0; i < 1000; i++ {
            dataCh <- generateData(i)
        }
    }()
    
    // Consumer
    go func() {
        for data := range dataCh {
            processData(data)
        }
    }()
}

// Fan-out fan-in pattern
func FanOutFanIn(input <-chan Task) <-chan Result {
    const numWorkers = 5
    
    // Fan-out
    results := make([]<-chan Result, numWorkers)
    for i := 0; i < numWorkers; i++ {
        resultCh := make(chan Result)
        results[i] = resultCh
        
        go func(out chan<- Result) {
            defer close(out)
            for task := range input {
                out <- processTask(task)
            }
        }(resultCh)
    }
    
    // Fan-in
    return merge(results...)
}

func merge(inputs ...<-chan Result) <-chan Result {
    out := make(chan Result)
    var wg sync.WaitGroup
    
    wg.Add(len(inputs))
    for _, input := range inputs {
        go func(ch <-chan Result) {
            defer wg.Done()
            for result := range ch {
                out <- result
            }
        }(input)
    }
    
    go func() {
        wg.Wait()
        close(out)
    }()
    
    return out
}

// Pipeline pattern
func Pipeline(input <-chan Data) <-chan Result {
    // Stage 1: Validate
    validated := make(chan Data)
    go func() {
        defer close(validated)
        for data := range input {
            if isValid(data) {
                validated <- data
            }
        }
    }()
    
    // Stage 2: Transform
    transformed := make(chan Data)
    go func() {
        defer close(transformed)
        for data := range validated {
            transformed <- transform(data)
        }
    }()
    
    // Stage 3: Process
    results := make(chan Result)
    go func() {
        defer close(results)
        for data := range transformed {
            results <- process(data)
        }
    }()
    
    return results
}
```

### Synchronization Patterns
```go
// RWMutex for read-heavy workloads
type Cache struct {
    data map[string]interface{}
    mu   sync.RWMutex
}

func (c *Cache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    value, exists := c.data[key]
    return value, exists
}

func (c *Cache) Set(key string, value interface{}) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}

// Once for expensive initialization
type ExpensiveResource struct {
    data interface{}
    once sync.Once
    err  error
}

func (r *ExpensiveResource) Get() (interface{}, error) {
    r.once.Do(func() {
        r.data, r.err = initializeExpensiveResource()
    })
    return r.data, r.err
}

// WaitGroup for coordinating goroutines
func ProcessConcurrently(items []Item) error {
    var wg sync.WaitGroup
    errorCh := make(chan error, len(items))
    
    for _, item := range items {
        wg.Add(1)
        go func(item Item) {
            defer wg.Done()
            if err := processItem(item); err != nil {
                errorCh <- err
            }
        }(item)
    }
    
    // Wait for all goroutines to complete
    go func() {
        wg.Wait()
        close(errorCh)
    }()
    
    // Return first error encountered
    for err := range errorCh {
        if err != nil {
            return err
        }
    }
    
    return nil
}
```

## Collections and Data Structures

### Slice Best Practices
```go
// Good: Preallocate slices when size is known
func ProcessUsers(users []User) []ProcessedUser {
    results := make([]ProcessedUser, 0, len(users)) // Preallocate capacity
    
    for _, user := range users {
        if processed := processUser(user); processed != nil {
            results = append(results, *processed)
        }
    }
    
    return results
}

// Good: Avoid slice memory leaks
func FindFirstN(items []Item, n int) []Item {
    found := make([]Item, 0, n)
    
    for _, item := range items {
        if matchesCriteria(item) {
            found = append(found, item)
            if len(found) >= n {
                break
            }
        }
    }
    
    // Return copy to avoid holding reference to large slice
    result := make([]Item, len(found))
    copy(result, found)
    return result
}

// Good: Safe slice operations
func SafeSliceOperations() {
    // Check bounds before access
    slice := []int{1, 2, 3, 4, 5}
    
    if len(slice) > 2 {
        value := slice[2] // Safe access
        fmt.Println(value)
    }
    
    // Use range for iteration (avoids bounds checking)
    for i, v := range slice {
        fmt.Printf("Index: %d, Value: %d\n", i, v)
    }
    
    // Safe subslicing
    if len(slice) >= 3 {
        subSlice := slice[1:3] // Safe subslice
        fmt.Println(subSlice)
    }
}

// Efficient slice deletion
func DeleteElement(slice []Item, index int) []Item {
    if index < 0 || index >= len(slice) {
        return slice
    }
    
    // For preserving order
    return append(slice[:index], slice[index+1:]...)
    
    // For when order doesn't matter (more efficient)
    // slice[index] = slice[len(slice)-1]
    // return slice[:len(slice)-1]
}
```

### Map Best Practices
```go
// Good: Check map existence
func SafeMapAccess() {
    m := map[string]int{
        "apple":  5,
        "banana": 3,
    }
    
    // Check existence
    value, exists := m["apple"]
    if exists {
        fmt.Printf("Apple count: %d\n", value)
    }
    
    // Zero value handling
    count := m["orange"] // Returns 0 for missing keys
    fmt.Printf("Orange count: %d\n", count)
    
    // Safe deletion
    delete(m, "banana") // Safe even if key doesn't exist
}

// Good: Concurrent map access
type SafeMap struct {
    data map[string]interface{}
    mu   sync.RWMutex
}

func (sm *SafeMap) Get(key string) (interface{}, bool) {
    sm.mu.RLock()
    defer sm.mu.RUnlock()
    value, exists := sm.data[key]
    return value, exists
}

func (sm *SafeMap) Set(key string, value interface{}) {
    sm.mu.Lock()
    defer sm.mu.Unlock()
    sm.data[key] = value
}

func (sm *SafeMap) Delete(key string) {
    sm.mu.Lock()
    defer sm.mu.Unlock()
    delete(sm.data, key)
}

// Good: Map initialization patterns
func MapInitialization() {
    // Initialize with known size
    m := make(map[string]int, 100) // Hint for capacity
    
    // Map literal for known values
    statusCodes := map[string]int{
        "OK":                    200,
        "NOT_FOUND":            404,
        "INTERNAL_SERVER_ERROR": 500,
    }
    
    // Copy map to avoid mutation
    copied := make(map[string]int, len(statusCodes))
    for k, v := range statusCodes {
        copied[k] = v
    }
}
```

### String Operations
```go
// Good: Efficient string building
func BuildString(parts []string) string {
    var builder strings.Builder
    builder.Grow(estimateSize(parts)) // Pre-allocate if size is known
    
    for i, part := range parts {
        if i > 0 {
            builder.WriteString(", ")
        }
        builder.WriteString(part)
    }
    
    return builder.String()
}

// Good: String comparison and formatting
func StringOperations() {
    // Use strings.EqualFold for case-insensitive comparison
    if strings.EqualFold("Hello", "HELLO") {
        fmt.Println("Case-insensitive match")
    }
    
    // Efficient string contains check
    if strings.Contains(text, "substring") {
        // Process
    }
    
    // Use fmt.Sprintf judiciously (it's slower than string concatenation for simple cases)
    // Good for complex formatting
    message := fmt.Sprintf("User %s has %d orders with total $%.2f", name, count, total)
    
    // For simple concatenation, use + or strings.Builder
    simple := "Hello, " + name + "!"
}

// Good: String validation
func ValidateString(s string) error {
    s = strings.TrimSpace(s)
    
    if s == "" {
        return errors.New("string cannot be empty")
    }
    
    if len(s) > 255 {
        return errors.New("string too long")
    }
    
    // Use regex sparingly and compile once
    if !emailRegex.MatchString(s) {
        return errors.New("invalid email format")
    }
    
    return nil
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
```

## Testing Best Practices

### Test Structure and Organization
```go
// Good: Table-driven tests
func TestUserValidation(t *testing.T) {
    tests := []struct {
        name    string
        user    User
        wantErr bool
        errMsg  string
    }{
        {
            name: "valid user",
            user: User{
                ID:    "123",
                Email: "user@example.com",
                Name:  "John Doe",
            },
            wantErr: false,
        },
        {
            name: "empty email",
            user: User{
                ID:   "123",
                Name: "John Doe",
            },
            wantErr: true,
            errMsg:  "email is required",
        },
        {
            name: "invalid email format",
            user: User{
                ID:    "123",
                Email: "invalid-email",
                Name:  "John Doe",
            },
            wantErr: true,
            errMsg:  "invalid email format",
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateUser(&tt.user)
            
            if tt.wantErr {
                assert.Error(t, err)
                if tt.errMsg != "" {
                    assert.Contains(t, err.Error(), tt.errMsg)
                }
            } else {
                assert.NoError(t, err)
            }
        })
    }
}

// Good: Test helpers and setup
func TestUserService(t *testing.T) {
    // Common setup
    db := setupTestDB(t)
    defer cleanupTestDB(t, db)
    
    repo := NewUserRepository(db)
    service := NewUserService(repo, NewValidator())
    
    t.Run("CreateUser", func(t *testing.T) {
        user, err := service.CreateUser(context.Background(), CreateUserRequest{
            Email: "test@example.com",
            Name:  "Test User",
        })
        
        require.NoError(t, err)
        assert.NotEmpty(t, user.ID)
        assert.Equal(t, "test@example.com", user.Email)
    })
    
    t.Run("CreateUser_DuplicateEmail", func(t *testing.T) {
        // First user
        _, err := service.CreateUser(context.Background(), CreateUserRequest{
            Email: "duplicate@example.com",
            Name:  "User 1",
        })
        require.NoError(t, err)
        
        // Duplicate email
        _, err = service.CreateUser(context.Background(), CreateUserRequest{
            Email: "duplicate@example.com",
            Name:  "User 2",
        })
        
        assert.Error(t, err)
        assert.True(t, errors.Is(err, ErrEmailExists))
    })
}

// Test helpers
func setupTestDB(t *testing.T) *sql.DB {
    t.Helper()
    
    db, err := sql.Open("sqlite3", ":memory:")
    require.NoError(t, err)
    
    // Run migrations
    require.NoError(t, runMigrations(db))
    
    return db
}

func cleanupTestDB(t *testing.T, db *sql.DB) {
    t.Helper()
    require.NoError(t, db.Close())
}
```

### Mocking and Test Doubles
```go
// Good: Interface-based mocking
type UserRepository interface {
    Create(ctx context.Context, user *User) error
    FindByID(ctx context.Context, id string) (*User, error)
}

type MockUserRepository struct {
    users map[string]*User
    mu    sync.RWMutex
}

func NewMockUserRepository() *MockUserRepository {
    return &MockUserRepository{
        users: make(map[string]*User),
    }
}

func (m *MockUserRepository) Create(ctx context.Context, user *User) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    
    if _, exists := m.users[user.Email]; exists {
        return ErrEmailExists
    }
    
    m.users[user.ID] = user
    return nil
}

func (m *MockUserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    
    for _, user := range m.users {
        if user.ID == id {
            return user, nil
        }
    }
    
    return nil, ErrUserNotFound
}

// Usage in tests
func TestUserService_WithMock(t *testing.T) {
    mockRepo := NewMockUserRepository()
    service := NewUserService(mockRepo, NewValidator())
    
    // Test with controlled mock behavior
    user, err := service.CreateUser(context.Background(), CreateUserRequest{
        Email: "test@example.com",
        Name:  "Test User",
    })
    
    require.NoError(t, err)
    assert.NotNil(t, user)
    
    // Verify mock state
    found, err := mockRepo.FindByID(context.Background(), user.ID)
    require.NoError(t, err)
    assert.Equal(t, user.Email, found.Email)
}
```

### Benchmark Tests
```go
// Good: Benchmark tests
func BenchmarkStringConcatenation(b *testing.B) {
    tests := []struct {
        name string
        fn   func(parts []string) string
    }{
        {"StringBuilder", buildStringWithBuilder},
        {"Concatenation", buildStringWithConcat},
        {"Sprintf", buildStringWithSprintf},
    }
    
    parts := []string{"Hello", "World", "From", "Go", "Benchmarks"}
    
    for _, tt := range tests {
        b.Run(tt.name, func(b *testing.B) {
            for i := 0; i < b.N; i++ {
                _ = tt.fn(parts)
            }
        })
    }
}

func buildStringWithBuilder(parts []string) string {
    var builder strings.Builder
    for _, part := range parts {
        builder.WriteString(part)
    }
    return builder.String()
}

func buildStringWithConcat(parts []string) string {
    result := ""
    for _, part := range parts {
        result += part
    }
    return result
}

func buildStringWithSprintf(parts []string) string {
    return fmt.Sprintf("%s%s%s%s%s", parts[0], parts[1], parts[2], parts[3], parts[4])
}

// Memory allocation benchmarks
func BenchmarkSliceAppend(b *testing.B) {
    b.Run("WithPrealloc", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            slice := make([]int, 0, 1000) // Preallocated
            for j := 0; j < 1000; j++ {
                slice = append(slice, j)
            }
        }
    })
    
    b.Run("WithoutPrealloc", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            var slice []int // No preallocation
            for j := 0; j < 1000; j++ {
                slice = append(slice, j)
            }
        }
    })
}
```

## Performance Optimization

### Memory Management
```go
// Good: Object pooling for frequently allocated objects
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 0, 1024)
    },
}

func ProcessData(data []byte) ([]byte, error) {
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf[:0]) // Reset length but keep capacity
    
    // Use buf for processing
    buf = append(buf, processedData...)
    
    // Return copy since we're returning the buffer to pool
    result := make([]byte, len(buf))
    copy(result, buf)
    
    return result, nil
}

// Good: Avoiding allocations in hot paths
func FastStringCheck(s string) bool {
    // Use direct comparison instead of regex when possible
    return len(s) > 0 && s[0] == 'A'
}

func SlowStringCheck(s string) bool {
    // Regex compilation happens every call
    matched, _ := regexp.MatchString("^A", s)
    return matched
}

// Compile regex once
var startsWithA = regexp.MustCompile("^A")

func BetterStringCheck(s string) bool {
    return startsWithA.MatchString(s)
}

// Good: Efficient struct field ordering (consider alignment)
type EfficientStruct struct {
    // Group fields by size for better memory layout
    ID       int64  // 8 bytes
    Amount   int64  // 8 bytes
    Active   bool   // 1 byte
    Status   byte   // 1 byte
    Priority int16  // 2 bytes
    // 4 bytes padding here for alignment
    Name     string // 16 bytes (pointer + length)
}

// Bad: Poor field ordering wastes memory
type InefficientStruct struct {
    Active   bool   // 1 byte + 7 bytes padding
    ID       int64  // 8 bytes
    Priority int16  // 2 bytes + 6 bytes padding
    Amount   int64  // 8 bytes
    Status   byte   // 1 byte + 7 bytes padding
    Name     string // 16 bytes
}
```

### I/O Optimization
```go
// Good: Buffered I/O for better performance
func ReadFileEfficiently(filename string) ([]string, error) {
    file, err := os.Open(filename)
    if err != nil {
        return nil, err
    }
    defer file.Close()
    
    // Use buffered reader for better performance
    scanner := bufio.NewScanner(file)
    scanner.Buffer(make([]byte, 64*1024), 1024*1024) // Custom buffer size
    
    var lines []string
    for scanner.Scan() {
        lines = append(lines, scanner.Text())
    }
    
    return lines, scanner.Err()
}

// Good: Batch operations
func WriteDataBatch(db *sql.DB, users []User) error {
    tx, err := db.Begin()
    if err != nil {
        return err
    }
    defer tx.Rollback()
    
    stmt, err := tx.Prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)")
    if err != nil {
        return err
    }
    defer stmt.Close()
    
    for _, user := range users {
        if _, err := stmt.Exec(user.ID, user.Name, user.Email); err != nil {
            return err
        }
    }
    
    return tx.Commit()
}

// Good: Connection pooling and reuse
func ConfigureHTTPClient() *http.Client {
    transport := &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
        DisableCompression:  false,
    }
    
    return &http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }
}
```

## Package Design and Organization

### Package Structure
```go
// Good: Clear package responsibilities
package user

// Public types and interfaces
type User struct {
    ID    string
    Email string
    Name  string
}

type Repository interface {
    Create(ctx context.Context, user *User) error
    FindByID(ctx context.Context, id string) (*User, error)
}

type Service interface {
    CreateUser(ctx context.Context, req CreateUserRequest) (*User, error)
    GetUser(ctx context.Context, id string) (*User, error)
}

// Internal implementation
type service struct {
    repo      Repository
    validator Validator
}

func NewService(repo Repository, validator Validator) Service {
    return &service{
        repo:      repo,
        validator: validator,
    }
}

// Good: Package-level documentation
// Package user provides user management functionality including
// user creation, validation, and persistence operations.
//
// Example usage:
//
//	repo := postgres.NewUserRepository(db)
//	validator := validation.NewUserValidator()
//	svc := user.NewService(repo, validator)
//	
//	user, err := svc.CreateUser(ctx, user.CreateUserRequest{
//		Email: "user@example.com",
//		Name:  "John Doe",
//	})
package user
```

### API Design
```go
// Good: Minimal, focused interfaces
type Reader interface {
    Read(ctx context.Context, id string) (*Data, error)
}

type Writer interface {
    Write(ctx context.Context, data *Data) error
}

type ReadWriter interface {
    Reader
    Writer
}

// Good: Options pattern for complex configuration
type ServerOptions struct {
    Port         int
    ReadTimeout  time.Duration
    WriteTimeout time.Duration
    Logger       Logger
}

type ServerOption func(*ServerOptions)

func WithPort(port int) ServerOption {
    return func(opts *ServerOptions) {
        opts.Port = port
    }
}

func WithTimeouts(read, write time.Duration) ServerOption {
    return func(opts *ServerOptions) {
        opts.ReadTimeout = read
        opts.WriteTimeout = write
    }
}

func NewServer(opts ...ServerOption) *Server {
    options := &ServerOptions{
        Port:         8080,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 30 * time.Second,
        Logger:       NewDefaultLogger(),
    }
    
    for _, opt := range opts {
        opt(options)
    }
    
    return &Server{options: options}
}

// Usage
server := NewServer(
    WithPort(9090),
    WithTimeouts(15*time.Second, 15*time.Second),
)
```

## Documentation Standards

### README.md Requirements
Every Go project **MUST** include a comprehensive README.md that is updated with every check-in:

```markdown
# Project Name

Brief description of what this service/package does.

## Overview
- **Purpose**: What problem does this solve?
- **Scope**: What does this service handle?
- **Dependencies**: Key external dependencies

## Getting Started

### Prerequisites
- Go 1.21+
- Required tools (Docker, databases, etc.)
- Environment setup requirements

### Installation
```bash
go mod download
make install  # or equivalent setup
```

### Configuration
- Environment variables required
- Configuration file examples
- Default values and overrides

### Running Locally
```bash
make run
# or
go run cmd/server/main.go
```

## API Documentation
- Available endpoints (link to OpenAPI/Swagger)
- Authentication requirements
- Request/Response examples

## Development

### Project Structure
```
cmd/          # Application entry points
internal/     # Private application code
pkg/          # Library code for external use
api/          # API definitions (OpenAPI, protobuf)
docs/         # Additional documentation
```

### Building
```bash
make build
# or
go build -o bin/server cmd/server/main.go
```

### Testing
```bash
make test
# or
go test -v ./...
```

### Code Quality
```bash
make lint      # golangci-lint
make fmt       # gofmt + goimports
make security  # gosec security scan
```

## Deployment
- Docker build instructions
- Kubernetes manifests location
- Environment-specific configurations

## Monitoring & Observability
- Metrics endpoints (/metrics)
- Health check endpoints (/health, /ready)
- Logging configuration
- Tracing setup (if applicable)

## Contributing
- Code review process
- Testing requirements
- Documentation updates required

## License
[License type and link]
```

### Documentation Update Checklist
**MANDATORY**: Update documentation with every code change:

- [ ] **README.md** updated for any new features, APIs, or configuration changes
- [ ] **API documentation** updated (OpenAPI specs, endpoint documentation)
- [ ] **Configuration docs** updated for new environment variables or settings
- [ ] **Code comments** added/updated for public APIs and complex logic
- [ ] **CHANGELOG.md** updated with breaking changes and new features
- [ ] **Deployment docs** updated if infrastructure or deployment changes
- [ ] **Monitoring docs** updated for new metrics, alerts, or dashboards

### API Documentation Standards
```go
// Good: Comprehensive API documentation
// Package userapi provides REST API endpoints for user management.
//
// Base URL: /api/v1
// Authentication: Bearer token required
//
// Error Responses:
//   400 Bad Request - Invalid input
//   401 Unauthorized - Missing or invalid token
//   404 Not Found - Resource not found
//   500 Internal Server Error - Server error
package userapi

// CreateUserRequest represents the request payload for creating a user.
//
// Example:
//   {
//     "email": "user@example.com",
//     "name": "John Doe",
//     "role": "user"
//   }
type CreateUserRequest struct {
    // Email is the user's email address (required, must be valid email)
    Email string `json:"email" validate:"required,email"`
    
    // Name is the user's full name (required, 1-100 characters)
    Name string `json:"name" validate:"required,min=1,max=100"`
    
    // Role is the user's role (optional, defaults to "user")
    Role string `json:"role,omitempty" validate:"omitempty,oneof=admin user"`
}

// CreateUser creates a new user in the system.
//
// POST /api/v1/users
//
// Request Body: CreateUserRequest
// Response: User (201 Created) or Error (400/500)
//
// Example:
//   curl -X POST /api/v1/users \
//     -H "Authorization: Bearer token" \
//     -H "Content-Type: application/json" \
//     -d '{"email":"user@example.com","name":"John Doe"}'
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
    // Implementation
}
```

### Code Documentation Standards
```go
// Good: Package-level documentation
// Package calculator provides mathematical calculation utilities
// with support for basic arithmetic operations and advanced functions.
//
// This package is designed for high-performance calculations and
// includes proper error handling for edge cases like division by zero.
//
// Example usage:
//
//   calc := calculator.New()
//   result, err := calc.Divide(10, 2)
//   if err != nil {
//       log.Fatal(err)
//   }
//   fmt.Printf("Result: %f", result)
package calculator

// Calculator provides mathematical operations with error handling.
type Calculator struct {
    precision int
}

// New creates a new Calculator with default precision.
func New() *Calculator {
    return &Calculator{precision: 2}
}

// Divide performs division of two numbers.
// Returns an error if the divisor is zero.
//
// Parameters:
//   dividend - the number to be divided
//   divisor - the number to divide by (cannot be zero)
//
// Returns:
//   result - the quotient of dividend/divisor
//   error - ErrDivisionByZero if divisor is zero
func (c *Calculator) Divide(dividend, divisor float64) (float64, error) {
    if divisor == 0 {
        return 0, ErrDivisionByZero
    }
    return dividend / divisor, nil
}
```

## Code Quality and Formatting

### Code Style Guidelines
```go
// Good: Consistent formatting and style
func FormatExample() {
    // Use gofmt and goimports always
    
    // Group imports properly
    import (
        "context"
        "fmt"
        "time"
        
        "github.com/external/package"
        
        "myproject/internal/user"
        "myproject/pkg/logger"
    )
    
    // Consistent variable declarations
    var (
        defaultTimeout = 30 * time.Second
        maxRetries     = 3
        bufferSize     = 1024
    )
    
    // Clear function signatures
    func ProcessUser(
        ctx context.Context,
        userID string,
        options ProcessOptions,
    ) (*ProcessResult, error) {
        // Implementation
    }
}

// Good: Documentation comments
// CreateUser creates a new user in the system.
// It validates the input, checks for duplicates, and persists the user.
// Returns the created user with generated ID or an error.
func CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    // Implementation
}

// ProcessOptions configures user processing behavior.
type ProcessOptions struct {
    // Timeout specifies the maximum time to wait for processing.
    Timeout time.Duration
    
    // Retries specifies the number of retry attempts on failure.
    Retries int
    
    // Async indicates whether processing should be asynchronous.
    Async bool
}
```

### Documentation Maintenance
```go
// Pre-commit checklist for documentation:
// 1. README.md reflects current functionality
// 2. API docs match actual endpoints
// 3. Configuration examples are current
// 4. Code comments explain "why" not just "what"
// 5. Public functions have complete godoc comments
// 6. Examples in docs actually work

// Good: Maintainable documentation
// BadgeService manages user achievement badges.
// 
// This service handles the complex logic of badge eligibility,
// award timing, and notification delivery. It integrates with
// the achievement tracking system and user notification preferences.
//
// Thread Safety: This service is safe for concurrent use.
// All methods can be called from multiple goroutines.
type BadgeService struct {
    // Implementation details...
}
```

