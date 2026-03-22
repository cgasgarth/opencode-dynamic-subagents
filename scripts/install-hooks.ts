import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const hooksDir = path.join(repoRoot, ".githooks")
const gitDir = path.join(repoRoot, ".git")

if (!existsSync(gitDir) || !existsSync(hooksDir)) {
  process.exit(0)
}

execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: repoRoot,
  stdio: "inherit",
})
