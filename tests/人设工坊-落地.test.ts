// 人设工坊 · 落地策略与角色名(#78)
//
// 用户定稿:
//   | 条目     | 标题   | 灯  | strategy                       | 内容                    |
//   | 角色人设 | 角色名 | 绿  | selective, keys:[角色名]       | 该角色完整人设          |
//   | 人物索引 | 人物索引 | 蓝 | constant, keys:[]              | 角色名 — 一句话介绍     |
// 理由: 人设绿灯 = 正文提到才进上下文, 没出场不占 context;
//       索引蓝灯 = 常驻让模型知道有哪些人, 每条很轻。
//
// 另钉住: 条目标题用**角色名**(从生成结果取), 取不到退回创作方向并标记兜底;
//         「人物索引」固定名, 已存在就更新, 绝不重复建条目。
import { 写入世界书, 写入人物索引, 人物索引条目名, 索引分隔, 剪贴板内容一致 } from '../src/人设工坊/lib/sink';
import { 从结果取姓名, 从结果取介绍, 取人设条目标题, 净化角色名 } from '../src/人设工坊/lib/取名';
import { 拆分人设 } from '../src/人设工坊/lib/拆分';
import { 模块索引 } from '../src/人设工坊/lib/modules';

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

// ── 世界书桩: 内存里一张表, 记录每次写入的条目 ─────────────────────────────
type 桩条目 = { uid: number; name: string; content: string; strategy?: unknown; enabled?: boolean; recursion?: unknown };
let 桩书: 桩条目[] = [];
let 建条次数 = 0;
const 调用 = { 建: [] as 桩条目[], 更新: [] as 桩条目[] };

function 装桩() {
  桩书 = [];
  建条次数 = 0;
  调用.建 = [];
  调用.更新 = [];
  (globalThis as any).getCharWorldbookNames = () => ({ primary: '主书', additional: [] });
  (globalThis as any).getChatWorldbookName = () => null;
  (globalThis as any).getWorldbook = async () => 桩书.map(条 => ({ ...条 }));
  (globalThis as any).createWorldbookEntries = async (_书: string, 新条目: 桩条目[]) => {
    建条次数++;
    调用.建.push(...新条目.map(条 => ({ ...条 })));
    for (const 条 of 新条目) 桩书.push({ uid: 桩书.length, ...条 });
    return { worldbook: 桩书, new_entries: 新条目 };
  };
  (globalThis as any).updateWorldbookWith = async (_书: string, 变换: (表: 桩条目[]) => 桩条目[]) => {
    const 后 = 变换(桩书.map(条 => ({ ...条 })));
    调用.更新.push(...后);
    桩书 = 后;
    return 桩书;
  };
}

/** 取某条条目的 strategy(断言用) */
function 策略(名: string) {
  return 桩书.find(条 => 条.name === 名)?.strategy as any;
}

/** 取某条条目**顶层**的 recursion(#240: 递归字段不在 strategy 里) */
function 递归(名: string) {
  return 桩书.find(条 => 条.name === 名)?.recursion as any;
}

console.log('\n[1] 角色人设条目: selective(绿灯) + keys 用角色名');
{
  装桩();
  await 写入世界书('李青梧', '## 基础信息与外貌\n姓名: 李青梧');
  const s = 策略('李青梧');
  check('type = selective(绿灯)', s.type, 'selective');
  check('keys = [角色名]', s.keys, ['李青梧']);
  ok('次要关键词给全(and_any + 空)', s.keys_secondary.logic === 'and_any' && s.keys_secondary.keys.length === 0);
  check('扫描深度 same_as_global', s.scan_depth, 'same_as_global');
  check('首次写入 = 新建一条', 建条次数, 1);
}

console.log('\n[2] 同名覆盖: 绝不产生重复条目');
{
  装桩();
  await 写入世界书('李青梧', '第一版');
  await 写入世界书('李青梧', '第二版');
  check('条目仍只有一条', 桩书.length, 1);
  check('内容被覆盖', 桩书[0].content, '第二版');
  check('第二次走更新(没再新建)', 建条次数, 1);
}

console.log('\n[3] keys 可显式传(同一角色多别名)');
{
  装桩();
  await 写入世界书('李青梧', '正文', ['李青梧', '青梧', '小李']);
  check('keys 原样传入', 策略('李青梧').keys, ['李青梧', '青梧', '小李']);
}

