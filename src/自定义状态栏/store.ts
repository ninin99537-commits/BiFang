import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { klona } from 'klona';
import {
  ConfigSchema,
  Config,
  Widget,
  LayoutRow,
  WidgetStyle,
  buildBorder,
  createDefaultWidgetStyle,
} from './schema';
import { defaultConfig, baseStyle } from './lib/preset';
import { resolveValue, resolveEntries, onDbUpdate, onDataSourceReady } from './lib/datasource';
import { applyFontsEverywhere } from './lib/fonts';
import {
  normalizeLayout,
  normalizeGroupRows,
  appendWidgetToRows,
  removeWidgetFromRows,
  moveWidgetInRows,
  setRowColumns,
  addEmptyRow,
  createLayoutRow,
  moveRow,
  autoFitColumns,
} from './lib/layout';

/** 切换主题时会尝试同步的「主题色」字段（仅当仍等于旧默认才改） */
const THEME_STYLE_KEYS: (keyof WidgetStyle)[] = [
  'color',
  'colorOpacity',
  'bg',
  'bgOpacity',
  'labelColor',
  'barColor',
  'barColorEnd',
  'barTrack',
  'barTrackOpacity',
  'barValueColor',
  'chipBorder',
  'chipBg',
  'stackAccent',
];

/** 结构/布局字段：主题切换永不覆盖 */
function mergeThemeIntoWidgetStyle(
  current: WidgetStyle,
  oldDefaults: WidgetStyle,
  newDefaults: WidgetStyle,
): WidgetStyle {
  const next = { ...current };
  for (const key of THEME_STYLE_KEYS) {
    const cur = current[key];
    const oldD = oldDefaults[key];
    // 仍跟旧主题默认一致，或空字符串表示「跟随」的 chip 色，才切到新默认
    if (cur === oldD || cur === undefined) {
      (next as any)[key] = newDefaults[key];
    }
  }
  return next;
}

// 配置（样式/布局/字段选择）按「角色卡」持久化：同一张角色卡下所有聊天共享，
// 不同角色卡各自独立。数据本身（MVU stat 等）仍跟聊天走，与本配置无关。
const VAR_OPTION = { type: 'character' } as const;
/** 旧版配置曾按 chat 存储；用于一次性迁移到 character 变量。 */
const LEGACY_VAR_OPTION = { type: 'chat' } as const;
const CONFIG_KEY = 'custom_status_bar';
/** 是否已执行过一次 chat→character 迁移（同一会话内不重复尝试） */
let migrationAttempted = false;

/**
 * 宽松兜底：schema 严格校验失败时，仍尽量保留 widgets/layout，
 * 绝不用 defaultConfig 覆盖用户已有配置。
 */
function salvageConfig(data: unknown): Config | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as any;
  if (!Array.isArray(d.widgets) && !(d.layout && typeof d.layout === 'object')) return null;
  try {
    const base = defaultConfig();
    const merged: Config = {
      layout: {
        ...base.layout,
        ...(d.layout && typeof d.layout === 'object' ? d.layout : {}),
        rows: Array.isArray(d.layout?.rows) ? d.layout.rows : base.layout.rows,
        widgetDefaults: createDefaultWidgetStyle(
          d.layout?.widgetDefaults && typeof d.layout.widgetDefaults === 'object'
            ? d.layout.widgetDefaults
            : base.layout.widgetDefaults,
        ),
      },
      widgets: Array.isArray(d.widgets)
        ? d.widgets.map((w: any) => ({
            ...w,
            children: Array.isArray(w?.children) ? w.children : [],
            rows: Array.isArray(w?.rows) ? w.rows : [],
            collapsed: !!w?.collapsed,
            style: createDefaultWidgetStyle(w?.style && typeof w.style === 'object' ? w.style : {}),
            activePageIndex: Number(w?.activePageIndex) || 0,
            autoRotateMs: Number(w?.autoRotateMs) || 0,
            dbAutoRows: !!w?.dbAutoRows,
            dbTabColumn: typeof w?.dbTabColumn === 'string' ? w.dbTabColumn : '',
            dbRowFilter: typeof w?.dbRowFilter === 'string' ? w.dbRowFilter : '',
          }))
        : [],
    };
    return ensureNormalized(merged);
  } catch (e) {
    console.warn('[自定义状态栏] 宽松恢复配置失败', e);
    return null;
  }
}

function parseConfigData(data: unknown): Config | null {
  if (!data || typeof data !== 'object') return null;
  const parsed = ConfigSchema.safeParse(data);
  if (parsed.success && parsed.data) return ensureNormalized(parsed.data);
  console.warn('[自定义状态栏] 配置严格解析失败，尝试保留原数据', (parsed as any).error);
  return salvageConfig(data);
}

function loadConfig(): Config {
  try {
    const raw = getVariables(VAR_OPTION);
    const data = raw?.[CONFIG_KEY];
    if (data && typeof data === 'object') {      const cfg = parseConfigData(data);
      if (cfg) return cfg;
      // 有数据但救不回来：不要写回默认，避免冲掉用户配置
      console.error('[自定义状态栏] 角色卡配置无法解析且无法恢复，暂用默认（不会写回覆盖）');
      return defaultConfig();
    }
    // 兼容旧版：曾把整个 config 顶层写入 chat 变量
    if (raw && typeof raw === 'object' && Array.isArray((raw as any).widgets) && (raw as any).layout) {
      const cfg = parseConfigData(raw);
      if (cfg) return cfg;
    }

    // 一次性迁移：旧版按 chat 存配置，新版改为 character。
    // 取「当前聊天」里的旧 chat 配置作为本角色卡配置的来源，写回 character。
    // 新聊天没有 chat 配置则保持默认，符合用户预期：新聊天一开始无数据，AI 更新后自动渲染。
    if (!migrationAttempted) {
      migrationAttempted = true;
      try {
        const chatRaw = getVariables(LEGACY_VAR_OPTION);
        const chatData = chatRaw?.[CONFIG_KEY];
        if (chatData && typeof chatData === 'object') {
          const cfg = parseConfigData(chatData);
          if (cfg) {
            // 写入 character 变量，下次以及同角色卡其它聊天都能读到
            insertOrAssignVariables({ [CONFIG_KEY]: klona(cfg) } as any, VAR_OPTION);
            return cfg;
          }
        }
        // 再兼容：旧版把整个 config 顶层写入 chat 变量
        if (chatRaw && typeof chatRaw === 'object' && Array.isArray((chatRaw as any).widgets) && (chatRaw as any).layout) {
          const cfg = parseConfigData(chatRaw);
          if (cfg) {
            insertOrAssignVariables({ [CONFIG_KEY]: klona(cfg) } as any, VAR_OPTION);
            return cfg;
          }
        }
      } catch (e) {
        console.warn('[自定义状态栏] 迁移 chat→character 配置失败', e);
      }
    }

    return defaultConfig();
  } catch (e) {
    console.warn('[自定义状态栏] 读取配置失败，使用默认配置', e);
    return defaultConfig();
  }
}

