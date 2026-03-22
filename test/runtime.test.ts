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
  validateModelSelection,
  validateVariantSelection,
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

void test("loadDynamicSubAgentsConfig rejects invalid config shapes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-dynamic-subagents-invalid-"))
  const configPath = path.join(tempDir, "dynamicSubAgents.json")

  await writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      defaults: {
        allowedModels: [
          {
            description: "Missing model id",
          },
        ],
      },
    }),
  )

  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = configPath

  try {
    await assert.rejects(() => loadDynamicSubAgentsConfig())
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

void test("injectRuntimeSubagent preserves an existing runtime agent", () => {
  const config = {
    agent: {
      "dynamic-runtime": {
        mode: "subagent" as const,
        description: "Existing runtime",
      },
    },
  }

  const collision = injectRuntimeSubagent(
    config,
    resolvePolicy({
      version: 1,
      runtime: {
        agentName: "dynamic-runtime",
        description: "New runtime",
      },
    }),
  )

  assert.equal(collision, "dynamic-runtime")
  assert.equal(config.agent["dynamic-runtime"].description, "Existing runtime")
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

void test("validateDynamicSubagentRequest rejects invalid subagent names", () => {
  const policy = resolvePolicy({
    version: 1,
  })

  assert.throws(
    () => {
      validateDynamicSubagentRequest(
        policy,
        {
          subagentType: "review helper",
          subagentDescription: "Code reviewer",
          taskDescription: "Review diff",
          prompt: "Review the current diff.",
        },
        [],
      )
    },
    /is invalid/,
  )
})

void test("validateDynamicSubagentRequest enforces configured task and prompt limits", () => {
  const policy = resolvePolicy({
    version: 1,
    limits: {
      maxTaskDescriptionLength: 10,
      maxPromptLength: 12,
    },
  })

  assert.throws(
    () => {
      validateDynamicSubagentRequest(
        policy,
        {
          subagentType: "review",
          subagentDescription: "Code reviewer",
          taskDescription: "Review current diff",
          prompt: "Short prompt",
        },
        [],
      )
    },
    /Task description exceeds the configured limit/,
  )

  assert.throws(
    () => {
      validateDynamicSubagentRequest(
        policy,
        {
          subagentType: "review",
          subagentDescription: "Code reviewer",
          taskDescription: "Review",
          prompt: "Prompt that is far too long",
        },
        [],
      )
    },
    /Task prompt exceeds the configured limit/,
  )
})

void test("validateModelSelection rejects disallowed models", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      allowedModels: ["openai/gpt-5.4"],
    },
  })

  assert.doesNotThrow(() => {
    validateModelSelection(policy, "openai/gpt-5.4")
  })

  assert.throws(
    () => {
      validateModelSelection(policy, "openai/gpt-5.3-codex-spark")
    },
    /is not allowed by dynamicSubAgents\.json/,
  )
})

void test("validateVariantSelection rejects disallowed variants", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      allowedVariants: ["high"],
    },
  })

  assert.doesNotThrow(() => {
    validateVariantSelection(policy, "high")
  })

  assert.throws(
    () => {
      validateVariantSelection(policy, "low")
    },
    /is not allowed by dynamicSubAgents\.json/,
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

void test("buildTaskDescription explains when dynamic subagents are disabled", () => {
  const description = buildTaskDescription([], undefined)

  assert.match(description, /No named subagents were discovered from config\./)
  assert.match(description, /Dynamic subagents are disabled until dynamicSubAgents\.json is present\./)
})
