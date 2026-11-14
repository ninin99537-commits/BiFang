// 批次 1 起: 类型门收紧为**全仓 0**(需求位 #65/#68 裁定) —— `pnpm typecheck` 必须真的能绿,
// 门与命令才说同一句话。以前门只判 src/彼方_* 与 src/共用/, 会出现"命令绿了但门只看两个目录"的错位;
// 现在任何目录的一条 tsc 错误都红, 门里不再白名单任何目录。库文件的错(@vueuse 的 Bluetooth 全家桶)
// 不是我们的代码, 由 tsconfig 的 skipLibCheck 消掉(理由注释在 tsconfig 里, 批1 d64720e 加的)。
// 基线 sha 47d3068(2026-11-14): 该点上 tsc --noEmit 全仓零错误, 门限 0。
// 探针模式(--probe)不变: 红样本固定在 tests/fixtures/typecheck-gate/, 证明"门会红并指名文件"——
// src/ 里不做实验(2026-11-14 规矩); 验收变异除外(带 claim/还原/release 纪律, 另行执行)。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TSC路径 = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TS配置 = path.join(ROOT, 'tsconfig.json');

const 行正则 = /^([^(]+\.ts)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

// 探针模式: 证明"门会红并指名文件"。样本一条错都没有 = 样本被修好或配置漂了, exit 2(不是绿)。
if (process.argv.includes('--probe')) {
  const 探针配置 = path.join(ROOT, 'tests', 'fixtures', 'typecheck-gate', 'tsconfig.json');
  if (!existsSync(探针配置)) {
    console.error(`探针跑不起来: 找不到 ${path.relative(ROOT, 探针配置)}`);
    process.exit(2);
  }
  const 探针进程 = spawnSync(process.execPath, [TSC路径, '--noEmit', '--pretty', 'false', '-p', 探针配置], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (探针进程.error) {
    console.error('探针跑不起来: tsc 进程没起来。', 探针进程.error);
    process.exit(2);
  }
  const 探到的 = [];
  for (const 行 of String(探针进程.stdout ?? '').split(/\r?\n/)) {
    const m = 行正则.exec(行.trim());
    if (m)
      探到的.push(`  ${m[1].replace(/\\/g, '/')}(${m[2]},${m[3]}): ${m[4]} ${m[5]}`);
  }
  console.log('===== 类型门 · 探针模式 (tests/fixtures/typecheck-gate/) =====');
  if (探到的.length === 0) {
    console.log('结论: 探针失败 —— 红样本一条错都没报(样本被修好了? 编译选项漂了?), 证明不了"门会红"。');
    process.exit(2);
  }
  console.log(`红样本报了 ${探到的.length} 处, 门会红并逐条指名:`);
  for (const 行 of 探到的)
    console.log(行);
  console.log('结论: 红(探针, 与预期一致) —— 这不是真实回归, 主门不受影响。');
  process.exit(1);
}

if (!existsSync(TSC路径) || !existsSync(TS配置)) {
  console.error('类型门跑不起来: 找不到 tsc 或 tsconfig.json —— 先 pnpm install, 或看仓库结构是不是变了。');
  process.exit(2);
}

const 进程 = spawnSync(process.execPath, [TSC路径, '--noEmit', '--pretty', 'false', '-p', TS配置], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (进程.error) {
  console.error('类型门跑不起来: tsc 进程没起来。', 进程.error);
  process.exit(2);
}

const 错误们 = [];
for (const 行 of String(进程.stdout ?? '').split(/\r?\n/)) {
  const m = 行正则.exec(行.trim());
  if (m)
    错误们.push({ 文件: m[1].replace(/\\/g, '/'), 行: Number(m[2]), 列: Number(m[3]), 码: m[4], 文: m[5] });
}
if (错误们.length === 0 && 进程.status !== 0) {
  console.error(`tsc 退出码 ${进程.status} 但一行错误都没解析出来 —— 输出形状变了, 门脚本的解析要跟着改。尾部输出:`);
  console.error(String(进程.stdout ?? '').split(/\r?\n/).slice(-20).join('\n'));
  process.exit(2);
}

console.log('===== 类型门 (node tests/typecheck-gate.mjs) =====');
console.log(`tsc --noEmit: 全仓 ${错误们.length} 处错误 / 门限 0 (基线 sha 47d3068)`);

if (错误们.length > 0) {
  console.log('结论: 红 —— 全仓不允许任何类型错, 逐条指名:');
  for (const e of 错误们)
    console.log(`  ${e.文件}(${e.行},${e.列}): ${e.码} ${e.文}`);
  process.exit(1);
}
console.log('结论: 绿 —— 全仓零类型错。');
