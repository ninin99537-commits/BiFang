import type { Widget, WidgetStyle, Layout } from '../schema';
import { resolveWidgetStyle, withOpacity, barFillBackground } from '../schema';

/** 对齐 → flex 主轴/交叉轴 */
export function alignToFlex(align: WidgetStyle['align'] | 'left' | 'center' | 'right'): {
  justifyContent: string;
  alignItems: string;
  textAlign: string;
} {
  const map = {
    left: { justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left' },
    center: { justifyContent: 'center', alignItems: 'center', textAlign: 'center' },
    right: { justifyContent: 'flex-end', alignItems: 'flex-end', textAlign: 'right' },
  } as const;
  return map[align] || map.left;
}

/** 垂直对齐 → flex 交叉轴（按需对横向 / 纵向都给一个稳定映射） */
export function alignVToFlex(v: WidgetStyle['alignV'] | 'top' | 'center' | 'bottom'): {
  alignItemsV: string;
  justifyItemsV: string;
} {
  const map = {
    top: { alignItemsV: 'flex-start', justifyItemsV: 'flex-start' },
    center: { alignItemsV: 'center', justifyItemsV: 'center' },
    bottom: { alignItemsV: 'flex-end', justifyItemsV: 'flex-end' },
  } as const;
  return map[v] || map.center;
}

/** 标题独立样式（颜色/字号/对齐），与数据区 align 分离 */
export function labelCss(style: WidgetStyle): Record<string, string | undefined> {
  const la = alignToFlex(style.labelAlign || 'left');
  const dir = style.direction || 'row';
  const fontSize =
    style.labelFontSize && style.labelFontSize > 0
      ? style.labelFontSize + 'px'
      : undefined;
  const color = style.labelColor
    ? withOpacity(style.labelColor, style.colorOpacity ?? 1)
    : undefined;
  // 上下：标题用 alignSelf 控制水平位置
  // 左右：交叉轴是垂直，标题 alignSelf 跟 labelAlignV 决定
  const lv = alignVToFlex(style.labelAlignV || 'center').alignItemsV;
  const alignSelf =
    dir === 'column'
      ? style.labelAlign === 'center'
        ? 'center'
        : style.labelAlign === 'right'
          ? 'flex-end'
          : 'flex-start'
      : lv;
  return {
    color,
    fontSize,
    // 标题加粗与内容区 bold 独立；显式设值避免继承容器 fontWeight
    fontWeight: style.labelBold ? 'bold' : 'normal',
    // 继承容器斜体；右侧留白避免斜体末笔被父级 overflow 裁切
    paddingInlineEnd: style.italic ? '0.2em' : undefined,
    textAlign: la.textAlign,
    alignSelf,
    // 标题永不缩略：随文字宽且禁止 shrink；数据区单独 ellipsis
    width: dir === 'column' ? '100%' : 'max-content',
    maxWidth: dir === 'column' ? '100%' : 'none',
    flex: dir === 'column' ? undefined : '0 0 auto',
    flexShrink: '0',
    overflow: 'visible',
    textOverflow: 'clip',
    whiteSpace: 'nowrap',
  };
}

/** 解析后的控件通用 CSS 片段 */
export function baseWidgetCss(style: WidgetStyle, opts?: { fullWidth?: boolean }): Record<string, string | undefined> {
  const align = alignToFlex(style.align || 'left');
  const alignV = alignVToFlex(style.alignV || 'center');
  const dir = style.direction || 'row';
  const color = withOpacity(style.color || '#333333', style.colorOpacity ?? 1);
  const bg =
    !style.bg || style.bg === 'transparent'
      ? undefined
      : withOpacity(style.bg, style.bgOpacity ?? 1);

  // 横向：标题+数据从左排起（水平对齐交给数据区/标题自身），交叉轴=垂直（alignV）
  // 纵向：主轴=垂直（alignV），交叉轴=水平（align；左时 stretch 方便铺满）
  const justifyContent = dir === 'column' ? alignV.justifyItemsV : 'flex-start';
  const alignItems =
    dir === 'column'
      ? style.align === 'center'
        ? 'center'
        : style.align === 'right'
          ? 'flex-end'
          : 'stretch'
      : alignV.alignItemsV;

  return {
    color,
    fontFamily: style.font,
    fontSize: (style.fontSize ?? 13) + 'px',
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    background: bg,
    // 数据区对齐不强制改标题：容器 textAlign 仅作兜底，标题用 labelCss
    textAlign: align.textAlign,
    borderRadius: (style.radius ?? 0) + 'px',
    padding: (style.padding ?? 0) + 'px',
    // auto：不写死 100%，由外层格子/单列规则决定；显式宽度仍尊重配置
    width: opts?.fullWidth ? '100%' : style.width === 'auto' ? undefined : style.width,
    boxSizing: 'border-box',
    flexDirection: dir === 'column' ? 'column' : 'row',
    flexWrap: 'nowrap',
    justifyContent,
    alignItems,
  };
}

/** chip 是否启用（默认 true） */
export function isChipEnabled(style: WidgetStyle): boolean {
  return style.chipEnabled !== false;
}

/** chip 边框色：自定义 > 跟随文字色半透明；transparent/none 关闭边框 */
export function chipBorderColor(style: WidgetStyle): string | undefined {
  if (!isChipEnabled(style)) return undefined;
  const raw = (style.chipBorder || '').trim();
  if (raw === 'transparent' || raw === 'none') return 'transparent';
  if (raw) return withOpacity(raw, style.colorOpacity ?? 1);
  const c = style.color || '#7ec9b8';
  return withOpacity(c, Math.min(0.45, (style.colorOpacity ?? 1) * 0.55));
}

/** chip 背景色：自定义 > 跟随文字色浅底；transparent 无底 */
export function chipBgColor(style: WidgetStyle): string | undefined {
  if (!isChipEnabled(style)) return undefined;
  const raw = (style.chipBg || '').trim();
  if (raw === 'transparent' || raw === 'none') return 'transparent';
  if (raw) return withOpacity(raw, style.bgOpacity ?? 1);
  const c = style.color || '#7ec9b8';
  return withOpacity(c, Math.min(0.12, (style.colorOpacity ?? 1) * 0.14));
}

/** 生成 chip 内联样式；未启用或过长时返回空 */
export function chipCss(
  style: WidgetStyle,
  text: string,
  isShort: (t: string) => boolean,
): Record<string, string | undefined> {
  if (!isChipEnabled(style) || !isShort(text)) return {};
  const border = chipBorderColor(style);
  const bg = chipBgColor(style);
  if (!border && !bg) return {};
  const r = Math.min(999, Math.max(6, (style.radius ?? 6) + 6));
  return {
    borderColor: border,
    background: bg,
    borderRadius: r + 'px',
  };
}

/**
 * 合并：widgetDefaults 为底，控件 style 覆盖。
 * 注意：加载后的控件 style 通常已是完整对象，故改默认不会自动改旧控件；
 * 新建控件会复制 defaults，也可用「应用到全部控件」。
 */
export function resolveStyle(layout: Layout, widget: Widget): WidgetStyle {
  return resolveWidgetStyle(layout.widgetDefaults, widget.style);
}

export { barFillBackground, withOpacity };
