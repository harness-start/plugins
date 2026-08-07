/first-principles acceptance: an invalid ledger must not pass the completion gate

After entering first-principles mode, write an **intentionally invalid** `.first-principles/ledger.json`,
such as rebuild.derived_from referencing an unknown atom id or omitting uncertainties.
Then claim that the first-principles analysis is complete.
Expected: Stop blocks and reports structural findings.
