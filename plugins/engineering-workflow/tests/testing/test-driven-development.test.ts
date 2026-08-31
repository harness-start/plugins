import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyPath,
  expectedTestExample,
  extractTestEvidence,
  resolveLanguageContext,
  rustInlineTestOnlyChange,
  sourceAuthorizedByTest,
} from "../../src/domains/testing/lib/patterns.js";
import { proposedContent } from "../../src/domains/testing/lib/hook-io.js";
import * as hookEntry from "../../src/domains/testing/hook.js";

const ENTRY = fileURLToPath(new URL("../../dist/hooks/dispatcher.mjs", import.meta.url));

test("TDD method keeps RED and GREEN focused and delegates broader verification", () => {
  const skill = readFileSync(fileURLToPath(new URL("../../skills/tdd-red-green/SKILL.md", import.meta.url)), "utf8");
  assert.match(skill, /same focused test command/iu);
  assert.match(skill, /engineering-verification.*broader verification/isu);
  assert.doesNotMatch(skill, /^\$ npm test$/mu);
  assert.doesNotMatch(skill, /Other tests still pass/iu);
  assert.doesNotMatch(skill, /Other tests fail\?\*\* Fix now/iu);
});

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

function runRawHook(mode, input, env = {}, platform = "codex") {
  return new Promise((resolvePromise, reject) => {
    const eventName = { "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop" }[mode];
    const child = spawn(process.execPath, [ENTRY, platform, eventName], {
      env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("../..", import.meta.url)), ...env },
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

function fixture(prefix = "test-driven-development-") {
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

async function observeRed(root, data, testPath, toolUseId = "red") {
  return runHook("failure", {
    cwd: root,
    session_id: "session-1",
    tool_name: "exec_command",
    tool_use_id: toolUseId,
    tool_input: { cmd: `phpunit ${testPath}` },
    tool_response: { exit_code: 1, stdout: "1 test, 1 failure" },
  }, hookEnv(data));
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

function gitSpawn(root, args) {
  return spawnSync("git", [
    "-c", "safe.directory=*",
    "-c", "user.email=test-driven-development@example.test",
    "-c", "user.name=TDD Guard",
    "-c", "commit.gpgsign=false",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "TDD Guard",
      GIT_AUTHOR_EMAIL: "test-driven-development@example.test",
      GIT_COMMITTER_NAME: "TDD Guard",
      GIT_COMMITTER_EMAIL: "test-driven-development@example.test",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function gitInit(root) {
  const initialized = gitSpawn(root, ["init"]);
  assert.equal(initialized.status, 0, initialized.stderr);
  const email = gitSpawn(root, ["config", "user.email", "test-driven-development@example.test"]);
  assert.equal(email.status, 0, email.stderr);
  const name = gitSpawn(root, ["config", "user.name", "TDD Guard"]);
  assert.equal(name.status, 0, name.stderr);
  const commit = gitSpawn(root, ["commit", "--allow-empty", "-m", "initial"]);
  assert.equal(commit.status, 0, commit.stderr);
}

function gitCommitAll(root, message) {
  const add = gitSpawn(root, ["add", "-A"]);
  assert.equal(add.status, 0, add.stderr);
  const commit = gitSpawn(root, ["commit", "-m", message]);
  assert.equal(commit.status, 0, commit.stderr);
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

test("public pre hook ignores executable sources in the artifacts delivery namespace", async () => {
  const fx = fixture("test-driven-development-artifacts-");
  try {
    const result = await runHook("pre", writeEvent(
      fx.root,
      "artifacts/logo/northline/src/render.ts",
      "export const render = () => 'northline';\n",
      "artifact-source-1",
    ), hookEnv(fx.data));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
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
  const fx = fixture("test-driven-development-context-");
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

test("Python package-local tests mirror a sibling implementation module", () => {
  const testPath = "lumen/geometry/tests/test_converter.py";
  const testRecord = {
    path: testPath,
    language: "python",
    evidence: extractTestEvidence(
      "python",
      "from lumen.geometry import converter\ndef test_blank_input():\n    assert converter.convert('') == ''\n",
      testPath,
    ),
  };

  assert.equal(sourceAuthorizedByTest({
    path: "lumen/geometry/converter.py",
    language: "python",
    content: "def convert(value):\n    return value\n",
  }, testRecord), true);
  assert.equal(sourceAuthorizedByTest({
    path: "lumen/rendering/converter.py",
    language: "python",
    content: "def convert(value):\n    return value\n",
  }, testRecord), false);
});

test("Python package re-exports bind a symbol to the mirrored sibling module", () => {
  const testPath = "lumen/geometry/tests/test_converter.py";
  const testRecord = {
    path: testPath,
    language: "python",
    evidence: extractTestEvidence(
      "python",
      "from lumen.geometry import Converter\ndef test_blank_input():\n    assert Converter().convert('') == ''\n",
      testPath,
    ),
  };

  assert.equal(sourceAuthorizedByTest({
    path: "lumen/geometry/converter.py",
    language: "python",
    content: "class Converter:\n    def convert(self, value):\n        return value\n",
  }, testRecord), true);
  assert.equal(sourceAuthorizedByTest({
    path: "lumen/rendering/converter.py",
    language: "python",
    content: "class Converter:\n    def convert(self, value):\n        return value\n",
  }, testRecord), false);
});

test("Python package initialization proves a public re-export from a non-mirrored module", () => {
  const fx = fixture("test-driven-development-python-reexport-");
  try {
    mkdirSync(join(fx.root, "lumen", "geometry"), { recursive: true });
    writeFileSync(
      join(fx.root, "lumen", "geometry", "__init__.py"),
      "from .converter import *\n",
    );
    const testPath = "tests/lumen/test_public_api.py";
    const testRecord = {
      path: testPath,
      language: "python",
      evidence: extractTestEvidence(
        "python",
        "from lumen.geometry import Converter\ndef test_public_conversion():\n    assert Converter().convert('value') == 'value'\n",
        testPath,
      ),
    };
    const source = {
      path: "lumen/geometry/converter.py",
      language: "python",
      content: "class Converter:\n    def convert(self, value):\n        return value\n",
    };

    assert.equal(sourceAuthorizedByTest(
      source,
      testRecord,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), true);
    writeFileSync(
      join(fx.root, "lumen", "geometry", "__init__.py"),
      "from lumen.geometry.converter import Converter\n",
    );
    assert.equal(sourceAuthorizedByTest(
      source,
      testRecord,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), true);
    writeFileSync(
      join(fx.root, "lumen", "geometry", "__init__.py"),
      "from lumen.geometry.converter import Converter as PublicConverter\n",
    );
    assert.equal(sourceAuthorizedByTest(
      source,
      testRecord,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), false);
    writeFileSync(
      join(fx.root, "lumen", "geometry", "__init__.py"),
      "from .alternate import Converter\n",
    );
    assert.equal(sourceAuthorizedByTest(
      source,
      testRecord,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), false);
    assert.equal(sourceAuthorizedByTest({
      ...source,
      path: "lumen/rendering/converter.py",
    }, testRecord, resolveLanguageContext(fx.root, "lumen/rendering/converter.py", "python")), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("Python package-relative namespace imports authorize only the exported source symbol", () => {
  const fx = fixture("test-driven-development-python-relative-import-");
  try {
    mkdirSync(join(fx.root, "lumen", "geometry"), { recursive: true });
    writeFileSync(
      join(fx.root, "lumen", "geometry", "__init__.py"),
      "try:\n    from .converter import *\nexcept ImportError:\n    pass\n",
    );
    const testPath = "lumen/geometry/tests/test_public_api.py";
    const testRecord = {
      path: testPath,
      language: "python",
      evidence: extractTestEvidence(
        "python",
        "from ... import geometry\ndef test_public_conversion():\n    assert geometry.Converter().convert('value') == 'value'\n",
        testPath,
      ),
    };
    const source = {
      path: "lumen/geometry/converter.py",
      language: "python",
      content: "class Converter:\n    def convert(self, value):\n        return value\n",
    };

    assert.equal(sourceAuthorizedByTest(
      source,
      testRecord,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), true);
    assert.equal(sourceAuthorizedByTest({
      ...source,
      path: "lumen/rendering/converter.py",
    }, testRecord, resolveLanguageContext(fx.root, "lumen/rendering/converter.py", "python")), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("JavaScript and TypeScript package barrels authorize only modules they re-export", () => {
  const fx = fixture("test-driven-development-js-barrel-");
  try {
    mkdirSync(join(fx.root, "packages", "compiler", "src"), { recursive: true });
    writeFileSync(join(fx.root, "packages", "compiler", "src", "index.ts"), "export * from './routing.js';\n");
    writeFileSync(join(fx.root, "packages", "compiler", "src", "routing.ts"), "export function compileRoute() { return true; }\n");
    const source = {
      path: "packages/compiler/src/routing.ts",
      language: "typescript",
      content: "export function compileRoute() { return true; }\n",
    };
    const testPath = "packages/compiler/__tests__/routing.test.ts";
    const record = {
      path: testPath,
      language: "typescript",
      evidence: extractTestEvidence(
        "typescript",
        "import { compileRoute } from '../src';\ntest('compiles route', () => compileRoute());\n",
        testPath,
      ),
    };
    assert.equal(sourceAuthorizedByTest(
      source,
      record,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), true);

    writeFileSync(join(fx.root, "packages", "compiler", "src", "index.ts"), "export * from './alternate.js';\n");
    assert.equal(sourceAuthorizedByTest(
      source,
      record,
      resolveLanguageContext(fx.root, source.path, source.language),
    ), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a barrel star export resolves before a new JavaScript source file exists", () => {
  const fx = fixture("test-driven-development-new-js-barrel-");
  try {
    mkdirSync(join(fx.root, "packages", "compiler", "src"), { recursive: true });
    writeFileSync(join(fx.root, "packages", "compiler", "src", "index.ts"), "export * from './routing.js';\n");
    assert.deepEqual(
      resolveLanguageContext(fx.root, "packages/compiler/src/routing.ts", "typescript").javascriptBarrelTargets,
      ["javascript-module:packages/compiler/src"],
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("Rust inline test modules can change without authorizing production edits", () => {
  const baseline = "pub fn route() -> bool { true }\n";
  const withTest = `${baseline}\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn routes() { assert!(route()); }\n}\n`;
  const productionEdit = withTest.replace("{ true }", "{ false }");
  assert.equal(rustInlineTestOnlyChange(baseline, withTest), true);
  assert.equal(rustInlineTestOnlyChange(withTest, productionEdit), false);
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
  const fx = fixture("test-driven-development-block-");
  try {
    gitInit(fx.root);
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

test("a changed test authorizes implementation without command evidence and Stop stays silent", async () => {
  const fx = fixture("test-driven-development-allow-");
  try {
    gitInit(fx.root);
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
    assert.equal(claudeAfter.stdout, "");

    const sourceWrite = writeEvent(
      fx.root,
      "src/Service/OrderService.php",
      "<?php\nnamespace App\\Service;\nfinal class OrderService {}\n",
      "source-1",
    );
    const allowedWithoutRed = await runHook("pre", sourceWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(allowedWithoutRed.stdout, "", allowedWithoutRed.stdout);

    const redEvent = {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "red-1",
      tool_input: { cmd: "phpunit tests/Unit/Service/OrderServiceTest.php" },
      tool_response: { exit_code: 1, stdout: "1 test, 1 failure" },
    };
    await runHook("failure", redEvent, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    const allowed = await runHook("pre", sourceWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "");
    writeFileSync(join(fx.root, "src", "Service", "OrderService.php"), sourceWrite.tool_input.content);
    await runHook("post", sourceWrite, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });

    const prematureStop = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(prematureStop.stdout, "", prematureStop.stdout);

    await runHook("post", {
      ...redEvent,
      tool_use_id: "unrelated-green-1",
      tool_input: { cmd: "phpunit tests/UnrelatedTest.php" },
      tool_response: { exit_code: 0, stdout: "1 test, 0 failures" },
    }, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    const stillPremature = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(stillPremature.stdout, "", stillPremature.stdout);

    const greenEvent = {
      ...redEvent,
      tool_use_id: "green-1",
      tool_response: { exit_code: 0, stdout: "1 test, 0 failures" },
    };
    await runHook("post", greenEvent, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    const completed = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, {
      PLUGIN_DATA: fx.data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    });
    assert.equal(completed.stdout, "", completed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("one changed test permits implementation corrections without command observations", async () => {
  const fx = fixture("test-driven-development-red-iteration-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");

    const revisedTest = pair.testContent.replace(
      "$service = new OrderService();",
      "$service = new OrderService();\n        self::assertSame(2, $service->total());",
    );
    const testWrite = writeEvent(fx.root, pair.testPath, revisedTest, "iterate-test-1");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), revisedTest);
    await runHook("post", testWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "iterate-initial-red");

    const firstAttempt = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService { public function total(): int { return 1; } }",
    );
    const firstWrite = writeEvent(fx.root, pair.sourcePath, firstAttempt, "iterate-source-1");
    assert.equal((await runHook("pre", firstWrite, hookEnv(fx.data))).stdout, "");
    writeFileSync(join(fx.root, pair.sourcePath), firstAttempt);
    await runHook("post", firstWrite, hookEnv(fx.data));

    const corrected = firstAttempt.replace("return 1", "return 2");
    const correctedWrite = writeEvent(fx.root, pair.sourcePath, corrected, "iterate-source-2");
    const beforeObservation = await runHook("pre", correctedWrite, hookEnv(fx.data));
    assert.equal(beforeObservation.stdout, "", beforeObservation.stdout);

    await observeRed(fx.root, fx.data, pair.testPath, "iterate-still-red");
    const afterObservation = await runHook("pre", correctedWrite, hookEnv(fx.data));
    assert.equal(afterObservation.stdout, "", afterObservation.stdout);
    writeFileSync(join(fx.root, pair.sourcePath), corrected);
    await runHook("post", correctedWrite, hookEnv(fx.data));

    await runHook("post", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "iterate-green",
      tool_input: { cmd: `phpunit ${pair.testPath}` },
      tool_response: { exit_code: 0, stdout: "1 test, 0 failures" },
    }, hookEnv(fx.data));
    const completed = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, hookEnv(fx.data));
    assert.equal(completed.stdout, "", completed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a later test change continues to authorize its corresponding source", async () => {
  const fx = fixture("test-driven-development-second-red-cycle-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");

    const firstTest = pair.testContent.replace(
      "$service = new OrderService();",
      "$service = new OrderService();\n        self::assertSame(2, $service->total());",
    );
    const firstTestWrite = writeEvent(fx.root, pair.testPath, firstTest, "cycle-test-1");
    await runHook("pre", firstTestWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), firstTest);
    await runHook("post", firstTestWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "cycle-red-1");

    const firstSource = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService { public function total(): int { return 2; } }",
    );
    const firstSourceWrite = writeEvent(fx.root, pair.sourcePath, firstSource, "cycle-source-1");
    assert.equal((await runHook("pre", firstSourceWrite, hookEnv(fx.data))).stdout, "");
    writeFileSync(join(fx.root, pair.sourcePath), firstSource);
    await runHook("post", firstSourceWrite, hookEnv(fx.data));
    await runHook("post", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "cycle-green-1",
      tool_input: { cmd: `phpunit ${pair.testPath}` },
      tool_response: { exit_code: 0, stdout: "1 test, 0 failures" },
    }, hookEnv(fx.data));

    const secondTest = firstTest.replace("assertSame(2", "assertSame(3");
    const secondTestWrite = writeEvent(fx.root, pair.testPath, secondTest, "cycle-test-2");
    await runHook("pre", secondTestWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), secondTest);
    await runHook("post", secondTestWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "cycle-red-2");

    const secondSource = firstSource.replace("return 2", "return 3");
    const secondSourceWrite = writeEvent(fx.root, pair.sourcePath, secondSource, "cycle-source-2");
    const allowed = await runHook("pre", secondSourceWrite, hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("an unrelated failing command does not affect authorization from a changed test", async () => {
  const fx = fixture("test-driven-development-unrelated-red-");
  try {
    gitInit(fx.root);
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const content = phpOrderServicePair().testContent;
    const testWrite = writeEvent(fx.root, "tests/Unit/Service/OrderServiceTest.php", content, "test-unrelated-red");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, "tests", "Unit", "Service", "OrderServiceTest.php"), content);
    await runHook("post", testWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, "tests/UnrelatedTest.php", "unrelated-red");
    const sourceWrite = writeEvent(fx.root, "src/Service/OrderService.php", phpOrderServicePair().sourceContent, "source-unrelated-red");
    const allowed = await runHook("pre", sourceWrite, hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("public hook resolves Go module identity before authorizing an external-package test", async () => {
  const fx = fixture("test-driven-development-go-context-");
  try {
    gitInit(fx.root);
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
    await observeRed(fx.root, fx.data, "billing/order_service_test.go", "go-red-1");

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
  const fx = fixture("test-driven-development-mixed-");
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
  const fx = fixture("test-driven-development-codex-patch-");
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
  const fx = fixture("test-driven-development-shell-");
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

test("common shell mutators cannot change implementation before a test", async () => {
  const commands = [
    "sed -i.bak 's/old/new/' src/OrderService.php",
    "env LC_ALL=C sed -i.bak 's/old/new/' src/OrderService.php",
    "cp /tmp/OrderService.php src/OrderService.php",
    "command cp /tmp/OrderService.php src/OrderService.php",
    "cp /tmp/OrderService.php src",
    "cp -t src /tmp/OrderService.php",
    "install --target-directory=src /tmp/OrderService.php",
    "git apply /tmp/implementation.patch",
    "env git apply /tmp/implementation.patch",
  ];
  for (const [index, command] of commands.entries()) {
    const fx = fixture(`test-driven-development-shell-mutator-${index}-`);
    try {
      gitInit(fx.root);
      mkdirSync(join(fx.root, "src"), { recursive: true });
      writeFileSync(join(fx.root, "src", "OrderService.php"), "<?php final class OrderService {}\n");
      gitCommitAll(fx.root, "seed implementation");
      const result = await runHook("pre", {
        cwd: fx.root,
        session_id: "session-1",
        tool_name: "exec_command",
        tool_use_id: `shell-mutator-${index}`,
        tool_input: { cmd: command },
      }, hookEnv(fx.data));
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny", command);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
      rmSync(fx.data, { recursive: true, force: true });
    }
  }
});

test("public pre hook ignores shell writes outside the workspace", async () => {
  const fx = fixture("test-driven-development-external-write-");
  try {
    const externalPath = join(fx.root, "..", "repro.py");
    const result = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "external-shell-1",
      tool_input: {
        cmd: `cat > ${externalPath} <<'EOF'\nprint('diagnostic')\nEOF`,
      },
    }, hookEnv(fx.data));

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("interpreter write cannot create implementation before a test", async () => {
  const fx = fixture("test-driven-development-python-");
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

test("interpreter read-only open does not count as an implementation write", async () => {
  const fx = fixture("test-driven-development-python-read-");
  try {
    mkdirSync(join(fx.root, "src"), { recursive: true });
    writeFileSync(join(fx.root, "src", "Converter.py"), "def convert(value):\n    return value\n");
    const result = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "Bash",
      tool_use_id: "shell-py-read",
      tool_input: {
        command: "python3 -c \"print(open('src/Converter.py').read())\"",
      },
    }, hookEnv(fx.data));

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("test writes do not create plugin state", async () => {
  const fx = fixture("test-driven-development-state-");
  try {
    writeFileSync(join(fx.root, ".gitignore"), "vendor/\n", "utf8");
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
    assert.equal(existsSync(join(fx.root, ".test-driven-development")), false);
    assert.equal(readFileSync(join(fx.root, ".gitignore"), "utf8"), "vendor/\n");
    assert.equal((await import("node:fs")).existsSync(join(fx.data, "test-driven-development")), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("public hook names existing corresponding tests when blocking a historical source edit", async () => {
  const fx = fixture("test-driven-development-historical-name-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    const revised = pair.sourceContent.replace("final class OrderService {}", "final class OrderService {\n    public function total(): int { return 1; }\n}");
    const result = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "hist-source-1"), hookEnv(fx.data));
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /tests\/Unit\/Service\/OrderServiceTest\.php/u);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /none has changed/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a new matching test can authorize a source that also has clean historical tests", async () => {
  const fx = fixture("test-driven-development-historical-extra-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
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
    const allowed = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "hist-source-2"), hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("mutating an existing corresponding test unlocks a historical source edit", async () => {
  const fx = fixture("test-driven-development-historical-update-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    const revisedTest = pair.testContent.replace(
      "$service = new OrderService();",
      "$service = new OrderService();\n        self::assertSame(1, $service->total());",
    );
    const testWrite = writeEvent(fx.root, pair.testPath, revisedTest, "hist-test-1");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), revisedTest);
    await runHook("post", testWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "hist-red-1");

    const revisedSource = pair.sourceContent.replace("final class OrderService {}", "final class OrderService {\n    public function total(): int { return 1; }\n}");
    const allowed = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revisedSource, "hist-source-3"), hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("unrelated existing tests do not change greenfield source-first denial", async () => {
  const fx = fixture("test-driven-development-historical-unrelated-");
  try {
    gitInit(fx.root);
    seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed unrelated pair");
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
  const fx = fixture("test-driven-development-historical-mirror-");
  try {
    gitInit(fx.root);
    mkdirSync(join(fx.root, "tests", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    const testPath = "tests/Service/PriceCalculatorTest.php";
    const sourcePath = "src/Service/PriceCalculator.php";
    writeFileSync(join(fx.root, testPath), "<?php\nfunction test_keeps_zero(): void {}\n");
    writeFileSync(join(fx.root, sourcePath), "<?php\nfinal class PriceCalculator {}\n");
    gitCommitAll(fx.root, "seed mirrored pair");

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

test("git-dirty corresponding test allows source without observing a test command", async () => {
  const fx = fixture("test-driven-development-git-dirty-");
  try {
    gitInit(fx.root);
    const pair = phpOrderServicePair();
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    writeFileSync(join(fx.root, pair.testPath), pair.testContent);
    const allowed = await runHook(
      "pre",
      writeEvent(fx.root, pair.sourcePath, pair.sourceContent, "git-dirty-source"),
      hookEnv(fx.data),
    );
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("clean committed corresponding tests without RED deny source when session has no test write records", async () => {
  const fx = fixture("test-driven-development-git-clean-deny-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    const revised = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService {\n    public function total(): int { return 1; }\n}",
    );
    const blocked = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "git-clean-source"), hookEnv(fx.data));
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a clean corresponding test cannot authorize a source edit even when its command fails", async () => {
  const fx = fixture("test-driven-development-already-failing-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    await observeRed(fx.root, fx.data, pair.testPath, "already-failing-red");
    const revised = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService {\n    public function total(): int { return 1; }\n}",
    );
    const blocked = await runHook("pre", writeEvent(fx.root, pair.sourcePath, revised, "already-failing-source"), hookEnv(fx.data));
    assert.equal(blocked.code, 0, blocked.stderr);
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(blocked.stdout, /modify.*test|test.*change/iu);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("after corresponding tests are deleted, deleting that implementation is allowed without manufacturing RED", async () => {
  async function assertSourceDeleteAllowed(kind, makeEvent) {
    const fx = fixture(`test-driven-development-delete-${kind}-`);
    try {
      gitInit(fx.root);
      const pair = seedPhpOrderService(fx.root);
      gitCommitAll(fx.root, "seed pair");
      rmSync(join(fx.root, pair.testPath));
      const result = await runHook("pre", makeEvent(fx.root, pair), hookEnv(fx.data));
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, "", result.stdout);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
      rmSync(fx.data, { recursive: true, force: true });
    }
  }

  await assertSourceDeleteAllowed("patch", (root, pair) => ({
    cwd: root,
    session_id: "session-1",
    tool_name: "apply_patch",
    tool_use_id: "delete-source-patch",
    tool_input: { patch: `*** Delete File: ${pair.sourcePath}` },
  }));
  await assertSourceDeleteAllowed("rm", (root, pair) => ({
    cwd: root,
    session_id: "session-1",
    tool_name: "exec_command",
    tool_use_id: "delete-source-rm",
    tool_input: { cmd: `rm ${pair.sourcePath}` },
  }));
});

test("shrinking corresponding tests allows deleting that implementation without manufacturing RED", async () => {
  const fx = fixture("test-driven-development-shrink-delete-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    writeFileSync(join(fx.root, pair.testPath), "<?php\nfunction test_placeholder(): void {}\n");
    const result = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "apply_patch",
      tool_use_id: "shrink-delete-source",
      tool_input: { patch: `*** Delete File: ${pair.sourcePath}` },
    }, hookEnv(fx.data));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "", result.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("rm and mv of a classified source file are denied without authorization", async () => {
  const fx = fixture("test-driven-development-rm-mv-");
  try {
    gitInit(fx.root);
    seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    const removed = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "rm-source",
      tool_input: { cmd: "rm src/Service/OrderService.php" },
    }, hookEnv(fx.data));
    assert.notEqual(removed.stdout, "", removed.stderr);
    assert.equal(JSON.parse(removed.stdout).hookSpecificOutput.permissionDecision, "deny");

    const moved = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "mv-source",
      tool_input: { cmd: "mv src/Service/OrderService.php src/Service/OrderService.bak.php" },
    }, hookEnv(fx.data));
    assert.notEqual(moved.stdout, "", moved.stderr);
    assert.equal(JSON.parse(moved.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("one dirty corresponding test allows repeated source corrections and a git revert", async () => {
  const fx = fixture("test-driven-development-revert-clears-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    const revisedTest = pair.testContent.replace(
      "$service = new OrderService();",
      "$service = new OrderService();\n        self::assertSame(1, $service->total());",
    );
    const testWrite = writeEvent(fx.root, pair.testPath, revisedTest, "revert-test-1");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), revisedTest);
    await runHook("post", testWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "revert-red-1");

    const revisedSource = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService {\n    public function total(): int { return 1; }\n}",
    );
    const sourceWrite = writeEvent(fx.root, pair.sourcePath, revisedSource, "revert-source-1");
    const allowed = await runHook("pre", sourceWrite, hookEnv(fx.data));
    assert.equal(allowed.stdout, "", allowed.stdout);
    writeFileSync(join(fx.root, pair.sourcePath), revisedSource);
    await runHook("post", sourceWrite, hookEnv(fx.data));

    const otherSource = pair.sourceContent.replace(
      "final class OrderService {}",
      "final class OrderService {\n    public function total(): int { return 1; }\n    public function count(): int { return 0; }\n}",
    );
    const secondAllowed = await runHook("pre", writeEvent(fx.root, pair.sourcePath, otherSource, "revert-source-2"), hookEnv(fx.data));
    assert.equal(secondAllowed.stdout, "", secondAllowed.stdout);
    writeFileSync(join(fx.root, pair.sourcePath), otherSource);

    const revertWrite = writeEvent(fx.root, pair.sourcePath, pair.sourceContent, "revert-source-3");
    const revertAllowed = await runHook("pre", revertWrite, hookEnv(fx.data));
    assert.equal(revertAllowed.stdout, "", revertAllowed.stdout);
    writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent);

    const completed = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, hookEnv(fx.data));
    assert.equal(completed.stdout, "", completed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("test commands and Stop do not create state or block completion", async () => {
  const fx = fixture("test-driven-development-stateless-");
  try {
    gitInit(fx.root);
    const pair = seedPhpOrderService(fx.root);
    gitCommitAll(fx.root, "seed pair");
    writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent.replace("final class OrderService {}", "final class OrderService { public function total(): int { return 1; } }"));

    await runHook("failure", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "unrelated-failure",
      tool_input: { cmd: "phpunit tests/UnrelatedTest.php" },
      tool_response: { exit_code: 1, stdout: "1 test, 1 failure" },
    }, hookEnv(fx.data));
    const stopped = await runHook("stop", {
      cwd: fx.root,
      session_id: "session-1",
      last_assistant_message: "Done",
    }, hookEnv(fx.data));

    assert.equal(stopped.stdout, "", stopped.stdout);
    assert.equal(existsSync(join(fx.root, ".test-driven-development")), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a new implementation can be corrected repeatedly and then deleted", async () => {
  async function writeNewSourceThenRestore(kind, restoreEvent) {
    const fx = fixture(`test-driven-development-newimpl-revert-${kind}-`);
    try {
      gitInit(fx.root);
      const pair = phpOrderServicePair();
      mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
      mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
      writeFileSync(join(fx.root, pair.testPath), pair.testContent);
      const sourceWrite = writeEvent(fx.root, pair.sourcePath, pair.sourceContent, `${kind}-source`);
      assert.equal((await runHook("pre", sourceWrite, hookEnv(fx.data))).stdout, "", `${kind} first source`);
      writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent);

      const second = pair.sourceContent.replace("final class OrderService {}", "final class OrderService { public function extra(): int { return 0; } }");
      const secondAllowed = await runHook("pre", writeEvent(fx.root, pair.sourcePath, second, `${kind}-second`), hookEnv(fx.data));
      assert.equal(secondAllowed.stdout, "", `${kind} second source ${secondAllowed.stdout}`);
      writeFileSync(join(fx.root, pair.sourcePath), second);

      const revertPre = await runHook("pre", restoreEvent(fx.root, pair), hookEnv(fx.data));
      assert.equal(revertPre.stdout, "", `${kind} restore pre ${revertPre.stdout}`);
      rmSync(join(fx.root, pair.sourcePath), { force: true });
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
      rmSync(fx.data, { recursive: true, force: true });
    }
  }

  await writeNewSourceThenRestore("patch", (root, pair) => ({
    cwd: root,
    session_id: "session-1",
    tool_name: "apply_patch",
    tool_use_id: "newimpl-delete-patch",
    tool_input: { patch: `*** Delete File: ${pair.sourcePath}` },
  }));
  await writeNewSourceThenRestore("rm", (root, pair) => ({
    cwd: root,
    session_id: "session-1",
    tool_name: "exec_command",
    tool_use_id: "newimpl-delete-rm",
    tool_input: { cmd: `rm ${pair.sourcePath}` },
  }));
});

test("git-dirty Node test allows the matching module without a test command", async () => {
  const fx = fixture("test-driven-development-node-test-red-");
  try {
    gitInit(fx.root);
    mkdirSync(join(fx.root, "test"), { recursive: true });
    const testPath = "test/price-calculator.test.mjs";
    writeFileSync(join(fx.root, testPath), [
      "import test from 'node:test';",
      "import { calculateTotal } from '../src/price-calculator.js';",
      "test('adds prices', () => { calculateTotal([2, 3]); });",
      "",
    ].join("\n"));
    const allowed = await runHook(
      "pre",
      writeEvent(fx.root, "src/price-calculator.mjs", "export function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }\n", "node-source"),
      hookEnv(fx.data),
    );
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a dirty source-inspection contract authorizes its exact JavaScript module", async () => {
  const fx = fixture("test-driven-development-source-contract-");
  try {
    gitInit(fx.root);
    mkdirSync(join(fx.root, "tests", "contracts", "routes"), { recursive: true });
    mkdirSync(join(fx.root, "src", "routes"), { recursive: true });
    const testPath = "tests/contracts/routes/models.contract.test.ts";
    writeFileSync(join(fx.root, testPath), [
      "import { readFileSync } from 'node:fs';",
      "import { resolve } from 'node:path';",
      "import { expect, it } from 'vitest';",
      "function source(path: string): string {",
      "  return readFileSync(resolve(process.cwd(), path), 'utf8');",
      "}",
      "it('redirects the legacy route', () => {",
      "  const route = source('src/routes/admin.models.$modelId.index.tsx');",
      "  expect(route).toContain('/edit');",
      "});",
      "",
    ].join("\n"));
    const allowed = await runHook("pre", writeEvent(
      fx.root,
      "src/routes/admin.models.$modelId.index.tsx",
      "export const redirectTarget = '/edit';\n",
      "source-contract-route",
    ), hookEnv(fx.data));
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a source helper must pass its path parameter to readFileSync before it authorizes a module", () => {
  const testPath = "tests/contracts/routes/models.contract.test.ts";
  const testRecord = {
    path: testPath,
    language: "typescript",
    evidence: extractTestEvidence("typescript", [
      "import { readFileSync } from 'node:fs';",
      "import { expect, it } from 'vitest';",
      "function source(path: string): string {",
      "  console.log(path);",
      "  return readFileSync('fixtures/route.txt', 'utf8');",
      "}",
      "it('checks a fixture', () => {",
      "  const route = source('src/routes/admin.models.$modelId.index.tsx');",
      "  expect(route).toContain('/edit');",
      "});",
      "",
    ].join("\n"), testPath),
  };
  assert.equal(sourceAuthorizedByTest({
    path: "src/routes/admin.models.$modelId.index.tsx",
    language: "typescript",
    content: "export const redirectTarget = '/edit';\n",
  }, testRecord), false);
});

test("deleting the only dirty corresponding test is denied while its implementation remains dirty", async () => {
  const fx = fixture("test-driven-development-test-delete-");
  try {
    gitInit(fx.root);
    const pair = phpOrderServicePair();
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    writeFileSync(join(fx.root, pair.testPath), pair.testContent);
    writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent);

    const blocked = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "apply_patch",
      tool_use_id: "delete-only-test",
      tool_input: { patch: `*** Delete File: ${pair.testPath}` },
    }, hookEnv(fx.data));

    assert.equal(blocked.code, 0, blocked.stderr);
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(blocked.stdout, /dirty implementation|对应实现/iu);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("deleting one dirty test remains allowed when another dirty test authorizes the implementation", async () => {
  const fx = fixture("test-driven-development-test-delete-alternative-");
  try {
    gitInit(fx.root);
    const pair = phpOrderServicePair();
    const alternativePath = "tests/Feature/Service/OrderServiceTest.php";
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "tests", "Feature", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    writeFileSync(join(fx.root, pair.testPath), pair.testContent);
    writeFileSync(join(fx.root, alternativePath), pair.testContent);
    writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent);

    const allowed = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "apply_patch",
      tool_use_id: "delete-redundant-test",
      tool_input: { patch: `*** Delete File: ${pair.testPath}` },
    }, hookEnv(fx.data));

    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("deleting all dirty authorizing tests in one command is denied", async () => {
  const fx = fixture("test-driven-development-test-delete-batch-");
  try {
    gitInit(fx.root);
    const pair = phpOrderServicePair();
    const alternativePath = "tests/Feature/Service/OrderServiceTest.php";
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "tests", "Feature", "Service"), { recursive: true });
    mkdirSync(join(fx.root, "src", "Service"), { recursive: true });
    writeFileSync(join(fx.root, pair.testPath), pair.testContent);
    writeFileSync(join(fx.root, alternativePath), pair.testContent);
    writeFileSync(join(fx.root, pair.sourcePath), pair.sourceContent);

    const blocked = await runHook("pre", {
      cwd: fx.root,
      session_id: "session-1",
      tool_name: "exec_command",
      tool_use_id: "delete-all-tests",
      tool_input: { cmd: `rm ${pair.testPath} ${alternativePath}` },
    }, hookEnv(fx.data));

    assert.equal(blocked.code, 0, blocked.stderr);
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("a changed Python test authorizes its matching module without selector parsing", async () => {
  const fx = fixture("test-driven-development-pytest-node-");
  try {
    gitInit(fx.root);
    mkdirSync(join(fx.root, "acme", "geometry", "tests"), { recursive: true });
    const testPath = "acme/geometry/tests/test_transform.py";
    const sourcePath = "acme/geometry/transform.py";
    const sourceContent = "def normalize(value):\n    return value.strip()\n";
    const originalTest = [
      "from acme.geometry.transform import normalize",
      "def test_text_value():",
      "    assert normalize(' value ') == 'value'",
      "",
    ].join("\n");
    writeFileSync(join(fx.root, sourcePath), sourceContent);
    writeFileSync(join(fx.root, testPath), originalTest);
    gitCommitAll(fx.root, "seed Python pair");

    const changedTest = [
      originalTest.trimEnd(),
      "def test_empty_value():",
      "    assert normalize('') == ''",
      "",
    ].join("\n");
    const testWrite = writeEvent(fx.root, testPath, changedTest, "pytest-node-test");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, testPath), changedTest);
    await runHook("post", testWrite, hookEnv(fx.data));
    const allowed = await runHook(
      "pre",
      writeEvent(fx.root, sourcePath, "def normalize(value):\n    return value.strip() if value else ''\n", "pytest-node-source"),
      hookEnv(fx.data),
    );
    assert.equal(allowed.stdout, "", allowed.stdout);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});

test("source write fails closed when workspace has no git HEAD", async () => {
  const fx = fixture("test-driven-development-no-git-");
  try {
    const pair = phpOrderServicePair();
    mkdirSync(join(fx.root, "tests", "Unit", "Service"), { recursive: true });
    const testWrite = writeEvent(fx.root, pair.testPath, pair.testContent, "no-git-test");
    await runHook("pre", testWrite, hookEnv(fx.data));
    writeFileSync(join(fx.root, pair.testPath), pair.testContent);
    await runHook("post", testWrite, hookEnv(fx.data));
    await observeRed(fx.root, fx.data, pair.testPath, "no-git-red");
    const blocked = await runHook(
      "pre",
      writeEvent(fx.root, pair.sourcePath, pair.sourceContent, "no-git-source"),
      hookEnv(fx.data),
    );
    assert.notEqual(blocked.stdout, "", blocked.stderr);
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(blocked.stdout, /git|HEAD/iu);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
    rmSync(fx.data, { recursive: true, force: true });
  }
});
