import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyPath,
  extractTestEvidence,
  sourceAuthorizedByTest,
} from "../scripts/lib/patterns.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/tdd-guard.mjs", import.meta.url));

function runRawHook(mode, input, env = {}, platform = "codex") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, platform], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function runHook(mode, event, env = {}, platform = "codex") {
  return runRawHook(mode, JSON.stringify(event), env, platform);
}

function fixture(prefix = "tdd-guard-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const data = mkdtempSync(join(tmpdir(), `${prefix}data-`));
  return { root, data };
}

function writeEvent(root, relativePath, content, toolUseId) {
  return {
    cwd: root,
    session_id: "session-1",
    tool_name: "Write",
    tool_use_id: toolUseId,
    tool_input: { file_path: join(root, relativePath), content },
  };
}

test("classifies fixed test and implementation patterns for six languages", () => {
  const cases = [
    ["tests/Unit/OrderServiceTest.php", "test", "php"],
    ["src/Service/OrderService.php", "source", "php"],
    ["tests/test_order_service.py", "test", "python"],
    ["src/order_service.py", "source", "python"],
    ["src/order-service.test.js", "test", "javascript"],
    ["src/order-service.js", "source", "javascript"],
    ["src/order-service.spec.ts", "test", "typescript"],
    ["src/order-service.ts", "source", "typescript"],
    ["tests/order_service.rs", "test", "rust"],
    ["src/order_service.rs", "source", "rust"],
    ["service/order_service_test.go", "test", "go"],
    ["service/order_service.go", "source", "go"],
  ];
  for (const [path, kind, language] of cases) {
    assert.deepEqual(classifyPath(path), { kind, language });
  }
  assert.deepEqual(classifyPath("vendor/acme/OrderService.php"), { kind: "ignored", language: null });
  assert.deepEqual(classifyPath("README.md"), { kind: "ignored", language: null });
});

test("extracts a real test identity and referenced implementation symbol", () => {
  const evidence = extractTestEvidence("php", [
    "<?php",
    "use App\\Service\\OrderService;",
    "final class OrderServiceTest extends TestCase {",
    "    public function test_creates_an_order(): void {",
    "        $service = new OrderService();",
    "    }",
    "}",
  ].join("\n"));
  assert.equal(evidence.valid, true);
  assert.ok(evidence.testNames.includes("test_creates_an_order"));
  assert.ok(evidence.references.includes("OrderService"));
  assert.equal(extractTestEvidence("php", "<?php\n// placeholder\n").valid, false);
  assert.equal(extractTestEvidence("php", "<?php\nfinal class OrderServiceTest extends TestCase {}\n").valid, false);
  assert.equal(extractTestEvidence("python", "class TestOrderService:\n    pass\n").valid, false);
  assert.equal(extractTestEvidence("javascript", "describe('orders', () => {});\n").valid, false);
  assert.equal(extractTestEvidence("php", "<?php\n#[Test]\nfunction creates_an_order(): void {}\n").valid, true);
});

test("commented-out declarations do not count as test-first evidence", () => {
  const cases = [
    ["php", "<?php\n// function test_total(): void { PriceCalculator::total(); }\n"],
    ["python", "# def test_total():\n#     PriceCalculator()\n"],
    ["javascript", "// test('totals price', () => priceTotal());\n"],
    ["typescript", "/* it('totals price', () => new PriceCalculator()); */\n"],
    ["rust", "// #[test]\n// fn totals_price() { PriceCalculator::new(); }\n"],
    ["go", "// func TestPriceTotal(t *testing.T) { PriceTotal() }\n"],
  ];
  for (const [language, content] of cases) {
    assert.equal(extractTestEvidence(language, content).valid, false, language);
  }
});

test("authorizes only conventionally or symbol-related implementation files", () => {
  const testRecord = {
    path: "tests/Unit/OrderServiceTest.php",
    language: "php",
    evidence: extractTestEvidence("php", [
      "<?php",
      "use App\\Service\\OrderService;",
      "final class OrderServiceTest extends TestCase {",
      "    public function test_creates_an_order(): void {}",
      "}",
    ].join("\n")),
  };
  assert.equal(sourceAuthorizedByTest({
    path: "src/Service/OrderService.php",
    language: "php",
    content: "<?php\nfinal class OrderService {}\n",
  }, testRecord), true);
  assert.equal(sourceAuthorizedByTest({
    path: "src/Service/InvoiceService.php",
    language: "php",
    content: "<?php\nfinal class InvoiceService {}\n",
  }, testRecord), false);
});

test("recognizes concrete test declarations for every supported language", () => {
  const cases = [
    ["php", "<?php\nfunction test_total(): void { new PriceCalculator(); }\n", "test_total", "PriceCalculator"],
    ["python", "from app.price import PriceCalculator\ndef test_total():\n    PriceCalculator()\n", "test_total", "PriceCalculator"],
    ["javascript", "import { priceTotal } from './price.js';\ntest('totals price', () => priceTotal());\n", "totals price", "priceTotal"],
    ["typescript", "import { PriceCalculator } from './price';\nit('totals price', () => new PriceCalculator());\n", "totals price", "PriceCalculator"],
    ["rust", "use crate::price::PriceCalculator;\n#[test]\nfn totals_price() { PriceCalculator::new(); }\n", "totals_price", "PriceCalculator"],
    ["go", "package price\nfunc TestPriceTotal(t *testing.T) { PriceTotal() }\n", "TestPriceTotal", "PriceTotal"],
  ];
  for (const [language, content, testName, reference] of cases) {
    const evidence = extractTestEvidence(language, content);
    assert.equal(evidence.valid, true, language);
    assert.ok(evidence.testNames.includes(testName), language);
    assert.ok(evidence.references.includes(reference), language);
  }
});

