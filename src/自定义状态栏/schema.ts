import { z } from 'zod';

/** 数字字段：兼容 string/NaN，并钳到 [min,max]；越界不导致整份配置解析失败 */
function clampNum(min: number, max: number, fallback: number) {
  return z.preprocess((v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }, z.number()).prefault(fallback);
}

/** 0~1 透明度 */
const opacityNum = (fallback = 1) => clampNum(0, 1, fallback);

/** 单个控件的数据绑定配置 */
export const BindingSchema = z
  .object({
    /** MVU 父级路径，如 "角色.白娅" */
    mvu_parent: z.string().prefault(''),
    /** MVU 叶子字段名（兼容旧配置） */
    mvu_field: z.string().prefault(''),
    /** 同一父级下选中的多个子字段（优先于 mvu_field） */
    mvu_fields: z.array(z.string()).prefault([]),
    /** 数据库表名 */
    db_table: z.string().prefault(''),
    /** 数据库行定位：number 表示 row_id；对象表示按某列值匹配；'latest' 表示最新行 */
    db_row: z
      .union([
        z.number(),
        z.literal('latest'),
        z.object({ col: z.string().prefault(''), value: z.string().prefault('') }),
      ])
      .prefault(1),
    /** 数据库列名 */
    db_column: z.string().prefault(''),
    /** 同一行内展示的多列（优先于 db_column） */
    db_columns: z.array(z.string()).prefault([]),
    /** 静态值 */
    static_value: z.string().prefault(''),
  })
  .prefault({});

/** 控件类型 */
export const WidgetTypeSchema = z.enum([
  'label', // 纯文本/数值
  'bar', // 进度条
  'kv', // 键值对
  'list', // 列表
  'divider', // 分隔线
  'group', // 分组（可嵌套）
  'stack', // 叠放组：同一格内多个子控件，左右切换显示其一
  'image', // 立绘 / 头像图片
]);

/** 图片填充模式（对应 object-fit） */
export const ImgModeSchema = z.enum(['cover', 'contain', 'fill']);

/** 数据源类型 */
export const SourceTypeSchema = z.enum(['mvu', 'db', 'static']);

/** 标题与数据的排列方向 */
export const ContentDirectionSchema = z.enum(['row', 'column']);

/** 多字段在单元格内的排列 */
export const FieldsLayoutSchema = z.enum(['stack', 'inline']);

/** 进度条数值显示位置 */
export const BarValueModeSchema = z.enum(['hidden', 'inside', 'outside']);

