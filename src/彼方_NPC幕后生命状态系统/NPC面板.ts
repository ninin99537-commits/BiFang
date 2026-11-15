// 彼方 · NPC 人物页(面板「NPC」页) —— 编辑会话 + 台账动作 + 详情字段。
//
// 这一页原本 27 个键全从壳里那个大对象取, 而其中一半是**壳里的实现细节**: 编辑草稿、每行的结果草稿、
// 新增事务草稿、改事务/新增事务/保存这一整串协议。它们只有这一页用, 却住在 1470 行的壳里 ——
// 页面拆出来了, 知识没跟着走。现在搬到这里:
//   · 状态: editingNpc / editDraft / 结果草稿 / 新增事务草稿
//   · 动作: startEditNpc / saveEditNpc / cancelEditNpc / 改事务 / 新增一条事务
//   · 派生: 台账条目 / detailFields / 是恋爱对象
//   · 纯函数: cleanText
//
// 留在壳里的: 当前选中的人(壳的 removeNpc 与恋爱开局弹窗都要它)、恋爱开局对话框本身
// (那是壳里的模板), 以及 头像色号 / fmtTime / 数据 / 更新中 —— 作为参数传进来。
//
// 会话边界的一条规矩(原样搬过来的): 「未完成事项」不进编辑草稿。它上面那排状态按钮才是它的编辑
// 方式; 进了草稿就会"用打开编辑时的旧台账覆盖掉编辑期间按按钮改过的台账"。

import { computed, inject, ref } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { 字段分组表, 字段说明表 } from './卡字段';
import { 更新状态卡, 改事务状态, 新增事务 } from './数据变更';
import type { 变更环境 } from './数据变更';
import type { 彼方数据 } from './快照';
import { toastSuccess, toastWarning } from './toast';
import { 显示台账, 台账字段, 台账状态表, 状态类 } from './事务台账';
import type { 幕后事务, 事务状态 } from './事务台账';
import { 名分词表, 情感倾向表, 好感阶段表, 情欲阶段表, 标签词表, 标签上限 } from './恋爱规则';
import { GESTATION_WEEKS_RANGE, LACTATION_MONTHS_RANGE, PREGNANCY_KNOWN_VALUES, CYCLE_STAGE_VALUES, CYCLE_STAGE_PREFIX_RE } from './生理规则';
import type { NpcStateCard } from './卡字段';

/** 详情页的字段分组(与 卡字段.ts 的 组 一一对应; 这里是展示顺序与标题, 那是"谁属于哪组") */
const 分组展示 = [
  { key: '生活', 标题: '生活动态' },
  { key: '内心', 标题: '内心世界' },
  { key: '生理', 标题: '生理状态' },
  { key: '恋爱', 标题: '恋爱' },
];

/**
 * 受控字段的控件形态(附表 B / R9): **词表与区间一律从数据源派生**, 不在 .vue 里手抄第二份。
 * 这里只描述"用哪种控件 + 从哪儿取值 + 一行规范提示"; 具体渲染在 页面-NPC.vue 里按 type 分支。
 *
 * 为什么集中成一张表而不是在模板里写一串 v-if: 附表 B 的 18 项里有 6 select / 4 number / 1 胶囊 /
 * 2 日期 / 3 拆项, 写成模板条件会变成十几层嵌套, 而且"哪个字段是什么控件"这件事实会散在模板各处。
 */
type 字段控件 =
  | { type: 'select'; 选项: readonly string[]; 空值文案: string; 提示: string }
  | { type: 'number'; min: number; max: number; step: number; 提示: string }
  | { type: 'tags'; 词表: readonly string[]; 上限: number; 提示: string }
  | { type: 'date'; 提示: string }
  | { type: 'cycle'; 提示: string }
  | { type: 'textarea'; 提示: string };

export type { 字段控件 };

