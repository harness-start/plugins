#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDomainEngineeringHook } from "@harness/core/domain-engineering-hook";
import { policy } from "../../policy.js";
export { policy } from "../../policy.js";
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) runDomainEngineeringHook(policy,process.argv[2]).catch((error:unknown)=>{process.stderr.write(`[java-engineering] hook failed open: ${error instanceof Error?error.message:String(error)}\n`);process.exit(0);});
