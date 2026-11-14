import type { RowAlign } from '../schema';

/**
 * 行内列宽：
 *
 * smartEqual 关：
 * - equal：硬等分
 * - 其它分布：短列自然宽，长列 ≤ 等分（省略），剩余空白 justify
 *
 * smartEqual 开：
 * - 总自然宽 ≤ 可用：每列取自然宽（完整显示），剩余空白交给 justify（equal 则 pad 满行）
 * - 总自然宽 > 可用：按比例/保底压缩，尽量多显示长文，仍可省略
 */
export function computeSmartEqualWidths(
  containerWidth: number,
  naturalWidths: number[],
  gap = 0,
  rowAlign: RowAlign | string = 'between',
  titleWidths: number[] = [],
  smartEqual = true,
): number[] {
  const n = naturalWidths.length;
  if (n <= 0) return [];
  if (n === 1) return [Math.max(0, containerWidth)];

  const gaps = Math.max(0, gap) * (n - 1);
  const avail = Math.max(0, containerWidth - gaps);
  const natural = naturalWidths.map(w => Math.max(0, Number(w) || 0));
  const titles = natural.map((_, i) => Math.max(0, Number(titleWidths[i]) || 0));
  const eq = avail / n;
  const totalNatural = natural.reduce((a, b) => a + b, 0);
  const fillRow = rowAlign === 'equal';

  // 保底：标题 + 数据区，且不超过等分（避免多列保底互挤）
  const floors = natural.map((nat, i) => {
    const t = titles[i];
    const base = t > 0 ? t + 48 : 56;
    const soft = Math.max(base, Math.min(nat || base, t > 0 ? t + 100 : 100));
    return Math.max(40, Math.min(soft, eq));
  });

  if (smartEqual) {
    // 够完整显示：按自然宽；equal 再 pad 满行
    if (totalNatural <= avail + 0.5 && totalNatural > 0.5) {
      const result = natural.map(w => Math.max(0, Math.round(w * 100) / 100));
      return fillRow ? padToAvail(result, avail) : result;
    }
    if (totalNatural <= 0.5) {
      return padToAvail(
        Array.from({ length: n }, () => eq),
        avail,
      );
    }
    // 不够：尽量多显示（按自然宽比例压缩，保底标题区）
    return compressWithFloors(natural, floors, avail);
  }

  // —— 智能关 ——
  if (fillRow) {
    return padToAvail(
      Array.from({ length: n }, () => eq),
      avail,
    );
  }

  // pack：短列自然宽，长列最多等分
  if (totalNatural <= 0.5) {
    return natural.map(() => Math.max(40, Math.min(eq, 72)));
  }
  if (totalNatural <= avail + 0.5) {
    return natural.map(w => Math.max(0, Math.round(w * 100) / 100));
  }
  const preferred = natural.map((w, i) => {
    const cap = eq;
    const raw = Math.min(Math.max(w, floors[i]), cap);
    return Math.max(floors[i], raw);
  });
  const sum = preferred.reduce((a, b) => a + b, 0);
  if (sum <= avail + 0.5) {
    return preferred.map(w => Math.max(0, Math.round(w * 100) / 100));
  }
  return compressWithFloors(preferred, floors, avail);
}

function compressWithFloors(natural: number[], floors: number[], avail: number): number[] {
  const n = natural.length;
  if (n <= 0) return [];
  const totalNatural = natural.reduce((a, b) => a + b, 0);
  if (totalNatural <= 0.5) {
    return padToAvail(
      Array.from({ length: n }, () => avail / n),
      avail,
    );
  }
  let mins = floors.slice();
  let minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > avail + 0.5) {
    const s = avail / minSum;
    mins = mins.map(m => Math.max(40, m * s));
    return padToAvail(mins, avail);
  }
  const extras = natural.map((w, i) => Math.max(0, w - mins[i]));
  const extraSum = extras.reduce((a, b) => a + b, 0);
  const slack = avail - minSum;
  if (extraSum <= 0.5) {
    return padToAvail(
      mins.map(m => m + slack / n),
      avail,
    );
  }
  const scaled = mins.map((m, i) => m + (extras[i] / extraSum) * slack);
  return padToAvail(scaled, avail);
}

function padToAvail(widths: number[], avail: number): number[] {
  if (!widths.length) return widths;
  const next = widths.map(w => Math.max(0, w));
  const sum = next.reduce((a, b) => a + b, 0);
  const diff = avail - sum;
  if (Math.abs(diff) > 0.5) {
    let maxI = 0;
    for (let i = 1; i < next.length; i++) {
      if (next[i] >= next[maxI]) maxI = i;
    }
    next[maxI] = Math.max(0, next[maxI] + diff);
  }
  return next.map(w => Math.max(0, Math.round(w * 100) / 100));
}