/** 单个控件的样式 */
export const WidgetStyleSchema = z
  .object({
    color: z.string().prefault('#e4eef2'),
    font: z.string().prefault('inherit'),
    fontSize: z.number().prefault(13),
    /** 内容区加粗 */
    bold: z.boolean().prefault(false),
    italic: z.boolean().prefault(false),
    bg: z.string().prefault('transparent'),
    /** 背景透明度 0~1，仅当 bg 非 transparent 时生效 */
    bgOpacity: opacityNum(1),
    /** 文字透明度 0~1 */
    colorOpacity: opacityNum(1),
    align: z.enum(['left', 'center', 'right']).prefault('left'),
    /** 数据区垂直对齐：top/center/bottom */
    alignV: z.enum(['top', 'center', 'bottom']).prefault('center'),
    radius: z.number().prefault(8),
    padding: z.number().prefault(5),
    // 进度条专用
    barMax: z.number().prefault(100),
    barColor: z.string().prefault('#6ebfb0'),
    /** 进度条渐变终点色，空字符串表示纯色 */
    barColorEnd: z.string().prefault('#8ec5d8'),
    barTrack: z.string().prefault('#252d38'),
    /** 轨道透明度 0~1 */
    barTrackOpacity: opacityNum(0.92),
    barHeight: z.number().prefault(12),
    /** 进度条数值：隐藏 / 条内 / 条外 */
    barValueMode: BarValueModeSchema.prefault('outside'),
    /** 进度条数值文字色（空=跟随控件文字色；条内默认可再覆写） */
    barValueColor: z.string().prefault('#b4c9d2'),
    /** 进度条数值字号，0 表示跟随控件字号 */
    barValueFontSize: z.number().prefault(11),
    // 标题独立样式
    /** 标题文字色，空字符串表示跟随控件 color */
    labelColor: z.string().prefault('#94aab4'),
    /** 标题字号，0 表示跟随控件字号 */
    labelFontSize: z.number().prefault(12),
    /** 标题是否加粗（与内容区 bold 独立） */
    labelBold: z.boolean().prefault(false),
    /** 标题对齐（与数据区 align 独立） */
    labelAlign: z.enum(['left', 'center', 'right']).prefault('left'),
    /** 标题垂直对齐：top/center/bottom（与数据区 alignV 独立） */
    labelAlignV: z.enum(['top', 'center', 'bottom']).prefault('center'),
    /** 分组是否显示边框 */
    groupBorder: z.boolean().prefault(false),
    // 拆分片段 chip 样式
    /** 是否给短数据片段加边框/底（可关闭） */
    chipEnabled: z.boolean().prefault(false),
    /** chip 边框色，空=跟随文字色半透明 */
    chipBorder: z.string().prefault(''),
    /** chip 背景色，空=跟随文字色浅底；transparent=无底 */
    chipBg: z.string().prefault(''),
    /** 数据条目间距 px（多 span / chip 之间的间隔） */
    fieldsGap: z.number().prefault(6),
    // 布局
    width: z.string().prefault('auto'), // 'auto' | '100%' | '120px'
    span: z.number().prefault(1), // 兼容旧配置：跨列数
    /** 标题与数值：row=左右，column=上下 */
    direction: ContentDirectionSchema.prefault('row'),
    /** 多子字段：stack=纵向，inline=横向 */
    fieldsLayout: FieldsLayoutSchema.prefault('stack'),
    // 叠放组（stack）页签样式（仅页签，无左右切换）
    /** 页签强调色，空=跟随全局 accentColor */
    stackAccent: z.string().prefault(''),
    /** 兼容旧配置：曾用于切换按钮尺寸，现忽略 */
    stackNavSize: clampNum(4, 28, 18),
    /** 页签字号 px */
    stackFontSize: clampNum(4, 20, 11),
    /** 是否显示页签 */
    stackShowTabs: z.boolean().prefault(true),
    /** 页签之间水平间距 px */
    stackGap: clampNum(0, 16, 4),
    /** 页签圆角 px（≥高度一半即为胶囊；旧配置 999 钳到 24） */
    stackTabRadius: clampNum(0, 24, 12),
    /** 页签栏上下外边距 px（不撑开页签本体背景） */
    stackTabPadY: clampNum(0, 16, 0),
    /** 页签组底色（仅包住页签宽度，非整行），空=强调色浅底 */
    stackTabTrack: z.string().prefault(''),
    /** 未选中页签文字色，空=继承 */
    stackTabColor: z.string().prefault(''),
    /** 未选中页签背景，空=透明 */
    stackTabInactiveBg: z.string().prefault(''),
    /** 选中页签文字色，空=强调色 */
    stackTabActiveColor: z.string().prefault(''),
    /** 选中页签背景，空=强调色浅底 */
    stackTabActiveBg: z.string().prefault(''),
    /**
     * 页签文字 / 内容标题：
     * tab=仅页签显示子页名、隐藏内容区标题（默认，去重）
     * both=页签+内容标题都显示
     * page=页签显示序号、内容区保留标题
     */
    stackTabLabelMode: z.enum(['both', 'tab', 'page']).prefault('tab'),
    // 图片（image）专用
    /** 填充模式 cover=裁切铺满 / contain=完整显示 / fill=拉伸(会变形) */
    imgMode: ImgModeSchema.prefault('cover'),
    /** 图片宽度，auto=跟随列宽，或如 '64px'/'100%' */
    imgWidth: z.string().prefault('100%'),
    /** 图片高度，auto=跟随图片比例，或如 '64px' */
    imgHeight: z.string().prefault('auto'),
    /** 图片圆角 px；≥高度一半即圆形头像 */
    imgRadius: clampNum(0, 200, 8),
    /** 撑满行高：开启后图片高度自动填满所在行的整行高度（与同行其它控件等高）。
     *  此时 imgHeight 自动失效，按"高度=行高 - 标题"渲染。 */
    imgStretch: z.boolean().prefault(false),
  })
  .prefault({});

