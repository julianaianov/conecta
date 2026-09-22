import test from "node:test";
import assert from "node:assert/strict";
import { initialListState } from "./public-data-contract.ts";

test("public list state starts with server data and does not require a loading spinner", () => {
  assert.deepEqual(initialListState([{ id: "p-1" }]), {
    items: [{ id: "p-1" }],
    loading: false,
  });
});
