import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyPath,
  expectedTestExample,
  extractTestEvidence,
  resolveLanguageContext,
  sourceAuthorizedByTest,
} from "../scripts/lib/patterns.mjs";
import { proposedContent } from "../scripts/lib/hook-io.mjs";

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

const HOOK_ENV = {
  AI_EXPERTS_SESSION_ID: "session-1",
  AI_EXPERTS_TRIGGER_FROM: "test",
};

function hookEnv(data) {
  return { ...HOOK_ENV, PLUGIN_DATA: data };
}

function phpOrderServicePair() {
  return {
    testPath: "tests/Unit/Service/OrderServiceTest.php",
    sourcePath: "src/Service/OrderService.php",
    testContent: [
      "<?php",
      "namespace Tests\\Unit\\Service;",
      "use PHPUnit\\Framework\\Attributes\\CoversClass;",
      "use App\\Service\\OrderService;",
      "#[CoversClass(OrderService::class)]",
      "final class OrderServiceTest extends TestCase {",
      "    public function test_creates_an_order(): void {",
      "        $service = new OrderService();",
      "    }",
      "}",
      "",
    ].join("\n"),
    sourceContent: "<?php\nnamespace App\\Service;\nfinal class OrderService {}\n",
  };
}

function seedPhpOrderService(root) {
  const pair = phpOrderServicePair();
  mkdirSync(join(root, "tests", "Unit", "Service"), { recursive: true });
  mkdirSync(join(root, "src", "Service"), { recursive: true });
  writeFileSync(join(root, pair.testPath), pair.testContent);
  writeFileSync(join(root, pair.sourcePath), pair.sourceContent);
  return pair;
}

