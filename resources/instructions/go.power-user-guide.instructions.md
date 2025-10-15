---
description: Advanced techniques and patterns for maximizing GitHub Copilot effectiveness in Go development, focusing on production-ready code with observability, testing, and performance.
mode: guide
model: 
tools: ["@workspace", "copilot-chat", "inline-completion"]
inputVariables: ["codebase-context", "go-version", "project-type"]
---

# GitHub Copilot — Power User Guide for Go (Golang)
_Last updated: 2025-09-04 15:47_

## Goals
- Accelerate high-quality Go code with guardrails.
- Keep outputs idiomatic per Effective Go.
- Make observability (OTEL), testing, and performance first-class.
- Leverage latest AI capabilities for complex reasoning and multi-file refactoring.

## General Usage Tips
- **Prime the context**: Open the relevant files and write a comment that states intent, constraints, and interfaces.
- **Iterate in small chunks**: Ask for one function or one test at a time.
- **Show examples**: Paste a small canonical sample so Copilot mirrors the style.
- **Refine**: Accept partially correct suggestions, then correct with comments like _"use context with timeout"_ or _"return sentinel errors not fmt.Errorf strings"_.
- **Use Chat mode**: For complex refactoring, architecture decisions, and multi-file changes, prefer Copilot Chat over inline completion.
- **Reference workspace**: Use `@workspace` to analyze entire codebase context for better suggestions.

## Comment Starters (Inline)
```go
Task: Implement service method with context propagation, retries (max=3), and OTEL spans.
Constraints: No globals. Use constructor injection. Return typed errors. Add unit tests.
```

```go
Task: HTTP handler using otelhttp middleware, JSON request/response, robust validation,
       and structured logging with attributes. Respond with problem+json on errors.
```

```go
Task: Repository interface + implementation with database/sql + otelsql instrumentation.
       Use prepared statements, context deadlines, and handle sql.ErrNoRows properly.
```

```go
Task: Add metrics (counter, histogram, gauge) using go.opentelemetry.io/otel/metric.
       Include labels: service.name, version, env.
```

```go
Task: Concurrency-safe worker pool using channels and context cancellation.
       Back-pressure and bounded queue. Tests include race detector hints.
```

## Chat Prompts (Copilot Chat)
- "Review this package for Effective Go style issues (naming, receiver choice, error handling). Give a concise list of deltas with examples to fix."
- "Generate table-driven tests for `pkg/service` targeting edge cases and unhappy paths. Include fuzz tests where useful."
- "Add OTEL tracing, metrics, and logs to the following functions. Suggest span names, attributes, and error recording best practices."
- "Refactor this module to use interfaces for seams. Show minimal interfaces and how they improve testability."
- "Profile this code path. Suggest where to place benchmarks and how to use `-bench` and `pprof` to validate improvements."
- "Explain the performance implications of this code and suggest optimizations using Go's memory model."
- "Generate comprehensive mocks for these interfaces using testify/mock or gomock patterns."
- "Analyze @workspace for potential security vulnerabilities and suggest fixes."

## Model & Capabilities (2025)
- **Current Models**: Claude 3.5 Sonnet, GPT-4o (context-aware model selection)
- **Context Window**: ~200K tokens (sufficient for large Go codebases)
- **Code Understanding**: Multi-file reasoning, cross-package dependencies, module analysis
- **Specialized Features**: 
  - Workspace-wide analysis (`@workspace` references)
  - Terminal integration and command explanation
  - VS Code specific guidance and extensions
  - Real-time error analysis and automated fixes
  - Code generation with Go 1.21+ features (generics, workspace mode)

## Quality Gates
- **Build & Vet**: `go build ./... && go vet ./...`
- **Staticcheck**: Integrate `staticcheck` in CI.
- **Tests**: `go test -race -cover ./...`
- **Benchmarks**: `go test -bench=. -run=^$ ./...`
- **Lint**: Use `golangci-lint` with Effective Go oriented rules.
- **Security**: Run `gosec` for security vulnerability scanning.
- **Dependencies**: Use `go mod tidy` and `go list -m -u all` for updates.
- **Vulnerability Check**: `govulncheck ./...` (Go 1.18+)

## OTEL Snapshot
- Use `otelhttp` middleware on HTTP clients/servers.
- Create spans around I/O boundaries. Record errors with `span.RecordError(err)` and `span.SetStatus(codes.Error, msg)`.
- Expose metrics (requests/sec, latency, queue depth) and structured logs with trace/span IDs.
- **OTEL SDK v1.28+**: Use latest stable API with proper resource detection and batch processors.
- **Auto-instrumentation**: Leverage `go.opentelemetry.io/auto` for zero-code instrumentation where applicable.

## Advanced Patterns (Go 1.21+)
- **Generics**: Use type parameters for type-safe collections and algorithms.
- **Context Propagation**: Always pass `context.Context` as first parameter, use `context.WithTimeout` for I/O operations.
- **Error Handling**: Use `errors.Is()` and `errors.As()` for error inspection, wrap errors with `fmt.Errorf("%w", err)`.
- **Structured Logging**: Use `slog` package (Go 1.21+) with contextual attributes.
- **Memory Management**: Leverage sync.Pool for object reuse, use build constraints for platform-specific optimizations.
