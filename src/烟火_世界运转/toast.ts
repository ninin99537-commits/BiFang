// 烟火 · 悬浮球旁弹窗: 贴球出现, 错误加重。
//
// 渲染机制(DOM 结构 / 堆叠 / 贴球定位 / 计时退场)与彼方、剧情导演同源, 已收进 共用/提示条.ts;
// 本文件只剩烟火自己的几件事: 主题.ts 给的配色变量名、球半径与兜底位置、四个出口的名字。
//
// 兜底色**有意**仍用本文件原来那批字面量(不换成 theme.ts 的 弹窗兜底配色): 那是可观察的颜色,
// 本次只收拢重复实现、不顺手改视觉。要统一另开一轮。
//
// 跨 document: 提示条画在酒馆父页面上, 元素按 `yh-` 前缀取名, 与彼方的 `bf-` 互不冲突。
import { 建提示条 } from '../共用/提示条';
import type { ToastType, 配色键, 提示条配色 } from '../共用/提示条';
import { 层序, 弹窗变量, 悬浮球直径 } from './主题';

export type { ToastType };

/** 面板配色(可选给, 没给的项用兜底色) */
export type ToastColors = 提示条配色;

/** 面板配色还没送到弹窗时的兜底(深色主题) —— 与重构前逐字一致 */
const 兜底色: Record<配色键, string> = {
  bg: '#202024',
  border: '#3c3c42',
  text: '#e9e8e6',
  accent: '#d9a13c',
  errorBg: '#2a1413',
  errorBorder: '#e0574a',
  errorText: '#ffe3de',
};

const 提示条 = 建提示条({
  前缀: 'yh',
  配色变量: 弹窗变量,
  配色兜底: 兜底色,
  严重度色: {
    success: '#4f9d69',
    info: '#7d8ea8',
    warning: '#d9a13c',
    error: '#e0574a',
  },
  // 锚点 x,y 是球心: 贴球定位按直径的一半让开(球心 → 球边)
  球半径: 悬浮球直径 / 2,
  // 兜底位置 = 面板机制给球定的默认落点(右下角)
  兜底锚点: (视口宽, 视口高) => ({ x: 视口宽 - 60, y: 视口高 - 130 }),
  堆栈层序: 层序.提示条堆栈,
});

export const showToast = 提示条.showToast;
export const toastSuccess = 提示条.toastSuccess;
export const toastInfo = 提示条.toastInfo;
export const toastWarning = 提示条.toastWarning;
export const toastError = 提示条.toastError;
export const setToastColors = 提示条.setToastColors;
export const setToastAnchor = 提示条.setToastAnchor;
export const setToastSuppressed = 提示条.setToastSuppressed;