/** 多列宽度分配：equal 平分 | content 按内容优先 | custom 按权重 */
export const RowColModeSchema = z.enum(['equal', 'content', 'custom']);/**
 * 多列在行内的分布（justify）：
 * equal=默认等分占满行（兼容旧配置）；
 * start/center/end/between/around=内容宽 + justify 摆空白。
 * 是否「智能让位/尽量多显示长文」由 smartEqual 开关控制，与分布正交。
 */
export const RowAlignSchema = z.enum(['equal', 'start', 'center', 'end', 'between', 'around']);

/** 一行布局：该行可独立设置列数，并按顺序放置控件 */
export const LayoutRowSchema = z
  .object({
    id: z.string().prefault(''),
    /** 本行列数（1~6） */
    columns: clampNum(1, 6, 1),
    /** 本行控件 id，按视觉从左到右 */
    widgetIds: z.array(z.string()).prefault([]),
    /** 本行上外边距（px），叠加在全局 gap 之外；允许负值以单独压紧 */
    marginTop: clampNum(-32, 64, 0),
    /** 本行下外边距（px）；允许负值以单独压紧 */
    marginBottom: clampNum(-32, 64, 0),
    /** 可视化布局 / 预览：是否折叠本行内容 */
    collapsed: z.boolean().prefault(false),
    /** 多列宽度分配方式 */
    colMode: RowColModeSchema.prefault('equal'),
    /**
     * custom 时每列权重（与 widgetIds 对齐；缺省视为 1）。
     * 例 [1,2] → 左 1fr 右 2fr
     */
    colWeights: z.array(clampNum(0.1, 12, 1)).prefault([]),
    /**
     * 多列行内分布：equal(等分满行) / 靠左 / 居中 / 靠右 / 两端 / 均分空隙。
     * 旧配置 rowAlign=equal 迁移时会打开 smartEqual。
     */
    rowAlign: RowAlignSchema.prefault('between'),
    /**
     * 智能平分：开启后，空间够时让长列完整显示；不够时在当前分布下尽量多显示被缩略内容。
     * 可与 start/center/end/between/around 同时使用。
     */
    smartEqual: z.boolean().prefault(true),
  })
  .prefault({});

/** image 控件：映射「附加条件」——另一字段 + 关键词，与该条主条件需同时满足。
 *  field 留空 = 控件绑定字段（与主条件同字段，等于要求同字段含多组关键词）。 */
export const ImageMatchCondSchema = z
  .object({
    field: z.string().prefault(''),
    keys: z.string().prefault(''),
  })
  .prefault({});

/** image 控件：字段值 → 图片 的映射条目 */
export const ImageMapEntrySchema = z
  .object({
    /** 主关键词，多个用 / 或 顿号 分隔；字段值包含任一即命中（空表示默认兜底） */
    keys: z.string().prefault(''),
    /** 命中时显示的图片 src（URL 或 base64） */
    src: z.string().prefault(''),
    /**
     * 主条件从哪个字段取值来匹配：
     * - 留空：取控件自身绑定字段（传统行为，向后兼容）
     * - db 源控件：当作该表的某一列名，按控件当前 db_row 取该列值
     * - mvu 源控件：当作 mvu_parent 下的一个子字段名取值
     * - static 源控件：无其它字段可取，统一回退到控件自身静态值
     */
    field: z.string().prefault(''),
    /**
     * 二级/多级「附加条件」，全部满足才整条命中（与主条件 AND 关系）：
     * 例：主条件 = 姓名 含「克洛伊」，附加条件 = 穿着打扮 含「赤足 卫衣」，
     * 即可让同一角色按不同衣着切不同立绘。空数组 = 单条件（传统行为）。
     */
    conds: z.array(ImageMatchCondSchema).prefault([]),
  })
  .prefault({});

