// 剧情导演 · 配色 / 几何 / 层序的唯一来源。
// 面板 CSS 变量由 取根变量() 生成(视图绑在 .dj-root 内联样式上); 弹窗配色由 取弹窗配色() 生成;
// 球直径与层序各一处。样式表只写 var(...), 值对不上会被 tests 抓住。
export type 主题模式 = 'dark' | 'light';

/** 悬浮球直径(px): 球宽高、锚点偏移、外层 iframe 尺寸、弹条贴球定位都用它 */
export const 悬浮球直径 = 40;

export const 层序 = {
  面板阴影: 2147482997,
  提示条堆栈: 2147482998,
  更新弹条: 2147482999,
  球iframe: 2147483000,
  面板根: 2147483000,
  球: 4,
  面板: 3,
} as const;

export const 层序变量: Record<'面板根' | '球' | '面板', string> = {
  面板根: '--dj-z-root',
  球: '--dj-z-orb',
  面板: '--dj-z-panel',
};

/**
 * 面板 token: 键 → 值; CSS 变量名 = `--dj-` + 驼峰转短横线。
 *
 * **风格 B「剧本批注」**(2026-10-07, 规范源码 `docs/mockups/剧情导演-风格对比.html` 的 `.sB` 块):
 *  - 底色是**暖墨灰纸**(hue 60–75), 不再是冷灰(hue 270) —— 灰糊不成体系是改版起因;
 *  - **只允许一处高饱和**: 朱红(`accent`/`seal`, 编剧的红笔)。其余全是"纸与墨"的浓淡;
 *  - **语义色分工**(以前 `seal` 一词到底, 现在拆开): 危险/剧终/数据异常 = `seal`,
 *    警告/强度 = `gold`, 成功/已执行 = `good`, 离线/冷启动 = `inkFaint`;
 *  - **层次靠边线与留白**, 不靠阴影与圆角(圆角一律 2px), `shadow` 只留一层。
 *  新增四令牌(dsh 2026-10-07 追加授权): `body` 正文字体栈、`num` 等宽数字(数字容器必须 `font-variant-numeric: tabular-nums`)、
*    `inkStrong`(最强文字: 标题与指标数字)与 `inkGhost`(最弱文字: 标签与空态)—— B 稿的墨色层次靠这五档拉开。
 *  ⚠️ 视图里的 `var(--dj-*)` 靠键名绑定 —— **改值可以, 改键名不行**(会静默失联, 测试抓的是"用到的变量都有定义")。
 */
export const 深色 = {
  accent: 'oklch(0.55 0.16 28)',
  accentStrong: 'oklch(0.62 0.17 28)',
  accentDeep: 'oklch(0.45 0.14 28)',
  onAccent: 'oklch(0.97 0.01 60)',
  seal: 'oklch(0.58 0.19 28)',
  ink: 'oklch(0.9 0.012 75)',
  inkStrong: 'oklch(0.94 0.012 75)',
  inkGhost: 'oklch(0.47 0.012 65)',
  inkDim: 'oklch(0.72 0.014 75)',
  inkFaint: 'oklch(0.58 0.014 75)',
  bg: 'oklch(0.17 0.008 60)',
  panel: 'oklch(0.21 0.009 60)',
  raise: 'oklch(0.24 0.01 60)',
  hover: 'oklch(0.28 0.011 60)',
  line: 'oklch(0.3 0.01 60)',
  lineStrong: 'oklch(0.4 0.012 60)',
  gold: 'oklch(0.74 0.1 85)',
  good: 'oklch(0.7 0.09 148)',
  shadow: '0 22px 50px rgba(0, 0, 0, 0.6)',
  /* ---- 方向 A「排练厅手稿」的材质(纸纹/高光)与自绘控件层令牌(dsh 规格 §1.4-20 点名要的新增控件令牌) ---- */
  paper: 'repeating-linear-gradient(180deg, oklch(0.99 0 0 / 0.014) 0 1px, transparent 1px 4px)',
  sheen: 'radial-gradient(120% 120% at 32% 24%, oklch(0.99 0 0 / 0.14), oklch(0 0 0 / 0) 44%, oklch(0 0 0 / 0) 62%)',
  ctlTrack: 'oklch(0.28 0.01 62)',
  ctlFill: 'oklch(0.58 0.19 28)',
  ctlKnob: 'oklch(0.93 0.012 75)',
  ctlOn: 'oklch(0.34 0.07 28)',
  ctlOff: 'oklch(0.26 0.009 62)',
  focus: 'oklch(0.62 0.17 28)',
  listBg: 'oklch(0.245 0.011 62)',
  radius: '2px',
  s1: '4px',
  s2: '8px',
  s3: '12px',
  s4: '16px',
  s6: '24px',
  serif: "'Source Han Serif SC', 'Noto Serif SC', 'SimSun', serif",
  body: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif",
  num: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
};
export type 主题Token = keyof typeof 深色;

