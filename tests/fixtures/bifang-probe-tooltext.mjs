// 一次性探针: 全进工具时, 工具说明的精确拼法是什么?
// 模板路径要复现它, 必须先量清它的结构。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-tooltext.ts');
const 产物 = path.join(此处, '_probe-tooltext.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "const 全工具 = 跑({ 规则进工具: true });",
  "const 工具 = String(全工具.工具说明 ?? '');",
  "const 内容 = 全工具.零件内容 ?? {};",
  "",
  "console.log('工具说明 len =', 工具.length);",
  "console.log('messages:', 全工具.messages.map(m => m.role + ':' + String(m.content).length).join(', '));",
  "console.log('');",
  "",
  "// 工具说明由哪些零件组成？逐个查它的内容在不在工具里",
  "console.log('=== 每个零件的内容在工具说明里吗 ===');",
  "for (const [代, c] of Object.entries(内容)) {",
  "  const s = String(c);",
  "  if (!s) { console.log(代.padEnd(5), '(空)'); continue; }",
  "  const 在 = 工具.includes(s);",
  "  console.log(代.padEnd(5), 'len=' + String(s.length).padStart(5), 在 ? '✓ 在工具里' : '✗ 不在');",
  "}",
  "",
  "console.log('');",
  "console.log('=== 工具说明的拼接顺序（按内容首次出现位置）===');",
  "const 位们 = [];",
  "for (const [代, c] of Object.entries(内容)) {",
  "  const s = String(c);",
  "  if (!s) continue;",
  "  const i = 工具.indexOf(s);",
  "  if (i >= 0) 位们.push({ 代, 位: i, 长: s.length });",
  "}",
  "位们.sort((a, b) => a.位 - b.位);",
  "let 游标 = 0;",
  "for (const { 代, 位, 长 } of 位们) {",
  "  if (位 > 游标) console.log('  [间隙 ' + (位 - 游标) + ' 字] ' + JSON.stringify(工具.slice(游标, 位)));",
  "  console.log('  ' + 代 + ' @' + 位 + ' len=' + 长);",
  "  游标 = 位 + 长;",
  "}",
  "if (游标 < 工具.length) console.log('  [尾部 ' + (工具.length - 游标) + ' 字] ' + JSON.stringify(工具.slice(游标)));",
  "",
  "console.log('');",
  "console.log('=== 结论: 工具说明 ===');",
  "console.log('  = 身份句 + 规则段 + 场景判断 + \"\\\\n\\\\n\" + 数据段 ?');",
  "const 身份 = String(内容.R1 ?? '');",
  "const 规则 = ['R2','R3','R4','R5'].map(d => String(内容[d] ?? '')).join('');",
  "const 数据 = ['D1','D2','D-T','D-N','D9','D10','D11','D12','D14'].map(d => String(内容[d] ?? '')).join('');",
  "const 拼 = 身份 + 规则 + '\\n\\n' + 数据;",
  "console.log('  实测拼法 === 工具说明 ?', 拼 === 工具, '| 拼', 拼.length, '工具', 工具.length);",
  "if (拼 !== 工具) {",
  "  for (let i = 0; i < Math.max(拼.length, 工具.length); i++) {",
  "    if (拼[i] !== 工具[i]) {",
  "      console.log('  差异 @', i);",
  "      console.log('  拼:', JSON.stringify(拼.slice(Math.max(0,i-40), i+40)));",
  "      console.log('  工具:', JSON.stringify(工具.slice(Math.max(0,i-40), i+40)));",
  "      break;",
  "    }",
  "  }",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
