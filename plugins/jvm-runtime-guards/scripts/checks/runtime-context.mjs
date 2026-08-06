import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

const DAY = 24 * 60 * 60 * 1000;
function findUp(names, from) { let current = resolve(from), root = parse(current).root; while (true) { for (const name of names) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; } if (current === root) return null; current = dirname(current); } }
function reserve(cwd) { const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; if (!data) return true; const path = join(data, "jvm-runtime-guards", "environment.json"); try { if (Date.now() - statSync(path).mtimeMs < DAY) return false; } catch { /* First injection. */ } try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify({ cwd, at: new Date().toISOString() })}\n`); return true; } catch { return false; } }

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd(), pom = findUp(["pom.xml"], cwd), gradle = findUp(["build.gradle.kts", "build.gradle"], cwd);
  if (!pom && !gradle || !reserve(cwd)) return null;
  const facts = [];
  if (pom) {
    const text = readFileSync(pom, "utf8"); facts.push("Build tool: Maven");
    const java = text.match(/<(?:java\.version|maven\.compiler\.source)>([^<]+)/u)?.[1]; if (java) facts.push(`Java version: ${java}`);
    const spring = text.match(/spring-boot-starter-parent<\/artifactId>[\s\S]*?<version>([^<]+)/u)?.[1]; if (spring) facts.push(`Spring Boot: ${spring}`);
    if (existsSync(join(dirname(pom), "mvnw"))) facts.push("Use Maven Wrapper: ./mvnw");
  } else if (gradle) {
    const text = readFileSync(gradle, "utf8"), kotlin = gradle.endsWith(".kts") || /kotlin/iu.test(text); facts.push(`Build tool: Gradle${gradle.endsWith(".kts") ? " (Kotlin DSL)" : ""}`);
    const java = text.match(/sourceCompatibility\s*=\s*["']?([^"'\s]+)/u)?.[1] ?? text.match(/JavaVersion\.VERSION_(\d+)/u)?.[1] ?? text.match(/jvmTarget\s*=\s*["']([^"']+)/u)?.[1]; if (java) facts.push(`JVM target: ${java}`);
    if (kotlin) { const version = text.match(/kotlin\(["']jvm["']\)\s+version\s+["']([^"']+)/u)?.[1]; facts.push(`Language: Kotlin${version ? ` ${version}` : ""}`); }
    if (/spring-boot|org\.springframework\.boot/iu.test(text)) facts.push("Framework: Spring Boot"); else if (/ktor/iu.test(text)) facts.push("Framework: Ktor"); else if (/androidx\.compose|\bcompose\b/iu.test(text)) facts.push("UI: Jetpack Compose");
    if (existsSync(join(dirname(gradle), "gradlew"))) facts.push("Use Gradle Wrapper: ./gradlew");
  }
  return facts.length ? ["[Java/Kotlin Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}
