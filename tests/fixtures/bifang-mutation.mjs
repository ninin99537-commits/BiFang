// 变异测试: 故意把零件拼装改坏, 看性质校验能不能抓到。
//
// 为什么必须做(规矩 §十二 #19: 防护类代码必须有"本该被拦住而没拦住"的负样本):
//   "200 组全绿"有两种可能 —— ① 真的没问题 ② 校验函数是空转的。
//   这两者在输出上完全一样。只有"改坏了它必须红"能区分。
//
// 做法: 改**产物副本**(tests/.build/…mutant.mjs), 不碰 src/
// (规矩 §十二 #9: 冻结期间不得写回被冻结的文件, 连 mtime 也不行)。
//
// ⚠ 产物里的中文被 esbuild 转义成了 \uXXXX, 所以锚点必须用 ASCII 片段
//   (第一次我拿中文当锚点, 4 个变异全部"找不到锚点", 等于什么都没验)。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = 'C:/Users/17180/Desktop/MySpecialFolder/实时编写-前端界面或脚本';
const 源 = path.join(ROOT, 'tests/.build/bifang-零件化.test.mjs');
const 原文 = readFileSync(源, 'utf8');

/** 锚点用 ASCII —— 见文件头的说明 */
const 变异们 = [
  {
    名: 'M1 引用后不从默认位置移除(应违反 I1)',
    // 原: new Set([...引用.被引用, ...已关闭])  → 去掉"被引用"这一半
    找: 'new Set([...\\u5F15\\u7528.\\u88AB\\u5F15\\u7528, ...\\u5DF2\\u5173\\u95ED])',
    换: 'new Set([...\\u5DF2\\u5173\\u95ED])',
    期望: '红',
  },
  {
    名: 'M2 关闭不生效(数据段照常拼进去, 应违反 I2)',
    // 原: 数据零件顺序.filter((代号) => !跳过2.has(代号))
    // 改成"不过滤" —— 关闭的零件仍会被拼进产物
    找: '\\u6570\\u636E\\u96F6\\u4EF6\\u987A\\u5E8F.filter((\\u4EE3\\u53F7) => !\\u8DF3\\u8FC72.has(\\u4EE3\\u53F7))',
    换: '\\u6570\\u636E\\u96F6\\u4EF6\\u987A\\u5E8F.filter((\\u4EE3\\u53F7) => true)',
    期望: '红',
  },
  {
    名: 'M3 规则段关闭不生效(应违反 I2)',
    找: '["R2", "R3", "R4", "R5"].filter((\\u4EE3\\u53F7) => !\\u8DF3\\u8FC72.has(\\u4EE3\\u53F7))',
    换: '["R2", "R3", "R4", "R5"].filter((\\u4EE3\\u53F7) => true)',
    期望: '红',
  },
  {
    名: 'M4 条件段字数改回特征串长度(假账, 应被 V1 断言抓到)',
    // 原: 条件段走 量条件段体量 的差值法; 改成拿 内容.length(特征串 12 字)
    找: '\\u6761\\u4EF6\\u6BB5 = \\u96F6\\u4EF6.\\u4EE3\\u53F7 === "R6" || \\u96F6\\u4EF6.\\u4EE3\\u53F7 === "R7"',
    换: '\\u6761\\u4EF6\\u6BB5 = false',
    期望: '红',
  },
];

let 生成数 = 0;
for (const [i, 变异] of 变异们.entries()) {
  if (!原文.includes(变异.找)) {
    console.log(`  [跳过] ${变异.名} —— 锚点失配(产物形状变了)`);
    continue;
  }
  const 副本 = path.join(ROOT, `tests/.build/bifang-mutant-${i}.mjs`);
  writeFileSync(副本, 原文.replace(变异.找, 变异.换), 'utf8');
  生成数++;
  let 结果 = '绿(变异未被抓到!)';
  let 摘要 = '';
  try {
    const out = execFileSync(process.execPath, [副本], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/结果: (\d+) 通过, (\d+) 失败/);
    摘要 = m ? m[0] : '';
  }
  catch (e) {
    const out = String(e.stdout ?? '');
    const m = out.match(/结果: (\d+) 通过, (\d+) 失败/);
    摘要 = m ? m[0] : `(退出码 ${e.status})`;
    结果 = '红';
  }
  const 通过 = 结果 === '红';
  console.log(`  ${通过 ? 'PASS' : 'FAIL'}  ${变异.名} → ${结果} ${摘要}`);
  if (!通过)
    process.exitCode = 1;
}
if (生成数 === 0) {
  console.log('  一个变异都没生成 —— 这个变异测试什么都没验');
  process.exitCode = 2;
}
else {
  console.log(`\n${生成数} 个变异全部被抓到 = 性质校验不是空转的。`);
}
