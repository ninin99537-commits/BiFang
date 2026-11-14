// 彼方面板配色与圆角的唯一来源: 生成 CSS 变量, 并给跨 document 的提示条提供配色。
export type 主题模式 = 'dark' | 'light';

/** 悬浮球尺寸(px): 宽 × 高, iframe 命中区与提示条贴球定位共用 */
export const 悬浮球直径 = 46;
export const 悬浮球高 = 58;

/** 拱窗球圆角(px): iframe 的命中区必须与视觉同尺寸 */
export const 悬浮球圆角 = { 上: 23, 下: 6 };

/** 面板 token: CSS 变量名 = `--bf-` + 驼峰转短横线 */
export const 深色 = {
  // 表面: D 原稿墨蓝纸面
  canvas: '#10141f',
  shell: '#171c29',
  rail: '#171c29',
  paper: '#212839',
  paperHover: '#293145',
  fieldBg: '#131826',
  // 文字
  ink: '#ece6d8',
  secondary: '#c8c3b7',
  muted: '#8e93a3',
  // 线
  line: '#262d3e',
  lineSoft: '#262d3e',
  controlLine: '#3a4256',
  // 窗灯琥珀 + 状态
  accent: '#e9b46a',
  accentInk: '#23180a',
  accentSoft: '#352c23',
  accentText: '#f0c585',
  success: '#8fc3a0',
  warning: '#e9b46a',
  danger: '#e58f80',
  dangerSoft: '#302329',
  // 代码块 / 遮罩 / 阴影 / 球
  codeBg: '#131826',
  codeInk: '#c8c3b7',
  scrim: 'rgba(6, 8, 14, 0.6)',
  shadow: '0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px #262d3e',
  orbBg: '#1a2030',
  orbBgHover: '#252d40',
  orbInk: '#e9b46a',
  orbShadow: '0 6px 18px rgba(0, 0, 0, 0.45), inset 0 0 0 2px #39415a',
  // 恋爱/情欲: 专属色, 不与窗灯琥珀抢
  love: '#e79aa8',
  loveSoft: 'rgba(231, 154, 168, 0.16)',
  loveInk: '#f0b6c0',
  desire: '#bf9ad8',
  desireSoft: 'rgba(191, 154, 216, 0.18)',
  // 人物印章: 8 个不同的小清新浅色(按名字散列, 每个人一色)
  avatar1: '#2f4a40',
  avatar1Ink: '#a9d3c0',
  avatar2: '#2f4257',
  avatar2Ink: '#a8c6dd',
  avatar3: '#443a55',
  avatar3Ink: '#cbb9d9',
  avatar4: '#4d3b2c',
  avatar4Ink: '#e6c4a6',
  avatar5: '#44432c',
  avatar5Ink: '#d8d3a0',
  avatar6: '#4d3038',
  avatar6Ink: '#e6b3ba',
  avatar7: '#35452f',
  avatar7Ink: '#b8cfa4',
  avatar8: '#353a55',
  avatar8Ink: '#b6b9d9',
  // D: 控件 8 / 内容块 10 / 浮层 10 / 面板 14
  radiusSm: '8px',
  radius: '10px',
  radiusLg: '10px',
  radiusXl: '14px',
};
export type 主题Token = keyof typeof 深色;

