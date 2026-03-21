export type PermissionAction = "allow" | "ask" | "deny"

export type AgentPermission = {
  [key: string]: AgentPermission | PermissionAction
}

export type DynamicSubAgentDefaults = {
  titlePrefix?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  color?: string
  hidden?: boolean
  steps?: number
  permission?: AgentPermission
  options?: Record<string, unknown>
  allowedModels?: readonly string[]
  allowedVariants?: readonly string[]
}

export type DynamicSubAgentInput = {
  description: string
  prompt?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  color?: string
  hidden?: boolean
  steps?: number
  permission?: AgentPermission
  options?: Record<string, unknown>
  allowedModels?: readonly string[]
  allowedVariants?: readonly string[]
}

export type DynamicSubAgentsConfig = {
  version: 1
  defaults?: DynamicSubAgentDefaults
  agents: Record<string, DynamicSubAgentInput>
}

export type DynamicSubAgent = {
  name: string
  description: string
  prompt?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  color?: string
  hidden?: boolean
  steps?: number
  permission?: AgentPermission
  options: Record<string, unknown>
  allowedModels: readonly string[]
  allowedVariants: readonly string[]
}

export type ResolvedModel = {
  providerID: string
  modelID: string
}
