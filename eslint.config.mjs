import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import importx from 'eslint-plugin-import-x';
import pinia from 'eslint-plugin-pinia';
import vue from 'eslint-plugin-vue';
import { globalIgnores } from 'eslint/config';
import { readFileSync } from 'node:fs';
import globals from 'globals';
import ts from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

// ---------------------------------------------------------------------------
// 2026-11-14 批 3 第 2 件：把 no-undef / vue/no-undef-properties 对 .vue 打开。
//
// 为什么只对 .vue 开：tsc 不扫 .vue（三重静默未测区，交接单 §7.1），那里才是唯一缺口；
// 而在 .ts 上开 no-undef 会报 417 条**类型名误报**（WorldbookEntry / EjsTemplate / SillyTavern …
// 它们是 @types/function/*.d.ts 里声明的类型，no-undef 没有类型系统，不认识「类型位置」），
// 把真问题彻底淹没 —— 实测全局开 = 557 条（.vue 140 + .ts 417）。
// ---------------------------------------------------------------------------

/** auto-imports 的 302 个名字：**从 auto-imports.d.ts 机械派生**（纪律 19：不许手抄，抄了会漂）。 */
const 自动导入 = Object.fromEntries(
  [
    ...readFileSync(new URL('./auto-imports.d.ts', import.meta.url), 'utf8').matchAll(
      /^\s*const\s+([\w$\u4e00-\u9fa5]+)\s*:/gm,
    ),
  ].map(m => [m[1], 'readonly']),
);

/** 宿主注入的全局：webpack externals（webpack.config.ts:4 那 8 个）+ 酒馆助手 API。
 *  与全库扫描器 tmp/verify-kimi-327.cjs 的 `宿主` **同口径**（当前两边都是 15 个名字）。
 *  唯一的策略差异是 `ChildNode`：本配置**豁免**它（闸门视角，类型名不该当悬空报），
 *  扫描器**不豁免**（计数视角，要能数出那 1 条）。见 `:109` 与扫描器 `宿主` 上方说明。
 *
 *  ⚠️ 以下 3 个名字当前全库 0 引用（预留/历史登记，不是活跃 API）：
 *    `getTavernHelper` / `messageFormatting` / `child_process`
 *    zcode #460：若未来 90 天仍 0 引用，届时删除 —— 防白名单只增不减，变成第二个「遗留 `_`」。 */
