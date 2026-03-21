# opencode-dynamic-subagents

OpenCode plugin that injects user-defined subagents from `~/.config/opencode/dynamicSubAgents.json` and extends the `task` tool with runtime `model` and `variant` selection.

## Install

Add the plugin to your OpenCode config:

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
    "allowedModels": ["openai/gpt-5.1-codex"],
    "allowedVariants": ["low", "high"]
  },
  "agents": {
    "review": {
      "description": "Code review subagent",
      "prompt": "Review the supplied changes.",
      "model": "openai/gpt-5.1-codex",
      "variant": "high"
    }
  }
}
```

## Notes

- Dynamic agents are injected as normal OpenCode subagents.
- The plugin overrides `task` so model and variant can be selected per subagent call.
- Validation is driven by `dynamicSubAgents.json`.

## Dev

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```
