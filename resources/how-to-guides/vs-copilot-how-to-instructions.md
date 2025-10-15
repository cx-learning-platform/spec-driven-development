# VS Code Copilot Instructions Guide

## Overview
This guide covers both basic and custom instructions for GitHub Copilot in VS Code. Instructions help Copilot provide consistent, relevant responses by automatically including context about your project, coding standards, and preferences.

## Types of Instructions Files

### 1. Basic Repository Instructions
**File:** `.github/copilot-instructions.md`
- Applies to ALL chat requests in workspace
- Shared with team via version control
- Contains general project information

### 2. Custom Specific Instructions  
**Files:** `*.instructions.md`
- Applies to specific file types or tasks
- Can be workspace or user-specific
- More targeted guidance

## Quick Setup

### Step 1: Enable Instructions
1. Open VS Code Settings (`Ctrl+,`)
2. Search: `github.copilot.chat.codeGeneration.useInstructionFiles`
3. ✅ Enable this setting

### Step 2: Create Basic Repository Instructions
1. Create `.github/copilot-instructions.md` in project root
2. Add your project context (see example below)

### Step 3: Create Custom Specific Instructions (Optional)
1. Chat view → `Configure Chat` → `Instructions` → `New instruction file`
2. Choose workspace or user profile location
3. Add targeted instructions

## Example Files

### Basic Repository-Wide (`.github/copilot-instructions.md`)
```markdown
# Project: Customer Management System
- Node.js/React app with PostgreSQL
- Use TypeScript, ESLint, async/await
- Write tests for all functions
- Build: `npm run build`, Test: `npm test`
- Use Prisma ORM with transactions
```

### Custom Language-Specific (`.github/instructions/python.instructions.md`)
```markdown
---
applyTo: "**/*.py"
---
# Python Standards
- Follow PEP 8, use type hints
- Write docstrings for functions
- Use FastAPI, SQLAlchemy, pytest
```

### Custom Infrastructure-Specific (`.github/instructions/terraform.instructions.md`)
```markdown
---
applyTo: "**/*.tf,**/*.tfvars"
---
# Terraform Standards
- Use consistent naming: kebab-case for resources
- Add tags: environment, project, owner
- Use modules for reusable components
- Include provider version constraints
- Add output descriptions and sensitive flags
```

## Advanced Features

### Auto-Apply with Patterns
```markdown
---
applyTo: "**/*.py"     # Python only
applyTo: "**/*.ts,**/*.tsx"  # TypeScript only
applyTo: "**"          # All files
---
```

### Multiple Locations
```json
{
  "chat.instructionsFilesLocations": {
    "docs/instructions": true
  }
}
```

## Best Practices
- Keep instructions short and specific
- Use `.github/copilot-instructions.md` for project-wide rules
- Create separate files for different domains
- Update instructions as project evolves
- Test with real scenarios

## Troubleshooting
- **Not working?** Check settings enabled, correct file paths
- **Manual use:** Chat view → Add Context → Instructions
- **Disable:** Set `useInstructionFiles` to `false`

## Quick Reference
| Task | Action |
|------|--------|
| Repository instructions | `.github/copilot-instructions.md` |
| Specific instructions | Chat → Configure → New instruction file |
| Auto-apply to files | Add `applyTo: "pattern"` in frontmatter |
| Manual application | Chat → Add Context → Instructions |

**💡 Pro Tip:** Use "Generate Instructions" in Chat view to auto-create a starting template!