const 宿主全局 = {
  toastr: 'readonly',
  // ⚠️ 这里**故意没有 `_`**（扫描器那份清单里也**没有**它 —— 两边同口径，2026-11-14 已统一）。
  //    原因：本批已经给 10 个文件全部补了 `import _ from 'lodash';`。
  //    若把 `_` 也塞进白名单，no-undef 对 `_` 就永久失效 —— 删掉 import 也没人喊，
  //    第 1 件事等于白做（实测：加白名单时删 import → 0 报错；拿掉后 → `'_' is not defined`）。
  //    拿掉它**不会**误报：全库重扫「用了 `_` 但没 import」的文件数 = 0。
  $: 'readonly',
  jQuery: 'readonly',
  tavern_events: 'readonly',
  eventOn: 'readonly',
  stopGenerationById: 'readonly',
  getVariables: 'readonly',
  replaceVariables: 'readonly',
  updateVariablesWith: 'readonly',
  getTavernDocument: 'readonly',
  getTavernHelper: 'readonly',
  persona: 'readonly',
  chat: 'readonly',
  messageFormatting: 'readonly',
  child_process: 'readonly',
};

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigFile} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  importx.flatConfigs.recommended,
  importx.flatConfigs.typescript,
  ...vue.configs['flat/recommended'],
  pinia.configs['recommended-flat'],
  {
    files: ['src/**/*.{html,vue,js,ts}'],
    plugins: {
      'better-tailwindcss': eslintPluginBetterTailwindcss,
    },
    rules: {
      ...eslintPluginBetterTailwindcss.configs['recommended-warn'].rules,
      ...eslintPluginBetterTailwindcss.configs['recommended-error'].rules,
      'better-tailwindcss/enforce-consistent-line-wrapping': ['off', { preferSingleLine: true, printWidth: 120 }],
      'better-tailwindcss/no-unregistered-classes': ['off', { ignore: ['fa-*'] }],
      // 本仓库**不使用** Tailwind 工具类 —— tailwind.css:1 明写「仅激活 tailwindcss 的语法高亮, 禁止实际使用这个文件」。
      // 界面类名全是自定义的(bf-*/yh-*/ep-*/sf-* …), 样式写在各组件自己的 <style scoped> 里,
      // 而这条规则按"类名必须是 tailwindcss 里注册过的"来判, 于是整片报成未知 ——
      // 实测 1640 条(占全仓库 lint 问题的 90%), 把同一轮里 74 条真错误彻底淹没(等于没有闸门)。
      // 将来若真的开始用 Tailwind 工具类, 再打开它, 并用 ignore(正则数组)排除自定义前缀。
      'better-tailwindcss/no-unknown-classes': 'off',
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'tailwind.css',
        tailwindConfig: 'tailwind.config.js',
      },
    },
  },
  {
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        // 必须显式指定: 不指定时解析器会自己去搜 tsconfig.json, 一旦仓库里出现第二份
        // (例如 .kilo/worktrees/ 下的项目副本), 它就报 "multiple candidate TSConfigRootDirs"
        // 并让**每个文件**都解析失败——541 条这种错会把真正的 74 条错误全遮住。
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...自动导入,
        ...宿主全局,
        // ChildNode 是**类型名**（设置界面.vue:551 的 `as ChildNode`），不是悬空引用 —— 纪律 23。
        // 白名单**只许加它一个**：加宽 or 关规则会把本批刚修完的 11 条真悬空护栏全拆掉。
        ChildNode: 'readonly',
      },
    },
    rules: {
      'handle-callback-err': 'off',
      'import-x/no-console': 'off',
      'import-x/no-cycle': 'error',
      'import-x/no-dynamic-require': 'warn',
      'import-x/no-nodejs-modules': 'warn',
      'import-x/no-unresolved': [2, { ignore: ['^http'] }],
      'no-dupe-class-members': 'off',
      'no-empty-function': 'off',
      'no-floating-decimal': 'error',
      'no-lonely-if': 'error',
      'no-multi-spaces': 'error',
      'no-redeclare': 'off',
      'no-shadow': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-var': 'error',
      'pinia/no-duplicate-store-ids': 'off',
      'pinia/require-setup-store-properties-export': 'off',
      'prefer-const': 'warn',
      'vue/multi-word-component-names': 'off',
      yoda: 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // 2026-11-14 批 3 第 2 件：这两条**只对 .vue** 生效。
  // 上面的通用块里 no-undef 仍是 'off'（.ts 上开它会 417 条类型名误报，见文件头注释）。
  // 目标值：全库 **1 条**（只剩 ChildNode），不是 0 条 —— 纪律 23：判据目标值不能设成不可能达到的数。
  {
    files: ['**/*.vue'],
    rules: {
      'no-undef': 'error',
      'vue/no-undef-properties': 'error',
    },
  },
  eslintConfigPrettier,
  // tests/ 是用例代码(大量 any 的临时假实现), 不属于发布产物; tsconfig 的 include 也没收录它,
  // 所以这里同样排除, 免得用例给 lint 添乱。
  // .kilo/ 是别的工具的工作区(含 node_modules 与一份项目副本), _backup/ 是历史备份快照:
  // 两者都不是本仓库的源码, 一起 lint 只会把真错误淹没, 还会拖慢每一次检查。
  // tavern_sync.mjs 是 2.1MB 的 webpack 打包产物(63026 行, 已提交进仓库), 里面 1086 条
  // no-var 之类的全是生成代码的噪声 —— 生成物一律不 lint, 与 dist/ 同理。
  // tmp/ 是实验区（数百个历史变异 .vue）: 它们是探针/变异副本, 不是仓库源码,
  // 一起 lint 只会把真错误淹没, 还会让 `npx eslint .` 慢到没法用（zcode #460 裁定）。
  globalIgnores(['dist/**', 'node_modules/**', 'tests/**', '.kilo/**', '_backup/**', 'tmp/**', 'tavern_sync.mjs', 'eslint.config.mjs', 'postcss.config.js', 'webpack.config.ts']),
];
