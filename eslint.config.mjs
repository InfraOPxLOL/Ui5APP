// Flat ESLint configuration for the Integration Portal monorepo.
// Lints the frontend (app/webapp) and backend (srv/src, srv/test) TypeScript sources with
// typescript-eslint's recommended rules, deferring formatting entirely to Prettier.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/gen/**",
      "**/mta_archives/**",
      // UI5 QUnit/OPA test assets are plain JS loaded by the UI5 test runner, not linted here.
      "app/webapp/test/**",
      "**/*.gen.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["app/webapp/**/*.ts", "srv/src/**/*.ts", "srv/test/**/*.ts"],
    rules: {
      // The TypeScript compiler already reports undefined identifiers; the core rule only produces
      // false positives for ambient/global types in a TS codebase.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }],
    },
  },
  prettier,
);
