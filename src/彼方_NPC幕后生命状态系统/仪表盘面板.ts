// 彼方 · 仪表盘页(面板「此刻的彼方」) —— 追踪名单、统计、待续事务数。
//
// 这页原本也走壳里那个大对象。搬出来之后: 派生(名单/统计/待续事务数)住在这里, 其余是壳的动作转发。
// 待续事务数原本在壳里又算了一遍"进行中" —— 与 事实档案 那里的计数是同一种问法, 两份现在摆在一起,
// 要合并只需改一处。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { 显示台账, 台账字段 } from './事务台账';
import type { 彼方数据 } from './快照';
import type { NpcStateCard } from './卡字段';

export type 仪表盘面板 = {
  data: Ref<彼方数据>;
  npcEntries: ComputedRef<Array<[string, NpcStateCard]>>;
  npcList: ComputedRef<string[]>;
  stats: ComputedRef<{ 更新次数: number; 最后更新: number }>;
  待续事务数: ComputedRef<number>;
  autoTrackEnabled: ComputedRef<boolean>;
  updating: ComputedRef<boolean>;
  头像色号: (名?: string | null) => number;
  /** 新建人物的名字与对话框(对话框本体在壳的模板里) */
  newNpcName: Ref<string>;
  openAddDialog: () => void;
  removeNpc: (名: string) => void;
  openNpc: (名: string) => void;
  /** 手动更新 / 重载 / 清空(两段确认) */
  manualUpdate: () => void;
  reload: () => void;
  clearAll: () => void;
  clearing: Ref<boolean>;
};

export function 建仪表盘面板(源: {
  数据: Ref<彼方数据>;
  更新中: ComputedRef<boolean>;
  自动建档: ComputedRef<boolean>;
  头像色号: (名?: string | null) => number;
  newNpcName: Ref<string>;
  openAddDialog: () => void;
  removeNpc: (名: string) => void;
  openNpc: (名: string) => void;
  manualUpdate: () => void;
  reload: () => void;
  clearAll: () => void;
  clearing: Ref<boolean>;
}): 仪表盘面板 {
  const 数据 = 源.数据;
  const npcEntries = computed(() => Object.entries(数据.value.NPC ?? {}) as Array<[string, NpcStateCard]>);
  const npcList = computed(() => 数据.value.名单 ?? []);
  const stats = computed(() => 数据.value.统计 ?? { 更新次数: 0, 最后更新: 0 });
  /** 全库"进行中"事务条数: 角标用(与 事实档案 的 进行中数 同一个问法) */
  const 待续事务数 = computed(() => {
    let 总数 = 0;
    for (const 卡 of Object.values(数据.value.NPC ?? {}))
      总数 += 显示台账((卡 as Record<string, any>)?.[台账字段]).filter(事务 => 事务.状态 === '进行中').length;
    return 总数;
  });
  return {
    data: 数据,
    npcEntries,
    npcList,
    stats,
    待续事务数,
    autoTrackEnabled: 源.自动建档,
    updating: 源.更新中,
    头像色号: 源.头像色号,
    newNpcName: 源.newNpcName,
    openAddDialog: 源.openAddDialog,
    removeNpc: 源.removeNpc,
    openNpc: 源.openNpc,
    manualUpdate: 源.manualUpdate,
    reload: 源.reload,
    clearAll: 源.clearAll,
    clearing: 源.clearing,
  };
}

export const 仪表盘面板键: InjectionKey<仪表盘面板> = Symbol('bifang-仪表盘');

export function use仪表盘面板(): 仪表盘面板 {
  const 面板 = inject(仪表盘面板键);
  if (!面板)
    throw new Error('[彼方] 仪表盘面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
