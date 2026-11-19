// 彼方 · 仪表盘页(面板「此刻的彼方」) —— 追踪名单、统计、待续事务数。
//
// 这页原本也走壳里那个大对象。搬出来之后: 派生(名单/统计/待续事务数)住在这里, 其余是壳的动作转发。
// 待续事务数原本在壳里又算了一遍"进行中" —— 与 事实档案 那里的计数是同一种问法, 两份现在摆在一起,
// 要合并只需改一处。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { 显示台账, 台账字段 } from './事务台账';
import { 事实档案 } from './一致性面板';
import type { 彼方数据 } from './快照';
import type { NpcStateCard } from './卡字段';

export type 仪表盘面板 = {
  data: Ref<彼方数据>;
  npcEntries: ComputedRef<Array<[string, NpcStateCard]>>;
  npcList: ComputedRef<string[]>;
  stats: ComputedRef<{ 更新次数: number; 最后更新: number }>;
  待续事务数: ComputedRef<number>;
  /** 全库已过期事务数(与事实档案同一口径): 摘要带旁注「其中 M 件过期」用它 */
  过期事务数: ComputedRef<number>;
  /**
   * 本轮有状态变化的 NPC 人数（摘要带旁注「本轮 N 人有变化」用它）。
   *
   * ── 2026-11-20 修：这个字段之前**根本不存在**（需求方 #421）──
   *  `页面-仪表盘.vue` 的模板写着 `<small v-if="本轮有变化人数">`，
   *  但面板接口里没有它 → 页面解构出来是 `undefined` → **`v-if` 永远为假**。
   *
   *  它从 11-16 就在，**一直没显示过，也不报错**。
   *  因为判据查的是"模板名字能不能解析"，而这条恰好没被那条判据覆盖到。
   *
   *  定义放在这里（而不是让页面自己算）：页面只该渲染，不该知道"什么算变化"。
   */
  本轮有变化人数: ComputedRef<number>;
  autoTrackEnabled: ComputedRef<boolean>;
  updating: ComputedRef<boolean>;
  头像色号: (名?: string | null) => number;
  /** 新建人物的名字与对话框(对话框本体在壳的模板里) */
  newNpcName: Ref<string>;
  openAddDialog: () => void;
  removeNpc: (名: string) => void;
  openNpc: (名: string) => void;
  // ⚠ **`manualUpdate` 已删除**（2026-11-20，需求方 #421）。
  //
  //  它是**壳顶栏那个「更新」按钮**的动作，页面从来不用它 ——
  //  之前它出现在这个接口里，于是"接口键 17 个 / 页面解构 16 个"对不上。
  //
  //  > 壳自己的按钮不许出现在页面的接口里。
  //
  //  判据（`bifang-panel-contract`）要求「类型键 == 页面解构的名字」，
  //  这条就是为这种"接口和实现可以对不上、而且没人管"的情况写的。
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
  /**
   * 本轮有状态变化的人数：卡的「最后更新」等于全局「最后更新」时刻。
   *
   * 这就是 `悬浮球界面.vue` 里原本那份（页签圆点用它），现在搬到面板接口上，
   * **两处共用同一个定义** —— 页签圆点与摘要带旁注说的必须是同一件事。
   */
  const 本轮有变化人数 = computed(() => {
    const 时刻 = Number(数据.value.统计?.最后更新 ?? 0);
    if (!时刻)
      return 0;
    return Object.values(数据.value.NPC ?? {})
      .filter(卡 => Number((卡 as Record<string, any>)?.['最后更新'] ?? 0) === 时刻)
      .length;
  });
  return {
    data: 数据,
    npcEntries,
    npcList,
    stats,
    待续事务数,
    过期事务数: computed(() => 事实档案(数据.value).过期数),
    本轮有变化人数,
    autoTrackEnabled: 源.自动建档,
    updating: 源.更新中,
    头像色号: 源.头像色号,
    newNpcName: 源.newNpcName,
    openAddDialog: 源.openAddDialog,
    removeNpc: 源.removeNpc,
    openNpc: 源.openNpc,
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
