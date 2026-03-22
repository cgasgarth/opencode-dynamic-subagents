import * as assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"

import {
  buildGeneratedSubagents,
  collectConfiguredSubagents,
  formatModel,
  loadDynamicSubAgentsConfig,
  parseModel,
  resolveConfigPath,
  resolvePolicy,
} from "../src/config.js"

void test("parseModel splits provider/model pairs", () => {
  assert.deepEqual(parseModel("openai/gpt-5.4-mini"), {
    providerID: "openai",
    modelID: "gpt-5.4-mini",
  })
  assert.equal(formatModel(parseModel("openai/gpt-5.4-mini")), "openai/gpt-5.4-mini")
})

void test("resolveConfigPath honors the environment override", () => {
  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = "/tmp/dynamicSubAgents.json"

  try {
    assert.equal(resolveConfigPath(), "/tmp/dynamicSubAgents.json")
  } finally {
    if (original === undefined) delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    else process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
  }
})

void test("loadDynamicSubAgentsConfig returns null when the file is missing", async () => {
  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = path.join(os.tmpdir(), "missing", "dynamicSubAgents.json")

  try {
    const config = await loadDynamicSubAgentsConfig()
    assert.equal(config, null)
  } finally {
    if (original === undefined) delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    else process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
  }
})

void test("loadDynamicSubAgentsConfig loads a valid generated-agent config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-dynamic-subagents-"))
  const configPath = path.join(tempDir, "dynamicSubAgents.json")

  await writeFile(
    configPath,
    JSON.stringify({
      $schema: "https://example.com/dynamicSubAgents.schema.json",
      version: 1,
      defaults: {
        model: "openai/gpt-5.4",
        allowedModels: [
          {
            id: "openai/gpt-5.4",
            name: "gpt54",
            description: "Broad reasoning default.",
          },
        ],
        allowedVariants: ["low", "high"],
      },
      limits: {
        maxSubagentNameLength: 40,
      },
    }),
  )

  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = configPath

  try {
    const config = await loadDynamicSubAgentsConfig()
    assert.ok(config)
    assert.equal(config.defaults?.allowedModels?.[0] && typeof config.defaults.allowedModels[0] !== "string" ? config.defaults.allowedModels[0].name : undefined, "gpt54")
  } finally {
    if (original === undefined) delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    else process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
  }
})

void test("resolvePolicy falls back to defaults.model when allowedModels is omitted", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      model: "openai/gpt-5.4",
      variant: "high",
    },
  })

  assert.equal(policy.hidden, false)
  assert.equal(policy.allowedModels.length, 1)
  assert.equal(policy.allowedModels[0]?.id, "openai/gpt-5.4")
  assert.deepEqual(policy.allowedVariants, [])
})

void test("buildGeneratedSubagents creates one agent per model and allowed variant", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      prompt: "Use the configured model directly.",
      temperature: 0.2,
      allowedModels: [
        {
          id: "openai/gpt-5.4",
          name: "gpt54",
          description: "Broad reasoning default.",
        },
        {
          id: "openai/gpt-5.3-codex-spark",
          name: "spark",
          description: "Fast code search option.",
        },
      ],
      allowedVariants: ["low", "high"],
    },
  })

  const generated = buildGeneratedSubagents(policy, ["review"])
  assert.deepEqual(
    generated.map((item) => item.name),
    ["dsa-gpt54-high", "dsa-gpt54-low", "dsa-spark-high", "dsa-spark-low"],
  )
  const first = generated[0]
  assert.ok(first)
  assert.equal(first.config.mode, "subagent")
  assert.equal(first.config.prompt, "Use the configured model directly.")
  assert.equal(first.config.temperature, 0.2)
})

void test("buildGeneratedSubagents skips collisions with existing agents", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      allowedModels: [
        {
          id: "openai/gpt-5.3-codex-spark",
          name: "spark",
        },
      ],
      allowedVariants: ["low", "high"],
    },
  })

  const generated = buildGeneratedSubagents(policy, ["dsa-spark-low"])
  assert.deepEqual(generated.map((item) => item.name), ["dsa-spark-high"])
})

void test("buildGeneratedSubagents rejects overlong names", () => {
  const policy = resolvePolicy({
    version: 1,
    defaults: {
      allowedModels: ["openai/this-model-name-is-far-too-long"],
      allowedVariants: ["high"],
    },
    limits: {
      maxSubagentNameLength: 10,
    },
  })

  assert.throws(() => {
    buildGeneratedSubagents(policy, [])
  }, /exceeds the configured limit/)
})

void test("collectConfiguredSubagents excludes primary agents", () => {
  const subagents = collectConfiguredSubagents({
    agent: {
      build: {
        mode: "primary",
        description: "Build things",
      },
      spark: {
        mode: "subagent",
        description: "Search code",
      },
    },
  })

  assert.deepEqual(subagents, [{ name: "spark", description: "Search code", hidden: false }])
})
