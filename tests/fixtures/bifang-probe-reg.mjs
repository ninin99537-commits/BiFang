// 一次性探针: 删「登记归档」会不会影响默认产物?（#215 要求实测确认，不许假设）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

// ⚠ 必须用 fileURLToPath: 直接用 `new URL(...).pathname` 会保留 %E5%AE%9E 这类
//   百分号编码（中文路径），写文件时找不到目录。第一版就这么错的。
const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-reg.ts');
const 产物 = path.join(此处, '_probe-reg.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { getSettings } from '../../src/彼方_NPC幕后生命状态系统/settings';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
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
  "// ① 不传 登记归档 与 传 false, 产物是否相同?",
  "const 不传 = 跑({});",
  "const 传假 = 跑({ 登记归档: false });",
  "console.log('=== 删掉登记归档开关后, 默认产物会变吗 ===');",
  "console.log('不传 vs 传 false: messages 相同?',",
  "  JSON.stringify(不传.messages) === JSON.stringify(传假.messages));",
  "console.log('不传 vs 传 false: 工具说明相同?', (不传.工具说明 ?? null) === (传假.工具说明 ?? null));",
  "",
  "// ② settings schema 里 登记归档 的默认值是什么",
  "console.log('');",
  "console.log('=== settings 里 登记归档 的默认值 ===');",
  "const { 彼方假宿主 } = await import('../helpers/彼方假宿主');",
  "const { host: 假 } = 彼方假宿主({ 模型回复: [] });",
  "const 默认设置 = getSettings(假);",
  "console.log('接口.登记归档 =', JSON.stringify(默认设置.接口?.登记归档));",
  "console.log('→ 若为 false, 则删掉开关不改变默认产物（因为默认本来就关着）');",
  "",
  "// ③ 但传 true 会变 —— 那就是功能没了的证明",
  "const 传真 = 跑({ 登记归档: true });",
  "console.log('');",
  "console.log('传 true 时第1条开头:', JSON.stringify(String(传真.messages[0].content).slice(0, 40)));",
  "console.log('传 false 时第1条开头:', JSON.stringify(String(不传.messages[0].content).slice(0, 40)));",
  "console.log('两者不同?', String(传真.messages[0].content) !== String(不传.messages[0].content));",
  "",
  "// ④ 旧设置里带 登记归档: true 的用户, 删掉开关后会怎样",
  "console.log('');",
  "console.log('=== 旧设置里有 登记归档: true 的用户 ===');",
  "const { host: 旧宿主, 存: 旧存 } = 彼方假宿主({ 模型回复: [] });",
  "旧存.global['彼方_settings'] = { 接口: { 登记归档: true } };",
  "const { invalidateReadCache } = await import('../../src/彼方_NPC幕后生命状态系统/settings');",
  "invalidateReadCache();",
  "const 解析后 = getSettings(旧宿主);",
  "console.log('解析后 接口.登记归档 =', JSON.stringify(解析后.接口?.登记归档));",
  "console.log('→ zod 会保留未知键吗?', Object.prototype.hasOwnProperty.call(解析后.接口 ?? {}, '登记归档'));",
  "console.log('  （若 true = 还留着，但没人读它；若 false/undefined = 已被 schema 丢弃）');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