function 建字段控件表(): Record<string, 字段控件> {
  return {
    // ---- 6 个下拉(R8 / R9): 词表来自 恋爱规则.ts / 生理规则.ts ----
    恋爱对象: { type: 'select', 选项: ['是'], 空值文案: '（空 / 未标记）', 提示: '空 = 未标记; 「是」= 参与恋爱折算' },
    恋爱开局: { type: 'select', 选项: ['是'], 空值文案: '（空 / 允许重报开局）', 提示: '「待AI判断」只是界面临时态，不落盘' },
    是否怀孕: { type: 'select', 选项: ['否', '是'], 空值文案: '（未记录）', 提示: '布尔语义，留空表示未记录' },
    怀孕知晓: {
      type: 'select',
      选项: PREGNANCY_KNOWN_VALUES,
      空值文案: '（未记录）',
      提示: '未知 / 疑似 / 确认 —— 防全知：本人的认知可以落后于事实',
    },
    情感倾向: { type: 'select', 选项: Object.keys(情感倾向表), 空值文案: '（未设置）', 提示: '闭合词表，系数见 恋爱规则.ts' },
    名分: { type: 'select', 选项: 名分词表, 空值文案: '（无 / 清空）', 提示: '清空即清空，不会自动补「无」' },
    好感阶段: {
      type: 'select',
      选项: 好感阶段表.map(阶段 => 阶段.名),
      空值文案: '（未结算）',
      提示: '由好感值推导（±2 滞回），一般不用手改',
    },
    情欲阶段: {
      type: 'select',
      选项: 情欲阶段表.map(阶段 => 阶段.名),
      空值文案: '（未结算）',
      提示: '由情欲值推导（±2 滞回），一般不用手改',
    },
    // ---- 4 个数字框: 空 = 未结算, 不写成 0 ----
    好感值: { type: 'number', min: 0, max: 100, step: 0.1, 提示: '0–100，可留一位小数；留空 = 未结算（不是 0）' },
    情欲值: { type: 'number', min: 0, max: 100, step: 0.1, 提示: '0–100，可留一位小数；留空 = 未结算（不是 0）' },
    孕程周数: {
      type: 'number',
      min: GESTATION_WEEKS_RANGE[0],
      max: GESTATION_WEEKS_RANGE[1],
      step: 1,
      提示: `${GESTATION_WEEKS_RANGE[0]}–${GESTATION_WEEKS_RANGE[1]} 的整数（超出视为未填写）`,
    },
    哺乳期月数: {
      type: 'number',
      min: LACTATION_MONTHS_RANGE[0],
      max: LACTATION_MONTHS_RANGE[1],
      step: 1,
      提示: `${LACTATION_MONTHS_RANGE[0]}–${LACTATION_MONTHS_RANGE[1]} 的整数（超出视为未填写）`,
    },
    // ---- 胶囊多选: 限 5 个, 只接受词表内的词 ----
    恋爱标签: { type: 'tags', 词表: 标签词表, 上限: 标签上限, 提示: `闭合词表，最多 ${标签上限} 个；非词表内容保存时会被丢弃` },
    // ---- 日期: 保持文本(不换 type=date), 因为丢时刻会破坏生理天数推进(R3) ----
    生理周期日期: { type: 'date', 提示: '格式 YYYY-MM-DD HH:mm —— 保留时刻，改成纯日期会让生理推进算错天数' },
    受孕日期: { type: 'date', 提示: '格式 YYYY-MM-DD HH:mm —— 保留时刻，改成纯日期会让生理推进算错天数' },
    // ---- 生理周期: 阶段下拉 + 明细输入(两段拼装); `/NN` 只读(R5) ----
    生理周期: {
      type: 'cycle',
      提示: '阶段 + 明细拼成「阶段 Day N/NN」；/NN 是彼方锁定值，只读（排卵日 = 周期长度 − 14）',
    },
  };
}

