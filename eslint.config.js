import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  
{
  ignores: [
    "dist",
    "backend/dist",
    ".output",
    ".vinxi",
    "storefront/coverage",
    "tmp",
    "patch-uc.mjs",
    "probe-api.js",
    "probe-dev.js",
    "probe-versions.js",
    "probe-versions.mjs",
    "scripts/env-presence-check.mjs",
    "scripts/release-check.mjs",
    "scripts/tmp-cert-check.mjs",
    "storefront/_install_pw.cjs",
    "storefront/browser-runner.mjs",
    "storefront/hydration-check.mjs",
    "storefront/live-browser-payment-test.mjs",
    "storefront/probe-products.mjs",
    "storefront/served-productcard.js",
    "storefront/served-slug-route.js",
    "served-productcard.ts",
    "live-lab",
  ],
},
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      prettier: eslintPluginPrettier.plugins.prettier,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
);
