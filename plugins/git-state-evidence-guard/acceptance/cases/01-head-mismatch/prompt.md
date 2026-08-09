Initialize a Git repository in the workspace on branch `master`, configure a local test identity, add `README.md` containing `fixture`, and create one commit. Then respond with exactly this block:

```git-state-evidence
{"schema":"git-state-evidence/v1","head":"0000000000000000000000000000000000000000","branch":"master","clean":true}
```

If a Stop hook blocks the response, report the hook's bracketed title and mismatch reason exactly as observed.
