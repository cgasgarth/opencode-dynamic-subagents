import type { Plugin } from "@opencode-ai/plugin"

import { injectDynamicAgents, listDynamicAgents, loadDynamicSubAgentsConfig } from "./config.js"
import { createTaskDescription, createTaskTool, formatTaskSelection } from "./task-tool.js"

export const DynamicSubAgentsPlugin: Plugin = async (input) => {
  const taskTool = createTaskTool(input)

  return {
    async config(config) {
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      if (!dynamicConfig) return

      const collisions = injectDynamicAgents(config, dynamicConfig)
      if (collisions.length === 0) return

      await input.client.app.log({
        body: {
          service: "opencode-dynamic-subagents",
          level: "warn",
          message: "Skipped dynamic subagents because matching agent names already exist",
          extra: {
            collisions,
          },
        },
      })
    },
    tool: {
      task: {
        ...taskTool,
        description: await createTaskDescription(),
      },
    },
    "experimental.chat.system.transform": async (_hookInput, output) => {
      const dynamicConfig = await loadDynamicSubAgentsConfig()
      if (!dynamicConfig) return

      const dynamicAgents = listDynamicAgents(dynamicConfig).map((agent) => agent.name)
      if (dynamicAgents.length === 0) return

      output.system.push(
        [
          "Dynamic subagents are available through the task tool.",
          "When you choose one, you may pass model and variant if the target subagent allows them.",
          `Configured dynamic subagents: ${dynamicAgents.map((agent) => `@${agent}`).join(", ")}.`,
          `When reasoning is relevant, prefer an explicit model/variant pair such as ${formatTaskSelection(
            { providerID: "provider", modelID: "model" },
            "high",
          )}.`,
        ].join(" "),
      )
    },
  }
}

export default DynamicSubAgentsPlugin