/** 测每列标题自然宽（用于下限 = 标题 + 数据区） */
export function measureTitleWidths(cells: HTMLElement[]): number[] {
  return cells.map(el => {
    if (el.classList.contains('is-divider') || el.querySelector?.('.w-divider')) return 0;
    const titles = Array.from(
      el.querySelectorAll('.w-label-title, .w-kv-key, .w-bar-label, .w-list-title, .w-group-title'),
    ) as HTMLElement[];
    if (!titles.length) return 0;
    let max = 0;
    for (const title of titles) {
      max = Math.max(max, title.getBoundingClientRect().width, title.scrollWidth, 0);
    }
    return Math.ceil(max);
  });
}

/**
 * 测量自然内容宽。
 * - 进度条：专用估算
 * - 分组：取组内叶子控件自然宽的最大值（竖排，非整组横铺 max-content）
 */
export function measureNaturalWidths(cells: HTMLElement[], rowHeight = 0): number[] {
  return cells.map(el => measureOneNatural(el, rowHeight));
}

/**
 * 与同行等高图片的应有宽度：按图片固有宽高比 × 目标行高估算。
 * 行高未知时退回一个保底，保证列不塌成 0。
 */
function stretchImageNaturalWidth(imgNode: HTMLElement, rowHeight: number): number {
  const img = imgNode.querySelector('img') as HTMLImageElement | null;
  const ratio = img && img.naturalWidth && img.naturalHeight
    ? img.naturalWidth / img.naturalHeight
    : 0;
  if (rowHeight > 0) {
    // 减去可能的标题行高
    const title = imgNode.querySelector('.w-image-title') as HTMLElement | null;
    const titleH = title ? title.getBoundingClientRect().height + 4 : 0;
    const frameH = Math.max(0, rowHeight - titleH);
    if (ratio > 0) return frameH * ratio;
    return frameH > 0 ? frameH : 96;
  }
  // 行高未知：用固有比例给个适中估算（避免初次高度还为 0 算成 0）
  if (ratio > 0) return Math.min(160, 96 * ratio);
  return 96;
}

function measureBarNatural(root: HTMLElement): number {
  const label = root.querySelector('.w-bar-label') as HTMLElement | null;
  const text = root.querySelector('.w-bar-text') as HTMLElement | null;
  const dir = getComputedStyle(root).flexDirection;
  const labelW = label
    ? Math.max(label.getBoundingClientRect().width, label.scrollWidth, 0)
    : 0;
  const textW = text ? Math.max(text.getBoundingClientRect().width, text.scrollWidth, 56) : 56;
  const trackMin = 96;
  if (dir === 'column') {
    return Math.ceil(Math.max(labelW, trackMin + textW + 12, 140));
  }
  return Math.ceil(Math.max(labelW + trackMin + textW + 16, 160));
}

function measureLeafNatural(el: HTMLElement): number {
  if (el.classList.contains('w-bar') || el.querySelector?.(':scope > .w-bar-track, :scope > .w-bar-main')) {
    return measureBarNatural(el.classList.contains('w-bar') ? el : ((el.closest('.w-bar') as HTMLElement) || el));
  }
  if (el.classList.contains('is-divider') || el.classList.contains('w-divider')) return 12;

  const touched: { el: HTMLElement; flex: string; width: string; maxWidth: string; minWidth: string }[] = [];
  const visit = (node: HTMLElement) => {
    touched.push({
      el: node,
      flex: node.style.flex,
      width: node.style.width,
      maxWidth: node.style.maxWidth,
      minWidth: node.style.minWidth,
    });
    node.style.flex = '0 0 auto';
    node.style.width = 'max-content';
    node.style.maxWidth = 'none';
    node.style.minWidth = '0';
    for (let i = 0; i < node.children.length; i++) {
      const c = node.children[i];
      if (c instanceof HTMLElement) visit(c);
    }
  };

  const rootBackup = {
    flex: el.style.flex,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    minWidth: el.style.minWidth,
  };
  el.style.flex = '0 0 auto';
  el.style.width = 'max-content';
  el.style.maxWidth = 'none';
  el.style.minWidth = '0';
  visit(el);

  void el.offsetWidth;
  let w = Math.max(el.getBoundingClientRect().width, el.scrollWidth, 0);

  const title = el.querySelector(
    '.w-label-title, .w-kv-key, .w-bar-label, .w-list-title',
  ) as HTMLElement | null;
  const chips = Array.from(el.querySelectorAll('.w-chip, .w-expand-empty, .w-bar-text')) as HTMLElement[];
  let parts = 0;
  if (title) parts += Math.max(title.getBoundingClientRect().width, title.scrollWidth, 0);
  for (const c of chips) {
    parts += Math.max(c.getBoundingClientRect().width, c.scrollWidth, 0) + 6;
  }
  if (parts > 0) {
    w = Math.max(w, parts + (title && chips.length ? 8 : 0));
  }
  if (title) {
    const tw = Math.max(title.getBoundingClientRect().width, title.scrollWidth, 0);
    w = Math.max(w, tw + (chips.length ? 56 : 0));
  }
  if (w < 4) {
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text) w = Math.min(1600, Math.max(40, text.length * 11));
  }

  for (let i = touched.length - 1; i >= 0; i--) {
    const t = touched[i];
    t.el.style.flex = t.flex;
    t.el.style.width = t.width;
    t.el.style.maxWidth = t.maxWidth;
    t.el.style.minWidth = t.minWidth;
  }
  el.style.flex = rootBackup.flex;
  el.style.width = rootBackup.width;
  el.style.maxWidth = rootBackup.maxWidth;
  el.style.minWidth = rootBackup.minWidth;

  return Math.ceil(w);
}

