// 一次性探针: 删列表路径的**真实规模** —— 多少行代码、多少条测试会失效
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 彼方 = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统');

const p = readFileSync(path.join(彼方, 'prompts.ts'), 'utf8');
const lines = p.split('\n');

console.log('=== prompts.ts 里"列表路径"的代码段 ===');
// 找关键标记
const 标记们 = [
  ['条目列表: 唯一的顺序逻辑', '列表路径开始'],
  ['按列表产出消息', '列表产出函数'],
  ['const messages: 提示词段[] = input.模板', '两条路分叉处'],
];
for (const [标, 名] of 标记们) {
  const i = lines.findIndex(l => l.includes(标));
  console.log('  ' + 名.padEnd(16), i >= 0 ? '第 ' + (i + 1) + ' 行' : '未找到');
}

// 从"条目列表"标记到"模板路径"标记之间的行数
const 起 = lines.findIndex(l => l.includes('条目列表: 唯一的顺序逻辑'));
const 止 = lines.findIndex(l => l.includes('模板路径（2026-11-19）'));
console.log('  列表路径代码段:', (止 - 起), '行（第', 起 + 1, '到', 止, '行）');

console.log('');
console.log('=== 测试依赖 `条目` 入参的情况 ===');
const 测试们 = ['bifang-零件化.test.ts', 'bifang-条目列表.test.ts', 'bifang-拼装页.test.ts', 'bifang-模板.test.ts'];
for (const 名 of 测试们) {
  const s = readFileSync(path.join(ROOT, 'tests', 名), 'utf8');
  const 条目次数 = (s.match(/条目:/g) || []).length;
  const 条目顺序次数 = (s.match(/条目顺序/g) || []).length;
  const 断言数 = (s.match(/\b(ok|eq)\(/g) || []).length;
  console.log('  ' + 名.padEnd(26), '条目:' + 条目次数, ' 条目顺序:' + 条目顺序次数, ' 断言约' + 断言数 + ' 条');
}
