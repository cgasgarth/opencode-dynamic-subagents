import * as assert from "node:assert/strict"
import { test } from "node:test"

import { collectTaskPermissionAgents, hasExplicitTaskPermission } from "../src/plugin.js"
import { buildToolSelection, createTaskTool } from "../src/task-tool.js"

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

void test("createTaskTool forwards the live context directory to session calls", async () => {
  const calls: { method: string; input: unknown }[] = []
  const tool = createTaskTool(
    {
      client: {
        session: {
          message(input: unknown) {
            calls.push({ method: "message", input })
            return Promise.resolve({
              data: {
                info: {
                  role: "assistant",
                  providerID: "openai",
                  modelID: "gpt-5.4",
                },
              },
            })
          },
          create(input: unknown) {
            calls.push({ method: "create", input })
            return Promise.resolve({ data: { id: "child-session-1" } })
          },
          prompt(input: unknown) {
            calls.push({ method: "prompt", input })
            return Promise.resolve({ data: { parts: [{ type: "text", text: "ok" }] } })
          },
          get(input: unknown) {
            calls.push({ method: "get", input })
            return Promise.resolve({ data: undefined })
          },
        },
      },
    } as never,
    {
      configuredSubagents: [],
      runtimeAgentName: "dynamic-subagent-runtime",
      primaryTools: [],
      taskPermissionAgents: new Set(),
    },
  )

  await tool.execute(
    {
      description: "Read file",
      prompt: "Read apps/studio/src/hooks/useBrandProfile.ts and return the first non-empty line.",
      subagent_type: "review",
    },
    {
      sessionID: "parent-session-1",
      messageID: "message-1",
      directory: "/Users/cgas/Documents/Projects/Atelier",
      worktree: "/Users/cgas/Documents/Projects/Atelier",
      ask() {
        return Promise.resolve()
      },
      metadata() {
        return undefined
      },
    } as never,
  )

  const directories = calls
    .map((call) => (call.input as { query?: { directory?: string } }).query?.directory)
    .filter((directory): directory is string => typeof directory === "string")

  assert.deepEqual(directories, [
    "/Users/cgas/Documents/Projects/Atelier",
    "/Users/cgas/Documents/Projects/Atelier",
    "/Users/cgas/Documents/Projects/Atelier",
  ])
})
