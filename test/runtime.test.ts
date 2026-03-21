import * as assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"

import {
  buildTaskDescription,
  findDynamicAgent,
  injectDynamicAgents,
  listDynamicAgents,
  loadDynamicSubAgentsConfig,
  parseModel,
  resolveConfigPath,
} from "../src/config.js"

void test("parseModel splits provider/model pairs", () => {
  assert.deepEqual(parseModel("anthropic/claude-sonnet-4-5-20250929"), {
    providerID: "anthropic",
    modelID: "claude-sonnet-4-5-20250929",
  })
})

void test("resolveConfigPath honors the environment override", () => {
  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = "/tmp/dynamicSubAgents.json"

  try {
    assert.equal(resolveConfigPath(), "/tmp/dynamicSubAgents.json")
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    } else {
      process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
    }
  }
})

void test("loadDynamicSubAgentsConfig returns null when the file is missing", async () => {
  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = path.join(os.tmpdir(), "missing", "dynamicSubAgents.json")

  try {
    const config = await loadDynamicSubAgentsConfig()
    assert.equal(config, null)
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    } else {
      process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
    }
  }
})

void test("loadDynamicSubAgentsConfig loads a valid user config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-dynamic-subagents-"))
  const configPath = path.join(tempDir, "dynamicSubAgents.json")

  await writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      defaults: {
        model: "openai/gpt-5.1-codex",
        allowedVariants: ["high"],
      },
      agents: {
        review: {
          description: "Code review subagent",
          prompt: "Review the supplied changes.",
        },
      },
    }),
  )

  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = configPath

  try {
    const config = await loadDynamicSubAgentsConfig()
    assert.ok(config)
    const reviewAgent = config.agents["review"]
    assert.ok(reviewAgent)
    assert.equal(reviewAgent.description, "Code review subagent")
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    } else {
      process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
    }
  }
})

void test("listDynamicAgents normalizes defaults into concrete runtime agents", () => {
  const agents = listDynamicAgents({
    version: 1,
    defaults: {
      model: "openai/gpt-5.1-codex",
      allowedVariants: ["high"],
    },
    agents: {
      explore: {
        description: "Explore the codebase",
        prompt: "Search files and answer questions.",
      },
    },
  })

  const firstAgent = agents[0]
  assert.ok(firstAgent)
  assert.equal(firstAgent.model, "openai/gpt-5.1-codex")
  assert.deepEqual(firstAgent.allowedVariants, ["high"])
})

void test("injectDynamicAgents adds dynamic agents to the OpenCode config", () => {
  const collisions = injectDynamicAgents(
    { agent: {} },
    {
      version: 1,
      agents: {
        review: {
          description: "Code review subagent",
          prompt: "Review the supplied changes.",
        },
      },
    },
  )

  assert.deepEqual(collisions, [])
})

void test("findDynamicAgent returns normalized agent definitions", () => {
  const agent = findDynamicAgent(
    {
      version: 1,
      defaults: {
        model: "openai/gpt-5.1-codex",
      },
      agents: {
        explore: {
          description: "Explore the codebase",
          prompt: "Search files and answer questions.",
        },
      },
    },
    "explore",
  )

  assert.ok(agent)
  assert.equal(agent.model, "openai/gpt-5.1-codex")
})

void test("buildTaskDescription lists configured agents", () => {
  const description = buildTaskDescription([
    {
      name: "explore",
      description: "Explore the codebase",
      prompt: "Search files and answer questions.",
      model: "openai/gpt-5.1-codex",
      variant: "high",
      options: {},
      allowedModels: [],
      allowedVariants: [],
    },
  ])

  assert.match(description, /explore/)
  assert.match(description, /Explore the codebase/)
})
