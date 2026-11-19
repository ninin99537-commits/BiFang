// 彼方 · 提示词零件化 —— 批次: 2026-11-19
//   第一批(I3 + V1 立起来) / 第二批(V1 补序号+角色、跨锚点穷举、I1–I10 性质校验+随机 200 组)
//
// 为什么先立 I3 和 V1: 它们是"后面拆得再多也不算数"的前提。
//   I3 · 全默认逐字节: 不引用、不关闭任何零件时, 输出与**改造前**逐字节相同。
//        判据是 fixtures/bifang-prompt-改造前.json —— 那份快照是**动代码之前**采的
//        (规矩 §十二 #24: 有些事实只在某一刻为真, 事后取到的是"改完之后")。
//   V1 · 拼装清单必可得: 每次拼装能拿到"每个零件进了哪、多少字、为什么没进"。
//
// 为什么 I3 不能靠既有 152 条伪装/工具测试代劳:
//   那些用例**全跑默认配置**, 所以默认配置下它们当然全绿 —— 但它们是绿在"输出恰好相同",
//   不是绿在"逐字节相同"。实现若改了路径而输出碰巧一致, 它们照样绿, 而 I3 已经破了。
//   所以 I3 必须是一条**独立的、对着改造前快照逐字节比对**的断言。
//
// 为什么性质校验单独一个 helper(tests/helpers/彼方-零件不变量.ts):
//   21 个零件 × 开关/引用/全进工具/伪装的组合是天文数字, 穷举没有意义。
//   正确的形状是"性质写成函数, 随机生成配置喂给它" —— 组合覆盖靠随机性, 正确性靠不变量。
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { 零件表, 扫占位符, 切规则零件, 清单摘要, 是默认配置 } from '../src/彼方_NPC幕后生命状态系统/零件表';
import { 校验全部, type 拼装结果 } from './helpers/彼方-零件不变量';
import 提示词源码 from '../src/彼方_NPC幕后生命状态系统/prompts.ts?raw';
// I3 的基准。**2026-11-19 重采过一次**：用户裁定「现在的伪装可以去掉了」，
// 那是一次**有意的行为变更**，旧快照（含伪装）不再是基准。
// 现在这份是"去掉伪装之后、零件化之前"的产物 —— 零件化必须与它逐字节一致。
import 快照文本 from './fixtures/bifang-prompt-去伪装后.json?raw';

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

/** 快照里那几种组合对应的输入(必须与生成器里的一致)
 *
 *  ⚠ 「登记归档」那一组已删除（2026-11-19 用户裁定：开关删除，身份句归模板文字）。
 *  那条断言没有消失，只是换了地方 —— `bifang-破限两层.test.ts` 的 `[C]` 现在断言
 *  "传 `登记归档: true` 不再改变产物"。这里不再拿它当 I3 的一组，
 *  因为**基准快照里那一组是开关还活着时采的**，拿它比会永远红（而那不是缺陷）。 */
const 组合: Record<string, Record<string, any>> = {
  默认: {},
  带场景判断: { context: '主角走进广场。' },
  全进工具: { 规则进工具: true },
  全进工具带场景: { 规则进工具: true, context: '主角走进广场。' },
  生理开: { physioEnabled: true },
};

