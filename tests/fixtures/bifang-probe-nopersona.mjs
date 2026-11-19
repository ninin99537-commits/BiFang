// 一次性探针（只读）: 复现 #257 —— 没选人设时取料是否抛错、在哪一层抛。
//
// 需求方的现象:
//   预览失败: Cannot read properties of undefined (reading 'persona')
//
// 根因假设: `user_avatar: null` / `power_user` 缺失时，`getPersona('current')` 内部读 `undefined.persona`。
//
// 判据: 用一个"没有人设"的假宿主跑 `收集本轮输入`，看它抛不抛、抛在哪。
//   ⚠ 假宿主的 `persona.description()` 必须**真的**模拟"内部抛错"，
//     而不是返回空串 —— 否则测的不是同一个东西。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-nopersona.ts');
const 产物 = path.join(此处, '_probe-nopersona.mjs');

const 源码 = [
  "import { 收集本轮输入 } from '../../src/彼方_NPC幕后生命状态系统/更新输入';",
  "import { 彼方假宿主 } from '../helpers/彼方假宿主';",
  "",
  "const 跑 = async (名, 改宿主) => {",
  "  const { host } = 彼方假宿主({ 模型回复: [] });",
  "  改宿主(host);",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  const 警 = [];",
  "  console.info = () => {}; console.table = () => {};",
  "  console.warn = (...a) => 警.push(a.join(' '));",
  "  try {",
  "    const r = await 收集本轮输入({",
  "      host,",
  "      settings: { 更新: { 读取最近回复数: 1, 注入世界书: false }, 提示词: {} },",
  "      force: true, timing: {}, debugStore: null, 只读: true,",
  "    });",
  "    console.log('  ' + 名 + ': 没抛 ✓  结果=' + (r ? '有' : 'null'));",
  "    if (r) {",
  "      const 全文 = (r.messages ?? []).map(m => String(m.content)).join('\\n');",
  "      console.log('    主角信息在产物里?', 全文.includes('主角') || 全文.includes('玩家'));",
  "      console.log('    清单里有主角信息项?', (r.拼装清单 ?? []).some(x => String(x.名).includes('主角')));",
  "      const 项 = (r.拼装清单 ?? []).find(x => String(x.名).includes('主角'));",
  "      if (项) console.log('    那一项:', JSON.stringify(项));",
  "    }",
  "    console.log('    warn:', 警.length ? 警.slice(0, 3) : '(无)');",
  "  }",
  "  catch (e) {",
  "    console.log('  ' + 名 + ': ★ 抛了 —— ' + (e?.message ?? String(e)));",
  "    console.log('    栈首行:', String(e?.stack ?? '').split('\\n')[1]?.trim() ?? '(无)');",
  "  }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "};",
  "",
  "console.log('=== ① 正常宿主（对照组）===');",
  "await 跑('正常', () => {});",
  "",
  "console.log('');",
  "console.log('=== ② 人设 name/description 返回 null/空（不抛）===');",
  "await 跑('返回空', (host) => {",
  "  host.persona.name = () => null;",
  "  host.persona.description = () => '';",
  "  host.persona.lorebook = () => null;",
  "});",
  "",
  "console.log('');",
  "console.log('=== ③ 人设方法**内部抛错**（模拟 getPersona 读 undefined.persona）===');",
  "await 跑('内部抛错', (host) => {",
  "  host.persona.name = () => { throw new TypeError(\"Cannot read properties of undefined (reading 'persona')\"); };",
  "  host.persona.description = () => { throw new TypeError(\"Cannot read properties of undefined (reading 'persona')\"); };",
  "  host.persona.lorebook = () => { throw new TypeError(\"Cannot read properties of undefined (reading 'persona')\"); };",
  "});",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
