import type { PluginInput, ToolContext, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import type { AssistantMessage, Session, SessionMessageResponse } from "@opencode-ai/sdk"

import {
  buildDynamicTaskPrompt,
  formatModel,
  loadDynamicSubAgentsConfig,
  parseModel,
  resolvePolicy,
  validateDynamicSubagentRequest,
  validateModelSelection,
  validateVariantSelection,
} from "./config.js"
import type { ConfiguredSubagentSummary, DynamicSubAgentPolicy, DynamicSubagentRequest, ResolvedModel } from "./types.js"

export const TASK_TOOL_DESCRIPTION = [
  "Launch a specialized subagent task.",
  "Use subagent_type for a named existing subagent.",
  "To create an ad hoc dynamic subagent, also provide subagent_description.",
  'Optional model overrides use "provider/model" format.',
].join(" ")

type TaskToolArgs = {
  description: string
  prompt: string
  subagent_type: string
  subagent_description?: string | undefined
  task_id?: string | undefined
  command?: string | undefined
  model?: string | undefined
  variant?: string | undefined
}

export type TaskToolState = {
  configuredSubagents: readonly ConfiguredSubagentSummary[]
  runtimeAgentName?: string
  primaryTools: readonly string[]
  taskPermissionAgents: ReadonlySet<string>
}

export function createTaskTool(pluginInput: PluginInput, state: TaskToolState): ToolDefinition {
  return tool({
    description: TASK_TOOL_DESCRIPTION,
    args: {
      description: tool.schema.string().min(1).describe("A short (3-5 words) description of the task"),
      prompt: tool.schema.string().min(1).describe("The task for the agent to perform"),
      subagent_type: tool.schema.string().min(1).describe("Existing subagent name or a new dynamic subagent name"),
      subagent_description: tool.schema
        .string()
        .min(1)
        .optional()
        .describe("Define the specialization for an ad hoc dynamic subagent"),
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
      const policy = config ? resolvePolicy(config) : undefined
      const isDynamic = args.subagent_description !== undefined

      await context.ask({
        permission: "task",
        patterns: [args.subagent_type],
        always: ["*"],
        metadata: {
          description: args.description,
          subagent_type: args.subagent_type,
        },
      })

      if (isDynamic && !policy) {
        throw new Error("Dynamic subagents require ~/.config/opencode/dynamicSubAgents.json.")
      }

      const targetAgent = resolveTargetAgent(args, state, policy, isDynamic)
      const hasTaskPermission = resolveHasTaskPermission(args, state, policy, isDynamic)
      const parentAssistant = await loadParentAssistantMessage(pluginInput, context)
      const session = await getOrCreateTaskSession(pluginInput, context, args)
      const model = resolveModel(args, policy, parentAssistant, isDynamic)
      const variant = resolveVariant(args, policy, isDynamic)
      const prompt = resolvePrompt(args, policy, state, context)

      context.metadata({
        title: args.description,
        metadata: {
          sessionId: session.id,
          ...(model ? { model } : {}),
          ...(variant ? { variant } : {}),
        },
      })

      const body: {
        agent: string
        model?: ResolvedModel
        variant?: string
        tools?: Record<string, boolean>
        parts: { type: "text"; text: string }[]
      } = {
        agent: targetAgent,
        parts: [{ type: "text", text: prompt }],
        tools: buildToolSelection(hasTaskPermission, state.primaryTools),
      }

      if (model) body.model = model
      if (variant) body.variant = variant

      const result = await pluginInput.client.session.prompt({
        path: { id: session.id },
        query: { directory: context.directory },
        body,
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
  args: TaskToolArgs,
  policy: DynamicSubAgentPolicy | undefined,
  parentAssistant: AssistantMessage | undefined,
  isDynamic: boolean,
): ResolvedModel | undefined {
  if (args.model) {
    if (policy) validateModelSelection(policy, args.model)
    return parseModel(args.model)
  }

  if (isDynamic && policy?.model) {
    validateModelSelection(policy, policy.model)
    return parseModel(policy.model)
  }

  if (!isDynamic) return undefined
  if (!parentAssistant) throw new Error("Could not resolve a model for the dynamic subagent task.")

  const inherited = {
    providerID: parentAssistant.providerID,
    modelID: parentAssistant.modelID,
  }

  if (policy) validateModelSelection(policy, formatModel(inherited))
  return inherited
}

function resolveVariant(
  args: TaskToolArgs,
  policy: DynamicSubAgentPolicy | undefined,
  isDynamic: boolean,
): string | undefined {
  if (args.variant) {
    if (policy) validateVariantSelection(policy, args.variant)
    return args.variant
  }

  if (isDynamic && policy?.variant) {
    validateVariantSelection(policy, policy.variant)
    return policy.variant
  }

  return undefined
}

function resolveTargetAgent(
  args: TaskToolArgs,
  state: TaskToolState,
  policy: DynamicSubAgentPolicy | undefined,
  isDynamic: boolean,
): string {
  if (!isDynamic) return args.subagent_type
  if (!policy) throw new Error("Dynamic subagent policy is unavailable.")
  if (state.runtimeAgentName && state.runtimeAgentName !== policy.runtimeAgentName) {
    throw new Error("Dynamic runtime state is inconsistent with the loaded config.")
  }
  return policy.runtimeAgentName
}

function resolveHasTaskPermission(
  args: TaskToolArgs,
  state: TaskToolState,
  policy: DynamicSubAgentPolicy | undefined,
  isDynamic: boolean,
): boolean {
  if (isDynamic) {
    if (!policy) throw new Error("Dynamic subagent policy is unavailable.")
    return state.taskPermissionAgents.has(policy.runtimeAgentName)
  }

  return state.taskPermissionAgents.has(args.subagent_type)
}

function resolvePrompt(
  args: TaskToolArgs,
  policy: DynamicSubAgentPolicy | undefined,
  state: TaskToolState,
  context: Pick<ToolContext, "directory" | "worktree">,
): string {
  if (!args.subagent_description) return args.prompt
  if (!policy) throw new Error("Dynamic subagent policy is unavailable.")

  const request: DynamicSubagentRequest = {
    subagentType: args.subagent_type,
    subagentDescription: args.subagent_description,
    taskDescription: args.description,
    prompt: args.prompt,
    workingDirectory: context.directory,
    projectRoot: context.worktree,
  }

  validateDynamicSubagentRequest(
    policy,
    request,
    state.configuredSubagents.map((subagent) => subagent.name),
  )

  return buildDynamicTaskPrompt(request)
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

export function buildToolSelection(hasTaskPermission: boolean, primaryTools: readonly string[]): Record<string, boolean> {
  return {
    todowrite: false,
    todoread: false,
    ...(hasTaskPermission ? {} : { task: false }),
    ...Object.fromEntries(primaryTools.map((toolID) => [toolID, false])),
  }
}