console.log('\n[4] 人物索引: constant(蓝灯) + keys 恒空, 固定条目名');
{
  装桩();
  await 写入人物索引('李青梧', '表面冷淡、心里全是账的人');
  const s = 策略(人物索引条目名);
  check('type = constant(蓝灯)', s.type, 'constant');
  check('keys 恒空', s.keys, []);
  check('条目名固定', 人物索引条目名, '人物索引');
  check('内容 = 角色名 — 介绍', 桩书[0].content, `李青梧${索引分隔}表面冷淡、心里全是账的人`);
}

console.log('\n[5] 人物索引: 多人累积, 同一角色只留一行');
{
  装桩();
  await 写入人物索引('李青梧', '表面冷淡');
  await 写入人物索引('沈砚', '笑面虎');
  await 写入人物索引('李青梧', '改过的介绍');
  const 行 = 桩书[0].content.split('\n');
  check('两条行(李/沈)', 行.length, 2);
  check('李青梧那行被更新', 行.find(l => l.startsWith(`李青梧${索引分隔}`)), `李青梧${索引分隔}改过的介绍`);
  ok('沈砚那行还在', !!行.find(l => l.startsWith(`沈砚${索引分隔}`)));
  check('索引条目只有一条', 桩书.filter(条 => 条.name === 人物索引条目名).length, 1);
  check('全程只新建一次条目', 建条次数, 1);
}

console.log('\n[6] 从结果取姓名: 伪 YAML 的几种常见写法');
{
  const 结果 = [
    '## 基础信息与外貌',
    '姓名: 李青梧',
    '年龄: 22',
  ].join('\n');
  check('标准姓名行', 从结果取姓名(结果), '李青梧');

  check('全角冒号', 从结果取姓名('## 基础信息与外貌\n姓名：沈砚'), '沈砚');
  check('带列表符号与加粗', 从结果取姓名('## 基础信息与外貌\n- **姓名**: 阿栀'), '阿栀');
  check('带书名号包裹', 从结果取姓名('## 基础信息与外貌\n姓名: 「阿栀」'), '阿栀');
  check('带括号补充(只取名)', 从结果取姓名('## 基础信息与外貌\n姓名: 阿栀（小名）'), '阿栀');
  check('标题有换行/空格差异也能命中', 从结果取姓名('## 基础信息与 外貌\n姓名: 阿栀'), '阿栀');
  check('只有 ### 子标题不算命中', 从结果取姓名('### 基础信息与外貌\n姓名: 阿栀'), '');
  check('没勾该模块 → 空', 从结果取姓名('## 性格锚定\n一句话'), '');
  check('模型没按格式写 → 空', 从结果取姓名('## 基础信息与外貌\n名字叫阿栀'), '');
}

console.log('\n[7] 从结果取介绍: 锚定段首行, **原样不截断**');
{
  // 2026-10-15 用户报「写入索引条目的介绍被截断了」。
  // 旧行为是「砍到第一个句末标点 + 再砍到 40 字」—— 把**合法的长单句**也切了半截。
  // 旧测试的名字叫「取第一句」, 等于把截断写成了意图 —— 所以它活了这么久。
  // 现在整行原样返回; 下面两条断言的就是"不许再截"。
  check('整行原样(不再只取第一句)', 从结果取介绍('## 性格锚定\n她是把爱当账本的人。第二句也要。'), '她是把爱当账本的人。第二句也要。');
  const 长句 = '很长的一句话'.repeat(20);
  check('超长无标点 → 原样不截', 从结果取介绍('## 性格锚定\n' + 长句), 长句);
  check('★ 对照组: 该输入确实超过旧上限 40', 长句.length > 40, true);
  check('没勾锚定 → 空', 从结果取介绍('## 基础信息与外貌\n姓名: 阿栀'), '');
}

console.log('\n[8] 净化角色名: 收敛但别切到半个词');
{
  check('去换行', 净化角色名('阿栀\n备注'), '阿栀');
  check('去星号', 净化角色名('**阿栀**'), '阿栀');
  check('去书名号', 净化角色名('《阿栀》'), '阿栀');
  check('去括号补充', 净化角色名('阿栀（小名）'), '阿栀');
  check('短名原样(未超上限不切)', 净化角色名('阿栀是一个名字很长的人。还有后半句'), '阿栀是一个名字很长的人。还有后半句');
  check('超长按句末标点收', 净化角色名('阿栀是一个名字很长的人。' + '还有后半句'.repeat(6)), '阿栀是一个名字很长的人。');
  ok('硬上限 24', 净化角色名('无名'.repeat(40)).length <= 24);
}

