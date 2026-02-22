import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from 'eslint/config';

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["dist/", "node_modules/", "api-docs/", "dashboard/"],
  }
);
