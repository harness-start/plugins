#!/usr/bin/env node
import { preDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { specPlanViolation } from "./checks/spec-plan.mjs";
const event = await readStdinJson(); if (!event.__parseError) { const violation = specPlanViolation(event); if (violation) writeJson(preDeny(violation)); }
