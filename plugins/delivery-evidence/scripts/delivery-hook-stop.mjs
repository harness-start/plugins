#!/usr/bin/env node
import { readStdinJson, stopBlock, writeJson } from "./lib/hook-io.mjs";
import { stopViolation } from "./checks/stop-gates.mjs";
const event = await readStdinJson(); if (!event.__parseError) { const violation = stopViolation(event); if (violation) writeJson(stopBlock(violation)); }
