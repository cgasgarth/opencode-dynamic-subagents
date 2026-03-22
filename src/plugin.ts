import type { Plugin } from "@opencode-ai/plugin"

import {
  buildDynamicTaskAgentConfig,
  buildTaskDescription,
  collectConfiguredSubagents,
  loadDynamicSubAgentsConfig,
  resolvePolicy,
  validateDynamicSubagentRequest,
  validateModelSelection,
  validateVariantSelection,
} from "./config.js"
import type { ConfiguredSubagentSummary, DynamicTaskAgentConfig } from "./types.js"

type PluginConfigShape = Parameters<typeof collectConfiguredSubagents>[0]

type SystemTransformOutput = {
  system: string[]
}

type TaskToolArgs = {
  description?: unknown
  prompt?: unknown
  subagent_type?: unknown
  subagent_description?: unknown
  model?: unknown
  variant?: unknown
  agent_config?: unknown
}

type RuntimeState = {
  configuredSubagents: readonly ConfiguredSubagentSummary[]
}

export const DynamicSubAgentsPlugin: Plugin = () => {
  const state: RuntimeState = {
    configuredSubagents: [],
  }

  return Promise.resolve({
    config(config: PluginConfigShape) {
      state.configuredSubagents = collectConfiguredSubagents(config)
      return Promise.resolve()
    },
    "tool.execute.before": async (hookInput, output) => {
      if (hookInput.tool !== "task") return

      const args = output.args as TaskToolArgs
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      const policy = dynamicConfig ? resolvePolicy(dynamicConfig) : undefined

      const model = typeof args.model === "string" && args.model.length > 0 ? args.model : undefined
      const variant = typeof args.variant === "string" && args.variant.length > 0 ? args.variant : undefined

      if (policy && model) {
        validateModelSelection(policy, model)
      }

      if (policy && variant) {
        validateVariantSelection(policy, variant)
      }

      const subagentDescription =
        typeof args.subagent_description === "string" && args.subagent_description.length > 0
          ? args.subagent_description
          : undefined
      if (!subagentDescription) return

      if (!policy) {
        throw new Error("Dynamic subagents require ~/.config/opencode/dynamicSubAgents.json.")
      }

      if (typeof args.description !== "string" || typeof args.prompt !== "string" || typeof args.subagent_type !== "string") {
        throw new Error("Dynamic subagent task arguments are incomplete.")
      }

      validateDynamicSubagentRequest(
        policy,
        {
          subagentType: args.subagent_type,
          subagentDescription: subagentDescription,
          taskDescription: args.description,
          prompt: args.prompt,
        },
        state.configuredSubagents.map((subagent) => subagent.name),
      )

      if (!model && policy.model) {
        validateModelSelection(policy, policy.model)
        args.model = policy.model
      }

      if (!variant && policy.variant) {
        validateVariantSelection(policy, policy.variant)
        args.variant = policy.variant
      }

      args.agent_config = buildDynamicTaskAgentConfig(policy) satisfies DynamicTaskAgentConfig
    },
    "experimental.chat.system.transform": async (_hookInput: unknown, output: SystemTransformOutput) => {
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      const policy = dynamicConfig ? resolvePolicy(dynamicConfig) : undefined

      output.system.push(buildTaskDescription(state.configuredSubagents, policy))
    },
  })
}

export default DynamicSubAgentsPlugin