console.log('\n[9] 人设条目标题: 取到角色名 → 不兜底; 取不到 → 兜底并退创作方向');
{
  const 有 = 取人设条目标题('## 基础信息与外貌\n姓名: 阿栀', '一个冷静的刺客', 'user');
  check('用角色名', 有.名, '阿栀');
  check('不兜底', 有.兜底, false);

  const 无 = 取人设条目标题('## 性格锚定\n一句话', '一个冷静的刺客', 'user');
  check('退创作方向短名', 无.名, '一个冷静的刺客');
  check('标记兜底', 无.兜底, true);

  const 全空 = 取人设条目标题('', '', 'user');
  check('user 全空落「玩家」', 全空.名, '玩家');
  check('npc 全空落「未命名NPC」', 取人设条目标题('', '', 'npc').名, '未命名NPC');
}

console.log('\n[10] 空内容/空名字: 报错不静默');
{
  装桩();
  let 空内容报错 = false;
  try { await 写入世界书('阿栀', '   '); } catch { 空内容报错 = true; }
  ok('空内容 → 抛错', 空内容报错);

  let 空名报错 = false;
  try { await 写入人物索引('', '介绍'); } catch { 空名报错 = true; }
  ok('索引空角色名 → 抛错', 空名报错);

  (globalThis as any).getCharWorldbookNames = () => ({ primary: '', additional: [] });
  (globalThis as any).getChatWorldbookName = () => null;
  let 无书报错 = false;
  try { await 写入世界书('阿栀', '正文'); } catch { 无书报错 = true; }
  ok('没有可用世界书 → 抛错', 无书报错);
}

console.log('\n[11] 拆分人设(#124 1.2, kimicode 找茬后): 主锚点 # 角色, --- 只作次级');
{
  // user 模式: 永远一块
  const 单 = 拆分人设('## 基础信息与外貌\n姓名: 阿栀', 'user');
  check('user 模式一块', 单.length, 1);
  check('user 模式名字走从结果取姓名', 单[0].名, '阿栀');

  // npc 模式: 按 `# 角色：` 切
  const 双 = 拆分人设(
    '# 角色：李四\n## 基础信息与外貌\n介绍：一个爱开玩笑的修车工。\n---\n# 角色：王五\n## 基础信息与外貌\n介绍：沉默的图书管理员。',
    'npc',
  );
  check('按角色标题切成两块', 双.length, 2);
  check('第一块名字', 双[0].名, '李四');
  check('第二块名字', 双[1].名, '王五');
  check('第一块介绍来自 介绍: 行', 双[0].介绍, '一个爱开玩笑的修车工。');

  // ★ kimicode 复现的误切: 角色内容里有一行只有 ---, 不许把角色劈开
  const 误切 = 拆分人设(
    [
      '# 角色：李四',
      '## 基础信息与外貌',
      '介绍：一个爱开玩笑的修车工。',
      '## 背景故事',
      '他店里挂着一块旧木牌，上面只有一行字：',
      '---',
      '## 性格锚定',
      '嘴硬心软。',
      '---',
      '# 角色：王五',
      '## 基础信息与外貌',
      '介绍：沉默的图书管理员。',
    ].join('\n'),
    'npc',
  );
  check('内容里的 --- 不再误切(仍两块)', 误切.length, 2);
  check('第一块仍含被夹住的那段', 误切[0].正文.includes('嘴硬心软。'), true);

  // 代码块里的 --- 也不切
  const 代码块 = 拆分人设(
    ['# 角色：李四', '## 基础信息与外貌', '介绍：修车工。', '```', '---', '```', '# 角色：王五', '## 基础信息与外貌', '介绍：管理员。'].join('\n'),
    'npc',
  );
  check('代码块里的 --- 不切', 代码块.length, 2);

  // ★ #219 缺陷2: `# 角色：` 也要跳代码围栏(以前主锚点比次级信号更不鲁棒)
  const 标题在围栏内 = 拆分人设(
    ['# 角色：KIMI真角色', '## 基础信息与外貌', '介绍：真的。', '```', '# 角色：KIMI围栏里', '```'].join('\n'),
    'npc',
  );
  check('围栏内的 # 角色 不切(只 1 块)', 标题在围栏内.length, 1);
  check('围栏内那块名字是真角色', 标题在围栏内[0].名, 'KIMI真角色');
  ok('围栏内那行仍在正文里(没丢内容)', 标题在围栏内[0].正文.includes('# 角色：KIMI围栏里'));

  // ~~~ 围栏同样处理
  const 波浪围栏 = 拆分人设(
    ['# 角色：甲', '内容', '~~~', '# 角色：围栏里的', '~~~'].join('\n'),
    'npc',
  );
  check('~~~ 围栏内的 # 角色 也不切', 波浪围栏.length, 1);

  // 未闭合围栏: 其后所有 # 角色 都算围栏内(与 按分隔线切 行为一致)
  const 未闭合 = 拆分人设(['# 角色：甲', '内容', '```', '# 角色：之后的'].join('\n'), 'npc');
  check('未闭合围栏 → 其后标题不切', 未闭合.length, 1);

  // 围栏外的 # 角色 仍正常切(别把主路径修坏)
  const 围栏外 = 拆分人设(
    ['```', '代码', '```', '# 角色：甲', '内容', '# 角色：乙', '内容'].join('\n'),
    'npc',
  );
  check('围栏外的 # 角色 仍正常切', 围栏外.length, 2);

  // 没有角色标题时, --- 作次级信号
  const 次级 = 拆分人设('## 基础信息与外貌\n姓名: 甲\n---\n## 基础信息与外貌\n姓名: 乙', 'npc');
  check('无角色标题时退回 --- 切', 次级.length, 2);

  // CRLF: --- 后面紧跟 \r 也要能切(#141 F3)
  const crlf = 拆分人设('## 基础信息与外貌\n姓名: 甲\n---\r\n## 基础信息与外貌\n姓名: 乙', 'npc');
  check('CRLF 也能拆开', crlf.length, 2);

  // 切不出多块 → 退回一块(不丢内容)
  const 一块 = 拆分人设('# 角色：独苗\n## 基础信息与外貌\n介绍：只有一个人。', 'npc');
  check('单角色也返回一块', 一块.length, 1);
  check('单角色名字', 一块[0].名, '独苗');

  // 角色名带括号: 与 从结果取姓名 同一套归一化(#141 茬3)
  const 带括号 = 拆分人设('# 角色：李四(四哥)\n## 基础信息与外貌\n介绍：修车工。', 'npc');
  check('角色名里的括号被归一化截掉', 带括号[0].名, '李四');
}

