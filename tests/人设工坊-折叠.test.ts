// 人设工坊 · 提示词预览折叠的不变量(#124 批次3, dsh #162)
//
// 这一条专门钉住一个**曾经写错的不变量**: 折叠按「行数」判, 而开销按「字符」算。
// 行数只是字符数的**代理指标, 会脱钩**; 脱钩时修复**静默失效**(不报错, 只是变慢)。
//
// 所以下面用**专门构造的对抗输入**「行数很少但字符很多」—— 那种输入下,
// 按行切片的写法会原样返回全文(修复失效), 按字符预算的写法才会真截短。
import { 预览上限, 需要折叠, 折叠预览 } from '../src/人设工坊/lib/折叠';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

console.log('\n[1] ★ 对抗输入: 行数很少但字符很多(按行判会失效)');
{
  // 3 行 × 5 万字 = 15 万字, 但只有 3 行 —— 任何"按行数"的判据都会认为不用折叠
  const 每行 = '甲'.repeat(50000);
  const 三行 = [每行, 每行, 每行].join('\n');
  ok('确认输入: 行数很少', 三行.split('\n').length === 3);
  ok('确认输入: 字符很多', 三行.length > 预览上限);

  check('按字符判 → 需要折叠', 需要折叠(三行), true);
  const 预览 = 折叠预览(三行);
  ok('折叠后长度被上限封顶(不是原样 15 万字)', 预览.length <= 预览上限 + 200);
  // ★ dsh #170 茬: 上面那条用的是同一个常量 —— 把 预览上限 改成 100000 它也照样通过。
  //   所以再加一条**不依赖该常量**的绝对上界: 折叠结果必须小到"真能省布局"。
  ok('折叠结果 < 20000 字(绝对上界, 不引用 预览上限)', 预览.length < 20000);
  // ★ kimicode #174: 原来这里断言「< 原文的 1/10」—— **比值口径会随全文长度翻转**
  //   (折叠后 ≈ 上限, 全文 ≈ 12 万时比值恰好 ≈ 0.1, 踩线)。改用**绝对量**: ≤ 上限 × 1.2。
  ok('折叠结果 ≤ 上限×1.2(绝对量口径, 不随全文长度翻转)', 预览.length <= 预览上限 * 1.2);
  ok('折叠后带「预览到此为止」尾巴', 预览.includes('预览到此为止'));
}

console.log('\n[2] 超长单行: 一行就超上限, 不许原样返回');
{
  const 一行 = '乙'.repeat(50000);
  check('需要折叠', 需要折叠(一行), true);
  const 预览 = 折叠预览(一行);
  ok('硬截到上限附近(不是 5 万字)', 预览.length <= 预览上限 + 200);
}

console.log('\n[3] 负对照: 短文本不折叠, 原样返回');
{
  const 短 = '## 模块\n一点点内容';
  check('短文本不需要折叠', 需要折叠(短), false);
  // 需要折叠为 false 时, 组件走的是"原样给全文"那条分支
  ok('短文本长度 < 上限', 短.length <= 预览上限);
}

console.log('\n[4] 正常多行文本(行数多、字符适中): 折叠后仍封顶');
{
  const 行们 = Array.from({ length: 3000 }, (_, i) => `第 ${i} 行：这是提示词正文。`);
  const 多行 = 行们.join('\n');
  ok('多行文本超上限', 多行.length > 预览上限);
  const 预览 = 折叠预览(多行);
  ok('折叠后封顶', 预览.length <= 预览上限 + 200);
  ok('折叠保留的是开头(前几行在)', 预览.startsWith('第 0 行'));
}

console.log('\n[5] 边界: 刚好等于上限 → 不折叠');
{
  const 刚好 = '丙'.repeat(预览上限);
  check('等于上限不折叠(不浪费一次截断)', 需要折叠(刚好), false);
  const 超一 = '丙'.repeat(预览上限 + 1);
  check('超一个字符就折叠', 需要折叠(超一), true);
}

console.log(`\n人设工坊折叠不变量: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
