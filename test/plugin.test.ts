import * as assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"

import { DynamicSubAgentsPlugin } from "../src/plugin.js"

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

void test("plugin validates and enriches dynamic task arguments through tool.execute.before", async () => {
  await withConfigFile(
    {
      version: 1,
      defaults: {
        model: "openai/gpt-5.4",
        variant: "high",
        temperature: 0.2,
        allowedModels: ["openai/gpt-5.4", "openai/gpt-5.3-codex-spark"],
        allowedVariants: ["medium", "high"],
      },
    },
    async () => {
      const hooks = await DynamicSubAgentsPlugin({} as never)
      await hooks.config?.({
        agent: {
          review: {
            mode: "subagent",
            description: "Review changes",
          },
        },
      } as never)

      const output = {
        args: {
          description: "Search hooks",
          prompt: "Inspect apps/studio/src/hooks for no-use-effect cleanup candidates.",
          subagent_type: "spark-scout",
          subagent_description: "Focused code search subagent",
        } as Record<string, unknown>,
      }

      await hooks["tool.execute.before"]?.(
        {
          tool: "task",
          sessionID: "session-1",
          callID: "call-1",
        },
        output,
      )

      assert.equal(output.args["model"], "openai/gpt-5.4")
      assert.equal(output.args["variant"], "high")
      assert.deepEqual(output.args["agent_config"], {
        temperature: 0.2,
      })
    },
  )
})

void test("plugin rejects disallowed model overrides for task tool", async () => {
  await withConfigFile(
    {
      version: 1,
      defaults: {
        allowedModels: ["openai/gpt-5.4"],
      },
    },
    async () => {
      const hooks = await DynamicSubAgentsPlugin({} as never)

      await assert.rejects(async () => {
        await hooks["tool.execute.before"]?.(
          {
            tool: "task",
            sessionID: "session-1",
            callID: "call-1",
          },
          {
            args: {
              description: "Search hooks",
              prompt: "Inspect hooks.",
              subagent_type: "spark-scout",
              subagent_description: "Focused code search subagent",
              model: "openai/gpt-5.3-codex-spark",
            },
          },
        )
      }, /is not allowed by dynamicSubAgents\.json/)
    },
  )
})
