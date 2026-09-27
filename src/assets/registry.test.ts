import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSET_PROVIDER_IDS, providerById } from "./registry.ts";

void test("registry exposes file and ima2 without starting either provider", () => {
  assert.deepEqual(ASSET_PROVIDER_IDS, ["file", "ima2"]);
  assert.equal(providerById("file").id, "file");
  assert.equal(providerById("ima2", { env: { PATH: "" } }).id, "ima2");
  assert.throws(() => providerById("missing"), (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "E_INPUT" &&
    "details" in error && Array.isArray((error.details as { providers: unknown }).providers));
});
