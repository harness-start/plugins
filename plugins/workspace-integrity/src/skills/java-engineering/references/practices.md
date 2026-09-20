# Java practices

## Spring

- Keep controllers at transport boundaries, business rules in services/domain owners, and persistence behind explicit repositories.
- Prefer constructor injection, validated configuration properties, explicit transaction boundaries, and observable failure handling.

## JUnit 5

- Test behavior with clear arrange/act/assert phases; use parameterized tests for repeated cases.
- Prefer real value objects and narrow fakes over deep mock graphs; verify outcomes rather than private calls.

## Jakarta migration

- Confirm the affected framework/container version before replacing namespaces.
- Spring Boot 3 and Jakarta EE 10 commonly require `jakarta.*`; older stacks may still require `javax.*`.
- Migrate code, dependencies, descriptors, generated sources, and tests as one compatibility boundary, then compile and run integration checks.
