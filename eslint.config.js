import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  /*
   * 只忽略 "dist" 是不够的：实测 eslint 会连带扫描 29 个**已被 .gitignore
   * 排除**的文件 —— .workbuddy/（AI 工作脚本）、.edgeone/（部署产物）、
   * 构建缓存 assets/ 等。它们既不进版本库、也不该参与代码质量检查：
   *   · 白耗 lint 时间（151 个文件里约五分之一是它们）；
   *   · 别人本地的 .workbuddy/ 内容不受控，可能凭空刷出 lint 报错，
   *     让「lint 通过」这件事变得不可复现。
   * 这里与 .gitignore 对齐，把这些目录显式排除。
   */
  {
    ignores: [
      "dist",
      "dist-ssr",
      "node_modules",
      ".workbuddy",
      ".edgeone",
      ".ohmyagent",
      ".tef_dist",
      ".codex",
      ".dev",
      ".vscode",
      "release",
      "shots",
      // 编译产物：由 tsc 生成，lint 源码即可（edge-functions-src）
      "edge-functions",
    ],
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
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
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  }
);
