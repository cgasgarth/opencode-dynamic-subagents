export type PermissionAction = "allow" | "ask" | "deny"

export type AgentPermission = {
  [key: string]: AgentPermission | PermissionAction
}

export type DynamicSubAgentModelOption = {
  id: string
  name?: string
  description?: string
}

export type DynamicSubAgentDefaults = {
  model?: string
  variant?: string
  prompt?: string
  temperature?: number
  top_p?: number
  color?: string
  hidden?: boolean
  steps?: number
  permission?: AgentPermission
  options?: Record<string, unknown>
  allowedModels?: readonly (string | DynamicSubAgentModelOption)[]
  allowedVariants?: readonly string[]
}

export type DynamicSubAgentLimits = {
  maxSubagentNameLength?: number
}

export type DynamicSubAgentsConfig = {
  $schema?: string
  version: 1
  defaults?: DynamicSubAgentDefaults
  limits?: DynamicSubAgentLimits
}

export type DynamicSubAgentPolicy = {
  model?: string
  variant?: string
  prompt?: string
  temperature?: number
  top_p?: number
  color?: string
  hidden: boolean
  steps?: number
  permission?: AgentPermission
  options: Record<string, unknown>
  allowedModels: readonly DynamicSubAgentModelOption[]
  allowedVariants: readonly string[]
  maxSubagentNameLength: number
}

export type GeneratedSubagentConfig = {
  mode: "subagent"
  model: string
  description: string
  hidden: boolean
  prompt?: string
  temperature?: number
  top_p?: number
  color?: string
  steps?: number
  permission?: AgentPermission
  options?: Record<string, unknown>
  variant?: string
}

export type ConfiguredSubagentSummary = {
  name: string
  description?: string
  hidden: boolean
}

export type GeneratedSubagentDefinition = {
  name: string
  config: GeneratedSubagentConfig
}

export type ResolvedModel = {
  providerID: string
  modelID: string
}