/** 白天: 同色相(hue 60–75)降饱和提亮 —— 不留旧冷灰; 朱红略压暗以压住白底上的对比 */
export const 白天: Record<主题Token, string> = {
  accent: 'oklch(0.5 0.18 28)',
  accentStrong: 'oklch(0.44 0.17 28)',
  accentDeep: 'oklch(0.6 0.15 28)',
  onAccent: 'oklch(0.98 0.01 60)',
  seal: 'oklch(0.52 0.18 28)',
  ink: 'oklch(0.26 0.012 60)',
  inkStrong: 'oklch(0.2 0.012 60)',
  inkGhost: 'oklch(0.66 0.01 75)',
  inkDim: 'oklch(0.42 0.014 60)',
  inkFaint: 'oklch(0.55 0.014 75)',
  bg: 'oklch(0.95 0.008 75)',
  panel: 'oklch(0.975 0.006 75)',
  raise: 'oklch(0.945 0.008 75)',
  hover: 'oklch(0.91 0.01 75)',
  line: 'oklch(0.86 0.01 75)',
  lineStrong: 'oklch(0.74 0.012 75)',
  gold: 'oklch(0.55 0.1 85)',
  good: 'oklch(0.5 0.09 148)',
  shadow: '0 18px 40px rgba(0, 0, 0, 0.18)',
  paper: 'repeating-linear-gradient(180deg, oklch(0.2 0 0 / 0.035) 0 1px, transparent 1px 4px)',
  sheen: 'radial-gradient(120% 120% at 32% 24%, oklch(1 0 0 / 0.9), oklch(1 0 0 / 0.2) 44%, oklch(1 0 0 / 0) 62%)',
  ctlTrack: 'oklch(0.88 0.01 75)',
  ctlFill: 'oklch(0.52 0.18 28)',
  ctlKnob: 'oklch(0.99 0.004 75)',
  ctlOn: 'oklch(0.9 0.05 28)',
  ctlOff: 'oklch(0.9 0.008 75)',
  focus: 'oklch(0.5 0.18 28)',
  listBg: 'oklch(0.985 0.005 75)',
  radius: '2px',
  s1: '4px',
  s2: '8px',
  s3: '12px',
  s4: '16px',
  s6: '24px',
  serif: "'Source Han Serif SC', 'Noto Serif SC', 'SimSun', serif",
  body: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif",
  num: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
};

export const 主题表: Record<主题模式, Record<主题Token, string>> = { dark: 深色, light: 白天 };

export interface 弹窗配色 {
  bg: string;
  border: string;
  text: string;
  accent: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

export const 弹窗变量: Record<keyof 弹窗配色, string> = {
  bg: '--dj-toast-bg',
  border: '--dj-toast-border',
  text: '--dj-toast-text',
  accent: '--dj-toast-accent',
  errorBg: '--dj-toast-error-bg',
  errorBorder: '--dj-toast-error-border',
  errorText: '--dj-toast-error-text',
};

const 弹窗专有: Record<主题模式, { errorBg: string; errorText: string }> = {
  dark: { errorBg: '#2a1413', errorText: '#ffe3de' },
  light: { errorBg: '#fbe9e7', errorText: '#8c3125' },
};

export function 取弹窗配色(mode: 主题模式): 弹窗配色 {
  const token = 主题表[mode] ?? 深色;
  const 专有 = 弹窗专有[mode] ?? 弹窗专有.dark;
  return {
    bg: token.panel,
    border: token.lineStrong,
    text: token.ink,
    accent: token.seal,
    errorBg: 专有.errorBg,
    errorBorder: token.seal,
    errorText: 专有.errorText,
  };
}

export const 弹窗兜底配色 = 取弹窗配色('dark');

function 变量名(token: string): string {
  return `--dj-${token.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`;
}

export function 取主题变量(mode: 主题模式): Record<string, string> {
  const 结果: Record<string, string> = {};
  for (const [token, value] of Object.entries(主题表[mode])) 结果[变量名(token)] = value;
  return 结果;
}

export function 取根变量(mode: 主题模式): Record<string, string> {
  return {
    ...取主题变量(mode),
    '--dj-orb-size': `${悬浮球直径}px`,
    [层序变量.面板根]: String(层序.面板根),
    [层序变量.球]: String(层序.球),
    [层序变量.面板]: String(层序.面板),
  };
}