export type NPC面板 = {
  /** 数据与选中 */
  data: Ref<彼方数据>;
  npcEntries: ComputedRef<Array<[string, NpcStateCard]>>;
  selectedNpc: Ref<string | null>;
  selectedNpcCard: ComputedRef<NpcStateCard | null>;
  autoTrackEnabled: ComputedRef<boolean>;
  updating: ComputedRef<boolean>;
  /** 展示用的小工具 */
  fmtTime: (ts?: number) => string;
  头像色号: (名?: string | null) => number;
  cleanText: (text: string) => string;
  /** 编辑会话 */
  editingNpc: Ref<boolean>;
  editDraft: Ref<Record<string, any>>;
  startEditNpc: () => void;
  saveEditNpc: () => void;
  cancelEditNpc: () => void;
  /** 详情字段(已按"看得见/展开编辑"过滤) */
  detailFields: ComputedRef<Array<{ key: string; 标题: string; 字段: string[] }>>;
  字段说明表: typeof 字段说明表;
  /** 台账区块 */
  台账条目: ComputedRef<幕后事务[]>;
  结果草稿: Ref<Record<string, string>>;
  台账状态表: typeof 台账状态表;
  状态类: typeof 状态类;
  改事务: (事务: 幕后事务, 新状态: 事务状态) => void;
  新增事务草稿: Ref<string>;
  新增一条事务: () => void;
  /** 恋爱(只读标记与选项; 标记动作由壳负责开对话框) */
  是恋爱对象: ComputedRef<boolean>;
  /** 卡上还留着恋爱数值/名分, 但标记已取消 → 详情页提示"恋爱已暂停" */
  有恋爱数据: ComputedRef<boolean>;
  切换恋爱对象: () => void;
  情感倾向选项: string[];
  名分词表: typeof 名分词表;
  /** 受控字段的控件形态表(附表 B): 页面按 type 渲染, 词表与区间都已从数据源派生 */
  字段控件表: Record<string, 字段控件>;
  /** 胶囊多选的本地选中态(编辑态点一下切换; 保存时归一成逗号串写回) */
  切换标签: (词: string) => void;
  /** 当前草稿里的标签数组(展示与"满 5 个后置灰"都读它) */
  草稿标签: ComputedRef<string[]>;

  // ---- R4 拆项拼装: 生活状态 / 近期关键事件(整份回写, 不按类目合并) ----
  /** 生活状态的三个类目值(吃饭 / 洗漱 / 睡眠); 写回时拼成 `类(值); 类(值)` */
  生活状态项: ComputedRef<Record<string, string>>;
  设生活状态项: (类目: string, 值: string) => void;
  生活状态类目: readonly string[];
  /** 近期关键事件的条目(最多 3); 写回时按 `；`/`、`/换行 分隔 */
  近期事件项: ComputedRef<string[]>;
  设近期事件项: (序号: number, 值: string) => void;
  近期事件上限: number;

  // ---- R5 生理周期: 阶段(7 值) + 明细; `/NN` 只读 ----
  生理阶段: ComputedRef<string>;
  生理明细: ComputedRef<string>;
  /** 周期长度(隐藏键 `周期长度`): 只读展示, 不提供编辑框 */
  周期长度: ComputedRef<string>;
  设生理阶段: (阶段: string) => void;
  设生理明细: (明细: string) => void;
  生理阶段选项: readonly string[];
};

/**
 * 这一页的状态与动作。
 * 依赖由壳给: 数据、当前选中、更新中、两个格式化函数、变更环境工厂,
 * 以及「切换恋爱对象」(它可能要先弹开局对话框, 那是壳里的模板)。
 */
