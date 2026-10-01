// 彼方 · 主题配色(候选12) —— 面板的 CSS 变量与跨 document 的弹窗配色必须是同一份来源
//
// 以前: CSS 里一套色值 + toastVars 从 DOM 反读一套 + 面板/弹窗各自再带一套手抄回退色, 改一个颜色要改三处,
// 漏了就是"弹窗和面板不是一个主题"。现在色值只在 theme.ts 里写一次。
// 这个用例直接读源码文本, 所以"某个 token 被用了却没定义"这类问题会在测试里就暴露, 不会等到界面上才发现。
import vueSource from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';
import toastSource from '../src/彼方_NPC幕后生命状态系统/toast.ts?raw';
import themeSource from '../src/彼方_NPC幕后生命状态系统/theme.ts?raw';
import { 主题样式文本, 主题表, 取弹窗配色, 弹窗变量 } from '../src/彼方_NPC幕后生命状态系统/theme';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

const 深色token = 主题表.dark;
const 白天token = 主题表.light;
const 面板CSS = 主题样式文本();

/** 从一段文本里取出所有用到的 CSS 变量名(含 var(...) 与 setProperty('...')) */
function 用到的变量(文本: string): Set<string> {
  const 结果 = new Set<string>();
  for (const m of 文本.matchAll(/var\(\s*(--bf-[\w-]+)/g))
    结果.add(m[1]);
  for (const m of 文本.matchAll(/setProperty\(\s*['"](--bf-[\w-]+)['"]/g))
    结果.add(m[1]);
  return 结果;
}
/** 从生成的 CSS 文本里取出声明过的变量名 */
function 声明过的变量(文本: string): Set<string> {
  const 结果 = new Set<string>();
  for (const m of 文本.matchAll(/^\s*(--bf-[\w-]+)\s*:/gm))
    结果.add(m[1]);
  return 结果;
}

console.log('\n[1] 深色/白天两套 token 键完全一致, 且都有值');
{
  check('键一致', Object.keys(深色token).sort(), Object.keys(白天token).sort());
  ok('token 数量够用(≥25)', Object.keys(深色token).length >= 25);
  ok('没有空值', [...Object.values(深色token), ...Object.values(白天token)].every(v => typeof v === 'string' && v.length > 0));
}

console.log('\n[2] 生成的 CSS: 两段, 深色挂 .bf-root, 白天用 [data-theme=\'light\'] 覆盖');
{
  ok('有深色段', 面板CSS.includes('.bf-root {'));
  ok('有白天段', 面板CSS.includes(".bf-root[data-theme='light'] {"));
  const 声明 = 声明过的变量(面板CSS);
  check('变量个数 = token 数 × 2(两套主题)', 声明.size, Object.keys(深色token).length);
  const 短横线 = (名字: string) => `--bf-${名字.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
  for (const [mode, token] of [['深色', 深色token], ['白天', 白天token]] as const) {
    const 缺失的 = Object.entries(token).filter(([名字, 值]) => !面板CSS.includes(`${短横线(名字)}: ${值};`)).map(([名字]) => 名字);
    check(`${mode}主题每个 token 的值都出现在生成的 CSS 里`, 缺失的, []);
  }
  ok('抽查深色强调色', 面板CSS.includes('--bf-accent: #f0b45a;'));
  ok('抽查白天卡片底色', 面板CSS.includes('--bf-card: #ffffff;'));
}

console.log('\n[3] 弹窗配色: 7 项都来自面板 token, 两套主题都完整');
{
  for (const mode of ['dark', 'light'] as const) {
    const 配色 = 取弹窗配色(mode);
    const token = 主题表[mode];
    ok(`${mode}: 7 项都有值`, Object.values(配色).every(v => typeof v === 'string' && v.length > 0));
    check(`${mode}: 底色取面板卡片色`, 配色.bg, token.card);
    check(`${mode}: 文字色取面板文字色`, 配色.text, token.text);
    check(`${mode}: 强调色取面板强调色`, 配色.accent, token.accent);
    check(`${mode}: 边框取面板描边色`, 配色.border, token.borderStrong);
    check(`${mode}: 错误边框取面板危险色`, 配色.errorBorder, token.danger);
  }
  check('深色与白天的弹窗底色不同', 取弹窗配色('dark').bg === 取弹窗配色('light').bg, false);
}

console.log('\n[4] 弹窗变量名: 7 个, 互不相同, 都带 --bf-toast- 前缀');
{
  const 名字 = Object.values(弹窗变量);
  check('7 个', 名字.length, 7);
  check('互不相同', new Set(名字).size, 7);
  ok('都带前缀', 名字.every(n => n.startsWith('--bf-toast-')));
}

console.log('\n[5] 面板/弹窗用到的每个变量都有定义(防"用了却没定义"的 token)');
{
  const 允许 = new Set([...声明过的变量(面板CSS), ...Object.values(弹窗变量)]);
  const 用到 = new Set([...用到的变量(vueSource), ...用到的变量(toastSource)]);
  const 没定义 = [...用到].filter(n => !允许.has(n)).sort();
  check('用了但没定义的变量', 没定义, []);
  ok('面板源码里确实在用主题变量(不是为了通过而没东西可查)', 用到.size >= 20);
}

console.log('\n[6] 色值不再散落: 界面与弹窗源码里不再自己声明/反读主题色');
{
  const 自己声明的 = [...vueSource.matchAll(/--bf-[\w-]+\s*:/g)].map(m => m[0]);
  check('界面源码里没有 --bf-x: 值 形式的声明', 自己声明的, []);
  ok('界面不再从 DOM 反读主题色(getComputedStyle)', !vueSource.includes('getComputedStyle'));
  ok('弹窗源码里也没有手抄的 --bf-toast-x 字面量', !/--bf-toast-[\w-]+/.test(toastSource));
  ok('弹窗源码用的是 theme.ts 给的变量名', toastSource.includes("from './theme'"));
}

console.log('\n[7] 悬浮球直径只有一处: 球宽高 / 锚点偏移 / 提示条贴球定位必须是同一个数');
{
  const 直径 = Number(/export const 悬浮球直径 = (\d+)/.exec(themeSource)?.[1]);
  ok('theme.ts 里定义了一个正数直径', Number.isFinite(直径) && 直径 > 0);
  ok('弹窗侧从 theme 取直径, 不再自己写死(曾经 28)', toastSource.includes('悬浮球直径') && !toastSource.includes('ORB_SIZE'));
  ok('弹窗侧用直径的一半贴球(球心 → 球边)', /悬浮球直径 \/ 2/.test(toastSource));
  ok('视图侧从 theme 取直径, 不再自己写死(曾经 40)', vueSource.includes('const CLOSED_SIZE = 悬浮球直径'));
  const 球 = /\.bf-orb \{[\s\S]*?width:\s*(\d+)px;[\s\S]*?height:\s*(\d+)px;/.exec(vueSource);
  check('.bf-orb 宽高 = 直径(CSS 写不出变量引用, 只能靠这条钉住)', [Number(球?.[1]), Number(球?.[2])], [直径, 直径]);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
