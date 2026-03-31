import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** Next.js still ships eslintrc-style presets; FlatCompat maps them to ESLint 9 flat config. */
const hiveAppConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "scripts/check-api-routes-otel.cjs",
      "scripts/validate-planetary-docs.cjs",
      /** Own ESLint + CI in `marketplace-node` job */
      "Hive market-place/**",
    ],
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default hiveAppConfig;
