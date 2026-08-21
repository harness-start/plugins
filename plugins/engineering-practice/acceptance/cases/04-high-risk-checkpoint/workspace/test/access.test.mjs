import assert from "node:assert/strict";
import test from "node:test";
import { canAccess } from "../src/access.mjs";

test("active administrators and owners can access a record", () => {
  assert.equal(canAccess({ id: "admin", role: "admin", suspended: false }, { ownerId: "owner" }), true);
  assert.equal(canAccess({ id: "owner", role: "member", suspended: false }, { ownerId: "owner" }), true);
});
