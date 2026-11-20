// 彼方 · 设置页 —— 接口 / 提示词 / 幕后更新 / 标签过滤 四组。
//
// 这一页自己没有状态: 值都在 settings 上, 草稿(tagDraft / worldbookAlwaysDraft / worldbookExcludeDraft)
// 与动作(拉模型列表 / 测连接 / 预设增删)在壳里 —— 因为它们要写设置、要发请求。
// 搬出来之后这一页的接口就是下面这个类型: 从模型列表与预设名这两个派生算在这里, 其余是转发。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { 世界书写入目标表 } from './settings';

export type 设置面板 = {
  settings: Ref<Record<string, any>>;
  showKey: Ref<boolean>;
  /** 接口地址+模型都填了才算配置好了(壳的角标用同一个判据) */
  modelList: ComputedRef<string[]>;
  模型候选开: Ref<boolean>;
  选模型: (名: string) => void;
  fetchingModels: Ref<boolean>;
  testing: Ref<boolean>;
  loadModels: () => Promise<void>;
  testConnection: () => Promise<void>;
  /** 接口预设(整套接口配置的存取) */
  presetName: Ref<string>;
  presetNames: ComputedRef<string[]>;
  selectedPreset: Ref<string>;
  saveApiPreset: () => void;
  loadApiPreset: () => void;
  deleteApiPreset: () => void;
  /** 三份"一行一条"的草稿(逗号/顿号/换行都当分隔符) */
  tagDraft: Ref<string>;
  worldbookAlwaysDraft: Ref<string>;
  worldbookExcludeDraft: Ref<string>;
  世界书写入目标表: typeof 世界书写入目标表;
  /** 清空所有 NPC 的生理字段(生理监测关掉后想彻底不要这些数据) */
  清空生理数据: () => void;
  /** 数据备份: 导出为可粘贴文本 / 从文本导入(导入写快照并重同步世界书) */
  导出数据: () => Promise<void>;
  导入数据: () => void;
  导入文本: Ref<string>;
};

export function 建设置面板(源: Omit<设置面板, 'modelList' | 'presetNames' | '世界书写入目标表'>): 设置面板 {
  const modelList = computed(() => (源.settings.value?.接口?.模型列表 ?? []) as string[]);
  const presetNames = computed(() => Object.keys(源.settings.value?.接口预设 ?? {}));
  // ── 这里的 `...源` 摊开是**安全的**（2026-11-20 查过，需求方 #476）──
  //
  //  入参类型是 `Omit<设置面板, 'modelList' | 'presetNames' | '世界书写入目标表'>`，
  //  摊开之后补上这三个，**正好等于完整的 `设置面板`** —— 类型上不多不少。
  //
  //  而且实测：**23 个键全部被 `页面-设置.vue` 解构使用**，没有一个多余。
  //  所以这条摊开不会造成"接口自动膨胀"（那正是日志面板那条的问题：
  //  `...源` 把入参里的 `copyText` 也摊进了返回，而页面不用它）。
  //
  //  ⚠ 但**将来往入参里加键时要留意**：摊开会自动把它漏进返回。
  //    加了新键而页面不用，面板契约判据（"解构 == 面板类型键"）会红 —— 那是它该红。
  return { ...源, modelList, presetNames, 世界书写入目标表 };
}

export const 设置面板键: InjectionKey<设置面板> = Symbol('bifang-设置');

export function use设置面板(): 设置面板 {
  const 面板 = inject(设置面板键);
  if (!面板)
    throw new Error('[彼方] 设置面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}

