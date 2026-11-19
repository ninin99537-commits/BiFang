#!/usr/bin/env node
// 类型检查门 —— 2026-11-20 C9（需求方 #464）。
//
// ── 这个脚本解决什么 ──
//
//  `.vue` 模板原来**根本不进 TS 管线**：
//    · vue-loader 把 `<template>` 编成 render 函数，不经过 ts-loader
//    · ts-loader 三处都是 `transpileOnly: true`
//    · `tsc --noEmit` 不认 `.vue`
//
//  于是"模板里用了不存在的名字"编译期永远看不见 —— 今天那个
//  「NPC 详情区永远空着」「仪表盘一行从 11-16 起从未显示」都是这一类。
//  它活了一周，因为**没有任何东西会报它**。
//
//  现在用 `vue-tsc` 把模板也纳入类型检查。
//
// ── 为什么"只拦彼方" ──
//
//  首次扫全仓有 59 条存量错误，分布在四个项目：
//
//  | 项目 | 条数 |
//  |---|---|
//  | 彼方 | 15（**本批已全修**） |
//  | 剧情导演 | 19 |
//  | 自定义状态栏 | 20 |
//  | 烟火 | 5 |
//
//  用户让做的是"检查彼方"；另外三个项目里有别人未提交的 WIP，
//  **半夜无人确认就动它们，风险不对等。**
//
//  所以门限**只对彼方目录的报错失败**，其余三个项目**照常打印但不失败**，
//  并附一行"待各自修完后再纳入门限"。
//
//  ⚠ **这不是"把 44 条塞进基线"**：
//    · 那个做法让红变成背景色（一条一直红的守卫 = 没有守卫）
//    · 这个做法写清了两件事：**谁还没修**（上面那张表）+ **修完就纳入**（本文件末尾的清单）
//    · 而且**其余项目的错误仍在打印**，不是静默吞掉
//
//  ── 判据 ──
//
//  `tests/typecheck-gate.test.ts` 会：
//    ① 在彼方某个模板里写一个不存在的名字 → **门必须红**
//    ② 确认另外三个项目的报错仍在输出里（不是静默）
//    ③ 确认"待纳入"清单与实际报错的项目一致

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/**
 * **门限覆盖的项目**（只有这些项目的报错会让检查失败）。
 *
 * 往这里加一项之前，先确认那个项目的 `.vue` 已经全绿 ——
 * 否则你就是把红变成了背景色。
 */
const 门限覆盖 = [
  'src/彼方_NPC幕后生命状态系统',
];

/**
 * **待纳入门限**的项目（报错照常打印，但不失败）。
 *
 * 每一项都要写清"谁还没修" —— 这是它与"塞进基线"的区别。
 */
const 待纳入 = [
  { 目录: 'src/剧情导演', 条数: 19 },
  { 目录: 'src/自定义状态栏', 条数: 20 },
  { 目录: 'src/烟火_世界运转', 条数: 5 },
];

/** 把绝对路径的报错行归到它属于哪个目录 */
function 归属目录(文件路径) {
  const 相对 = 文件路径.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/');
  const 全部 = [...门限覆盖, ...待纳入.map(x => x.目录)];
  // 取最长的匹配（`src/彼方_…` 不该被 `src/` 之类的前缀吃掉）
  const 命中 = 全部
    .filter(d => 相对.startsWith(`${d}/`))
    .sort((a, b) => b.length - a.length)[0];
  return 命中 ?? null;
}

function main() {
  const 入口 = path.join(ROOT, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js');
  if (!existsSync(入口)) {
    console.error('✗ 找不到 vue-tsc。先跑 `pnpm add -D vue-tsc`。');
    return 2;
  }

  // 用 node 直接跑 vue-tsc 的入口，不经过 .cmd 包装（Windows 上包装会吞退出码）
  const 结果 = spawnSync(process.execPath, [入口, '--noEmit', '-p', 'tsconfig.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const 输出 = `${结果.stdout ?? ''}${结果.stderr ?? ''}`;
  const 行们 = 输出.split(/\r?\n/);

  // ── 逐行归到目录 ──
  const 错误行们 = 行们.filter(l => /error TS\d+:/.test(l));
  const 按目录 = new Map();
  const 未归属 = [];
  for (const 行 of 错误行们) {
    const m = 行.match(/^(.+?)\(\d+,\d+\): error TS\d+:/);
    if (!m) {
      未归属.push(行);
      continue;
    }
    const 目录 = 归属目录(m[1]);
    if (!目录) {
      未归属.push(行);
      continue;
    }
    if (!按目录.has(目录))
      按目录.set(目录, []);
    按目录.get(目录).push(行);
  }

  // ── 门限内的报错 → 失败 ──
  let 门限内错误数 = 0;
  for (const 目录 of 门限覆盖) {
    const 行们 = 按目录.get(目录) ?? [];
    门限内错误数 += 行们.length;
    if (行们.length > 0) {
      console.error(`\n✗ ${目录}：${行们.length} 条类型错误（**门限内，必须修**）`);
      for (const 行 of 行们)
        console.error(`  ${行}`);
    }
  }

  // ── 门限外的报错 → 打印但不失败 ──
  let 门限外错误数 = 0;
  for (const { 目录 } of 待纳入) {
    const 行们 = 按目录.get(目录) ?? [];
    门限外错误数 += 行们.length;
    if (行们.length > 0) {
      console.warn(`\n⚠ ${目录}：${行们.length} 条类型错误（**不在门限内，不阻塞**）`);
      for (const 行 of 行们)
        console.warn(`  ${行}`);
    }
  }

  // ── 不属于任何已知目录的报错：也算失败（不认识的必须报） ──
  if (未归属.length > 0) {
    console.error(`\n✗ ${未归属.length} 条报错不属于任何已知项目目录（**必须归位**）`);
    for (const 行 of 未归属)
      console.error(`  ${行}`);
  }

  // ── 汇总 ──
  const 总 = 错误行们.length;
  if (门限内错误数 === 0 && 未归属.length === 0) {
    if (门限外错误数 > 0) {
      const 明细 = 待纳入
        .map(({ 目录 }) => {
          const n = (按目录.get(目录) ?? []).length;
          return n > 0 ? `${目录} ${n}` : null;
        })
        .filter(Boolean)
        .join(' / ');
      console.log(`\n✓ 类型检查通过（门限内 0 条）`);
      console.log(`  另有 ${门限外错误数} 条在待纳入项目里：${明细}`);
      console.log('  待各自修完后再纳入门限（见 tests/typecheck-gate.mjs 的 待纳入 清单）');
    }
    else {
      console.log(`\n✓ 类型检查通过（全仓 0 条，共 ${总} 行输出）`);
    }
    return 0;
  }

  console.error(`\n✗ 类型检查失败：门限内 ${门限内错误数} 条${未归属.length > 0 ? `，未归属 ${未归属.length} 条` : ''}`);
  return 1;
}

process.exit(main());
