// 彼方 · 工具通道(K2) 的用例 —— 批次: 请求通道改造·功能二(方案 §12–§20)。
//
// 覆盖四类:
//   [A] 回包取正文: 工具参数优先 / 正文兜底 / 两者都像载荷取更长 / 参数非法时落正文(验收 T1–T5)
//   [B] 工具定义: 不含随机量、description 只有一句话、tool_choice 是对象形式(P2-7 / §12.3)
//   [C] 请求构造与开关矩阵: 四组合都不崩、工具通道开时流式被强制关(§13.4 / §11.1)
//   [D] 报错: 工具类失败说死原因和动作(G3/G4)、与接口故障分得开、全关时逐字节不变(G2)
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import {
    建工具定义,
    建工具选择,
    取回包正文,
    是工具通道拒绝,
    工具通道失败提示,
    工具空回包提示,
    工具名,
} from '../src/彼方_NPC幕后生命状态系统/工具通道';
import { 新建请求态 } from '../src/彼方_NPC幕后生命状态系统/请求归属';
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

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 回包取正文: 工具参数优先 / 正文兜底 / 取更长 (验收 T1–T5)');
{
  // T1 正常工具调用: 只有 arguments
  const t1 = 取回包正文({ 工具参数: '{"NPC":{}}', 正文: '' });
  eq('[A/T1] 只有 arguments → 走工具参数', t1.来源, '工具参数');
  eq('[A/T1] 原文原样交出(不在这里二次 parse)', t1.文本, '{"NPC":{}}');

  // T2 纯 content: 网关不认 tool_choice 退化成 auto 时的活路
  const t2 = 取回包正文({ 工具参数: undefined, 正文: '{"NPC":{"甲":{}}}' });
  eq('[A/T2] tool_calls 缺失 → content 兜底', t2.来源, '正文');
  eq('[A/T2] 兜底文本正确', t2.文本, '{"NPC":{"甲":{}}}');

  // T3 双份并存且不等长 → 取更长的那个(两份都能解析时)
  const 短 = '{"NPC":{}}';
  const 长 = '{"NPC":{"甲":{"当前在做":"做饭"},"乙":{"当前在做":"看书"}}}';
  const t3a = 取回包正文({ 工具参数: 短, 正文: 长 });
  eq('[A/T3] 正文更长 → 取正文', t3a.来源, '正文');
  eq('[A/T3] 取到的是更长那份', t3a.文本, 长);
  const t3b = 取回包正文({ 工具参数: 长, 正文: 短 });
  eq('[A/T3] 参数更长 → 取参数', t3b.来源, '工具参数');
  eq('[A/T3] 取到的是更长那份(反向)', t3b.文本, 长);

  // T4 两者皆空
  const t4 = 取回包正文({ 工具参数: '', 正文: '' });
  eq('[A/T4] 两者皆空 → 来源=无', t4.来源, '无');
  eq('[A/T4] 两者皆空 → 文本为空', t4.文本, '');

  // T5 arguments 坏 JSON 但 content 合法 → 必须落 content, 不能被"取更长"压掉
  const t5 = 取回包正文({ 工具参数: '{"NPC":{"甲":{ 坏掉了', 正文: '{"NPC":{}}' });
  eq('[A/T5] arguments 非法 → 落正文兜底', t5.来源, '正文');
  eq('[A/T5] 交出的是合法的那份', t5.文本, '{"NPC":{}}');

  // T5 反向: arguments 合法但 content 是散文 → 不能被更长的散文压掉
  const 散文 = '好的，这是本轮的状态更新结果，我已经按你的要求把所有 NPC 都写进去了，请查收。';
  const t5b = 取回包正文({ 工具参数: '{"NPC":{}}', 正文: 散文 });
  eq('[A/T5] 散文更长但不可解析 → 仍取参数', t5b.来源, '工具参数');
  ok('[A/T5] 散文没把合法参数压掉', t5b.文本 === '{"NPC":{}}');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 工具定义: 不含随机量 / description 一句话 / tool_choice 对象 (P2-7 / §12.3)');
{
  const 定义 = 建工具定义();
  const 定义文本 = JSON.stringify(定义);
  eq('[B] 只带一个工具', 定义.length, 1);
  ok('[B] 工具名正确', 定义[0].function.name === 工具名, 定义[0].function.name);
  eq('[B] 工具类型是 function', 定义[0].type, 'function');
  ok('[B] description 是一句话(不含整份上下文)', 定义[0].function.description!.length < 60, `长度 ${定义[0].function.description!.length}`);
  // 两次构造必须逐字节相同 —— 否则前缀每轮都变
  eq('[B/P2-7] 两次构造的工具定义逐字节相同', JSON.stringify(建工具定义()), 定义文本);
  ok('[B/P2-7] 工具定义里没有打散标记的痕迹', !定义文本.includes('请求标识'));

  // 参数 schema 只约束到"顶层有 NPC"这一层, 不写死字段类型
  const 参数 = 定义[0].function.parameters!;
  eq('[B] parameters 是 object', 参数.type, 'object');
  ok('[B] 有 NPC 属性', !!参数.properties?.NPC);
  ok('[B] 有剧情时间属性', !!参数.properties?.['剧情时间']);
  ok('[B] 有移除NPC属性', !!参数.properties?.['移除NPC']);
  // 刻意不写 required: 一轮"什么都没变"的合法输出就是 {"NPC":{}}
  eq('[B] 不写 required(空变化的轮次不能被 schema 拦下)', 参数.required, undefined);
  // NPC 卡逐字段声明 + additionalProperties:false(W2 收紧, 详见 bifang-名字归一.test.ts 的 [D])
  const NPC卡 = 参数.properties?.NPC?.additionalProperties;
  eq('[B] NPC 卡这一层 additionalProperties:false', NPC卡?.additionalProperties, false);
  ok('[B] NPC 卡逐字段声明(不是自由对象)', Object.keys(NPC卡?.properties ?? {}).length > 0);

  // tool_choice 必须是对象形式(老网关支持面更宽 / Gemini 原生源才带 allowedFunctionNames)
  const 选择 = 建工具选择();
  eq('[B] tool_choice 是对象不是字符串', typeof 选择, 'object');
  eq('[B] tool_choice 指向同一个工具', 选择.function.name, 工具名);
  eq('[B] tool_choice 类型是 function', 选择.type, 'function');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 请求构造与开关矩阵 (§13.4 / §11.1)');
{
  async function 跑一次(接口设置: Record<string, any>) {
    setActivePinia(createPinia());
    const { host, 记 } = 彼方假宿主({ 模型回复: ['{"NPC":{}}'] });
    Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, 接口设置);
    let 错误: unknown = null;
    try {
      await chatCompletion(host as any, [
        { role: 'system', content: '系统指令' },
        { role: 'user', content: '正文' },
      ]);
    }
    catch (e) {
      错误 = e;
    }
    return { 请求: 记.rawCalls[0], 错误 };
  }

  // 四组合: 不崩、开关各自生效
  for (const [工具, 打散] of [[false, false], [true, false], [false, true], [true, true]] as Array<[boolean, boolean]>) {
    const { 请求, 错误 } = await 跑一次({ 工具通道: 工具, 请求打散: 打散 });
    const 标签 = `工具=${工具} 打散=${打散}`;
    ok(`[C] ${标签}: 不崩`, 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 120) : '');
    ok(`[C] ${标签}: 发出了一次请求`, !!请求);
    if (!请求)
      continue;
    eq(`[C] ${标签}: tools 数量`, Array.isArray(请求.tools) ? 请求.tools.length : 0, 工具 ? 1 : 0);
    ok(`[C] ${标签}: tool_choice 跟随工具通道`, 工具 ? !!请求.tool_choice : 请求.tool_choice === undefined);
    const 全文 = JSON.stringify(请求.ordered_prompts);
    ok(`[C] ${标签}: 打散标记跟随请求打散`, 全文.includes('请求标识') === 打散);
    // 工具通道开 → 流式必须被强制关掉
    eq(`[C] ${标签}: should_stream`, 请求.should_stream, false);
    // 上下文仍留在 messages 里(§12.1: (b) 搬位置不做)。
    // 注意: 末条 user 会被抽成 user_input 传进 generateRaw(既有行为), 所以要两处一起看。
    const 请求全文 = `${JSON.stringify(请求.ordered_prompts)}${String(请求.user_input ?? '')}`;
    ok(`[C] ${标签}: 上下文仍在 messages`, 请求全文.includes('系统指令') && 请求全文.includes('正文'), 请求全文.slice(0, 120));
    // P2-7: 标记不进 tools
    if (工具 && 打散)
      ok('[C] 工具通道+打散: 标记没进 tools', !JSON.stringify(请求.tools).includes('请求标识'));
    // §12.1: 上下文不搬进 description —— 工具描述必须很短, 不能包含正文
    if (工具)
      ok('[C] 工具 description 里没有本轮正文', !JSON.stringify(请求.tools).includes('系统指令'), JSON.stringify(请求.tools).slice(0, 200));
  }

  // 工具通道关但用户开了流式 → 流式照旧生效(不能被工具通道的门控误伤)
  const 流式 = await 跑一次({ 工具通道: false, 请求打散: false, 流式: true });
  eq('[C] 工具通道关 + 用户开流式 → 流式生效', 流式.请求.should_stream, true);

  // 工具通道开 + 用户开流式 → 流式被强制关
  const 强制 = await 跑一次({ 工具通道: true, 请求打散: false, 流式: true });
  eq('[C] 工具通道开 + 用户开流式 → 强制关', 强制.请求.should_stream, false);

  // 回包走工具参数: 返回 GenerateDetailedResult 形态时也要取到
  setActivePinia(createPinia());
  {
    const { host, 记 } = 彼方假宿主();
    Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, { 工具通道: true });
    // 把假宿主的返回值改成"详情对象"(真实 generateRaw 在带 tool_calls 时的形态)
    (host as any).model.raw = async (cfg: any) => {
      记.rawCalls.push(cfg);
      return { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 工具名, arguments: '{"NPC":{"甲":{"当前在做":"做饭"}}}' } }] };
    };
    const 结果 = await chatCompletion(host as any, [{ role: 'user', content: '正文' }]);
    eq('[C] GenerateDetailedResult → 从 tool_calls.arguments 取到正文', 结果, '{"NPC":{"甲":{"当前在做":"做饭"}}}');
  }

  // 工具通道关 + 详情对象里只有 content → 老路径照旧
  setActivePinia(createPinia());
  {
    const { host } = 彼方假宿主();
    (host as any).model.raw = async () => ({ content: '{"NPC":{}}' });
    const 结果 = await chatCompletion(host as any, [{ role: 'user', content: '正文' }]);
    eq('[C] 工具通道关 → 详情对象的 content 照旧能取', 结果, '{"NPC":{}}');
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] 报错: 原因+动作(G3) / 原因二分(G4) / 全关逐字节(G2)');
{
  // G4: 工具通道被拒 vs 接口本身出错 —— 两条文案必须能分开
  const 拒 = 工具通道失败提示('400 invalid tool_choice');
  ok('[D/G4] 被拒文案说"不被支持"', 拒.includes('不被当前接口支持'), 拒);
  ok('[D/G4] 被拒文案给出动作(关开关)', 拒.includes('关闭「工具通道」开关'), 拒);
  ok('[D/G4] 被拒文案带上接口原文', 拒.includes('400 invalid tool_choice'), 拒);
  ok('[D/G4] 被拒文案明确排除"接口故障"', 拒.includes('不是接口故障'), 拒);
  ok('[D/G4] 被拒文案与空回包文案不是同一句', 拒 !== 工具空回包提示('(细节)'));
  const 空 = 工具空回包提示('(工具参数=无, 正文=0 字)');
  ok('[D/G3] 空回包文案指出可能不认 tool_choice', 空.includes('tool_choice'), 空);
  ok('[D/G3] 空回包文案给出动作', 空.includes('关闭「工具通道」开关'), 空);

  // 判据本体: 4xx + 工具关键词才算"不认工具通道"
  ok('[D] 400 + tool → 是', 是工具通道拒绝({ status: 400, message: 'invalid tool_choice' }));
  ok('[D] 400 + function → 是', 是工具通道拒绝({ status: 400, message: 'function calling unsupported' }));
  ok('[D] 400 + signature → 是', 是工具通道拒绝({ status: 400, message: 'thought signature required' }));
  ok('[D] 401 密钥错 → 不是', !是工具通道拒绝({ status: 401, message: 'invalid api key' }));
  ok('[D] 404 模型不存在 → 不是', !是工具通道拒绝({ status: 404, message: 'model not found' }));
  ok('[D] 500 服务器错 → 不是', !是工具通道拒绝({ status: 500, message: 'internal error in tool runtime' }));
  ok('[D] 超时(无状态码) → 不是', !是工具通道拒绝(Error('Gateway timeout')));
  ok('[D] 转发路径的字符串错误(含 HTTP 400 + tools) → 是', 是工具通道拒绝(Error('HTTP 400: tools is not supported')));
  ok('[D] 转发路径的字符串错误(HTTP 500 + tools) → 不是', !是工具通道拒绝(Error('HTTP 500: tool runtime crashed')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 端到端: 工具通道开/关两条路的错误文案');
{
  async function 报错文本(接口设置: Record<string, any>, 抛什么: () => any) {
    setActivePinia(createPinia());
    const { host } = 彼方假宿主();
    Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, 接口设置);
    (host as any).model.raw = async () => {
      throw 抛什么();
    };
    try {
      await chatCompletion(host as any, [{ role: 'user', content: '正文' }]);
      return '(没报错)';
    }
    catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  // G2 全关: 工具类 400 走老文案(通过酒馆服务器请求失败), 不带任何归属
  const 关文案 = await 报错文本({ 工具通道: false }, () => Error('HTTP 400: tools is not supported'));
  ok('[E/G2] 全关 + 工具类 400 → 老文案', 关文案.includes('通过酒馆服务器请求失败'), 关文案);
  ok('[E/G2] 全关 → 不含功能归属', !关文案.includes('功能归属'), 关文案);
  ok('[E/G2] 全关 → 不含"工具通道"字样', !关文案.includes('工具通道'), 关文案);

  // G3/G4 工具通道开: 同一类错误必须说死原因和动作 + 带归属
  const 开文案 = await 报错文本({ 工具通道: true }, () => Error('HTTP 400: tools is not supported'));
  ok('[E/G3] 工具通道开 + 工具类 400 → 说"不被支持"', 开文案.includes('不被当前接口支持'), 开文案);
  ok('[E/G3] 工具通道开 → 给出动作', 开文案.includes('关闭「工具通道」开关'), 开文案);
  ok('[E/G1] 工具通道开 → 带功能归属', 开文案.includes('【功能归属】'), 开文案);
  ok('[E/G1] 归属含路径=转发', 开文案.includes('路径=转发'), 开文案);

  // G4: 工具通道开但错误与工具无关(密钥错) → 走老文案, 不能被误导成"关开关就好"
  const 密钥文案 = await 报错文本({ 工具通道: true }, () => Error('HTTP 401: invalid api key'));
  ok('[E/G4] 工具通道开 + 401 → 不说是工具通道问题', !密钥文案.includes('不被当前接口支持'), 密钥文案);
  ok('[E/G4] 工具通道开 + 401 → 仍是老文案', 密钥文案.includes('通过酒馆服务器请求失败'), 密钥文案);
  ok('[E/G1] 但归属仍在(用户要知道当时开了什么)', 密钥文案.includes('工具通道=开'), 密钥文案);

  // 空回包: 工具通道开且回包什么都没有
  setActivePinia(createPinia());
  {
    const { host } = 彼方假宿主();
    Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, { 工具通道: true });
    (host as any).model.raw = async () => ({ content: '', tool_calls: [] });
    let 文本 = '';
    try {
      await chatCompletion(host as any, [{ role: 'user', content: '正文' }]);
    }
    catch (e) {
      文本 = e instanceof Error ? e.message : String(e);
    }
    ok('[E] 工具通道开 + 空回包 → 专用文案', 文本.includes('没有拿到可用的状态 JSON'), 文本);
    ok('[E] 空回包文案带归属', 文本.includes('【功能归属】'), 文本);
  }

  // 全关 + 空回包 → 必须还是原来那句(逐字节)
  setActivePinia(createPinia());
  {
    const { host } = 彼方假宿主();
    (host as any).model.raw = async () => ({ content: '' });
    let 文本 = '';
    try {
      await chatCompletion(host as any, [{ role: 'user', content: '正文' }]);
    }
    catch (e) {
      文本 = e instanceof Error ? e.message : String(e);
    }
    const 原句 = '响应中没有找到有效的正文内容(模型=fake-model, 最大token=60000, 方式=酒馆转发)。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。';
    eq('[E/G2] 全关 + 空回包(无正文) → 与现状逐字节一致', 文本, 原句);
  }

  // G2 三处点名出口的第二处: 超时
  {
    const 超时文案 = await 报错文本({ 工具通道: false }, () => Error('Gateway timeout'));
    const 原句 = '生成超时(可能是推理模型的思考时间过长, 或接口负载高)。可调小「最大输出Token」或换更快的模型后重试。原始错误: Gateway timeout';
    eq('[E/G2] 全关 + 超时 → 与现状逐字节一致', 超时文案, 原句);
  }

  // G2 三处点名出口的第三处: 转发失败
  {
    const 失败文案 = await 报错文本({ 工具通道: false }, () => Error('some weird upstream failure'));
    const 原句 = '通过酒馆服务器请求失败(模型=fake-model, 最大token=60000, 方式=酒馆转发): some weird upstream failure';
    eq('[E/G2] 全关 + 转发失败 → 与现状逐字节一致', 失败文案, 原句);
  }

  // 同一处出口, 开关打开后必须多出归属(证明 G1 不是只加在一个出口上)
  {
    const 超时开 = await 报错文本({ 工具通道: true }, () => Error('Gateway timeout'));
    ok('[E/G1] 超时 + 工具通道开 → 带归属', 超时开.includes('【功能归属】'), 超时开);
    ok('[E/G1] 超时 + 工具通道开 → 老文案仍完整', 超时开.includes('生成超时'), 超时开);
    const 失败开 = await 报错文本({ 工具通道: true }, () => Error('some weird upstream failure'));
    ok('[E/G1] 转发失败 + 工具通道开 → 带归属', 失败开.includes('【功能归属】'), 失败开);
    ok('[E/G1] 转发失败 + 工具通道开 → 老文案仍完整', 失败开.includes('通过酒馆服务器请求失败'), 失败开);
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