export function 建NPC面板(源: {
  数据: Ref<彼方数据>;
  选中的人: Ref<string | null>;
  选中卡: ComputedRef<NpcStateCard | null>;
  更新中: ComputedRef<boolean>;
  自动建档: ComputedRef<boolean>;
  头像色号: (名?: string | null) => number;
  fmtTime: (ts?: number) => string;
  建变更: () => 变更环境;
  切换恋爱对象: () => void;
}): NPC面板 {
  const 数据 = 源.数据;
  const 选中的人 = 源.选中的人;
  const 选中卡 = 源.选中卡;

  const npcEntries = computed(() => Object.entries(数据.value.NPC ?? {}) as Array<[string, NpcStateCard]>);

  // ---- 编辑会话 ----
  const editingNpc = ref(false);
  const editDraft = ref<Record<string, any>>({});

  function startEditNpc() {
    if (!选中卡.value)
      return;
    // 「未完成事项」不放进草稿: 状态按钮走的是 改事务状态 通道(立即写快照), 而草稿是打开编辑时的快照。
    // 若台账进了草稿, 编辑期间按按钮改过的台账会在保存时被旧值写回去(改动被吃掉)。
    // 草稿里没有这个字段 → 合并时不会碰卡里的台账(见 数据变更.ts), 不存在"悄悄丢改动"。
    const { [台账字段]: _台账, ...字符串字段 } = 选中卡.value as Record<string, any>;
    editDraft.value = 字符串字段;
    editingNpc.value = true;
  }

  function cancelEditNpc() {
    editingNpc.value = false;
  }

  function saveEditNpc() {
    if (!选中的人.value || !数据.value.NPC?.[选中的人.value])
      return;
    const 结果 = 更新状态卡(数据.value, 选中的人.value, editDraft.value, 源.建变更());
    // 没落盘就别退出编辑态: 退出=玩家以为改了, 刷新后改动消失
    if (结果.失败) {
      toastWarning(结果.说明);
      return;
    }
    editingNpc.value = false;
    toastSuccess(结果.说明);
  }

  // ---- 台账区块 ----
  /** 详情页的事务台账(已归一、进行中在前、已办在后) —— 渲染用, 不写回 */
  const 台账条目 = computed<幕后事务[]>(() => 显示台账(选中卡.value?.[台账字段]));

  /** 每行结果输入框的草稿: 没动过的行不在这里(于是沿用该条已有的结果) */
  const 结果草稿 = ref<Record<string, string>>({});

  /** 这一行该提交的结果: 输入框动过就用玩家写的(清空即清掉结果), 没动过就沿用台账里的 */
  function 取行结果(事务: 幕后事务): string {
    const 草稿 = 结果草稿.value[事务.编号];
    return 草稿 === undefined ? String(事务.结果 ?? '') : String(草稿).trim();
  }

  /** 改一条事务的状态(顺带写/改结果): 走 数据变更.ts 的既有通道(写快照 + 重同步世界书)。
   *  没改成时 改事务状态 会把原数据对象原样返回 —— 据此提示, 而不是假装成功。 */
  function 改事务(事务: 幕后事务, 新状态: 事务状态) {
    if (!选中的人.value || !选中卡.value)
      return;
    const 结果 = 改事务状态(数据.value, 选中的人.value, 事务.编号, 新状态, 取行结果(事务), 源.建变更());
    // 失败(没落盘) 与 "未改动" 都不该弹成功: 前者靠 失败, 后者靠 原引用
    if (结果.失败 || 结果.数据 === 数据.value) {
      toastWarning(结果.说明);
      return;
    }
    // 提交成功后把这行的输入草稿清掉: 输入框回到"空 + 占位符显示当前结果", 免得留着一条已入库的
    // 文本让人以为还没提交(进行中不带结果, 草稿也必须跟着清)
    delete 结果草稿.value[事务.编号];
    toastSuccess(结果.说明);
  }

  /** 手动新增一条事务的输入草稿(提交成功后清空) */
  const 新增事务草稿 = ref('');

  /** 手动新增一条事务: 编号/时间由代码分配(与 AI 路径同一个 合并台账)。 */
  function 新增一条事务() {
    if (!选中的人.value)
      return;
    const 文本 = 新增事务草稿.value.trim();
    if (!文本)
      return;
    const 结果 = 新增事务(数据.value, 选中的人.value, 文本, 源.建变更());
    if (结果.失败 || 结果.数据 === 数据.value) {
      toastWarning(结果.说明);
      return;
    }
    新增事务草稿.value = '';
    toastSuccess(结果.说明);
  }

  // ---- 派生 ----
  /** 详情页字段分组: 标题与分组留在展示层, "谁属于哪一组"来自 卡字段.ts。
   *  「未完成事项」单独渲染成台账区块(状态按钮才是它的编辑方式)。
   *  「生活状态」**只在编辑态出现在分组里** —— 它有自己的三项拆项模板(吃饭/洗漱/睡眠, 页面-NPC.vue),
   *  只读态则由页首的 生活状态条目 那段展示(类目 + 时刻 + 距今)。B11: 以前这里用同一个 filter
   *  把两态一起砍掉, 于是拆项模板成了死分支, R9 声称的 18 项实际只有 17 项可达。 */
  const detailFields = computed(() =>
    分组展示
      .map(组 => ({
        ...组,
        字段: (字段分组表[组.key] || []).filter(
          f => f !== 台账字段
            && (f !== '生活状态' || editingNpc.value)
            && (editingNpc.value || !['生理', '恋爱'].includes(组.key))
            && (选中卡.value?.[f] || editingNpc.value),
        ),
      }))
      .filter(组 => 组.字段.length > 0),
  );

  /** 当前详情页的 NPC 是否已被标记为恋爱对象(标记即开关, 没有全局设置项) */
  const 是恋爱对象 = computed(() => String(选中卡.value?.['恋爱对象'] ?? '').trim() === '是');
  /** 取消标记后数值/名分留在卡上(只是暂停), 详情页要看得见这件事 */
  const 有恋爱数据 = computed(() => {
    const 卡 = 选中卡.value;
    if (!卡)
      return false;
    return ['好感值', '情欲值', '名分', '恋爱标签', '恋爱态度'].some(键 => String(卡[键] ?? '').trim() !== '');
  });

  function cleanText(text: string): string {
    return (text || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---- 恋爱标签: 胶囊多选(限 5) ----
  /** 草稿里的标签数组: 拆自 `恋爱标签` 的逗号串(词表外的词不显示, 与写回口径一致) */
  const 草稿标签 = computed<string[]>(() =>
    String(editDraft.value['恋爱标签'] ?? '')
      .split(/[,，、;；]/)
      .map(词 => 词.trim())
      .filter(词 => 词 && 标签词表.includes(词)),
  );

  /** 点一下切换一个词: 已选则移除, 未选且未满上限则加入; 始终用逗号串写回(与 校验标签 同口径) */
  function 切换标签(词: string) {
    const 当前 = 草稿标签.value;
    const 已选 = 当前.includes(词);
    if (!已选 && 当前.length >= 标签上限)
      return;
    const 下一个 = 已选 ? 当前.filter(x => x !== 词) : [...当前, 词];
    editDraft.value['恋爱标签'] = 下一个.join(',');
  }

  // ---- R4 拆项: 生活状态(吃饭/洗漱/睡眠) 与 近期关键事件(最多 3) ----
  /** 生活状态类目顺序(与 生活状态.ts 的协议一致) */
  const 生活状态类目 = ['吃饭', '洗漱', '睡眠'] as const;
  /** 近期关键事件最多保留几条(与 卡合并.ts 的 FIFO 上限一致) */
  const 近期事件上限 = 3;

  /** 从 `类(值); 类(值)` 里取出每个类目的值; 认不出的文本原样留在"其它"里, 不丢 */
  const 生活状态项 = computed<Record<string, string>>(() => {
    const 结果: Record<string, string> = {};
    for (const 类目 of 生活状态类目)
      结果[类目] = '';
    const 原文 = String(editDraft.value['生活状态'] ?? '');
    for (const 段 of 原文.split(/[;；]/)) {
      const m = 段.match(/^\s*([^()（）]+?)\s*[(（](.*)[)）]\s*$/);
      if (!m)
        continue;
      const 类目 = m[1].trim();
      if (类目 in 结果)
        结果[类目] = m[2].trim();
    }
    return 结果;
  });

  /** 改一个类目 → 整份重拼(空的类目不写进串, 与 生活状态.ts 的 join('; ') 同口径) */
  function 设生活状态项(类目: string, 值: string) {
    const 新值 = { ...生活状态项.value, [类目]: 值 };
    editDraft.value['生活状态'] = 生活状态类目
      .filter(类 => String(新值[类] ?? '').trim())
      .map(类 => `${类}(${String(新值[类]).trim()})`)
      .join('; ');
  }

  /** 近期关键事件: 按 卡合并.ts 的分隔约定(`；` `、` 换行)拆, 最多 3 条 */
  const 近期事件项 = computed<string[]>(() => {
    const 段 = String(editDraft.value['近期关键事件'] ?? '')
      .split(/[；;、\n]/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 近期事件上限);
    return [...段, ...new Array(Math.max(0, 近期事件上限 - 段.length)).fill('')];
  });

  /** 改第 N 条 → 整份重拼(空条目不写进串) */
  function 设近期事件项(序号: number, 值: string) {
    const 新 = [...近期事件项.value];
    新[序号] = 值;
    editDraft.value['近期关键事件'] = 新.map(x => x.trim()).filter(Boolean).join('；');
  }

  // ---- R5 生理周期: 阶段 + 明细, `/NN` 只读 ----
  const 生理阶段选项 = CYCLE_STAGE_VALUES;

  /** 阶段名: 取 `生理周期` 文本开头命中的那一个(认不出就是空) */
  const 生理阶段 = computed(() => {
    const m = String(editDraft.value['生理周期'] ?? '').match(CYCLE_STAGE_PREFIX_RE);
    return m ? m[1] : '';
  });

  /** 明细: 去掉开头的阶段名之后的剩余部分(如 `Day 12/28`、`孕 16周+3天`) */
  const 生理明细 = computed(() =>
    String(editDraft.value['生理周期'] ?? '').replace(CYCLE_STAGE_PREFIX_RE, '').trim(),
  );

  /** 周期长度: 隐藏键, 只读(UI 不给编辑框 —— 分母是彼方锁定值) */
  const 周期长度 = computed(() => String(选中卡.value?.['周期长度'] ?? ''));

  /** 改阶段 → `阶段 + 空格 + 明细`; 明细为空时只写阶段 */
  function 设生理阶段(阶段: string) {
    const 明细 = 生理明细.value;
    editDraft.value['生理周期'] = 明细 ? `${阶段} ${明细}` : 阶段;
  }

  /** 改明细 → 阶段原样保留; 阶段为空时只写明细 */
  function 设生理明细(明细: string) {
    const 阶段 = 生理阶段.value;
    editDraft.value['生理周期'] = 阶段 ? `${阶段} ${明细}`.trim() : 明细;
  }

  return {
    data: 数据,
    npcEntries,
    selectedNpc: 选中的人,
    selectedNpcCard: 选中卡,
    autoTrackEnabled: 源.自动建档,
    updating: 源.更新中,
    fmtTime: 源.fmtTime,
    头像色号: 源.头像色号,
    cleanText,
    editingNpc,
    editDraft,
    startEditNpc,
    saveEditNpc,
    cancelEditNpc,
    detailFields,
    字段说明表,
    台账条目,
    结果草稿,
    台账状态表,
    状态类,
    改事务,
    新增事务草稿,
    新增一条事务,
    是恋爱对象,
    有恋爱数据,
    切换恋爱对象: 源.切换恋爱对象,
    情感倾向选项: Object.keys(情感倾向表),
    名分词表,
    字段控件表: 建字段控件表(),
    切换标签,
    草稿标签,
    生活状态项,
    设生活状态项,
    生活状态类目,
    近期事件项,
    设近期事件项,
    近期事件上限,
    生理阶段,
    生理明细,
    周期长度,
    设生理阶段,
    设生理明细,
    生理阶段选项,
  };
}

export const NPC面板键: InjectionKey<NPC面板> = Symbol('bifang-NPC');

/** 页面侧: 必须在壳内使用 */
export function useNPC面板(): NPC面板 {
  const 面板 = inject(NPC面板键);
  if (!面板)
    throw new Error('[彼方] NPC 面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
