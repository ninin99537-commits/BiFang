// 彼方 · 批次 3-1 规模可见 —— 断言先行(接口由需求位 #133 钉死: 文本格式与 data-bf-scale-warn 属性名)。
//
// 契约: 日志页顶部一行文本固定
//   『本轮追踪 N 个 NPC · 状态卡合计 M 字 · 世界书 W 条 / V 字 · 输入约 T token』
//   超建议线(20 NPC 或 60000 字)时该行带 data-bf-scale-warn="1"，且**请求照发**(不阻止、不截断)。
// 同源判法: N/M/W/V 不信展示值——本用例的场景是自搭的，追踪谁、卡多大、世界书开没开都是已知的真值。
// 当前必须红(实现还没落)；落地后绿。变异(把"不阻止"改成"超限跳过发送")在落地后做。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { 彼方假宿主, 种已有状态 } from './helpers/彼方假宿主';

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

const 规模行格式 = /本轮追踪 (\d+) 个 NPC · 状态卡合计 (\d+) 字 · 世界书 (\d+) 条 \/ (\d+) 字 · 输入约 (\d+) token/;

console.log('\n[1] 日志页有规模行，四个数字与场景真值同源(追踪=甲丙 → N=2；世界书关 → W=V=0)');
{
  setActivePinia(createPinia());
  const { host } = 彼方假宿主({ 模型回复: [JSON.stringify({ NPC: {} })] });
  种已有状态(host);
  await updateNpcStates(host as any);
  const 日志文本 = JSON.stringify(useDebugStore().log ?? {});
  const 行 = 日志文本.match(规模行格式);
  ok('规模行存在且格式与契约一致', !!行);
  if (行) {
    eq('N(追踪 NPC 数) 与场景真值同源', Number(行[1]), 2);
    ok('M(状态卡合计字数) 是正整数', Number(行[2]) > 0);
    eq('W/V(世界书条/字) 与设置同源(注入关 → 0)', [Number(行[3]), Number(行[4])], [0, 0]);
    ok('T(估算 token) 是正整数', Number(行[5]) > 0);
  }
}

console.log('\n[2] 超线(状态卡合计 > 60000 字) → 请求照发(不阻止、不截断)');
{
  setActivePinia(createPinia());
  const 巨卡 = { 当前在做: '做饭', 当前状态: 'x'.repeat(60001), 位置: '家', 身份锚点: '面包师' };
  const { host, 记, 楼层 } = 彼方假宿主({ 模型回复: [JSON.stringify({ NPC: {} })] });
  楼层[0].message = '（较早的剧情）';
  种已有状态(host);
  // 把甲的卡撑过 60000 字(经快照落成现有状态, 下一轮自动更新的"状态卡合计"即超线)
  const 撑大的: any = { 名单: ['甲'], NPC: { 甲: 巨卡 }, 统计: { 更新次数: 7 }, 剧情时间: '2026-01-01 20:00' };
  const { writeStateSnapshot } = await import('../src/彼方_NPC幕后生命状态系统/快照');
  writeStateSnapshot(host, 撑大的, 1, 1, false);
  await updateNpcStates(host as any);
  eq('超线也照发: 模型调用次数 = 1(不阻止)', 记.rawCalls.length, 1);
  ok('发出的请求里卡片内容没被截断', String(记.rawCalls[0]?.ordered_prompts?.map((p: any) => p.content ?? '').join('') ?? '').includes('xxxxxx'));
}

console.log('\n[3] 超线时规模行带警示标记(data-bf-scale-warn) —— 渲染层是模板, 此处用源码钉辅助(明标: 非行为证据)');
{
  const 面板源码 = (await import('../src/彼方_NPC幕后生命状态系统/日志面板.ts?raw')).default;
  ok('日志面板渲染 data-bf-scale-warn(超线警示标记)', 面板源码.includes('data-bf-scale-warn'));
  ok('标记的条件含 20/60000 两条建议线', /20/.test(面板源码) && /60000/.test(面板源码));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
