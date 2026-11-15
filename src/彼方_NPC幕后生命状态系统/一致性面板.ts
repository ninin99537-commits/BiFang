// 彼方 · 事实档案(面板「一致性」页) —— 跨人物摊平的台账视图。
//
// 以前这一页的知识分在两处: 壳(悬浮球界面.vue)里算 consistencyList(每人一条记录 + 排序),
// 页面里再摊平成"一条承诺一行"、分组、再排序、再把紧迫度数字翻成中文文案。两段都只能点开面板
// 看效果, 用例碰不到; 而且中间那层结构纯属过路。
//
// 现在收在这里: 一个纯函数 事实档案(数据) → 分组, 页面只渲染。
// 它回答的问题是"谁欠着事、欠了多久、哪条已经过期", 与台账本身(事务台账.ts)的分工是:
// 台账管"一条事务怎么活", 这里管"所有 NPC 的账摊在一张表上怎么排"。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { 承诺紧迫度, 老化天数, 变动标记, 显示台账, 状态类, 台账字段 } from './事务台账';import type { 幕后事务, 事务状态 } from './事务台账';

/** 一条承诺一行 */
export type 事实行 = {
  /** 行键: 人名 + 编号(同一个人在多个分组里也只渲染一次) */
  键: string;
  名: string;
  编号: string;
  内容: string;
  结果: string;
  /** 存于(= 事务的写下日期) */
  存于: string;
  /** 紧迫度文案(已过期 3 天 / 今天到期 / 还剩 2 天 / 已挂 5 天); 无则空 */
  紧迫: string;
  /** 本轮变动标记(本轮新增 / 本轮已完成 …); 无则空 */
  标记: string;
  逾期: boolean;
  类: string;
  剩余: number | null;
  已挂: number | null;
  /** 已结印章文案(已完成 / 已作废); 进行中的行是空串 */
  已结: string;
  /** 已作废(印章用灰章) */
  已作废: boolean;
  /** 结果由幕后自动推演完成(正文里追加「（幕后）」) */
  幕后: boolean;
};

export type 事实分组 = { key: string; 标题: string; 说明: string; 行: 事实行[] };

/** 「最近了结」留几条: 它只是"查得到", 不是待办 */
const 了结条数 = 6;

/** 紧迫度文案: 约定日期优先(还剩/今天/已过期), 没有约定就看挂了多久 */
function 紧迫度文案(事务: 幕后事务, 剧情时间: string): { 紧迫: string; 逾期: boolean; 剩余: number | null; 已挂: number | null } {
  const 度 = 承诺紧迫度(事务, 剧情时间);
  let 紧迫 = '';
  let 逾期 = false;
  if (事务.状态 === '进行中') {
    if (度.剩余天数 !== null) {
      逾期 = 度.剩余天数 < 0;
      紧迫 = 逾期
        ? `已过期 ${-度.剩余天数} 天`
        : 度.剩余天数 === 0 ? '今天到期' : `还剩 ${度.剩余天数} 天`;
    }
    else if (度.已挂天数 !== null) {
      逾期 = 度.已挂天数 >= 老化天数;
      紧迫 = `已挂 ${度.已挂天数} 天`;
    }
  }
  return { 紧迫, 逾期, 剩余: 度.剩余天数, 已挂: 度.已挂天数 };
}

/** 把"T3:已完成;T5:新增"这种逐轮标记拆成 编号 → 种类 */
function 解析变动(原值: unknown): Map<string, string> {
  const 表 = new Map<string, string>();
  for (const 段 of String(原值 ?? '').split(';')) {
    const [编号, 种类] = 段.split(':');
    if (编号 && 种类)
      表.set(编号, 种类);
  }
  return 表;
}

/**
 * 数据 → 事实档案(纯函数)。
 * 一次遍历摊平"所有 NPC × 所有事务": 没有中间层, 也没有"先给每人一条记录再摊平"的过路结构。
 */
