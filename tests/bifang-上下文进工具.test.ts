// 彼方 · W4 上下文进工具(第三个开关) —— 批次: 第二轮(方案 §24 W4)。
//
// 用户拍板做了，做成第三个开关，默认关，与「工具通道」独立。
//
// 覆盖:
//   [A] 关 = 现状: 上下文留在 messages, 工具说明只有一句话
//   [B] 开 = 上下文搬进工具说明, messages 只剩一句指令
//   [C] 边界: 上下文进工具开、工具通道关 → 开关无效, 但**明确提示**(不许静默)
//   [D] 四种组合都不崩; 打散标记不得进工具说明(P2-7 扩到第三个开关)
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { 建工具定义 } from '../src/彼方_NPC幕后生命状态系统/工具通道';
import { chatCompletion } from '../src/彼方_NPC幕后生命状态系统/api';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 备注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  FAIL ${名}${备注 ? `  (${备注})` : ''}`);
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
    console.log(`  FAIL ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 抓控制台 warn(用于断言"无效时必须提示") */
function 抓警告<T>(fn: () => Promise<T>): Promise<{ 结果: T; 警告: string[] }> {
  const 原文 = console.warn;
  const 警告: string[] = [];
  console.warn = (...args: any[]) => { 警告.push(args.map(String).join(' ')); };
  return fn().then(结果 => ({ 结果, 警告 })).finally(() => { console.warn = 原文; });
}

