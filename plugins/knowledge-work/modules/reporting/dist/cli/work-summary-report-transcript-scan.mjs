#!/usr/bin/env node
// harness-source-hash: sha256:e6675df35732fb0fcbf42a59d0c95c56902c93acde0a1d8d63c24b74ce9b45ca
import {
  runCli
} from "../chunks/chunk-L7G63RHC.mjs";
import "../chunks/chunk-BTFHWLHE.mjs";

// plugins/knowledge-work/modules/reporting/src/entries/cli/work-summary-report-transcript-scan.ts
process.exitCode = await runCli("summary", "scan");
