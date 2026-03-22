import * as assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"

import { DynamicSubAgentsPlugin } from "../src/plugin.js"
import type { GeneratedSubagentConfig } from "../src/types.js"

async function withConfigFile<T>(config: unknown, fn: () => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-dynamic-subagents-plugin-"))
  const configPath = path.join(tempDir, "dynamicSubAgents.json")
  await writeFile(configPath, JSON.stringify(config))

  const original = process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
  process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = configPath

  try {
    return await fn()
  } finally {
    if (original === undefined) delete process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"]
    else process.env["OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"] = original
  }
}

void test("plugin injects generated subagents into config", async () => {
  await withConfigFile(
    {
      version: 1,
      defaults: {
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
    },
    async () => {
      const hooks = await DynamicSubAgentsPlugin({} as never)
      const config: {
        agent: Record<string, GeneratedSubagentConfig | { mode: "subagent"; description: string }>
      } = {
        agent: {
          review: {
            mode: "subagent",
            description: "Review changes",
          },
        },
      }

      await hooks.config?.(config as never)

      assert.ok(config.agent["dsa-gpt54-low"])
      assert.ok(config.agent["dsa-gpt54-high"])
      assert.ok(config.agent["dsa-spark-low"])
      assert.ok(config.agent["dsa-spark-high"])
      const sparkHigh = config.agent["dsa-spark-high"]
      assert.ok(sparkHigh)
      assert.equal("model" in sparkHigh ? sparkHigh.model : undefined, "openai/gpt-5.3-codex-spark")
      assert.equal("variant" in sparkHigh ? sparkHigh.variant : undefined, "high")
      assert.match(sparkHigh.description, /Fast code search option/)
    },
  )
})

void test("plugin leaves existing colliding agents untouched", async () => {
  await withConfigFile(
    {
      version: 1,
      defaults: {
        allowedModels: [
          {
            id: "openai/gpt-5.3-codex-spark",
            name: "spark",
          },
        ],
        allowedVariants: ["high"],
      },
    },
    async () => {
      const hooks = await DynamicSubAgentsPlugin({} as never)
      const config: {
        agent: Record<string, GeneratedSubagentConfig | { mode: "subagent"; description: string; model: string }>
      } = {
        agent: {
          "dsa-spark-high": {
            mode: "subagent",
            description: "Existing agent",
            model: "openai/gpt-5.4",
          },
        },
      }

      await hooks.config?.(config as never)

      const existing = config.agent["dsa-spark-high"]
      assert.ok(existing)
      assert.equal("model" in existing ? existing.model : undefined, "openai/gpt-5.4")
      assert.equal(existing.description, "Existing agent")
    },
  )
})
