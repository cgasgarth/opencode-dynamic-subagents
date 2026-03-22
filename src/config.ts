import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { z } from "zod"

import type {
  ConfiguredSubagentSummary,
  DynamicSubAgentDefaults,
  DynamicSubAgentModelOption,
  DynamicSubAgentPolicy,
  DynamicSubAgentsConfig,
  GeneratedSubagentConfig,
  GeneratedSubagentDefinition,
  ResolvedModel,
} from "./types.js"

const COLOR_OPTIONS = ["primary", "secondary", "accent", "success", "warning", "error", "info"] as const
const CONFIG_ENV_NAME = "OPENCODE_DYNAMIC_SUBAGENTS_CONFIG"
const DEFAULT_MAX_SUBAGENT_NAME_LENGTH = 64
const GENERATED_NAME_PREFIX = "dsa"

const permissionSchema = z.record(z.string(), z.unknown()).optional()
const allowedModelSchema = z.union([
  z.string().min(1),
  z
    .object({
      id: z.string().min(1),
      name: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
    })
    .strict(),
])

const defaultsSchema = z
  .object({
    model: z.string().min(1).optional(),
    variant: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
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

const limitsSchema = z
  .object({
    maxSubagentNameLength: z.number().int().positive().optional(),
  })
  .strict()

const dynamicSubAgentsConfigSchema = z
  .object({
    $schema: z.string().min(1).optional(),
    version: z.literal(1).default(1),
    defaults: defaultsSchema.optional(),
    limits: limitsSchema.optional(),
  })
  .strict()

type OpenCodeAgentConfig = {
  mode?: "primary" | "subagent" | "all"
  description?: string
  hidden?: boolean
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
    hidden: config.defaults?.hidden ?? false,
    options: config.defaults?.options ?? {},
    allowedModels: resolveAllowedModels(config.defaults),
    allowedVariants: config.defaults?.allowedVariants ?? [],
    maxSubagentNameLength: config.limits?.maxSubagentNameLength ?? DEFAULT_MAX_SUBAGENT_NAME_LENGTH,
    ...(config.defaults?.model ? { model: config.defaults.model } : {}),
    ...(config.defaults?.variant ? { variant: config.defaults.variant } : {}),
    ...(config.defaults?.prompt ? { prompt: config.defaults.prompt } : {}),
    ...(config.defaults?.temperature !== undefined ? { temperature: config.defaults.temperature } : {}),
    ...(config.defaults?.top_p !== undefined ? { top_p: config.defaults.top_p } : {}),
    ...(config.defaults?.color ? { color: config.defaults.color } : {}),
    ...(config.defaults?.steps !== undefined ? { steps: config.defaults.steps } : {}),
    ...(config.defaults?.permission !== undefined ? { permission: config.defaults.permission } : {}),
  }
}

export function collectConfiguredSubagents(config: OpenCodeConfigShape): ConfiguredSubagentSummary[] {
  return Object.entries(config.agent ?? {})
    .map(([name, agent]) => toConfiguredSubagent(name, agent))
    .filter((agent): agent is ConfiguredSubagentSummary => Boolean(agent))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function buildGeneratedSubagents(
  policy: DynamicSubAgentPolicy,
  existingNames: readonly string[],
): GeneratedSubagentDefinition[] {
  const variants = policy.allowedVariants.length > 0 ? policy.allowedVariants : [policy.variant]
  const taken = new Set(existingNames)
  const generated = new Map<string, GeneratedSubagentDefinition>()

  for (const model of policy.allowedModels) {
    const baseName = normalizeAgentNameSegment(model.name ?? model.id)
    if (!baseName) {
      throw new Error(`Could not derive an agent name from model "${model.id}".`)
    }

    for (const variant of variants) {
      const name = buildGeneratedName(baseName, variant)

      if (name.length > policy.maxSubagentNameLength) {
        throw new Error(
          `Generated subagent name "${name}" exceeds the configured limit of ${String(policy.maxSubagentNameLength)} characters.`,
        )
      }

      if (taken.has(name)) continue
      if (generated.has(name)) {
        throw new Error(`Generated subagent name "${name}" is duplicated. Adjust model names in dynamicSubAgents.json.`)
      }

      generated.set(name, {
        name,
        config: buildGeneratedSubagentConfig(policy, model, variant),
      })
    }
  }

  return [...generated.values()].sort((left, right) => left.name.localeCompare(right.name))
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

function buildGeneratedName(baseName: string, variant: string | undefined): string {
  const prefixedBase = `${GENERATED_NAME_PREFIX}-${baseName}`
  if (!variant) return prefixedBase
  return `${prefixedBase}-${normalizeAgentNameSegment(variant)}`
}

function buildGeneratedSubagentConfig(
  policy: DynamicSubAgentPolicy,
  model: DynamicSubAgentModelOption,
  variant: string | undefined,
): GeneratedSubagentConfig {
  const selection = variant ? `${model.id} (${variant})` : model.id
  const description = model.description
    ? `${model.description} Pinned to ${selection}.`
    : `Generated subagent pinned to ${selection}.`

  return {
    mode: "subagent",
    model: model.id,
    description,
    hidden: policy.hidden,
    ...(variant ? { variant } : {}),
    ...(policy.prompt ? { prompt: policy.prompt } : {}),
    ...(policy.temperature !== undefined ? { temperature: policy.temperature } : {}),
    ...(policy.top_p !== undefined ? { top_p: policy.top_p } : {}),
    ...(policy.color ? { color: policy.color } : {}),
    ...(policy.steps !== undefined ? { steps: policy.steps } : {}),
    ...(policy.permission !== undefined ? { permission: policy.permission } : {}),
    ...(Object.keys(policy.options).length > 0 ? { options: policy.options } : {}),
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function normalizeAgentNameSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
}

function resolveAllowedModels(defaults: DynamicSubAgentDefaults | undefined): readonly DynamicSubAgentModelOption[] {
  const models = normalizeAllowedModels(defaults?.allowedModels)
  if (models.length > 0) return models
  if (!defaults?.model) return []
  return [{ id: defaults.model }]
}

function normalizeAllowedModels(allowedModels: DynamicSubAgentDefaults["allowedModels"] = []): DynamicSubAgentModelOption[] {
  return allowedModels.map((entry) => (typeof entry === "string" ? { id: entry } : entry))
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
