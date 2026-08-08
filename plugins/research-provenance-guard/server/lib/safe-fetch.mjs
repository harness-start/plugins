import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const SENSITIVE_KEYS = /^(?:access[_-]?token|api[_-]?key|auth|authorization|credential|key|password|secret|signature|token)$/iu;
const MAX_BYTES = 8 * 1024 * 1024;

function privateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

export function isPrivateAddress(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return privateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("2001:db8:") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) return privateIpv4(normalized.slice(7));
  return false;
}

async function resolvePublic(hostname) {
  if (["localhost", "localhost.localdomain"].includes(hostname.toLowerCase())) throw new Error("private or local host is not allowed");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("private, loopback, link-local, or metadata address is not allowed");
  return addresses;
}

function validateUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http(s) sources are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  for (const key of url.searchParams.keys()) if (SENSITIVE_KEYS.test(key)) throw new Error(`sensitive query parameter is not allowed: ${key}`);
  return url;
}

async function requestOnce(url, timeoutMs, maxBytes) {
  const addresses = await resolvePublic(url.hostname);
  const transport = url.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "GET",
      headers: { Accept: "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1", "User-Agent": "research-provenance-guard/0.1" },
      lookup(_hostname, _options, callback) {
        const selected = addresses[0];
        callback(null, selected.address, selected.family);
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) response.destroy(new Error(`source exceeds ${maxBytes} byte limit`));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("source request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function safeFetchText(value, { timeoutMs = 15_000, maxBytes = MAX_BYTES, maxRedirects = 5 } = {}) {
  let url = validateUrl(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await requestOnce(url, timeoutMs, maxBytes);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === maxRedirects) throw new Error("too many redirects");
      if (!response.headers.location) throw new Error("redirect is missing Location header");
      url = validateUrl(new URL(response.headers.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`source returned HTTP ${response.status}`);
    const type = String(response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
    const allowed = /^(?:text\/|application\/(?:json|xml|xhtml\+xml))/u.test(type);
    if (!allowed) throw new Error(`unsupported source MIME type: ${type || "unknown"}`);
    const raw = response.body.toString("utf8");
    if (/(?:sign in|log in|captcha|access denied|verify you are human)/iu.test(raw.slice(0, 20_000))) throw new Error("source appears to be a login, denial, or challenge page");
    const text = type === "text/html" || type === "application/xhtml+xml"
      ? raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&").replace(/\s+/gu, " ").trim()
      : raw;
    return { finalUrl: url.toString(), contentType: type, text, bytes: response.body.length };
  }
  throw new Error("redirect resolution failed");
}
