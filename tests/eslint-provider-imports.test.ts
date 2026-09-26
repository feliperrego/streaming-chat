import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportMessages(code: string, file: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(process.cwd(), file),
  });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

async function restrictedSyntaxMessages(code: string, file: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(process.cwd(), file),
  });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("provider imports", () => {
  it(
    "are rejected outside lib/ai/model.ts",
    async () => {
      const messages = await restrictedImportMessages(
        'import { anthropic } from "@ai-sdk/anthropic";\nexport const m = anthropic;\n',
        "app/provider-check.ts",
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain("Import provider SDKs only in lib/ai/model.ts.");
    },
    30_000,
  );

  it(
    "are allowed in lib/ai/model.ts",
    async () => {
      const messages = await restrictedImportMessages(
        'import { anthropic } from "@ai-sdk/anthropic";\nexport const m = anthropic;\n',
        "lib/ai/model.ts",
      );
      expect(messages).toHaveLength(0);
    },
    30_000,
  );

  it(
    "allow @ai-sdk/react, @ai-sdk/provider and @ai-sdk/provider-utils everywhere",
    async () => {
      const messages = await restrictedImportMessages(
        [
          'import { useChat } from "@ai-sdk/react";',
          'import type { LanguageModelV4 } from "@ai-sdk/provider";',
          'import { generateId } from "@ai-sdk/provider-utils";',
          "export const x = [useChat, generateId] as const;",
          "export type Y = LanguageModelV4;",
          "",
        ].join("\n"),
        "components/chat.tsx",
      );
      expect(messages).toHaveLength(0);
    },
    30_000,
  );

  it(
    "reject a provider subpath import outside lib/ai/model.ts",
    async () => {
      const messages = await restrictedImportMessages(
        'import { x } from "@ai-sdk/anthropic/internal";\nexport { x };\n',
        "app/x.ts",
      );
      expect(messages).toHaveLength(1);
    },
    30_000,
  );

  it(
    "allow a @ai-sdk/react subpath import",
    async () => {
      const messages = await restrictedImportMessages(
        'import { x } from "@ai-sdk/react/internal";\nexport { x };\n',
        "app/y.ts",
      );
      expect(messages).toHaveLength(0);
    },
    30_000,
  );
});

describe("dynamic provider imports", () => {
  it(
    "are rejected outside lib/ai/model.ts",
    async () => {
      const messages = await restrictedSyntaxMessages(
        'await import("@ai-sdk/openai");\n',
        "app/x.ts",
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain("Import provider SDKs only in lib/ai/model.ts.");
    },
    30_000,
  );

  it(
    "are allowed in lib/ai/model.ts",
    async () => {
      const messages = await restrictedSyntaxMessages(
        'await import("@ai-sdk/openai");\n',
        "lib/ai/model.ts",
      );
      expect(messages).toHaveLength(0);
    },
    30_000,
  );

  it(
    "allow @ai-sdk/react",
    async () => {
      const messages = await restrictedSyntaxMessages(
        'await import("@ai-sdk/react");\n',
        "app/x.ts",
      );
      expect(messages).toHaveLength(0);
    },
    30_000,
  );
});
