export type ModelRef = {
  providerID: string
  modelID: string
}

export type AgentMode = "subagent" | "primary" | "all"

export type AgentPermissionValue = "allow" | "deny" | "ask" | AgentPermission

export type AgentPermission = {
  [key: string]: AgentPermissionValue | undefined
}

export type DynamicSubAgentTemplate = {
  description: string
  prompt: string
  model?: string
  variant?: string
  mode?: AgentMode
  hidden?: boolean
  temperature?: number
  top_p?: number
  steps?: number
  color?: string
  permission?: AgentPermission
  options?: Record<string, unknown>
  allowedModels?: string[]
  allowedVariants?: string[]
}

export type DynamicSubAgentConfig = {
  defaults?: {
    model?: string
    variant?: string
    mode?: AgentMode
    hidden?: boolean
    temperature?: number
    top_p?: number
    steps?: number
    color?: string
    permission?: AgentPermission
  }
  allowedModels?: string[]
  allowedVariants?: string[]
  templates: Record<string, DynamicSubAgentTemplate>
}

export type NormalizedDynamicSubAgent = {
  name: string
  description: string
  prompt: string
  model?: string
  variant?: string
  mode: AgentMode
  hidden?: boolean
  temperature?: number
  top_p?: number
  steps?: number
  color?: string
  permission: AgentPermission
  options: Record<string, unknown>
  allowedModels: string[]
  allowedVariants: string[]
}

export type SpawnSubAgentInput = {
  template: string
  prompt?: string
  title?: string
  model?: string
  variant?: string
}
