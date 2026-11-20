import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTest } from '../build.mjs';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-c6b-detail.ts');
const 产物 = path.join(此处, '_probe-c6b-detail.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { getPersonaTextForNpc, 建世界书索引 } from '../../src/彼方_NPC幕后生命状态系统/worldbook';",
  "",
  "const 五个NPC = ['甲', '乙', '丙', '丁', '戊'];",
  "let entriesCalls = 0;",
  "function 造书(前缀: string) {",
  "  return 五个NPC.map(名 => ({",
  "    name: `${前缀}人设-${名}`, comment: `${前缀}人设-${名}`,",
  "    content: `${名}是${前缀}里的角色。`,",
  "    enabled: true, disable: false,",
  "    strategy: { type: 'selective', keys: [名] },",
  "  }));",
  "}",
  "const 两本: any = { 主书: 造书('主'), 附书: 造书('附') };",
  "const host: any = {",
  "  vars: { get: () => ({}), update: () => {}, del: () => {}, insertOrAssign: () => {}, scriptId: () => 't' },",
  "  worldbook: {",
  "    groupMemberNames: () => [],",
  "    boundNames: () => ({ primary: '主书', additional: ['附书'] }),",
  "    boundNamesOf: () => ({ primary: null, additional: [] }),",
  "    chatName: () => null,",
  "    entries: async (n: string) => { entriesCalls++; return 两本[n] ?? []; },",
  "  },",
  "  persona: { name: () => '', description: () => '', lorebook: () => null },",
  "  macros: { 展开: (s: string) => s },",
  "  ejs: { 评估: async () => '', compileTemplate: () => () => '', prepareContext: async () => null, getWorldInfoActivatedData: null },",
  "  acu: null, toast: { warn: () => {}, success: () => {}, info: () => {} },",
  "};",
  "const 原info = console.info; const 原warn = console.warn; const 原err = console.error;",
  "console.info = () => {}; console.warn = () => {}; console.error = () => {};",
  "const 索引 = await 建世界书索引(host);",
  "console.info = 原info; console.warn = 原warn; console.error = 原err;",
  "console.log('索引条数: ' + 索引.绿灯条目.length);",
  "console.log('索引内容: ' + 索引.绿灯条目.map(x => x.书名 + '/' + x.entry.name).join(', '));",
  "console.log('');",
  "const 已发身份 = new Set<string>();",
  "for (const 名 of 五个NPC) {",
  "  console.info = () => {}; console.warn = () => {}; console.error = () => {};",
  "  const 文本 = await getPersonaTextForNpc(host, 名, '', [], '', 已发身份, 索引);",
  "  console.info = 原info; console.warn = 原warn; console.error = 原err;",
  "  console.log('NPC ' + 名 + ': 长度 ' + 文本.length + ' | ' + JSON.stringify(文本));",
  "}",
].join('\n');

writeFileSync(入口, 源码);
await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
