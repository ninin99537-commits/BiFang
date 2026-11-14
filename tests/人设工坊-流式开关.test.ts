// 人设工坊 · 流式开关(2026-10-15 用户要求非流)
//
// 判据:
//   1. ★ **两个状态都测** —— 关(默认) / 开 各一遍。
//      只测一个状态的话, "开关压根没接线"会看起来完全正常。
//      (状态类判据必须测组合状态 —— 这条纪律本项目已经栽过一次。)
//   2. 关: `should_stream === false` **且不挂 STREAM 监听器**。
//      「不挂监听器」必须**实测**(数 eventOn 调用次数), 不能只看 should_stream ——
//      挂着监听器但收不到 token 也算"能用", 只是白占一个订阅, 光看开关看不出来。
//   3. 开: `should_stream === true` **且挂了监听器**。
//   4. ★ **对照组**: 如果 eventOn 从来没被调过, 判据 2 的"0 次"就没有分辨力 ——
//      用判据 3 的"1 次"证明这个计数器是活的。
//   5. 静默生成与 generation_id 照旧 —— 「停止」不依赖流式(generate.d.ts:210-216)。
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';
import { 生成人设 } from '../src/人设工坊/lib/sink';

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

// ── 假酒馆环境 ────────────────────────────────────────────────────────────
// sink 在**调用时**读这些全局(不在 import 时读), 所以在这里装就行。
const 记录 = { raw: [] as any[], eventOn次数: 0, stop次数: 0 };
(globalThis as any).iframe_events = { STREAM_TOKEN_RECEIVED_FULLY: 'STREAM_TOKEN_RECEIVED_FULLY' };
(globalThis as any).generateRaw = async (配置: any) => {
  记录.raw.push(配置);
  return '生成结果';
};
(globalThis as any).eventOn = (_事件: string, _回调: unknown) => {
  记录.eventOn次数++;
  return { stop: () => { 记录.stop次数++; } };
};

function 造设置(流式: boolean): Settings {
  // SettingsSchema 本身就是设置对象(扁平: `.request` / `.api`), 没有 `settings` 包一层。
  // 界面里的 `设置.settings` 是 store(useSettingsStore), 不是这个类型 —— 两者别混。
  const s = SettingsSchema.parse({}) as Settings;
  s.request.stream = 流式;
  return s;
}

console.log('\n[1] 默认 = 非流式(用户要求)');
{
  const 前 = 记录.eventOn次数;
  const 前停 = 记录.stop次数;
  const 句柄 = 生成人设(造设置(false), '提示词', () => {});
  await 句柄.完成;
  const 请求 = 记录.raw.at(-1);
  check('should_stream 关', 请求.should_stream, false);
  check('★ 没挂 STREAM 监听器(实测调用次数)', 记录.eventOn次数 - 前, 0);
  check('★ 没有订阅可停, 也没多调 stop', 记录.stop次数 - 前停, 0);
  check('静默生成照旧(与流式无关)', 请求.should_silence, true);
  ok('照旧给出 generation_id(「停止」靠它, 不靠流式)',
    typeof 请求.generation_id === 'string' && 请求.generation_id.startsWith('forge-'));
  check('ordered_prompts 照旧带 user_input 占位', 请求.ordered_prompts.includes('user_input'), true);
}

console.log('\n[2] 打开 = 流式, 且真的挂了监听器');
{
  const 前 = 记录.eventOn次数;
  const 前停 = 记录.stop次数;
  const 句柄 = 生成人设(造设置(true), '提示词', () => {});
  await 句柄.完成;
  const 请求 = 记录.raw.at(-1);
  check('should_stream 开', 请求.should_stream, true);
  check('★ 挂了 STREAM 监听器(实测调用次数)', 记录.eventOn次数 - 前, 1);
  check('生成结束后把订阅停掉', 记录.stop次数 - 前停, 1);
}

console.log('\n[3] ★ 对照组: 上面那条「0 次」不是因为它压根没实现');
{
  // 若 eventOn 从头到尾没被调用过, 判据 [1] 的 "0 次" 对任何实现都成立 —— 没有分辨力。
  // [2] 已经证明计数器是活的, 两条合起来才说明「按开关决定挂不挂」。
  ok('eventOn 至少被调用过一次(否则 [1] 的 0 无意义)', 记录.eventOn次数 >= 1);
  ok('两个状态各写了一条 generateRaw(共 2 次, 说明都真跑了)', 记录.raw.length === 2);
}

console.log(`\n人设工坊流式开关: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
