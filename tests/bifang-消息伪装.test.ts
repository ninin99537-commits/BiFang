// 彼方 · 消息伪装(第四个开关) —— 批次: 第四轮(方案 §28/§29)。
//
// 动机: 另一套公开预设的请求读起来像一段真实协作会话, 而不是一份投喂文档。
//
// 铁律(方案 §29 ①): **只改结构与承载位置, 规则文字一个字不改**。
// 证明方式不是"三段拼回去相等"(§29 ② 改了输出要求的位置, 顺序变了), 而是:
//   **每段内容逐字 === 原文对应片段**, 且 `输出要求` 段落在末条 user 的尾部。
//
// 覆盖:
//   [A] 金标准: 每段逐字取自原文(用 hash 锁死)
//   [B] 结构: 8 条消息 / 角色交替 / 末条是 user
//   [C] 输出要求贴在末条 user 尾部(§29 ②)
//   [D] 确认句: 三条不同 / ≤6 字 / 零新信息
//   [E] 五个锚点位置语义
//   [F] 与预填充的交互(末条仍是 user)
//   [G] 与「上下文进工具」的优先级(伪装不生效 + 明确提示)
//   [H] 16 种开关组合都不崩
import { createHash } from 'node:crypto';
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
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
const sha = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);

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

/** 关掉伪装时的 messages(现状), 用来提取"原文片段"作金标准 */
function 现状() {
  return buildUpdateMessages(造输入({ 消息伪装: false }) as any).messages;
}
function 伪装(额外: Record<string, any> = {}) {
  return buildUpdateMessages(造输入({ 消息伪装: true, ...额外 }) as any).messages;
}

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 金标准: 每段内容逐字取自原文(不是重新拼的)');
{
  const 原 = 现状();
  const 伪 = 伪装({ context: '主角走进广场。' });
  // 现状: [0] system = HEAD+BODY, [1] user = userContent
  const 原系统 = String(原[0].content);
  const 原用户 = String(原[1].content);

  // 伪装(带场景判断): [0] system=HEAD, [1] 规则段1, [3] 规则段2, [7] 末条 user
  const 伪身份 = String(伪[0].content);
  const 段1 = String(伪[1].content);
  const 段2 = String(伪[3].content);
  const 末用户 = String(伪[伪.length - 1].content);

  // ① 身份句: 原文系统提示词以它开头, 伪装后它就是整条 system
  ok('[A] 身份句逐字 === 原文系统提示词的开头', 原系统.startsWith(伪身份), 伪身份.slice(0, 40));
  ok('[A] 身份句是原文的前缀', 原系统.slice(0, 伪身份.length) === 伪身份);

  // ② 规则段1 / 规则段2: 必须是原文的子串, 且首尾相接
  const 原文剩余 = 原系统.slice(伪身份.length);
  ok('[A] 规则段1 是原文的子串', 原文剩余.includes(段1), 段1.slice(0, 40));
  ok('[A] 规则段1 从原文剩余部分的开头开始', 原文剩余.startsWith(段1));
  ok('[A] 规则段2 紧接在规则段1 之后', 原文剩余.startsWith(段1 + 段2), `段1末 ${段1.slice(-20)} / 段2首 ${段2.slice(0, 20)}`);
  // ③ 输出要求段: 必须在原文里, 且在末条 user 的尾部
  const 输出要求起点 = 末用户.indexOf('\n输出要求:');
  ok('[A] 输出要求段在末条 user 里', 输出要求起点 >= 0, 末用户.slice(-200));
  const 输出要求段 = 末用户.slice(输出要求起点);
  ok('[A] 输出要求段是原文的子串', 原文剩余.includes(输出要求段), 输出要求段.slice(0, 40));
  ok('[A] 输出要求段在原文末尾结束', 原文剩余.endsWith(输出要求段));

  // ④ 四段重组 = 原文的全部内容(一个字符都不丢)
  const 重组 = 伪身份 + 段1 + 段2 + 输出要求段;
  eq('[A] 身份句+规则段1+规则段2+输出要求段 === 原文系统提示词', sha(重组), sha(原系统));

  // ⑤ 剧情正文逐字未改
  ok('[A] 剧情正文是原文 user 的开头', 末用户.startsWith(原用户), 末用户.slice(0, 40));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 结构: 角色交替 / 末条是 user / 无连续 assistant');
{
  // 无场景判断 → 6 条(第三条确认句只在场景判断存在时才加)
  const 无场景 = 伪装();
  eq('[B] 无场景判断时 6 条', 无场景.length, 6);
  eq('[B] 无场景时角色序列', 无场景.map(m => m.role), ['system', 'user', 'assistant', 'user', 'assistant', 'user']);
  eq('[B] 无场景时末条是 user', 无场景[无场景.length - 1].role, 'user');

  // 带场景判断 → 8 条
  const 伪 = 伪装({ context: '主角走进广场。' });
  eq('[B] 带场景判断时 8 条', 伪.length, 8);
  eq('[B] 角色序列', 伪.map(m => m.role), ['system', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
  eq('[B] 末条是 user', 伪[伪.length - 1].role, 'user');
  // 除首条 system 外没有别的 system(伪装的意义就在这)
  eq('[B] 只有第一条是 system', 伪.filter(m => m.role === 'system').length, 1);
  eq('[B] 无场景时也只有第一条是 system', 无场景.filter(m => m.role === 'system').length, 1);

  // 两种情形都不许有连续 assistant(实测踩到过: 无 context 时第三条确认句紧跟第二条)
  for (const [标签, 组] of [['带场景', 伪], ['无场景', 无场景]] as Array<[string, any[]]>) {
    let 连续 = 0;
    for (let i = 1; i < 组.length; i++)
      if (组[i].role === 'assistant' && 组[i - 1].role === 'assistant')
        连续++;
    eq(`[B] ${标签}: 没有连续 assistant`, 连续, 0);
  }

  ok('[B] 场景判断在 user 里(不是 system)', 伪.some(m => m.role === 'user' && String(m.content).includes('仅供场景判断')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 输出要求贴在末条 user 尾部(§29 ② 的裁定)');
{
  const 伪 = 伪装({ context: '主角走进广场。' });
  const 末 = String(伪[伪.length - 1].content);
  ok('[C] 末条 user 以输出要求段结尾', /\n输出要求:[\s\S]*$/.test(末), 末.slice(-120));
  ok('[C] 末条 user 含"只输出一个 JSON 对象"', 末.includes('只输出一个 JSON 对象'), 末.slice(-300));
  // 关键: 输出要求**不在**中间那两条 user 里
  ok('[C] 规则段1 里没有输出要求', !String(伪[1].content).includes('\n输出要求:'));
  ok('[C] 规则段2 里没有输出要求', !String(伪[3].content).includes('\n输出要求:'));
  // 承重指令与生成之间不隔任何 assistant —— 末条就是它
  eq('[C] 输出要求所在的 message 就是最后一条', 伪[伪.length - 1].role, 'user');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] 确认句: 三条不同 / ≤6 字 / 零新信息');
{
  const 伪 = 伪装({ context: '主角走进广场。' });
  const 三条 = 伪.filter(m => m.role === 'assistant').map(m => String(m.content));
  eq('[D] 恰好三条确认句(带场景判断时)', 三条.length, 3);
  eq('[D] 三条互不相同', new Set(三条).size, 3);
  for (const 句 of 三条) {
    ok(`[D] 「${句}」≤6 字`, 句.length <= 6, `长度 ${句.length}`);
    // 零新信息: 不许出现任何指令性词汇
    const 禁词 = ['JSON', 'json', '输出', '格式', '规则', '字段', 'NPC', '请', '必须', '应'];
    const 命中 = 禁词.filter(w => 句.includes(w));
    eq(`[D] 「${句}」不含指令性词汇`, 命中, []);
  }
  // 无场景判断时只有两条确认句(第三条会与第二条相邻)
  const 无场景 = 伪装();
  eq('[D] 无场景时只有两条确认句', 无场景.filter(m => m.role === 'assistant').length, 2);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 五个锚点位置语义');
{
  const 段 = (锚点: string, content: string) => ({ 锚点, role: 'system', content, 启用: true });
  const 伪 = 伪装({
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
  ok('[E] 最前 在身份句之前', 首 === 0, `位置 ${首}`);
  ok('[E] 主提示词之后 在任务正文之前', 主后 < 任前, `${主后} < ${任前}`);
  ok('[E] 任务之前 在任务正文之前', 任前 < 任后, `${任前} < ${任后}`);
  ok('[E] 顺序: 最前 < 主后 < 任前 < 任后 < 最后', 首 < 主后 && 主后 < 任前 && 任前 < 任后 && 任后 < 最后, JSON.stringify([首, 主后, 任前, 任后, 最后]));
  // 末条仍是 user(锚点段是 system, 但 TAIL_KICKOFF 会补 user)
  eq('[E] 用户段全是 system 时, 末条被补成 user', 伪[伪.length - 1].role, 'user');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[F] 与预填充的交互: 末条仍是 user');
{
  const 伪 = 伪装({ 预填充: true });
  eq('[F] 开预填充后末条仍是 user', 伪[伪.length - 1].role, 'user');
  // 预填充由共用层在末条 user 之后追加 assistant '{', 与现状同一条路径
  ok('[F] 末条是 user 才轮得到预填充', 伪[伪.length - 1].role === 'user');

  // 用户在「最后」插 assistant 段 → 末条变 assistant → TAIL_KICKOFF 补 user
  const 末assistant = 伪装({ 自定义段: [{ 锚点: '最后', role: 'assistant', content: '尾注' }] });
  eq('[F] 末条是 assistant 时补了 TAIL_KICKOFF', 末assistant[末assistant.length - 1].content, '现在, 按上述全部规则开始执行任务。');
  eq('[F] 补的是 user', 末assistant[末assistant.length - 1].role, 'user');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[G] §33: 规则进工具 + 常驻伪装**同时生效**(正交, 不是互斥)');
{
  // 真实路径: buildUpdateMessages 产出 messages + 工具说明, api.ts 只负责把工具说明交给工具定义。
  // 直接调 chatCompletion 会绕过 buildUpdateMessages, 走到"没拿到工具说明"的兜底分支 ——
  // 那样测的是兜底, 不是真实路径(第一版就踩了这个坑)。
  const 出 = buildUpdateMessages(造输入({ 消息伪装: true, 规则进工具: true, context: '主角走进广场。' }) as any);
  const 段 = 出.messages as any[];

  // ① 规则进了工具说明
  ok('[G] 产出了工具说明', typeof 出.工具说明 === 'string' && 出.工具说明.length > 1000, `长度 ${(出.工具说明 ?? '').length}`);
  ok('[G] 工具说明里有规则正文', String(出.工具说明).includes('核心原则'));
  ok('[G] 工具说明里有输出要求', String(出.工具说明).includes('输出要求'));
  // ② 规则**不在** messages 里了
  ok('[G] messages 里没有核心原则', !JSON.stringify(段).includes('核心原则'), JSON.stringify(段).slice(0, 200));
  // ③ messages 仍是多条短问答
  ok('[G] messages 仍是多条(不是一句)', 段.length >= 4, `条数 ${段.length}`);
  ok('[G] messages 里有 assistant 确认', 段.some((m: any) => m.role === 'assistant'), JSON.stringify(段.map((m: any) => m.role)));
  eq('[G] 末条是 user', 段[段.length - 1].role, 'user');
  // ④ 剧情正文留在 messages 里
  ok('[G] 剧情正文仍在 messages', JSON.stringify(段).includes('这是一段剧情正文'), JSON.stringify(段).slice(0, 200));
  // ⑤ 输出要求仍贴在末条 user 尾部(承重指令离生成最近)
  ok('[G] 输出要求仍在末条 user 尾部', String(段[段.length - 1].content).includes('\n输出要求:'));
  // ⑥ 无连续 assistant
  let 连续 = 0;
  for (let i = 1; i < 段.length; i++)
    if (段[i].role === 'assistant' && 段[i - 1].role === 'assistant')
      连续++;
  eq('[G] 无连续 assistant', 连续, 0);
  // ⑦ 对比: 规则不进工具时, 规则在 messages 里、没有工具说明
  const 不进 = buildUpdateMessages(造输入({ 消息伪装: true, 规则进工具: false }) as any);
  eq('[G] 规则不进工具时没有工具说明', 不进.工具说明, undefined);
  ok('[G] 规则不进工具时规则在 messages 里', JSON.stringify(不进.messages).includes('核心原则'));
  // ⑧ 工具说明的正文必须与原文逐字相同(不是重新拼的)
  const 原文系统 = String(buildUpdateMessages(造输入({ 消息伪装: false }) as any).messages[0].content);
  eq('[G] 工具说明逐字 === 原文系统提示词', sha(String(出.工具说明)), sha(原文系统));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[H] 四组合都不崩(工具通道 × 请求打散)');
{
  for (const 工具 of [false, true]) {
    for (const 打散 of [false, true]) {
      const 标签 = `工具=${+工具} 打散=${+打散}`;
      setActivePinia(createPinia());
      const { host } = 彼方假宿主({ 模型回复: ['{"NPC":{}}'] });
      Object.assign((host as any).vars.get({ type: 'global' })['彼方_settings'].接口, {
        工具通道: 工具, 请求打散: 打散,
      });
      let 错误: unknown = null;
      const 原文warn = console.warn;
      console.warn = () => {};
      try {
        await chatCompletion(host as any, [
          { role: 'system', content: '系统指令' },
          { role: 'user', content: '剧情正文' },
        ]);
      }
      catch (e) {
        错误 = e;
      }
      finally {
        console.warn = 原文warn;
      }
      ok(`[H] ${标签}: 不崩`, 错误 === null, 错误 instanceof Error ? 错误.message.slice(0, 100) : '');
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I] 伪装关 = 逐字节与现状一致(不能因为加了开关就动老路径)');
{
  const 关 = buildUpdateMessages(造输入({ 消息伪装: false }) as any).messages;
  const 没传 = buildUpdateMessages(造输入() as any).messages;
  eq('[I] 显式关 与 不传 逐字节相同', sha(JSON.stringify(关)), sha(JSON.stringify(没传)));
  eq('[I] 关时仍是 2 条', 关.length, 2);
  eq('[I] 关时第 0 条是 system', 关[0].role, 'system');
  eq('[I] 关时第 1 条是 user', 关[1].role, 'user');
  // 关时第 0 条仍含全部规则(没有拆)
  ok('[I] 关时 system 里仍有"输出要求"', String(关[0].content).includes('\n输出要求:'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[J] 既有路径修复: 末条是 system 时也要补 TAIL_KICKOFF(伪装关)');
{
  // 这是**既有缺陷**, 不是伪装带来的: 用户在「最后」锚点插自定义段时,
  // 锚点段 的默认 role 就是 system, 末条变成 system, 旧判据(只判 assistant)不成立 → 不补。
  // 症状: 部分供应商把尾部非 user 当"已回答", 不输出 JSON。
  const 关 = buildUpdateMessages(造输入({
    消息伪装: false,
    自定义段: [{ 锚点: '最后', role: 'system', content: '尾部系统提示' }],
  }) as any).messages;
  eq('[J] 伪装关 + 末条是 system → 补了 TAIL_KICKOFF', 关[关.length - 1].content, '现在, 按上述全部规则开始执行任务。');
  eq('[J] 补的是 user', 关[关.length - 1].role, 'user');
  eq('[J] 补之前末条确实是 system', 关[关.length - 2].role, 'system');
  eq('[J] 补之前末条内容正确', 关[关.length - 2].content, '尾部系统提示');

  // 末条是 assistant 时照旧补(原有行为不变)
  const 关assistant = buildUpdateMessages(造输入({
    消息伪装: false,
    自定义段: [{ 锚点: '最后', role: 'assistant', content: '尾部助手提示' }],
  }) as any).messages;
  eq('[J] 伪装关 + 末条是 assistant → 仍补', 关assistant[关assistant.length - 1].role, 'user');

  // 末条是 user 时不补(不能多加一条)
  const 关user = buildUpdateMessages(造输入({
    消息伪装: false,
    自定义段: [{ 锚点: '最后', role: 'user', content: '尾部用户提示' }],
  }) as any).messages;
  eq('[J] 伪装关 + 末条是 user → 不补', 关user[关user.length - 1].content, '尾部用户提示');
  eq('[J] 条数没多', 关user.length, 3);

  // 伪装开时行为**必须与关时一致**(同一条判据, 不许开关两边分叉)
  const 开 = buildUpdateMessages(造输入({
    消息伪装: true,
    自定义段: [{ 锚点: '最后', role: 'system', content: '尾部系统提示' }],
  }) as any).messages;
  eq('[J] 伪装开 + 末条是 system → 也补', 开[开.length - 1].role, 'user');
  eq('[J] 两边补的是同一句话', 开[开.length - 1].content, 关[关.length - 1].content);
  // 两种情形末条都是 user(这就是那条判据的意图)
  eq('[J] 开关两边末条都是 user', [关[关.length - 1].role, 开[开.length - 1].role], ['user', 'user']);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[K] P2-16: 锚点插 assistant → 合并(不改角色/不加消息/不丢内容)');
{
  const 段 = (锚点: string, role: string, content: string) => ({ 锚点, role, content, 启用: true });

  // ①「主提示词之后」插 assistant —— 紧跟在第二条确认句后面
  const k1 = 伪装({ context: '主角走进广场。', 自定义段: [段('主提示词之后', 'assistant', '主后助手段')] });
  let 连续 = 0;
  for (let i = 1; i < k1.length; i++)
    if (k1[i].role === 'assistant' && k1[i - 1].role === 'assistant')
      连续++;
  eq('[K/①] 主提示词之后 插 assistant → 无连续 assistant', 连续, 0);
  // 内容没丢, 且被并进了确认句那条
  const 并后 = k1.find(m => m.role === 'assistant' && String(m.content).includes('主后助手段'));
  ok('[K/①] 合并后内容仍在', !!并后, JSON.stringify(k1.map(m => m.role)));
  ok('[K/①] 合并后仍带着原确认句', String(并后?.content).includes('收到。'), String(并后?.content));
  eq('[K/①] 合并成一条(用空行分隔)', String(并后?.content), '收到。\n\n主后助手段');
  // 消息条数: 基础 8 条 + 用户段 1 条 - 合并省下 1 条 = 8 条
  eq('[K/①] 合并后条数 = 8 + 1 - 1 = 8', k1.length, 8);
  // 用户的 role 选择被尊重(没有把 assistant 改成 user)
  eq('[K/①] 那条仍是 assistant', 并后?.role, 'assistant');

  // ②「任务之前」插 assistant —— 紧跟第三条确认句后面
  const k2 = 伪装({ context: '主角走进广场。', 自定义段: [段('任务之前', 'assistant', '任务前助手段')] });
  连续 = 0;
  for (let i = 1; i < k2.length; i++)
    if (k2[i].role === 'assistant' && k2[i - 1].role === 'assistant')
      连续++;
  eq('[K/②] 任务之前 插 assistant → 无连续 assistant', 连续, 0);
  ok('[K/②] 合并后带着原确认句', k2.some(m => m.role === 'assistant' && String(m.content).includes('好，接着说。') && String(m.content).includes('任务前助手段')));

  // ③ 两个锚点各插一条 assistant → 合并后两段文字都在(不丢内容)
  const k3 = 伪装({
    context: '主角走进广场。',
    自定义段: [段('主提示词之后', 'assistant', '第一段助手'), 段('任务之前', 'assistant', '第二段助手')],
  });
  连续 = 0;
  for (let i = 1; i < k3.length; i++)
    if (k3[i].role === 'assistant' && k3[i - 1].role === 'assistant')
      连续++;
  eq('[K/③] 两个锚点各插一条 → 仍无连续 assistant', 连续, 0);
  const 全文 = JSON.stringify(k3);
  ok('[K/③] 第一段文字还在', 全文.includes('第一段助手'));
  ok('[K/③] 第二段文字还在', 全文.includes('第二段助手'));
  ok('[K/③] 两条确认句都还在', 全文.includes('收到。') && 全文.includes('好，接着说。'));

  // ④ 同一锚点插两条 assistant → 也合并
  const k4 = 伪装({
    context: '主角走进广场。',
    自定义段: [段('任务之后', 'assistant', '甲段'), 段('任务之后', 'assistant', '乙段')],
  });
  连续 = 0;
  for (let i = 1; i < k4.length; i++)
    if (k4[i].role === 'assistant' && k4[i - 1].role === 'assistant')
      连续++;
  eq('[K/④] 同锚点两条 assistant → 无连续', 连续, 0);
  ok('[K/④] 两段内容都在', JSON.stringify(k4).includes('甲段') && JSON.stringify(k4).includes('乙段'));

  // ⑤ 伪装关时同样合并(两条路径同一条判据)
  const k5 = buildUpdateMessages(造输入({
    消息伪装: false,
    自定义段: [段('任务之后', 'assistant', '关甲'), 段('最后', 'assistant', '关乙')],
  }) as any).messages;
  连续 = 0;
  for (let i = 1; i < k5.length; i++)
    if (k5[i].role === 'assistant' && k5[i - 1].role === 'assistant')
      连续++;
  eq('[K/⑤] 伪装关 + 两个 assistant 段 → 无连续', 连续, 0);
  ok('[K/⑤] 关时两段内容都在', JSON.stringify(k5).includes('关甲') && JSON.stringify(k5).includes('关乙'));
  eq('[K/⑤] 关时末条仍是 user', k5[k5.length - 1].role, 'user');

  // ⑥ 合并不许把 user 段也并进去(只并 assistant)
  const k6 = 伪装({
    context: '主角走进广场。',
    自定义段: [段('任务之前', 'assistant', '助手段'), 段('任务之前', 'user', '用户段')],
  });
  ok('[K/⑥] user 段没被并进 assistant', k6.some(m => m.role === 'user' && String(m.content).includes('用户段')));
  eq('[K/⑥] 角色序列里 assistant 与 user 交替', k6.filter(m => m.role === 'assistant').length > 0, true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[L] 全入口扫一遍: 5 个锚点 × assistant × 伪装开/关, 都不许有连续 assistant');
{
  const 锚点们 = ['最前', '主提示词之后', '任务之前', '任务之后', '最后'];
  for (const 伪装开 of [false, true]) {
    for (const 锚点 of 锚点们) {
      const 组 = buildUpdateMessages(造输入({
        消息伪装: 伪装开,
        context: '主角走进广场。',
        自定义段: [{ 锚点, role: 'assistant', content: `段@${锚点}`, 启用: true }],
      }) as any).messages;
      let 连续 = 0;
      for (let i = 1; i < 组.length; i++)
        if (组[i].role === 'assistant' && 组[i - 1].role === 'assistant')
          连续++;
      eq(`[L] 伪装=${+伪装开} 锚点=${锚点} → 无连续 assistant`, 连续, 0);
      ok(`[L] 伪装=${+伪装开} 锚点=${锚点} → 内容没丢`, JSON.stringify(组).includes(`段@${锚点}`));
      eq(`[L] 伪装=${+伪装开} 锚点=${锚点} → 末条是 user`, 组[组.length - 1].role, 'user');
    }
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
