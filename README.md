# opencode-dynamic-subagents

OpenCode plugin that loads user-defined subagents from `~/.config/opencode/dynamicSubAgents.json` and overrides the `task` tool so subagent calls can choose a runtime `model` and `variant` when the target config allows them.

## What It Does

- Injects configured dynamic agents into OpenCode as normal subagents.
- Keeps the built-in `task` workflow, but extends it with optional `model` and `variant`.
- Validates model and variant overrides against your allowlists before launching the child session.

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-dynamic-subagents"]
}
```

Then create `~/.config/opencode/dynamicSubAgents.json`:

```json
{
  "$schema": "https://github.com/cgasgarth/opencode-dynamic-subagents/blob/main/dynamicSubAgents.schema.json",
  "version": 1,
  "defaults": {
    "titlePrefix": "Dynamic",
    "allowedModels": ["openai/gpt-5.1-codex", "anthropic/claude-sonnet-4-5-20250929"],
    "allowedVariants": ["low", "high"]
  },
  "agents": {
    "research": {
      "description": "Research and investigation subagent",
      "prompt": "You are a focused research subagent.",
      "model": "openai/gpt-5.1-codex",
      "variant": "high"
    },
    "review": {
      "description": "Code review subagent",
      "prompt": "You review code for correctness, regressions, and missing tests.",
      "allowedModels": ["openai/gpt-5.1-codex"],
      "allowedVariants": ["low", "high"]
    }
  }
}
```

`templates` is also accepted as an alias for `agents`.

## Current Boundary

This plugin controls runtime model selection by overriding OpenCode’s `task` tool, not by patching OpenCode core. It does not add a dedicated interactive picker UI in the OpenCode TUI.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## Repository Rules

- Keep TypeScript strict.
- Keep files under 500 lines.
- Do not commit `.env` or other secrets.
