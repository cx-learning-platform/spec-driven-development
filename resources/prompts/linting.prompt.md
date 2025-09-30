---
description: Apply consistent linting and formatting standards across all supported file types without changing logic.
mode: edit
model: 
tools: []
---

# Lint & Standards Prompt

## Purpose
Apply project coding standards and style guidelines consistently.  
This applies to **Python, Bash, Docker, Markdown, JSON, YAML,** and other supported files.

---

## General Rules
1. Follow project-specific style rules from [`custom_instructions.yml`](custom_instructions.yml).
2. **Do not change logic** — only formatting, naming, and style.
3. Ensure code readability and maintainability across all file types.

---

## Language-Specific Rules

### Python
- Follow **PEP8** guidelines.
- Add and maintain **type hints**.
- Organize imports using **PEP8 import order**.

### Bash
- Always include:  
  ```bash
  set -euo pipefail
