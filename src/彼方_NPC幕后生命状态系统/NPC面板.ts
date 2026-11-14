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
import { 名分词表, 情感倾向表 } from './恋爱规则';
import type { NpcStateCard } from './卡字段';

/** 详情页的字段分组(与 卡字段.ts 的 组 一一对应; 这里是展示顺序与标题, 那是"谁属于哪组") */
const 分组展示 = [
  { key: '生活', 标题: '生活动态' },
  { key: '内心', 标题: '内心世界' },
  { key: '生理', 标题: '生理状态' },
  { key: '恋爱', 标题: '恋爱' },
];

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
   *  「未完成事项」单独渲染成台账区块(状态按钮才是它的编辑方式), 「生活状态」也有自己的渲染块。 */
  const detailFields = computed(() =>
    分组展示
      .map(组 => ({
        ...组,
        字段: (字段分组表[组.key] || []).filter(
          f => f !== 台账字段 && f !== '生活状态'
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
