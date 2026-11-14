/**
 * 统一拖拽：桌面/触屏均用 pointer 模拟。
 * 不用 HTML5 DnD（Chrome 对复杂 DOM 做拖影/事件时会卡死主线程）。
 *
 * 手机：未真正进入拖拽前不 preventDefault，空白处可上下滑；
 * 拖拽中靠近滚动容器边缘时自动滚动。
 */

export type DragPayload =
  | { kind: 'top'; row: number; cell: number; widgetId: string }
  | { kind: 'child'; groupId: string; row: number; cell: number; widgetId: string }
  | { kind: 'stack-page'; groupId: string; pageIndex: number; widgetId: string };

export type DropTarget =
  | { kind: 'top-cell'; row: number; cell: number }
  | { kind: 'top-end'; row: number }
  | { kind: 'group-cell'; groupId: string; row: number; cell: number }
  | { kind: 'group-end'; groupId: string; row: number }
  | { kind: 'into-group'; groupId: string };

type DragState = {
  payload: DragPayload;
  ghost: HTMLElement | null;
  active: boolean;
};

let state: DragState | null = null;
const DROP_ATTR = 'data-sb-drop';
let pointerCleanup: (() => void) | null = null;
/** 布局模式滚动根（.sb-rows），拖拽边缘自动滚 */
let dragScrollRoot: HTMLElement | null = null;
let autoScrollRaf = 0;
let lastPointerY = 0;

const EDGE_ZONE = 56;
const MAX_SCROLL_SPEED = 18;

export function setDropMeta(el: HTMLElement, json: string) {
  el.setAttribute(DROP_ATTR, json);
}

export function clearDropMeta(el: HTMLElement) {
  el.removeAttribute(DROP_ATTR);
}

export function setDragScrollRoot(el: HTMLElement | null) {
  dragScrollRoot = el;
}

export function beginHtml5DragScroll() {
  /* no-op */
}

export function endHtml5DragScroll() {
  /* no-op */
}

export function forceStopAllDrag() {
  if (pointerCleanup) {
    try {
      pointerCleanup();
    } catch {
      /* ignore */
    }
    pointerCleanup = null;
  }
  stopAutoScroll();
  cleanupGhost();
  state = null;
  restoreBodyStyle();
}

function ownerDoc(el?: Element | null): Document {
  try {
    if (el?.ownerDocument) return el.ownerDocument;
  } catch {
    /* ignore */
  }
  try {
    const p = (window as any).parent as Window | undefined;
    if (p?.document) return p.document;
  } catch {
    /* cross-origin */
  }
  return document;
}

function ownerWin(doc: Document): Window {
  return (doc.defaultView || window) as Window;
}

function bodyOf(doc: Document): HTMLElement {
  return doc.body || document.body;
}

function restoreBodyStyle() {
  for (const d of [document]) {
    try {
      d.body.style.userSelect = '';
      d.body.style.cursor = '';
      d.body.style.touchAction = '';
    } catch {
      /* ignore */
    }
  }
  try {
    const p = (window as any).parent as Window | undefined;
    if (p?.document?.body) {
      p.document.body.style.userSelect = '';
      p.document.body.style.cursor = '';
      p.document.body.style.touchAction = '';
    }
  } catch {
    /* ignore */
  }
}

function cleanupGhost() {
  if (state?.ghost) {
    try {
      state.ghost.remove();
    } catch {
      /* ignore */
    }
  }
  try {
    ownerDoc()
      .querySelectorAll('[data-sb-drag-ghost="1"]')
      .forEach(n => n.remove());
  } catch {
    /* ignore */
  }
}

function parseDrop(el: Element | null): DropTarget | null {
  let cur: Element | null = el;
  let guard = 0;
  while (cur && guard++ < 80) {
    const raw = (cur as HTMLElement).getAttribute?.(DROP_ATTR);
    if (raw) {
      try {
        return JSON.parse(raw) as DropTarget;
      } catch {
        return null;
      }
    }
    cur = cur.parentElement;
  }
  return null;
}

