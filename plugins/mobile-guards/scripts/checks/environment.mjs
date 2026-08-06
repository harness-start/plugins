import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

function readText(path) {
  try { return readFileSync(path, "utf8").slice(0, 512 * 1024).trim(); }
  catch { return ""; }
}

function findUp(start, names) {
  let current = start;
  while (true) {
    for (const name of names) {
      const candidate = join(current, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parsePubspec(text) {
  const dependencies = new Set();
  const environment = {};
  let section = null;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^(\s*)([A-Za-z_][\w-]*):(?:\s*(.*))?$/u);
    if (!match) continue;
    const indent = match[1].length;
    if (indent === 0) { section = ["environment", "dependencies", "dev_dependencies"].includes(match[2]) ? match[2] : null; continue; }
    if (!section) continue;
    if (section === "environment" && match[3]?.trim()) environment[match[2]] = match[3].trim().replace(/^(['"])(.*)\1$/u, "$2");
    if (section !== "environment") dependencies.add(match[2]);
  }
  return { dependencies, environment };
}

function flutterFacts(cwd) {
  const pubspec = findUp(cwd, ["pubspec.yaml"]);
  if (!pubspec) return null;
  const root = dirname(pubspec);
  const parsed = parsePubspec(readText(pubspec));
  const facts = [];
  if (existsSync(join(root, "android")) || existsSync(join(root, "ios"))) facts.push("Platform: Flutter");
  if (parsed.environment.sdk) facts.push(`Dart SDK: ${parsed.environment.sdk}`);
  if (parsed.environment.flutter) facts.push(`Flutter SDK: ${parsed.environment.flutter}`);
  const state = [["flutter_riverpod", "Riverpod"], ["riverpod", "Riverpod"], ["flutter_bloc", "BLoC"], ["bloc", "BLoC"], ["provider", "Provider"], ["get", "GetX"]].filter(([dependency]) => parsed.dependencies.has(dependency)).map(([, label]) => label);
  if (state.length) facts.push(`State management: ${[...new Set(state)].join(", ")}`);
  const libraries = [["dio", "Dio"], ["retrofit", "Retrofit"], ["go_router", "GoRouter"], ["freezed", "Freezed"]].filter(([dependency]) => parsed.dependencies.has(dependency)).map(([, label]) => label);
  if (libraries.length) facts.push(`Key libraries: ${libraries.join(", ")}`);
  return facts.length ? ["[Flutter Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

function androidFacts(cwd) {
  const settings = findUp(cwd, ["settings.gradle.kts", "settings.gradle"]);
  if (!settings) return null;
  const root = dirname(settings);
  const rootBuild = findUp(root, ["build.gradle.kts", "build.gradle"]);
  const appBuild = [join(root, "app", "build.gradle.kts"), join(root, "app", "build.gradle")].find(existsSync);
  const rootText = rootBuild ? readText(rootBuild) : "";
  const appText = appBuild ? readText(appBuild) : "";
  const facts = [];
  const patterns = [
    ["AGP", /(?:com\.android\.application['"]?\)?\s*version\s*['"]|com\.android\.tools\.build:gradle:)([0-9]+(?:\.[0-9]+)+)/u, rootText],
    ["Kotlin", /(?:org\.jetbrains\.kotlin\.android['"]?\)?\s*version\s*['"]|kotlin[_-]version\s*=\s*['"])([0-9]+(?:\.[0-9]+)+)/u, rootText],
    ["compileSdk", /compileSdk(?:Version)?\s*[=:]?\s*(\d+)/u, appText],
    ["minSdk", /minSdk(?:Version)?\s*[=:]?\s*(\d+)/u, appText],
    ["targetSdk", /targetSdk(?:Version)?\s*[=:]?\s*(\d+)/u, appText],
  ];
  for (const [label, pattern, text] of patterns) { const match = text.match(pattern); if (match) facts.push(`${label}: ${match[1]}`); }
  if (/compose/iu.test(appText)) facts.push("Jetpack Compose: yes");
  const wrapper = readText(join(root, "gradle", "wrapper", "gradle-wrapper.properties"));
  const version = wrapper.match(/gradle-(\d+\.\d+(?:\.\d+)?)/u);
  if (version) facts.push(`Gradle: ${version[1]}`);
  return facts.length ? ["[Android Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

function appleFacts(cwd) {
  const packageFile = findUp(cwd, ["Package.swift"]);
  const podfile = findUp(cwd, ["Podfile"]);
  const swiftVersion = findUp(cwd, [".swift-version"]);
  let root = packageFile ? dirname(packageFile) : podfile ? dirname(podfile) : cwd;
  let entries = [];
  try { entries = readdirSync(root); } catch {}
  const project = entries.some((entry) => entry.endsWith(".xcodeproj"));
  const workspace = entries.some((entry) => entry.endsWith(".xcworkspace"));
  if (!packageFile && !podfile && !swiftVersion && !project && !workspace) return null;
  const facts = [];
  if (swiftVersion) facts.push(`Swift version: ${readText(swiftVersion)}`);
  if (packageFile) {
    const text = readText(packageFile);
    facts.push("Package manager: Swift Package Manager");
    const tools = text.match(/swift-tools-version:\s*(\S+)/u); if (tools) facts.push(`swift-tools-version: ${tools[1]}`);
    const platforms = ["iOS", "macOS", "watchOS", "tvOS", "visionOS"].filter((name) => text.includes(`.${name}`));
    if (platforms.length) facts.push(`Platform: ${platforms.join(", ")}`);
  }
  if (workspace) facts.push("Xcode Workspace: yes"); else if (project) facts.push("Xcode Project: yes");
  if (podfile) facts.push("CocoaPods: yes");
  return ["[Apple Env]", ...facts.map((fact) => `  ${fact}`)].join("\n");
}

export function mobileEnvironment(cwd) {
  const reports = [flutterFacts(cwd), androidFacts(cwd), appleFacts(cwd)].filter(Boolean);
  return reports.length ? reports.join("\n\n") : null;
}
