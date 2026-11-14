import {
  Config,
  Layout,
  LayoutRow,
  RowAlign,
  RowColMode,
  Widget,
  parseBorder,
  buildBorder,
  createDefaultWidgetStyle,
} from '../schema';

export function newRowId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 创建完整 LayoutRow（含 margin / 列模式等默认字段） */
export function createLayoutRow(
  partial?: Partial<LayoutRow> & { widgetIds?: string[]; columns?: number },
): LayoutRow {
  return normalizeLayoutRow({
    id: partial?.id || newRowId(),
    columns: partial?.columns ?? Math.min(6, Math.max(1, partial?.widgetIds?.length || 1)),
    widgetIds: partial?.widgetIds ? [...partial.widgetIds] : [],
    marginTop: partial?.marginTop ?? 0,
    marginBottom: partial?.marginBottom ?? 0,
    collapsed: partial?.collapsed ?? false,
    colMode: partial?.colMode ?? 'equal',
    colWeights: partial?.colWeights ? [...partial.colWeights] : [],
    rowAlign: partial?.rowAlign ?? 'between',
    smartEqual: partial?.smartEqual ?? true,
  });
}

const ROW_ALIGNS: RowAlign[] = ['equal', 'start', 'center', 'end', 'between', 'around'];

/** 规范化单行：补默认 margin / 折叠 / 列模式与权重 / 分布 / 智能平分 */
export function normalizeLayoutRow(row: Partial<LayoutRow> & { widgetIds?: string[] }): LayoutRow {
  const widgetIds = row.widgetIds || [];
  const n = Math.max(1, widgetIds.length || 1);
  let weights = (row.colWeights || []).slice(0, n);
  while (weights.length < n) weights.push(1);
  weights = weights.map(w => Math.min(12, Math.max(0.1, Number(w) || 1)));
  const colMode: RowColMode =
    row.colMode === 'content' || row.colMode === 'custom' ? row.colMode : 'equal';
  const rawAlign = row.rowAlign as RowAlign | string | undefined;
  // 旧配置：rowAlign=equal 表示「智能平分」模式 → 迁为 equal 满行 + smartEqual 开
  let rowAlign: RowAlign = ROW_ALIGNS.includes(rawAlign as RowAlign)
    ? (rawAlign as RowAlign)
    : 'between';
  let smartEqual: boolean;
  if (typeof row.smartEqual === 'boolean') {
    smartEqual = row.smartEqual;
  } else if (rawAlign === 'equal') {
    smartEqual = true;
  } else if (rawAlign && rawAlign !== 'equal') {
    // 旧版非 equal 分布默认不智能侵占
    smartEqual = false;
  } else {
    smartEqual = true;
  }
  return {
    id: row.id || newRowId(),
    columns: Math.min(6, Math.max(1, row.columns || 1)),
    widgetIds,
    marginTop: Math.min(64, Math.max(-32, row.marginTop ?? 0)),
    marginBottom: Math.min(64, Math.max(-32, row.marginBottom ?? 0)),
    collapsed: !!row.collapsed,
    colMode,
    colWeights: weights,
    rowAlign,
    smartEqual,
  };
}

/** 行分布 → flex justify-content（equal=满行拉伸由列宽算法处理） */
export function rowAlignToJustify(align?: RowAlign | string): string {
  switch (align) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'between':
      return 'space-between';
    case 'around':
      return 'space-around';
    case 'equal':
      return 'flex-start';
    case 'start':
      return 'flex-start';
    default:
      return 'space-between';
  }
}

/**
 * 生成 grid-template-columns。
 * equal: 平分（预览用 SmartEqualRow 再智能让位）；custom: 权重；content: 内容优先。
 * extraPlaceholder: 布局模式多一列「+」占位时用。
 */
export function rowGridTemplate(
  row: LayoutRow | null | undefined,
  widgetCount: number,
  opts?: { extraPlaceholder?: boolean; maxCols?: number },
): string {
  const n = Math.max(0, widgetCount);
  const maxCols = opts?.maxCols ?? 6;
  let cols = Math.max(1, n);
  if (opts?.extraPlaceholder && n < maxCols) cols = n + 1;
  cols = Math.min(maxCols, cols);

  const mode: RowColMode = row?.colMode === 'content' || row?.colMode === 'custom' ? row.colMode : 'equal';
  if (mode === 'custom') {
    const weights = (row?.colWeights || []).slice();
    while (weights.length < n) weights.push(1);
    const parts: string[] = [];
    for (let i = 0; i < cols; i++) {
      if (opts?.extraPlaceholder && i >= n) {
        parts.push('minmax(48px, 0.6fr)');
      } else {
        const w = Math.min(12, Math.max(0.1, Number(weights[i]) || 1));
        parts.push(`minmax(0, ${w}fr)`);
      }
    }
    return parts.join(' ');
  }
  if (mode === 'content') {
    const parts: string[] = [];
    for (let i = 0; i < cols; i++) {
      if (opts?.extraPlaceholder && i >= n) parts.push('minmax(48px, 0.6fr)');
      else if (n === 0) parts.push('minmax(0, 1fr)');
      else parts.push('minmax(0, max-content)');
    }
    return parts.join(' ');
  }
  // equal：默认等分
  if (opts?.extraPlaceholder && n < maxCols && n > 0) {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push('minmax(0, 1fr)');
    parts.push('minmax(48px, 0.6fr)');
    return parts.join(' ');
  }
  return `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`;
}

