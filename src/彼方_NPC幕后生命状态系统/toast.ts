// 彼方 · 悬浮球旁弹窗: 贴球出现, 错误加重。
//
// 渲染机制(DOM 结构 / 堆叠 / 贴球定位 / 计时退场)与烟火、剧情导演同源, 已收进 共用/提示条.ts;
// 本文件只剩彼方自己的三件事: theme.ts 给的配色变量名与兜底色、球的几何、四个出口的名字。
// 可观察行为不变: 贴球左侧优先、空间不足弹到右方、错误红边+晃动+更长停留。
//
// 跨 document: 提示条画在酒馆父页面上, 元素按 `bf-` 前缀取名, 与烟火的 `yh-` 互不冲突。
import { 建提示条 } from '../共用/提示条';
import type { ToastType, 提示条配色 } from '../共用/提示条';
import { 弹窗兜底配色, 弹窗变量, 悬浮球直径 } from './theme';

export type { ToastType };

/** 面板配色(可选给, 没给的项用兜底色); 键与 theme.ts 的 弹窗配色 一致 */
export type ToastColors = 提示条配色;

const 提示条 = 建提示条({
  前缀: 'bf',
  配色变量: 弹窗变量,
  配色兜底: 弹窗兜底配色,
  严重度色: {
    success: '#4f9d69',
    info: '#7d8ea8',
    // 警告跟着面板强调色走(取不到时退回原来那个手抄值)
    warning: `var(${弹窗变量.accent},#b07a33)`,
    // 错误跟着弹窗错误边框走(取不到时退回 theme.ts 的兜底色)
    error: `var(${弹窗变量.errorBorder},${弹窗兜底配色.errorBorder})`,
  },
  // 锚点 x,y 是球心: 贴球定位按直径的一半让开(球心 → 球边)
  球半径: 悬浮球直径 / 2,
  兜底锚点: (视口宽, 视口高) => ({ x: 视口宽 - 悬浮球直径, y: 视口高 - 110 }),
});

export const showToast = 提示条.showToast;
export const toastSuccess = 提示条.toastSuccess;
export const toastInfo = 提示条.toastInfo;
export const toastWarning = 提示条.toastWarning;
export const toastError = 提示条.toastError;
export const setToastColors = 提示条.setToastColors;
export const setToastAnchor = 提示条.setToastAnchor;
