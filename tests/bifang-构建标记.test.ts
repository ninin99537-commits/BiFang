// 彼方 · 构建标识守卫 —— 批次 4-8 配套钉子(派活: #111)。照 tests/daoyan-构建标记.test.ts 的路子(方案 C: 只加守卫不改构建流程)。
//
// 病根: 构建.ts 的 构建标识 靠**人记得手改**, 现值 '2026-10-29a' 而源码已到 11-14;
// 现有守卫(panel-open-guard:75)只判非空 —— 写着三天前日期/指纹失配的标识也能过, "打不开"那句自报家门失去分辨力。
//
// 判据(什么情况下红) —— 对需求位建议的一条修正与理由:
//   ① 格式: /^(\d{4}-\d{2}-\d{2})([a-z])?-[0-9a-f]{8}$/ —— 日期可选字母后缀(沿用 a/b 递进习惯), **指纹段必填**;
//      解析失败即红(格式坏了比忘改更危险)。与建议的差别: 指纹段从"可选"改为格式必填, 否则指纹判据形同虚设。
//   ② 日期 ≥ 写死锚点 2026-11-14(防往回拨)。
//   ③ 日期 ≥ src/彼方 最新文件 mtime(导演式漂移守卫; copyFileSync 保 mtime 只会放松不误报, 沿用导演注记)。
//   ④ **指纹 = 当前 src 内容指纹**(sha1(文件名+内容) 前 8 位, 排除 构建.ts 自己 —— 它含标识, 算进去永远红;
//      扩展名集 ts/vue/css —— 彼方无 scss, 样式在 面板样式.css, 必须纳入否则"改样式=没变化")。
//      为什么不用"只判日期": 同一天改多少轮都不红。与导演一致的弱点: 指纹要人肉重算 ——
//      但测试失败输出会打印"应为 <指纹>", 更新标记的成本从"想起"降到"照抄"。
//   ⑤ panel-open-guard:75 的"只判非空"已收窄(删除+注释指向本文件) —— 一严一松两守卫会让人以为有防线。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

const 目录 = path.join('src', '彼方_NPC幕后生命状态系统');
const 源码 = readFileSync(path.join(目录, '构建.ts'), 'utf8');
const 标记匹配 = 源码.match(/export const 构建标识 = '([^']+)'/);
ok('找得到 构建标识', !!标记匹配);
const 标识 = 标记匹配?.[1] ?? '';

console.log(`\n[1] 格式: 日期(可选字母后缀) + 必填指纹段 —— 实际: '${标识}'`);
const 格式匹配 = 标识.match(/^(\d{4}-\d{2}-\d{2})([a-z])?-[0-9a-f]{8}$/);
ok('标识形如 YYYY-MM-DD[a]-<8位指纹>(解析失败即红)', !!格式匹配);
const 标记日 = 格式匹配?.[1] ?? '';
const 标指纹 = 格式匹配?.[3] ?? '';
const 日期号 = (文本: string) => {
  const m = 文本.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
};
ok('日期能被解析(否则比较全 0 等于空转)', 日期号(标记日) > 0);

console.log('\n[3] 日期 ≥ src/彼方 最新文件 mtime(导演式漂移守卫)');
let 最新毫秒 = 0;
let 最新文件 = '';
for (const 名 of readdirSync(目录)) {
  if (!/\.(ts|vue|css)$/.test(名))
    continue;
  const 毫秒 = statSync(path.join(目录, 名)).mtimeMs;
  if (毫秒 > 最新毫秒) {
    最新毫秒 = 毫秒;
    最新文件 = 名;
  }
}
ok('扫到了源码文件(防空跑)', 最新毫秒 > 0);
const 补 = (n: number) => String(n).padStart(2, '0');
const d = new Date(最新毫秒);
const 源码日 = `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())}`;
console.log(`        最新: ${最新文件} @ ${源码日} ｜ 标记: ${标记日}`);
ok(`标记日期(${标记日}) ≥ 最新源码日期(${源码日}) —— 改了源却忘改标记红在这里`, 日期号(标记日) >= 日期号(源码日));

console.log('\n[4] 指纹 = 当前 src 内容指纹(同一天改代码也抓得到; 改样式也算)');
{
  const { createHash } = await import('node:crypto');
  const 文件们 = readdirSync(目录).filter(名 => /\.(ts|vue|css)$/.test(名) && 名 !== '构建.ts').sort();
  const h = createHash('sha1');
  for (const 名 of 文件们) {
    h.update(名 + '\0');
    h.update(readFileSync(path.join(目录, 名)));
    h.update('\0');
  }
  const 现指纹 = h.digest('hex').slice(0, 8);
  console.log(`        源码指纹: ${现指纹} ｜ 标记指纹: ${标指纹}（${文件们.length} 个文件; 更新标记请照抄 现指纹）`);
  ok('标记里的指纹 = 当前源码指纹(改一行没更新标记就红在这里)', 现指纹 === 标指纹 && 标指纹.length === 8);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
