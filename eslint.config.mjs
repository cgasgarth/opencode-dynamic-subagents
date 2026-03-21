import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

const fileLimitRule = ["error", { max: 500, skipBlankLines: true, skipComments: true }]

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "src/plugin.ts",
      "src/runtime.ts",
      "src/config-schema.ts",
      "src/index.ts",
      "test/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "max-lines": fileLimitRule,
      "no-console": "error"
    },
  },
)
