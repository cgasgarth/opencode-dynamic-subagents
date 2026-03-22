# Dynamic Subagents Plugin

[![npm version](https://img.shields.io/npm/v/opencode-dynamic-subagents.svg)](https://www.npmjs.com/package/opencode-dynamic-subagents)

Adds policy-controlled dynamic subagents to OpenCode.

Instead of forcing you to predefine every subagent up front, this plugin injects one hidden backing subagent and extends the `task` tool so the orchestrating agent can choose a runtime subagent name, specialization, model, and thinking variant for each task.

## Installation

Add it to the same OpenCode config file you already use for other plugins:

```jsonc
// opencode.json
{
  "plugin": ["opencode-dynamic-subagents@latest"]
}
```

If you already have other plugins configured, append this package to that existing `plugin` array.

Restart OpenCode after installing the plugin.

## How It Works

OpenCode’s built-in task system requires a real named subagent. It does not support anonymous inline subagent definitions. This plugin works within that constraint by:

1. Injecting one hidden runtime subagent into OpenCode config.
2. Overriding the `task` tool.
3. Treating `subagent_description` as the signal that the call should run as a dynamic subagent.
4. Validating `model` and `variant` against `dynamicSubAgents.json`.
5. Wrapping the task prompt with the runtime specialization before sending it to the hidden backing agent.

Existing named subagents still work normally. The dynamic path is only used when the model provides `subagent_description`.

## Configuration

This plugin reads:

- `~/.config/opencode/dynamicSubAgents.json`
- or `$OPENCODE_DYNAMIC_SUBAGENTS_CONFIG` if you want to override the path for testing

Restart OpenCode after changing the config.

Important

Defaults are applied automatically. Use this file when you want to restrict models, variants, runtime naming, or prompt size.

Default-style configuration:

```jsonc
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    // Default model used for dynamic subagents when no explicit model is passed
    "model": "openai/gpt-5.4",

    // Restrict runtime model selection
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

    // Restrict reasoning / provider variant selection
    "allowedVariants": ["low", "medium", "high", "xhigh"]
  },

  "runtime": {
    // Hidden backing subagent name injected into OpenCode
    "agentName": "dynamic-subagent-runtime",

    // Optional description for the hidden runtime subagent
    "description": "Internal runtime for dynamic subagent execution."
  },

  "limits": {
    // Guardrails for ad hoc subagent creation
    "maxSubagentNameLength": 64,
    "maxTaskDescriptionLength": 120,
    "maxPromptLength": 8000
  }
}
```

## Usage

For an existing named subagent, use the `task` tool normally.

For a dynamic subagent, the orchestrating agent should provide:

- `subagent_type`
- `subagent_description`
- optional `model`
- optional `variant`

Example intent:

```text
Create a dynamic subagent named perf-auditor. Specialize it in runtime bottlenecks. Run it with openai/gpt-5.4 at high reasoning and have it inspect the request path implementation.
```

If the selected model or variant is not allowed, the task call fails immediately with a validation error.

Model descriptions are surfaced back into the task-system guidance so the orchestrating agent can use them when choosing between allowed models.

## Notes

- Tested OpenAI model strings: `openai/gpt-5.4`, `openai/gpt-5.3-codex-spark`
- OpenCode still requires a concrete agent name for task execution, so this plugin uses a hidden runtime subagent internally
- `$schema` is supported in `dynamicSubAgents.json`
- The plugin has been tested locally with the installed `opencode` CLI using both vague delegation prompts and explicit model selection

## Dev

```bash
npm install
npm run check
npm run build
```
