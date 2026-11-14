// 彼方 · 日志页 —— 这一页没有自己的逻辑: 它展示壳与三个仓(日志/主提示词/控制台)里已有的东西。
//
// 搬出来只为一件事故: 页面此前连同"这一页到底要什么"一起挂在一个 68 键的 any 大对象上,
// 少传一个键要到点开面板那一刻才知道。现在这一页的接口就是下面这个类型, 少传一个编译期就说得清
// (transpileOnly 下由 use日志面板 的挂载校验兜底)。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey } from 'vue';
import type { useConsoleStore, useDebugStore, useMainPromptStore } from './日志仓';

export type 日志面板 = {
  debugLog: ComputedRef<Array<Record<string, any>>>;
  debugStore: ReturnType<typeof useDebugStore>;
  mainPrompt: ComputedRef<string>;
  mainPromptTime: ComputedRef<number>;
  mainPromptCount: ComputedRef<number>;
  consoleLines: ComputedRef<Array<Record<string, any>>>;
  consoleLinesReversed: ComputedRef<Array<Record<string, any>>>;
  consoleStore: ReturnType<typeof useConsoleStore>;
  /** 时间格式化 / 复制(带降级链) / 复制诊断报告 */
  fmtTime: (ts?: number) => string;
  copyText: (text: string) => Promise<void>;
  copyErrorReport: () => Promise<void>;
};

export function 建日志面板(源: {
  debugLog: 日志面板['debugLog'];
  debugStore: 日志面板['debugStore'];
  mainPrompt: 日志面板['mainPrompt'];
  mainPromptTime: 日志面板['mainPromptTime'];
  mainPromptCount: 日志面板['mainPromptCount'];
  consoleLines: 日志面板['consoleLines'];
  consoleStore: 日志面板['consoleStore'];
  fmtTime: 日志面板['fmtTime'];
  copyText: 日志面板['copyText'];
  copyErrorReport: 日志面板['copyErrorReport'];
}): 日志面板 {
  // 控制台按"最新在上"展示: 这一页的规矩, 放在这里而不是让模板自己 reverse()
  const consoleLinesReversed = computed(() => [...源.consoleLines.value].reverse());
  return { ...源, consoleLinesReversed };
}

export const 日志面板键: InjectionKey<日志面板> = Symbol('bifang-日志');

export function use日志面板(): 日志面板 {
  const 面板 = inject(日志面板键);
  if (!面板)
    throw new Error('[彼方] 日志面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
