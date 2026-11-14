import { ref } from 'vue';
import type { useConfigStore } from '../store';
import { DragPayload, DropTarget } from './pointerDrag';

/**
 * 全局共享的「可视化布局模式」开关。
 * 由 App.vue 顶部的「布局调整」按钮切换；WidgetGroup / WidgetStack 等子渲染层
 * 读取它，在布局态给真实渲染的子控件注入拖拽手柄与 drop 标记。
 *
 * 用 module 级 ref，避免经 pinia store 触发整树重渲的额外开销，
 * 也让 App 顶层与深层子组件共享同一开关。
 */
export const layoutMode = ref(false);

type Store = ReturnType<typeof useConfigStore>;

/**
 * 统一落点解算：把拖拽 payload 投递到目标。
 * 顶层与所有子层（WidgetStack / WidgetGroup）共用此函数，
 * 跨层拖动（组内→顶层、顶层→组内、stack页→顶层/别的组）也在这里收口。
 */
export function applyLayoutDrop(store: Store, payload: DragPayload, target: DropTarget): void {
  if (payload.kind === 'stack-page') {
    if (target.kind === 'top-cell') {
      store.dropStackPageToTop(payload.groupId, payload.pageIndex, target.row, target.cell);
      return;
    }
    if (target.kind === 'top-end') {
      store.dropStackPageToTop(payload.groupId, payload.pageIndex, target.row, 999);
      return;
    }
    if (target.kind === 'into-group' && target.groupId !== payload.groupId) {
      store.dropStackPageToTop(payload.groupId, payload.pageIndex, 0, 0);
      const top = store.config.layout.rows;
      const childId = payload.widgetId;
      for (let r = 0; r < top.length; r++) {
        const c = top[r].widgetIds.indexOf(childId);
        if (c >= 0) {
          store.dropTopWidgetIntoGroup(target.groupId, r, c);
          break;
        }
      }
      return;
    }
    // 落到 group-cell / group-end：先上提到顶层第一行，再视情况并入目标组
    if (target.kind === 'group-cell' || target.kind === 'group-end') {
      store.dropStackPageToTop(payload.groupId, payload.pageIndex, 0, 0);
      if (target.groupId !== payload.groupId) {
        const top = store.config.layout.rows;
        const childId = payload.widgetId;
        for (let r = 0; r < top.length; r++) {
          const c = top[r].widgetIds.indexOf(childId);
          if (c >= 0) {
            if (target.kind === 'group-cell') {
              store.moveWidgetCell(r, c, 0, 0);
            }
            store.dropTopWidgetIntoGroup(target.groupId, r, c);
            break;
          }
        }
      }
    }
    return;
  }

  if (payload.kind === 'top') {
    if (target.kind === 'into-group') {
      store.dropTopWidgetIntoGroup(target.groupId, payload.row, payload.cell);
      return;
    }
    if (target.kind === 'top-cell') {
      if (payload.row === target.row && payload.cell === target.cell) return;
      store.moveWidgetCell(payload.row, payload.cell, target.row, target.cell);
      return;
    }
    if (target.kind === 'top-end') {
      store.moveWidgetCell(payload.row, payload.cell, target.row, 999);
      return;
    }
    // 顶层控件落到 group-cell / group-end：并入那个 group
    if (target.kind === 'group-cell' || target.kind === 'group-end') {
      store.dropTopWidgetIntoGroup(target.groupId, payload.row, payload.cell);
    }
    return;
  }

  // child → 任意落点
  if (target.kind === 'top-cell') {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, target.row, target.cell);
    return;
  }
  if (target.kind === 'top-end') {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, target.row, 999);
    return;
  }
  if (target.kind === 'group-cell' && target.groupId === payload.groupId) {
    if (payload.row === target.row && payload.cell === target.cell) return;
    store.moveChildWidgetCell(payload.groupId, payload.row, payload.cell, target.row, target.cell);
    return;
  }
  if (target.kind === 'group-end' && target.groupId === payload.groupId) {
    store.moveChildWidgetCell(payload.groupId, payload.row, payload.cell, target.row, 999);
    return;
  }
  if (target.kind === 'into-group' && target.groupId !== payload.groupId) {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, 0, 0);
    const top = store.config.layout.rows;
    const childId = payload.widgetId;
    for (let r = 0; r < top.length; r++) {
      const c = top[r].widgetIds.indexOf(childId);
      if (c >= 0) {
        store.dropTopWidgetIntoGroup(target.groupId, r, c);
        break;
      }
    }
    return;
  }
  if (target.kind === 'group-cell' && target.groupId !== payload.groupId) {
    // 先上提到顶层，再并入目标分组对应位置
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, 0, 0);
    const top = store.config.layout.rows;
    const childId = payload.widgetId;
    for (let r = 0; r < top.length; r++) {
      const c = top[r].widgetIds.indexOf(childId);
      if (c >= 0) {
        store.dropTopWidgetIntoGroup(target.groupId, r, c);
        break;
      }
    }
    return;
  }
  if (target.kind === 'group-end' && target.groupId !== payload.groupId) {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, 0, 0);
    const childId = payload.widgetId;
    const top = store.config.layout.rows;
    for (let r = 0; r < top.length; r++) {
      const c = top[r].widgetIds.indexOf(childId);
      if (c >= 0) {
        store.dropTopWidgetIntoGroup(target.groupId, r, c);
        break;
      }
    }
  }
}
