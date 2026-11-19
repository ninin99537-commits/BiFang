// 彼方 · 提示词零件化 —— 批次: 2026-11-19 零件化第一批(I3 + V1 立起来)
//
// 这批只立两条, 因为它们是"后面拆得再多也不算数"的前提:
//   I3 · 全默认逐字节: 不引用、不关闭任何零件时, 输出与**改造前**逐字节相同。
//        判据是 fixtures/bifang-prompt-改造前.json —— 那份快照是**动代码之前**采的
//        (规矩 §十二 #24: 有些事实只在某一刻为真, 事后取到的是"改完之后")。
//   V1 · 拼装清单必可得: 每次拼装能拿到"每个零件进了哪、多少字、为什么没进"。
//
// 为什么 I3 不能靠既有 152 条伪装/工具测试代劳:
//   那些用例**全跑默认配置**, 所以默认配置下它们当然全绿 —— 但它们是绿在"输出恰好相同",
//   不是绿在"逐字节相同"。实现若改了路径而输出碰巧一致, 它们照样绿, 而 I3 已经破了。
//   所以 I3 必须是一条**独立的、对着改造前快照逐字节比对**的断言。
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { 零件表, 扫占位符, 切规则零件, 清单摘要, 是默认配置 } from '../src/彼方_NPC幕后生命状态系统/零件表';
import 快照文本 from './fixtures/bifang-prompt-改造前.json?raw';

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
    console.log(`  FAIL ${名}\n      期望 ${b.slice(0, 300)}\n      实际 ${a.slice(0, 300)}`);
  }
}

const 快照 = JSON.parse(快照文本) as Record<string, { messages: { role: string; content: string }[]; 工具说明: string | null }>;

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

/** 快照里那 6 种组合对应的输入(必须与生成器里的一致) */
const 组合: Record<string, Record<string, any>> = {
  默认: {},
  伪装: { 消息伪装: true },
  全进工具: { 消息伪装: true, 规则进工具: true },
  带场景判断: { 消息伪装: true, context: '主角走进广场。' },
  生理开: { physioEnabled: true },
  登记归档: { 登记归档: true },
};

