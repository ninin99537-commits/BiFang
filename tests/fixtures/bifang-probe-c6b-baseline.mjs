// 一次性探针（C6b 第一步）：**在改代码之前**跑旧实现，记下 `entries()` 的调用次数对照数。
//
// ── 为什么先跑这个 ──
//
//  需求方 #486 的判据 1 要求："先跑一遍旧代码记下对照数（应为 10），证明判据能区分新旧"。
//
//  如果先改代码再写判据，那个数字就只是"我以为应该是多少"——
//  而今天已经证明过：**估出来的数字就是下一个"通过数是写死的"**。
//
// ── 场景 ──
//
//  5 个 NPC + 2 本绑定世界书 → 路径二对**每个 NPC** 各遍历**每本书**一次
//  → 5 × 2 = **10 次** `entries()` 调用。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTest } from '../build.mjs';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-c6b.ts');
const 产物 = path.join(此处, '_probe-c6b.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { getPersonaTextForNpc, 建世界书索引 } from '../../src/彼方_NPC幕后生命状态系统/worldbook';",
  "",
  "let entriesCalls = 0;",
  "",
  "const 五个NPC = ['甲', '乙', '丙', '丁', '戊'];",
  "",
  "// 两本世界书，每本都有 5 条绿灯条目（keys 各含一个 NPC 名）",
  "function 造书(前缀: string) {",
  "  return 五个NPC.map((名, i) => ({",
  "    name: `${前缀}人设-${名}`,",
  "    comment: `${前缀}人设-${名}`,",
  "    content: `${名}是${前缀}里的角色。`,",
  "    enabled: true,",
  "    disable: false,",
  "    strategy: { type: 'selective', keys: [名] },",
  "  }));",
  "}",
  "",
  "const 两本 = { 主书: 造书('主'), 附书: 造书('附') };",
  "",
  "const host: any = {",
  "  vars: { get: () => ({}), update: () => {}, del: () => {}, insertOrAssign: () => {}, scriptId: () => 't' },",
  "  worldbook: {",
  "    groupMemberNames: () => [],",
  "    boundNames: () => ({ primary: '主书', additional: ['附书'] }),",
  "    boundNamesOf: () => ({ primary: null, additional: [] }),",
  "    chatName: () => null,",
  "    entries: async (书名: string) => {",
  "      entriesCalls++;",
  "      return (两本 as any)[书名] ?? [];",
  "    },",
  "  },",
  "  persona: { name: () => '', description: () => '', lorebook: () => null },",
  "  macros: { 展开: (s: string) => s },",
  "  ejs: { 评估: async () => '', compileTemplate: () => () => '', prepareContext: async () => null, getWorldInfoActivatedData: null },",
  "  acu: null,",
  "  toast: { warn: () => {}, success: () => {}, info: () => {} },",
  "};",
  "",
  "const 原info = console.info;",
  "const 原warn = console.warn;",
  "const 原err = console.error;",
  "console.info = () => {};",
  "console.warn = () => {};",
  "console.error = () => {};",
  "",
  "// 模拟「更新输入.ts 的人设循环」：**先建一次索引**，循环内复用",
  "const 索引 = await 建世界书索引(host);",
  "const 已发身份 = new Set<string>();",
  "const 各人设: string[] = [];",
  "for (const 名 of 五个NPC) {",
  "  const 文本 = await getPersonaTextForNpc(host, 名, '', [], '', 已发身份, 索引);",
  "  if (文本) 各人设.push(文本);",
  "}",
  "const 总文本 = 各人设.join('');",
  "",
  "console.info = 原info;",
  "console.warn = 原warn;",
  "console.error = 原err;",
  "",
  "console.log('=== C6b 对照数（旧实现）===');",
  "console.log('NPC 数: ' + 五个NPC.length);",
  "console.log('世界书数: 2');",
  "console.log('★ entries() 调用次数: ' + entriesCalls);",
  "console.log('  （预期 10 = 5 个 NPC × 2 本书）');",
  "console.log('');",
  "console.log('人设文本长度: ' + 总文本.length);",
  "console.log('人设里有甲? ' + 总文本.includes('甲是'));",
].join('\n');

writeFileSync(入口, 源码);
await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
