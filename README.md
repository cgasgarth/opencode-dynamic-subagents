# Dynamic Subagents Plugin

[![npm version](https://img.shields.io/npm/v/opencode-dynamic-subagents.svg)](https://www.npmjs.com/package/opencode-dynamic-subagents)

Adds generated model-pinned subagents to OpenCode.

Instead of trying to create truly ad hoc subagents at runtime, this plugin reads `dynamicSubAgents.json` and generates normal OpenCode subagents for each allowed model and thinking-level combination.

## What You Get

- Native OpenCode subagents with no `task` override
- One generated agent per allowed model and variant
- Model descriptions kept in config and surfaced in agent descriptions
- Predictable native task/session behavior

## Install

```jsonc
{
  "plugin": ["opencode-dynamic-subagents@latest"]
}
```

Restart OpenCode after installing or updating the plugin.

## Quick Start

Create `~/.config/opencode/dynamicSubAgents.json`:

```jsonc
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "allowedModels": [
      {
        "id": "openai/gpt-5.4",
        "name": "gpt54",
        "description": "Best default choice for broad reasoning and higher-quality subagent work."
      },
      {
        "id": "openai/gpt-5.3-codex-spark",
        "name": "spark",
        "description": "Faster, cheaper code-focused option for small code implementations or quickly searching for things."
      }
    ],
    "allowedVariants": ["low", "high"]
  }
}
```

This generates native subagents like:

- `@dsa-gpt54-low`
- `@dsa-gpt54-high`
- `@dsa-spark-low`
- `@dsa-spark-high`

## How It Works

The plugin only runs at config time.

1. It loads `dynamicSubAgents.json`.
2. It expands the allowed model list and allowed variant list into concrete subagent definitions.
3. It injects those generated agents into `config.agent`.
4. OpenCode then treats them like normal named subagents.

If a generated name collides with an existing agent, the existing agent wins and the generated one is skipped.

## Configuration

The plugin reads:

- `~/.config/opencode/dynamicSubAgents.json`
- `$OPENCODE_DYNAMIC_SUBAGENTS_CONFIG` for testing overrides

Supported config:

```jsonc
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "model": "openai/gpt-5.4",
    "variant": "high",
    "prompt": "Optional shared prompt for generated subagents.",
    "temperature": 0.2,
    "top_p": 0.9,
    "hidden": false,
    "steps": 20,
    "permission": {},
    "options": {},
    "allowedModels": [
      {
        "id": "openai/gpt-5.4",
        "name": "gpt54",
        "description": "Best default choice for broad reasoning and higher-quality subagent work."
      },
      {
        "id": "openai/gpt-5.3-codex-spark",
        "name": "spark",
        "description": "Faster, cheaper code-focused option for small code implementations or quickly searching for things."
      }
    ],
    "allowedVariants": ["low", "medium", "high", "xhigh"]
  },
  "limits": {
    "maxSubagentNameLength": 64
  }
}
```

Notes:

- `allowedModels` is the source of truth for which model families get generated.
- `name` is optional but recommended when you want short agent names like `dsa-spark-high`.
- `description` is optional and becomes part of the generated agent description.
- If `allowedModels` is omitted, the plugin falls back to `defaults.model`.
- If `allowedVariants` is omitted, the plugin generates one agent per model and uses `defaults.variant` if provided.

## Usage

Once generated, use the agents like any other OpenCode subagent:

```text
Use @dsa-spark-high to scan a small part of the codebase.
Use @dsa-gpt54-high to review the final shortlist.
```

This approach keeps model choice explicit and stable without depending on dynamic runtime task rewriting.

## Dev

```bash
npm install
npm run check
npm run build
```
