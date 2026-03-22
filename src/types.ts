export type PermissionAction = "allow" | "ask" | "deny"

export type AgentPermission = {
  [key: string]: AgentPermission | PermissionAction
}

export type DynamicSubAgentModelOption = {
  id: string
  description?: string
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
  allowedModels?: readonly (string | DynamicSubAgentModelOption)[]
  allowedVariants?: readonly string[]
}

export type DynamicSubAgentRuntime = {
  agentName?: string
  description?: string
  prompt?: string
}

export type DynamicSubAgentLimits = {
  maxSubagentNameLength?: number
  maxTaskDescriptionLength?: number
  maxPromptLength?: number
}

export type DynamicSubAgentsConfig = {
  $schema?: string
  version: 1
  defaults?: DynamicSubAgentDefaults
  runtime?: DynamicSubAgentRuntime
  limits?: DynamicSubAgentLimits
}

export type DynamicSubAgentPolicy = {
  titlePrefix?: string
  model?: string
  variant?: string
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
  maxTaskDescriptionLength?: number
  maxPromptLength?: number
}

export type DynamicTaskAgentConfig = {
  prompt?: string
  temperature?: number
  top_p?: number
  color?: string
  steps?: number
  permission?: AgentPermission
  options?: Record<string, unknown>
}

export type ConfiguredSubagentSummary = {
  name: string
  description?: string
  hidden: boolean
}

export type DynamicSubagentRequest = {
  subagentType: string
  subagentDescription: string
  taskDescription: string
  prompt: string
  workingDirectory?: string
  projectRoot?: string
}

export type ResolvedModel = {
  providerID: string
  modelID: string
}
