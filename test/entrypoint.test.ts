import * as assert from "node:assert/strict"
import { test } from "node:test"

import * as entrypoint from "../src/entrypoint.js"

void test("entrypoint only exposes plugin functions at runtime", () => {
  const runtimeExports = Object.entries(entrypoint)
  assert.ok(runtimeExports.length > 0)

  for (const [name, value] of runtimeExports) {
    assert.equal(typeof value, "function", `Expected runtime export "${name}" to be a function.`)
  }
})