console.log('\n[12] NPC 多角色落盘: 每角色一个条目, keys = 自己的名字(#124 1.2)');
{
  装桩();
  const 文本 = [
    '# 角色：李四',
    '## 基础信息与外貌',
    '介绍：一个爱开玩笑的修车工。',
    '## 性格锚定',
    '嘴硬心软。',
    '---',
    '# 角色：王五',
    '## 基础信息与外貌',
    '介绍：沉默的图书管理员。',
    '## 性格锚定',
    '话少但记性好。',
  ].join('\n');
  const { 写了 } = await 写入世界书('兜底名', 文本, ['兜底名'], 'npc');
  check('写了两个角色', 写了, ['李四', '王五']);
  check('世界书里有两条', 桩书.length, 2);
  check('第一条名字 = 李四', 桩书[0].name, '李四');
  check('第一条 keys = [李四]', 策略('李四').keys, ['李四']);
  check('第二条 keys = [王五](不是第一个人的名字)', 策略('王五').keys, ['王五']);
  ok('李四条目不含王五的内容', !桩书.find(条 => 条.name === '李四')!.content.includes('王五'));
  // #240: 递归字段在条目**顶层** recursion 对象里(不在 strategy 里 —— 写错层会被静默丢弃)
  check('李四条目 prevent_incoming = true', 递归('李四').prevent_incoming, true);
  check('李四条目 prevent_outgoing = true', 递归('李四').prevent_outgoing, true);
  check('李四条目 delay_until = null', 递归('李四').delay_until, null);
  check('王五条目 prevent_incoming = true', 递归('王五').prevent_incoming, true);
  check('王五条目 prevent_outgoing = true', 递归('王五').prevent_outgoing, true);
  // 反面对照: strategy 里**不许**有这两个错名字(以前写错层的痕迹)
  ok('strategy 里没有 excludeRecursion(错层)', !('excludeRecursion' in (策略('李四') ?? {})));
  ok('strategy 里没有 preventRecursion(错层)', !('preventRecursion' in (策略('李四') ?? {})));
}