/** 自定义导入字体：上传字体文件 → base64 → 注入 @font-face */
export const CustomFontSchema = z
  .object({
    /** 内部唯一 id（用于去重 / 删除） */
    id: z.string().prefault(''),
    /** 显示名（字体选择下拉里展示） */
    name: z.string().prefault(''),
    /** @font-face 用的 font-family 名（带引号转义在 CSS 中应用） */
    family: z.string().prefault(''),
    /** 字体格式：truetype / opentype / woff / woff2 */
    format: z.string().prefault(''),
    /** base64 data URL（或外部 URL） */
    src: z.string().prefault(''),
  })
  .prefault({});

/** 图片图库条目：上传的本地图片 base64 存这里，控件只存引用 `img:<id>`。
 *  删控件不删图，重新复用即可；图库随角色卡 config 一起持久化。 */
export const GalleryImageSchema = z
  .object({
    /** 内部唯一 id（用于控件引用 `img:<id>`） */
    id: z.string().prefault(''),
    /** 显示名（图库管理 UI） */
    name: z.string().prefault(''),
    /** 图片源：base64 data URL，或外部 URL（http/https/相对路径） */
    src: z.string().prefault(''),
  })
  .prefault({});

/** 单个控件配置 */
export const WidgetSchema = z
  .object({
    id: z.string().prefault(''),
    type: WidgetTypeSchema.prefault('label'),
    source: SourceTypeSchema.prefault('static'),
    binding: BindingSchema,
    label: z.string().prefault(''),
    /** 编辑器内备注名称，便于识别控件用途；不影响前端显示 */
    name: z.string().prefault(''),
    /** group 类型下的子控件 id 列表 */
    children: z.array(z.string()).prefault([]),
    /** group 内部的按行布局；空数组表示按 children 顺序单列堆叠（兼容旧配置） */
    rows: z.array(LayoutRowSchema).prefault([]),
    /** 编辑器控件列表：分组是否折叠子项（仅列表 UI，不影响预览渲染） */
    collapsed: z.boolean().prefault(false),
    style: WidgetStyleSchema,
    /** stack 类型：当前激活的子页索引（0 起） */
    activePageIndex: z.number().prefault(0),
    /** stack 类型：是否自动按数据更新轮播，0 = 手动（不自动） */
    autoRotateMs: z.number().prefault(0),
    /**
     * 叠放组「同表多行自动翻页」模式开关。
     * 开启后：用首页子控件做模板，页数 = 模板绑定表的数据行数（自动增减），
     * 每页 = 首页克隆，但把首页及其内嵌 db 源控件（含 group 子树）的 db_row
     * 同时替换为对应数据行号；页签文字取自 dbTabColumn 列对应行的值。
     */
    dbAutoRows: z.boolean().prefault(false),
    /** dbAutoRows 开启时的页签标签列名（取该列每行值作页签文字，不显示列名） */
    dbTabColumn: z.string().prefault(''),
    /**
     * dbAutoRows 开启时的「只取部分数据行」筛选：
     * 留空 = 表的全部行（1..N，传统行为）。
     * 否则解析为行号集合，只对这些行克隆一页：
     *   - 逗号/顿号/空格分隔，如 "1,3,5"；
     *   - 支持区间 "5-7"（含两端）；
     *   - 行号仍指数据行号（1 起，content[1] 是第1行）；越界自动忽略。
     */
    dbRowFilter: z.string().prefault(''),
    /** image 类型：开启「字段值→图片」映射模式（true=按 imageMap 匹配；false=绑定值直接当 URL） */
    imageMatchField: z.boolean().prefault(false),
    /** image 类型：映射表；按顺序匹配，第一条命中的 keys 优先；含一条 keys 为空的作默认兜底 */
    imageMap: z.array(ImageMapEntrySchema).prefault([]),
  })
  .prefault({});

