import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Provider SDKs are imported only in lib/ai/model.ts (spec §5.1, §7.1).
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@ai-sdk/*",
                "!@ai-sdk/react",
                "!@ai-sdk/provider",
                "!@ai-sdk/provider-utils",
              ],
              message: "Import provider SDKs only in lib/ai/model.ts.",
            },
          ],
        },
      ],
      // Same rule, for dynamic import(): no-restricted-imports does not see
      // ImportExpression nodes, so it can't be enforced there.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value=/^@ai-sdk\\/(?!react(\\/|$)|provider(\\/|$)|provider-utils(\\/|$))/]",
          message: "Import provider SDKs only in lib/ai/model.ts.",
        },
      ],
    },
  },
  {
    files: ["lib/ai/model.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test output:
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
