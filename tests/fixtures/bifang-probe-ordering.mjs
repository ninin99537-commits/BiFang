// 一次性探针（只读）: 清理死代码之前，确认 `条目顺序` 对最终模板**有没有影响**。
//
// 为什么必须量:
//   `迁移旧段` 里有一整套"锚点 → 插入位置"的计算，写进 `提示词.条目顺序`。
//   而 `条目转模板` 只遍历 `提示词.条目`（数组顺序），**不读 `条目顺序`**。
//   若确认无影响，那套插入位置计算就是**白算的** —— 这决定 `默认列表顺序`
//   能不能跟着删（它是 `迁移旧段` 唯一的用途）。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-ordering.ts');
const 产物 = path.join(此处, '_probe-ordering.mjs');

const 源码 = [
  "import { 迁移旧段, 条目转模板 } from '../../src/彼方_NPC幕后生命状态系统/条目列表';",
  "",
  "/** 把模板拍平成可比较的字符串 */",
  "const 快照 = (提示词) => JSON.stringify((提示词.模板 ?? []).map(s => ({ role: s.role, content: s.content })));",
  "",
  "console.log('=== ① 同样的自定义段，换不同的 条目顺序 初始值 ===');",
  "const 造 = (顺序) => ({",
  "  自定义段: [",
  "    { 锚点: '最后', role: 'system', content: '段-最后' },",
  "    { 锚点: '最前', role: 'system', content: '段-最前' },",
  "  ],",
  "  条目顺序: 顺序,",
  "});",
  "",
  "const A = 造([]);",
  "迁移旧段(A); 条目转模板(A);",
  "const B = 造(['R1','R2','R3','R4','R5','D13','D1','D2']);",
  "迁移旧段(B); 条目转模板(B);",
  "",
  "console.log('  空顺序 的模板:', 快照(A).slice(0, 200));",
  "console.log('  给顺序 的模板:', 快照(B).slice(0, 200));",
  "console.log('  两者模板相同?', 快照(A) === 快照(B));",
  "",
  "console.log('');",
  "console.log('=== ② 迁移后 条目顺序 里到底写了什么 ===');",
  "console.log('  A.条目顺序 =', JSON.stringify(A.条目顺序));",
  "console.log('  A.条目     =', JSON.stringify((A.条目 ?? []).map(x => x.content)));",
  "",
  "console.log('');",
  "console.log('=== ③ 条目顺序 会不会被 条目转模板 读到 ===');",
  "const C = {",
  "  条目: [{ id: 'a', role: 'system', content: '甲' }, { id: 'b', role: 'user', content: '乙' }],",
  "  条目顺序: ['b', 'a'],   // ← 故意反过来",
  "};",
  "条目转模板(C);",
  "const 顺序内容 = (C.模板 ?? []).map(s => s.content);",
  "console.log('  模板里的顺序:', JSON.stringify(顺序内容.map(x => String(x).slice(0, 20))));",
  "console.log('  甲在乙前面?', 顺序内容.findIndex(x => String(x).includes('甲')) < 顺序内容.findIndex(x => String(x).includes('乙')));",
  "console.log('  → 若为 true，说明 条目顺序 被忽略（按 条目 数组顺序）');",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "console.log('条目顺序 对最终模板有影响?', 快照(A) !== 快照(B));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
