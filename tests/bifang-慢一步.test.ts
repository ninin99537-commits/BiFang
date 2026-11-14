// 彼方 · 新功能「慢一步」—— 自动更新只分析到倒数第二层(派活: reviews/派活-2026-11-15-慢一步.md §4, 断言先行)。
//
// 契约(需求位钉死): 设置键 更新.慢一步(boolean, 默认 false)；
//   开 → 自动更新的窗口在"最近 N 条可见 AI 回复"基础上**去掉最后一条**；
//   只有 1 条可用 → 跳过本轮 + 用户可见提示(文案含"至少需要两条")；手动更新(force) → 照旧到最新层。
// 收益: 还没定稿(可能被重roll)的最新回复不污染状态 —— 重roll 后状态与快照不变(场景⑥, 必须钉)。
// 场景④(频率取模)是 index.ts 自动触发路径上的判定 —— index.ts 在 node 不可导入(实证见批次2),
// 故该条用**明标的源码钉**(辅助, 非行为证据), 变异(基数改回总楼层数)由它接。
// 当前必须红(实现还没落)；落地后绿。变异: ①去掉"去掉最后一条"→[1]红；②频率基数改回总楼层数→[4]红。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { 彼方假宿主, 种已有状态, STORAGE_KEY } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

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
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 三条连续可见 AI 回复(各带特征串), 无用户楼层 —— "第 N 条"的编号与楼层号一致, 好对账 */
function 慢一步宿主(慢一步: boolean, 回复们: string[]) {
  const { host, 存, 记, 楼层 } = 彼方假宿主({ 最后楼层号: 回复们.length, 模型回复: [JSON.stringify({ NPC: {} }), JSON.stringify({ NPC: {} }), JSON.stringify({ NPC: {} })] });
  楼层.length = 0;
  回复们.forEach((文本, i) => 楼层.push({ message_id: i + 1, role: 'assistant', is_hidden: false, message: 文本 }));
  (host as any).chat.lastMessageId = () => 回复们.length;
  存.global['彼方_settings']['更新']['慢一步'] = 慢一步;
  存.global['彼方_settings']['更新']['读取最近回复数'] = 3;
  return { host, 存, 记, 楼层 };
}

console.log('\n[1] 开: 3 条可见回复 → 送进模型的正文不含第 3 条(最硬的一条: debugStore 请求文本里断言)');
{
  setActivePinia(createPinia());
  const { host, 记 } = 慢一步宿主(true, ['MARK-第一条', 'MARK-第二条', 'MARK-第三条']);
  种已有状态(host);
  await updateNpcStates(host as any);
  const 请求 = String(useDebugStore().log?.request ?? '');
  ok('请求含第 1 条', 请求.includes('MARK-第一条'));
  ok('请求含第 2 条', 请求.includes('MARK-第二条'));
  ok('请求不含第 3 条(慢一步咬住)', !请求.includes('MARK-第三条'));
  eq('模型调用 1 次', 记.rawCalls.length, 1);
}

console.log('\n[2] 关: 3 条 → 3 条都在(对照)');
{
  setActivePinia(createPinia());
  const { host } = 慢一步宿主(false, ['MARK-第一条', 'MARK-第二条', 'MARK-第三条']);
  种已有状态(host);
  await updateNpcStates(host as any);
  const 请求 = String(useDebugStore().log?.request ?? '');
  ok('关: 请求含全部三条', 请求.includes('MARK-第一条') && 请求.includes('MARK-第二条') && 请求.includes('MARK-第三条'));
}

