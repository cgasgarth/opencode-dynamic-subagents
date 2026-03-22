---
name: opencode-live-smoke
description: Run live OpenCode smoke tests for opencode-dynamic-subagents against a real project by temporarily switching the local OpenCode plugin source to either the local dist build or the published npm package, executing a subagent-read prompt, and restoring config afterward.
---

# OpenCode Live Smoke

Use this skill when you need to verify the plugin in a real OpenCode run, not just unit tests.

## When To Use

- Before publishing a plugin change
- After publishing a new npm version
- When debugging real subagent behavior in OpenCode
- When checking whether a project path is treated as internal or external

## Workflow

1. Choose the target project root and a file inside that project.
2. Choose `local` before publish or `npm` after publish.
3. Run the helper script:

```bash
skills/opencode-live-smoke/scripts/run-live-smoke.sh \
  --project /absolute/project/root \
  --file /absolute/project/root/path/to/file.tsx \
  --source local
```

For npm validation:

```bash
skills/opencode-live-smoke/scripts/run-live-smoke.sh \
  --project /absolute/project/root \
  --file /absolute/project/root/path/to/file.tsx \
  --source npm
```

## What The Script Does

- Validates the project root and target file
- Uses the local built entrypoint for `local`, or `opencode-dynamic-subagents@<package.json version>` for `npm`
- Temporarily rewrites `~/.config/opencode/opencode.jsonc`
- Runs:

```bash
opencode run --print-logs --agent build "Use a subagent to read <file> and return only the first non-empty line."
```

- Restores the original OpenCode config on exit

## Expected Result

- OpenCode loads the plugin successfully
- A subagent task is launched
- The response returns the first non-empty line from the target file

## Notes

- Prefer a file inside the exact project root passed to `--project`
- `local` mode runs `npm run build` in this repo before testing
- If the run hangs or prompts unexpectedly, inspect the emitted logs before retrying
