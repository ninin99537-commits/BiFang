// 彼方 · messages 结构 —— 批次: 2026-11-19 移除消息伪装之后
//
// ── 这个文件原来叫「消息伪装」，现在改了 ────────────────────────────
// 2026-11-19 用户裁定：「现在的伪装可以去掉了，因为我后面自己写的提示词就变成了伪装」。
// 内置的三句确认句与"切段重排"全部删除。原文件里 [A][B][C][D][G] 五段测的正是那些，
// 它们**已经随功能一起删除**。
//
// ⚠ 一个必须记下的坑：移除伪装后，原文件 **152 条断言仍然全绿** ——
// 因为 `消息伪装` 参数被忽略，`现状()` 与 `伪装()` 产出同一个东西，所有断言都退化了。
// **那是假绿**：删掉功能而测试照样绿，说明测试测的不是功能，是"两次调用结果相同"。
//
// 所以这个文件不是"删掉伪装相关段落"，而是**整体重写**：
//   保留的（仍然存在的结构）：锚点位置、预填充交互、相邻 assistant 合并、
//                              全进工具的承载位置、四组合不崩
//   删除的（功能已不存在）：确认句、切段重排、末条 user 里贴输出要求
//
// 覆盖：
//   [E] 五个锚点位置语义
//   [F] 与预填充的交互: 末条仍是 user
//   [G] 全进工具: 内容进工具说明, messages 只剩身份句 + 一句收尾
//   [H] 四组合都不崩
//   [J] 末条非 user 时补 TAIL_KICKOFF
//   [K] 锚点插 assistant → 合并(不改角色/不加消息/不丢内容)
//   [L] 全入口扫一遍: 5 个锚点 × assistant, 都不许有连续 assistant
//   [M] 全进工具时五个锚点全留在 messages(防静默丢用户段)
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { chatCompletion } from '../src/彼方_NPC幕后生命状态系统/api';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

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

/** 造一份最小输入 */
function 造输入(额外: Record<string, any> = {}) {
  return {
    reply: '这是一段剧情正文。',
    replyCount: 1,
    context: '',
    timeJump: '',
    tracked: ['甲'],
    inSceneHint: [],
    currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },
    autoTrackEnabled: true,
    physioEnabled: false,
    恋爱对象名单: [],
    自定义段: [],
    预填充: false,
    worldbook: '',
    currentStoryTime: '2026-01-01 20:00',
    storyTimeHint: '2026-01-02 12:30',
    storySpan: '约 0.7 天',
    recentTrace: '',
    playerName: '主角',
    playerDescription: '',
    展开宏: (t: string) => t,
    ...额外,
  };
}

/** 取 messages。**不再有"伪装开/关"两个变体** —— 伪装已删除。 */
function 建(额外: Record<string, any> = {}) {
  return buildUpdateMessages(造输入(额外) as any).messages;
}

