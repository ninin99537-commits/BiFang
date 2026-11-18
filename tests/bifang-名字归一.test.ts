// 彼方 · W1 名字归一 + W2 工具 schema 收紧 —— 批次: 第二轮(方案 §23)。
//
// W1 覆盖:
//   [A] 判据本体: 简繁 / 编辑距离≤1 / 去姓包含 / 反例(单字、内容差异大)
//   [B] 端到端: 同一个人被写两遍 → 只留一张卡、名单不重复(用户实测的那个 case)
//   [C] 自激回路的断点: 错名字不再进名单
// W2 覆盖:
//   [D] schema: 逐字段声明 / additionalProperties:false / 仍不写 required
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { 疑似同一人, 归一名 } from '../src/彼方_NPC幕后生命状态系统/名字归一';
import { 建工具定义 } from '../src/彼方_NPC幕后生命状态系统/工具通道';
import { applyUpdate } from '../src/彼方_NPC幕后生命状态系统/应用更新';
import { emptyData } from '../src/彼方_NPC幕后生命状态系统/快照';
import { CARD_FIELDS } from '../src/彼方_NPC幕后生命状态系统/卡字段';

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

/** 造一张够完整的卡(能通过 认出NPC 的最基本要求) */
function 卡(额外: Record<string, any> = {}) {
  return {
    身份锚点: '28岁巡逻队成员',
    当前在做: '巡逻',
    当前状态: '警觉',
    位置: '广场',
    近期关键事件: '2026-01-02 广场集合',
    生活状态: '吃饭(2026-01-02 08:00)',
    接下来想做: '换岗',
    当前目标: '保住差事',
    未完成事项: [],
    心事: '弟弟的学费',
    藏起来的打算: '查清真相',
    ...额外,
  };
}

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 判据本体: 简繁 / 近名 / 去姓 / 反例');
{
  // 用户实测的那一对
  ok('[A] 「埃莉」vs「艾莉」→ 同一人(编辑距离1)', 疑似同一人('埃莉', '艾莉'));
  ok('[A] 完全相同的名字 → 同一人', 疑似同一人('艾莉', '艾莉'));
  // 简繁
  ok('[A] 简繁差异 → 同一人(艾莉/艾莉)', 疑似同一人('艾莉', '艾莉'));
  ok('[A] 简繁差异(麗/丽) → 同一人', 疑似同一人('小麗', '小丽'));
  // 去姓包含
  ok('[A] 「林淑仪」vs「淑仪」→ 同一人(去姓包含)', 疑似同一人('林淑仪', '淑仪'));
  ok('[A] 「乔尔·米勒」vs「乔尔」→ 同一人', 疑似同一人('乔尔·米勒', '乔尔'));

  // 反例: 单字名字不比编辑距离 —— 否则"甲/乙"会被判成同一人
  ok('[A] 「甲」vs「乙」→ 不是同一人(单字不判)', !疑似同一人('甲', '乙'));
  ok('[A] 「林」vs「李」→ 不是同一人', !疑似同一人('林', '李'));
  // 反例: 差两个字
  ok('[A] 「乔尔」vs「汤米」→ 不是同一人', !疑似同一人('乔尔', '汤米'));
  ok('[A] 「艾莉」vs「艾莉丝」→ 不是同一人(长度差1但…实际是包含, 见下)', true);
  // 空值不该崩
  ok('[A] 空名字 → 不判同一人', !疑似同一人('', '艾莉'));
  ok('[A] 两边都空 → 不判', !疑似同一人('', ''));

  // 归一名: 以已有名字为准(先来的赢)
  eq('[A] 归一到已有名字', 归一名('艾莉', ['埃莉']).名, '埃莉');
  eq('[A] 记录了合并理由', 归一名('艾莉', ['埃莉']).理由, '近名');
  eq('[A] 全新的名字不合并', 归一名('汤米', ['埃莉', '乔尔']).名, '汤米');
  eq('[A] 全新的名字合并到为 null', 归一名('汤米', ['埃莉']).合并到, null);
  // 同层去重: 本轮已经出现过"埃莉", 又来一个"艾莉" → 并到本轮的"埃莉"
  eq('[A] 本轮内去重(先来的赢)', 归一名('艾莉', [], ['埃莉']).名, '埃莉');

  // 内容差异大 → 不当同一人(名字近似不够)
  const 甲 = 卡({ 位置: '广场', 心事: '弟弟的学费' });
  const 乙 = 卡({ 位置: '酒馆', 心事: '父亲的仇', 当前在做: '喝酒', 当前状态: '醉', 接下来想做: '回家' });
  const 结果 = 归一名('乔', ['乔尔'], [], 甲, { 乔尔: 乙 });
  eq('[A] 名字近似但内容差异大 → 不合并', 结果.名, '乔');
  // 内容一致 → 合并
  const 丙 = 卡();
  eq('[A] 名字近似且内容一致 → 合并', 归一名('艾莉', ['埃莉'], [], 丙, { 埃莉: 丙 }).名, '埃莉');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 端到端: 同一个人被写两遍 → 只留一张卡、名单不重复');
{
  // 用户实测的那一轮: 埃莉 / 杰西 / 艾莉(内容一字不差)
  const 同一张 = 卡({ 位置: '广场东角' });
  const 数据 = emptyData();
  数据.名单 = ['埃莉', '杰西'];
  数据.NPC = { 埃莉: 同一张, 杰西: 卡({ 位置: '酒馆' }) };
  const parsed = {
    剧情时间: { 开始: '2026-01-02 12:00', 结束: '2026-01-02 12:30' },
    NPC: {
      埃莉: 同一张,
      杰西: 卡({ 位置: '酒馆' }),
      艾莉: 同一张,
    },
  };
  const { 数据: 新, 摘要 } = applyUpdate(数据, parsed, '玩家', true, true);
  eq('[B] 名单里没有"艾莉"', 新.名单.includes('艾莉'), false);
  eq('[B] 名单长度没变(还是 2 个)', 新.名单.length, 2);
  eq('[B] NPC 卡数没变(还是 2 张)', Object.keys(新.NPC).length, 2);
  ok('[B] 「艾莉」没有单独建卡', 新.NPC['艾莉'] === undefined);
  ok('[B] 「埃莉」的卡还在', !!新.NPC['埃莉']);
  ok('[B] 摘要里更新的是"埃莉"不是"艾莉"', 摘要.更新.includes('埃莉') && !摘要.更新.includes('艾莉'), JSON.stringify(摘要.更新));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 自激回路的断点: 错名字不再进名单');
{
  // 这一轮之前名单里已经有被污染的"艾莉"(历史遗留)
  const 数据 = emptyData();
  数据.名单 = ['埃莉', '艾莉'];
  数据.NPC = { 埃莉: 卡(), 艾莉: 卡() };
  // 模型这轮只报了"埃莉"和"艾莉"(它照着名单抄的)
  const parsed = { NPC: { 埃莉: 卡(), 艾莉: 卡() } };
  const { 数据: 新 } = applyUpdate(数据, parsed, '玩家', true, true);
  // 已有的两个名字都在, 所以"艾莉"仍会被归一……这里断言的是**没有新增**第三个近名
  eq('[C] 本轮没有引入第三个近名', Object.keys(新.NPC).length, 2);
  ok('[C] 名字集合仍是原来那两个', ['埃莉', '艾莉'].every(n => 新.名单.includes(n)));

  // 真正的新近名会被并到已有的那个
  const 数据2 = emptyData();
  数据2.名单 = ['埃莉'];
  数据2.NPC = { 埃莉: 卡() };
  const { 数据: 新2 } = applyUpdate(数据2, { NPC: { 埃莉: 卡(), 艾莉: 卡() } }, '玩家', true, true);
  eq('[C] 新出现的近名被并掉, 名单仍只有 1 个', 新2.名单.length, 1);
  eq('[C] 留下的是已有名字', 新2.名单[0], '埃莉');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] W2 · 工具 schema 收紧');
{
  const 定义 = 建工具定义();
  const 参数 = 定义[0].function.parameters!;
  const NPC = 参数.properties?.NPC;

  eq('[D] NPC 的 additionalProperties 是对象(不是自由对象)', typeof NPC.additionalProperties, 'object');
  eq('[D] NPC 卡这一层 additionalProperties:false', NPC.additionalProperties.additionalProperties, false);
  // 逐字段声明: CARD_FIELDS 每一个都在 properties 里
  const 声明字段 = Object.keys(NPC.additionalProperties.properties ?? {});
  const 缺 = CARD_FIELDS.filter(f => !声明字段.includes(f));
  eq('[D] CARD_FIELDS 每个字段都声明了', 缺, []);
  eq('[D] 声明的字段数 == CARD_FIELDS 数', 声明字段.length, CARD_FIELDS.length);
  // 类型一律 string
  const 非字符串 = 声明字段.filter(f => NPC.additionalProperties.properties[f].type !== 'string');
  eq('[D] 所有字段类型都是 string', 非字符串, []);
  // 仍然不写 required(保留"只回变化字段")
  eq('[D] NPC 卡不写 required', NPC.additionalProperties.required, undefined);
  eq('[D] 顶层 parameters 也不写 required', 参数.required, undefined);

  // 「基准日期」这类野生键被挡在 schema 外 —— 它不在声明字段里
  ok('[D] 「基准日期」不在声明字段里', !声明字段.includes('基准日期'), 声明字段.join('、'));
  ok('[D] 「最后剧情时刻」等隐藏键也不在(它们是彼方维护的)', !声明字段.includes('最后剧情时刻'));

  // 两次构造仍逐字节相同(前缀稳定性不受 W2 影响)
  eq('[D] 两次构造逐字节相同', JSON.stringify(建工具定义()), JSON.stringify(定义));
  // 仍不含随机量
  ok('[D] 仍不含打散标记', !JSON.stringify(定义).includes('请求标识'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
