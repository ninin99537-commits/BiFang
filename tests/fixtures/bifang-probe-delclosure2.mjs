// 一次性探针 v2（只读）: 排除注释，算**真实代码引用**的闭包。
//
// v1 为什么不够（§十二 #22 要求写清上一版错因）:
//   v1 把注释里提到符号名也算成"使用"。于是 `扫零件引用` 显示"块外 4 处仍有使用"，
//   其中 3 处是注释（"见 扫零件引用" / "锚点侧由 扫零件引用 算" / "删它牵动…"）。
//   只有 1 处是真调用。
//   → 结论方向没错，但**规模被高估**：会让我以为删起来牵连很大。
//
// 本版判据: 先把注释行与行尾注释剥掉，再数。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const p = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', 'prompts.ts');
const 原文 = readFileSync(p, 'utf8').split('\n');

/** 剥注释：整行注释 → 空；行尾 `// …` → 去掉。**不处理块注释内的行**（本文件注释都是行首 `*`）。 */
function 去注释(行) {
  const t = 行.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
    return '';
  const i = 行.indexOf('//');
  return i < 0 ? 行 : 行.slice(0, i);
}

const 行们 = 原文.map((l, i) => ({ 行: i + 1, 码: 去注释(l) }));

function 找行(片段) {
  const i = 原文.findIndex(l => l.includes(片段));
  return i < 0 ? null : i + 1;
}

const 锚点块起 = 找行('type 用户段 =');
const 锚点块止 = 找行('function 合并相邻assistant');
const 在块内 = (行) => 行 >= 锚点块起 && 行 < 锚点块止;

console.log('=== 锚点块: 第 ' + 锚点块起 + ' ~ ' + (锚点块止 - 1) + ' 行 ===');
console.log('');

const 候选 = [
  '用户段', '锚点表', '锚点名', '归一化身份', '锚点段',
  '引用结论', '扫零件引用', '用户段们', '自定义段', '来自旧设置',
  '扫占位符', '合并相邻assistant',
];

console.log('=== 真实代码引用（已排除注释）===');
const 死代码候选 = [];
for (const 名 of 候选) {
  const 码内 = 行们.filter(x => x.码.includes(名));
  const 块内 = 码内.filter(x => 在块内(x.行));
  const 块外 = 码内.filter(x => !在块内(x.行));
  let 结论;
  if (码内.length === 0)
    结论 = '（代码里未出现，只在注释里）';
  else if (块外.length === 0) {
    结论 = '★ 删块后变死代码';
    死代码候选.push(名);
  }
  else
    结论 = '块外 ' + 块外.length + ' 处真实引用';
  console.log('');
  console.log(名.padEnd(16), '代码引用 ' + 码内.length + ' 处（块内 ' + 块内.length + ' / 块外 ' + 块外.length + '）  ' + 结论);
  for (const x of 块外)
    console.log('     第 ' + x.行 + ' 行: ' + x.码.trim().slice(0, 78));
}

console.log('');
console.log('=== 结论 ===');
console.log('删锚点块后会变死代码的:', 死代码候选.length ? 死代码候选.join(' / ') : '（无）');
console.log('');
console.log('块外仍有真实引用的（必须逐处处理，不能只删块）:');
for (const 名 of 候选) {
  if (死代码候选.includes(名)) continue;
  const 块外 = 行们.filter(x => x.码.includes(名) && !在块内(x.行));
  if (块外.length === 0) continue;
  console.log('  · ' + 名 + '（' + 块外.length + ' 处）→ 行 ' + 块外.map(x => x.行).join(','));
}