/** 白天模式: 键必须和 深色 完全一致(这里的类型会强制, 少一个就编译不过) */
export const 白天: Record<主题Token, string> = {
  canvas: '#d9dce1',
  shell: '#f3f0e9',
  rail: '#e6e5e1',
  paper: '#eae7df',
  paperHover: '#dfdcd3',
  fieldBg: '#fbf9f4',
  ink: '#28323e',
  secondary: '#59616b',
  muted: '#74777b',
  line: '#c8c5bc',
  lineSoft: '#d8d5cc',
  controlLine: '#93918b',
  accent: '#9b6e35',
  accentInk: '#fffaf0',
  accentSoft: '#e8dbc5',
  accentText: '#805724',
  success: '#56765f',
  warning: '#9b6e35',
  danger: '#a35d50',
  dangerSoft: '#f5e6e0',
  codeBg: '#e7e6e1',
  codeInk: '#4c5661',
  scrim: 'rgba(26, 34, 44, 0.4)',
  shadow: '0 28px 65px rgba(30, 40, 55, 0.2), 0 1px 3px rgba(30, 40, 55, 0.1)',
  orbBg: '#ebe3d4',
  orbBgHover: '#f3ebdd',
  orbInk: '#a77a41',
  orbShadow: '0 6px 18px rgba(52, 43, 29, 0.2), inset 0 0 0 2px #b4a68c',
  love: '#c2607a',
  loveSoft: '#f8e3e8',
  loveInk: '#8f3f57',
  desire: '#8d6aa8',
  desireSoft: '#efe6f5',
  avatar1: '#d3ece0',
  avatar1Ink: '#2f5c4a',
  avatar2: '#d5e6f5',
  avatar2Ink: '#2c4d6b',
  avatar3: '#e6dbf2',
  avatar3Ink: '#4a3860',
  avatar4: '#f7e2cf',
  avatar4Ink: '#6a4526',
  avatar5: '#efebc8',
  avatar5Ink: '#57522a',
  avatar6: '#f7d9de',
  avatar6Ink: '#6b3540',
  avatar7: '#dfeccf',
  avatar7Ink: '#45602f',
  avatar8: '#dfe0f2',
  avatar8Ink: '#3e4166',
  radiusSm: '8px',
  radius: '10px',
  radiusLg: '10px',
  radiusXl: '14px',
};

export const 主题表: Record<主题模式, Record<主题Token, string>> = { dark: 深色, light: 白天 };

/**
 * 提示条的四个状态色。提示条底色随日夜切换, 所以这里取在两种纸面上都清楚的中间调。
 */
export const 提示条严重度: Record<'success' | 'info' | 'warning' | 'error', string> = {
  success: '#5b8c6a',
  info: '#7e98b3',
  warning: '#b78a48',
  error: '#b76d5f',
};

/** 贴边纸条不投影 */
export const 提示条阴影 = 'none';

/** 弹窗配色: 传给另一个 document 的 7 个值 */
export interface 弹窗配色 {
  bg: string;
  border: string;
  text: string;
  accent: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

/** 弹窗配色的键 → 传过去用的 CSS 变量名(设在弹窗容器上, 弹窗自己的样式里读) */
export const 弹窗变量: Record<keyof 弹窗配色, string> = {
  bg: '--bf-toast-bg',
  border: '--bf-toast-border',
  text: '--bf-toast-text',
  accent: '--bf-toast-accent',
  errorBg: '--bf-toast-error-bg',
  errorBorder: '--bf-toast-error-border',
  errorText: '--bf-toast-error-text',
};

/** 按当前主题给出弹窗配色 */
export function 取弹窗配色(mode: 主题模式): 弹窗配色 {
  const token = 主题表[mode] ?? 深色;
  return {
    bg: token.paper,
    border: token.line,
    text: token.ink,
    accent: token.accent,
    errorBg: token.dangerSoft,
    errorBorder: token.danger,
    errorText: token.ink,
  };
}

/** 主题变量还没送到弹窗时的兜底(深色) */
export const 弹窗兜底配色 = 取弹窗配色('dark');

/** token 名(驼峰) → CSS 变量名 */
function 变量名(token: string): string {
  return `--bf-${token.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`;
}

/** 某个主题的全部 CSS 变量 */
export function 取主题变量(mode: 主题模式): Record<string, string> {
  const 结果: Record<string, string> = {};
  for (const [token, value] of Object.entries(主题表[mode]))
    结果[变量名(token)] = value;
  return 结果;
}

/** 生成主题 CSS 文本: 深色挂 .bf-root, 白天用 .bf-root[data-theme='light'] 覆盖 */
export function 主题样式文本(): string {
  const 一段 = (选择器: string, mode: 主题模式) => {
    const 声明 = Object.entries(取主题变量(mode)).map(([name, value]) => `  ${name}: ${value};`).join('\n');
    return `${选择器} {\n${声明}\n}`;
  };
  return `${一段('.bf-root', 'dark')}\n\n${一段(".bf-root[data-theme='light']", 'light')}\n`;
}

const 样式ID = 'bf-theme-vars';
/** 把主题变量注入当前文档(模块加载时执行一次) */
function 注入主题样式(): void {
  if (typeof document === 'undefined' || document.getElementById(样式ID))
    return;
  const style = document.createElement('style');
  style.id = 样式ID;
  style.textContent = 主题样式文本();
  (document.head ?? document.documentElement).appendChild(style);
}
注入主题样式();
