import * as assert from "node:assert/strict"
import { test } from "node:test"

import { collectTaskPermissionAgents, hasExplicitTaskPermission } from "../src/plugin.js"
import { buildToolSelection } from "../src/task-tool.js"

void test("buildToolSelection disables todo tools and primary tools for child sessions", () => {
  assert.deepEqual(buildToolSelection(false, ["bash", "edit"]), {
    todowrite: false,
    todoread: false,
    task: false,
    bash: false,
    edit: false,
  })
})

void test("buildToolSelection preserves task when the target agent explicitly allows it", () => {
  assert.deepEqual(buildToolSelection(true, ["bash"]), {
    todowrite: false,
    todoread: false,
    bash: false,
  })
})

void test("hasExplicitTaskPermission only matches object permissions with a task key", () => {
  assert.equal(hasExplicitTaskPermission(undefined), false)
  assert.equal(hasExplicitTaskPermission("allow"), false)
  assert.equal(hasExplicitTaskPermission({ read: "allow" }), false)
  assert.equal(hasExplicitTaskPermission({ task: "allow" }), true)
})

void test("collectTaskPermissionAgents finds only agents with explicit task permissions", () => {
  const result = collectTaskPermissionAgents({
    review: {
      permission: {
        read: "allow",
      },
    },
    orchestrator: {
      permission: {
        task: "allow",
      },
    },
    missing: undefined,
  })

  assert.deepEqual([...result], ["orchestrator"])
})