async function 跑一次(接口设置: Record<string, any>) {
  setActivePinia(createPinia());
  const { host, 记 } = 彼方假宿主({ 模型回复: ['{"NPC":{}}'] });
  Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, 接口设置);
  let 错误: unknown = null;
  const { 警告 } = await 抓警告(async () => {
    try {
      await chatCompletion(host as any, [
        { role: 'system', content: '系统指令' },
        { role: 'user', content: '这是一段剧情正文' },
      ]);
    }
    catch (e) {
      错误 = e;
    }
  });
  return { 请求: 记.rawCalls[0], 错误, 警告 };
}

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 关 = 现状: 上下文留在 messages, 工具说明一句话');
{
  const { 请求, 错误 } = await 跑一次({ 工具通道: true, 上下文进工具: false });
  ok('[A] 不崩', 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 120) : '');
  const 全文 = `${JSON.stringify(请求.ordered_prompts)}${String(请求.user_input ?? '')}`;
  ok('[A] 上下文在 messages 里', 全文.includes('这是一段剧情正文'), 全文.slice(0, 150));
  const 描述 = 请求.tools[0].function.description;
  ok('[A] 工具说明是一句话(< 60 字)', 描述.length < 60, `长度 ${描述.length}`);
  ok('[A] 工具说明里没有剧情正文', !描述.includes('这是一段剧情正文'), 描述);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 开 = 上下文搬进工具说明, messages 只剩一句指令');
{
  const { 请求, 错误 } = await 跑一次({ 工具通道: true, 上下文进工具: true });
  ok('[B] 不崩', 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 120) : '');
  const 描述 = 请求.tools[0].function.description;
  ok('[B] 工具说明里含系统指令', 描述.includes('系统指令'), 描述.slice(0, 200));
  ok('[B] 工具说明里含剧情正文', 描述.includes('这是一段剧情正文'), 描述.slice(0, 200));
  ok('[B] 工具说明变长了', 描述.length > 建工具定义()[0].function.description!.length, `长度 ${描述.length} vs 基线 ${建工具定义()[0].function.description!.length}`);

  // messages 只剩一句无害指令 —— 上下文不能发两遍
  const messages  = 请求.ordered_prompts;
  const 全部 = `${JSON.stringify(messages)}${String(请求.user_input ?? '')}`;
  ok('[B] messages 里没有剧情正文', !全部.includes('这是一段剧情正文'), 全部.slice(0, 200));
  ok('[B] messages 里没有系统指令原文', !全部.includes('系统指令'), 全部.slice(0, 200));
  ok('[B] messages 里有一句请求', 全部.includes('请按工具说明'), 全部.slice(0, 200));
  // 转发路径会把末条 user 抽成 user_input, 所以它应该在 user_input 里
  eq('[B] 末条 user 被抽成 user_input', String(请求.user_input ?? '').includes('请按工具说明'), true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 边界: 上下文进工具开、工具通道关 → 无效但必须明确提示');
{
  const { 请求, 错误, 警告 } = await 跑一次({ 工具通道: false, 上下文进工具: true });
  ok('[C] 不崩(不能因为开关组合报错)', 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 120) : '');
  eq('[C] 请求里没有 tools', 请求.tools, undefined);
  // 上下文必须仍在 messages 里(不能因为开关开着就把内容搬走却没地方放)
  const 全文 = `${JSON.stringify(请求.ordered_prompts)}${String(请求.user_input ?? '')}`;
  ok('[C] 上下文仍在 messages 里', 全文.includes('这是一段剧情正文'), 全文.slice(0, 150));
  // 必须明确提示, 不许静默
  const 有提示 = 警告.some(w => w.includes('上下文进工具') && w.includes('不生效'));
  ok('[C] 明确提示"不生效"(不许静默)', 有提示, 警告.join(' | ').slice(0, 300));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] 四组合都不崩; 打散标记不得进工具说明(P2-7)');
{
  for (const [工具, 上下文, 打散] of [
    [false, false, false],
    [true, false, false],
    [true, true, false],
    [true, true, true],
    [false, true, true],
  ] as Array<[boolean, boolean, boolean]>) {
    const 标签 = `工具=${工具} 上下文=${上下文} 打散=${打散}`;
    const { 请求, 错误 } = await 跑一次({ 工具通道: 工具, 上下文进工具: 上下文, 请求打散: 打散 });
    ok(`[D] ${标签}: 不崩`, 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 120) : '');
    ok(`[D] ${标签}: 发出了请求`, !!请求);
    if (!请求)
      continue;
    // P2-7 扩到第三个开关: 打散标记绝不许进工具说明
    if (工具 && 打散) {
      ok(`[D] ${标签}: 标记没进工具说明`, !JSON.stringify(请求.tools).includes('请求标识'), JSON.stringify(请求.tools).slice(0, 200));
      // 而它必须在 messages 里(否则打散没生效)
      const 全文 = `${JSON.stringify(请求.ordered_prompts)}${String(请求.user_input ?? '')}`;
      ok(`[D] ${标签}: 标记在 messages 里`, 全文.includes('请求标识'), 全文.slice(0, 200));
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 工具说明里塞上下文时的稳定性');
{
  // 同一份上下文 → 两次构造逐字节相同(前缀是否命中缓存取决于它, 不该再有别的随机源)
  const 上下文 = '系统指令\n\n这是一段剧情正文';
  eq('[E] 同一份上下文 → 两次构造逐字节相同',
    JSON.stringify(建工具定义(上下文)), JSON.stringify(建工具定义(上下文)));
  // 空上下文 → 与不传参等价(默认关时行为一字不变)
  eq('[E] 空串等价于不传参', JSON.stringify(建工具定义('')), JSON.stringify(建工具定义()));
  // 有上下文时, 说明以原有一句话开头(便于在抓包里认出是同一个工具)
  const 描述 = 建工具定义(上下文)[0].function.description;
  ok('[E] 说明以原有一句话开头', 描述.startsWith('把本轮 NPC 幕后状态与剧情时间写入缓冲区'), 描述.slice(0, 80));
  // parameters 不受上下文影响(W2 的收紧不该被 W4 破坏)
  eq('[E] parameters 不随上下文变化',
    JSON.stringify(建工具定义(上下文)[0].function.parameters),
    JSON.stringify(建工具定义()[0].function.parameters));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
