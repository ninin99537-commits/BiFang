import type { Widget, WidgetType } from '../schema';

const TYPE_LABEL: Record<WidgetType, string> = {
  label: '文本',
  bar: '进度条',
  kv: '键值',
  list: '列表',
  divider: '分隔线',
  group: '分组',
  stack: '叠放组',
  image: '图片',
};

/** 控件类型中文名（编辑器 / 可视化布局共用） */
export function typeLabel(t: WidgetType | string): string {
  return (TYPE_LABEL as Record<string, string>)[t] || t;
}

/**
 * 编辑器内控件显示名：备注名 > 标签/标题 > 类型序号（如 文本1）
 * 绝不回落到 id 乱码。
 */
export function widgetDisplayName(w: Widget, allWidgets?: Widget[]): string {
  if (w.name?.trim()) return w.name.trim();
  if (w.label?.trim()) return w.label.trim();
  const prefix = typeLabel(w.type);
  if (allWidgets?.length) {
    const sameType = allWidgets.filter(x => x.type === w.type);
    const idx = sameType.findIndex(x => x.id === w.id);
    if (idx >= 0) return `${prefix}${idx + 1}`;
  }
  return prefix;
}

/** 带类型前缀：`[文本] 备注名` */
export function widgetTypedName(w: Widget, allWidgets?: Widget[]): string {
  return `[${typeLabel(w.type)}] ${widgetDisplayName(w, allWidgets)}`;
}

/** 仅有 id 时：从列表里查再命名 */
export function widgetNameById(id: string, widgets: Widget[], fallback = '未知'): string {
  const w = widgets.find(x => x.id === id);
  return w ? widgetDisplayName(w, widgets) : fallback;
}

export function widgetTypedNameById(id: string, widgets: Widget[]): string {
  const w = widgets.find(x => x.id === id);
  return w ? widgetTypedName(w, widgets) : id.slice(0, 6);
}
