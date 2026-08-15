import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commandInvocation,
  shellCommandInvocations,
  tokenizeShell,
} from "@harness/core/shell-parse";

test("unwraps git behind absolute sudo and timeout wrappers", () => {
  assert.deepEqual(shellCommandInvocations("/usr/bin/sudo git push").map((item) => item.executable), ["git"]);
  const timeout = shellCommandInvocations("timeout 5 git push --force");
  assert.equal(timeout[0]?.executable, "git");
  assert.deepEqual(timeout[0]?.args, ["push", "--force"]);
});

test("unwraps busybox and nice wrappers by basename", () => {
  assert.equal(shellCommandInvocations("busybox rm -rf tmp").at(0)?.executable, "rm");
  assert.equal(shellCommandInvocations("nice -n 10 git status").at(0)?.executable, "git");
});

test("decodes ANSI-C quoted newlines inside tokens", () => {
  assert.deepEqual(tokenizeShell("$'hello\\nworld'"), ["hello\nworld"]);
});

test("commandInvocation skips env assignments and reports xargs as stdin-driven", () => {
  const invocation = commandInvocation(["FOO=1", "xargs", "-n", "1", "rm", "-rf", "/"]);
  assert.deepEqual(invocation, { executable: "rm", args: ["-rf", "/"], stdinDriven: true });
});