function measureOneNatural(el: HTMLElement, rowHeight = 0): number {
  if (el.classList.contains('is-divider')) return 12;
  if (
    el.querySelector?.('.w-divider') &&
    !el.querySelector?.('.w-label, .w-kv, .w-bar, .w-list, .w-group')
  ) {
    return 12;
  }

  // 与同行等高的图片：按图片固有比例 + 目标高度估算应有宽度，
  // 让「高度撑满时」宽度也按比例跟随，不至于高度1000宽仍10。
  const imgNode = el.classList.contains('w-image')
    ? el
    : (el.querySelector(':scope > .w-image, :scope > .w-renderer > .w-image') as HTMLElement | null);
  if (imgNode && imgNode.classList.contains('is-stretch')) {
    const title = imgNode.querySelector('.w-image-title') as HTMLElement | null;
    const tw = title ? Math.max(title.getBoundingClientRect().width, title.scrollWidth, 0) : 0;
    const ratioW = stretchImageNaturalWidth(imgNode, rowHeight);
    return Math.ceil(Math.max(ratioW, tw + 8, 80));
  }

  if (el.classList.contains('w-bar')) {
    return measureBarNatural(el);
  }
  const directBar = el.querySelector(':scope > .w-bar, :scope > .w-renderer > .w-bar') as HTMLElement | null;
  if (directBar && !el.querySelector('.w-group')) {
    return measureBarNatural(directBar);
  }

  const group = el.classList.contains('w-group')
    ? el
    : (el.querySelector(':scope .w-group') as HTMLElement | null);
  if (group) {
    const leaves = Array.from(
      group.querySelectorAll('.w-bar, .w-label, .w-kv, .w-list, .w-divider, .w-image'),
    ) as HTMLElement[];
    const topLeaves = leaves.filter(leaf => {
      const parentLeaf = leaf.parentElement?.closest('.w-bar, .w-label, .w-kv, .w-list, .w-image');
      return !parentLeaf || parentLeaf === leaf;
    });
    let maxW = 0;
    for (const leaf of topLeaves) {
      if (leaf.classList.contains('w-bar')) maxW = Math.max(maxW, measureBarNatural(leaf));
      else if (leaf.classList.contains('w-image') && leaf.classList.contains('is-stretch')) {
        const title = leaf.querySelector('.w-image-title') as HTMLElement | null;
        const tw = title ? Math.max(title.getBoundingClientRect().width, title.scrollWidth, 0) : 0;
        maxW = Math.max(maxW, Math.ceil(Math.max(stretchImageNaturalWidth(leaf, rowHeight), tw + 8, 80)));
      }
      else maxW = Math.max(maxW, measureLeafNatural(leaf));
    }
    if (maxW >= 4) return Math.ceil(maxW);
  }

  return measureLeafNatural(el);
}

/**
 * @param pack 非 equal 满行：固定内容宽，剩余空白 justify
 * @param floors 每列 CSS min-width
 */
export function applyColWidths(
  cells: HTMLElement[],
  widths: number[],
  pack = false,
  floors: number[] = [],
) {
  void pack;
  cells.forEach((el, i) => {
    const w = widths[i];
    if (w == null || !Number.isFinite(w)) return;
    const pxW = Math.max(0, w);
    const px = `${pxW}px`;
    const floor = Math.max(0, Math.min(pxW, floors[i] ?? Math.min(48, pxW)));
    const floorPx = `${Math.max(0, floor)}px`;
    el.style.flex = `0 0 ${px}`;
    el.style.width = px;
    el.style.maxWidth = px;
    el.style.minWidth = floorPx;
    el.style.overflow = 'hidden';
  });
}

export function clearColWidths(cells: HTMLElement[]) {
  for (const el of cells) {
    el.style.flex = '';
    el.style.width = '';
    el.style.maxWidth = '';
    el.style.minWidth = '';
    el.style.overflow = '';
  }
}