const TAIL = '现在, 按上述全部规则开始执行任务。';

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 五个锚点位置语义');
{
  const 段 = (锚点: string, content: string) => ({ 锚点, role: 'system', content, 启用: true });
  const 伪 = 建({
    自定义段: [
      段('最前', 'ANCHOR_FIRST'),
      段('主提示词之后', 'ANCHOR_AFTER_MAIN'),
      段('任务之前', 'ANCHOR_BEFORE_TASK'),
      段('任务之后', 'ANCHOR_AFTER_TASK'),
      段('最后', 'ANCHOR_LAST'),
    ],
  });
  const 位置 = (标记: string) => 伪.findIndex(m => String(m.content).includes(标记));
  const 首 = 位置('ANCHOR_FIRST');
  const 主后 = 位置('ANCHOR_AFTER_MAIN');
  const 任前 = 位置('ANCHOR_BEFORE_TASK');
  const 任后 = 位置('ANCHOR_AFTER_TASK');
  const 最后 = 位置('ANCHOR_LAST');
  ok('[E] 五个锚点都出现了', [首, 主后, 任前, 任后, 最后].every(i => i >= 0), JSON.stringify([首, 主后, 任前, 任后, 最后]));
  ok('[E] 最前 在最前面', 首 === 0, `位置 ${首}`);
  ok('[E] 主提示词之后 在任务之前之前', 主后 < 任前, `${主后} < ${任前}`);
  ok('[E] 任务之前 在任务之后之前', 任前 < 任后, `${任前} < ${任后}`);
  ok('[E] 顺序: 最前 < 主后 < 任前 < 任后 < 最后', 首 < 主后 && 主后 < 任前 && 任前 < 任后 && 任后 < 最后, JSON.stringify([首, 主后, 任前, 任后, 最后]));
  // 末条仍是 user(锚点段是 system, 但 TAIL_KICKOFF 会补 user)
  eq('[E] 用户段全是 system 时, 末条被补成 user', 伪[伪.length - 1].role, 'user');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[F] 与预填充的交互: 末条仍是 user');
{
  const 伪 = 建({ 预填充: true });
  eq('[F] 开预填充后末条仍是 user', 伪[伪.length - 1].role, 'user');
  // 预填充由共用层在末条 user 之后追加 assistant '{', 与现状同一条路径
  ok('[F] 末条是 user 才轮得到预填充', 伪[伪.length - 1].role === 'user');

  // 用户在「最后」插 assistant 段 → 末条变 assistant → TAIL_KICKOFF 补 user
  const 末assistant = 建({ 自定义段: [{ 锚点: '最后', role: 'assistant', content: '尾注' }] });
  eq('[F] 末条是 assistant 时补了 TAIL_KICKOFF', 末assistant[末assistant.length - 1].content, TAIL);
  eq('[F] 补的是 user', 末assistant[末assistant.length - 1].role, 'user');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[G] 全进工具: 内容进工具说明, messages 只剩身份句 + 一句收尾');
{
  // 真实路径: buildUpdateMessages 产出 messages + 工具说明。
  // 直接调 chatCompletion 会绕过 buildUpdateMessages, 走到"没拿到工具说明"的兜底分支 ——
  // 那样测的是兜底, 不是真实路径(第一版就踩了这个坑)。
  const 出 = buildUpdateMessages(造输入({ 规则进工具: true, context: '主角走进广场。' }) as any);
  const 段 = 出.messages as any[];

  eq('[G] messages 是 2 条', 段.length, 2);
  eq('[G] 第一条是 system(身份句)', 段[0].role, 'system');
  eq('[G] 末条是 user', 段[段.length - 1].role, 'user');
  // 规则与数据都不在 messages 里
  const 全文 = 段.map((m: any) => String(m.content)).join('\n');
  ok('[G] 规则正文不在 messages 里', !全文.includes('核心原则'), 全文.slice(0, 80));
  ok('[G] 剧情不在 messages 里', !全文.includes('这是一段剧情正文'));
  ok('[G] 场景判断不在 messages 里', !全文.includes('主角走进广场'));
  // 但都在工具说明里
  ok('[G] 规则在工具说明里', String(出.工具说明 ?? '').includes('核心原则'));
  ok('[G] 剧情在工具说明里', String(出.工具说明 ?? '').includes('这是一段剧情正文'));
  ok('[G] 场景判断在工具说明里', String(出.工具说明 ?? '').includes('主角走进广场'));
  // 末条 user 是收尾指令, **不含任何规则内容**(它是技术要求, 不是伪装残留)
  eq('[G] 末条 user 就是 TAIL_KICKOFF', 段[段.length - 1].content, TAIL);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[H] 四组合都不崩(工具通道 × 请求打散)');
{
  for (const 工具 of [false, true]) {
    for (const 打散 of [false, true]) {
      const 原W = console.warn;
      const 喊过: string[] = [];
      console.warn = (...a: any[]) => 喊过.push(a.join(' '));
      let 抛 = '';
      try {
        buildUpdateMessages(造输入({ 规则进工具: 工具, 请求打散: 打散, context: '玩家输入' }) as any);
      }
      catch (e: any) {
        抛 = String(e?.message ?? e);
      }
      finally {
        console.warn = 原W;
      }
      eq(`[H] 工具=${工具} 打散=${打散} 不抛错`, 抛, '');
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[J] 末条非 user 时补 TAIL_KICKOFF');
{
  // 关掉数据零件(任务正文变空) + 「最后」插 system → 末条是 system
  const 关 = 建({ 自定义段: [{ 锚点: '最后', role: 'system', content: '尾部系统提示' }] });
  eq('[J] 末条是 system 时补了 TAIL_KICKOFF', 关[关.length - 1].content, TAIL);
  eq('[J] 补的是 user', 关[关.length - 1].role, 'user');
  eq('[J] 补之前末条确实是 system', 关[关.length - 2].role, 'system');
  eq('[J] 补之前末条内容正常', 关[关.length - 2].content, '尾部系统提示');

  // 末条是 assistant → 也补
  const 关assistant = 建({ 自定义段: [{ 锚点: '最后', role: 'assistant', content: '尾注' }] });
  eq('[J] 末条是 assistant 时仍补', 关assistant[关assistant.length - 1].role, 'user');

  // 末条本来就是 user → 不补(不多加一条)
  const 关user = 建({ 自定义段: [{ 锚点: '最后', role: 'user', content: '尾部用户提示' }] });
  eq('[J] 末条是 user 时不补', 关user[关user.length - 1].content, '尾部用户提示');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[K] 锚点插 assistant → 合并(不改角色/不加消息/不丢内容)');
{
  const 两条 = 建({
    自定义段: [
      { 锚点: '任务之后', role: 'assistant', content: 'AA', 启用: true },
      { 锚点: '最后', role: 'assistant', content: 'BB', 启用: true },
    ],
  });
  // 两条连续 assistant 必须被合成一条
  const 连续 = 两条.filter((m: any, i: number) => i > 0 && 两条[i - 1].role === m.role && m.role === 'assistant');
  eq('[K] 没有连续两条 assistant', 连续.length, 0);
  // 内容一个字不丢
  const 全文 = 两条.map((m: any) => String(m.content)).join('\n');
  ok('[K] AA 还在', 全文.includes('AA'));
  ok('[K] BB 还在', 全文.includes('BB'));
  // 合并后仍是 assistant(没被改成别的角色)
  ok('[K] 合并后那条仍是 assistant', 两条.some((m: any) => m.role === 'assistant' && m.content.includes('AA') && m.content.includes('BB')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[L] 全入口扫一遍: 5 个锚点 × assistant, 都不许有连续 assistant');
{
  const 锚点们 = ['最前', '主提示词之后', '任务之前', '任务之后', '最后'];
  for (const 锚点 of 锚点们) {
    const 段 = 建({ 自定义段: [{ 锚点, role: 'assistant', content: `AT-${锚点}`, 启用: true }] });
    const 连续 = 段.filter((m: any, i: number) => i > 0 && 段[i - 1].role === 'assistant' && m.role === 'assistant');
    eq(`[L] 锚点「${锚点}」插 assistant 后没有连续 assistant`, 连续.length, 0);
    ok(`[L] 锚点「${锚点}」的内容没丢`, 段.some((m: any) => String(m.content).includes(`AT-${锚点}`)));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[M] 全进工具时五个锚点全留在 messages(防静默丢用户段)');
{
  const 锚点们 = ['最前', '主提示词之后', '任务之前', '任务之后', '最后'];
  const 段 = 建({
    规则进工具: true,
    自定义段: 锚点们.map(锚点 => ({ 锚点, role: 'system', content: `KEEP-${锚点}`, 启用: true })),
  });
  const 全文 = 段.map((m: any) => String(m.content)).join('\n');
  for (const 锚点 of 锚点们) {
    ok(`[M] 锚点「${锚点}」的段还在 messages 里`, 全文.includes(`KEEP-${锚点}`));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[N] 伪装已移除: 内置内容里不再有确认句');
{
  // 这条是**回归护栏**: 若有人把确认句加回来, 这里会红。
  // 三句原文: 明白。/ 收到。/ 好，接着说。
  const 段 = 建({ context: '玩家输入' });
  const 全文 = 段.map((m: any) => String(m.content)).join('\n');
  for (const 句 of ['明白。', '收到。', '好，接着说。']) {
    ok(`[N] 内置内容里没有确认句「${句}」`, !全文.includes(句), 句);
  }
  // 自证: 这个断言抓得住 —— 若用户自己写一句, 它就在(证明判据不是永远为真)
  const 自写 = 建({ 自定义段: [{ 锚点: '最后', role: 'assistant', content: '明白。', 启用: true }] });
  ok('[N/自证] 用户自己写「明白。」时它确实在(判据不是永远为真)',
    自写.some((m: any) => String(m.content).includes('明白。')));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
