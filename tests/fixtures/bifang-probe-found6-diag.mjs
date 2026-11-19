// 诊断探针: 为什么「写入开着时条目还在」为 false。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-found6-diag.ts');
const 产物 = path.join(此处, '_probe-found6-diag.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { maybeInjectNpcStates } from '../../src/彼方_NPC幕后生命状态系统/worldbook-inject';",
  "import { invalidateReadCache, getSettings, 设置读取可信 } from '../../src/彼方_NPC幕后生命状态系统/settings';",
  "import { BIFANG_WORLDBOOK_ENTRY_NAME } from '../../src/彼方_NPC幕后生命状态系统/彼方条目';",
  "",
  "const 原I = console.info, 原W = console.warn, 原E = console.error, 原T = console.table;",
  "console.info = () => {}; console.warn = () => {}; console.error = () => {}; console.table = () => {};",
  "",
  "const 书 = { 条目: [{ name: BIFANG_WORLDBOOK_ENTRY_NAME, content: '[彼方 · 幕后NPC状态]\\n甲 | 位置: 家', enabled: true, extra: { bifang: true } }] };",
  "const 调用 = [];",
  "const host = {",
  "  worldbook: {",
  "    boundNames: () => ({ primary: '主世界书', additional: [] }),",
  "    boundNamesOf: () => ({ primary: null, additional: [] }),",
  "    groupMemberNames: () => [],",
  "    chatName: () => null,",
  "    getOrCreateChat: async () => { 调用.push('getOrCreateChat'); return '聊天世界书'; },",
  "    entries: async (n) => { 调用.push('entries:' + n); return 书.条目.map(e => ({ ...e })); },",
  "    update: async (n, fn) => { 调用.push('update:' + n); 书.条目 = fn(书.条目); },",
  "    create: async (n, 新增) => { 调用.push('create:' + n); 书.条目.push(...新增); },",
  "    remove: async (n, 谓词) => { 调用.push('remove:' + n); 书.条目 = 书.条目.filter(e => !谓词(e)); },",
  "  },",
  "  toast: { warn: () => {}, success: () => {}, info: () => {} },",
  "  vars: {",
  "    get: (arg) => arg?.type === 'global' ? { 彼方_settings: { 启用幕后: true, 更新: { 世界书写入: '角色卡主世界书' } } } : {},",
  "    update: () => {},",
  "    scriptId: () => 'fake',",
  "  },",
  "};",
  "",
  "try {",
  "  invalidateReadCache();",
  "  const s = getSettings(host);",
  "  console.log('启用幕后 = ' + JSON.stringify(s.启用幕后));",
  "  console.log('世界书写入 = ' + JSON.stringify(s.更新.世界书写入));",
  "  console.log('设置读取可信 = ' + 设置读取可信());",
  "  maybeInjectNpcStates(host);",
  "  await new Promise(r => setTimeout(r, 100));",
  "  console.log('调用序列: ' + JSON.stringify(调用));",
  "  console.log('条目数 = ' + 书.条目.length);",
  "  console.log('条目: ' + JSON.stringify(书.条目.map(e => ({ name: e.name, extra: e.extra }))));",
  "}",
  "finally {",
  "  console.info = 原I; console.warn = 原W; console.error = 原E; console.table = 原T;",
  "}",
].join('\n');

writeFileSync(入口, 源码);
await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
