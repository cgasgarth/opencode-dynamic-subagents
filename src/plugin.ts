import type { Plugin } from "@opencode-ai/plugin"

import { buildGeneratedSubagents, loadDynamicSubAgentsConfig, resolvePolicy } from "./config.js"

type PluginConfigShape = {
  agent?: Record<string, Record<string, unknown> | undefined>
}

export const DynamicSubAgentsPlugin: Plugin = () =>
  Promise.resolve({
    async config(config: PluginConfigShape) {
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      if (!dynamicConfig) return

      const policy = resolvePolicy(dynamicConfig)
      const existingNames = Object.keys(config.agent ?? {})
      const generated = buildGeneratedSubagents(policy, existingNames)
      if (generated.length === 0) return

      config.agent ??= {}
      for (const agent of generated) {
        config.agent[agent.name] = agent.config
      }
    },
  })

export default DynamicSubAgentsPlugin
