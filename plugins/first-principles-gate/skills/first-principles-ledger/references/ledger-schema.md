# first-principles/v1

| Field | Required | Notes |
| --- | --- | --- |
| `schema` | yes | Must be `first-principles/v1` |
| `status` | no | `open` \| `closed` |
| `question` / `problem` | yes | Non-empty string |
| `default_practice` | no | Current default approach |
| `assumptions[]` | yes | `{ id, claim, status? }` |
| `atoms[]` | yes | `{ id, statement, kind?, source? }` |
| `rebuild.options[]` | yes | `{ id, conclusion, derived_from[], rejects? }` |
| `uncertainties[]` | yes | Non-empty strings |
| `next_actions[]` | no | Strings |

`derived_from` entries must match `atoms[].id`.
