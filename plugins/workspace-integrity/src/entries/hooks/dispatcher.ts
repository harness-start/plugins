import { runOwnerDispatcher, type OwnerHookHandler } from "../../../../../core/src/aio-dispatcher.js";
import { runDomainEngineeringHook, type DomainEngineeringPolicy } from "../../../../../core/src/domain-engineering-hook.js";
import { preToolDeny, stopBlock } from "../../../../../core/src/hook-output.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { policy as androidPolicy } from "../../domains/android/policy.js";
import { main as runCommandsPost } from "../../domains/commands/entries/hooks/cmd-safety-hook-post-tool.js";
import { main as runCommandsPre } from "../../domains/commands/entries/hooks/cmd-safety-hook-pre-tool.js";
import { policy as goPolicy } from "../../domains/go/policy.js";
import { policy as iosPolicy } from "../../domains/ios/policy.js";
import { policy as javaPolicy } from "../../domains/java/policy.js";
import { policy as kubernetesPolicy } from "../../domains/kubernetes/policy.js";
import { policy as nixPolicy } from "../../domains/nix/policy.js";
import { policy as phpPolicy } from "../../domains/php/policy.js";
import { policy as pythonPolicy } from "../../domains/python/policy.js";
import { runChecks as runQualityChecks } from "../../domains/quality/entries/hooks/engineering-quality-post.js";
import { policy as reactNativePolicy } from "../../domains/react-native/policy.js";
import { policy as rustPolicy } from "../../domains/rust/policy.js";
import { main as runSourceIntegrity } from "../../domains/source/entries/hooks/source-integrity.js";
import { policy as webPolicy } from "../../domains/web/policy.js";

function domainHandler(policy: DomainEngineeringPolicy): OwnerHookHandler {
  return ownerHookHandler(async () => await runDomainEngineeringHook(policy, process.argv[2]));
}

const domainPolicies = [androidPolicy, goPolicy, iosPolicy, javaPolicy, kubernetesPolicy, nixPolicy, phpPolicy, pythonPolicy, reactNativePolicy, rustPolicy, webPolicy];
const domainsPostHandler = ownerHookHandler(async () => {
  for (const policy of domainPolicies) await runDomainEngineeringHook(policy, "post");
});

const qualityHandler: OwnerHookHandler = ({ raw }) => {
  const exitCode = runQualityChecks(Buffer.from(raw), "post");
  if (exitCode !== 0) throw new Error(`engineering quality checks exited with status ${exitCode}`);
};
const qualityPreHandler: OwnerHookHandler = ({ raw }) => {
  const exitCode = runQualityChecks(Buffer.from(raw), "pre");
  if (exitCode !== 0) return preToolDeny("The proposed write exceeds its configured file line budget. Split or reduce it before retrying.");
};
const qualityStopHandler: OwnerHookHandler = ({ raw }) => {
  const exitCode = runQualityChecks(Buffer.from(raw), "stop");
  if (exitCode !== 0) return stopBlock("Unresolved post-write file line budget debt remains. Reduce or split the reported files before completion.");
};

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "android:domain-hook": domainHandler(androidPolicy),
  "commands:cmd-safety-hook-post-tool": ownerHookHandler(runCommandsPost),
  "commands:cmd-safety-hook-pre-tool": ownerHookHandler(runCommandsPre),
  "domains:post-tool": domainsPostHandler,
  "go:domain-hook": domainHandler(goPolicy),
  "ios:domain-hook": domainHandler(iosPolicy),
  "java:domain-hook": domainHandler(javaPolicy),
  "kubernetes:domain-hook": domainHandler(kubernetesPolicy),
  "nix:domain-hook": domainHandler(nixPolicy),
  "php:domain-hook": domainHandler(phpPolicy),
  "python:domain-hook": domainHandler(pythonPolicy),
  "quality:engineering-quality-post": qualityHandler,
  "quality:engineering-quality-pre": qualityPreHandler,
  "quality:engineering-quality-stop": qualityStopHandler,
  "react-native:domain-hook": domainHandler(reactNativePolicy),
  "rust:domain-hook": domainHandler(rustPolicy),
  "source:source-integrity": ownerHookHandler(runSourceIntegrity),
  "web:domain-hook": domainHandler(webPolicy),
});
