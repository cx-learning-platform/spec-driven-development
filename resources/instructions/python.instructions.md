applyTo: "**/*.py"
---

## Purpose
Provide clear, maintainable, and secure python scripts following the [Python Enhancement Proposals](https://peps.python.org/pep-0008/).

# Python Project Standards & Best Practices

Opinionated, pragmatic guidelines for writing reliable, maintainable, and
secure Python code. Adapt when justified; document all deviations.

---
## 1. Scope: When Python Is Appropriate
Use Python for:
- Automation & orchestration
- Data processing, APIs, CLIs, web services
- Rapid prototyping & glue logic

Avoid Python (consider Go/Rust/Java/etc.) when you need:
- Hard realtime guarantees
- Very high concurrency at minimal RAM
- Single-binary static deployment

---
## 2. Runtime & Version Policy
- Target the **lowest supported Python minor version** required (e.g. 3.10+)
- Pin dependencies for applications; use loose ranges for libraries
- Enforce versions in `pyproject.toml` or `requirements.txt`

---
## 3. Project Layout (Recommended)
```
project/
  pyproject.toml        # Prefer (PEP 621) or setup.cfg
  requirements.txt      # (apps) pinned; sync from lock tool
  requirements-dev.txt  # lint/test tools
  README.md
  LICENSE
  .gitignore
  src/
    project_name/
      __init__.py
      main.py
      config.py
      models/
      services/
      util/
  tests/
    unit/
    integration/
    conftest.py
  scripts/
  docs/
```
Use the `src/` layout to avoid accidental imports from working dir.

---
## 4. Toolchain Summary
| Concern       | Tool(s)                            |
|---------------|------------------------------------|
| Formatting    | black (non-negotiable)             |
| Imports       | isort (before black)               |
| Lint          | ruff or flake8 + plugins           |
| Types         | mypy (strict incremental)          |
| Testing       | pytest (coverage + fixtures)       |
| Security      | bandit, pip-audit, safety          |
| Packaging     | hatch / poetry / pdm / uv          |
| Docs          | sphinx + autodoc + napoleon        |
| Pre-commit    | pre-commit hooks                   |

---
## 5. Code Style Essentials
- 4 spaces; never tabs
- Max line: 88 (black default) or 79 if policy requires
- Use UTF-8 encoding (implicit in 3.x)
- One top-level class or cohesive group per module where possible
- Avoid circular imports; refactor shared constants to dedicated modules

---
## 6. Imports
Order (isort profile = black):
1. Standard library
2. Third-party
3. Local project

Example:
```python
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import httpx
import pytz

from project_name.config import Settings
from project_name.util.time import to_utc
```

Never use wildcard imports except in `__all__`-controlled package exports.

---
## 7. Naming Conventions
| Entity          | Style                     |
|-----------------|---------------------------|
| Modules/files   | lower_snake_case          |
| Packages        | lower_snake_case          |
| Classes         | CapWords                  |
| Functions       | lower_snake_case          |
| Variables       | lower_snake_case          |
| Constants       | UPPER_SNAKE_CASE          |
| Private attr    | _single_leading_underscore|
| Internal use    | __all__ = ["PublicName"] |

---
## 8. Type Hints (PEP 484 / 563 / 604)
- Type all public function signatures
- Use `from __future__ import annotations` (Python <3.13) for postponed eval
- Enable mypy strict flags gradually (e.g. `--strict` in stages)
- Prefer `collections.abc` over `typing` where possible (`Sequence`, `Mapping`)
- Use `typing.Protocol` for structural typing instead of inheritance when fitting
- Avoid `Any` unless boundary or deliberate escape hatch (comment why)

Example:
```python
def fetch_user(user_id: str, client: httpx.Client) -> dict[str, str]:
    """Return user payload or raise ValueError if malformed."""
    resp = client.get(f"/users/{user_id}")
    resp.raise_for_status()
    data: dict[str, str] = resp.json()
    if "id" not in data:
        raise ValueError("Missing id field")
    return data
```

---
## 9. Docstrings (PEP 257)
Choose one style (Google or NumPy). Example (Google):
```python
def add(a: int, b: int) -> int:
    """Add two integers.

    Args:
        a: First addend.
        b: Second addend.
    Returns:
        Sum of a and b.
    Raises:
        OverflowError: If result exceeds limits (example).
    """
    return a + b
```
Docstrings required for: public modules, classes, functions, critical internals.

---
## 10. Error Handling
- Fail fast on programmer errors; use exceptions, not silent returns
- Catch only what you can handle
- Wrap third-party exceptions at boundaries (adapter pattern)
- Use custom exceptions with clear semantic names

```python
class ExternalServiceError(RuntimeError):
    """Raised when external dependency interaction fails."""
```

---
## 11. Logging
- Use `logging` (never bare prints in libraries)
- Define a package-level logger: `logger = logging.getLogger(__name__)`
- Use structured context (extra= or adopt structlog/loguru if policy allows)

```python
logger.info("Processed batch", extra={"count": count, "elapsed_ms": ms})
```

---
## 12. Configuration
Hierarchy: ENV VARS > CLI args > config file defaults > internal defaults.
Use a single settings module/class (e.g., pydantic `BaseSettings`) to centralize.

---
## 13. Dependency Management
Applications:
- Use a lock file (poetry.lock, requirements.txt + hashes via `pip-compile`)
Libraries:
- Minimal direct dependencies; avoid transitive explosion
- Mark optional extras: `[project.optional-dependencies]`

Pin toolchain versions in dev requirements.

---
## 14. Testing Strategy
- Use pytest
- Directory mirroring: `tests/unit/...` parallels `src/...`
- 70–90% coverage; focus on critical paths > chasing 100%
- Use `pytest-cov` with fail threshold in CI
- Mock external IO (`responses`, `pytest-httpx`) not your own logic
- Avoid overspecifying test internals (assert behavior, not implementation)

Example fixture:
```python
import pytest
from project_name.config import Settings

@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(env="test")
```

---
## 15. Performance & Profiling
- Use `time.perf_counter()` for precise timing
- Profile hotspots with `cProfile` / `pyinstrument`
- Optimize only after measurement (Amdahl's law)
- Prefer generators & streaming for large datasets
- Consider `functools.lru_cache` for pure expensive functions

---
## 16. Concurrency Model
Pick intentionally:
| Need                      | Tool                    |
|---------------------------|-------------------------|
| IO-bound many tasks       | asyncio + httpx/aio libs|
| CPU-bound parallelism     | multiprocessing / ray   |
| Simple parallel mapping   | concurrent.futures      |
| Offload / background      | Celery / RQ / Dramatiq  |

Never mix threads + asyncio casually; isolate concerns.

---
## 17. Data & Serialization
- Use `pydantic` / `dataclasses` for structured data
- Validate inputs at boundaries only (avoid redundant validation internally)
- For JSON: `orjson` (if speed needed) with fallback to stdlib

---
## 18. Security Practices
- Never interpolate untrusted input in shell commands (`subprocess.run([...])`)
- Use parameterized queries (DB)
- Avoid storing secrets in repo; rely on environment or secret managers
- Scan dependencies (`pip-audit`) in CI
- Enforce TLS verification (default) in HTTP clients

---
## 19. Internationalization & Time
- Use UTC internally; convert at edges
- Use `zoneinfo` (Python 3.9+) or `pytz` if required by legacy
- Avoid naive `datetime`; call `.astimezone(timezone.utc)` when normalizing

---
## 20. CLI Applications
- Use `argparse` (stdlib) or `typer`/`click` for richer UX
- Provide `--version` and `--help`
- Exit codes: 0 success, 64–78 for usage/data/config errors (sysexits)

---
## 21. Packaging & Distribution
- Prefer `pyproject.toml` (PEP 517/518)
- Single source version (e.g., `__version__` in `__init__.py` or dynamic)
- Wheels > source distributions where possible
- Provide meaningful classifiers & `long_description` (README)

---
## 22. Continuous Integration Checklist
| Check            | Required |
|------------------|----------|
| Lint (ruff/flake8)| Yes      |
| Format (black)    | Enforced |
| Types (mypy)      | Yes      |
| Tests (pytest)    | Yes      |
| Coverage gate     | Yes      |
| Security scan     | Yes      |
| Build wheel       | Yes      |

Fail fast on first failure to save CI minutes (matrix if needed).

---
## 23. Documentation
- Autogenerate API docs (sphinx autodoc / mkdocs material + mkdocstrings)
- Provide architecture overview diagrams
- Include QUICKSTART, FAQ, CHANGELOG (Keep a changelog standard)
- Use semantic versioning: MAJOR.MINOR.PATCH

---
## 24. Refactoring Principles
- Small, reversible changes
- Preserve behavioral contracts; add tests before risky refactors
- Delete dead code promptly
- Extract complexity behind well-named functions/classes

---
## 25. Monitoring & Observability (Apps)
- Use structured logs (JSON if aggregated)
- Expose health endpoints (`/healthz`, `/readyz`)
- Include basic metrics (Prometheus, OpenTelemetry) for latency, errors, throughput

---
## 26. Common Anti-Patterns (Avoid)
| Anti-Pattern                    | Alternative                     |
|---------------------------------|---------------------------------|
| Large God modules               | Split by responsibility         |
| Deep inheritance chains         | Composition / protocols         |
| Globals for mutable state       | Dependency injection / factory  |
| Swallowing broad exceptions     | Catch specific & re-raise       |
| Overusing singletons            | Pass explicit context           |
| Logic in `__init__` side effects| Use factory / classmethod       |

---
## 27. Handy Patterns
Context manager:
```python
from contextlib import contextmanager

@contextmanager
def timed(section: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        logger.info("timed", extra={"section": section, "ms": round(elapsed, 2)})
```

Dataclass with validation:
```python
from dataclasses import dataclass

@dataclass(slots=True)
class User:
    id: str
    email: str

    def __post_init__(self) -> None:
        if "@" not in self.email:
            raise ValueError("Invalid email")
```

---
## 28. Performance Micro-Checklist
- Avoid premature optimization
- Use list/dict/set comprehensions
- Minimize attribute lookups inside tight loops (local binding)
- Prefer `join` over incremental string concatenation
- Use batching for IO-bound operations

---
## 29. Release Process Outline
1. All CI checks green
2. Update CHANGELOG.md
3. Bump version (tag: `vX.Y.Z`)
4. Build artifacts (wheel + sdist)
5. Sign & publish (PyPI / internal index)
6. Create release notes

Automate with a release script or tool (e.g., `hatch version`, `poetry version`).

---
## 30. Code Review Checklist
- [ ] Clear, focused PR scope
- [ ] Tests added/updated & meaningful
- [ ] No failing linters / types
- [ ] Proper error handling & logging
- [ ] Configuration documented
- [ ] No secrets / credentials
- [ ] Dependency changes justified
- [ ] Public APIs documented
- [ ] Refactors accompanied by tests

---
## 31. Onboarding Quickstart (Template)
```bash
# Clone & enter
 git clone <repo> && cd <repo>

# Create environment
 python -m venv .venv
 source .venv/bin/activate

# Install
 pip install --upgrade pip
 pip install -r requirements.txt -r requirements-dev.txt

# Run checks
 ruff check .
 black --check .
 mypy src/
 pytest -q
```

---
## 32. Pre-Commit Example
`.pre-commit-config.yaml` snippet:
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.2.0
    hooks:
      - id: black
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.9.0
    hooks:
      - id: mypy
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace
```

---
## 33. Environment Variables Pattern
```python
from functools import lru_cache
from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    env: str = Field("dev", pattern=r"^(dev|staging|prod|test)$")
    debug: bool = False
    db_url: str

    class Config:
        env_prefix = "APP_"
        case_sensitive = False

@lru_cache
def get_settings() -> Settings:  # cache to avoid rebuild
    return Settings()  # loads from environment
```

---
## 34. Graceful Shutdown (Async)
```python
import asyncio
import signal

async def main():
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    # start tasks here
    await stop.wait()

if __name__ == "__main__":
    asyncio.run(main())
```

---
## 35. References
- PEP 8: https://peps.python.org/pep-0008/
- Packaging: https://packaging.python.org/
- Typing: https://docs.python.org/3/library/typing.html
- MyPy: https://mypy.readthedocs.io/
- Pytest: https://docs.pytest.org/
- Logging: https://docs.python.org/3/library/logging.html
- Security: https://owasp.org/www-project-top-ten/

---
Adhering to these standards yields Python code that is predictable, testable,
and ready to scale. Continuous enforcement via tooling is essential—configure
CI early and treat warnings as future errors.
