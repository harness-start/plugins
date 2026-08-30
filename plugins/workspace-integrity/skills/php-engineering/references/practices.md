# PHP practices

- Follow the framework and version already declared by the repository; do not import another framework's lifecycle conventions.
- Keep HTTP/CLI/worker adapters thin and place business behavior behind explicit services or domain owners.
- Use constructor injection where supported, typed boundaries, narrow exceptions, and explicit transaction/queue semantics.
- Test pure behavior locally, then framework integration, database, queue, and worker lifecycle where affected.
- Run Composer operations through Composer and inspect lock/vendor effects instead of editing owned outputs.