/** 行外边距样式（用于预览与布局） */
export function rowMarginStyle(row: LayoutRow | null | undefined): Record<string, string> {
  const mt = row?.marginTop ?? 0;
  const mb = row?.marginBottom ?? 0;
  return {
    marginTop: mt !== 0 ? `${mt}px` : '0',
    marginBottom: mb !== 0 ? `${mb}px` : '0',
  };
}

/** 收集所有作为 group / stack 子节点的 id */
export function collectChildIds(widgets: Widget[]): Set<string> {
  const set = new Set<string>();
  for (const w of widgets) {
    const isContainer = w.type === 'group' || w.type === 'stack';
    if (isContainer && w.children?.length) {
      for (const id of w.children) set.add(id);
    }
  }
  return set;
}

/** 顶层（应出现在 rows 中）的控件 */
export function topLevelWidgets(widgets: Widget[]): Widget[] {
  const nested = collectChildIds(widgets);
  return widgets.filter(w => !nested.has(w.id));
}

/** 将旧版「全局列数 + span」迁移为按行布局 */
export function migrateRows(config: Config): LayoutRow[] {
  const topIds = new Set(topLevelWidgets(config.widgets).map(w => w.id));
  const existing = config.layout.rows;
  if (existing && existing.length > 0) {
    const placed = new Set(existing.flatMap(r => r.widgetIds));
    const orphanIds = [...topIds].filter(id => !placed.has(id));
    const rows = existing.map(r =>
      normalizeLayoutRow({
        ...r,
        // 只保留顶层控件，去掉 group 子节点
        widgetIds: r.widgetIds.filter(id => topIds.has(id)),
      }),
    );
    if (orphanIds.length) {
      rows.push(
        normalizeLayoutRow({
          id: newRowId(),
          columns: Math.min(6, Math.max(1, config.layout.columns || 1)),
          widgetIds: orphanIds,
          marginTop: 0,
          marginBottom: 0,
          collapsed: false,
          colMode: 'equal',
          colWeights: [],
        }),
      );
    }
    return rows.length ? rows : [normalizeLayoutRow({ id: newRowId(), columns: 1, widgetIds: [], marginTop: 0, marginBottom: 0, collapsed: false, colMode: 'equal', colWeights: [] })];
  }

  const cols = Math.min(6, Math.max(1, config.layout.columns || 2));
  const rows: LayoutRow[] = [];
  let cur: LayoutRow = normalizeLayoutRow({
    id: newRowId(),
    columns: cols,
    widgetIds: [],
    marginTop: 0,
    marginBottom: 0,
    collapsed: false,
    colMode: 'equal',
    colWeights: [],
  });
  let used = 0;

  for (const w of topLevelWidgets(config.widgets)) {
    const span = Math.min(cols, Math.max(1, w.style?.span || 1));
    if (used > 0 && used + span > cols) {
      rows.push(cur);
      cur = normalizeLayoutRow({
        id: newRowId(),
        columns: cols,
        widgetIds: [],
        marginTop: 0,
        marginBottom: 0,
        collapsed: false,
        colMode: 'equal',
        colWeights: [],
      });
      used = 0;
    }
    if (span >= cols && cur.widgetIds.length === 0) {
      cur.columns = 1;
    }
    cur.widgetIds.push(w.id);
    used += span >= cols ? cur.columns : span;
    if (used >= cur.columns) {
      rows.push(normalizeLayoutRow(cur));
      cur = normalizeLayoutRow({
        id: newRowId(),
        columns: cols,
        widgetIds: [],
        marginTop: 0,
        marginBottom: 0,
        collapsed: false,
        colMode: 'equal',
        colWeights: [],
      });
      used = 0;
    }
  }
  if (cur.widgetIds.length) rows.push(normalizeLayoutRow(cur));
  if (rows.length === 0) {
    rows.push(
      normalizeLayoutRow({
        id: newRowId(),
        columns: cols,
        widgetIds: [],
        marginTop: 0,
        marginBottom: 0,
        collapsed: false,
        colMode: 'equal',
        colWeights: [],
      }),
    );
  }
  return rows;
}