test("public hook blocks a PHP class write before a related test mutation", async () => {
  const fx = fixture("tdd-guard-block-");
  try {
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const source = writeEvent(
      fx.root,
      "src/Service/OrderService.php",
      "<?php\nfinal class OrderService {}\n",
      "source-1",
    );
    const result = await runHook("pre", source, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /OrderServiceTest\.php/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("public pre hook fails closed when its event cannot be validated", async () => {
  const result = await runHook("pre", {
    cwd: { invalid: true },
    session_id: "session-1",
    tool_name: "Write",
    tool_use_id: "invalid-1",
    tool_input: { file_path: "src/OrderService.php", content: "<?php class OrderService {}" },
  }, {
    AI_EXPERTS_SESSION_ID: "session-1",
    AI_EXPERTS_TRIGGER_FROM: "test",
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /could not validate/u);
});

test("public pre hook fails closed when its input is malformed", async () => {
  const result = await runRawHook("pre", "{not-json", {
    AI_EXPERTS_SESSION_ID: "session-1",
    AI_EXPERTS_TRIGGER_FROM: "test",
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /could not parse/u);
});

test("public hook records a test-first write and then allows related implementation", async () => {
  const fx = fixture("tdd-guard-allow-");
  try {
    mkdirSync(join(fx.root, "tests", "Unit"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const testContent = [
      "<?php",
      "use App\\Service\\OrderService;",
      "final class OrderServiceTest extends TestCase {",
      "    public function test_creates_an_order(): void {",
      "        $service = new OrderService();",
      "    }",
      "}",
      "",
    ].join("\n");
    const testWrite = writeEvent(fx.root, "tests/Unit/OrderServiceTest.php", testContent, "test-1");
    const before = await runHook("pre", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(before.stdout, "");
    writeFileSync(join(fx.root, "tests", "Unit", "OrderServiceTest.php"), testContent);
    const after = await runHook("post", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(after.stdout, "");

    const revisedContent = testContent.replace("$service = new OrderService();", "$service = new OrderService();\n        self::assertNotNull($service);");
    const revisedWrite = writeEvent(fx.root, "tests/Unit/OrderServiceTest.php", revisedContent, "test-2");
    await runHook("pre", revisedWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    }, "claude");
    writeFileSync(join(fx.root, "tests", "Unit", "OrderServiceTest.php"), revisedContent);
    const claudeAfter = await runHook("post", revisedWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    }, "claude");
    assert.match(claudeAfter.stdout, /Recorded test-first evidence/u);

    const sourceWrite = writeEvent(
      fx.root,
      "src/Service/OrderService.php",
      "<?php\nfinal class OrderService {}\n",
      "source-1",
    );
    const allowed = await runHook("pre", sourceWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("mixed test and implementation patches are denied before either file changes", async () => {
  const fx = fixture("tdd-guard-mixed-");
  try {
    const event = {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "apply_patch",
      tool_use_id: "mixed-1",
      tool_input: {
        patch: [
          "*** Add File: tests/Unit/OrderServiceTest.php",
          "+<?php final class OrderServiceTest {}",
          "*** Add File: src/Service/OrderService.php",
          "+<?php final class OrderService {}",
        ].join("\n"),
      },
    };
    const result = await runHook("pre", event, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /separate tool calls/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("Codex apply_patch command payload cannot bypass source-first denial", async () => {
  const fx = fixture("tdd-guard-codex-patch-");
  try {
    const event = {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "apply_patch",
      tool_use_id: "source-1",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Add File: src/Service/InvoiceService.php",
          "+<?php final class InvoiceService {}",
          "*** End Patch",
        ].join("\n"),
      },
    };
    const result = await runHook("pre", event, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("common shell redirection cannot create implementation before a test", async () => {
  const fx = fixture("tdd-guard-shell-");
  try {
    const result = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "shell-1",
      tool_input: { cmd: "printf '<?php class OrderService {}' > src/OrderService.php" },
    }, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("state stores hashes instead of raw test source", async () => {
  const fx = fixture("tdd-guard-state-");
  try {
    mkdirSync(join(fx.root, "tests"), { recursive: true });
    const content = "def test_total():\n    return OrderService()\n";
    const event = writeEvent(fx.root, "tests/test_order_service.py", content, "test-1");
    const env = {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    };
    await runHook("pre", event, env);
    writeFileSync(join(fx.root, "tests", "test_order_service.py"), content);
    await runHook("post", event, env);
    const stateFiles = [];
    const queue = [fx.data];
    while (queue.length > 0) {
      const directory = queue.pop();
      for (const name of (await import("node:fs")).readdirSync(directory)) {
        const path = join(directory, name);
        if ((await import("node:fs")).statSync(path).isDirectory()) queue.push(path);
        else stateFiles.push(path);
      }
    }
    assert.equal(stateFiles.length, 1);
    const stored = readFileSync(stateFiles[0], "utf8");
    assert.doesNotMatch(stored, /def test_total/u);
    assert.match(stored, /[a-f0-9]{64}/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});
