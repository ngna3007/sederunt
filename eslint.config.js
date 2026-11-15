import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "public/**",
      ".local/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["src/**/*.js", "scripts/**/*.{js,mjs}", "test/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "off",
      "require-yield": "warn",
    },
  },
  {
    files: [
      "src/hold.js",
      "src/admin-page.js",
      "src/console-page.js",
      "src/console-welcome.js",
      "src/console-sign-in.js",
      "src/landing.js",
      "src/room-page.js",
      "src/meeting/camera.js",
      "src/console/**/*.js",
      "test/**/*.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
