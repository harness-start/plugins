import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isRecord } from "@harness/core/hook-event";

import { isProfileId, type ProfileId } from "./profiles.js";

const CONFIG_NAME = ".language-output.mjs";
const USER_CONFIG_RELATIVE_PATH = "harness-start/language-output.json";
const TOP_LEVEL_KEYS = new Set(["defaultProfile", "artifactProfile", "toolFeedback", "stop", "detection"]);
const DETECTION_KEYS = new Set(["minScriptCharacters", "minLetterRatio"]);

export type ToolFeedbackMode = "report" | "off";
export type StopMode = "block" | "off";

export type DetectionConfig = {
  minScriptCharacters: number;
  minLetterRatio: number;
};

export type LanguageConfig = {
  defaultProfile: ProfileId;
  artifactProfile: ProfileId | null;
  toolFeedback: ToolFeedbackMode;
  stop: StopMode;
  detection: DetectionConfig;
};

export const DEFAULT_CONFIG: Readonly<LanguageConfig> = Object.freeze({
  defaultProfile: "zh-CN",
  artifactProfile: null,
  toolFeedback: "report",
  stop: "block",
  detection: Object.freeze({
    minScriptCharacters: 12,
    minLetterRatio: 0.25,
  }),
});

function strictDefault(): LanguageConfig {
  return { ...DEFAULT_CONFIG, detection: { ...DEFAULT_CONFIG.detection } };
}

function isToolFeedbackMode(value: unknown): value is ToolFeedbackMode {
  return value === "report" || value === "off";
}

function isStopMode(value: unknown): value is StopMode {
  return value === "block" || value === "off";
}

export function resolveConfig(source: unknown): LanguageConfig {
  if (!isRecord(source)) {
    throw new Error("default export must be an object");
  }
  if (Object.keys(source).some((key) => !TOP_LEVEL_KEYS.has(key))) {
    throw new Error("unsupported top-level field");
  }
  if (source.defaultProfile !== undefined && !isProfileId(source.defaultProfile)) {
    throw new Error("defaultProfile must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.artifactProfile !== undefined && source.artifactProfile !== null && !isProfileId(source.artifactProfile)) {
    throw new Error("artifactProfile must be null, zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.toolFeedback !== undefined && !isToolFeedbackMode(source.toolFeedback)) {
    throw new Error("toolFeedback must be report or off");
  }
  if (source.stop !== undefined && !isStopMode(source.stop)) {
    throw new Error("stop must be block or off");
  }
  const detection = source.detection ?? {};
  if (!isRecord(detection)) {
    throw new Error("detection must be an object");
  }
  if (Object.keys(detection).some((key) => !DETECTION_KEYS.has(key))) {
    throw new Error("unsupported detection field");
  }
  const minScriptCharacters = detection.minScriptCharacters ?? DEFAULT_CONFIG.detection.minScriptCharacters;
  const minLetterRatio = detection.minLetterRatio ?? DEFAULT_CONFIG.detection.minLetterRatio;
  if (typeof minScriptCharacters !== "number" || !Number.isInteger(minScriptCharacters) || minScriptCharacters < 1 || minScriptCharacters > 100) {
    throw new Error("minScriptCharacters must be an integer from 1 to 100");
  }
  if (typeof minLetterRatio !== "number" || minLetterRatio < 0.01 || minLetterRatio > 1) {
    throw new Error("minLetterRatio must be a number from 0.01 to 1");
  }
  return {
    defaultProfile: isProfileId(source.defaultProfile) ? source.defaultProfile : DEFAULT_CONFIG.defaultProfile,
    artifactProfile: isProfileId(source.artifactProfile) ? source.artifactProfile : null,
    toolFeedback: isToolFeedbackMode(source.toolFeedback) ? source.toolFeedback : DEFAULT_CONFIG.toolFeedback,
    stop: isStopMode(source.stop) ? source.stop : DEFAULT_CONFIG.stop,
    detection: { minScriptCharacters, minLetterRatio },
  };
}

function repoRoot(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

export function userConfigPath(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.HARNESS_HOST === "claude") {
    return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), USER_CONFIG_RELATIVE_PATH);
  }
  if (env.HARNESS_HOST === "codex") {
    return join(env.CODEX_HOME || join(homedir(), ".codex"), USER_CONFIG_RELATIVE_PATH);
  }
  return null;
}

function loadUserConfig(path: string | null): unknown {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function loadConfig(cwd: string, warn: (message: string) => void = () => {}): Promise<{
  config: LanguageConfig;
  path: string | null;
}> {
  const root = repoRoot(isAbsolute(cwd) ? cwd : resolve(cwd));
  const path = join(root, CONFIG_NAME);
  const globalPath = userConfigPath();
  if (!existsSync(path)) {
    if (!globalPath || !existsSync(globalPath)) {
      return { config: strictDefault(), path: null };
    }
    try {
      return { config: resolveConfig(loadUserConfig(globalPath)), path: globalPath };
    } catch (error) {
      warn(`invalid ${globalPath}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
      return { config: strictDefault(), path: globalPath };
    }
  }
  try {
    const imported = await import(`${pathToFileURL(path).href}?language-output=${Date.now()}`);
    return { config: resolveConfig(imported.default ?? imported), path };
  } catch (error) {
    warn(`invalid ${path}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
    return { config: strictDefault(), path };
  }
}
