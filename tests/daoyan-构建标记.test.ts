// 剧情导演 · 构建标记守卫（2026-11-13 第三批 ③ 方案 C）
//
// 病根：`index.ts:22` 的 `构建标记` 靠**人记得手改**。本轮它就停在 v22 没跟上（代码已到 11-13），
// 真机日志第一行分不清跑的是哪一版 —— 而"载入构建"那行正是排查"发一条消息被调用多次"时唯一可信的自报家门。
//
// 需求方给三个方案，选 C（**只加用例守卫，不改构建流程**）：
// A/B 要动 webpack（DefinePlugin / 构建前改源文件），而构建流程现在跑得好（watch + 热重载），
// 改坏了代价大；C 零风险，能立刻防住"忘了改"。
//
// 判据：`构建标记` 里的日期 **≥** `src/剧情导演/` 里最新文件的日期。
// ⚠️ 需求方提醒：mtime 可能被 `copyFileSync` 保旧（这台机器实测会保）—— 那种情况下本用例只会**放松**，
//    不会误报；所以它抓的是"改了源却忘了改标记"这个真场景，不追求抓住所有时序。
// ⚠️ 日期解析失败必须**红**（不许静默放过）—— 标记格式坏了比忘改更危险：日志会失去分辨力。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** `YYYY-MM-DD` → 可比较的数字（20261113），解析不了返回 0 */
function 日期号(文本: string): number {
  const 匹配 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(文本);
  if (!匹配) return 0;
  return Number(匹配[1]) * 10000 + Number(匹配[2]) * 100 + Number(匹配[3]);
}
const 今天 = (毫秒: number): string => {
  const d = new Date(毫秒);
  const 补 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())}`;
};

console.log('\n[1] 构建标记存在且格式可解析（解析失败必须红）');
const 源码 = readFileSync('src/剧情导演/index.ts', 'utf8');
const 标记匹配 = /export const 构建标记 = '([^']+)'/.exec(源码);
ok('找得到 构建标记', !!标记匹配);
const 标记 = 标记匹配?.[1] ?? '';
const 日期匹配 = /^daoyan-(\d{4}-\d{2}-\d{2})-([0-9a-f]{8})-(.+)$/.exec(标记);
ok(`标记形如 daoyan-YYYY-MM-DD-<8位指纹>-描述（实际：${标记}）`, !!日期匹配);
const 标记日 = 日期匹配?.[1] ?? '';
check('日期部分能被日期号() 解析（否则下面比较全是 0，等于空转）', 日期号(标记日) > 0, true);
ok('描述部分非空（写清这一版做了什么）', (日期匹配?.[3] ?? '').trim().length > 0);

console.log('\n[2] 标记日期 ≥ src/剧情导演/ 最新文件日期');
const 目录 = 'src/剧情导演';
let 最新毫秒 = 0;
let 最新文件 = '';
for (const 名 of readdirSync(目录)) {
  if (!/\.(ts|vue|scss)$/.test(名)) continue;
  const 毫秒 = statSync(path.join(目录, 名)).mtimeMs;
  if (毫秒 > 最新毫秒) {
    最新毫秒 = 毫秒;
    最新文件 = 名;
  }
}
ok('扫到了源码文件（防空跑）', 最新毫秒 > 0);
const 源码日 = 今天(最新毫秒);
console.log(`        最新: ${最新文件} @ ${源码日} ｜ 标记: ${标记日}`);
ok(
  `标记日期(${标记日}) ≥ 最新源码日期(${源码日}) —— 改了源却忘改标记就红在这里`,
  日期号(标记日) >= 日期号(源码日),
);

console.log('\n[2b] 内容指纹必须与 src/剧情导演 的**当前内容**一致（同一天改代码也抓得到）');
{
  // 需求方指出的盲区：只比日期的话，一天里改多少轮都不会红 —— 而"真机分不清跑的是哪一版"正是这个场景。
  // 所以标记里带 8 位内容指纹：改任何一行源码（含注释）→ 指纹变 → 这里红。
  // ⚠️ 必须**排除 index.ts 自己**（它含标记，算进去会永远红）。
  // 2026-11-14 补：`.scss` 也进指纹。理由 —— `悬浮球样式.scss` 是真实源码（面板/球的所有样式），
  // 而它原来**不在**这里：改样式不会让本用例红，等于「判据没覆盖到的文件＝没变化」。
  // 实测证据：改法之前只往 .scss 追加一行注释，本用例 9/9 全过（绿）；纳入后必须红。
  const { createHash } = await import('node:crypto');
  const { readdirSync, statSync } = await import('node:fs');
  const 目录 = 'src/剧情导演';
  const 文件们 = readdirSync(目录).filter(名 => /\.(ts|vue|scss)$/.test(名) && 名 !== 'index.ts').sort();
  const h = createHash('sha1');
  for (const 名 of 文件们) {
    h.update(名 + '\0');
    h.update(readFileSync(目录 + '/' + 名));
    h.update('\0');
  }
  const 现指纹 = h.digest('hex').slice(0, 8);
  const 标指纹 = 日期匹配?.[2] ?? '';
  console.log('        源码指纹: ' + 现指纹 + ' ｜ 标记指纹: ' + 标指纹 + '（' + 文件们.length + ' 个文件）');
  ok('标记里的指纹 = 当前源码指纹（改了一行没更新标记就红在这里）', 现指纹 === 标指纹);
  void statSync;
}

console.log('\n[3] 判据能失败：日期号() 本身对错日期要给出"更小"');
{
  check('昨天 < 今天', 日期号('2026-11-12') < 日期号('2026-11-13'), true);
  check('乱格式解析成 0（所以 [1] 那条会红）', 日期号('v23'), 0);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
