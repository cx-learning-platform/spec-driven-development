# VS Code Copilot Prompts Guide

## Overview
This guide covers three types of prompts in VS Code: **Inline prompts** for quick edits, **Prompt files** for reusable tasks, and **Built-in prompts** for common actions.

## Types of Prompts

### 1. Inline Prompts (`Ctrl+I`)
- Quick point edits while coding
- Generate small functions or documentation
- Good for: doc strings, small code blocks
- Not good for: large changes, multi-file edits

### 2. Prompt Files (`.prompt.md`)
- Reusable prompts for common tasks
- Stored in `.github/prompts/` folder
- Called with `/prompt-name` in chat

### 3. Built-in Prompts
- `/doc` - Generate documentation
- `/explain` - Explain code
- `/fix` - Fix issues

## Prompt File Format

Prompt files use `.prompt.md` extension with this structure:

### Header (Optional YAML)
```markdown
---
description: "Short description of the prompt"
mode: "ask" | "edit" | "agent"  # Default: agent
model: "gpt-4"                   # Optional: specific model
tools: ["terminal", "workspace"] # Optional: available tools
---
```

### Body (Markdown)
- Prompt instructions in Markdown format
- Reference files with `[name](../path/file.md)`
- Use variables with `${variableName}` syntax

### Available Variables
```markdown
${workspaceFolder}     # Workspace root path
${selection}           # Currently selected text
${file}               # Current file path
${fileBasename}       # File name only
${input:name}         # User input variable
${input:name:placeholder}  # Input with placeholder
```

## Quick Setup

### Step 1: Enable Prompt Files
1. Open VS Code Settings (`Ctrl+,`)
2. Search: `chat.promptFiles`
3. ✅ Enable this setting

### Step 2: Create Prompt File
1. Chat view → `Configure Chat` → `Prompt Files` → `New prompt file`
2. Choose workspace or user profile location
3. Name your file (e.g., `code-review.prompt.md`)

## Example Files

### Security Review Prompt (`.github/prompts/security-review.prompt.md`)
```markdown
---
description: "Perform security review of a REST API"
mode: "agent"
---

# REST API Security Review

Perform a comprehensive security analysis of the selected REST API code for:

## Authentication & Authorization
- Verify proper authentication mechanisms
- Check authorization controls for endpoints
- Review JWT token handling and validation
- Assess role-based access control (RBAC)

## Input Validation & Sanitization
- Check for SQL injection vulnerabilities
- Verify input validation and sanitization
- Review parameter binding and type checking
- Assess file upload security controls

## Data Protection
- Review sensitive data handling
- Check encryption at rest and in transit
- Verify proper password storage (hashing/salting)
- Assess PII data protection measures

## Common Vulnerabilities
- OWASP Top 10 compliance check
- Cross-Site Scripting (XSS) prevention
- Cross-Site Request Forgery (CSRF) protection
- Check for information disclosure

## Error Handling & Logging
- Review error message disclosure
- Verify proper logging without sensitive data
- Check for security event monitoring

Provide specific security recommendations with code examples.
```

### Documentation Prompt (`.github/prompts/document.prompt.md`)
```markdown
---
description: "Generate comprehensive documentation"
---

# Documentation Generator

Create detailed documentation for ${selection} including:
- Purpose and functionality
- Parameters and return values
- Usage examples
- Error conditions

Follow project documentation standards.
```

### Test Generation Prompt (`.github/prompts/test.prompt.md`)
```markdown
---
description: "Generate unit tests"
---

# Test Generator

Generate comprehensive unit tests for ${selection}:
- Happy path scenarios
- Edge cases and error conditions
- Mock external dependencies
- Follow project testing patterns

Use the project's testing framework.
```

## Usage Methods

### Inline Prompts
1. **Select code** you want to modify
2. **Press `Ctrl+I`** to open inline prompt
3. **Type your request** (e.g., "Add error handling")
4. **Review and accept** the suggestion

### Prompt Files
1. **In Chat:** Type `/prompt-name` (e.g., `/review`)
2. **Command Palette:** `Chat: Run Prompt` → select file
3. **Editor:** Open `.prompt.md` file → click play button

## Variables in Prompt Files
```markdown
${selection}          # Currently selected text
${file}              # Current file path
${workspaceFolder}   # Workspace root path
${input:name}        # User input variable
```

## Advanced Features

### Multiple Locations
```json
{
  "chat.promptFilesLocations": {
    "team-prompts": true,
    "shared/prompts": true
  }
}
```

### Prompt Frontmatter Options
```markdown
---
description: "Short description"
mode: "ask" | "edit" | "agent"
model: "gpt-4"
tools: ["terminal", "workspace"]
---
```

## Best Practices
- Use clear, step-by-step instructions
- Include examples of good/bad outcomes
- Reference instruction files instead of duplicating content
- Create prompts for frequently repeated tasks
- Test and iterate on prompt wording

## Common Use Cases
- **Code reviews** with specific checklists
- **Documentation generation** following standards
- **Unit test creation** with coverage requirements
- **Security audits** with vulnerability scanning
- **Refactoring** with specific patterns

## Quick Reference
| Task | Method | Example |
|------|--------|---------|
| Quick edit | `Ctrl+I` | Add error handling |
| Run prompt file | `/prompt-name` | `/review` |
| Generate docs | `/doc` | Built-in documentation |
| Explain code | `/explain` | Built-in explanation |

**💡 Pro Tip:** Start with simple prompts and gradually add more specific requirements as you refine them!