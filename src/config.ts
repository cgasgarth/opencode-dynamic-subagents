import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { z } from "zod"

import type {
  ConfiguredSubagentSummary,
  DynamicSubAgentDefaults,
  DynamicSubAgentModelOption,
  DynamicSubAgentPolicy,
  DynamicTaskAgentConfig,
  DynamicSubagentRequest,
  DynamicSubAgentsConfig,
  ResolvedModel,
} from "./types.js"

const COLOR_OPTIONS = ["primary", "secondary", "accent", "success", "warning", "error", "info"] as const
const CONFIG_ENV_NAME = "OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"
const DEFAULT_MAX_SUBAGENT_NAME_LENGTH = 64
const SUBAGENT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/

const permissionSchema = z.record(z.string(), z.unknown()).optional()
const allowedModelSchema = z.union([
  z.string().min(1),
  z
    .object({
      id: z.string().min(1),
      description: z.string().min(1).optional(),
    })
    .strict(),
])

const defaultsSchema = z
  .object({
    titlePrefix: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    variant: z.string().min(1).optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.enum(COLOR_OPTIONS)]).optional(),
    hidden: z.boolean().optional(),
    steps: z.number().int().positive().optional(),
    permission: permissionSchema,
    options: z.record(z.string(), z.unknown()).optional(),
    allowedModels: z.array(allowedModelSchema).readonly().optional(),
    allowedVariants: z.array(z.string().min(1)).readonly().optional(),
  })
  .strict()

const runtimeSchema = z
  .object({
    agentName: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
  })
  .strict()

const limitsSchema = z
  .object({
    maxSubagentNameLength: z.number().int().positive().optional(),
    maxTaskDescriptionLength: z.number().int().positive().optional(),
    maxPromptLength: z.number().int().positive().optional(),
  })
  .strict()

const dynamicSubAgentsConfigSchema = z
  .object({
    $schema: z.string().min(1).optional(),
    version: z.literal(1).default(1),
    defaults: defaultsSchema.optional(),
    runtime: runtimeSchema.optional(),
    limits: limitsSchema.optional(),
  })
  .strict()

type OpenCodeAgentConfig = {
  mode?: "primary" | "subagent" | "all"
  description?: string
  hidden?: boolean
  prompt?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  color?: string
  steps?: number
  permission?: unknown
  [key: string]: unknown
}

type OpenCodeConfigShape = {
  agent?: Record<string, OpenCodeAgentConfig | undefined>
}

export function resolveConfigPath(): string {
  return process.env[CONFIG_ENV_NAME] ?? path.join(os.homedir(), ".config", "opencode", "dynamicSubAgents.json")
}

export async function loadDynamicSubAgentsConfig(): Promise<DynamicSubAgentsConfig | null> {
  const filePath = resolveConfigPath()
  const file = await fs.readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFileError(error)) return null
    throw error
  })

  if (!file) return null

  return dynamicSubAgentsConfigSchema.parse(JSON.parse(file) as unknown) as DynamicSubAgentsConfig
}

export function resolvePolicy(config: DynamicSubAgentsConfig): DynamicSubAgentPolicy {
  return {
    hidden: config.defaults?.hidden ?? true,
    options: config.defaults?.options ?? {},
    allowedModels: normalizeAllowedModels(config.defaults?.allowedModels),
    allowedVariants: config.defaults?.allowedVariants ?? [],
    maxSubagentNameLength: config.limits?.maxSubagentNameLength ?? DEFAULT_MAX_SUBAGENT_NAME_LENGTH,
    ...(config.defaults?.titlePrefix ? { titlePrefix: config.defaults.titlePrefix } : {}),
    ...(config.defaults?.model ? { model: config.defaults.model } : {}),
    ...(config.defaults?.variant ? { variant: config.defaults.variant } : {}),
    ...(config.defaults?.temperature !== undefined ? { temperature: config.defaults.temperature } : {}),
    ...(config.defaults?.top_p !== undefined ? { top_p: config.defaults.top_p } : {}),
    ...(config.defaults?.color ? { color: config.defaults.color } : {}),
    ...(config.defaults?.steps !== undefined ? { steps: config.defaults.steps } : {}),
    ...(config.defaults?.permission !== undefined ? { permission: config.defaults.permission } : {}),
    ...(config.limits?.maxTaskDescriptionLength !== undefined
      ? { maxTaskDescriptionLength: config.limits.maxTaskDescriptionLength }
      : {}),
    ...(config.limits?.maxPromptLength !== undefined ? { maxPromptLength: config.limits.maxPromptLength } : {}),
  }
}

