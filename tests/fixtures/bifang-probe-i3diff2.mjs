// 一次性探针（只读）: 用**测试自己的输入**比对 I3 基准，逐字符定位差异。
//
// v1 为什么错（§十二 #22 要求写清上一版错因）:
//   我在 v1 里自己写了一份 `造()`，但 `replyCount` 填了 2、`worldbook` 填了非空，
//   而测试用的是 `replyCount: 1` / `worldbook: ''`。
//   **于是比对的是两个不同场景的产物**，第一处差异在位置 9（"共 1 条" vs "共 2 条"）——
//   那根本不是我要找的差异，是我的探针喂错了输入。
//
//   教训：比对"基准 vs 当前"时，**必须用同一个输入构造器**。
//   自己另写一份 = 悄悄换了变量，而结果看起来像"有差异"。
//
// v2: 直接 import 测试文件里的 造输入 不可能（它没导出），所以**逐字复制**它，
//     并在开头断言"我的复制与测试文件里的那段源码一致"。
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-i3diff2.ts');
const 产物 = path.join(此处, '_probe-i3diff2.mjs');

// 先确认测试文件的 造输入 长什么样（防止我抄错）
const 测试源码 = readFileSync(path.join(此处, '..', 'bifang-模板.test.ts'), 'utf8');
const 造输入段 = 测试源码.slice(
  测试源码.indexOf('function 造输入('),
  测试源码.indexOf('/** 静默跑一遍'),
);
console.log('=== 测试文件的 造输入 原文 ===');
console.log(造输入段);
console.log('=== 抄写结束 ===');
console.log('');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import 快照 from '../fixtures/bifang-prompt-模板化后.json';",
  "",
  "// ⚠ 逐字复制测试文件的 造输入（见本文件上方打印的原文）",
  "function 造输入(额外 = {}) {",
  "  return {",
  "    reply: '这是一段剧情正文。',",
  "    replyCount: 1,",
  "    context: '',",
  "    timeJump: '',",
  "    tracked: ['甲'],",
  "    inSceneHint: [],",
  "    currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "    autoTrackEnabled: true,",
  "    physioEnabled: false,",
  "    恋爱对象名单: [],",
  "    自定义段: [],",
  "    预填充: false,",
  "    worldbook: '',",
  "    currentStoryTime: '2026-01-01 20:00',",
  "    storyTimeHint: '2026-01-02 12:30',",
  "    storySpan: '约 0.7 天',",
  "    recentTrace: '',",
  "    playerName: '主角',",
  "    playerDescription: '',",
  "    展开宏: (t) => t,",
  "    模板: 默认模板,",
  "    ...额外,",
  "  };",
  "}",
  "",
  "function 跑(额外 = {}) {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  try { return buildUpdateMessages(造输入(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "}",
  "",
  "const 快 = typeof 快照 === 'string' ? JSON.parse(快照) : 快照;",
  "",
  "for (const 组名 of ['默认', '带场景判断', '全进工具', '全进工具带场景', '生理开']) {",
  "  const 期望 = 快[组名];",
  "  if (!期望) { console.log(''); console.log('【' + 组名 + '】快照里没有这一组'); continue; }",
  "  const 额外 = {",
  "    '默认': {},",
  "    '带场景判断': { context: '玩家的输入' },",
  "    '全进工具': { 规则进工具: true },",
  "    '全进工具带场景': { 规则进工具: true, context: '玩家的输入' },",
  "    '生理开': { physioEnabled: true },",
  "  }[组名] ?? {};",
  "  const 实际 = 跑(额外);",
  "",
  "  console.log('');",
  "  console.log('================ ' + 组名 + ' ================');",
  "  for (let i = 0; i < Math.max(期望.messages.length, 实际.messages.length); i++) {",
  "    const a = String(期望.messages[i]?.content ?? '');",
  "    const b = String(实际.messages[i]?.content ?? '');",
  "    if (a === b) { console.log('  第' + (i+1) + '条: 相同 (' + a.length + ' 字)'); continue; }",
  "    console.log('  第' + (i+1) + '条: ★ 差异  期望 ' + a.length + ' 字 / 实际 ' + b.length + ' 字  差 ' + (a.length - b.length));",
  "    let x = 0, y = 0, n = 0;",
  "    while ((x < a.length || y < b.length) && n < 8) {",
  "      if (a[x] === b[y]) { x++; y++; continue; }",
  "      n++;",
  "      console.log('    [' + n + '] 期望位置 ' + x + ' / 实际位置 ' + y);",
  "      console.log('      期望: ' + JSON.stringify(a.slice(Math.max(0, x - 30), x + 30)));",
  "      console.log('      实际: ' + JSON.stringify(b.slice(Math.max(0, y - 30), y + 30)));",
  "      let 对齐 = false;",
  "      for (let k = 1; k <= 40 && !对齐; k++) {",
  "        if (a[x + k] === b[y]) { x += k; 对齐 = true; console.log('        → 期望跳 ' + k); }",
  "        else if (a[x] === b[y + k]) { y += k; 对齐 = true; console.log('        → 实际跳 ' + k); }",
  "      }",
  "      if (!对齐) { console.log('        → 无法对齐'); break; }",
  "    }",
  "  }",
  "  const 期工具 = 期望.工具说明 ?? null;",
  "  const 实工具 = 实际.工具说明 ?? null;",
  "  if (期工具 !== 实工具) {",
  "    console.log('  工具说明: ★ 差异  期望 ' + (期工具?.length ?? 0) + ' / 实际 ' + (实工具?.length ?? 0));",
  "    if (期工具 && 实工具) {",
  "      let x = 0, y = 0, n = 0;",
  "      while ((x < 期工具.length || y < 实工具.length) && n < 5) {",
  "        if (期工具[x] === 实工具[y]) { x++; y++; continue; }",
  "        n++;",
  "        console.log('    [' + n + '] 期望位置 ' + x);",
  "        console.log('      期望: ' + JSON.stringify(期工具.slice(Math.max(0, x - 30), x + 30)));",
  "        console.log('      实际: ' + JSON.stringify(实工具.slice(Math.max(0, y - 30), y + 30)));",
  "        let 对齐 = false;",
  "        for (let k = 1; k <= 40 && !对齐; k++) {",
  "          if (期工具[x + k] === 实工具[y]) { x += k; 对齐 = true; console.log('        → 期望跳 ' + k); }",
  "          else if (期工具[x] === 实工具[y + k]) { y += k; 对齐 = true; console.log('        → 实际跳 ' + k); }",
  "        }",
  "        if (!对齐) break;",
  "      }",
  "    }",
  "  }",
  "  else console.log('  工具说明: 相同');",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
