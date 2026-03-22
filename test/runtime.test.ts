import * as assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"

import {
  buildDynamicTaskPrompt,
  buildTaskDescription,
  collectConfiguredSubagents,
  injectRuntimeSubagent,
  loadDynamicSubAgentsConfig,
  parseModel,
  resolveConfigPath,
  resolvePolicy,
  validateDynamicSubagentRequest,
} from "../src/config.js"

void test("parseModel splits provider/model pairs", () => {
  assert.deepEqual(parseModel("openai/gpt-5.4-mini"), {
    providerID: "openai",
    modelID: "gpt-5.4-mini",
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

void test("loadDynamicSubAgentsConfig loads a valid policy config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-dynamic-subagents-"))
  const configPath = path.join(tempDir, "dynamicSubAgents.json")

  await writeFile(
    configPath,
    JSON.stringify({
      $schema: "https://example.com/dynamicSubAgents.schema.json",
      version: 1,
      defaults: {
        model: "openai/gpt-5.4-mini",
        allowedModels: [
          "openai/gpt-5.4",
          {
            id: "openai/gpt-5.4-mini",
            description: "Lower-cost GPT-5.4 option.",
          },
        ],
      },
      runtime: {
        agentName: "dynamic-runtime",
      },
      limits: {
        maxPromptLength: 5000,
      },
    }),
  )

  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = configPath

  try {
    const config = await loadDynamicSubAgentsConfig()
    assert.ok(config)
    assert.equal(config.$schema, "https://example.com/dynamicSubAgents.schema.json")
    assert.equal(config.runtime?.agentName, "dynamic-runtime")
    assert.equal(config.defaults?.model, "openai/gpt-5.4-mini")
    assert.deepEqual(config.defaults.allowedModels, [
      "openai/gpt-5.4",
      {
        id: "openai/gpt-5.4-mini",
        description: "Lower-cost GPT-5.4 option.",
      },
    ])
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    } else {
      process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
    }
  }
})

void test("resolvePolicy normalizes runtime defaults into a strict policy", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      model: "openai/gpt-5.4-mini",
      allowedVariants: ["high"],
    },
  })

  assert.equal(policy.runtimeAgentName, "dynamic-subagent-runtime")
  assert.equal(policy.model, "openai/gpt-5.4-mini")
  assert.deepEqual(policy.allowedVariants, ["high"])
  assert.deepEqual(policy.allowedModels, [])
  assert.equal(policy.hidden, true)
})

void test("resolvePolicy normalizes string and object allowed model entries", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      allowedModels: [
        "openai/gpt-5.4",
        {
          id: "openai/gpt-5.3-codex-spark",
          description: "Fast code-focused model for cheaper subagents.",
        },
      ],
    },
  })

  assert.deepEqual(policy.allowedModels, [
    { id: "openai/gpt-5.4" },
    {
      id: "openai/gpt-5.3-codex-spark",
      description: "Fast code-focused model for cheaper subagents.",
    },
  ])
})

void test("injectRuntimeSubagent adds a hidden backing agent", () => {
  const config = {
    agent: {} as Record<string, { mode?: "primary" | "subagent" | "all"; hidden?: boolean }>,
  }
  const collision = injectRuntimeSubagent(
    config,
    resolvePolicy({
      version: 1,
      runtime: {
        agentName: "dynamic-runtime",
      },
    }),
  )

  assert.equal(collision, null)
  const runtimeAgent = config.agent["dynamic-runtime"]
  assert.ok(runtimeAgent)
  assert.equal(runtimeAgent.mode, "subagent")
  assert.equal(runtimeAgent.hidden, true)
})

void test("collectConfiguredSubagents excludes primary agents", () => {
  const subagents = collectConfiguredSubagents({
    agent: {
      build: {
        mode: "primary",
        description: "Build things",
      },
      review: {
        mode: "subagent",
        description: "Review changes",
      },
    },
  })

  assert.deepEqual(subagents, [{ name: "review", description: "Review changes", hidden: false }])
})

void test("validateDynamicSubagentRequest rejects collisions with named subagents", () => {
  const policy = resolvePolicy({
    version: 1,
    limits: {
      maxSubagentNameLength: 32,
    },
  })

  assert.throws(
    () => {
      validateDynamicSubagentRequest(
        policy,
        {
          subagentType: "review",
          subagentDescription: "Code reviewer",
          taskDescription: "Review diff",
          prompt: "Review the current diff.",
        },
        ["review"],
      )
    },
    /conflicts with an existing named subagent/,
  )
})

void test("buildDynamicTaskPrompt embeds runtime specialization", () => {
  const prompt = buildDynamicTaskPrompt({
    subagentType: "perf-auditor",
    subagentDescription: "Investigate runtime bottlenecks",
    taskDescription: "Audit performance",
    prompt: "Profile the request path and summarize hotspots.",
  })

  assert.match(prompt, /perf-auditor/)
  assert.match(prompt, /Investigate runtime bottlenecks/)
  assert.match(prompt, /Profile the request path/)
})

void test("buildTaskDescription explains named and dynamic subagents", () => {
  const description = buildTaskDescription(
    [{ name: "review", description: "Review changes", hidden: false }],
    resolvePolicy({
      version: 1,
      defaults: {
        allowedModels: [
          "openai/gpt-5.4",
          {
            id: "openai/gpt-5.3-codex-spark",
            description: "Fast code-focused model for cheaper subagents.",
          },
        ],
      },
    }),
  )

  assert.match(description, /Named subagents:/)
  assert.match(description, /review/)
  assert.match(description, /Dynamic subagents are enabled/)
  assert.match(description, /openai\/gpt-5.4/)
  assert.match(description, /openai\/gpt-5.3-codex-spark: Fast code-focused model for cheaper subagents\./)
})