// ─────────────────────────────────────────────────────────────
console.log('\n[I3] 全默认逐字节: 与改造前快照比(这是整个功能的刹车)');
{
  for (const [名, 额外] of Object.entries(组合)) {
    const 期望 = 快照[名];
    ok(`[I3] 快照里有「${名}」这一组`, !!期望);
    if (!期望)
      continue;
    const 实际 = buildUpdateMessages(造输入(额外) as any);
    // messages: 逐条逐字
    eq(`[I3] ${名}: messages 条数`, 实际.messages.length, 期望.messages.length);
    const 条数 = Math.min(实际.messages.length, 期望.messages.length);
    for (let i = 0; i < 条数; i++) {
      eq(`[I3] ${名}: 第 ${i + 1} 条 role`, 实际.messages[i].role, 期望.messages[i].role);
      ok(
        `[I3] ${名}: 第 ${i + 1} 条内容逐字节相同`,
        实际.messages[i].content === 期望.messages[i].content,
        `实际 ${实际.messages[i].content.length} 字 / 期望 ${期望.messages[i].content.length} 字`,
      );
    }
    // 工具说明: null 与 undefined 都算"没有"
    const 实际工具 = 实际.工具说明 ?? null;
    ok(
      `[I3] ${名}: 工具说明逐字节相同`,
      实际工具 === 期望.工具说明,
      `实际 ${实际工具 === null ? 'null' : `${实际工具.length} 字`} / 期望 ${期望.工具说明 === null ? 'null' : `${期望.工具说明.length} 字`}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I3/自证] 负样本: 只要有一个零件被关掉, 上面的断言就必须红');
{
  // 这条是"判据本身有效"的证明 —— 否则"逐字节相同"与"比较函数坏了"分不开。
  // 必须挑一个**有内容**的零件: D2 世界书在默认输入里是空串, 关掉它输出不变,
  // 拿它当负样本会得到假红(我第一版就是这么写错的)。D1 最近正文回复是必有的。
  const 关一个 = buildUpdateMessages(造输入({ 关闭零件: ['D1'] }) as any);
  const 默认 = 快照['默认'];
  ok(
    '[I3/自证] 关掉 D1(有内容)之后, 默认配置的输出与快照不同',
    关一个.messages[1].content !== 默认.messages[1].content,
  );
  // 关掉一个本来就不存在的零件(世界书为空时 D2 是空串), 输出应当**仍然相同**
  // —— 这条防的是"关闭逻辑把别的零件也弄没了"
  const 关空的 = buildUpdateMessages(造输入({ 关闭零件: ['D12'] }) as any);
  eq(
    '[I3] 关掉一个本来就为空的零件(D12 近期轨迹), 输出不变',
    关空的.messages.map(m => m.content),
    默认.messages.map(m => m.content),
  );
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I1] 不重复: 零件被引用后从默认位置移除');
{
  const 引用世界书 = buildUpdateMessages(
    造输入({
      worldbook: 'WORLDBOOK-内容-标记',
      自定义段: [{ 锚点: '最前', role: 'system', content: '开头:{{彼方:世界书}}', 启用: true }],
    }) as any,
  );
  const 全文 = 引用世界书.messages.map(m => m.content).join('\n');
  const 次数 = 全文.split('WORLDBOOK-内容-标记').length - 1;
  eq('[I1] 世界书只出现一次(默认位置已被移除)', 次数, 1);
  ok('[I1] 它出现在「最前」锚点那条里', 引用世界书.messages[0].content.includes('WORLDBOOK-内容-标记'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I5] 引用必展开: 合法占位符不许原样发给模型');
{
  const r = buildUpdateMessages(
    造输入({
      worldbook: 'WB',
      自定义段: [{ 锚点: '最前', role: 'system', content: '前{{彼方:世界书}}后', 启用: true }],
    }) as any,
  );
  const 全文 = r.messages.map(m => m.content).join('\n');
  ok('[I5] 占位符本体没有原样留下', !全文.includes('{{彼方:'), 全文.slice(0, 120));
  ok('[I5] 零件内容插到了写的位置', r.messages[0].content.includes('前') && r.messages[0].content.includes('后'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C2] 未知占位符: 忽略 + 指名道姓 warn');
{
  const 原 = console.warn;
  const 喊过: string[] = [];
  console.warn = (...args: any[]) => 喊过.push(args.join(' '));
  try {
    const r = buildUpdateMessages(
      造输入({ 自定义段: [{ 锚点: '最前', role: 'system', content: 'A{{彼方:世界舒}}B', 启用: true }] }) as any,
    );
    ok('[C2] 拼错的名字没有原样发给模型', !r.messages.map(m => m.content).join('').includes('{{彼方:'));
    ok('[C2] warn 里带了占位符原文', 喊过.some(s => s.includes('{{彼方:世界舒}}')), 喊过.join(' | '));
  }
  finally {
    console.warn = 原;
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C4] 重复引用: 首处生效, 其余忽略 + warn');
{
  const 原 = console.warn;
  const 喊过: string[] = [];
  console.warn = (...args: any[]) => 喊过.push(args.join(' '));
  try {
    const r = buildUpdateMessages(
      造输入({
        worldbook: 'WB-ONCE',
        自定义段: [{ 锚点: '最前', role: 'system', content: '{{彼方:世界书}} 和 {{彼方:世界书}}', 启用: true }],
      }) as any,
    );
    const 全文 = r.messages.map(m => m.content).join('\n');
    eq('[C4] 世界书内容只展开一次', 全文.split('WB-ONCE').length - 1, 1);
    ok('[C4] 第二次引用被忽略并 warn', 喊过.some(s => s.includes('重复引用')), 喊过.join(' | '));
  }
  finally {
    console.warn = 原;
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C5] 场景判断只许 system 段引用');
{
  const 原 = console.warn;
  const 喊过: string[] = [];
  console.warn = (...args: any[]) => 喊过.push(args.join(' '));
  try {
    const r = buildUpdateMessages(
      造输入({
        context: '玩家走进广场',
        自定义段: [{ 锚点: '最前', role: 'user', content: '{{彼方:场景判断}}', 启用: true }],
      }) as any,
    );
    const 全文 = r.messages.map(m => m.content).join('\n');
    // 场景判断是 system 段 —— 若它出现在任何 **user** 消息里, 说明 user 段引用被错误展开了
    const 进了user段 = r.messages.some(m => m.role === 'user' && m.content.includes('玩家走进广场'));
    ok('[C5] user 段引用场景判断 → 没有展开进 user 消息', !进了user段);
    // 它仍在默认位置(被拒绝的引用不该顺手把它删掉)
    ok('[C5] 被拒绝后仍在默认位置(system 段里)', 全文.includes('玩家走进广场'));
    ok('[C5] warn 说明了原因', 喊过.some(s => s.includes('只能被 system')), 喊过.join(' | '));
  }
  finally {
    console.warn = 原;
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C1b] 承重件关闭: 二级要说出"会编造", 一级要说出"不是 JSON"');
{
  const 原W = console.warn;
  const 喊过: string[] = [];
  console.warn = (...args: any[]) => 喊过.push(args.join(' '));
  try {
    buildUpdateMessages(造输入({ 关闭零件: ['R5'] }) as any);
    buildUpdateMessages(造输入({ 关闭零件: ['D1'] }) as any);
    ok('[C1b] R5(一级) 的 warn 说了输出不是 JSON', 喊过.some(s => s.includes('输出要求') && s.includes('JSON')), 喊过.join(' | '));
    ok('[C1b] D1(二级) 的 warn 说了会凭空编造', 喊过.some(s => s.includes('最近正文回复') && s.includes('凭空')), 喊过.join(' | '));
  }
  finally {
    console.warn = 原W;
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[V1] 拼装清单: 每个零件都有去向与字数');
{
  const 原T = console.table;
  let 表格: any[] | null = null;
  console.table = (数据: any) => {
    表格 = 数据;
  };
  try {
    buildUpdateMessages(造输入({ 关闭零件: ['D2'] }) as any);
    ok('[V1] 非默认配置时打了清单', 表格 !== null);
    if (表格) {
      const 行 = 表格 as any[];
      eq('[V1] 清单覆盖全部零件', 行.length, 零件表.length);
      ok('[V1] D2 被标成已关闭', 行.some((项: any) => 项.代号 === 'D2' && 项.状态 === '已关闭'));
      ok('[V1] 每项都有位置字段', 行.every((项: any) => typeof 项.位置 === 'string'));
      ok('[V1] 每项都有字数', 行.every((项: any) => typeof 项.字数 === 'number'));
      // V4: 静默跳过必须留痕 —— 关掉的那一项必须在清单里看得见
      ok('[V4] 被跳过的零件在清单里有痕迹', 行.some((项: any) => 项.状态 === '已关闭' || 项.状态 === '空'));
    }
  }
  finally {
    console.table = 原T;
  }
  // V2: 全默认时不打清单(不产生噪音)
  const 原T2 = console.table;
  let 表格2: any[] | null = null;
  console.table = (数据: any) => {
    表格2 = 数据;
  };
  try {
    buildUpdateMessages(造输入({}) as any);
    ok('[V2] 全默认时不打清单(不产生噪音)', 表格2 === null);
  }
  finally {
    console.table = 原T2;
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[零件表] 结构自检: 17 个 / 承重件有后果说明 / 切片拼回去 === 原文');
{
  eq('[零件表] 零件数 17', 零件表.length, 17);
  const 重号 = 零件表.map(件 => 件.代号).filter((代号, i, 全) => 全.indexOf(代号) !== i);
  eq('[零件表] 代号不重复', 重号, []);
  const 重名 = 零件表.map(件 => 件.名).filter((名, i, 全) => 全.indexOf(名) !== i);
  eq('[零件表] 名字不重复', 重名, []);
  ok(
    '[零件表] 每个承重件都写了关掉后果',
    零件表.filter(件 => 件.承重).every(件 => !!件.关掉后果),
  );
  eq('[零件表] 承重件共 4 个(一级 2 + 二级 2)', 零件表.filter(件 => 件.承重).length, 4);

  // 切片拼回去 === 原文(结构保证, 用一条断言把它钉住)
  const 样本文 = '\n核心原则:\nAAA\nNPC 判定:\nBBB\n状态卡字段(x):\nCCC\n输出要求:\nDDD';
  const 片 = 切规则零件(样本文);
  eq('[零件表] 四段拼回去 === 原文', 片.map(p => p.内容).join(''), 样本文);
  // 负样本: 切点缺失时降级成"整体归 R2", 不切坏
  const 片2 = 切规则零件('没有切点的正文');
  eq('[零件表] 找不到切点时降级: 整体归 R2', 片2.map(p => p.内容).join(''), '没有切点的正文');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[占位符] 语法: 嵌在词中间 / 全角冒号 / 前后空格');
{
  eq('[占位符] 嵌在词中间能扫到', 扫占位符('前{{彼方:世界书}}后').length, 1);
  eq('[占位符] 全角冒号也认', 扫占位符('{{彼方：世界书}}').length, 1);
  eq('[占位符] 名字前后空格能容忍', 扫占位符('{{彼方: 世界书 }}')[0]?.写的名, '世界书');
  eq('[占位符] 普通文本扫不到', 扫占位符('这里没有占位符').length, 0);
  eq('[占位符] 酒馆宏不会被误认', 扫占位符('{{user}} 与 {{char}}').length, 0);
  // 空段/空文本不炸
  eq('[占位符] 空文本返回空数组', 扫占位符('').length, 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清单摘要] 一句话说得清');
{
  const 摘要 = 清单摘要([
    { 代号: 'D1', 名: 'x', 状态: '进对话', 位置: '对话', 字数: 10 },
    { 代号: 'D2', 名: 'y', 状态: '已关闭', 位置: '—', 字数: 0 },
  ]);
  ok('[摘要] 含总件数', 摘要.includes('2 件'), 摘要);
  ok('[摘要] 含已关闭数', 摘要.includes('1 已关闭'), 摘要);
  ok('[摘要] 含合计字数', 摘要.includes('合计 10 字'), 摘要);
  ok('[摘要] 全默认时是默认配置', 是默认配置([
    { 代号: 'D1', 名: 'x', 状态: '进对话', 位置: '对话', 字数: 10 },
  ]));
  ok('[摘要] 有关闭项时不是默认配置', !是默认配置([
    { 代号: 'D1', 名: 'x', 状态: '已关闭', 位置: '—', 字数: 0 },
  ]));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
