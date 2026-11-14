import type { CustomFont } from '../schema';

const STYLE_ID = 'sb-custom-fonts';
const STYLE_ID_EDITOR = 'sb-custom-fonts-editor';

/** font-face 要在 iframe 宿主（widget 容器）里生效，所以要注入到那个 document；
 *  EditorPanel 自己也要装一份，否则编辑器里看不到字体效果 */
function ensureStyle(doc: Document, id: string): HTMLStyleElement | null {
  try {
    let el = doc.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = id;
      doc.head.appendChild(el);
    }
    return el;
  } catch {
    return null;
  }
}

/** 生成 @font-face CSS 文本（一份给所有字体） */
function buildFontFacesCSS(fonts: CustomFont[]): string {
  return fonts
    .filter(f => f.family && f.src)
    .map(f => {
      const family = f.family.replace(/"/g, '\\"');
      const fmt = f.format ? ` format("${f.format.replace(/"/g, '')}")` : '';
      // src 用 base64 data URL，里面不会再有引号风险
      return `@font-face { font-family: "${family}"; src: url("${f.src}")${fmt}; font-display: swap; }`;
    })
    .join('\n');
}

/** 注入到 widget 所在 document（通常是 iframe 内） */
export function applyCustomFonts(fonts: CustomFont[]) {
  const el = ensureStyle(document, STYLE_ID);
  if (!el) return;
  el.textContent = buildFontFacesCSS(fonts);
}

/** 注入到 EditorPanel（编辑器预览也跟字体走；同一 document，故复用 STYLE_ID） */
export function syncCustomFontsToEditor(fonts: CustomFont[]) {
  const el = ensureStyle(document, STYLE_ID_EDITOR);
  if (!el) return;
  el.textContent = buildFontFacesCSS(fonts);
}

/** 同时注入到 widget 与编辑器 */
export function applyFontsEverywhere(fonts: CustomFont[]) {
  applyCustomFonts(fonts);
  syncCustomFontsToEditor(fonts);
}

/** 文件扩展名 → @font-face format 描述 */
export function fontFormatForFile(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'ttf':
      return 'truetype';
    case 'otf':
      return 'opentype';
    case 'woff':
      return 'woff';
    case 'woff2':
      return 'woff2';
    default:
      return '';
  }
}

/** 把文件名/家族名规整成可作 CSS 标识符与展示名 */
export function sanitizeFontName(raw: string): string {
  // 去扩展名
  const base = raw.replace(/\.[^.]+$/, '').trim();
  if (!base) return '自定义字体';
  // 仅保留中文/字母数字/连字符/下划线/空格，其余替换为空格
  const clean = base.replace(/[^\p{L}\p{N}_-]+/gu, ' ').trim();
  return clean || '自定义字体';
}

/** 把 family 名包成 CSS font-family 值（带引号防有空格/中文） */
export function familyCssValue(family: string): string {
  const t = (family || '').trim().replace(/"/g, '');
  return t ? `"${t}"` : '';
}