/** 规范化 layout：补全 border 结构化字段、widgetDefaults 与 rows */
export function normalizeLayout(config: Config): Layout {
  const layout = { ...config.layout };
  if ((!layout.borderWidth && layout.borderWidth !== 0) || !layout.borderColor) {
    const p = parseBorder(layout.border || 'none');
    layout.borderWidth = layout.borderWidth ?? p.width;
    layout.borderColor = layout.borderColor || p.color;
    layout.borderStyle = layout.borderStyle || p.style;
  }
  layout.border = buildBorder(layout.borderWidth, layout.borderStyle, layout.borderColor);
  layout.bgOpacity = layout.bgOpacity ?? 1;
  layout.textOpacity = layout.textOpacity ?? 1;
  layout.accentColor = layout.accentColor || '#7ec9b8';
  layout.scrollbarColor = layout.scrollbarColor || 'rgba(126, 201, 184, 0.42)';
  layout.scrollbarHoverColor = layout.scrollbarHoverColor || 'rgba(142, 197, 216, 0.72)';
  layout.widgetDefaults = createDefaultWidgetStyle(layout.widgetDefaults || {});
  layout.themeDefaults = createDefaultWidgetStyle(layout.themeDefaults || layout.widgetDefaults);
  layout.rows = migrateRows({ ...config, layout });
  return layout;
}

export function findWidgetRow(rows: LayoutRow[], widgetId: string): { rowIndex: number; cellIndex: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].widgetIds.indexOf(widgetId);
    if (j >= 0) return { rowIndex: i, cellIndex: j };
  }
  return null;
}

const MAX_COLUMNS = 6;

export function moveWidgetInRows(
  rows: LayoutRow[],
  fromRow: number,
  fromCell: number,
  toRow: number,
  toCell: number,
): LayoutRow[] {
  const next = rows.map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
  if (fromRow < 0 || fromRow >= next.length || toRow < 0 || toRow >= next.length) return next;
  if (fromCell < 0 || fromCell >= next[fromRow].widgetIds.length) return next;

  // 跨行且目标已满 6 列：不移动
  if (fromRow !== toRow && next[toRow].widgetIds.length >= MAX_COLUMNS) return next;

  const [item] = next[fromRow].widgetIds.splice(fromCell, 1);
  if (!item) return next;
  // 先按「移除前」落点校正：同行且 from 在 to 左侧时，移除后下标左移 1
  let insertAt = toCell;
  if (fromRow === toRow && fromCell < toCell) insertAt -= 1;
  insertAt = Math.max(0, Math.min(insertAt, next[toRow].widgetIds.length));
  next[toRow].widgetIds.splice(insertAt, 0, item);
  return next;
}

export function moveRow(rows: LayoutRow[], from: number, to: number): LayoutRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function setRowColumns(rows: LayoutRow[], rowIndex: number, columns: number): LayoutRow[] {
  return rows.map((r, i) => (i === rowIndex ? { ...r, columns: Math.min(MAX_COLUMNS, Math.max(1, columns)) } : r));
}
/**
 * 拖拽落点处理完后调用：
 * - 每行 columns 自动跟随 widgetIds.length（新增 +1，移走 -1），上限 6；
 * - 行 widgetIds 为空时删除该行；
 * - rows 全空时（顶层）保留一行空行作为落点兜底；group 内部允许返回空数组。
 * 返回规范化后的新 rows（不改入参）。
 */
export function autoFitColumns(rows: LayoutRow[], opts?: { keepEmpty?: boolean }): LayoutRow[] {
  const next = rows
    .map(r =>
      normalizeLayoutRow({
        ...r,
        // 列数 = 实际占用格数，至少 1（避免 grid-template-columns: repeat(0) 退化）
        columns: Math.min(MAX_COLUMNS, Math.max(1, r.widgetIds.length || 1)),
      }),
    )
    .filter(r => r.widgetIds.length > 0);
  if (next.length > 0) return next;
  if (opts?.keepEmpty === false) return [];
  return [
    normalizeLayoutRow({
      id: newRowId(),
      columns: 1,
      widgetIds: [],
      marginTop: 0,
      marginBottom: 0,
      collapsed: false,
      colMode: 'equal',
      colWeights: [],
    }),
  ];
}