function ensureNormalized(cfg: Config): Config {
  const layout = normalizeLayout(cfg);
  // 补全旧控件缺失的新字段；group 的内部 rows 按 children 规范化
  const widgets = cfg.widgets
    .map(w => ({
      ...w,
      children: w.children || [],
      // 编辑器列表折叠状态（仅 group 有意义；预览渲染不读此字段）
      collapsed: !!(w as Widget).collapsed,
      style: createDefaultWidgetStyle(w.style || {}),
    }))
    .map(w => {
      if (w.type === 'group') {
        // 把 orphans 固化进 rows，避免 UI 行数与 group.rows 不一致
        const rows = normalizeGroupRows(w);
        const ordered = rows.flatMap(r => r.widgetIds);
        const rest = (w.children || []).filter(id => !ordered.includes(id));
        return { ...w, rows, children: [...ordered, ...rest] };
      }
      return { ...w, rows: w.rows || [] };
    });
  return { ...cfg, layout, widgets };
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<Config>(loadConfig());

  // 配置加载后一次性迁移：把遗留的 base64 图片收进图库，控件改为引用。
  // 仅迁移 base64（外链 URL 不动）。幂等：重复调用 0 改动。
  // 注意 scheduleSave 在下方声明，function 提升，可在此调用。
  try {
    const migrated = migrateBase64Images();
    if (migrated > 0) {
      console.info(`[自定义状态栏] 已将 ${migrated} 张 base64 图片迁入图库（存为角色卡内复用资产）`);
    }
  } catch (e) {
    console.warn('[自定义状态栏] 图库迁移失败', e);
  }

  /**
   * 渲染期临时控件（仅活在内存，不写入 config / 不持久化）：
   * 用于 stack「同表多行自动翻页」模式克隆出来的虚拟页及其 group 子树。
   * findWidget 会先查这里再查 config.widgets。
   */
  const renderWidgets = ref<Widget[]>([]);

  // 自定义字体：启动 + 配置变化时注入 @font-face（防抖避免上传大文件时反复注）
  let fontsTimer: number | null = null;
  function scheduleApplyFonts() {
    if (fontsTimer != null) window.clearTimeout(fontsTimer);
    fontsTimer = window.setTimeout(() => {
      fontsTimer = null;
      applyFontsEverywhere(config.value.layout.fonts || []);
    }, 120);
  }
  scheduleApplyFonts();
  watch(() => (config.value.layout.fonts || []).map(f => f.id + '|' + f.src).join('\n'), scheduleApplyFonts);

  let saveTimer: number | null = null;
  let lastSavedJson = '';
  // 初始化后先记一份，避免 load→watch 立刻用默认/残缺配置冲掉变量里的原数据
  try {
    lastSavedJson = JSON.stringify(config.value);
  } catch {
    lastSavedJson = '';
  }
  function scheduleSave() {
    if (saveTimer != null) window.clearTimeout(saveTimer);
    // 防抖拉长，拖动滑块/调色时减少聊天变量写入
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      try {
        // 空配置（无控件且无自定义行）不覆盖已有角色卡配置，防止解析失败后冲掉用户数据
        const cfg = config.value;
        const hasContent =
          (cfg.widgets && cfg.widgets.length > 0) ||
          (cfg.layout?.rows && cfg.layout.rows.some(r => (r.widgetIds || []).length > 0));
        if (!hasContent) {
          try {
            const existing = getVariables(VAR_OPTION)?.[CONFIG_KEY];
            if (
              existing &&
              typeof existing === 'object' &&
              (Array.isArray((existing as any).widgets) && (existing as any).widgets.length > 0)
            ) {
              console.warn('[自定义状态栏] 跳过保存空配置，避免覆盖已有数据');
              return;
            }
          } catch {
            /* ignore */
          }
        }
        const l = config.value.layout;
        l.border = buildBorder(l.borderWidth, l.borderStyle, l.borderColor);
        const json = JSON.stringify(config.value);
        if (json === lastSavedJson) return;
        lastSavedJson = json;
        insertOrAssignVariables({ [CONFIG_KEY]: klona(config.value) } as any, VAR_OPTION);
      } catch (e) {
        console.error('[自定义状态栏] 保存配置失败', e);
      }
    }, 600);
  }
  watch(() => config.value, scheduleSave, { deep: true });

  const dataTick = ref(0);
  let bumpRaf: number | null = null;
  function bumpData() {
    // 合并同帧多次 bump，避免一次改配置触发 N 次全量重绘
    if (bumpRaf != null) return;
    bumpRaf = requestAnimationFrame(() => {
      bumpRaf = null;
      dataTick.value++;
    });
  }

  // widgets 结构变更由 add/remove/update 显式 bump；此处只兜底 binding 类改动
  watch(
    () => config.value.widgets.map(w => `${w.id}|${w.source}|${w.type}`).join(','),
    () => bumpData(),
  );

  // 监听 MVU 变量更新结束事件：AI 回复更新变量后立即刷新显示
  let offMvuEvent: (() => void) | null = null;
  try {
    if (typeof Mvu !== 'undefined' && Mvu.events?.VARIABLE_UPDATE_ENDED) {
      const handler = () => bumpData();
      const res = eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, handler);
      offMvuEvent = () => res.stop();
    }
  } catch {
    /* Mvu 未就绪或事件不可用 */
  }

  // 换楼层 / 换卡 / 切 swipe 等都会改动当前 message_id 对应的 stat_data，
  // VARIABLE_UPDATE_ENDED 不一定覆盖这些路径，用 CHAT_CHANGED 与消息渲染事件兜底刷新。
  // （store.ts 运行于全局 iframe，eventOn / tavern_events 可直接使用。）
  let offChatChanged: (() => void) | null = null;
  let offMsgRendered: (() => void) | null = null;
  try {
    // 进入新聊天 / 切换聊天：MVU 数据源固定读 latest 楼层，切换后需重算
    const cc = (eventOn as any)?.(tavern_events.CHAT_CHANGED, () => bumpData());
    if (cc?.stop) offChatChanged = () => cc.stop();
  } catch {
    /* tavern_events / eventOn 不可用 */
  }
  try {
    // 渲染完成即代表楼层稳定，覆盖 swipe、追加回复等不触发 CHAT_CHANGED 的场景
    const mr = (eventOn as any)?.(tavern_events.CHARACTER_MESSAGE_RENDERED, () => bumpData());
    if (mr?.stop) offMsgRendered = () => mr.stop();
  } catch {
    /* 同上 */
  }

  const offDb = onDbUpdate(() => bumpData());

  // 数据源就绪（尤其 MVU 异步 waitGlobalInitialized 完成时）：之前 mvuReady=false 时取值全是空，
  // 渲染先用了空数据；就绪后必须主动 bump 一次让 mvu 字段重算，否则要等下一次 AI 回复才显示。
  // 这替代了原来轮询「就绪后 hash 变化触发刷新」的职责。
  const offReady = onDataSourceReady(() => bumpData());

  $(window).on('pagehide', () => {
    offMvuEvent?.();
    offChatChanged?.();
    offMsgRendered?.();
    offDb();
    offReady();
    if (saveTimer != null) window.clearTimeout(saveTimer);
    if (bumpRaf != null) cancelAnimationFrame(bumpRaf);
  });

  let lastTick = -1;
  const cache = new Map<string, any>();
  function bindingKey(b: Widget['binding']): string {
    // 避免每次 JSON.stringify 整个 binding
    return [
      b.mvu_parent || '',
      b.mvu_field || '',
      (b.mvu_fields || []).join(','),
      b.db_table || '',
      typeof b.db_row === 'object' && b.db_row ? `${b.db_row.col}=${b.db_row.value}` : String(b.db_row ?? ''),
      b.db_column || '',
      (b.db_columns || []).join(','),
      b.static_value || '',
    ].join('|');
  }
  function widgetValue(w: Widget): any {
    if (lastTick !== dataTick.value) {
      lastTick = dataTick.value;
      cache.clear();
    }
    const cacheKey = `${w.id}|${w.source}|${bindingKey(w.binding)}|v`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const v = resolveValue(w.source, w.binding);
    cache.set(cacheKey, v);
    return v;
  }

  function widgetEntries(w: Widget): { name: string; value: any }[] {
    if (lastTick !== dataTick.value) {
      lastTick = dataTick.value;
      cache.clear();
    }
    const cacheKey = `${w.id}|${w.source}|${bindingKey(w.binding)}|e`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const v = resolveEntries(w.source, w.binding);
    cache.set(cacheKey, v);
    return v;
  }

  function setRows(rows: LayoutRow[]) {
    config.value.layout.rows = rows;
  }

  function addWidget(w: Widget, opts?: { parentId?: string }) {
    // 从全局默认复制样式（若未指定）
    if (!w.style || Object.keys(w.style).length === 0) {
      w.style = { ...(config.value.layout.widgetDefaults || baseStyle) };
    }
    config.value.widgets.push(w);
    if (opts?.parentId) {
      const parent = config.value.widgets.find(x => x.id === opts.parentId);
      if (parent && (parent.type === 'group' || parent.type === 'stack')) {
        parent.children = [...(parent.children || []), w.id];
        bumpData();
        return;
      }
    }
    config.value.layout.rows = appendWidgetToRows(config.value.layout.rows, w.id);
    bumpData();
  }

  function removeWidget(id: string) {
    // 级联删除 group / stack 子控件
    const toRemove = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.pop()!;
      const w = config.value.widgets.find(x => x.id === cur);
      const isContainer = w?.type === 'group' || w?.type === 'stack';
      if (isContainer && w.children?.length) {
        for (const cid of w.children) {
          if (!toRemove.has(cid)) {
            toRemove.add(cid);
            queue.push(cid);
          }
        }
      }
    }
    // 从其它 group 的 children 中移除
    for (const w of config.value.widgets) {
      if (w.children?.length) {
        w.children = w.children.filter(cid => !toRemove.has(cid));
      }
    }
    config.value.widgets = config.value.widgets.filter(w => !toRemove.has(w.id));
    for (const rid of toRemove) {
      config.value.layout.rows = removeWidgetFromRows(config.value.layout.rows, rid);
    }
    bumpData();
  }

  function updateWidget(id: string, patch: Partial<Widget>) {
    const idx = config.value.widgets.findIndex(w => w.id === id);
    if (idx >= 0) {
      config.value.widgets[idx] = { ...config.value.widgets[idx], ...patch };
      // 数据绑定/类型变更需要刷新取值缓存
      if (patch.source != null || patch.binding != null || patch.type != null) {
        bumpData();
      }
    }
  }

  function updateWidgetStyle(id: string, stylePatch: Partial<Widget['style']>) {
    const idx = config.value.widgets.findIndex(w => w.id === id);
    if (idx >= 0) {
      config.value.widgets[idx] = {
        ...config.value.widgets[idx],
        style: { ...config.value.widgets[idx].style, ...stylePatch },
      };
    }
  }

  function moveWidget(from: number, to: number) {
    const arr = [...config.value.widgets];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    config.value.widgets = arr;
  }

  function moveWidgetCell(fromRow: number, fromCell: number, toRow: number, toCell: number) {
    const moved = moveWidgetInRows(config.value.layout.rows, fromRow, fromCell, toRow, toCell);
    // 列数 = 控件数（拖入 +1 / 移出 -1，上限 6）；空行删除
    config.value.layout.rows = autoFitColumns(moved);
  }

  function updateRowColumns(rowIndex: number, columns: number) {
    config.value.layout.rows = setRowColumns(config.value.layout.rows, rowIndex, columns);
  }

  function addRow(columns = 1) {
    config.value.layout.rows = addEmptyRow(config.value.layout.rows, columns);
  }

  function removeRow(rowIndex: number) {
    const rows = [...config.value.layout.rows];
    const row = rows[rowIndex];
    if (!row) return;
    const target = rows[rowIndex - 1] || rows[rowIndex + 1];
    if (target) {
      target.widgetIds = [...target.widgetIds, ...row.widgetIds];
    }
    rows.splice(rowIndex, 1);
    config.value.layout.rows = autoFitColumns(rows.length ? rows : [createLayoutRow({ columns: 1, widgetIds: [] })]);
  }

  function reorderRow(from: number, to: number) {
    config.value.layout.rows = moveRow(config.value.layout.rows, from, to);
  }

  function updateRowMeta(
    rowIndex: number,
    patch: Partial<
      Pick<LayoutRow, 'marginTop' | 'marginBottom' | 'collapsed' | 'colMode' | 'colWeights' | 'rowAlign' | 'smartEqual'>
    >,
  ) {
    const rows = config.value.layout.rows.map((r, i) => {
      if (i !== rowIndex) return r;
      const next = { ...r, ...patch };
      const n = Math.max(1, next.widgetIds.length || 1);
      if (patch.colWeights || next.colMode === 'custom') {
        let weights = (next.colWeights || []).slice(0, n);
        while (weights.length < n) weights.push(1);
        next.colWeights = weights.map(w => Math.min(12, Math.max(0.1, Number(w) || 1)));
      }
      return next;
    });
    config.value.layout.rows = rows;
  }

  function toggleRowCollapsed(rowIndex: number) {
    const r = config.value.layout.rows[rowIndex];
    if (!r) return;
    updateRowMeta(rowIndex, { collapsed: !r.collapsed });
  }

  function updateChildRowMeta(
    groupId: string,
    rowIndex: number,
    patch: Partial<
      Pick<LayoutRow, 'marginTop' | 'marginBottom' | 'collapsed' | 'colMode' | 'colWeights' | 'rowAlign' | 'smartEqual'>
    >,
  ) {
    mutateGroupRows(groupId, rows =>
      rows.map((r, i) => {
        if (i !== rowIndex) return r;
        const next = { ...r, ...patch };
        const n = Math.max(1, next.widgetIds.length || 1);
        if (patch.colWeights || next.colMode === 'custom') {
          let weights = (next.colWeights || []).slice(0, n);
          while (weights.length < n) weights.push(1);
          next.colWeights = weights.map(w => Math.min(12, Math.max(0.1, Number(w) || 1)));
        }
        return next;
      }),
    );
  }

  function toggleChildRowCollapsed(groupId: string, rowIndex: number) {
    mutateGroupRows(groupId, rows =>
      rows.map((r, i) => (i === rowIndex ? { ...r, collapsed: !r.collapsed } : r)),
    );
    bumpData();
  }


  /* ---------- 分组布局复制粘贴（会话内：行结构 / 分布 / 折叠） ---------- */
  type GroupLayoutClip = {
    counts: number[];
    rowAligns: string[];
    smartEquals: boolean[];
    collapseds: boolean[];
  };
  const groupLayoutClipboard = ref<GroupLayoutClip | null>(null);

  function copyGroupLayout(groupId: string) {
    const group = config.value.widgets.find(w => w.id === groupId);
    if (!group || group.type !== 'group') return;
    const rows = normalizeGroupRows(group);
    groupLayoutClipboard.value = {
      counts: rows.map(r => r.widgetIds.length),
      rowAligns: rows.map(r => r.rowAlign || 'between'),
      smartEquals: rows.map(r => r.smartEqual !== false),
      collapseds: rows.map(r => !!r.collapsed),
    };
  }

  function pasteGroupLayout(groupId: string) {
    const clip = groupLayoutClipboard.value;
    if (!clip?.counts?.length) return;
    const group = config.value.widgets.find(w => w.id === groupId);
    if (!group || group.type !== 'group') return;
    const ids = [...(group.children || [])];
    let offset = 0;
    const nextRows: LayoutRow[] = [];
    for (let i = 0; i < clip.counts.length; i++) {
      const n = Math.max(0, Math.min(6, Number(clip.counts[i]) || 0));
      const slice = ids.slice(offset, offset + n);
      offset += n;
      nextRows.push(
        createLayoutRow({
          columns: Math.max(1, slice.length || 1),
          widgetIds: slice,
          rowAlign: (clip.rowAligns[i] as any) || 'between',
          smartEqual: clip.smartEquals?.[i] !== false,
          collapsed: !!clip.collapseds[i],
        }),
      );
    }
    while (offset < ids.length) {
      const last = nextRows[nextRows.length - 1];
      if (last && last.widgetIds.length < 6) {
        last.widgetIds.push(ids[offset++]);
        last.columns = Math.min(6, last.widgetIds.length);
      } else {
        nextRows.push(
          createLayoutRow({
            columns: 1,
            widgetIds: [ids[offset++]],
            rowAlign: 'between',
            smartEqual: true,
            collapsed: false,
          }),
        );
      }
    }
    (group as Widget).rows = nextRows;
    group.children = nextRows.flatMap(r => r.widgetIds);
    bumpData();
  }


  /* ----------------------- group 内部布局操作 ----------------------- */
  /**
   * 始终基于 normalizeGroupRows 的结果再改写：
   * children 里有、rows 未收录的「孤儿」控件会在 UI 里显示成额外行，
   * 若直接改 raw group.rows，索引会对不上（例如第 4 行无法上移）。
   */
  function mutateGroupRows(groupId: string, fn: (rows: LayoutRow[]) => LayoutRow[]) {
    const idx = config.value.widgets.findIndex(w => w.id === groupId);
    if (idx < 0) return;
    const group = config.value.widgets[idx];
    if (!group || group.type !== 'group') return;
    const base = normalizeGroupRows(group);
    const next = fn(base.map(r => ({ ...r, widgetIds: [...r.widgetIds] })));
    // 与 rows 同步 children 顺序（按行展开），避免孤儿再次出现
    const ordered = next.flatMap(r => r.widgetIds);
    const rest = (group.children || []).filter(id => !ordered.includes(id));
    // 整项替换，确保布局模式折叠 / 分布等嵌套变更能触发视图更新
    config.value.widgets[idx] = {
      ...group,
      rows: next,
      children: [...ordered, ...rest],
    };
  }

  function moveChildWidgetCell(
    groupId: string,
    fromRow: number,
    fromCell: number,
    toRow: number,
    toCell: number,
  ) {
    mutateGroupRows(groupId, rows => {
      const moved = moveWidgetInRows(rows, fromRow, fromCell, toRow, toCell);
      // group 内部允许 rows 被清空（视为暂无任何子控件入行）
      return autoFitColumns(moved, { keepEmpty: false });
    });
  }

  function updateChildRowColumns(groupId: string, rowIndex: number, columns: number) {
    mutateGroupRows(groupId, rows => setRowColumns(rows, rowIndex, columns));
  }

  function addChildRow(groupId: string, columns = 1) {
    mutateGroupRows(groupId, rows => addEmptyRow(rows, columns));
  }

  function removeChildRow(groupId: string, rowIndex: number) {
    mutateGroupRows(groupId, rows => {
      const next = rows.map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
      const row = next[rowIndex];
      if (!row) return next;
      const target = next[rowIndex - 1] || next[rowIndex + 1];
      if (target) {
        target.widgetIds = [...target.widgetIds, ...row.widgetIds];
      }
      next.splice(rowIndex, 1);
      if (next.length === 0) return [createLayoutRow({ columns: 1, widgetIds: [] })];
      return next;
    });
  }

  function reorderChildRow(groupId: string, from: number, to: number) {
    mutateGroupRows(groupId, rows => moveRow(rows, from, to));
  }

  /** 把已有控件加入某个 group / stack；并从 rows 中移除 */
  function addChildToGroup(groupId: string, childId: string) {
    if (groupId === childId) return;
    const group = config.value.widgets.find(w => w.id === groupId);
    const child = config.value.widgets.find(w => w.id === childId);
    if (!group || !child) return;
    if (group.type !== 'group' && group.type !== 'stack') return;
    // 禁止把 group 的祖先加为自己的子
    if (isDescendant(childId, groupId)) return;
    // 从其它容器（group / stack）移除（包括其 rows）
    for (const w of config.value.widgets) {
      if (w.children?.includes(childId)) {
        w.children = w.children.filter(id => id !== childId);
        if (w.type === 'group' && w.rows?.length) {
          (w as Widget).rows = w.rows.map(r => ({ ...r, widgetIds: r.widgetIds.filter(id => id !== childId) }));
        }
      }
    }
    if (!group.children.includes(childId)) {
      group.children = [...group.children, childId];
    }
    if (group.type === 'group') {
      // 同步进 group.rows：追加一行单列
      const nextRows = [...(group.rows || []), createLayoutRow({ columns: 1, widgetIds: [childId] })];
      (group as Widget).rows = normalizeGroupRows({ ...group, rows: nextRows });
    }
    config.value.layout.rows = removeWidgetFromRows(config.value.layout.rows, childId);
    bumpData();
  }

  function removeChildFromGroup(groupId: string, childId: string) {
    const group = config.value.widgets.find(w => w.id === groupId);
    if (!group) return;
    group.children = (group.children || []).filter(id => id !== childId);
    if (group.type === 'group' && group.rows?.length) {
      (group as Widget).rows = autoFitColumns(
        group.rows.map(r => ({ ...r, widgetIds: r.widgetIds.filter(id => id !== childId) })),
        { keepEmpty: false },
      );
    }
    // activePageIndex 越界校正
    if (group.type === 'stack') {
      const n = group.children.length;
      if ((group.activePageIndex || 0) >= n) {
        group.activePageIndex = Math.max(0, n - 1);
      }
    }
    // 回到布局顶层
    config.value.layout.rows = autoFitColumns(appendWidgetToRows(config.value.layout.rows, childId));
    bumpData();
  }

  /** 布局拖拽用：把顶层控件丢进某个 group / stack */
  function dropTopWidgetIntoGroup(groupId: string, fromRow: number, fromCell: number) {
    const rows = config.value.layout.rows;
    const id = rows[fromRow]?.widgetIds[fromCell];
    if (!id || id === groupId) return;
    const w = config.value.widgets.find(x => x.id === id);
    if (!w) return;
    // 容器类型：禁止嵌套（避免结构过深）
    if (w.type === 'group' || w.type === 'stack') return;
    addChildToGroup(groupId, id);
  }

  /** 布局拖拽用：把 group 内子控件拖到顶层某行某格 */
  function dropChildToTop(groupId: string, childRow: number, childCell: number, toRow: number, toCell: number) {
    const group = config.value.widgets.find(w => w.id === groupId);
    if (!group || group.type !== 'group') return;
    // 与 UI 一致：先规范化（含孤儿行），再按索引取控件
    const gRows = normalizeGroupRows(group).map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
    const childId = gRows[childRow]?.widgetIds[childCell];
    if (!childId) return;
    // 先从 group 摘出（不立刻 append 顶层，由下面 insert 控制位置）
    group.children = (group.children || []).filter(id => id !== childId);
    if (gRows[childRow]) {
      gRows[childRow].widgetIds = gRows[childRow].widgetIds.filter(id => id !== childId);
    }
    (group as Widget).rows = autoFitColumns(gRows, { keepEmpty: false });
    // 插入顶层指定位置
    const top = config.value.layout.rows.map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
    if (toRow < 0 || toRow >= top.length) {
      config.value.layout.rows = autoFitColumns(appendWidgetToRows(top, childId));
    } else {
      if (top[toRow].widgetIds.length >= 6) {
        // 目标满了：新开一行
        top.splice(toRow + 1, 0, createLayoutRow({ columns: 1, widgetIds: [childId] }));
      } else {
        const at = Math.max(0, Math.min(toCell, top[toRow].widgetIds.length));
        top[toRow].widgetIds.splice(at, 0, childId);
      }
      config.value.layout.rows = autoFitColumns(top);
    }
    bumpData();
  }

  /**
   * 布局拖拽用：把 stack 的某个「非分组页」拖到顶层某行某格。
   * stack 的 page 不走 rows，按 children 下标直接取。
   */
  function dropStackPageToTop(stackId: string, pageIndex: number, toRow: number, toCell: number) {
    const stack = config.value.widgets.find(w => w.id === stackId);
    if (!stack || stack.type !== 'stack') return;
    const childId = stack.children?.[pageIndex];
    if (!childId) return;
    // 从 stack 摘出该页
    stack.children = (stack.children || []).filter((id, i) => i !== pageIndex);
    // activePageIndex 越界校正
    const n = stack.children.length;
    if ((stack.activePageIndex || 0) >= n) {
      stack.activePageIndex = Math.max(0, n - 1);
    }
    // 插入顶层指定位置（复用 dropChildToTop 的插入逻辑）
    const top = config.value.layout.rows.map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
    if (toRow < 0 || toRow >= top.length) {
      config.value.layout.rows = autoFitColumns(appendWidgetToRows(top, childId));
    } else {
      if (top[toRow].widgetIds.length >= 6) {
        top.splice(toRow + 1, 0, createLayoutRow({ columns: 1, widgetIds: [childId] }));
      } else {
        const at = Math.max(0, Math.min(toCell, top[toRow].widgetIds.length));
        top[toRow].widgetIds.splice(at, 0, childId);
      }
      config.value.layout.rows = autoFitColumns(top);
    }
    bumpData();
  }

  /** 调整叠放组内某页的顺序：fromIndex -> toIndex（仅 clamped 移动） */
  function moveStackPage(stackId: string, fromIndex: number, toIndex: number) {
    const idx = config.value.widgets.findIndex(w => w.id === stackId);
    const stack = idx >= 0 ? config.value.widgets[idx] : null;
    if (!stack || stack.type !== 'stack') return;
    const arr = [...(stack.children || [])];
    if (fromIndex < 0 || fromIndex >= arr.length) return;
    const moved = arr.splice(fromIndex, 1)[0];
    let t = toIndex;
    if (t < 0) t = 0;
    if (t > arr.length) t = arr.length;
    arr.splice(t, 0, moved);
    // activePageIndex 跟随原页移动到新位置；若越界则钳位
    let nextActive = stack.activePageIndex;
    if (typeof nextActive === 'number') {
      if (nextActive === fromIndex) {
        nextActive = t;
      } else {
        let n = nextActive;
        if (fromIndex < n && t >= n) n -= 1;
        else if (fromIndex > n && t <= n) n += 1;
        nextActive = Math.max(0, Math.min(n, arr.length - 1));
      }
    }
    // 替换整个对象引用，保证依赖 stack 引用的 computed（如 selected）重新计算
    config.value.widgets[idx] = { ...stack, children: arr, activePageIndex: nextActive };
    bumpData();
  }

  /* ---------- 控件样式复制粘贴（会话内剪贴板） ---------- */
  const styleClipboard = ref<WidgetStyle | null>(null);

  function copyWidgetStyle(id: string) {
    const w = config.value.widgets.find(x => x.id === id);
    if (!w) return;
    // 整份 style（含 direction / fieldsLayout），便于跨控件复用布局方向
    styleClipboard.value = klona({ ...createDefaultWidgetStyle(), ...w.style });
  }

  function pasteWidgetStyle(id: string) {
    if (!styleClipboard.value) return;
    const idx = config.value.widgets.findIndex(x => x.id === id);
    if (idx < 0) return;
    const cur = config.value.widgets[idx];
    const clip = styleClipboard.value;
    // 仅保留格子宽度/span（布局占位）；标题方向、多字段排列随样式一起粘贴
    config.value.widgets[idx] = {
      ...cur,
      style: {
        ...createDefaultWidgetStyle(clip),
        direction: clip.direction ?? 'row',
        fieldsLayout: clip.fieldsLayout ?? 'stack',
        width: cur.style.width,
        span: cur.style.span,
      },
    };
    bumpData();
  }

  function copyStyleObject(style: WidgetStyle) {
    styleClipboard.value = klona({ ...createDefaultWidgetStyle(), ...style });
  }

  /* ---------- 整控件复制粘贴（会话内剪贴板，容器连同子树一起复制） ---------- */
  const widgetClipboard = ref<Widget | null>(null);

  /** 复制单个控件（含 group/stack 子树）进剪贴板。保留原 id，粘贴时统一换新。 */
  function copyWidget(id: string) {
    const w = config.value.widgets.find(x => x.id === id);
    if (!w) return;
    widgetClipboard.value = klona(w);
  }

  /** 递归克隆控件子树，给每个控件换新 id，并同步重写 children / rows 引用。
   *  返回新的根控件。所有新克隆控件（含根）push 进 sink，供调用方统一 push 进 widgets。 */
  let widgetIdSeq = 0;
  function cloneWidgetSubtree(w: Widget, sink: Widget[]): Widget {
    const newId = `w_${Date.now()}_${widgetIdSeq++}`;
    if (w.type === 'group' || w.type === 'stack') {
      const oldToNew = new Map<string, string>();
      const clonedChildren: Widget[] = [];
      for (const cid of w.children || []) {
        const child = config.value.widgets.find(x => x.id === cid);
        if (!child) continue;
        const childClone = cloneWidgetSubtree(child, sink);
        oldToNew.set(cid, childClone.id);
        clonedChildren.push(childClone);
      }
      const next: Widget = {
        ...klona(w),
        id: newId,
        children: clonedChildren.map(c => c.id),
        rows: (w.rows || []).map(r => ({
          ...r,
          widgetIds: r.widgetIds.map(id => oldToNew.get(id) ?? id).filter(Boolean),
        })),
      };
      sink.push(next);
      return next;
    }
    const leaf: Widget = { ...klona(w), id: newId, children: [], rows: [] };
    sink.push(leaf);
    return leaf;
  }

  /** 粘贴剪贴板控件到顶层（追加为新行，与「+ 新增」一致）。
   *  返回新顶层控件 id（剪贴板为空时返回空串）。 */
  function pasteWidgetTop(): string {
    const clip = widgetClipboard.value;
    if (!clip) return '';
    const sink: Widget[] = [];
    const root = cloneWidgetSubtree(clip, sink);
    for (const c of sink) config.value.widgets.push(c);
    config.value.layout.rows = autoFitColumns(
      appendWidgetToRows(config.value.layout.rows, root.id),
    );
    bumpData();
    return root.id;
  }

  /** 粘贴剪贴板控件进指定 group / stack 作为子控件：
   *  group 同步追加一行单列；stack 追加为新页（不占 rows）。
   *  父不是容器或剪贴板为空时直接返回空串。返回新顶层控件 id。 */
  function pasteWidgetInto(parentId: string): string {
    const clip = widgetClipboard.value;
    if (!clip) return '';
    const parent = config.value.widgets.find(w => w.id === parentId);
    if (!parent || (parent.type !== 'group' && parent.type !== 'stack')) return '';
    const sink: Widget[] = [];
    const root = cloneWidgetSubtree(clip, sink);
    for (const c of sink) config.value.widgets.push(c);
    parent.children = [...(parent.children || []), root.id];
    if (parent.type === 'group') {
      const nextRows = [...(parent.rows || []), createLayoutRow({ columns: 1, widgetIds: [root.id] })];
      (parent as Widget).rows = normalizeGroupRows({ ...parent, rows: nextRows } as Widget);
    }
    bumpData();
    return root.id;
  }

  function pasteIntoStyleObject(style: WidgetStyle): WidgetStyle | null {
    if (!styleClipboard.value) return null;
    const clip = styleClipboard.value;
    return {
      ...createDefaultWidgetStyle(clip),
      direction: clip.direction ?? 'row',
      fieldsLayout: clip.fieldsLayout ?? 'stack',
      width: style.width,
      span: style.span,
    };
  }

  function isDescendant(ancestorId: string, nodeId: string): boolean {
    const w = config.value.widgets.find(x => x.id === ancestorId);
    if (!w?.children?.length) return false;
    if (w.children.includes(nodeId)) return true;
    return w.children.some(cid => isDescendant(cid, nodeId));
  }

  function getParentGroupId(widgetId: string): string | null {
    for (const w of config.value.widgets) {
      if ((w.type === 'group' || w.type === 'stack') && w.children?.includes(widgetId)) return w.id;
    }
    return null;
  }

  /**
   * 切换主题：只改容器 + widgetDefaults。
   * 已有控件：仅当某主题色字段仍等于「旧主题预设」时才跟到新默认，自定义过的字段一律保留。
   */
  function applyPreset(layout: Partial<Config['layout']>) {
    // 用 themeDefaults（主题预设样式）做对比基准，而非 widgetDefaults（可能被用户自定义过）
    const oldDefaults = {
      ...(config.value.layout.themeDefaults || config.value.layout.widgetDefaults || baseStyle),
    };
    const nextDefaults = layout.widgetDefaults
      ? { ...config.value.layout.widgetDefaults, ...layout.widgetDefaults }
      : config.value.layout.widgetDefaults;
    config.value.layout = {
      ...config.value.layout,
      ...layout,
      rows: config.value.layout.rows,
      widgetDefaults: nextDefaults,
    };
    if (layout.borderWidth != null || layout.borderColor || layout.borderStyle) {
      const l = config.value.layout;
      l.border = buildBorder(l.borderWidth, l.borderStyle, l.borderColor);
    }
    // 更新 themeDefaults 为新主题的预设样式
    if (layout.widgetDefaults) {
      config.value.layout.themeDefaults = { ...layout.widgetDefaults };
    }
    if (layout.widgetDefaults && nextDefaults) {
      const d = nextDefaults;
      config.value.widgets = config.value.widgets.map(w => ({
        ...w,
        style: mergeThemeIntoWidgetStyle(w.style, oldDefaults, d),
      }));
      bumpData();
    }
  }

  /** 把当前 widgetDefaults 覆盖到全部控件（保留各控件格子宽度/span） */
  function applyDefaultsToAllWidgets() {
    const d = config.value.layout.widgetDefaults || baseStyle;
    config.value.widgets = config.value.widgets.map(w => ({
      ...w,
      style: {
        ...d,
        width: w.style.width,
        span: w.style.span,
      },
    }));
    bumpData();
  }

  function reset() {
    config.value = defaultConfig();
    bumpData();
  }

  /** 导出当前配置 JSON 字符串（完整 layout + widgets） */
  function exportConfigJson(): string {
    const l = config.value.layout;
    l.border = buildBorder(l.borderWidth, l.borderStyle, l.borderColor);
    return JSON.stringify(klona(config.value), null, 2);
  }

  /**
   * 从 JSON 导入配置。成功返回 null，失败返回错误信息。
   * 会走 ConfigSchema + normalize，非法字段丢弃。
   */
  function importConfigJson(raw: string): string | null {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // 兼容：整包 / { config } / 仅 chat 变量外壳
      let payload = data;
      if (data && typeof data === 'object' && data.custom_status_bar) {
        payload = data.custom_status_bar;
      } else if (data && typeof data === 'object' && data.config && data.config.widgets) {
        payload = data.config;
      }
      const parsed = ConfigSchema.safeParse(payload);
      if (!parsed.data) {
        const msg = parsed.error?.issues?.slice(0, 3).map((i: any) => i.message).join('; ') || '结构不匹配';
        return `配置无效：${msg}`;
      }
      config.value = ensureNormalized(parsed.data);
      lastSavedJson = '';
      scheduleSave();
      bumpData();
      return null;
    } catch (e: any) {
      return `解析失败：${e?.message || String(e)}`;
    }
  }

  /** 可加入 group 的候选项：非自身、非其祖先、未在本 group 内 */
  function candidatesForGroup(groupId: string): Widget[] {
    const group = config.value.widgets.find(w => w.id === groupId);
    const inThis = new Set(group?.children || []);
    return config.value.widgets.filter(w => {
      if (w.id === groupId) return false;
      if (inThis.has(w.id)) return false;
      // 不能把祖先塞进自己
      if (isDescendant(w.id, groupId)) return false;
      // 已属于其它 group 的也可移入（addChildToGroup 会先摘掉）
      return true;
    });
  }

  /**
   * 切换分组/叠放折叠：
   * - 编辑器列表：折叠子项展示
   * - 可视化布局：收起整个组的内部行（预览渲染不读此字段）
   */
  function toggleGroupCollapsed(groupId: string) {
    const idx = config.value.widgets.findIndex(x => x.id === groupId);
    if (idx < 0) return;
    const w = config.value.widgets[idx];
    if (!w || (w.type !== 'group' && w.type !== 'stack')) return;
    // 整数组替换，避免个别环境下下标赋值不触发布局模式视图更新
    const nextCollapsed = !w.collapsed;
    config.value.widgets = config.value.widgets.map((item, i) =>
      i === idx ? { ...item, collapsed: nextCollapsed } : item,
    );
  }

  /* ---------- 自定义字体（导入 ttf/otf/woff/woff2 → base64 @font-face） ---------- */
  function addFont(font: { name: string; family: string; src: string; format: string }): string {
    const fonts = config.value.layout.fonts || [];
    const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    config.value.layout = {
      ...config.value.layout,
      fonts: [...fonts, { id, name: font.name || font.family, family: font.family, src: font.src, format: font.format }],
    };
    return id;
  }

  function removeFont(id: string) {
    const fonts = (config.value.layout.fonts || []).filter(f => f.id !== id);
    config.value.layout = { ...config.value.layout, fonts };
  }

  function updateFont(id: string, patch: Partial<{ name: string; family: string }>) {
    const fonts = (config.value.layout.fonts || []).map(f => (f.id === id ? { ...f, ...patch } : f));
    config.value.layout = { ...config.value.layout, fonts };
  }

  /* ---------- 图片图库（控件用 `img:<id>` 引用；删控件不丢图） ---------- */

  /** 把图片加入图库。同 src（按完全字符串相等）已存在则复用原 id，不重复入。返回 imageId。 */
  function addImage(img: { name?: string; src: string }): string {
    const src = (img.src || '').trim();
    if (!src) return '';
    const arr = config.value.layout.images || [];
    const existed = arr.find(g => g.src === src);
    if (existed) return existed.id;
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    config.value.layout = {
      ...config.value.layout,
      images: [...arr, { id, name: (img.name || '').trim(), src }],
    };
    return id;
  }

  /** 删除图库条目：先把所有引用 `img:<id>` 的控件字段清空，再从图库移除。 */
  function removeImage(id: string) {
    const refToken = `img:${id}`;
    config.value.widgets = config.value.widgets.map(w => {
      let changed: Widget | null = null;
      // 普通模式静态值
      if (w.binding?.static_value === refToken) {
        changed = { ...w, binding: { ...w.binding, static_value: '' } };
      }
      // imageMap 条目
      if (w.imageMap?.length) {
        const newMap = w.imageMap.map(e => (e.src === refToken ? { ...e, src: '' } : e));
        if (newMap.some((e, i) => e !== (w.imageMap as any)[i])) {
          changed = (changed || { ...w }) as Widget;
          (changed as Widget).imageMap = newMap;
        }
      }
      return changed || w;
    });
    config.value.layout = {
      ...config.value.layout,
      images: (config.value.layout.images || []).filter(g => g.id !== id),
    };
    bumpData();
  }

  /** 重命名图库条目。 */
  function renameImage(id: string, name: string) {
    const imgs = (config.value.layout.images || []).map(g => (g.id === id ? { ...g, name } : g));
    config.value.layout = { ...config.value.layout, images: imgs };
  }

  /** 一次性迁移：把所有控件里直接写死的 base64 / URL 静态值、imageMap 条目收进图库并改为 `img:<id>` 引用。
   *  - 已是 `img:<id>` 且图库仍有该条：保留（兼容旧引用）
   *  - 已是 `img:<id>` 但图库丢失该条：清空（避免破图），转上一次重新上传/填地址
   *  - 是 base64 data URL：入图库，改写为引用
   *  - 是普通 http URL / 外链：保留原值，不入图库（外链易变且不入库更省体）
   *  重复调用幂等。返回本轮迁移入图库的数量（0 = 无新迁移）。 */
  function migrateBase64Images(): number {
    let n = 0;
    const gallery = config.value.layout.images || [];
    const findOrAdd = (src: string): string | null => {
      const s = (src || '').trim();
      if (!s) return null;
      if (!s.startsWith('data:')) return null; // 仅迁移 base64，URL 保留原值
      const existed = gallery.find(g => g.src === s);
      if (existed) return existed.id;
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      gallery.push({ id, name: '', src: s });
      n++;
      return id;
    };
    const galleryIds = new Set(gallery.map(g => g.id));
    let touched = false;
    config.value.widgets = config.value.widgets.map(w => {
      let changed: Widget | null = null;
      // 普通模式：图片控件 + source=static + static_value 是 img-ref / base64
      if (w.type === 'image' && w.source === 'static' && w.binding) {
        const sv = w.binding.static_value || '';
        if (sv.startsWith('img:')) {
          if (!galleryIds.has(sv.slice(4))) {
            changed = { ...w, binding: { ...w.binding, static_value: '' } };
          }
        } else {
          const nid = findOrAdd(sv);
          if (nid) {
            changed = { ...w, binding: { ...w.binding, static_value: `img:${nid}` } };
          }
        }
      }
      // imageMap 条目
      if (w.imageMap?.length) {
        const newMap = w.imageMap.map(e => {
          const s = e.src || '';
          if (s.startsWith('img:')) {
            if (galleryIds.has(s.slice(4))) return e;
            return { ...e, src: '' };
          }
          const nid = findOrAdd(s);
          return nid ? { ...e, src: `img:${nid}` } : e;
        });
        if (newMap.some((e, i) => e !== (w.imageMap as any)[i])) {
          touched = true;
          (changed || w as Widget).imageMap = newMap;
          if (!changed) changed = { ...w };
        }
      }
      if (changed) touched = true;
      return changed || w;
    });
    if (touched) {
      config.value.layout = { ...config.value.layout, images: [...gallery] };
      bumpData();
    }
    return n;
  }

  return {
    config,
    dataTick,
    renderWidgets,
    /** 设置渲染期临时控件（stack 自动行克隆页用），避免 .value unwrap 问题 */
    setRenderWidgets(v: Widget[]) {
      renderWidgets.value = v;
    },
    /** 先查渲染期临时控件，再查 config.widgets；id 带 __arN 后缀的为克隆页 */
    findWidget(id: string): Widget | undefined {
      return renderWidgets.value.find(w => w.id === id) ?? config.value.widgets.find(w => w.id === id);
    },
    widgetValue,
    widgetEntries,
    addWidget,
    removeWidget,
    updateWidget,
    updateWidgetStyle,
    moveWidget,
    moveWidgetCell,
    updateRowColumns,
    addRow,
    removeRow,
    reorderRow,
    updateRowMeta,
    toggleRowCollapsed,
    updateChildRowMeta,
    toggleChildRowCollapsed,
    setRows,
    addChildToGroup,
    removeChildFromGroup,
    dropTopWidgetIntoGroup,
    dropChildToTop,
    dropStackPageToTop,
    moveStackPage,
    moveChildWidgetCell,
    updateChildRowColumns,
    addChildRow,
    removeChildRow,
    reorderChildRow,
    getParentGroupId,
    isDescendant,
    candidatesForGroup,
    toggleGroupCollapsed,
    styleClipboard,
    copyWidgetStyle,
    pasteWidgetStyle,
    copyStyleObject,
    pasteIntoStyleObject,
    widgetClipboard,
    copyWidget,
    pasteWidgetTop,
    pasteWidgetInto,
    groupLayoutClipboard,
    copyGroupLayout,
    pasteGroupLayout,
    applyPreset,
    applyDefaultsToAllWidgets,
    reset,
    exportConfigJson,
    importConfigJson,
    addFont,
    removeFont,
    updateFont,
    addImage,
    removeImage,
    renameImage,
    migrateBase64Images,
  };
});
