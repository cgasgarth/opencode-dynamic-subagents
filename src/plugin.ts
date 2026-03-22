import type { Plugin } from "@opencode-ai/plugin"

import { buildTaskDescription, collectConfiguredSubagents, injectRuntimeSubagent, loadDynamicSubAgentsConfig, resolvePolicy } from "./config.js"
import { createTaskTool } from "./task-tool.js"
import type { ConfiguredSubagentSummary } from "./types.js"

type PluginConfigShape = Parameters<typeof collectConfiguredSubagents>[0]
type SystemTransformOutput = {
  system: string[]
}

type RuntimeState = {
  configuredSubagents: readonly ConfiguredSubagentSummary[]
  runtimeAgentName?: string
}

export const DynamicSubAgentsPlugin: Plugin = (input) => {
  const state: RuntimeState = {
    configuredSubagents: [],
  }

  const taskTool = createTaskTool(input, state)

  return Promise.resolve({
    async config(config: PluginConfigShape) {
      const dynamicConfig = await loadDynamicSubAgentsConfig()

      state.configuredSubagents = collectConfiguredSubagents(config)
      delete state.runtimeAgentName

      if (!dynamicConfig) return

      const policy = resolvePolicy(dynamicConfig)
      const collision = injectRuntimeSubagent(config, policy)

      if (collision) {
        await input.client.app.log({
          body: {
            service: "opencode-dynamic-subagents",
            level: "warn",
            message: "Skipped dynamic runtime agent injection because the configured runtime agent name already exists",
            extra: {
              runtimeAgentName: collision,
            },
          },
        })

        return
      }

      state.runtimeAgentName = policy.runtimeAgentName
      state.configuredSubagents = collectConfiguredSubagents(config, policy.runtimeAgentName)
    },
    tool: {
      task: taskTool,
    },
    "experimental.chat.system.transform": async (_hookInput: unknown, output: SystemTransformOutput) => {
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      const policy = dynamicConfig ? resolvePolicy(dynamicConfig) : undefined

      output.system.push(buildTaskDescription(state.configuredSubagents, policy))
    },
  })
}

export default DynamicSubAgentsPlugin