function createGhost(doc: Document, label: string, x: number, y: number): HTMLElement {
  const g = doc.createElement('div');
  g.textContent = label;
  g.setAttribute('data-sb-drag-ghost', '1');
  Object.assign(g.style, {
    position: 'fixed',
    left: `${x + 8}px`,
    top: `${y + 8}px`,
    zIndex: '10060',
    pointerEvents: 'none',
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    background: 'rgba(109, 181, 163, 0.92)',
    color: '#0f1a18',
    boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSStyleDeclaration);
  bodyOf(doc).appendChild(g);
  return g;
}

function moveGhost(x: number, y: number) {
  if (!state?.ghost) return;
  state.ghost.style.left = `${x + 8}px`;
  state.ghost.style.top = `${y + 8}px`;
}

function elementFromPointSafe(doc: Document, x: number, y: number): Element | null {
  try {
    return doc.elementFromPoint(x, y);
  } catch {
    try {
      return document.elementFromPoint(x, y);
    } catch {
      return null;
    }
  }
}

function findScrollableParents(from: Element | null, root: HTMLElement | null): HTMLElement[] {
  const list: HTMLElement[] = [];
  let cur: Element | null = from;
  let guard = 0;
  while (cur && guard++ < 40) {
    if (cur instanceof HTMLElement) {
      const st = getComputedStyle(cur);
      const oy = st.overflowY;
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        cur.scrollHeight > cur.clientHeight + 1
      ) {
        list.push(cur);
      }
    }
    if (root && cur === root) break;
    cur = cur.parentElement;
  }
  if (root && !list.includes(root) && root.scrollHeight > root.clientHeight + 1) {
    list.push(root);
  }
  return list;
}

