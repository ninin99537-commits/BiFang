// 剧情导演 · 悬浮球旁弹窗: 贴球出现, 错误加重。
//
// 可观测性(2026-10-07): **事件用条(短暂、可关), 状态用球(常驻、安静)**。四档闸门就设在 `showToast` 出口 ——
// 于是所有调用点(开始/完成/失败、熔断、E1 未送达、快照没落盘…)自动受同一档管, 不必每处各写一遍判断。
// 规格: docs/剧情导演-可观测性-提示条规格-v1.md §4
//
// 渲染机制(DOM 结构 / 堆叠 / 贴球定位 / 计时退场)与彼方、烟火同源, 已收进 共用/提示条.ts;
// 本文件只剩导演自己的几件事: 提示档(闸门)、主题.ts 给的配色变量名、球半径与兜底位置。
// 跨 document: 提示条画在酒馆父页面上, 元素按 `dj-` 前缀取名, 与 `bf-` / `yh-` 互不冲突。
import { 建提示条 } from '../共用/提示条';
import type { ToastType, 配色键 } from '../共用/提示条';
import { 层序, 弹窗变量, 悬浮球直径 } from './主题';

export type { ToastType };

/** 提示条档位(设置页 `导演.提示条` 的取值; schema.ts 直接引用这份常量, 不重抄第二遍) */
export const 提示档列表 = ['全部', '完成与异常', '仅异常', '关闭'] as const;
export type 提示档 = (typeof 提示档列表)[number];
/** 默认「完成与异常」: 每轮最多一条(完成或失败)。**开始推进**是 info, 默认不出声 —— 球已经在呼吸了 */
export const 提示档默认: 提示档 = '完成与异常';

/**
 * 纯函数: 这一档放不放行这一类事件。
 * **球的状态不经过这里** —— 设成「关闭」只是不出声, 悬浮球照常反映 编排中/出错/离线/剧终。
 */
export function 放行提示(档位: 提示档, kind: ToastType): boolean {
  const 异常类 = kind === 'warning' || kind === 'error';
  switch (档位) {
    case '全部':
      return true;
    case '完成与异常':
      return 异常类 || kind === 'success';
    case '仅异常':
      return 异常类;
    case '关闭':
      return false;
  }
}

let 当前档位: 提示档 = 提示档默认;

/** 设置 → 提示条 的唯一同步入口(读到的那一刻调用)。非法值忽略, 保持上一个好值。 */
export function 设提示档位(值: unknown): void {
  if ((提示档列表 as readonly string[]).includes(String(值))) 当前档位 = 值 as 提示档;
}
export function 取提示档位(): 提示档 {
  return 当前档位;
}

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
  前缀: 'dj',
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
  // 闸门在出口处生效: 每次调用都读当前档位(改了设置下一轮就生效)
  放行: type => 放行提示(当前档位, type),
});

export const showToast = 提示条.showToast;
export const toastSuccess = 提示条.toastSuccess;
export const toastInfo = 提示条.toastInfo;
export const toastWarning = 提示条.toastWarning;
export const toastError = 提示条.toastError;
export const setToastColors = 提示条.setToastColors;
export const setToastAnchor = 提示条.setToastAnchor;
export const setToastSuppressed = 提示条.setToastSuppressed;
