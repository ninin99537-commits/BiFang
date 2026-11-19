// 一次性探针（只读）: 删掉锚点路径之后，还有哪些符号会变成"只被删掉的代码使用"？
//
// 目的: 把"连带删除"算清楚，避免边删边发现 TS6133 反复返工。
//
// 做法: 对每个候选符号，统计它在 prompts.ts 里的**全部出现行**，
//   然后标记每一行属于哪一"块"（锚点块 / 模板块 / 清单块 / 其它）。
//   若某符号的出现**全部**落在锚点块里 → 删锚点块后它成为死代码。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const p = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', 'prompts.ts');
const lines = readFileSync(p, 'utf8').split('\n');

/** 已知的块边界（按内容特征找，不写死行号 —— 行号会漂） */
function 找行(片段) {
  const i = lines.findIndex(l => l.includes(片段));
  return i < 0 ? null : i + 1;
}

const 边界 = {
  '用户段类型': 找行('type 用户段 ='),
  '锚点表': 找行('const 锚点表 ='),
  '归一化身份': 找行('const 归一化身份 ='),
  '锚点段函数': 找行('function 锚点段('),
  '引用结论接口': 找行('interface 引用结论'),
  '扫零件引用函数': 找行('function 扫零件引用('),
  '合并相邻assistant': 找行('function 合并相邻assistant'),
  '模板渲染结果': 找行('const 模板消息 ='),
  '清单生成': 找行('const 生成清单 ='),
};

console.log('=== 块边界（当前行号，仅供定位）===');
for (const [名, 行] of Object.entries(边界))
  console.log('  ' + 名.padEnd(18), 行 ? '第 ' + 行 + ' 行' : '未找到');

// 锚点块：从 `type 用户段` 到 `合并相邻assistant` 之前（含 引用结论 / 扫零件引用 / 锚点段）
const 锚点块起 = 边界['用户段类型'];
const 锚点块止 = 边界['合并相邻assistant'];
console.log('');
console.log('=== 锚点块范围 ===');
console.log('  第 ' + 锚点块起 + ' 行 ~ 第 ' + (锚点块止 - 1) + ' 行，共 ' + (锚点块止 - 锚点块起) + ' 行');

const 在锚点块 = (行) => 行 >= 锚点块起 && 行 < 锚点块止;

/** 候选符号：删锚点块之后可能变死的 */
const 候选 = [
  '用户段', '锚点表', '锚点名', '归一化身份', '锚点段',
  '引用结论', '扫零件引用', '用户段们', '自定义段', '来自旧设置',
  '扫占位符', '提示词段', '合并相邻assistant',
];

console.log('');
console.log('=== 每个候选符号的出现位置分布 ===');
for (const 名 of 候选) {
  const 行们 = [];
  lines.forEach((l, i) => {
    if (l.includes(名))
      行们.push({ 行: i + 1, 在锚点块: 在锚点块(i + 1), 文本: l.trim().slice(0, 60) });
  });
  const 块内 = 行们.filter(x => x.在锚点块).length;
  const 块外 = 行们.length - 块内;
  const 结论 = 行们.length === 0 ? '（未出现）'
    : 块外 === 0 ? '★ 全部在锚点块内 → 删锚点块后变死代码'
    : '块外 ' + 块外 + ' 处 → 仍有使用';
  console.log('');
  console.log(名.padEnd(16), '共 ' + 行们.length + ' 处（块内 ' + 块内 + ' / 块外 ' + 块外 + '）  ' + 结论);
  for (const x of 行们.filter(y => !y.在锚点块))
    console.log('     块外 第 ' + x.行 + ' 行: ' + x.文本);
}

console.log('');
console.log('=== 结论：删锚点块时必须一起处理的 ===');
for (const 名 of 候选) {
  const 行们 = [];
  lines.forEach((l, i) => { if (l.includes(名)) 行们.push(i + 1); });
  if (行们.length === 0) continue;
  const 全在块内 = 行们.every(行 => 在锚点块(行));
  if (全在块内) console.log('  ✂ ' + 名 + '（' + 行们.length + ' 处，全在块内）');
}