function resolveScrollRoot(): HTMLElement | null {
  if (dragScrollRoot) return dragScrollRoot;
  try {
    return (
      (document.querySelector('.sb-rows') as HTMLElement | null) ||
      (document.querySelector('.sb-root.has-layout .sb-main') as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

function edgeScrollStep(clientY: number) {
  const scrollRoot = resolveScrollRoot();
  const roots = findScrollableParents(scrollRoot, scrollRoot);
  if (scrollRoot && !roots.includes(scrollRoot)) roots.unshift(scrollRoot);
  // 也尝试当前指针下的可滚祖先
  try {
    const doc = ownerDoc(scrollRoot);
    const hit = elementFromPointSafe(doc, 8, clientY);
    for (const el of findScrollableParents(hit, scrollRoot)) {
      if (!roots.includes(el)) roots.push(el);
    }
  } catch {
    /* ignore */
  }

  let scrolled = false;
  for (const el of roots) {
    const rect = el.getBoundingClientRect();
    if (rect.height < 24) continue;
    const topEdge = rect.top + EDGE_ZONE;
    const bottomEdge = rect.bottom - EDGE_ZONE;
    let dy = 0;
    if (clientY < topEdge) {
      const t = Math.min(1, (topEdge - clientY) / EDGE_ZONE);
      dy = -Math.ceil(MAX_SCROLL_SPEED * (0.35 + t * 0.65));
    } else if (clientY > bottomEdge) {
      const t = Math.min(1, (clientY - bottomEdge) / EDGE_ZONE);
      dy = Math.ceil(MAX_SCROLL_SPEED * (0.35 + t * 0.65));
    }
    if (!dy) continue;
    const prev = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.max(0, Math.min(max, prev + dy));
    if (el.scrollTop !== prev) scrolled = true;
  }
  return scrolled;
}

function stopAutoScroll() {
  if (autoScrollRaf) {
    try {
      cancelAnimationFrame(autoScrollRaf);
    } catch {
      /* ignore */
    }
    autoScrollRaf = 0;
  }
}

function startAutoScrollLoop() {
  if (autoScrollRaf) return;
  const tick = () => {
    autoScrollRaf = 0;
    if (!state?.active) return;
    edgeScrollStep(lastPointerY);
    autoScrollRaf = requestAnimationFrame(tick);
  };
  autoScrollRaf = requestAnimationFrame(tick);
}

/**
 * pointerdown 时调用。鼠标 / 触屏 / 笔均走此路径（禁用 HTML5 DnD）。
 * 返回 true 表示已绑定；手指轻移 < 阈值 时不拦截，便于列表滚动。
 */
export function bindPointerDrag(
  e: PointerEvent,
  payload: DragPayload,
  label: string,
  onDrop: (payload: DragPayload, target: DropTarget) => void,
): boolean {
  // 只响应主键：鼠标左键 / 触点 0
  if (e.pointerType === 'mouse' && e.button !== 0) return false;

  if (pointerCleanup) {
    try {
      pointerCleanup();
    } catch {
      /* ignore */
    }
    pointerCleanup = null;
  }

  // 注意：此处不 preventDefault，否则手机端布局列表无法上下滑。
  // 真正进入拖拽（moved）后再拦截默认滚动。
  e.stopPropagation();

  const startX = e.clientX;
  const startY = e.clientY;
  lastPointerY = e.clientY;
  let moved = false;
  const pointerId = e.pointerId;
  const targetEl = e.currentTarget as HTMLElement | null;
  const doc = ownerDoc(targetEl);
  const win = ownerWin(doc);
  let cleaned = false;
  let safetyTimer: number | null = null;
  const threshold = e.pointerType === 'touch' ? 10 : 6;

  try {
    targetEl?.setPointerCapture?.(pointerId);
  } catch {
    /* ignore */
  }

  const finish = (ev?: PointerEvent) => {
    if (cleaned) return;
    cleaned = true;
    pointerCleanup = null;
    stopAutoScroll();
    if (safetyTimer != null) {
      try {
        win.clearTimeout(safetyTimer);
      } catch {
        /* ignore */
      }
      safetyTimer = null;
    }
    try {
      win.removeEventListener('pointermove', onMove, true);
      win.removeEventListener('pointerup', onUp, true);
      win.removeEventListener('pointercancel', onUp, true);
      win.removeEventListener('keydown', onKey, true);
    } catch {
      /* ignore */
    }
    if (win !== window) {
      try {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        window.removeEventListener('keydown', onKey, true);
      } catch {
        /* ignore */
      }
    }
    try {
      targetEl?.releasePointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }
    if (moved && state && ev) {
      try {
        const hit = elementFromPointSafe(doc, ev.clientX, ev.clientY);
        const drop = parseDrop(hit);
        if (drop) onDrop(state.payload, drop);
      } catch {
        /* ignore */
      }
    }
    cleanupGhost();
    state = null;
    restoreBodyStyle();
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') finish();
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    lastPointerY = ev.clientY;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < threshold) return;

    if (!moved) {
      moved = true;
      // 进入拖拽后才锁滚动 / 选中
      if (ev.cancelable) {
        try {
          ev.preventDefault();
        } catch {
          /* ignore */
        }
      }
      state = {
        payload,
        ghost: createGhost(doc, label, ev.clientX, ev.clientY),
        active: true,
      };
      try {
        bodyOf(doc).style.userSelect = 'none';
        bodyOf(doc).style.cursor = 'grabbing';
        bodyOf(doc).style.touchAction = 'none';
      } catch {
        /* ignore */
      }
      startAutoScrollLoop();
    } else if (ev.cancelable) {
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
    }
    moveGhost(ev.clientX, ev.clientY);
    edgeScrollStep(ev.clientY);
  };

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    finish(ev);
  };

  pointerCleanup = () => finish();

  // 异常中断兜底，避免永远锁住 userSelect
  try {
    safetyTimer = win.setTimeout(() => finish(), 15000);
  } catch {
    /* ignore */
  }

  win.addEventListener('pointermove', onMove, { capture: true, passive: false });
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onUp, true);
  win.addEventListener('keydown', onKey, true);
  if (win !== window) {
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('keydown', onKey, true);
  }
  return true;
}
