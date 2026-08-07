# goal-task-gate host acceptance

```bash
./scripts/acceptance/run.sh --plugin goal-task-gate
```

Offline fixtures:

```bash
bash plugins/goal-task-gate/acceptance/cases/01-goal-prompt-arms-inject/run-fixture.sh
bash plugins/goal-task-gate/acceptance/cases/02-deny-trail-rewrite/run-fixture.sh
bash plugins/goal-task-gate/acceptance/cases/03-fake-trailer-blocks/run-fixture.sh
bash plugins/goal-task-gate/acceptance/offline/clear-and-supersede.sh
```