console.log('\n[3] 开 + 只有 1 条 → 不发请求 + 用户可见提示(文案含"至少需要两条")');
{
  setActivePinia(createPinia());
  const { host, 记 } = 慢一步宿主(true, ['只有这一条']);
  (host as any).chat.lastMessageId = () => 1;
  种已有状态(host);
  const 收集: string[] = [];
  const 原warn = console.warn;
  const 原error = console.error;
  const 原info = console.info;
  console.warn = (...a: any[]) => 收集.push(a.map(String).join(' '));
  console.error = (...a: any[]) => 收集.push(a.map(String).join(' '));
  console.info = (...a: any[]) => 收集.push(a.map(String).join(' '));
  try {
    await updateNpcStates(host as any);
  }
  finally {
    console.warn = 原warn;
    console.error = 原error;
    console.info = 原info;
  }
  eq('没发请求(跳过 = 连模型都不碰)', 记.rawCalls.length, 0);
  const 日志文本 = JSON.stringify(useDebugStore().log ?? {});
  ok('有用户可见提示且含"至少需要两条"(console 或 日志页)', 收集.some(s => s.includes('至少需要两条')) || 日志文本.includes('至少需要两条'));
}

console.log('\n[4] 频率取模按可分析层数(可见 4 条 + 频率 2 → 第 3 条时触发) —— index.ts 不可导入, 源码钉辅助(明标: 非行为证据)');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源码 = readFileSync(path.join('src', '彼方_NPC幕后生命状态系统', 'index.ts'), 'utf8');
  // 契约: 频率取模的分母是 可分析层数(可见数 − 慢一步的 1), 不是总楼层数
  const 频率段 = (源码.match(/const frequency[\s\S]{0,400}?assistantCount[\s\S]{0,200}?%/) ?? [''])[0];
  ok('频率段存在', 频率段.length > 0);
  ok('分母用了可分析层数(减去慢一步的 1), 不是总楼层数', /-\s*1/.test(频率段));
}

console.log('\n[5] 快照锚点: 开 → 楼层变量写在第 2 条楼层, 不是第 3 条');
{
  setActivePinia(createPinia());
  const { host, 存 } = 慢一步宿主(true, ['MARK-第一条', 'MARK-第二条', 'MARK-第三条']);
  种已有状态(host);
  await updateNpcStates(host as any);
  ok('快照写进第 2 条楼层(被分析的最后一条)', 存.message[2]?.[STORAGE_KEY] !== undefined);
  ok('第 3 条楼层没有快照(它没参与分析)', 存.message[3]?.[STORAGE_KEY] === undefined);
}

console.log('\n[6] 重roll: 开 + 重roll 最新层 → 状态与快照不变(本功能的收益, 必须钉)');
{
  setActivePinia(createPinia());
  const { host, 存, 记, 楼层 } = 慢一步宿主(true, ['MARK-第一条', 'MARK-第二条', 'MARK-第三条']);
  种已有状态(host);
  await updateNpcStates(host as any);
  const 重roll前快照 = JSON.stringify(存.message[2]?.[STORAGE_KEY]);
  // 重roll: 最新层(第 3 条)内容被重新生成 —— 慢一步下它根本不进分析窗口
  楼层[2].message = 'MARK-重roll后的新剧情';
  await updateNpcStates(host as any);
  const 请求 = String(useDebugStore().log?.request ?? '');
  ok('重roll后的新内容没进分析窗口(状态不可能被它污染)', !请求.includes('MARK-重roll后的新剧情'));
  eq('重roll后快照与重roll前逐字节一致', JSON.stringify(存.message[2]?.[STORAGE_KEY]), 重roll前快照);
  ok('第 3 条楼层依旧没有快照', 存.message[3]?.[STORAGE_KEY] === undefined);
  ok('分析仍照常进行(每轮都有请求, 只是窗口慢一步)', 记.rawCalls.length === 2);
}

console.log('\n[7] 手动更新: 开 + force → 仍然分析到最新层');
{
  setActivePinia(createPinia());
  const { host, 记 } = 慢一步宿主(true, ['MARK-第一条', 'MARK-第二条', 'MARK-第三条']);
  种已有状态(host);
  await updateNpcStates(host as any, true);
  const 请求 = String(useDebugStore().log?.request ?? '');
  ok('force: 请求含第 3 条(点了就是"现在要")', 请求.includes('MARK-第三条'));
  ok('force: 前两条也在', 请求.includes('MARK-第一条') && 请求.includes('MARK-第二条'));
  eq('模型调用 1 次', 记.rawCalls.length, 1);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
