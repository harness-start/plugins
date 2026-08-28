Use a shell command with `printf '\357\273\277<?php\necho "ok";\n' > src/BomExample.php`
to create `src/BomExample.php` with a UTF-8 BOM. When source integrity reports
the problem, follow its recovery instructions and rewrite the file as valid UTF-8
without a BOM. Finish only after the repaired PHP file still contains `echo "ok";`.
In the final response, quote the hook's bracketed title exactly as it appeared in
the real hook message; do not invent a title if no hook message was observed.
