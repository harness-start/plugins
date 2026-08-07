/first-principles acceptance: abort releases the write barrier without a ledger

Do not write a ledger after entering first-principles mode.
The user will send `# first-principles-abort`.
After the abort, modifying `src/app.js` must be allowed.
