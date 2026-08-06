#!/usr/bin/env node
import { readStdinJson, stopBlock, writeJson } from "./lib/hook-io.mjs";
import { stopViolation } from "./checks/stop-gates.mjs";
const event = await readStdinJson(); const violation = !event.__parseError ? stopViolation(event) : null; if (violation) writeJson(stopBlock(violation));
