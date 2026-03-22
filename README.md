# opencode-dynamic-subagents

OpenCode plugin that adds policy-controlled dynamic subagents. It injects one hidden backing subagent, then lets the orchestration agent choose a runtime subagent name, model, and thinking variant per task.

Recommended models:
- `openai/gpt-5.4`
- `openai/gpt-5.4-mini`

## Install

Add the plugin to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-dynamic-subagents"]
}
```

Create `~/.config/opencode/dynamicSubAgents.json`:

```json
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "model": "openai/gpt-5.4-mini",
    "allowedModels": ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
    "allowedVariants": ["low", "medium", "high", "xhigh"]
  },
  "runtime": {
    "agentName": "dynamic-subagent-runtime"
  },
  "limits": {
    "maxSubagentNameLength": 64
  }
}
```

## Usage

For an existing named subagent, use `task` normally.

For an ad hoc dynamic subagent, provide:
- `subagent_type`: the runtime name
- `subagent_description`: the specialization
- `model` and `variant`: optional, validated against policy

Example intent:

```text
Create a new subagent named perf-auditor, specialize it in runtime bottlenecks, and run it with openai/gpt-5.4-mini at high reasoning.
```

## Dev

```bash
npm install
npm run check
npm run build
```