export function 事实档案(数据: { NPC?: Record<string, any>, 剧情时间?: string } | null | undefined): {
  分组: 事实分组[];
  总条数: number;
  人数: number;
  进行中数: number;
  过期数: number;
} {
  const 剧情时间 = String(数据?.剧情时间 ?? '');
  const 全部: 事实行[] = [];
  for (const [名, 卡] of Object.entries(数据?.NPC ?? {})) {
    const 变动 = 解析变动(卡?.['未完成事项变动']);
    for (const 事务 of 显示台账(卡?.[台账字段])) {
      const 度 = 紧迫度文案(事务, 剧情时间);
      全部.push({
        键: `${名}-${事务.编号}`,
        名,
        编号: 事务.编号,
        内容: 事务.内容,
        结果: String(事务.结果 ?? ''),
        存于: String(事务.时间 ?? ''),
        紧迫: 度.紧迫,
        标记: 变动标记(变动.get(事务.编号)),
        逾期: 度.逾期,
        类: `is-${状态类(事务.状态)}`,
        剩余: 度.剩余,
        已挂: 度.已挂,
        已结: 事务.状态 === '进行中' ? '' : 事务.状态,
        已作废: 事务.状态 === '已作废',
        幕后: 事务.完成方式 === '幕后',
      });
    }
  }

  const 进行中 = 全部.filter(行 => 行.类 === `is-${状态类('进行中' as 事务状态)}`);
  const 过期 = 进行中.filter(行 => 行.逾期);
  const 未过期 = 进行中.filter(行 => !行.逾期);
  const 了结 = 全部
    .filter(行 => 行.类 !== `is-${状态类('进行中' as 事务状态)}`)
    .sort((甲, 乙) => 乙.存于.localeCompare(甲.存于))
    .slice(0, 了结条数);

  const 分组: 事实分组[] = [
    {
      key: 'late',
      标题: '已过期',
      说明: `约定日期已过，或挂满 ${老化天数} 天`,
      行: [...过期].sort((甲, 乙) => (甲.剩余 ?? 0) - (乙.剩余 ?? 0)),
    },
    {
      key: 'ongoing',
      标题: '进行中',
      说明: '还来得及',
      行: [...未过期].sort((甲, 乙) => {
        const 甲剩余 = 甲.剩余 ?? Number.MAX_SAFE_INTEGER;
        const 乙剩余 = 乙.剩余 ?? Number.MAX_SAFE_INTEGER;
        if (甲剩余 !== 乙剩余)
          return 甲剩余 - 乙剩余;
        return (乙.已挂 ?? 0) - (甲.已挂 ?? 0);
      }),
    },
    { key: 'done', 标题: '最近了结', 说明: '留在账上可查', 行: 了结 },
  ].filter(组 => 组.行.length > 0);

  return {
    分组,
    总条数: 全部.length,
    人数: new Set(全部.map(行 => 行.名)).size,
    进行中数: 进行中.length,
    过期数: 过期.length,
  };
}

/** 这一页拿到的东西: 算好的分组 + 两个动作(去人物页 / 头像配色) */
export type 一致性面板 = {
  分组: ComputedRef<事实分组[]>;
  总条数: ComputedRef<number>;
  人数: ComputedRef<number>;
  进行中数: ComputedRef<number>;
  过期数: ComputedRef<number>;
  去人物页: (名: string) => void;
  头像色号: (名?: string | null) => number;
};

export const 一致性面板键: InjectionKey<一致性面板> = Symbol('bifang-一致性');

/** 壳侧: 把状态与动作接成这一页的接口 */
export function 建一致性面板(源: {
  数据: Ref<Record<string, any>>;
  去人物页: (名: string) => void;
  头像色号: (名?: string | null) => number;
}): 一致性面板 {
  const 档 = computed(() => 事实档案(源.数据.value));
  return {
    分组: computed(() => 档.value.分组),
    总条数: computed(() => 档.value.总条数),
    人数: computed(() => 档.value.人数),
    进行中数: computed(() => 档.value.进行中数),
    过期数: computed(() => 档.value.过期数),
    去人物页: 源.去人物页,
    头像色号: 源.头像色号,
  };
}

/** 页面侧: 必须在壳内使用 */
export function use一致性面板(): 一致性面板 {
  const 面板 = inject(一致性面板键);
  if (!面板)
    throw new Error('[彼方] 一致性面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
