import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import type { Config as OpenCodeConfig } from "@opencode-ai/sdk"
import { z } from "zod"

import type {
  DynamicSubAgent,
  DynamicSubAgentDefaults,
  DynamicSubAgentInput,
  DynamicSubAgentsConfig,
  ResolvedModel,
} from "./types.js"

const COLOR_OPTIONS = ["primary", "secondary", "accent", "success", "warning", "error", "info"] as const
const CONFIG_ENV_NAME = "OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"

const permissionSchema = z.record(z.string(), z.unknown()).optional()

const defaultsSchema = z.object({
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
  allowedModels: z.array(z.string().min(1)).readonly().optional(),
  allowedVariants: z.array(z.string().min(1)).readonly().optional(),
})

const agentSchema = z.object({
  description: z.string().min(1),
  prompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  variant: z.string().min(1).optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.enum(COLOR_OPTIONS)]).optional(),
  hidden: z.boolean().optional(),
  steps: z.number().int().positive().optional(),
  permission: permissionSchema,
  options: z.record(z.string(), z.unknown()).optional(),
  allowedModels: z.array(z.string().min(1)).readonly().optional(),
  allowedVariants: z.array(z.string().min(1)).readonly().optional(),
})

const dynamicSubAgentsConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaults: defaultsSchema.optional(),
  agents: z.record(z.string().min(1), agentSchema),
})

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

export function listDynamicAgents(config: DynamicSubAgentsConfig): DynamicSubAgent[] {
  return Object.entries(config.agents)
    .map(([name, agent]) => normalizeDynamicAgent(name, agent, config.defaults))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function findDynamicAgent(config: DynamicSubAgentsConfig, name: string): DynamicSubAgent | undefined {
  const agent = config.agents[name]
  return agent ? normalizeDynamicAgent(name, agent, config.defaults) : undefined
}

export function injectDynamicAgents(config: OpenCodeConfig, dynamicConfig: DynamicSubAgentsConfig): string[] {
  const collisions: string[] = []
  config.agent ??= {}

  for (const agent of listDynamicAgents(dynamicConfig)) {
    if (agent.name in config.agent) {
      collisions.push(agent.name)
      continue
    }

    const permission =
      agent.permission as NonNullable<NonNullable<OpenCodeConfig["agent"]>[string]>["permission"] | undefined

    config.agent[agent.name] = {
      mode: "subagent",
      description: agent.description,
      ...(agent.prompt ? { prompt: agent.prompt } : {}),
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.variant ? { variant: agent.variant } : {}),
      ...(agent.temperature !== undefined ? { temperature: agent.temperature } : {}),
      ...(agent.top_p !== undefined ? { top_p: agent.top_p } : {}),
      ...(agent.color ? { color: agent.color } : {}),
      ...(agent.hidden !== undefined ? { hidden: agent.hidden } : {}),
      ...(agent.steps !== undefined ? { maxSteps: agent.steps } : {}),
      ...(permission ? { permission } : {}),
      ...agent.options,
    }
  }

  return collisions
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

export function validateModelSelection(agent: DynamicSubAgent, model: string): void {
  if (agent.allowedModels.length > 0 && !agent.allowedModels.includes(model)) {
    throw new Error(`Model "${model}" is not allowed for @${agent.name}.`)
  }
}

export function validateVariantSelection(agent: DynamicSubAgent, variant: string): void {
  if (agent.allowedVariants.length > 0 && !agent.allowedVariants.includes(variant)) {
    throw new Error(`Variant "${variant}" is not allowed for @${agent.name}.`)
  }
}

export function buildTaskDescription(dynamicAgents: readonly DynamicSubAgent[]): string {
  const lines = dynamicAgents.map((agent) => {
    const details = [
      agent.model ? `default model: ${agent.model}` : undefined,
      agent.variant ? `default variant: ${agent.variant}` : undefined,
      agent.allowedModels.length > 0 ? `allowed models: ${agent.allowedModels.join(", ")}` : undefined,
      agent.allowedVariants.length > 0 ? `allowed variants: ${agent.allowedVariants.join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join("; ")

    return details ? `- ${agent.name}: ${agent.description} (${details})` : `- ${agent.name}: ${agent.description}`
  })

  return lines.length > 0
    ? [
        "Launch a specialized subagent task.",
        "For dynamic subagents configured in dynamicSubAgents.json you may also pass model and variant when allowed.",
        "",
        "Configured dynamic subagents:",
        ...lines,
      ].join("\n")
    : "Launch a specialized subagent task."
}

function normalizeDynamicAgent(
  name: string,
  agent: DynamicSubAgentInput,
  defaults: DynamicSubAgentDefaults | undefined,
): DynamicSubAgent {
  const normalized: DynamicSubAgent = {
    name,
    description: agent.description,
    options: {
      ...(defaults?.options ?? {}),
      ...(agent.options ?? {}),
    },
    allowedModels: agent.allowedModels ?? defaults?.allowedModels ?? [],
    allowedVariants: agent.allowedVariants ?? defaults?.allowedVariants ?? [],
  }

  const model = agent.model ?? defaults?.model
  const variant = agent.variant ?? defaults?.variant
  const temperature = agent.temperature ?? defaults?.temperature
  const topP = agent.top_p ?? defaults?.top_p
  const color = agent.color ?? defaults?.color
  const hidden = agent.hidden ?? defaults?.hidden
  const steps = agent.steps ?? defaults?.steps
  const permission = agent.permission ?? defaults?.permission

  if (agent.prompt) normalized.prompt = agent.prompt
  if (model !== undefined) normalized.model = model
  if (variant !== undefined) normalized.variant = variant
  if (temperature !== undefined) normalized.temperature = temperature
  if (topP !== undefined) normalized.top_p = topP
  if (color !== undefined) normalized.color = color
  if (hidden !== undefined) normalized.hidden = hidden
  if (steps !== undefined) normalized.steps = steps
  if (permission !== undefined) normalized.permission = permission

  return normalized
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