/** 全局布局配置 */
export const LayoutSchema = z
  .object({
    /** 兼容旧配置：未迁移时的全局列数 */
    columns: z.number().prefault(2),
    gap: z.number().prefault(8),
    padding: z.number().prefault(12),
    bg: z.string().prefault('#161c24'),
    bgOpacity: opacityNum(1),
    border: z.string().prefault('1px solid #3a4d5c'),
    borderWidth: z.number().prefault(1),
    borderColor: z.string().prefault('#3a4d5c'),
    borderStyle: z.enum(['none', 'solid', 'dashed', 'dotted', 'double']).prefault('solid'),
    radius: z.number().prefault(14),
    fontFamily: z.string().prefault('inherit'),
    textColor: z.string().prefault('#e4eef2'),
    textOpacity: opacityNum(1),
    /** 主题强调色（按钮/选中/进度等 UI 点缀） */
    accentColor: z.string().prefault('#7ec9b8'),
    /** 滚动条滑块色 */
    scrollbarColor: z.string().prefault('rgba(126, 201, 184, 0.42)'),
    /** 滚动条悬停色 */
    scrollbarHoverColor: z.string().prefault('rgba(142, 197, 216, 0.72)'),
    /**
     * 编辑器内 range 滑块样式（仅状态栏编辑器面板，不影响预览进度条）
     * track/thumb/thumbHover 空=用 scrollbar / accent / scrollbarHover
     */
    editorRangeTrack: z.string().prefault(''),
    editorRangeThumb: z.string().prefault(''),
    editorRangeThumbHover: z.string().prefault(''),
    /** 控件默认样式（新建控件时复制；渲染时作为底） */
    widgetDefaults: WidgetStyleSchema,
    /** 主题预设的控件样式（切换主题时做对比基准，不受用户自定义默认样式影响） */
    themeDefaults: WidgetStyleSchema,
    /** 按行自定义列数与控件顺序 */
    rows: z.array(LayoutRowSchema).prefault([]),
    /** 自定义导入字体（上传文件 → base64 @font-face） */
    fonts: z.array(CustomFontSchema).prefault([]),
    /** 全局图片图库（上传的 base64 / 外链 URL）；控件用 `img:<id>` 引用，删控件不丢图 */
    images: z.array(GalleryImageSchema).prefault([]),
  })
  .prefault({});

/** 完整配置 */
export const ConfigSchema = z
  .object({
    layout: LayoutSchema,
    widgets: z.array(WidgetSchema).prefault([]),
  })
  .prefault({});

export type Widget = z.infer<typeof WidgetSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type LayoutRow = z.infer<typeof LayoutRowSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type WidgetType = z.infer<typeof WidgetTypeSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type Binding = z.infer<typeof BindingSchema>;
export type WidgetStyle = z.infer<typeof WidgetStyleSchema>;
export type ContentDirection = z.infer<typeof ContentDirectionSchema>;
export type FieldsLayout = z.infer<typeof FieldsLayoutSchema>;
export type BarValueMode = z.infer<typeof BarValueModeSchema>;
export type RowColMode = z.infer<typeof RowColModeSchema>;
export type RowAlign = z.infer<typeof RowAlignSchema>;
export type ImgMode = z.infer<typeof ImgModeSchema>;
export type ImageMapEntry = z.infer<typeof ImageMapEntrySchema>;
export type ImageMatchCond = z.infer<typeof ImageMatchCondSchema>;
export type CustomFont = z.infer<typeof CustomFontSchema>;
export type GalleryImage = z.infer<typeof GalleryImageSchema>;

/** 解析 border 字符串为结构化字段 */
export function parseBorder(border: string): { width: number; style: Layout['borderStyle']; color: string } {
  const m = border.trim().match(/^(\d+(?:\.\d+)?)px\s+(none|solid|dashed|dotted|double)\s+(.+)$/i);
  if (m) {
    return {
      width: Number(m[1]) || 0,
      style: (m[2].toLowerCase() as Layout['borderStyle']) || 'solid',
      color: m[3].trim() || '#000000',
    };
  }
  if (border === 'none' || !border) return { width: 0, style: 'none', color: '#000000' };
  return { width: 1, style: 'solid', color: border };
}

export function buildBorder(width: number, style: Layout['borderStyle'], color: string): string {
  if (style === 'none' || width <= 0) return 'none';
  return `${width}px ${style} ${color}`;
}

