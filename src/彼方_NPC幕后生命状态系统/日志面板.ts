// 彼方 · 日志页 —— 这一页没有自己的逻辑: 它展示壳与三个仓(日志/主提示词/控制台)里已有的东西。
//
// 搬出来只为一件事故: 页面此前连同"这一页到底要什么"一起挂在一个 68 键的 any 大对象上,
// 少传一个键要到点开面板那一刻才知道。现在这一页的接口就是下面这个类型, 少传一个编译期就说得清
// (transpileOnly 下由 use日志面板 的挂载校验兜底)。

import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey } from 'vue';
import type { useConsoleStore, useDebugStore } from './日志仓';
import type { 更新日志 } from './日志仓';
import { 超建议线 } from './规模';
import type { 规模数据 } from './规模';

export type 日志面板 = {
  debugLog: ComputedRef<更新日志 | null>;
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
  /** 规模行的警示标记: 超建议线(20 个 NPC 或状态卡合计 60000 字)时为真 —— 只是提醒, 不阻止发送 */
  规模超线: ComputedRef<boolean>;
  /** token 估算口径(界面上要写出来, 否则那个数字没法解释) */
  token口径: string;
  /** 有没有日志可复制: 空日志时复制按钮必须禁用(复制空串还会提示"已复制", 那是误导) */
  可复制: ComputedRef<boolean>;
};

/** 超线时挂在规模行上的属性。名字是需求钉死的断言锚点, 所以写在面板接口这里(不是模板里) ——
 *  改它等于改契约, 而模板只是 v-bind 这份对象。
 *  (页面上的两个"复制"按钮在空日志时 disabled: 空串复制过去只会提示"已复制", 那才是误导。) */
export const 规模警示属性 = { 'data-bf-scale-warn': '1' };

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
  // 超线判定与"数字怎么来的"共用同一份口径(规模.ts), 模板只读布尔值
  const 规模超线 = computed(() => 超建议线(源.debugLog.value?.规模 as 规模数据 | null | undefined));
  // 空日志 = 复制出来是空串: 按钮禁用, 而不是复制成功后弹"已复制"
  const 可复制 = computed(() => !!源.debugLog.value);
  return { ...源, consoleLinesReversed, 规模超线, 可复制, token口径: '中日韩字符 1 字≈1 token, 其余 4 字符≈1 token(粗估)' };
}

export const 日志面板键: InjectionKey<日志面板> = Symbol('bifang-日志');

export function use日志面板(): 日志面板 {
  const 面板 = inject(日志面板键);
  if (!面板)
    throw new Error('[彼方] 日志面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
