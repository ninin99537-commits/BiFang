// 彼方 · 日志页 —— 这一页没有自己的逻辑: 它展示壳与三个仓(日志/主提示词/控制台)里已有的东西。
//
// 搬出来只为一件事故: 页面此前连同"这一页到底要什么"一起挂在一个 68 键的 any 大对象上,
// 少传一个键要到点开面板那一刻才知道。现在这一页的接口就是下面这个类型, 少传一个编译期就说得清
// (transpileOnly 下由 use日志面板 的挂载校验兜底)。

import { computed, inject, ref } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
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

  // ---- §4.4 四标签合一代码窗 ----
  /** 当前查看的标签: 发出的内容 / AI 返回原文 / 世界书快照 / 错误详情 */
  代码标签: Ref<代码标签名>;
  代码标签表: ReadonlyArray<{ key: 代码标签名; 标签: string }>;
  /** 当前标签对应的正文(空标签返回空串) */
  当前代码: ComputedRef<string>;
  /** 「复制当前内容」按钮: 点后 1.4s 内显示「已复制 ✓」 */
  已复制: Ref<boolean>;
  复制当前代码: () => Promise<void>;

  // ---- §4.4 控制台等级过滤 ----
  控制台等级: Ref<控制台等级>;
  控制台等级表: ReadonlyArray<{ key: 控制台等级; 标签: string }>;
  /** 按当前等级过滤后、仍是「最新在上」的列表 */
  控制台显示: ComputedRef<Array<Record<string, any>>>;

  // ---- §4.4 顶部失败横幅的两个复制按钮 ----
  /** 复制排障头(时间/楼层/模型/错误摘要/规模) */
  复制排障头: () => Promise<void>;
  /** 复制 AI 原始返回的开头 */
  复制返回开头: () => Promise<void>;
  /** 本轮是否失败(横幅显隐) */
  本轮失败: ComputedRef<boolean>;
};

export type 代码标签名 = 'request' | 'response' | 'worldbook' | 'error';
export type 控制台等级 = 'all' | 'error' | 'warn' | 'info';

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

  // ---- §4.4 四标签合一代码窗 ----
  const 代码标签表 = [
    { key: 'request', 标签: '发出的内容' },
    { key: 'response', 标签: 'AI 返回原文' },
    { key: 'worldbook', 标签: '世界书快照' },
    { key: 'error', 标签: '错误详情' },
  ] as const;
  const 代码标签 = ref<代码标签名>('request');

  /** 当前标签的正文: 四个来源各自不同, 空日志时一律空串 */
  const 当前代码 = computed(() => {
    const 日志 = 源.debugLog.value;
    switch (代码标签.value) {
      case 'request':
        return 日志?.request ?? '';
      case 'response':
        return 日志?.response ?? '';
      case 'worldbook':
        return 源.mainPrompt.value ?? '';
      case 'error':
        return 日志?.error ?? '';
      default:
        return '';
    }
  });

  /** 「已复制 ✓」的短暂反馈: 1.4s 后回落, 定时器只在用户点按钮时才起(不常驻) */
  const 已复制 = ref(false);
  let 已复制定时器: ReturnType<typeof setTimeout> | null = null;
  async function 复制当前代码() {
    const 文本 = 当前代码.value;
    if (!文本) return;
    await 源.copyText(文本);
    if (已复制定时器 !== null) clearTimeout(已复制定时器);
    已复制.value = true;
    已复制定时器 = setTimeout(() => {
      已复制.value = false;
      已复制定时器 = null;
    }, 1400);
  }

  // ---- §4.4 控制台等级过滤 ----
  const 控制台等级表 = [
    { key: 'all', 标签: '全部' },
    { key: 'error', 标签: '错误' },
    { key: 'warn', 标签: '警告' },
    { key: 'info', 标签: '信息' },
  ] as const;
  const 控制台等级 = ref<控制台等级>('all');
  const 控制台显示 = computed(() => {
    const 等级 = 控制台等级.value;
    if (等级 === 'all') return consoleLinesReversed.value;
    return consoleLinesReversed.value.filter(行 => String(行.type) === 等级);
  });

  // ---- §4.4 顶部失败横幅 ----
  const 本轮失败 = computed(() => !!源.debugLog.value?.error);

  /** 复制排障头: 只给定位问题需要的几行, 不含正文(正文动辄几万字, 贴进聊天会淹掉重点) */
  async function 复制排障头() {
    const 日志 = 源.debugLog.value;
    if (!日志) return;
    const 头 = [
      '【彼方 · 排障头】',
      `时间: ${源.fmtTime(日志.time)}`,
      `楼层: ${日志.replyIds.length > 0 ? `#${日志.replyIds.join('、#')}` : '—'}`,
      `模型: ${日志.model || '—'}`,
      `更新人物: ${日志.updatedNpcs.join('、') || '—'}`,
      `移除人物: ${日志.removedNpcs.join('、') || '—'}`,
      日志.规模行 ? `规模: ${日志.规模行}` : '',
      `错误: ${日志.error ? 日志.error.split('\n')[0] : '(无)'}`,
    ].filter(Boolean).join('\n');
    await 源.copyText(头);
  }

  /** 复制返回开头: 只截前 600 字, 便于快速看出围栏/截断问题 */
  async function 复制返回开头() {
    const 返回 = 源.debugLog.value?.response ?? '';
    if (!返回) return;
    await 源.copyText(返回.slice(0, 600));
  }

  return {
    ...源,
    consoleLinesReversed,
    规模超线,
    可复制,
    token口径: '中日韩字符 1 字≈1 token, 其余 4 字符≈1 token(粗估)',
    代码标签,
    代码标签表,
    当前代码,
    已复制,
    复制当前代码,
    控制台等级,
    控制台等级表,
    控制台显示,
    复制排障头,
    复制返回开头,
    本轮失败,
  };
}

export const 日志面板键: InjectionKey<日志面板> = Symbol('bifang-日志');

export function use日志面板(): 日志面板 {
  const 面板 = inject(日志面板键);
  if (!面板)
    throw new Error('[彼方] 日志面板上下文未提供(该页面必须在悬浮球界面壳内使用)');
  return 面板;
}
