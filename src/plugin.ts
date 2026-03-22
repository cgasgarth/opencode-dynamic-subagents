import type { Plugin } from "@opencode-ai/plugin"

import { buildTaskDescription, collectConfiguredSubagents, injectRuntimeSubagent, loadDynamicSubAgentsConfig, resolvePolicy } from "./config.js"
import { createTaskTool } from "./task-tool.js"
import type { ConfiguredSubagentSummary } from "./types.js"

type PluginConfigShape = Parameters<typeof collectConfiguredSubagents>[0] & {
  agent?: Record<string, { permission?: unknown } | undefined>
  experimental?: {
    primary_tools?: readonly string[]
  }
}
type SystemTransformOutput = {
  system: string[]
}

type RuntimeState = {
  configuredSubagents: readonly ConfiguredSubagentSummary[]
  runtimeAgentName?: string
  primaryTools: readonly string[]
  taskPermissionAgents: ReadonlySet<string>
}

export const DynamicSubAgentsPlugin: Plugin = (input) => {
  const state: RuntimeState = {
    configuredSubagents: [],
    primaryTools: [],
    taskPermissionAgents: new Set<string>(),
  }

  const taskTool = createTaskTool(input, state)

  return Promise.resolve({
    async config(config: PluginConfigShape) {
      const dynamicConfig = await loadDynamicSubAgentsConfig()

      state.configuredSubagents = collectConfiguredSubagents(config)
      state.primaryTools = config.experimental?.primary_tools ?? []
      state.taskPermissionAgents = collectTaskPermissionAgents(config.agent)
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
      if (hasExplicitTaskPermission(policy.permission)) {
        state.taskPermissionAgents = new Set(state.taskPermissionAgents).add(policy.runtimeAgentName)
      }
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

export function collectTaskPermissionAgents(agents: PluginConfigShape["agent"]): ReadonlySet<string> {
  const result = new Set<string>()

  for (const [name, agent] of Object.entries(agents ?? {})) {
    if (hasExplicitTaskPermission(agent?.permission)) {
      result.add(name)
    }
  }

  return result
}

export function hasExplicitTaskPermission(permission: unknown): boolean {
  return typeof permission === "object" && permission !== null && "task" in permission
}

export default DynamicSubAgentsPlugin
