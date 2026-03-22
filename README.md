# Dynamic Subagents Plugin

[![npm version](https://img.shields.io/npm/v/opencode-dynamic-subagents.svg)](https://www.npmjs.com/package/opencode-dynamic-subagents)

Adds policy-controlled dynamic subagents to OpenCode.

Instead of forcing you to predefine every subagent up front, this plugin injects one hidden backing subagent and extends the `task` tool so the orchestrating agent can choose a runtime subagent name, specialization, model, and thinking variant for each task.

## What You Get

- Ad hoc subagents without predeclaring each one in OpenCode config
- Per-task model and variant selection, validated against your allowlist
- Hidden runtime agent injection that stays compatible with OpenCode's named-agent model
- Model descriptions surfaced back to the orchestrator to improve model choice

## Install

Add the package to your existing OpenCode config:

```jsonc
// opencode.json
{
  "plugin": ["opencode-dynamic-subagents@latest"]
}
```

If you already have other plugins configured, append this package to the same `plugin` array.

Restart OpenCode after installing or updating the plugin.

## Quick Start

Create `~/.config/opencode/dynamicSubAgents.json`:

```jsonc
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "model": "openai/gpt-5.4",
    "allowedModels": [
      {
        "id": "openai/gpt-5.4",
        "description": "Best default choice for broad reasoning and higher quality subagent work."
      },
      {
        "id": "openai/gpt-5.3-codex-spark",
        "description": "Faster, lower-cost code-focused option for small code implementations or quickly searching for things."
      }
    ],
    "allowedVariants": ["low", "medium", "high", "xhigh"]
  }
}
```

Restart OpenCode, then ask for delegation naturally:

```text
Use a subagent to inspect the request path and summarize likely bottlenecks.
```

When the orchestrator chooses the dynamic path, it provides:

- `subagent_type`
- `subagent_description`
- optional `model`
- optional `variant`

## How It Works

OpenCode’s built-in task system requires a real named subagent. It does not support anonymous inline subagent definitions. This plugin works within that constraint by:

1. Injecting one hidden runtime subagent into OpenCode config.
2. Overriding the `task` tool.
3. Treating `subagent_description` as the signal that the call should run as a dynamic subagent.
4. Validating `model` and `variant` against `dynamicSubAgents.json`.
5. Wrapping the task prompt with the runtime specialization before sending it to the hidden backing agent.

Existing named subagents still work normally. The dynamic path is only used when the model provides `subagent_description`.

## Configuration

The plugin reads:

- `~/.config/opencode/dynamicSubAgents.json`
- `$OPENCODE_DYNAMIC_SUBAGENTS_CONFIG` if you want to override the path for testing

Defaults are applied automatically. Add config when you want to restrict models, variants, runtime naming, or prompt size.

```jsonc
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "model": "openai/gpt-5.4",
    "allowedModels": [
      {
        "id": "openai/gpt-5.4",
        "description": "Best default choice for broad reasoning and higher quality subagent work."
      },
      {
        "id": "openai/gpt-5.3-codex-spark",
        "description": "Faster, lower-cost code-focused option for small code implementations or quickly searching for things."
      }
    ],
    "allowedVariants": ["low", "medium", "high", "xhigh"]
  },
  "runtime": {
    "agentName": "dynamic-subagent-runtime",
    "description": "Internal runtime for dynamic subagent execution."
  },
  "limits": {
    "maxSubagentNameLength": 64,
    "maxTaskDescriptionLength": 120,
    "maxPromptLength": 8000
  }
}
```

## Usage

Existing named subagents still use the normal `task` flow.

Dynamic subagents are used when the orchestrator adds `subagent_description`, for example:

```text
Create a dynamic subagent named perf-auditor. Specialize it in runtime bottlenecks. Run it with openai/gpt-5.4 at high reasoning and have it inspect the request path implementation.
```

If the selected model or variant is not allowed, the task call fails immediately with a validation error.

Model descriptions from config are surfaced back into task guidance so the orchestrator has better context when choosing among allowed models.

## Notes

- Tested OpenAI model strings: `openai/gpt-5.4`, `openai/gpt-5.3-codex-spark`
- OpenCode still requires a concrete agent name for task execution, so this plugin uses a hidden runtime subagent internally
- `$schema` is supported in `dynamicSubAgents.json`
- The plugin has been tested locally with the installed `opencode` CLI using vague delegation prompts and explicit model selection

## Dev

```bash
npm install
npm run check
npm run build
```
