# project-capability-governance acceptance

The dual-host cases verify proposal outcomes and confirm that no dedicated
recorder lifecycle is required:

| Case | Outcome |
| --- | --- |
| `01-human-only-notice` | A new proposal produces one human-only, non-blocking Stop notice |
| `02-ordinary-no-notice` | Ordinary work creates no proposal and no notice |
| `03-parent-capture` | The parent creates one schema-valid proposal directly and triggers the Stop notice |
| `06-ordinary-subagent-no-abandon` | An ordinary platform subagent remains unaffected by this plugin |

The third case intentionally forbids a child: proposal validation is a file
contract, not a subagent identity contract. The sixth case exercises a normal
platform subagent without assigning it a plugin-owned role.
