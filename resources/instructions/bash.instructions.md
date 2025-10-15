applyTo:
  - "**/*.sh"
  - "**/*.bash"
  - "**/*.bashrc"
  - "**/.bash_profile"
---

# Bash Coding Instructions

## Purpose
Provide clear, maintainable, and secure Bash scripts following the [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html).

---

## General Guidelines

- **File Extension:** Use `.sh` for Bash scripts.
- **Shebang:** Start scripts with `#!/bin/bash`.
- **Permissions:** Make scripts executable (`chmod +x script.sh`).
- **Encoding:** Use UTF-8.

---

## Style Rules

- **Indentation:** Use 2 spaces per indentation level. Do not use tabs.
- **Line Length:** Limit lines to 80 characters.
- **Naming:** Use lowercase with underscores for variables and functions.
- **Quoting:** Always quote variable expansions: `"$var"` not `$var`.
- **Braces:** Use braces for variable names: `"${var}"`.
- **Functions:** Define functions as:
  ```bash
  my_function() {
    # function body
  }
  ```
- **Comments:** Use `#` for comments. Write complete sentences and capitalize the first word.

---

## Best Practices

- **Error Handling:** Use `set -euo pipefail` at the top for safer scripts.
- **Input Validation:** Validate all user input.
- **Command Substitution:** Use `$(...)` instead of backticks.
- **Exit Codes:** Use explicit `exit` codes where appropriate.
- **Temporary Files:** Use `mktemp` for creating temporary files.

---

## Security
- **No Hardcoded Secrets:** Do not hardcode passwords, API keys, or credentials.
- **Environment Variables:** Use environment variables for sensitive data.
- **Permissions:** Restrict script and file permissions as needed.

---

## Example

```bash
#!/bin/bash
set -euo pipefail

# Print a greeting
greet() {
  local name="$1"
  echo "Hello, ${name}!"
}

greet "World"
```

---

## References

- [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html)
