#!/usr/bin/env node

import { spawn } from "node:child_process";

const pageUrl = process.argv[2];
if (!pageUrl) throw new Error("usage: check-layout.mjs <file-url>");
const mode = process.argv[3] ?? "layout";
if (!new Set(["layout", "disclosure"]).has(mode)) throw new Error(`unknown inspection mode: ${mode}`);

const chrome = spawn("chromium", [
  "--headless",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--hide-scrollbars",
  "--remote-debugging-pipe",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });

const commandInput = chrome.stdio[3];
const commandOutput = chrome.stdio[4];
if (!commandInput || !commandOutput) throw new Error("Chromium debugging pipe is unavailable");

let nextId = 1;
let buffer = Buffer.alloc(0);
const pending = new Map();
const waiters = [];

function failPending(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
  for (const waiter of waiters.splice(0)) waiter.reject(error);
}

commandOutput.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let boundary = buffer.indexOf(0);
  while (boundary >= 0) {
    const raw = buffer.subarray(0, boundary).toString("utf8");
    buffer = buffer.subarray(boundary + 1);
    if (raw) {
      const message = JSON.parse(raw);
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result ?? {});
      } else if (message.method) {
        for (const waiter of [...waiters]) {
          if (waiter.method !== message.method || waiter.sessionId !== message.sessionId) continue;
          waiters.splice(waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(message.params ?? {});
        }
      }
    }
    boundary = buffer.indexOf(0);
  }
});

chrome.once("error", failPending);
chrome.once("exit", (code) => {
  if (code && pending.size > 0) failPending(new Error(`Chromium exited with ${code}`));
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    commandInput.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}

function waitFor(method, sessionId) {
  return new Promise((resolve, reject) => {
    const waiter = { method, sessionId, resolve, reject, timer: undefined };
    waiter.timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error(`CDP event timeout: ${method}`));
    }, 10_000);
    waiters.push(waiter);
  });
}

const expression = `(() => {
  const primary = document.querySelector('a[href="#activity"], button[data-primary], .primary-action');
  const primaryStyle = primary ? getComputedStyle(primary) : null;
  const primaryRect = primary ? primary.getBoundingClientRect() : null;
  const cards = [...document.querySelectorAll('#activity dl > div, [data-layout-card]')]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    });
  const parseTimes = (value) => value.split(',').map((part) => {
    const text = part.trim();
    return text.endsWith('ms') ? Number.parseFloat(text) / 1000 : Number.parseFloat(text) || 0;
  });
  let maxMotionSeconds = 0;
  let transitionAll = false;
  for (const element of document.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    maxMotionSeconds = Math.max(maxMotionSeconds, ...parseTimes(style.transitionDuration), ...parseTimes(style.animationDuration));
    transitionAll ||= style.transitionProperty.split(',').map((item) => item.trim()).includes('all') && parseTimes(style.transitionDuration).some((item) => item > 0);
  }
  return {
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    primaryVisible: Boolean(primaryRect && primaryRect.width > 0 && primaryRect.height > 0 && primaryRect.left >= 0 && primaryRect.right <= innerWidth + 1),
    focusVisible: Boolean(primary === document.activeElement && primaryStyle && ((primaryStyle.outlineStyle !== 'none' && Number.parseFloat(primaryStyle.outlineWidth) > 0) || primaryStyle.boxShadow !== 'none')),
    cards,
    maxMotionSeconds,
    transitionAll,
  };
})()`;

async function inspect(sessionId, width, height, reducedMotion) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
  }, sessionId);
  const loaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: pageUrl }, sessionId);
  await loaded;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  const result = await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  return result.result?.value;
}

const disclosureExpression = `(async () => {
  const trigger = document.querySelector('button[aria-expanded][aria-controls]');
  const panel = trigger ? document.getElementById(trigger.getAttribute('aria-controls')) : null;
  if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
    return { latestOpen: false, panelVisible: false, focusRetained: false, transitionAll: false, maxMotionSeconds: 0 };
  }
  trigger.focus();
  if (trigger.getAttribute('aria-expanded') === 'true') trigger.click();
  trigger.click();
  trigger.click();
  trigger.click();
  await new Promise((resolve) => setTimeout(resolve, 700));
  const panelStyle = getComputedStyle(panel);
  const panelRect = panel.getBoundingClientRect();
  const parseTimes = (value) => value.split(',').map((part) => {
    const text = part.trim();
    return text.endsWith('ms') ? Number.parseFloat(text) / 1000 : Number.parseFloat(text) || 0;
  });
  let maxMotionSeconds = 0;
  let transitionAll = false;
  for (const element of document.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    const durations = parseTimes(style.transitionDuration);
    maxMotionSeconds = Math.max(maxMotionSeconds, ...durations, ...parseTimes(style.animationDuration));
    transitionAll ||= style.transitionProperty.split(',').map((item) => item.trim()).includes('all') && durations.some((item) => item > 0);
  }
  const panelVisible = !panel.hidden
    && panelStyle.display !== 'none'
    && panelStyle.visibility !== 'hidden'
    && Number.parseFloat(panelStyle.opacity) > 0.9
    && panelRect.height > 0;
  const expanded = trigger.getAttribute('aria-expanded') === 'true';
  return {
    latestOpen: expanded && panelVisible,
    panelVisible,
    focusRetained: document.activeElement === trigger,
    transitionAll,
    maxMotionSeconds,
  };
})()`;

async function inspectDisclosure(sessionId, reducedMotion) {
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
  }, sessionId);
  const loaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: pageUrl }, sessionId);
  await loaded;
  const result = await send("Runtime.evaluate", {
    expression: disclosureExpression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  return result.result?.value;
}

try {
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((target) => target.type === "page");
  if (!page) throw new Error("Chromium page target was not found");
  const attached = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await send("Page.enable", {}, sessionId);
  if (mode === "disclosure") {
    const normal = await inspectDisclosure(sessionId, false);
    const reduced = await inspectDisclosure(sessionId, true);
    process.stdout.write(`${JSON.stringify({ normal, reduced })}\n`);
  } else {
    const desktop = await inspect(sessionId, 1440, 900, false);
    const mobile = await inspect(sessionId, 390, 844, false);
    const reduced = await inspect(sessionId, 390, 844, true);
    process.stdout.write(`${JSON.stringify({ desktop, mobile, reduced })}\n`);
  }
} finally {
  chrome.kill("SIGTERM");
}
