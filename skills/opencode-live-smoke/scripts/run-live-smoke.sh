#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  run-live-smoke.sh --project /abs/project/root --file /abs/file/in/project --source local|npm
EOF
}

PROJECT=""
TARGET_FILE=""
SOURCE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    --file)
      TARGET_FILE="${2:-}"
      shift 2
      ;;
    --source)
      SOURCE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$PROJECT" ] || [ -z "$TARGET_FILE" ] || [ -z "$SOURCE" ]; then
  usage >&2
  exit 1
fi

case "$SOURCE" in
  local|npm) ;;
  *)
    echo "--source must be 'local' or 'npm'" >&2
    exit 1
    ;;
esac

if ! command -v opencode >/dev/null 2>&1; then
  echo "opencode is not installed or not on PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SKILL_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SKILL_DIR/../.." && pwd)"
CONFIG_PATH="$HOME/.config/opencode/opencode.jsonc"

if [ ! -d "$PROJECT" ]; then
  echo "Project root not found: $PROJECT" >&2
  exit 1
fi

if [ ! -f "$TARGET_FILE" ]; then
  echo "Target file not found: $TARGET_FILE" >&2
  exit 1
fi

case "$TARGET_FILE" in
  "$PROJECT"/*) ;;
  *)
    echo "Target file must live under the provided project root" >&2
    exit 1
    ;;
esac

if [ ! -f "$CONFIG_PATH" ]; then
  echo "OpenCode config not found: $CONFIG_PATH" >&2
  exit 1
fi

BACKUP_PATH="$(mktemp "${TMPDIR:-/tmp}/opencode.jsonc.XXXXXX")"
cp "$CONFIG_PATH" "$BACKUP_PATH"
cleanup() {
  cp "$BACKUP_PATH" "$CONFIG_PATH"
  rm -f "$BACKUP_PATH"
}
trap cleanup EXIT INT TERM

if [ "$SOURCE" = "local" ]; then
  (cd "$REPO_ROOT" && npm run build >/dev/null)
  PLUGIN_SPEC="$REPO_ROOT/dist/entrypoint.js"
else
  VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
  PLUGIN_SPEC="opencode-dynamic-subagents@$VERSION"
fi

node <<'EOF' "$CONFIG_PATH" "$PLUGIN_SPEC"
const fs = require("node:fs")

const [configPath, pluginSpec] = process.argv.slice(1)
const text = fs.readFileSync(configPath, "utf8")
const next = text.replace(
  /"(opencode-dynamic-subagents@[^"]+|\/Users\/cgas\/Documents\/Projects\/OpenCodePlugins\/opencode-dynamic-subagents\/dist\/entrypoint\.js)"/g,
  JSON.stringify(pluginSpec),
)

if (next === text) {
  throw new Error("Could not find an opencode-dynamic-subagents plugin entry in opencode.jsonc")
}

fs.writeFileSync(configPath, next)
EOF

PROMPT="Use a subagent to read $TARGET_FILE and return only the first non-empty line."
cd "$PROJECT"
opencode run --print-logs --agent build "$PROMPT"
