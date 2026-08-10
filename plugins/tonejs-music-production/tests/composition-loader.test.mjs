import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadCompositionDeterministic } from "../scripts/lib/composition-loader.mjs";

test("loads executable composition config twice under a no-write permission boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tonejs-loader-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "composition.mjs"), "export default { schema: 'tonejs-composition/v1', seed: 7 };\n");
  assert.deepEqual(await loadCompositionDeterministic(root), { schema: "tonejs-composition/v1", seed: 7 });
});

test("blocks filesystem side effects from trusted executable config", async () => {
  const root = await mkdtemp(join(tmpdir(), "tonejs-loader-write-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "composition.mjs"), "import { writeFileSync } from 'node:fs'; writeFileSync('escaped.txt', 'x'); export default {};\n");
  await assert.rejects(() => loadCompositionDeterministic(root), /COMPOSITION_LOAD_FAILED/u);
  await assert.rejects(() => access(join(root, "escaped.txt")));
});