console.log('\n[12b] #240 递归标记: 在条目顶层, 两条条目都有, 且同名覆盖后仍在');
{
  装桩();
  // 人设条目(绿灯)
  await 写入世界书('李青梧', '第一版');
  const 人设递归 = 递归('李青梧');
  check('人设条目 prevent_incoming', 人设递归.prevent_incoming, true);
  check('人设条目 prevent_outgoing', 人设递归.prevent_outgoing, true);
  check('人设条目 delay_until 给全(null)', 人设递归.delay_until, null);
  // 其余字段一个不动
  const 人设策略 = 策略('李青梧');
  check('灯色仍是 selective(绿灯)', 人设策略.type, 'selective');
  check('keys 仍是角色名', 人设策略.keys, ['李青梧']);
  check('扫描深度不变', 人设策略.scan_depth, 'same_as_global');
  const 人设位置 = (桩书[0] as { position?: { type?: string; order?: number } }).position;
  check('position 仍是角色定义之前', 人设位置?.type, 'before_character_definition');
  check('position.order 仍是 100', 人设位置?.order, 100);

  // 同名覆盖后标记仍在(覆盖分支不许丢)
  await 写入世界书('李青梧', '第二版');
  const 覆盖后递归 = 递归('李青梧');
  check('覆盖后 prevent_incoming 仍在', 覆盖后递归.prevent_incoming, true);
  check('覆盖后 prevent_outgoing 仍在', 覆盖后递归.prevent_outgoing, true);
  check('覆盖后 delay_until 仍在', 覆盖后递归.delay_until, null);
  check('覆盖后内容更新了', 桩书[0].content, '第二版');

  // 人物索引条目(蓝灯)也有
  await 写入人物索引('李青梧', '表面冷淡');
  const 索引递归 = 递归(人物索引条目名);
  check('索引条目 prevent_incoming', 索引递归.prevent_incoming, true);
  check('索引条目 prevent_outgoing', 索引递归.prevent_outgoing, true);
  const 索引策略 = 策略(人物索引条目名);
  check('索引仍是 constant(蓝灯)', 索引策略.type, 'constant');
  check('索引 keys 仍恒空', 索引策略.keys, []);
}

console.log('\n[13] 空名 / 重名: 响亮抛错, 不静默覆盖(#141 F2)');
{
  装桩();
  // 两块都解析不出名字 → 抛错, 不静默覆盖
  let 空名报错 = false;
  try {
    await 写入世界书('', '## 基础信息与外貌\n没有姓名字段\n---\n## 基础信息与外貌\n也没有', [''], 'npc');
  } catch {
    空名报错 = true;
  }
  ok('解析不出名字 → 抛错', 空名报错);

  // 重名 → 抛错
  装桩();
  let 重名报错 = false;
  try {
    await 写入世界书('', '# 角色：李四\n内容A\n---\n# 角色：李四\n内容B', [''], 'npc');
  } catch {
    重名报错 = true;
  }
  ok('重名 → 抛错(不静默覆盖)', 重名报错);
}

console.log('\n[14] NPC 多角色人物索引: 每个角色一行(#141 F1)');
{
  装桩();
  const 文本 = [
    '# 角色：李四',
    '## 基础信息与外貌',
    '介绍：一个爱开玩笑的修车工。',
    '---',
    '# 角色：王五',
    '## 基础信息与外貌',
    '介绍：沉默的图书管理员。',
  ].join('\n');
  const { 写了 } = await 写入人物索引('兜底名', '兜底介绍', 'npc', 文本);
  check('索引写了两个角色', 写了, ['李四', '王五']);
  const 行 = 桩书.find(条 => 条.name === 人物索引条目名)!.content.split('\n');
  check('索引有两行', 行.length, 2);
  check('李四那行带自己的介绍', 行[0], `李四${索引分隔}一个爱开玩笑的修车工。`);
  check('王五那行带自己的介绍', 行[1], `王五${索引分隔}沉默的图书管理员。`);
}

