// 一次性探针: 删锚点路径之前, 必须确认「自定义段」在**所有真实路径**上都被迁走了。
//
// 风险假设:
//   `条目转模板` 只在 `模板` 为空时才跑（否则会盖掉用户手改的模板）。
//   那么：若用户**已经有模板**、同时**还有非空的自定义段**，
//   自定义段就永远不会被迁走 —— 删掉锚点路径后，它的内容**静默丢失**。
//
// 这个组合在真实数据里可能出现吗？三种入口逐一验：
//   A. 首次加载（老用户：只有自定义段，没有模板）
//   B. 首次加载（老用户：有自定义段 + 已有条目，没有模板）
//   C. 已经迁移过一轮（模板已有），但自定义段又出现了
//      —— 什么情况下会再出现？只有用户手改 settings，或**回滚到旧版本再升级**。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-migrate-chain.ts');
const 产物 = path.join(此处, '_probe-migrate-chain.mjs');

const 源码 = [
  "import { 迁移旧段, 条目转模板 } from '../../src/彼方_NPC幕后生命状态系统/条目列表';",
  "",
  "/** 模拟 migrateSettings 里那两步（顺序与实际一致） */",
  "function 跑迁移(提示词) {",
  "  const 段数 = 迁移旧段(提示词);",
  "  const 条数 = 条目转模板(提示词);",
  "  return { 段数, 条数 };",
  "}",
  "",
  "const 有内容 = (提示词) => {",
  "  const 模板 = Array.isArray(提示词.模板) ? 提示词.模板 : [];",
  "  const 模板含标记 = 模板.some(段 => String(段?.content ?? '').includes('旧段标记'));",
  "  const 条目还有 = (提示词.条目 ?? []).length;",
  "  const 段还有 = (提示词.自定义段 ?? []).length;",
  "  return { 模板含标记, 条目还有, 段还有 };",
  "};",
  "",
  "console.log('=== A. 老用户：只有自定义段，没有模板（最常见）===');",
  "{",
  "  const 提示词 = { 自定义段: [{ 锚点: '最后', role: 'system', content: '旧段标记' }] };",
  "  const r = 跑迁移(提示词);",
  "  console.log('  迁移结果:', JSON.stringify(r));",
  "  console.log('  状态:', JSON.stringify(有内容(提示词)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== B. 有自定义段 + 已有条目，没有模板 ===');",
  "{",
  "  const 提示词 = {",
  "    自定义段: [{ 锚点: '最后', role: 'system', content: '旧段标记' }],",
  "    条目: [{ id: 'u1', role: 'user', content: '我手写的条目' }],",
  "    条目顺序: ['u1'],",
  "  };",
  "  const r = 跑迁移(提示词);",
  "  console.log('  迁移结果:', JSON.stringify(r));",
  "  console.log('  状态:', JSON.stringify(有内容(提示词)));",
  "  const 模板 = 提示词.模板 ?? [];",
  "  console.log('  模板里有手写条目?', 模板.some(s => String(s?.content ?? '').includes('我手写的条目')));",
  "}",
  "",
  "console.log('');",
  "console.log('=== C. 已经有模板 + 又出现自定义段（回滚后升级 / 手改 settings）===');",
  "{",
  "  const 提示词 = {",
  "    模板: [{ id: 'x', role: 'user', content: '我改过的模板' }],",
  "    自定义段: [{ 锚点: '最后', role: 'system', content: '旧段标记' }],",
  "  };",
  "  const r = 跑迁移(提示词);",
  "  console.log('  迁移结果:', JSON.stringify(r));",
  "  console.log('  状态:', JSON.stringify(有内容(提示词)));",
  "  console.log('  ⚠ 若 段还有 > 0 → 删锚点路径后这部分内容会**静默丢失**');",
  "}",
  "",
  "console.log('');",
  "console.log('=== D. 幂等性: 连跑两遍 ===');",
  "{",
  "  const 提示词 = { 自定义段: [{ 锚点: '最后', role: 'system', content: '旧段标记' }] };",
  "  跑迁移(提示词);",
  "  const 第一遍 = JSON.stringify(提示词);",
  "  跑迁移(提示词);",
  "  console.log('  第二遍后数据不变?', JSON.stringify(提示词) === 第一遍);",
  "}",
  "",
  "console.log('');",
  "console.log('=== E. 自定义段里写的是**占位符**时（旧「零件位置」迁移的产物）===');",
  "{",
  "  const 提示词 = { 自定义段: [{ 锚点: '最前', role: 'system', content: '{{彼方:世界书}}' }] };",
  "  跑迁移(提示词);",
  "  const 模板 = 提示词.模板 ?? [];",
  "  const 全 = 模板.map(s => String(s?.content ?? '')).join('\\n');",
  "  console.log('  模板里有 {{彼方:世界书}}?', 全.includes('{{彼方:世界书}}'));",
  "  console.log('  自定义段已清空?', (提示词.自定义段 ?? []).length === 0);",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
