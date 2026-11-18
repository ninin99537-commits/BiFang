// 彼方 · 请求打散(K1) 与 请求归属 —— 批次: 请求通道改造·功能一。
//
// 覆盖三类:
//   [A] 打散标记本身: 形态 / 位置 / 不改入参 / 每次不同(验收 P1-4)
//   [B] 请求构造: 开关开时标记进 system 末尾、关时逐字节不变(验收 G2 的请求侧)
//   [C] 归属文案: 全关时为空(G2)、开时三要素齐全(G1)、每次请求一条日志(P1-5)
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { 加打散标记, 生成打散标记 } from '../src/彼方_NPC幕后生命状态系统/请求打散';
import { 新建请求态, 归属标记, 请求日志 } from '../src/彼方_NPC幕后生命状态系统/请求归属';
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
console.log('\n[A] 打散标记: 形态 / 位置 / 不改入参 / 每次不同 (P1-4)');
{
  const 标记 = 生成打散标记();
  ok('[A] 标记带明确包裹', /^\[请求标识 [a-z0-9]{12}\]$/.test(标记), 标记);

  const 基线 = [
    { role: 'system', content: '系统指令' },
    { role: 'user', content: '正文' },
  ];
  const 甲 = 加打散标记(基线, 标记);
  ok('[A] 标记追加在 system 末尾', 甲[0].content.endsWith(标记), 甲[0].content);
  ok('[A] system 原有内容没被动', 甲[0].content.startsWith('系统指令'));
  eq('[A] 消息条数不变', 甲.length, 基线.length);
  eq('[A] 不改入参(基线原样)', 基线[0].content, '系统指令');

  // 两条 system 时只动最后一条 —— 前面的保持稳定, 前缀缓存的收益不被打掉
  const 双系统 = [
    { role: 'system', content: '第一段' },
    { role: 'user', content: '正文' },
    { role: 'system', content: '最后一段' },
  ];
  const 乙 = 加打散标记(双系统, 标记);
  eq('[A] 只改最后一条 system', 乙[0].content, '第一段');
  ok('[A] 最后一条 system 带标记', 乙[2].content.endsWith(标记));

  // 没有 system 时插一条在最前
  const 无系统 = [{ role: 'user', content: '正文' }];
  const 丙 = 加打散标记(无系统, 标记);
  eq('[A] 无 system 时插一条在最前', 丙[0].role, 'system');
  eq('[A] 插进去的就是标记', 丙[0].content, 标记);
  eq('[A] 原消息顺延', 丙[1].content, '正文');

  // 每次不同
  const 集 = new Set<string>();
  for (let i = 0; i < 50; i++)
    集.add(生成打散标记());
  eq('[A] 50 次生成互不相同', 集.size, 50);

  // 固定长度: 标记长度不该随随机值变化(便于抓包里认)
  const 长度集 = new Set<string>();
  for (let i = 0; i < 50; i++)
    长度集.add(String(生成打散标记().length));
  eq('[A] 标记长度恒定', 长度集.size, 1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 请求构造: 开关开→标记进 system 末尾; 关→逐字节不变');
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

  const 关 = await 跑一次({ 请求打散: false });
  ok('[B] 关: 不崩', 关.错误 === null);
  const 关全文 = JSON.stringify(关.请求.ordered_prompts);
  ok('[B] 关: 请求里没有标记', !关全文.includes('请求标识'), 关全文);
  // G2 的请求侧: 关时请求体必须与改造前一致(system 内容原样, 没有多余空白)
  eq('[B] 关: system 内容逐字节不变', 关.请求.ordered_prompts[0].content, '系统指令');

  const 开 = await 跑一次({ 请求打散: true });
  ok('[B] 开: 不崩', 开.错误 === null);
  const 开system = 开.请求.ordered_prompts[0].content;
  ok('[B] 开: system 末尾有标记', /\[请求标识 [a-z0-9]{12}\]$/.test(开system), 开system);
  ok('[B] 开: system 原有内容还在', 开system.startsWith('系统指令'));

  // 连跑两次, 标记必须不同(这正是 K1 要的效果)
  const 第二次 = await 跑一次({ 请求打散: true });
  ok('[B] 两次请求的标记不同', 第二次.请求.ordered_prompts[0].content !== 开system);

  // 标记不得进 tools(本轮还没有 tools, 但这条断言要留着 —— 将来 K2 落地时它才真正生效)
  ok('[B] 标记不在 tools 里', !JSON.stringify(开.请求.tools ?? []).includes('请求标识'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 归属文案: 全关为空(G2) / 开时三要素(G1) / 每次请求一条日志(P1-5)');
{
  const 关 = { 工具通道: false, 请求打散: false };
  const 开 = { 工具通道: false, 请求打散: true };

  eq('[C/G2] 全关 → 归属为空串', 归属标记(关, '转发', 新建请求态()), '');
  eq('[C/G2] 全关 → 日志为空(不加噪音)', 请求日志(关, '转发', 新建请求态(), 0), null);

  const 态 = 新建请求态();
  态.请求序号 = 3;
  const 标记 = 归属标记(开, '直连', 态);
  ok('[C/G1] 含"请求打散=开"', 标记.includes('请求打散=开'), 标记);
  ok('[C/G1] 含路径', 标记.includes('路径=直连'), 标记);
  ok('[C/G1] 含第几次请求', 标记.includes('第 3 次请求'), 标记);
  ok('[C/G1] 不含未开的功能', !标记.includes('工具通道=开'), 标记);
  ok('[C/G1] 不含已作废的"降级"项', !标记.includes('降级'), 标记);

  const 日志 = 请求日志(开, '转发', 态, 0);
  ok('[C/P1-5] 日志含路径', (日志 ?? '').includes('路径=转发'), 日志 ?? '');
  ok('[C/P1-5] 日志含第几次', (日志 ?? '').includes('第 3 次请求'), 日志 ?? '');
  ok('[C/P1-5] 日志含打散状态', (日志 ?? '').includes('请求打散=开'), 日志 ?? '');
  ok('[C/P1-5] 只开打散时明确说"未带 tools"', (日志 ?? '').includes('未带 tools'), 日志 ?? '');

  // 请求序号从 1 起(不是 0): 归属里说"第 0 次请求"会让人以为没发出去
  eq('[C] 新建的请求态序号为 0(由请求方 +1)', 新建请求态().请求序号, 0);
  eq('[C] 序号为 0 时归属仍显示"第 1 次"', 归属标记(开, '转发', 新建请求态()).includes('第 1 次请求'), true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] 端到端: 请求序号随重试递增, 报错带归属');
{
  setActivePinia(createPinia());
  const { host, 记 } = 彼方假宿主({ 模型回复: ['{"NPC":{}}', '{"NPC":{}}', '{"NPC":{}}'] });
  Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, { 请求打散: true });
  // 手动传一个请求态, 模拟"共用层重试三次"的调用方式
  const 态 = 新建请求态();
  await chatCompletion(host as any, [{ role: 'user', content: '正文' }], { 请求态: 态 });
  await chatCompletion(host as any, [{ role: 'user', content: '正文' }], { 请求态: 态 });
  await chatCompletion(host as any, [{ role: 'user', content: '正文' }], { 请求态: 态 });
  eq('[D] 同一个请求态被复用 → 序号累加到 3', 态.请求序号, 3);
  eq('[D] 三次都真的发出去了', 记.rawCalls.length, 3);

  // 报错带归属
  setActivePinia(createPinia());
  const 二 = 彼方假宿主();
  Object.assign((二.host as any).vars.get({ type: 'global' })['彼方_settings'].接口, { 请求打散: true });
  (二.host as any).model.raw = async () => {
    throw Error('some upstream failure');
  };
  let 文本 = '';
  try {
    await chatCompletion(二.host as any, [{ role: 'user', content: '正文' }]);
  }
  catch (e) {
    文本 = e instanceof Error ? e.message : String(e);
  }
  ok('[D/G1] 打散开 + 报错 → 带功能归属', 文本.includes('【功能归属】'), 文本);
  ok('[D/G1] 归属含"请求打散=开"', 文本.includes('请求打散=开'), 文本);
  ok('[D/G2] 老文案本体仍完整', 文本.includes('通过酒馆服务器请求失败'), 文本);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