export function collectConfiguredSubagents(config: OpenCodeConfigShape): ConfiguredSubagentSummary[] {
  return Object.entries(config.agent ?? {})
    .map(([name, agent]) => toConfiguredSubagent(name, agent))
    .filter((agent): agent is ConfiguredSubagentSummary => Boolean(agent))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function parseModel(model: string): ResolvedModel {
  const separatorIndex = model.indexOf("/")
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
    throw new Error(`Invalid model "${model}". Expected "provider/model".`)
  }

  return {
    providerID: model.slice(0, separatorIndex),
    modelID: model.slice(separatorIndex + 1),
  }
}

export function formatModel(model: ResolvedModel): string {
  return `${model.providerID}/${model.modelID}`
}

export function validateModelSelection(policy: DynamicSubAgentPolicy, model: string): void {
  if (policy.allowedModels.length > 0 && !policy.allowedModels.some((item) => item.id === model)) {
    throw new Error(`Model "${model}" is not allowed by dynamicSubAgents.json.`)
  }
}

export function validateVariantSelection(policy: DynamicSubAgentPolicy, variant: string): void {
  if (policy.allowedVariants.length > 0 && !policy.allowedVariants.includes(variant)) {
    throw new Error(`Variant "${variant}" is not allowed by dynamicSubAgents.json.`)
  }
}

export function validateDynamicSubagentRequest(
  policy: DynamicSubAgentPolicy,
  request: DynamicSubagentRequest,
  knownSubagentNames: readonly string[],
): void {
  if (!SUBAGENT_NAME_PATTERN.test(request.subagentType)) {
    throw new Error(
      `Dynamic subagent name "${request.subagentType}" is invalid. Use letters, numbers, ".", "_" or "-".`,
    )
  }

  if (request.subagentType.length > policy.maxSubagentNameLength) {
    throw new Error(
      `Dynamic subagent name "${request.subagentType}" exceeds the configured limit of ${String(policy.maxSubagentNameLength)} characters.`,
    )
  }

  if (knownSubagentNames.includes(request.subagentType)) {
    throw new Error(`Dynamic subagent name "${request.subagentType}" conflicts with an existing named subagent.`)
  }

  if (policy.maxTaskDescriptionLength !== undefined && request.taskDescription.length > policy.maxTaskDescriptionLength) {
    throw new Error(
      `Task description exceeds the configured limit of ${String(policy.maxTaskDescriptionLength)} characters.`,
    )
  }

  if (policy.maxPromptLength !== undefined && request.prompt.length > policy.maxPromptLength) {
    throw new Error(`Task prompt exceeds the configured limit of ${String(policy.maxPromptLength)} characters.`)
  }
}

export function buildTaskDescription(
  subagents: readonly ConfiguredSubagentSummary[],
  policy: DynamicSubAgentPolicy | undefined,
): string {
  const visible = subagents.filter((agent) => !agent.hidden)
  const lines = visible.map((agent) =>
    agent.description ? `- ${agent.name}: ${agent.description}` : `- ${agent.name}: existing subagent`,
  )

  const dynamicLines = policy
    ? [
        "Dynamic subagents are enabled.",
        "To create one, choose a fresh subagent_type, provide subagent_description, and optionally set model and variant.",
        ...(policy.allowedModels.length > 0
          ? [
              "Allowed models:",
              ...policy.allowedModels.map((model) =>
                model.description ? `- ${model.id}: ${model.description}` : `- ${model.id}`,
              ),
            ]
          : []),
        policy.allowedVariants.length > 0 ? `Allowed variants: ${policy.allowedVariants.join(", ")}.` : undefined,
      ].filter(Boolean)
    : ["Dynamic subagents are disabled until dynamicSubAgents.json is present."]

  return [
    "Launch a specialized subagent task.",
    visible.length > 0 ? "Named subagents:" : "No named subagents were discovered from config.",
    ...(lines.length > 0 ? lines : []),
    "",
    ...dynamicLines,
  ].join("\n")
}

export function buildDynamicTaskAgentConfig(policy: DynamicSubAgentPolicy): DynamicTaskAgentConfig {
  return {
    ...(policy.temperature !== undefined ? { temperature: policy.temperature } : {}),
    ...(policy.top_p !== undefined ? { top_p: policy.top_p } : {}),
    ...(policy.color ? { color: policy.color } : {}),
    ...(policy.steps !== undefined ? { steps: policy.steps } : {}),
    ...(policy.permission !== undefined ? { permission: policy.permission } : {}),
    ...(Object.keys(policy.options).length > 0 ? { options: policy.options } : {}),
  }
}

function toConfiguredSubagent(name: string, agent: OpenCodeAgentConfig | undefined): ConfiguredSubagentSummary | undefined {
  if (!agent) return undefined
  if (agent.mode === "primary") return undefined

  return {
    name,
    hidden: agent.hidden === true,
    ...(typeof agent.description === "string" ? { description: agent.description } : {}),
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function normalizeAllowedModels(allowedModels: DynamicSubAgentDefaults["allowedModels"] = []): DynamicSubAgentModelOption[] {
  return allowedModels.map((entry) => (typeof entry === "string" ? { id: entry } : entry))
}
