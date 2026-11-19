// 探针: 验证 `静默` 已从公开入参类型上移除(外部传它会类型报错)。
//
// ⚠ 第一版探针写错了: 我用 `as any as ... & { 静默: boolean }` 传参, 那等于
//   自己把类型补回去, 所以当然不报错 —— 探针给了"看起来很确定"的错答案。
//   现在改成直接传对象字面量, 不写任何断言。
//
// **探针自身也要有负样本**(规矩 §十二 #3 ③):
//   ① 传不存在的字段(静默) → 必须报错
//   ② 传存在的字段(关闭零件) → 必须不报错
//   两条都成立, 才说明这个探针真能区分"在不在导出面上"。
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = 'C:/Users/17180/Desktop/MySpecialFolder/实时编写-前端界面或脚本';
const 探针 = path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/__probe_静默.ts');

/** 跑一次 tsc, 返回 { 报错, 输出 } */
function 跑tsc() {
  try {
    const 输出 = execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true,
    });
    return { 报错: false, 输出 };
  }
  catch (e) {
    return { 报错: true, 输出: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const 基础 = `import { buildUpdateMessages } from './prompts';
const 输入 = { reply: '', replyCount: 0, tracked: [], inSceneHint: [], currentCards: {} };
`;

// ① 负样本 A: 传**不存在**的字段 静默 —— 必须报错
writeFileSync(探针, `${基础}buildUpdateMessages({ ...输入, 静默: true });\n`);
let A;
try {
  A = 跑tsc();
}
finally {
  unlinkSync(探针);
}

// ② 负样本 B: 传**存在**的字段 关闭零件 —— 必须不报错
writeFileSync(探针, `${基础}buildUpdateMessages({ ...输入, 关闭零件: ['D2'] });\n`);
let B;
try {
  B = 跑tsc();
}
finally {
  unlinkSync(探针);
}

const A命中 = A.报错 && A.输出.includes('__probe_静默');
const B干净 = !B.报错 || !B.输出.includes('__probe_静默');

console.log('① 传 静默  → tsc 报错:', A.报错, '| 指向探针:', A.输出.includes('__probe_静默'));
if (A.输出.includes('__probe'))
  console.log('   ', A.输出.split('\n').filter(l => l.includes('__probe')).slice(0, 2).join('\n    '));
console.log('② 传 关闭零件 → tsc 报错:', B.报错, '| 指向探针:', B.输出.includes('__probe_静默'));
if (B.输出.includes('__probe'))
  console.log('   ', B.输出.split('\n').filter(l => l.includes('__probe')).slice(0, 2).join('\n    '));

console.log('');
if (A命中 && B干净) {
  console.log('PASS 静默 不在导出面上(传它类型报错), 关闭零件 仍在(传它不报错) —— 探针两支都验了');
  process.exitCode = 0;
}
else {
  console.log('FAIL 探针未通过:');
  if (!A命中)
    console.log('  · 传 静默 没有在探针处报错 —— 它仍在导出面上, 或探针没生效');
  if (!B干净)
    console.log('  · 传 关闭零件 也报了错 —— 探针本身坏了(不是"静默被移除")');
  process.exitCode = 1;
}