console.log('\n[15] 批次 1 的提示词改动: nsfw 占位符 / 黑话 / 介绍字段');
{
  const nsfw = 模块索引.nsfw_body.prompt;
  ok('nsfw 六个占位符都在', ['{{orientation}}', '{{experience}}', '{{role}}', '{{habits}}', '{{kinks}}', '{{limits}}'].every(s => nsfw.includes(s)));
  ok('nsfw 不再硬编码中文字段名列表', !nsfw.includes('字段：性取向 / 性经验'));

  const 亮点 = 模块索引.highlight.prompt;
  ok('亮点不再用黑话「鸡蛋火腿肠」', !亮点.includes('鸡蛋火腿肠'));
  ok('亮点不再用黑话「鲱鱼罐头」', !亮点.includes('鲱鱼罐头'));
  ok('亮点换成自解释说法', 亮点.includes('乍一看有点惊讶，稍微想想又觉得'));
  ok('真实感换了自解释说法', 亮点.includes('真实感就是**理解成本**'));
  ok('空值时整行跳过(有 #if 护栏)', 亮点.includes('{{#if spark}}') && 亮点.includes('{{#if grounding}}'));

  const basic = 模块索引.basic.prompt;
  ok('basic 要求写「介绍」一栏', basic.includes('「介绍」一栏必须写'));
  ok('basic 提醒姓名别加括号', basic.includes('姓名一栏不要加括号补充'));

  // 从结果取介绍: 优先读「介绍:」行
  const 有介绍 = '## 基础信息与外貌\n姓名: 阿栀\n介绍: 一个总在深夜修钟表的人。\n## 性格锚定\n她是把爱当账本的人。';
  check('优先读介绍行', 从结果取介绍(有介绍), '一个总在深夜修钟表的人。');
  const 无介绍 = '## 基础信息与外貌\n姓名: 阿栀\n## 性格锚定\n她是把爱当账本的人。';
  check('没有介绍行时退回锚定段首行(原样)', 从结果取介绍(无介绍), '她是把爱当账本的人。');

  // ★ 用户报的那条(2026-10-15) —— 用**真实样本**做回归, 不用我自己编的例子。
  //
  // 用户给的是两条并排: 索引里落下来的那一行, 和源结果里的「介绍:」行。
  // 索引行**正好 40 字**, 且断在词中间(`Lim` 被切成 `Li`):
  //   落进索引: 林千昭 — 双丘市役所配额审查课的主任，在家中掌管账目与户籍档案、十余年前作为受孕方生下Li
  //   源结果  : 介绍: 双丘市役所配额审查课的主任，在家中掌管账目与户籍档案、十余年前作为受孕方生下Lim的扶她母亲。
  //
  // 为什么是 40 字硬切而不是"第一句": 该介绍**整句没有句末标点**(逗号、顿号都不算),
  // 末尾的「。」落在第 47 字, 超出上限 → 收首句的循环够不到它 → 落到 取短名(净, 40) → 从第 40 字切。
  // 下面第三条断言就是在钉这个机制 —— 不是"我觉得它长", 是"它必然走那条路"。
  const 真实介绍 = '双丘市役所配额审查课的主任，在家中掌管账目与户籍档案、十余年前作为受孕方生下Lim的扶她母亲。';
  const 长介绍 = `## 基础信息与外貌\n姓名: 林千昭\n介绍: ${真实介绍}\n## 性格锚定\n她是把爱当账本的人。`;
  check('★ 介绍行原样不截断(真实样本)', 从结果取介绍(长介绍), 真实介绍);
  check('★ 对照组: 该介绍确实超过旧上限 40', 真实介绍.length > 40, true);
  check('★ 对照组: 它整句无句末标点(所以旧代码必然走 40 字硬切)', /[。！？；…!?;]/.test(真实介绍.slice(0, -1)), false);
}

console.log('\n[16] 复制回读比对: Windows 换行归一(#157 P0 回归)');
{
  // 回归: 旧版比对不归一换行 → Windows 剪贴板把 \n 变成 \r\n → 多行文本必然误报"不一致"。
  // 必须**带对照**: 含换行 与 不含换行 各测一次(只测单行会误判成通过)。
  const 多行 = '第一行\n第二行\n第三行';
  check('多行: 读回被归一成 CRLF 也算一致', 剪贴板内容一致(多行, '第一行\r\n第二行\r\n第三行'), true);
  check('多行: 读回原样 LF 也算一致', 剪贴板内容一致(多行, 多行), true);
  check('单行: 完全一致', 剪贴板内容一致('ABC', 'ABC'), true);
  // 真不一致仍要能判出来(不能因为归一就把所有差异都放过)
  check('内容真的不同 → 不一致', 剪贴板内容一致('ABC', 'ABD'), false);
  check('多行: 少一行 → 不一致', 剪贴板内容一致(多行, '第一行\r\n第二行'), false);
  // 单独的 \r 也要归一
  check('单独的 \\r 也归一', 剪贴板内容一致('A\nB', 'A\rB'), true);
}

console.log(`\n人设工坊落地(#78): ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
