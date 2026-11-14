// 彼方 · 悬浮球旁弹窗: 贴球出现, 错误加重。
//
// 渲染机制(DOM 结构 / 堆叠 / 贴球定位 / 计时退场)与烟火、剧情导演同源, 已收进 共用/提示条.ts;
// 本文件只剩彼方自己的几件事: theme.ts 给的配色变量名与兜底色、球的几何、外观、四个出口的名字。
// 可观察行为不变: 贴球左侧优先、空间不足弹到右方、错误停留更久、层级高于面板遮罩。
//
// 外观(2026-10 重构): 贴边纸条。小圆角、细边线、浅阴影、没有通用圆角的"通知胶囊"感;
// 成功/信息/警告/错误只改左边线与圆点的颜色, 形状完全一致(错误不再整块换底色、不再晃动)。
//
// 跨 document: 提示条画在酒馆父页面上, 元素按 `bf-` 前缀取名, 与烟火的 `yh-` 互不冲突。
import { 建提示条 } from '../共用/提示条';
import type { ToastType, 提示条配色 } from '../共用/提示条';
import { 弹窗兜底配色, 弹窗变量, 悬浮球直径, 提示条严重度, 提示条阴影 } from './theme';

export type { ToastType };

/** 面板配色(可选给, 没给的项用兜底色); 键与 theme.ts 的 弹窗配色 一致 */
export type ToastColors = 提示条配色;

const 提示条 = 建提示条({
  前缀: 'bf',
  配色变量: 弹窗变量,
  配色兜底: 弹窗兜底配色,
  // 四档状态色只在 theme.ts 里写一次; 这里用同一份值, 不另抄一遍
  严重度色: {
    success: 提示条严重度.success,
    info: 提示条严重度.info,
    warning: 提示条严重度.warning,
    error: 提示条严重度.error,
  },
  // 锚点 x,y 是球心: 贴球定位按直径的一半让开(球心 → 球边)
  球半径: 悬浮球直径 / 2,
  // 提示条必须压在"打开面板"的遮罩(2147483001)与状态字(2147483002)**之上** ——
  // 默认的 2147482998 会被遮罩盖住, 于是"面板没能显示出来"的报错用户根本看不见
  堆栈层序: 2147483003,
  兜底锚点: (视口宽, 视口高) => ({ x: 视口宽 - 悬浮球直径, y: 视口高 - 110 }),
  // D 原稿: 左缘一道状态色窗光, 右侧 10px 圆角
  外观: {
    圆角: 10,
    阴影: 提示条阴影,
    边线宽: 3,
    内边距: '11px 16px 11px 18px',
    字体: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif',
    错误整块换色: false,
    错误大标记: false,
    入场动画: 'bfToastIn .18s ease-out',
    错误动画: 'bfToastIn .18s ease-out',
    退场动画: 'bfToastOut .16s ease forwards',
  },
});

export const showToast = 提示条.showToast;
export const toastSuccess = 提示条.toastSuccess;
export const toastInfo = 提示条.toastInfo;
export const toastWarning = 提示条.toastWarning;
export const toastError = 提示条.toastError;
export const setToastColors = 提示条.setToastColors;
export const setToastAnchor = 提示条.setToastAnchor;
export const setToastSuppressed = 提示条.setToastSuppressed;