/** 显式添加的空行不会被 autoFit 立刻删掉；仅在有内容的拖拽后清理 */
export function addEmptyRow(rows: LayoutRow[], columns = 1): LayoutRow[] {
  return [
    ...rows,
    normalizeLayoutRow({
      id: newRowId(),
      columns: Math.min(MAX_COLUMNS, Math.max(1, columns)),
      widgetIds: [],
      marginTop: 0,
      marginBottom: 0,
      collapsed: false,
      colMode: 'equal',
      colWeights: [],
    }),
  ];
}

export function removeRowIfEmpty(rows: LayoutRow[]): LayoutRow[] {
  // 布局模式下允许保留空行，这里仅在显式清理时用
  const filtered = rows.filter(r => r.widgetIds.length > 0);
  return filtered.length
    ? filtered.map(normalizeLayoutRow)
    : [
        normalizeLayoutRow({
          id: newRowId(),
          columns: 1,
          widgetIds: [],
          marginTop: 0,
          marginBottom: 0,
          collapsed: false,
          colMode: 'equal',
          colWeights: [],
        }),
      ];
}

export function appendWidgetToRows(rows: LayoutRow[], widgetId: string, preferColumns?: number): LayoutRow[] {
  const next = rows.map(r => normalizeLayoutRow({ ...r, widgetIds: [...r.widgetIds], columns: r.columns }));
  if (next.length === 0) {
    return [
      normalizeLayoutRow({
        id: newRowId(),
        columns: 1,
        widgetIds: [widgetId],
        marginTop: 0,
        marginBottom: 0,
        collapsed: false,
        colMode: 'equal',
        colWeights: [],
      }),
    ];
  }
  const last = next[next.length - 1];
  // 列数随控件数自动涨；未满 6 列时优先塞进最后一行
  if (last.widgetIds.length < MAX_COLUMNS) {
    last.widgetIds.push(widgetId);
    last.columns = Math.min(MAX_COLUMNS, last.widgetIds.length);
    return next.map(normalizeLayoutRow);
  }
  return [
    ...next,
    normalizeLayoutRow({
      id: newRowId(),
      columns: preferColumns || 1,
      widgetIds: [widgetId],
      marginTop: 0,
      marginBottom: 0,
      collapsed: false,
      colMode: 'equal',
      colWeights: [],
    }),
  ];
}

export function removeWidgetFromRows(rows: LayoutRow[], widgetId: string): LayoutRow[] {
  return rows.map(r => ({ ...r, widgetIds: r.widgetIds.filter(id => id !== widgetId) }));
}

export function widgetsByRow(rows: LayoutRow[], widgets: Widget[]): { row: LayoutRow; widgets: Widget[] }[] {
  return rows.map(row => ({
    row,
    widgets: row.widgetIds.map(id => widgets.find(w => w.id === id)).filter((w): w is Widget => !!w),
  }));
}

/**
 * 对 group 控件内部的 rows 做规范化：
 * - children 里有 rows 未涵盖的 id，补成末尾新行；
 * - rows 里有 children 已不存在/已移走的 id，删掉；
 * - rows 完全覆盖 children 但顺序/列数保留。
 * rows 为空时，按 children 顺序自动每行一个单列布局（1 子 → 1 行 1 列；多子 → 多行 1 列）。
 */
export function normalizeGroupRows(group: Widget): LayoutRow[] {
  const childIds = (group.children ?? []).slice();
  let rows = (group.rows ?? []).map(r => {
    const widgetIds = r.widgetIds.filter(id => childIds.includes(id));
    return normalizeLayoutRow({
      ...r,
      // 列数始终跟随实际控件数（上限 6）
      columns: Math.min(6, Math.max(1, widgetIds.length || 1)),
      widgetIds,
    });
  });
  const placed = new Set(rows.flatMap(r => r.widgetIds));
  const orphans = childIds.filter(id => !placed.has(id));
  if (orphans.length) {
    for (const id of orphans) {
      rows.push(
        normalizeLayoutRow({
          id: newRowId(),
          columns: 1,
          widgetIds: [id],
          marginTop: 0,
          marginBottom: 0,
          collapsed: false,
          colMode: 'equal',
          colWeights: [],
        }),
      );
    }
  }
  if (rows.length === 0) {
    // 旧 group 没有 rows：按 children 顺序每 child 一行 1 列（保持竖向堆叠的旧行为）
    rows = childIds.length
      ? childIds.map(id =>
          normalizeLayoutRow({
            id: newRowId(),
            columns: 1,
            widgetIds: [id],
            marginTop: 0,
            marginBottom: 0,
            collapsed: false,
            colMode: 'equal',
            colWeights: [],
          }),
        )
      : [];
  }
  return rows;
}
