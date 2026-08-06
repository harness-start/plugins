import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const FRONTEND_EXTENSIONS = new Set([
  ".vue", ".svelte", ".html", ".htm", ".css", ".scss", ".less",
  ".sass", ".svg", ".ejs", ".hbs", ".wxml", ".wxss", ".wxs",
]);

function readText(filePath) {
  try {
    const bytes = readFileSync(filePath);
    if (bytes.length > 2 * 1024 * 1024) return null;
    return { bytes, text: bytes.toString("utf8") };
  } catch {
    return null;
  }
}

export function encodingReport(filePath) {
  if (!FRONTEND_EXTENSIONS.has(extname(filePath).toLowerCase())) return null;
  const content = readText(filePath);
  if (!content) return null;
  const issues = [];
  if (content.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) issues.push("UTF-8 BOM");
  if (content.text.includes("\uFFFD")) issues.push("invalid UTF-8 replacement character");
  return issues.length ? `[Frontend Encoding Guard] ${filePath}: ${issues.join(", ")}` : null;
}

function wxmlReport(filePath, text) {
  const errors = [];
  const source = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<wxs[\s>][\s\S]*?<\/wxs>/g, "");
  const opens = source.match(/\{\{/g)?.length ?? 0;
  const closes = source.match(/\}\}/g)?.length ?? 0;
  if (opens !== closes) errors.push(`Mustache 表达式不配对：{{ ${opens} 次，}} ${closes} 次`);
  const stack = [];
  const voidTags = new Set(["image", "img", "input", "import", "include", "icon", "progress", "slider", "switch", "br", "hr", "video"]);
  for (const match of source.matchAll(/<\s*(\/)?\s*([a-z][\w-]*)(?:\s[^<>]*?)?(\/)?\s*>/giu)) {
    const [, closing, rawTag, selfClosing] = match;
    const tag = rawTag.toLowerCase();
    if (voidTags.has(tag) || selfClosing) continue;
    if (!closing) stack.push(tag);
    else if (stack.at(-1) === tag) stack.pop();
    else errors.push(`标签 </${tag}> 没有匹配的开始标签`);
  }
  if (stack.length) errors.push(`标签未闭合: <${stack.slice(-5).reverse().join(">, <")}>`);
  return errors.length ? `[WXML] ${errors.join("\n")}` : null;
}

function wxssReport(text) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(["'])(?:(?!\1)[^\\\n]|\\[\s\S])*\1/g, '""');
  const opens = stripped.match(/\{/g)?.length ?? 0;
  const closes = stripped.match(/\}/g)?.length ?? 0;
  const errors = [];
  if (opens !== closes) errors.push(`花括号不配对：{ ${opens} 次，} ${closes} 次`);
  if (/[；：，]/u.test(stripped)) errors.push("检测到中文标点，请改用 CSS 半角标点");
  return errors.length ? `[WXSS] ${errors.join("\n")}` : null;
}

function taroReport(text) {
  if (!/from\s+['"]@tarojs\//u.test(text)) return null;
  const stripped = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const errors = [];
  if (/\bdocument\.(?:getElementById|querySelector|querySelectorAll|createElement|body|head)\b/u.test(stripped)) errors.push("document.* 在小程序环境中不存在，请使用 Taro.createSelectorQuery()");
  if (/\bwindow\.(?:location|history|navigator|localStorage|sessionStorage)\b/u.test(stripped)) errors.push("window.* 在小程序环境中不存在，请使用 Taro 对应 API");
  if (/\b(?:alert|confirm|prompt)\s*\(/u.test(stripped)) errors.push("浏览器弹窗 API 在小程序中不可用，请使用 Taro.showModal/showToast");
  if (/from\s+['"]react-dom['"]/u.test(text)) errors.push("Taro 组件不应导入 react-dom");
  return errors.length ? `[Taro/MiniProgram] ${errors.join("\n")}` : null;
}

function miniProgramConfigReport(filePath, text) {
  if (extname(filePath).toLowerCase() !== ".json") return null;
  const name = basename(filePath);
  if (!["app.json", "project.config.json", "sitemap.json"].includes(name) && !/["']?(?:usingComponents|component|navigationBarTitleText)["']?\s*:/u.test(text)) return null;
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    return `[WeChat Mini Program Config] 配置 JSON 语法错误: ${error.message}`;
  }
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) errors.push("小程序配置必须是 JSON 对象");
  if (name === "app.json" && (!Array.isArray(config.pages) || config.pages.length === 0 || config.pages.some((page) => typeof page !== "string" || !page.trim()))) errors.push("pages 必须是非空字符串数组");
  if (config.usingComponents !== undefined && (!config.usingComponents || typeof config.usingComponents !== "object" || Array.isArray(config.usingComponents))) errors.push("usingComponents 必须是对象");
  if (config.component !== undefined && typeof config.component !== "boolean") errors.push("component 必须是布尔值");
  return errors.length ? `[WeChat Mini Program Config] ${errors.join("\n")}` : null;
}

function localBinary(name, filePath) {
  let current = dirname(filePath);
  while (true) {
    const candidate = join(current, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function frameworkTypeReport(filePath) {
  const extension = extname(filePath).toLowerCase();
  const binary = extension === ".vue" ? localBinary("vue-tsc", filePath) : extension === ".svelte" ? localBinary("svelte-check", filePath) : null;
  if (!binary) return null;
  const args = extension === ".vue" ? ["--noEmit", filePath] : ["--tsconfig", "./tsconfig.json", "--fail-on-warnings", "--fail-on-hints"];
  try {
    execFileSync(binary, args, { cwd: dirname(filePath), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
    return null;
  } catch (error) {
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.trim().split("\n").slice(0, 8).join("\n");
    return output ? `[${extension === ".vue" ? "Vue SFC Type Check" : "Svelte Check"}] ${output}` : null;
  }
}

export function fileReports(filePath) {
  const content = readText(filePath);
  if (!content) return [];
  const extension = extname(filePath).toLowerCase();
  return [
    encodingReport(filePath),
    extension === ".wxml" ? wxmlReport(filePath, content.text) : null,
    extension === ".wxss" ? wxssReport(content.text) : null,
    [".ts", ".tsx", ".js", ".jsx"].includes(extension) ? taroReport(content.text) : null,
    miniProgramConfigReport(filePath, content.text),
    frameworkTypeReport(filePath),
  ].filter(Boolean);
}