/** 从 binding 取 MVU 字段列表（兼容单字段） */
export function getMvuFields(binding: Binding): string[] {
  if (binding.mvu_fields?.length) return binding.mvu_fields;
  if (binding.mvu_field) return [binding.mvu_field];
  return [];
}

/** 从 binding 取 DB 列列表（兼容单列） */
export function getDbColumns(binding: Binding): string[] {
  if (binding.db_columns?.length) return binding.db_columns;
  if (binding.db_column) return [binding.db_column];
  return [];
}

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() 为 r,g,b,a */
export function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const c = (input || '').trim();
  if (!c || c === 'transparent' || c === 'inherit') return null;
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('') + 'ff';
    else if (h.length === 4) h = h.split('').map(x => x + x).join('');
    else if (h.length === 6) h += 'ff';
    else if (h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] !== undefined ? Number(m[4]) : 1,
    };
  }
  return null;
}

/** 颜色 + 额外透明度叠加，输出 rgba 字符串 */
export function withOpacity(color: string, opacity = 1): string {
  if (!color || color === 'transparent') return 'transparent';
  if (color === 'inherit') return color;
  const p = parseColor(color);
  if (!p) return color;
  const a = Math.max(0, Math.min(1, p.a * opacity));
  if (a >= 0.999) return `rgb(${p.r}, ${p.g}, ${p.b})`;
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(a * 1000) / 1000})`;
}

/** 取用于 <input type="color"> 的 #rrggbb */
export function toColorInput(color: string): string {
  if (!color || color === 'transparent' || color === 'inherit') return '#ffffff';
  const p = parseColor(color);
  if (!p) return '#000000';
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(p.r)}${hex(p.g)}${hex(p.b)}`;
}

/** 根据背景色亮度判断是否暗色主题 */
export function isDarkColor(color: string): boolean {
  const p = parseColor(color);
  if (!p) return true;
  // 相对亮度 (sRGB 近似)
  const lum = (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255;
  return lum < 0.45;
}

/** 进度条填充背景（支持双色渐变） */
export function barFillBackground(style: WidgetStyle): string {
  const start = style.barColor || '#4ade80';
  const end = (style.barColorEnd || '').trim();
  if (!end) return start;
  return `linear-gradient(90deg, ${start}, ${end})`;
}

/** 合并全局控件默认样式与单个控件样式 */
export function resolveWidgetStyle(defaults: WidgetStyle | undefined, style: WidgetStyle): WidgetStyle {
  return { ...(defaults || ({} as WidgetStyle)), ...style } as WidgetStyle;
}

/** 默认控件样式工厂（safeParse，避免脏字段抛错冲掉整份配置） */
export function createDefaultWidgetStyle(partial?: Partial<WidgetStyle>): WidgetStyle {
  const parsed = WidgetStyleSchema.safeParse(partial || {});
  if (parsed.success) return parsed.data;
  // 兜底：只合并已知默认，尽量保留传入字段
  const base = WidgetStyleSchema.parse({});
  return { ...base, ...(partial || {}) } as WidgetStyle;
}

/** 是否以 base64 data URL / URL 形式直接可作 <img src>（区别于 `img:<id>` 图库引用）。 */
export function isDirectImgSrc(s: string): boolean {
  return !!(s && (s.startsWith('data:') || /^(https?:|\/\/|\.?\/|[\w-]+\.(png|jpe?g|gif|webp|svg|bmp|avif))/i.test(s.trim())));
}

/** 把图片引用/地址解析成可直接放进 <img src> 的字符串。
 *  - `'img:<id>'` → 在 images 里找该条目，返回条目 src；万一找不到返回空串避免破图
 *  - 其它（base64 / http URL / 相对路径）原样返回
 *  - imageMap 条目的 src 也走此解析，即映射条目可指图库亦可直 URL */
export function resolveImgSrc(
  src: string | undefined,
  images: GalleryImage[] | undefined,
): string {
  if (!src) return '';
  const s = String(src).trim();
  if (s.startsWith('img:')) {
    const id = s.slice(4);
    const entry = (images || []).find(g => g.id === id);
    return entry?.src || '';
  }
  return s;
}
