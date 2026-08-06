#!/usr/bin/env node
import { readStdinJson } from "./lib/hook-io.mjs";
import { markLanguageIntent } from "./checks/language.mjs";
const event = await readStdinJson(); if (!event.__parseError) markLanguageIntent(event, event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? "");
