// 剧情导演 · 三个"死字段"接进提示词（2026-11-13，用户拍板：接进提示词、不删）
//
// 病根：这三个字段 schema 有、代码在写，但**提示词从没要求模型产出/理解**，
// 于是它们要么永远空、要么写进账本没人用 —— 一条完整通道永远填不上。
//
// 用户拍板：不删，接进提示词（删字段会动账本形状与迁移，代价大于收益）。
// **但只写提示词，不许在 `提醒.ts` 加规则** —— 真机 `连续低张力 = 54` 已证明
// "再多一条永远在响的提醒"是负收益。

import { readFileSync } from 'node:fs';
import { SYSTEM_PROMPT } from '../src/剧情导演/prompts';

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

console.log('\n[1] 伏笔.误导证据：指向正文里的那条线索 + 可改写清单');
{
  ok('提示词提到「误导证据」', SYSTEM_PROMPT.includes('误导证据'));
  ok('写成"那条让人误信的线索本身"', SYSTEM_PROMPT.includes('那条让人误信的线索本身'));
  ok('要求指向正文里真实写出来的那句', SYSTEM_PROMPT.includes('正文里真实写出来的那一句'));
  ok('是"可改写清单"（整份替换）', SYSTEM_PROMPT.includes('可改写清单') && SYSTEM_PROMPT.includes('整份替换'));
}

console.log('\n[2] 张力.距上次高潮楼层：代码算的 + 超过 6 场 = 平推 + 与连续低张力不同');
{
  ok('提示词提到「距上次高潮楼层」', SYSTEM_PROMPT.includes('距上次高潮楼层'));
  ok('写明是代码算的、不用模型填', SYSTEM_PROMPT.includes('是代码算的, 你不用填'));
  ok('写明超过 6 场还没高潮 = 这一章在平推', SYSTEM_PROMPT.includes('超过 6 场还没高潮'));
  ok('写明与「连续低张力」不是一回事', SYSTEM_PROMPT.includes('不是一回事'));
}

console.log('\n[3] 命运册.最后变化 / 最后变化楼层：证据形状 + 没变化别改 + 楼层号不是幕计数');
{
  ok('提示词提到「最后变化」', SYSTEM_PROMPT.includes('最后变化'));
  ok('写明"没有变化就别改它"（否则伪造刚动过）', SYSTEM_PROMPT.includes('没有变化就别改它'));
  ok('写明伪造会让面板失真', SYSTEM_PROMPT.includes('伪造'));
  ok('写明「最后变化楼层」是楼层号不是幕计数', SYSTEM_PROMPT.includes('楼层号, 不是幕计数'));
}

console.log('\n[4] 对照组：**不许**在 提醒.ts 里加这三条的规则（红=有人顺手加了）');
{
  const 提醒源 = readFileSync('src/剧情导演/提醒.ts', 'utf8');
  check('提醒.ts 不含「距上次高潮楼层」（它只该活在提示词与面板里）', 提醒源.includes('距上次高潮楼层'), false);
  check('提醒.ts 不含「误导证据」', 提醒源.includes('误导证据'), false);
  check('提醒.ts 不含「最后变化」', 提醒源.includes('最后变化'), false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
