import assert from "node:assert/strict";
import test from "node:test";

import { detectComposeSource } from "../src/lib/compose-detect.ts";

test("plain collectAsState is a finding and collectAsStateWithLifecycle is not", () => {
  const findings = detectComposeSource([
    "@Composable",
    "fun ProfilePane(model: ProfileModel) {",
    "    val user by model.user.collectAsState()",
    "    val ready by model.ready.collectAsStateWithLifecycle()",
    "}",
  ].join("\n"));
  assert.deepEqual(findings.map((item) => item.code), ["COLLECT_AS_STATE"]);
  assert.equal(findings[0]?.line, 3);
});

test("collectAsState next to PagingData uses the paging code instead of WithLifecycle", () => {
  const findings = detectComposeSource([
    "val pages: Flow<PagingData<Row>> = model.feed",
    "val snapshot by pages.collectAsState()",
  ].join("\n"));
  assert.equal(findings[0]?.code, "PAGING_COLLECT_AS_STATE");
  assert.equal(findings[0]?.line, 2);
});

test("boxed primitive mutableStateOf is a finding and typed factories are not", () => {
  const findings = detectComposeSource([
    "var count by remember { mutableStateOf(0) }",
    "var labeled by remember { mutableStateOf<Int>(n) }",
    "var tall by remember { mutableIntStateOf(0) }",
    "var on by remember { mutableStateOf(false) }",
    "var title by remember { mutableStateOf(\"0\") }",
  ].join("\n"));
  assert.deepEqual(findings.map((item) => item.code), ["PRIMITIVE_MUTABLE_STATE", "PRIMITIVE_MUTABLE_STATE"]);
  assert.deepEqual(findings.map((item) => item.line), [1, 2]);
});

test("hardcoded Color.Black as a foreground is a finding only when the file already reads colorScheme", () => {
  const withTheme = detectComposeSource([
    "Text(title, color = Color.Black, modifier = Modifier.background(MaterialTheme.colorScheme.surface))",
  ].join("\n"));
  assert.equal(withTheme[0]?.code, "HARDCODED_ON_THEME");
  assert.deepEqual(detectComposeSource("Text(title, color = Color.Black)"), []);
  assert.deepEqual(
    detectComposeSource("Box(Modifier.background(MaterialTheme.colorScheme.surface).background(Color.Black))"),
    [],
  );
});

test("comments and strings do not produce compose findings", () => {
  const findings = detectComposeSource([
    "// val stale by model.user.collectAsState()",
    "/* mutableStateOf(0) */",
    "val note = \"color = Color.Black\"",
    "val ready by model.ready.collectAsStateWithLifecycle()",
  ].join("\n"));
  assert.deepEqual(findings, []);
});

test("clean Compose source is silent", () => {
  assert.deepEqual(detectComposeSource([
    "@Composable",
    "fun CounterPane() {",
    "    var count by remember { mutableIntStateOf(0) }",
    "    val user by model.user.collectAsStateWithLifecycle()",
    "    Text(user.name, color = MaterialTheme.colorScheme.onSurface)",
    "}",
  ].join("\n")), []);
});
