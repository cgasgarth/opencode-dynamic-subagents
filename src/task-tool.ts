import type { PluginInput, ToolContext, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import type { AssistantMessage, Session, SessionMessageResponse } from "@opencode-ai/sdk"

import {
  buildTaskDescription,
  findDynamicAgent,
  formatModel,
  listDynamicAgents,
  loadDynamicSubAgentsConfig,
  parseModel,
  validateModelSelection,
  validateVariantSelection,
} from "./config.js"
import type { DynamicSubAgent, ResolvedModel } from "./types.js"

type TaskToolArgs = {
  description: string
  prompt: string
  subagent_type: string
  task_id?: string | undefined
  command?: string | undefined
  model?: string | undefined
  variant?: string | undefined
}

export function createTaskTool(pluginInput: PluginInput): ToolDefinition {
  return tool({
    description: "Launch a specialized subagent task. Supports optional model and variant selection.",
    args: {
      description: tool.schema.string().min(1).describe("A short (3-5 words) description of the task"),
      prompt: tool.schema.string().min(1).describe("The task for the agent to perform"),
      subagent_type: tool.schema.string().min(1).describe("The subagent type to use"),
      task_id: tool.schema.string().min(1).optional().describe("Resume an existing subagent session if provided"),
      command: tool.schema.string().min(1).optional().describe("The command that triggered this task"),
      model: tool.schema
        .string()
        .min(1)
        .optional()
        .describe('Optional model override in "provider/model" format when allowed'),
      variant: tool.schema.string().min(1).optional().describe("Optional variant or thinking level when allowed"),
    },
    async execute(args, context) {
      const config = await loadDynamicSubAgentsConfig()
      const dynamicAgent = config ? findDynamicAgent(config, args.subagent_type) : undefined

      await context.ask({
        permission: "task",
        patterns: [args.subagent_type],
        always: ["*"],
        metadata: {
          description: args.description,
          subagent_type: args.subagent_type,
        },
      })

      const parentAssistant = await loadParentAssistantMessage(pluginInput, context)
      const model = resolveModel(dynamicAgent, args.model, parentAssistant)
      const variant = resolveVariant(dynamicAgent, args.variant)
      const session = await getOrCreateTaskSession(pluginInput, context, args)

      context.metadata({
        title: args.description,
        metadata: {
          sessionId: session.id,
          model,
          variant,
        },
      })

      const result = await pluginInput.client.session.prompt({
        path: { id: session.id },
        query: { directory: context.directory },
        body: {
          agent: args.subagent_type,
          model,
          ...(variant ? { variant } : {}),
          parts: [{ type: "text", text: args.prompt }],
        },
      })

      if (!result.data) {
        throw new Error("Failed to send prompt to subagent session.")
      }

      return [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        extractTextResult(result.data),
        "</task_result>",
      ].join("\n")
    },
  })
}

export async function createTaskDescription(): Promise<string> {
  const config = await loadDynamicSubAgentsConfig()
  return buildTaskDescription(config ? listDynamicAgents(config) : [])
}

export function formatTaskSelection(model: ResolvedModel, variant: string | undefined): string {
  return variant ? `${formatModel(model)} (${variant})` : formatModel(model)
}

async function loadParentAssistantMessage(
  pluginInput: PluginInput,
  context: ToolContext,
): Promise<AssistantMessage | undefined> {
  const message = await pluginInput.client.session.message({
    path: { id: context.sessionID, messageID: context.messageID },
    query: { directory: context.directory },
  })

  if (message.data?.info.role !== "assistant") {
    return undefined
  }

  return message.data.info
}

function resolveModel(
  dynamicAgent: DynamicSubAgent | undefined,
  requestedModel: string | undefined,
  parentAssistant: AssistantMessage | undefined,
): ResolvedModel {
  if (requestedModel) {
    if (dynamicAgent) validateModelSelection(dynamicAgent, requestedModel)
    return parseModel(requestedModel)
  }

  if (dynamicAgent?.model) {
    validateModelSelection(dynamicAgent, dynamicAgent.model)
    return parseModel(dynamicAgent.model)
  }

  if (!parentAssistant) {
    throw new Error("Could not resolve a model for the subagent task.")
  }

  return {
    providerID: parentAssistant.providerID,
    modelID: parentAssistant.modelID,
  }
}

function resolveVariant(
  dynamicAgent: DynamicSubAgent | undefined,
  requestedVariant: string | undefined,
): string | undefined {
  if (requestedVariant) {
    if (dynamicAgent) validateVariantSelection(dynamicAgent, requestedVariant)
    return requestedVariant
  }

  if (dynamicAgent?.variant) {
    validateVariantSelection(dynamicAgent, dynamicAgent.variant)
    return dynamicAgent.variant
  }

  return undefined
}

async function getOrCreateTaskSession(
  pluginInput: PluginInput,
  context: ToolContext,
  args: TaskToolArgs,
): Promise<Session> {
  if (args.task_id) {
    const existing = await pluginInput.client.session
      .get({
        path: { id: args.task_id },
        query: { directory: context.directory },
      })
      .catch(() => undefined)

    if (existing?.data) return existing.data
  }

  const created = await pluginInput.client.session.create({
    query: { directory: context.directory },
    body: {
      parentID: context.sessionID,
      title: `${args.description} (@${args.subagent_type} subagent)`,
    },
  })

  if (!created.data) {
    throw new Error("Failed to create subagent session.")
  }

  return created.data
}

function extractTextResult(message: SessionMessageResponse): string {
  const textPart = [...message.parts].reverse().find((part) => part.type === "text")
  return textPart?.type === "text" ? textPart.text : "Subagent completed without a text result."
}