// ─────────────────────────────────────────────────────────────
console.log('\n[I3] 全默认逐字节: 与基准快照比(这是整个功能的刹车)');
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
console.log('\n[V1-第二批] 位置必须带"第几条消息(序号 + 角色)", 且从实际输出里找');
{
  const 原T = console.table;
  let 表格: any[] | null = null;
  console.table = (数据: any) => {
    表格 = 数据;
  };
  try {
    // 伪装开(不关零件也要打清单: 因为关闭了一个零件)
    buildUpdateMessages(造输入({ 关闭零件: ['D2'] }) as any);
  }
  finally {
    console.table = 原T;
  }
  ok('[V1] 伪装路径也打清单', 表格 !== null);
  const 行 = (表格 ?? []) as any[];
  // 位置必须形如 "第 2 条 user" —— 有序号、有角色
  const 带序号的 = 行.filter((项: any) => /^第 \d+ 条 (user|assistant|system)$/.test(项.位置));
  ok('[V1] 至少有一项位置带"第 N 条 角色"', 带序号的.length > 0, JSON.stringify(行.map((项: any) => 项.位置)));
  ok('[V1] 每一处进对话的零件都有序号+角色', 行
    .filter((项: any) => 项.状态 === '进对话')
    .every((项: any) => /^第 \d+ 条 (user|assistant|system)$/.test(项.位置)), JSON.stringify(行.map((项: any) => [项.代号, 项.位置])));
  // 负样本自证: 位置不是从"意图"推的 —— 若从意图推, 序号会是固定的;
  // 从实际输出找, 序号会随结构变化。用两种不同结构比一次。
  ok('[V1] 位置来自实际输出(不同结构 → 序号不同)',
    new Set(行.map((项: any) => 项.位置)).size > 1,
    JSON.stringify(行.map((项: any) => 项.位置)));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[V1-第二批] 被关闭(有内容) 与 被关闭(空) 必须分开标');
{
  const 原T = console.table;
  let 表格: any[] | null = null;
  console.table = (数据: any) => {
    表格 = 数据;
  };
  try {
    // D1 有内容, D2 世界书为空(默认输入里 worldbook: '')
    buildUpdateMessages(造输入({ 关闭零件: ['D1', 'D2'] }) as any);
  }
  finally {
    console.table = 原T;
  }
  const 行 = (表格 ?? []) as any[];
  const D1 = 行.find((项: any) => 项.代号 === 'D1');
  const D2 = 行.find((项: any) => 项.代号 === 'D2');
  ok('[V1] D1(有内容) 标成「被关闭(N 字)」', /^被关闭\(\d+ 字\)$/.test(String(D1?.备注 ?? '')), String(D1?.备注));
  ok('[V1] D2(本来就空) 标成「被关闭(空)」', D2?.备注 === '被关闭(空)', String(D2?.备注));
  ok('[V1] 两者确实不同(这条断言能区分它们)', D1?.备注 !== D2?.备注);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[L] 跨锚点"首处": 5 个锚点两两穷举(不再只测一种)');
{
  const 锚点们 = ['最前', '主提示词之后', '任务之前', '任务之后', '最后'];
  // 全扫写法: 每对锚点都验一次 —— 按锚点表顺序在前的那一处生效, 另一处被忽略。
  // 注意"哪一处生效"的判据是**锚点表顺序**, 不是参数顺序: `扫零件引用` 按锚点表遍历,
  // 而锚点表就是消息里的实际先后。所以传参 (甲, 乙) 与 (乙, 甲) 结果应当一致。
  let 组合数 = 0;
  for (const 甲 of 锚点们) {
    for (const 乙 of 锚点们) {
      if (甲 === 乙)
        continue;
      组合数++;
      const 原W = console.warn;
      console.warn = () => {};
      let r;
      try {
        r = buildUpdateMessages(
          造输入({
            worldbook: 'WB-唯一标记',
            自定义段: [
              { 锚点: 甲, role: 'system', content: `${甲}:{{彼方:世界书}}`, 启用: true },
              { 锚点: 乙, role: 'system', content: `${乙}:{{彼方:世界书}}`, 启用: true },
            ],
          }) as any,
        );
      }
      finally {
        console.warn = 原W;
      }
      const 全文 = r.messages.map(m => m.content).join('\n');
      const 次数 = 全文.split('WB-唯一标记').length - 1;
      ok(`[L] ${甲}→${乙}: 世界书只展开一次`, 次数 === 1, `实际 ${次数} 次`);
      // 首处 = 锚点表顺序靠前的那个(与传参顺序无关)
      const 该有 = 锚点们.indexOf(甲) < 锚点们.indexOf(乙) ? 甲 : 乙;
      const 不该有 = 该有 === 甲 ? 乙 : 甲;
      // 断言写法: 找到"以该锚点名开头"的那条消息, 它必须含标记。
      // **不能**写成 `includes(`${该有}:WB-唯一标记`)` —— 展开后锚点名与标记之间
      // 隔着世界书段的标题(约 200 字), 那种拼法永远不匹配(第一批的 L 组就错在这)。
      const 该锚点的消息 = r.messages.find(m => m.content.startsWith(`${该有}:`));
      ok(
        `[L] ${甲}→${乙}: 展开在「${该有}」(锚点表靠前的那个)`,
        !!该锚点的消息 && 该锚点的消息.content.includes('WB-唯一标记'),
        `找不到以「${该有}:」开头的消息, 或它不含标记`,
      );
      const 不该锚点的消息 = r.messages.find(m => m.content.startsWith(`${不该有}:`));
      ok(
        `[L] ${甲}→${乙}: 「${不该有}」那处的占位符被忽略(只剩前缀)`,
        !不该锚点的消息 || !不该锚点的消息.content.includes('WB-唯一标记'),
      );
    }
  }
  eq('[L] 穷举了 5×4=20 对锚点组合', 组合数, 20);
  // **这条是 [L] 的核心发现**: 锚点表顺序**最后一个**的锚点, 在任何两两组合里
  // 都不可能成为"首处"(因为它后面没有别的锚点了)。这不是缺陷 —— 它说明
  // "首处"的定义域是"锚点表里靠前的那个", 天然把最后一个排除在外。
  // 写下来是为了让后来人知道 20 对不是"每个锚点各当 4 次首处"。
  {
    const 首处次数 = new Map<string, number>();
    for (const 甲 of 锚点们) {
      for (const 乙 of 锚点们) {
        if (甲 === 乙)
          continue;
        const 该有 = 锚点们.indexOf(甲) < 锚点们.indexOf(乙) ? 甲 : 乙;
        首处次数.set(该有, (首处次数.get(该有) ?? 0) + 1);
      }
    }
    eq('[L] 锚点表最后一个(「最后」)永远不可能是"首处"', 首处次数.get('最后') ?? 0, 0);
    eq('[L] 锚点表第一个(「最前」)在 8 对里当首处', 首处次数.get('最前'), 8);
    // 自证: 前 4 个锚点都当过首处(不是只有"最前"一个)
    ok('[L] 前 4 个锚点都当过"首处"',
      ['最前', '主提示词之后', '任务之前', '任务之后'].every(名 => (首处次数.get(名) ?? 0) > 0),
      JSON.stringify([...首处次数.entries()]));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I1–I10] 性质校验: 手工边界用例全部过一遍');
{
  // 零件原始内容由**实现**给(取零件内容表), 不由测试猜边界。
  // 第一批的教训: 我用"从标记切到下一个标记"猜, 结果 R5 的"内容"吞掉了后面所有段,
  // 于是 I6 报"R5 找不到"(它找到的是个超集, 反而对不上), 25 条假红。
  // 边界只有实现知道 —— 让它给。
  const 造结果 = (额外: Record<string, any>, 关闭: string[] = [], 引用: string[] = []): 拼装结果 => {
    const 输入 = 造输入({ ...额外, 关闭零件: 关闭 });
    const 原W = console.warn;
    const 原I = console.info;
    const 原T = console.table;
    const 警告们: string[] = [];
    console.warn = (...a: any[]) => 警告们.push(a.join(' '));
    console.info = () => {};
    console.table = () => {};
    let r;
    try {
      r = buildUpdateMessages(输入 as any);
    }
    finally {
      console.warn = 原W;
      console.info = 原I;
      console.table = 原T;
    }
    return {
      messages: r.messages,
      工具说明: r.工具说明,
      配置: { 关闭, 引用, 全进工具: !!额外.规则进工具, 输入: 额外 },
      零件原始内容: r.零件内容 ?? {},
      警告们,
    };
  };

  // 基线(全默认) —— I4 需要, 且必须是**同一路径 + 同一条件**。
  // 所以每个配置各自生成自己的基线(只把"关闭"清空), 不是全局共用一份。
  const 造基线 = (额外: Record<string, any>) => 造结果(额外, []);

  const 配置们: { 名: string; 额外: Record<string, any>; 关闭?: string[] }[] = [
    { 名: '默认', 额外: {} },
    { 名: '全进工具', 额外: { 规则进工具: true } },
    { 名: '生理开', 额外: { physioEnabled: true } },
    { 名: '关 D2', 额外: {}, 关闭: ['D2'] },
    { 名: '关 R5(承重一级)', 额外: {}, 关闭: ['R5'] },
    { 名: '关 D1(承重二级)', 额外: {}, 关闭: ['D1'] },
    { 名: '关 R6+R7', 额外: {}, 关闭: ['R6', 'R7'] },
  ];

  for (const { 名, 额外, 关闭 } of 配置们) {
    const 结果 = 造结果(额外, 关闭 ?? []);
    const 违反们 = 校验全部(结果, {
      警告们: 结果.警告们,
      基线: 造基线(额外),
      再拼一次: () => 造结果(额外, 关闭 ?? []),
    });
    ok(
      `[I1-I10] ${名}: 无违反`,
      违反们.length === 0,
      违反们.map(v => `${v.不变量}: ${v.说明}`).join(' | '),
    );
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I1–I10 · 随机 200 组] 性质校验: 随机配置全部过一遍');
{
  // 固定种子的伪随机 —— 可复现。失败时要能重跑同一批(规矩 §十二 #20: 偶发必须先能稳定复现)。
  let 种子 = 20261119;
  const 随机 = () => {
    种子 = (种子 * 1664525 + 1013904223) % 4294967296;
    return 种子 / 4294967296;
  };
  const 选一个 = <T>(数组: T[]): T => 数组[Math.floor(随机() * 数组.length)];
  const 可搬迁 = 零件表.filter(件 => 件.可搬迁);
  const 锚点们 = ['最前', '主提示词之后', '任务之前', '任务之后', '最后'];

  const 拼 = (额外: Record<string, any>, 关闭: string[], 段们: any[]): 拼装结果 => {
    const 输入 = 造输入({ ...额外, 关闭零件: 关闭, 自定义段: 段们 });
    const 原W = console.warn;
    const 原I = console.info;
    const 原T = console.table;
    const 警告们: string[] = [];
    console.warn = (...a: any[]) => 警告们.push(a.join(' '));
    console.info = () => {};
    console.table = () => {};
    let r;
    try {
      r = buildUpdateMessages(输入 as any);
    }
    finally {
      console.warn = 原W;
      console.info = 原I;
      console.table = 原T;
    }
    return {
      messages: r.messages,
      工具说明: r.工具说明,
      配置: {
        关闭,
        引用: 段们
          .map(s => 零件表.find(件 => s.content.includes(`{{彼方:${件.名}}}`))?.代号 ?? '')
          .filter(Boolean),
        全进工具: !!额外.规则进工具,
        输入: 额外,
      },
      零件原始内容: r.零件内容 ?? {},
      警告们,
    };
  };

  let 违反总数 = 0;
  let 违反组数 = 0;
  let i4跳过组数 = 0;
  let i4执行组数 = 0;
  const 违反样例: string[] = [];

  for (let i = 0; i < 200; i++) {
    const 额外: Record<string, any> = {};
    if (随机() < 0.4)
      额外.规则进工具 = true;
    if (随机() < 0.4)
      额外.physioEnabled = true;
    if (随机() < 0.5)
      额外.autoTrackEnabled = false;
    const 关闭数 = Math.floor(随机() * 4);
    const 关闭: string[] = [];
    for (let k = 0; k < 关闭数; k++) {
      const 件 = 选一个(零件表);
      if (!关闭.includes(件.代号))
        关闭.push(件.代号);
    }
    const 段们: any[] = [];
    const 引用数 = Math.floor(随机() * 3);
    for (let k = 0; k < 引用数; k++) {
      const 件 = 选一个(可搬迁);
      if (关闭.includes(件.代号))
        continue;
      段们.push({
        锚点: 选一个(锚点们),
        role: 随机() < 0.5 ? 'system' : 'user',
        content: `前缀{{彼方:${件.名}}}后缀`,
        启用: true,
      });
    }

    const 结果 = 拼(额外, 关闭, 段们);
    // I4(关闭不移序)只在**没有引用**时可用: 引用会把零件搬到用户指定的位置,
    // 那本来就该改顺序 —— 用它当基线会把正确行为判成违反。
    // 基线必须同路径 + 同条件(helper 里会自检, 不匹配就跳过并打原因)。
    const 可用基线 = 结果.配置.引用.length === 0;
    if (!可用基线)
      i4跳过组数++;
    else
      i4执行组数++;
    const 违反们 = 校验全部(结果, {
      警告们: 结果.警告们,
      基线: 可用基线 ? 拼(额外, [], []) : undefined,
      再拼一次: () => 拼(额外, 关闭, 段们),
    });
    if (违反们.length > 0) {
      违反组数++;
      违反总数 += 违反们.length;
      if (违反样例.length < 5) {
        违反样例.push(
          `组#${i} [关闭=${关闭.join(',') || '无'}] [引用=${结果.配置.引用.join(',') || '无'}] [进表=${结果.配置.全进工具}] `
          + 违反们.map(v => `${v.不变量}:${v.说明}`).join(' | '),
        );
      }
    }
  }

  eq('[随机 200] 违反组数 = 0', 违反组数, 0);
  eq('[随机 200] 违反总数 = 0', 违反总数, 0);
  // **自证: 这两条是防"假绿"的** —— 200 组若全被跳过, 上面两条照样绿,
  // 而实际什么都没测。必须证明两支都跑到了。
  ok('[随机 200] I4 被真正执行过(不只是跳过)', i4执行组数 > 0, `执行 ${i4执行组数} 组 / 跳过 ${i4跳过组数} 组`);
  ok('[随机 200] I4 也有被跳过的组(两支都跑到)', i4跳过组数 > 0, `执行 ${i4执行组数} 组 / 跳过 ${i4跳过组数} 组`);
  // 这两支的**数量关系不写死** —— 它取决于随机里"引用非空"的概率,
  // 而那是我随手定的 0.5/0.3, 不是一个有意义的不变量(规矩 §十二 #15: 判据别写快照)。
  // 只要求两支都 > 0, 上面两条已经够了。
  if (违反样例.length > 0)
    console.log(`  违反样例:\n    ${违反样例.join('\n    ')}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[V1-第三批] 条件段(R6/R7)必须报真实体量, 不许拿特征串长度充数');
{
  // 为什么这条必须存在(需求方 2026-11-19 纠正过我的定性):
  //   R6/R7 的文字分散在 4 处, 实现手上只有一段**特征串**(12 字)用来判"在不在"。
  //   拿它当字数就是**假账** —— 实测 R6 真实 5333 字而清单报 12 字, 差 444 倍。
  //   用户关了 R6, 清单说"省了 12 字"、实际省了 5333 字。
  //   这与"文案说 A 实际发 B"是同一类, 不是"显示问题"。
  const 看清单 = (额外: Record<string, any>) => {
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    try {
      return buildUpdateMessages(造输入({ 关闭零件: ['D2'], ...额外 }) as any).拼装清单 ?? [];
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
  };
  const 取 = (清单: any[], 号: string) => 清单.find((项: any) => 项.代号 === 号);

  // ① 开着时: 字数必须接近真实差值, 不能是特征串的 12 字
  const 开 = 看清单({ physioEnabled: true, 恋爱对象名单: ['甲'] });
  const R6开 = 取(开, 'R6');
  const R7开 = 取(开, 'R7');
  ok('[V1] R6 开着时报的字数远大于特征串(12 字)', (R6开?.字数 ?? 0) > 1000, `实际 ${R6开?.字数}`);
  ok('[V1] R7 开着时报的字数远大于特征串(12 字)', (R7开?.字数 ?? 0) > 500, `实际 ${R7开?.字数}`);

  // ② 字数必须等于**真实差值**: 与"关掉它"的总长差比
  const 总长 = (额外: Record<string, any>) => {
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    try {
      const r = buildUpdateMessages(造输入({ 关闭零件: ['D2'], ...额外 }) as any);
      return [...r.messages.map(m => m.content), r.工具说明 ?? ''].join('\n').length;
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
  };
  const 生理真实差值 = 总长({ physioEnabled: true }) - 总长({ physioEnabled: false });
  eq('[V1] R6 报的字数 === 真实差值(有它 - 没它)', R6开?.字数, 生理真实差值);
  const 恋爱真实差值 = 总长({ 恋爱对象名单: ['甲'] }) - 总长({ 恋爱对象名单: [] });
  eq('[V1] R7 报的字数 === 真实差值', R7开?.字数, 恋爱真实差值);

  // ③ 关掉时: 备注必须说出"本来省了多少", 且那个数也是真实体量
  const 关 = 看清单({ physioEnabled: true, 关闭零件: ['D2', 'R6'] });
  const R6关 = 取(关, 'R6');
  eq('[V1] 关掉 R6 时备注写的是真实体量', R6关?.备注, `被关闭(${生理真实差值} 字)`);

  // ④ 负样本自证: 这条断言能拦住"拿特征串充数"
  //    若实现改回用特征串长度, ①②③ 会一起红(特征串是 12 字, 差 500 倍)
  ok('[V1/自证] 真实体量与特征串长度确实不同(否则这条断言没意义)',
    生理真实差值 !== 12 && R6开?.字数 !== 12,
    `真实 ${生理真实差值} vs 特征串 12`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[切散] 零件被切散在两处时, 清单必须指认, 不许只报第一处');
{
  // 现状: 每个零件都在一处(条件段 R6/R7 例外 —— 它们本来就分散, 用"分散在规则与任务段里"标)
  // 这条断言防的是**将来**把某个零件切散(比如把 R3 拆成两段分别放两处)。
  //
  // 判据: 对每个非条件段的零件, 它在产物里的"出现次数"必须恰好是 1。
  // 若 > 1, 说明它被切散/重复了 —— 那时清单的"第 N 条"只报第一处, 会误导。
  const 原I = console.info;
  const 原T = console.table;
  console.info = () => {};
  console.table = () => {};
  let 结果;
  try {
    // **必须带非空 worldbook**: D2 在默认输入里是空串, 而"切散"断言按
    // "内容非空才数次数"判定 —— 空内容会被跳过, 于是"D2 被拼两次"这件事
    // 根本不会被看见, 变异用例就会假绿。这条是给 M5 准备的前提。
    结果 = buildUpdateMessages(造输入({ worldbook: 'WB-切散检测标记', 关闭零件: [] }) as any);
  }
  finally {
    console.info = 原I;
    console.table = 原T;
  }
  const 全文 = [...结果.messages.map(m => m.content), 结果.工具说明 ?? ''].join('\n');
  const 条件段 = new Set(['R6', 'R7']);
  const 切散: string[] = [];
  for (const [代号, 内容] of Object.entries(结果.零件内容 ?? {})) {
    if (条件段.has(代号) || !String(内容).trim())
      continue;
    const 次数 = 全文.split(String(内容)).length - 1;
    if (次数 > 1)
      切散.push(`${代号}×${次数}`);
  }
  eq('[切散] 没有零件被切散或重复', 切散, []);

  // 条件段的"分散"必须在清单里**显式标出来** —— 不许静默
  const 清单 = 结果.拼装清单 ?? [];
  for (const 号 of ['R6', 'R7']) {
    const 项 = (清单 as any[]).find((x: any) => x.代号 === 号);
    if (项 && 项.状态 !== '空' && 项.状态 !== '已关闭') {
      ok(`[切散] ${号} 是条件段, 清单里标了"分散"`, String(项.位置).includes('分散'), String(项.位置));
    }
  }
}
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

// ─────────────────────────────────────────────────────────────
console.log('\n[导出面] 静默 必须不在公开入参上(否则外部能静默关掉清单与 warn)');
{
  // 这条是**结构断言**, 不是行为断言: 它检查"公开类型里有没有 静默 这个字段"。
  // 为什么重要: `静默: true` 会让人拿不到清单、也看不到 warn —— 而清单与 warn
  // 正是这个功能的可诊断性(V1/V3)。给它一个外部口子 = 静默失效, 与整套设计前提相反。
  // 现在 `静默` 只在内部接口 `内部入参` 上, 公开的 `更新提示词入参` 没有它。
  //
  // 读源码做断言(而不是靠 tsc 探针): 探针要起子进程跑 tsc, 太慢, 不适合放进常驻套件。
  // 探针留在 tests/fixtures/bifang-probe-静默.mjs, 手工跑。
  // 源码用 `?raw` 导入(在 .build 下 import.meta.url 指向产物目录, 用不了相对路径)。
  const 源码 = 提示词源码;
  const 公开段 = 源码.slice(
    源码.indexOf('interface 更新提示词入参'),
    源码.indexOf('interface 内部入参'),
  );
  // **只查字段声明, 不查整段文本**: 注释里提到"静默"是合理的(比如解释为什么它不在这),
  // 断言要查的是"有没有 `静默?: boolean;` 这样的字段声明"。
  // 第一版我直接 `公开段.includes('静默')`, 于是被注释里的字样误伤 —— 假红。
  const 有字段声明 = (段: string, 名: string) => new RegExp(`^\\s*${名}\\?\\??\\s*:`, 'm').test(段);
  ok('[导出面] 公开入参 更新提示词入参 里没有 静默 字段', !有字段声明(公开段, '静默'));
  ok('[导出面] 公开入参里仍有 关闭零件 字段(证明取的是对的段落)', 有字段声明(公开段, '关闭零件'));
  // 自证: 内部接口里**应该**有它 —— 否则说明我们找错了地方
  const 内部段 = 源码.slice(源码.indexOf('interface 内部入参'), 源码.indexOf('function buildUpdateMessages'));
  ok('[导出面/自证] 内部入参 里确实有 静默 字段(说明这两段确实不同)', 有字段声明(内部段, '静默'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
