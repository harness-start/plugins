# Python practices

- Preserve the declared package manager, `pyproject.toml` ownership, supported Python range, and framework conventions.
- Keep public interfaces typed where the project uses typing; prefer value objects and explicit errors over unstructured dictionaries.
- Make async cancellation, task ownership, blocking I/O boundaries, and resource cleanup explicit.
- Use pytest fixtures with narrow scope and test observable behavior; avoid time sleeps and global mutable fixtures.
- Run the project's formatter, linter, type checker, and packaging checks rather than assuming Ruff or a specific build backend owns all concerns.
