import assert from "node:assert/strict";
import test from "node:test";

import { isPrivateAddress, pinnedLookup, safeFetchText } from "../src/lib/server/safe-fetch.js";

test("address policy rejects loopback, private, link-local, and embedded private addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "100.64.0.1", "172.16.0.1", "192.168.2.2", "169.254.169.254", "198.18.0.1", "203.0.113.2", "::1", "2001:db8::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::127.0.0.1", "::7f00:1", "::a01:203"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("URL policy rejects credentials and sensitive query keys before network access", async () => {
  await assert.rejects(safeFetchText("https://user:pass@example.com/page"), /credentials/u);
  await assert.rejects(safeFetchText("https://example.com/page?api_key=secret"), /sensitive query parameter/u);
  await assert.rejects(safeFetchText("file:///etc/passwd"), /http/u);
  await assert.rejects(safeFetchText("http://127.0.0.1/internal"), /private/u);
});

test("pinned DNS lookup honors the Node all-address callback contract", async () => {
  const addresses = [{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
  const lookup = pinnedLookup(addresses);
  const all = await new Promise((resolve, reject) => lookup("example.com", { all: true }, (error, value) => error ? reject(error) : resolve(value)));
  assert.deepEqual(all, addresses);
  const one = await new Promise((resolve, reject) => lookup("example.com", { all: false }, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(one, addresses[0]);
});
