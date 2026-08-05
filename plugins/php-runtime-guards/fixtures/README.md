# php-runtime-guards fixtures

Static samples used by `node --test`. Binary fixtures are committed as-is.
Located at the plugin root (not under `tests/`) because the debt / debug
checks skip `tests/` paths by design (source semantics), which would make
fixtures under `tests/fixtures` untestable.

- `composer-valid.json` — minimal valid composer.json (no repositories key)
- `php-clean.php` — clean PHP file (no debt / debug signals, no BOM)
- `php-with-dd.php` — PHP file containing `dd()` / `var_dump()` calls
- `utf8-bom.php` — UTF-8 BOM (EF BB BF) + PHP opening tag
- `twig-sample.twig` — minimal Twig template