test("classifies fixed test and implementation patterns for six languages", () => {
  const cases = [
    ["tests/Unit/Service/OrderServiceTest.php", "test", "php"],
    ["tests/Service/OrderServiceTest.php", "test", "php"],
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

test("PHP CoversClass binds the exact FQCN and rejects a same-named class", () => {
  const testPath = "tests/Unit/Billing/OrderServiceTest.php";
  const testRecord = {
    path: testPath,
    language: "php",
    evidence: extractTestEvidence("php", [
      "<?php",
      "namespace Tests\\Unit\\Billing;",
      "use PHPUnit\\Framework\\Attributes\\CoversClass;",
      "use App\\Service\\OrderService;",
      "#[CoversClass(OrderService::class)]",
      "final class OrderServiceTest extends TestCase {",
      "    public function test_creates_an_order(): void { new OrderService(); }",
      "}",
    ].join("\n"), testPath),
  };
  assert.equal(sourceAuthorizedByTest({
    path: "src/Service/OrderService.php",
    language: "php",
    content: "<?php\nnamespace App\\Service;\nfinal class OrderService {}\n",
  }, testRecord), true);
  assert.equal(sourceAuthorizedByTest({
    path: "src/Shipping/OrderService.php",
    language: "php",
    content: "<?php\nnamespace App\\Shipping;\nfinal class OrderService {}\n",
  }, testRecord), false);
});

test("language-specific identities reject same-named entities in another module or package", () => {
  const cases = [
    {
      language: "python",
      testPath: "tests/unit/test_order_service.py",
      testContent: "from app.billing.order_service import OrderService\ndef test_create():\n    OrderService()\n",
      sourcePath: "src/app/billing/order_service.py",
      sourceContent: "class OrderService:\n    pass\n",
      wrongPath: "src/app/shipping/order_service.py",
    },
    {
      language: "javascript",
      testPath: "tests/billing/order-service.test.js",
      testContent: "import { OrderService } from '../../src/billing/order-service.js';\ntest('creates', () => new OrderService());\n",
      sourcePath: "src/billing/order-service.js",
      sourceContent: "export class OrderService {}\n",
      wrongPath: "src/shipping/order-service.js",
    },
    {
      language: "typescript",
      testPath: "tests/billing/order-service.test.ts",
      testContent: "import { OrderService } from '../../src/billing/order-service';\nit('creates', () => new OrderService());\n",
      sourcePath: "src/billing/order-service.ts",
      sourceContent: "export class OrderService {}\n",
      wrongPath: "src/shipping/order-service.ts",
    },
    {
      language: "rust",
      testPath: "crates/shop/tests/order_service.rs",
      testContent: "use shop::billing::{OrderService, Price};\n#[test]\nfn creates() { OrderService::new(); }\n",
      sourcePath: "crates/shop/src/billing.rs",
      sourceContent: "pub struct OrderService;\n",
      wrongPath: "crates/shop/src/shipping.rs",
      context: { rustCrateName: "shop", rustCrateRoot: "crates/shop" },
    },
    {
      language: "go",
      testPath: "billing/order_service_test.go",
      testContent: "package billing\nfunc TestCreate(t *testing.T) { _ = NewOrderService() }\n",
      sourcePath: "billing/order_service.go",
      sourceContent: "package billing\nfunc NewOrderService() *OrderService { return &OrderService{} }\ntype OrderService struct{}\n",
      wrongPath: "shipping/order_service.go",
    },
  ];

  for (const sample of cases) {
    const record = {
      path: sample.testPath,
      language: sample.language,
      evidence: extractTestEvidence(sample.language, sample.testContent, sample.testPath, sample.context),
    };
    assert.equal(sourceAuthorizedByTest({
      path: sample.sourcePath,
      language: sample.language,
      content: sample.sourceContent,
    }, record, sample.context), true, `${sample.language} expected target`);
    assert.equal(sourceAuthorizedByTest({
      path: sample.wrongPath,
      language: sample.language,
      content: sample.sourceContent,
    }, record, sample.context), false, `${sample.language} same-name collision`);
  }
});

test("import aliases preserve the target identity instead of the local simple name", () => {
  const cases = [
    [
      "php",
      "tests/Service/CheckoutTest.php",
      "<?php\nuse App\\Billing\\OrderService as BillingOrder;\n#[CoversClass(BillingOrder::class)]\nfunction test_checkout(): void { new BillingOrder(); }",
      "src/Billing/OrderService.php",
      "<?php namespace App\\Billing; class OrderService {}",
    ],
    [
      "python",
      "tests/test_checkout.py",
      "from app.billing.order_service import OrderService as BillingOrder\ndef test_checkout():\n    BillingOrder()\n",
      "src/app/billing/order_service.py",
      "class OrderService:\n    pass",
    ],
    [
      "javascript",
      "tests/checkout.test.js",
      "import { OrderService as BillingOrder } from '../src/billing/order-service.js';\ntest('checkout', () => new BillingOrder());",
      "src/billing/order-service.js",
      "export class OrderService {}",
    ],
    [
      "typescript",
      "tests/checkout.test.ts",
      "import { OrderService as BillingOrder } from '../src/billing/order-service';\nit('checkout', () => new BillingOrder());",
      "src/billing/order-service.ts",
      "export class OrderService {}",
    ],
    [
      "go",
      "billing/order_service_test.go",
      "package billing_test\nimport billingapi \"example.com/shop/billing\"\nfunc TestCheckout(t *testing.T) { _ = billingapi.NewOrderService() }",
      "billing/order_service.go",
      "package billing\nfunc NewOrderService() {}",
      { goModulePath: "example.com/shop", goModuleRoot: "" },
    ],
  ];
  for (const [language, testPath, testContent, sourcePath, sourceContent, context = {}] of cases) {
    const record = { path: testPath, language, evidence: extractTestEvidence(language, testContent, testPath, context) };
    assert.equal(sourceAuthorizedByTest({ path: sourcePath, language, content: sourceContent }, record, context), true, language);
  }
});

test("Rust and Go dependency identities cannot unlock a same-named local entity", () => {
  const rustDependency = {
    path: "crates/shop/tests/order_service.rs",
    language: "rust",
    evidence: extractTestEvidence(
      "rust",
      "use dependency::billing::OrderService;\n#[test]\nfn creates() { OrderService::new(); }\n",
      "crates/shop/tests/order_service.rs",
      { rustCrateName: "shop", rustCrateRoot: "crates/shop" },
    ),
  };
  assert.equal(sourceAuthorizedByTest({
    path: "crates/shop/src/billing.rs",
    language: "rust",
    content: "pub struct OrderService;\n",
  }, rustDependency, { rustCrateName: "shop", rustCrateRoot: "crates/shop" }), false);

  const goDependency = {
    path: "billing/order_service_test.go",
    language: "go",
    evidence: extractTestEvidence(
      "go",
      "package billing_test\nimport other \"example.net/other/billing\"\nfunc TestCreate(t *testing.T) { other.NewOrderService() }\n",
      "billing/order_service_test.go",
      { goModulePath: "example.com/shop", goModuleRoot: "" },
    ),
  };
  assert.equal(sourceAuthorizedByTest({
    path: "billing/order_service.go",
    language: "go",
    content: "package billing\nfunc NewOrderService() {}\n",
  }, goDependency, { goModulePath: "example.com/shop", goModuleRoot: "" }), false);
});

test("language context uses the nearest Cargo and Go manifests", () => {
  const fx = fixture("tdd-guard-context-");
  try {
    mkdirSync(join(fx.root, "crates", "shop", "src"), { recursive: true });
    writeFileSync(join(fx.root, "Cargo.toml"), "[package]\nname = \"workspace-root\"\n");
    writeFileSync(join(fx.root, "crates", "shop", "Cargo.toml"), [
      "[package]",
      "name = \"shop-package\"",
      "",
      "[lib]",
      "name = \"shop_core\"",
      "",
    ].join("\n"));
    assert.deepEqual(resolveLanguageContext(fx.root, "crates/shop/src/billing.rs", "rust"), {
      rustCrateName: "shop_core",
      rustCrateRoot: "crates/shop",
    });

    mkdirSync(join(fx.root, "services", "pay", "billing"), { recursive: true });
    writeFileSync(join(fx.root, "go.mod"), "module example.com/root\n");
    writeFileSync(join(fx.root, "services", "pay", "go.mod"), "module example.com/pay\n");
    assert.deepEqual(resolveLanguageContext(fx.root, "services/pay/billing/order_service.go", "go"), {
      goModulePath: "example.com/pay",
      goModuleRoot: "services/pay",
    });
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("expected test examples keep the source-relative directory for every language", () => {
  assert.equal(
    expectedTestExample("src/Service/OrderService.php", "php"),
    "tests/Service/OrderServiceTest.php or tests/Unit/Service/OrderServiceTest.php or a test with #[CoversClass(Target::class)]",
  );
  assert.equal(
    expectedTestExample("src/service/order_service.py", "python"),
    "tests/service/test_order_service.py or tests/unit/service/test_order_service.py or a test importing the exact module",
  );
  assert.equal(
    expectedTestExample("src/service/order-service.js", "javascript"),
    "tests/service/order-service.test.js or tests/unit/service/order-service.test.js or src/service/order-service.test.js or a test with an exact relative import",
  );
  assert.equal(
    expectedTestExample("src/service/order-service.ts", "typescript"),
    "tests/service/order-service.test.ts or tests/unit/service/order-service.test.ts or src/service/order-service.test.ts or a test with an exact relative import",
  );
  assert.equal(
    expectedTestExample("src/service/order_service.rs", "rust"),
    "tests/service/order_service.rs or tests/Unit/service/order_service.rs or a test using the exact crate module item",
  );
  assert.equal(
    expectedTestExample("service/order_service.go", "go"),
    "service/order_service_test.go in the same package referencing a declared symbol",
  );
  assert.equal(
    expectedTestExample("crates/shop/src/billing.rs", "rust"),
    "crates/shop/tests/billing.rs or crates/shop/tests/Unit/billing.rs or a test using the exact crate module item",
  );
});

test("directory mirror accepts suite-prefixed and suite-free copies of the source-relative path", () => {
  const cases = [
    ["php", "src/Service/OrderService.php", "<?php class OrderService {}\n", [
      "tests/Service/OrderServiceTest.php",
      "tests/Unit/Service/OrderServiceTest.php",
    ], ["tests/Unit/OrderServiceTest.php", "tests/OrderServiceTest.php"], "<?php function test_creates(): void {}\n"],
    ["python", "src/service/order_service.py", "class OrderService:\n    pass\n", [
      "tests/service/test_order_service.py",
      "tests/unit/service/test_order_service.py",
    ], ["tests/unit/test_order_service.py", "tests/test_order_service.py"], "def test_creates():\n    assert True\n"],
    ["javascript", "src/service/order-service.js", "export class OrderService {}\n", [
      "tests/service/order-service.test.js",
      "tests/unit/service/order-service.test.js",
      "src/service/order-service.test.js",
    ], ["tests/unit/order-service.test.js", "tests/order-service.test.js"], "test('creates', () => true);\n"],
    ["typescript", "src/service/order-service.ts", "export class OrderService {}\n", [
      "tests/service/order-service.test.ts",
      "tests/unit/service/order-service.test.ts",
      "src/service/order-service.test.ts",
    ], ["tests/unit/order-service.test.ts"], "it('creates', () => true);\n"],
    ["rust", "src/service/order_service.rs", "pub struct OrderService;\n", [
      "tests/service/order_service.rs",
      "tests/Unit/service/order_service.rs",
    ], ["tests/order_service.rs"], "#[test]\nfn creates() {}\n"],
    ["go", "service/order_service.go", "package service\ntype OrderService struct{}\n", [
      "service/order_service_test.go",
    ], ["tests/service/order_service_test.go", "tests/Unit/service/order_service_test.go"], "package service\nfunc TestCreate(t *testing.T) {}\n"],
  ];
  for (const [language, sourcePath, sourceContent, allowed, rejected, testContent] of cases) {
    for (const testPath of allowed) {
      const record = { path: testPath, language, evidence: extractTestEvidence(language, testContent, testPath) };
      assert.equal(sourceAuthorizedByTest({ path: sourcePath, language, content: sourceContent }, record), true, `${language} ${testPath}`);
    }
    for (const testPath of rejected) {
      const record = { path: testPath, language, evidence: extractTestEvidence(language, testContent, testPath) };
      assert.equal(sourceAuthorizedByTest({ path: sourcePath, language, content: sourceContent }, record), false, `${language} ${testPath} must not drop directories`);
    }
  }
});

test("directory mirror fallback requires the complete relative path in every language", () => {
  const cases = [
    ["php", "tests/Acceptance/Exception/InvalidArgumentTest.php", "<?php function test_message(): void {}\n", "src/Exception/InvalidArgument.php", "src/Domain/InvalidArgument.php", "<?php class InvalidArgument {}\n"],
    ["python", "tests/unit/billing/test_order_service.py", "def test_create():\n    assert True\n", "src/billing/order_service.py", "src/shipping/order_service.py", "class OrderService:\n    pass\n"],
    ["javascript", "src/billing/__tests__/order-service.test.js", "test('creates', () => true);\n", "src/billing/order-service.js", "src/shipping/order-service.js", "export class OrderService {}\n"],
    ["typescript", "tests/Feature/billing/order-service.test.ts", "it('creates', () => true);\n", "src/billing/order-service.ts", "src/shipping/order-service.ts", "export class OrderService {}\n"],
    ["rust", "crates/shop/tests/Integration/billing.rs", "#[test]\nfn creates() {}\n", "crates/shop/src/billing.rs", "crates/shop/src/shipping.rs", "pub struct OrderService;\n"],
    ["go", "billing/order_service_test.go", "package billing\nfunc TestCreate(t *testing.T) {}\n", "billing/order_service.go", "shipping/order_service.go", "package billing\ntype OrderService struct{}\n"],
  ];
  for (const [language, testPath, testContent, sourcePath, wrongPath, sourceContent] of cases) {
    const record = {
      path: testPath,
      language,
      evidence: extractTestEvidence(language, testContent, testPath),
    };
    assert.equal(sourceAuthorizedByTest({ path: sourcePath, language, content: sourceContent }, record), true, `${language} mirrored path`);
    assert.equal(sourceAuthorizedByTest({ path: wrongPath, language, content: sourceContent }, record), false, `${language} wrong directory`);
  }
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
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Service\/OrderServiceTest\.php/u);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Unit\/Service\/OrderServiceTest\.php/u);
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
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const testContent = [
      "<?php",
      "namespace Tests\\Unit\\Service;",
      "use PHPUnit\\Framework\\Attributes\\CoversClass;",
      "use App\\Service\\OrderService;",
      "#[CoversClass(OrderService::class)]",
      "final class OrderServiceTest extends TestCase {",
      "    public function test_creates_an_order(): void {",
      "        $service = new OrderService();",
      "    }",
      "}",
      "",
    ].join("\n");
    const testWrite = writeEvent(fx.root, "tests/Unit/Service/OrderServiceTest.php", testContent, "test-1");
    const before = await runHook("pre", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(before.stdout, "");
    writeFileSync(join(fx.root, "tests", "Unit", "Service", "OrderServiceTest.php"), testContent);
    const after = await runHook("post", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(after.stdout, "");

    const revisedContent = testContent.replace("$service = new OrderService();", "$service = new OrderService();\n        self::assertNotNull($service);");
    const revisedWrite = writeEvent(fx.root, "tests/Unit/Service/OrderServiceTest.php", revisedContent, "test-2");
    await runHook("pre", revisedWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    }, "claude");
    writeFileSync(join(fx.root, "tests", "Unit", "Service", "OrderServiceTest.php"), revisedContent);
    const claudeAfter = await runHook("post", revisedWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    }, "claude");
    assert.match(claudeAfter.stdout, /Recorded test-first evidence/u);

    const sourceWrite = writeEvent(
      fx.root,
      "src/Service/OrderService.php",
      "<?php\nnamespace App\\Service;\nfinal class OrderService {}\n",
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

test("public hook resolves Go module identity before authorizing an external-package test", async () => {
  const fx = fixture("tdd-guard-go-context-");
  try {
    mkdirSync(join(fx.root, "billing"), { recursive: true });
    writeFileSync(join(fx.root, "go.mod"), "module example.com/shop\n");
    const testContent = [
      "package billing_test",
      "import billingapi \"example.com/shop/billing\"",
      "func TestCreate(t *testing.T) { _ = billingapi.NewOrderService() }",
      "",
    ].join("\n");
    const testWrite = writeEvent(fx.root, "billing/order_service_test.go", testContent, "go-test-1");
    await runHook("pre", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    writeFileSync(join(fx.root, "billing", "order_service_test.go"), testContent);
    await runHook("post", testWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });

    const sourceWrite = writeEvent(
      fx.root,
      "billing/order_service.go",
      "package billing\nfunc NewOrderService() {}\n",
      "go-source-1",
    );
    const allowed = await runHook("pre", sourceWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(allowed.stdout, "", allowed.stdout);
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

test("Codex apply_patch exposes added source declarations to entity matching", () => {
  const root = "/workspace";
  const content = proposedContent({
    cwd: root,
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Add File: src/Service/OrderService.php",
        "+<?php",
        "+namespace App\\Service;",
        "+final class OrderService {}",
        "*** End Patch",
      ].join("\n"),
    },
  }, `${root}/src/Service/OrderService.php`, "");
  assert.match(content, /namespace App\\Service;/u);
  assert.match(content, /class OrderService/u);

  const followedByDocumentation = proposedContent({
    cwd: root,
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Add File: src/Service/OrderService.php",
        "+<?php namespace App\\Service; class OrderService {}",
        "*** Delete File: stale.txt",
        "*** End Patch",
      ].join("\n"),
    },
  }, `${root}/src/Service/OrderService.php`, "");
  assert.match(followedByDocumentation, /class OrderService/u);
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

test("interpreter write cannot create implementation before a test", async () => {
  const fx = fixture("tdd-guard-python-");
  try {
    const result = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "Bash",
      tool_use_id: "shell-py",
      tool_input: {
        command: "python3 -c \"open('src/OrderService.php','w').write('<?php class OrderService {}')\"",
      },
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
    const queue = [join(fx.root, ".tdd-guard", ".state")];
    while (queue.length > 0) {
      const directory = queue.pop();
      for (const name of (await import("node:fs")).readdirSync(directory)) {
        const path = join(directory, name);
        if ((await import("node:fs")).statSync(path).isDirectory()) queue.push(path);
        else if (name.endsWith(".json")) stateFiles.push(path);
      }
    }
    assert.equal(stateFiles.length, 1);
    assert.equal((await import("node:fs")).existsSync(join(fx.data, "tdd-guard")), false);
    const stored = readFileSync(stateFiles[0], "utf8");
    assert.equal(JSON.parse(stored).version, 2);
    assert.doesNotMatch(stored, /def test_total/u);
    assert.match(stored, /[a-f0-9]{64}/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("public hook names existing corresponding tests when blocking a historical source edit", async () => {
  const fx = fixture("tdd-guard-historical-name-");
  try {
    const pair = seedPhpOrderService(fx.root);
    const revised = pair.sourceContent.replace("final class OrderService {}", "final class OrderService {\n    public function total(): int { return 1; }\n}");
    const result = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "hist-source-1"), hookEnv(fx.data));
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Unit\/Service\/OrderServiceTest\.php/u);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /already exist/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a new extra test cannot unlock a source that already has corresponding tests on disk", async () => {
  const fx = fixture("tdd-guard-historical-extra-");
  try {
    const pair = seedPhpOrderService(fx.root);
    const extraPath = "tests/Scratch/OrderServiceScratchTest.php";
    const extraContent = [
      "<?php",
      "namespace Tests\\Scratch;",
      "use PHPUnit\\Framework\\Attributes\\CoversClass;",
      "use App\\Service\\OrderService;",
      "#[CoversClass(OrderService::class)]",
      "final class OrderServiceScratchTest extends TestCase {",
      "    public function test_scratch(): void { new OrderService(); }",
      "}",
      "",
    ].join("\n");
    mkdirSync(join(fx.root, "tests", "Scratch"), { recursive: true });
    const extraWrite = writeEvent(fx.root, extraPath, extraContent, "extra-test-1");
    await runHook("pre", extraWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, extraPath), extraContent);
    await runHook("post", extraWrite, hookEnv(fx.data));

    const revised = pair.sourceContent.replace("final class OrderService {}", "final class OrderService {\n    public function total(): int { return 1; }\n}");
    const blocked = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "hist-source-2"), hookEnv(fx.data));
    const output = JSON.parse(blocked.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny", blocked.stdout);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Unit\/Service\/OrderServiceTest\.php/u);
    assert.doesNotMatch(output.hookSpecificOutput.permissionDecisionReason, /Scratch/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("mutating an existing corresponding test unlocks a historical source edit", async () => {
  const fx = fixture("tdd-guard-historical-update-");
  try {
    const pair = seedPhpOrderService(fx.root);
    const revisedTest = pair.testContent.replace(
      "$service = new OrderService();",
      "$service = new OrderService();\n        self::assertSame(1, $service->total());",
    );
    const testWrite = writeEvent(fx.root, pair.testPath, revisedTest, "hist-test-1");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), revisedTest);
    await runHook("post", testWrite, hookEnv(fx.data));

    const revisedSource = pair.sourceContent.replace("final class OrderService {}", "final class OrderService {\n    public function total(): int { return 1; }\n}");
    const allowed = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revisedSource, "hist-source-3"), hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("unrelated existing tests do not change greenfield source-first denial", async () => {
  const fx = fixture("tdd-guard-historical-unrelated-");
  try {
    seedPhpOrderService(fx.root);
    mkdirSync(join(fx.root, "src", "Billing"), { recursive: true });
    const invoice = writeEvent(
      fx.root,
      "src/Billing/InvoiceService.php",
      "<?php\nnamespace App\\Billing;\nfinal class InvoiceService {}\n",
      "invoice-1",
    );
    const result = await runHook("pre", invoice, hookEnv(fx.data));
    const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, /Blocked src\/Billing\/InvoiceService\.php/u);
    assert.doesNotMatch(reason, /already exist/u);
    assert.doesNotMatch(reason, /OrderServiceTest/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("directory-mirror historical tests must be updated before the mirrored source", async () => {
  const fx = fixture("tdd-guard-historical-mirror-");
  try {
    mkdirSync(join(fx.root, "tests", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const testPath = "tests/Service/PriceCalculatorTest.php";
    const sourcePath = "src/Service/PriceCalculator.php";
    writeFileSync(join(fx.root, testPath), "<?php\nfunction test_keeps_zero(): void {}\n");
    writeFileSync(join(fx.root, sourcePath), "<?php\nfinal class PriceCalculator {}\n");

    const extraPath = "tests/Other/PriceCalculatorOtherTest.php";
    const extraContent = "<?php\nfunction test_other(): void {}\n";
    mkdirSync(join(fx.root, "tests", "Other"), { recursive: true });
    const extraWrite = writeEvent(fx.root, extraPath, extraContent, "mirror-extra-1");
    await runHook("pre", extraWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, extraPath), extraContent);
    await runHook("post", extraWrite, hookEnv(fx.data));

    const blocked = await runHook("pre", writeEvent(fx.root, sourcePath, "<?php\nfinal class PriceCalculator { public function total(): int { return 0; } }\n", "mirror-source-1"), hookEnv(fx.data));
    const output = JSON.parse(blocked.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny", blocked.stdout);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Service\/PriceCalculatorTest\.php/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});
