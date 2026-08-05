/**
 * Symfony Doctrine entity + Twig checks (pure unit tests; the twig subprocess
 * chain degrades to the regex fallback in environments without a Symfony
 * project / tools).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as doctrineEntity from "../scripts/checks/doctrine-entity.mjs";
import * as twig from "../scripts/checks/twig.mjs";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ── doctrine-entity ────────────────────────────────────────────────────

const ENTITY_WITH_ISSUES = `<?php

namespace App\\Entity;

use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
class User
{
    #[ORM\\Id]
    #[ORM\\Column(type: "integer")]
    private int $id;

    private string $name;

    public function getId(): int
    {
        return $this->id;
    }
}
`;

test("doctrine: matches only .php under an Entity path", () => {
  assert.equal(doctrineEntity.matches("/repo/src/Entity/User.php"), true);
  assert.equal(doctrineEntity.matches("/repo/src/Service/User.php"), false);
  assert.equal(doctrineEntity.matches("/repo/src/Entity/User.java"), false);
});

test("doctrine: property without ORM attribute and string type are flagged", () => {
  const dir = tempDir("symfony-entity-");
  try {
    const file = join(dir, "User.php");
    writeFileSync(file, ENTITY_WITH_ISSUES);
    const errors = doctrineEntity.check(file);
    assert.ok(errors.some((e) => e.includes("$name")));
    assert.ok(errors.some((e) => e.includes("Types::INTEGER")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctrine: non-entity PHP under Entity path is ignored", () => {
  const dir = tempDir("symfony-entity-");
  try {
    const file = join(dir, "Helper.php");
    writeFileSync(file, "<?php\nclass Helper {}\n");
    assert.deepEqual(doctrineEntity.check(file), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctrine: fully mapped entity is clean", () => {
  const dir = tempDir("symfony-entity-");
  try {
    const file = join(dir, "User.php");
    writeFileSync(
      file,
      `<?php
namespace App\\Entity;
use Doctrine\\ORM\\Mapping as ORM;
#[ORM\\Entity]
class User
{
    #[ORM\\Id]
    #[ORM\\Column(type: Types::INTEGER)]
    private int $id;

    #[ORM\\Column(type: Types::STRING)]
    private string $name;
}
`,
    );
    assert.deepEqual(doctrineEntity.check(file), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctrine: report format is advisory", () => {
  const message = doctrineEntity.formatReport("/repo/Entity/User.php", ["  属性 $name (行 9) 缺少 ORM 映射注解"]);
  assert.match(message, /Doctrine Entity/);
  assert.match(message, /误报可忽略/);
});

// ── twig ───────────────────────────────────────────────────────────────

test("twig: matches only .twig", () => {
  assert.equal(twig.matches("/repo/templates/home/index.html.twig"), true);
  assert.equal(twig.matches("/repo/templates/home/index.html"), false);
});

test("twig: regex fallback flags unpaired tags", async () => {
  const dir = tempDir("symfony-twig-");
  try {
    const file = join(dir, "broken.twig");
    writeFileSync(
      file,
      "<h1>{% block title %}Hello</h1>\n{{ name }}\n{% if user.name }\n",
    );
    const failure = await twig.check(file);
    assert.ok(failure, "expected a failure from the regex fallback");
    assert.equal(failure.lang, "Twig Template");
    assert.match(failure.message, /block\/endblock/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("twig: regex fallback passes paired templates", async () => {
  const dir = tempDir("symfony-twig-");
  try {
    const file = join(dir, "ok.twig");
    writeFileSync(
      file,
      "{% block title %}Hello{% endblock %}\n{{ name }}\n{% if user.name %}x{% endif %}\n{% for i in items %}{{ i }}{% endfor %}\n",
    );
    const failure = await twig.check(file);
    // With no Symfony project / twigcs available the chain degrades to regex;
    // a clean template must produce no failure either way.
    assert.equal(failure, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("twig: formatFailure includes fix guidance", () => {
  const message = twig.formatFailure(
    { lang: "Twig (lint:twig)", message: "ERROR in line 2" },
    "/repo/x.twig",
  );
  assert.match(message, /Twig \(lint:twig\)/);
  assert.match(message, /请修复后再继续/);
});
