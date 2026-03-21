# opencode-dynamic-subagents

OpenCode plugin scaffold for dynamically defined subagents.

## Scope

- Package name: `opencode-dynamic-subagents`
- Config file: `~/.config/opencode/dynamicSubAgents.json`
- Goal: keep package, build, and lint infrastructure ready for the runtime plugin implementation

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

## Repository Rules

- Keep TypeScript strict.
- Keep files under 500 lines.
- Do not commit `.env` or other secrets.
