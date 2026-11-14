// 剧情导演 · 界面重做（方向 A · 排练厅手稿）控件层契约 —— 规格 §1.1–1.5 + §1.3bis
//
// 为什么单独一份：上一轮（风格 B）失败的根因就是「**只改令牌、没碰控件层**」——
// 用户点名"连滑动条和勾选按钮都还是原生的"。所以这份用例专门钉住"**零原生控件**"与球标，
// 而不是再验一遍颜色。
import { createPinia, setActivePinia } from 'pinia';
import { 深色, 白天, 取根变量 } from '../src/剧情导演/主题';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;
import 气泡源 from '../src/剧情导演/球气泡.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}
const 令牌 = 深色 as Record<string, string>;
const 白天令牌 = 白天 as unknown as Record<string, string>;
// 2026-11-12 P5 第二批：scoped 样式已搬到 悬浮球样式.scss（SFC 里只剩 src 引用）
const 样式原文 = vueSource__样式;
const 样式 = 样式原文.replace(/\/\*[\s\S]*?\*\//g, '');
const 模板 = vueSource.slice(0, vueSource.indexOf('<script'));

console.log('\n[C] ① 零原生控件：滑块 / 勾选 / 下拉 / 折叠 / 滚动条 / 选区与焦点环');
{
  ok('滑块: appearance:none（两种前缀都写）', /\.dj-ctl-range \{-webkit-appearance: none; appearance: none|\.dj-ctl-range \{\s*-webkit-appearance: none;\s*appearance: none/.test(样式));
  check(
    '滑块: webkit 轨道/滑块 + moz 轨道/已填充段/滑块 五件套齐全',
    ['::-webkit-slider-runnable-track', '::-webkit-slider-thumb', '::-moz-range-track', '::-moz-range-progress', '::-moz-range-thumb'].filter(k => !样式.includes(k)),
    [],
  );
  ok('滑块: 有刻度与实时读数（不是光秃秃一条）', 模板.includes('dj-ctl-ticks') && 模板.includes('dj-ctl-readout'));
  ok('滑块: 焦点环 + 禁用态都有', /\.dj-ctl-range:focus-visible/.test(样式) && /\.dj-ctl-range:disabled/.test(样式));
  check(
    '页面里已经没有原生 select / option / details / summary / datalist',
    [/<select/, /<option/, /<details/, /<summary/, /datalist/].map(r => r.test(vueSource)),
    [false, false, false, false, false],
  );
  // 勾选的数量不是契约本身 —— "每个 checkbox 都必须是自绘 switch"才是。
  // 所以先数出实际个数, 再断言**全部**都带 role=switch + 自绘轨道 + :aria-checked(数量随功能增加, 语义不许退化)。
  const 勾选数 = (模板.match(/<input type="checkbox"/g) || []).length;
  ok(`勾选: 有 ${勾选数} 个 input 仍是 checkbox（语义没丢；含总开关）`, 勾选数 >= 12);
  ok(
    `勾选: 每个 checkbox 都带 role=switch 且紧跟自绘轨道（${勾选数}/${勾选数}）`,
    (模板.match(/<input type="checkbox"[^>]*role="switch"/g) || []).length === 勾选数 && (模板.match(/dj-ctl-sw/g) || []).length >= 勾选数,
  );
  ok('勾选: 外观完全自绘（轨道+拨片，:checked/:focus-visible/:disabled 都有态）', /\.dj-ctl-sw \{/.test(样式) && /input:checked \+ \.dj-ctl-sw/.test(样式) && /input:focus-visible \+ \.dj-ctl-sw/.test(样式) && /input:disabled \+ \.dj-ctl-sw/.test(样式));
  // dsh 2026-10-07：role="switch" 必须配 aria-checked，否则读屏拿到的是"开关但不知开没开"
  check(`每个自绘开关都带 :aria-checked（绑到 v-model，点击即 true/false；${勾选数} 个）`, (模板.match(/:aria-checked="!![^"]+"/g) || []).length, 勾选数);
  ok('aria-checked 绑的是对应那个 v-model（不是写死的 true）', /:aria-checked="!!设置\.导演\.自动接管"/.test(模板) && /:aria-checked="!!设置\.接口\.流式"/.test(模板) && /:aria-checked="!!设置\.启用导演"/.test(模板));
  ok('下拉: 自绘 listbox 的语义齐（aria-haspopup / aria-expanded / role=option）', 模板.includes('aria-haspopup="listbox"') && 模板.includes(':aria-expanded=') && (模板.match(/role="option"/g) || []).length >= 4);
  ok('下拉: **就地展开**（下拉相关规则里没有 position:absolute）', !/\.dj-ctl-dd[^{]*\{[^}]*position: absolute/.test(样式) && !/\.dj-ctl-list[^{]*\{[^}]*position: absolute/.test(样式));
  ok('下拉: 键盘可用（button 可聚焦 + Esc 关闭）', 模板.includes('@keydown.esc="打开的下拉 = \'\'"') && 模板.includes('@keydown.enter.prevent="选下拉('));
  ok('折叠: 自绘 caret 规则在', /\.dj-ctl-disc \{/.test(样式));
  ok('折叠: body 默认收起（max-height:0）', /\.dj-ctl-disc-body \{[\s\S]{0,260}max-height: 0/.test(样式));
  ok('折叠: 展开态用 .open 类', /\.dj-ctl-disc-body\.open \{/.test(样式));
  ok('折叠: 模板是自绘按钮 + aria-expanded（无原生折叠元素）', 模板.includes('class="dj-ctl-disc"') && 模板.includes(':aria-expanded="展开集.includes(') && 模板.includes('@click="切展开('));
  ok('滚动条: scrollbar-width/color + webkit 三件套（轨道/滑块/悬停）', 样式.includes('scrollbar-width: thin') && 样式.includes('scrollbar-color:') && 样式.includes('::-webkit-scrollbar-thumb') && 样式.includes('::-webkit-scrollbar-track') && /::-webkit-scrollbar-thumb:hover/.test(样式));
  ok('选区与全局焦点环（不许浏览器默认蓝框）', 样式.includes('::selection') && 样式.includes(':focus-visible'));
  ok('数字框的原生转轮也去掉了', 样式.includes('appearance: textfield') && 样式.includes('::-webkit-inner-spin-button'));
}

console.log('\n[C] ② 球标 = 场次刻度（自绘 SVG · 形态五态不变）');
{
  ok('球标是画出来的（内联 SVG + 三条刻度路径）', 模板.includes('class="dj-mark"') && 模板.includes('class="dj-tk dj-tk1"') && 模板.includes('class="dj-tk dj-tk2"') && 模板.includes('class="dj-tk dj-tk3"'));
  check('球里再没有汉字球标', /<span class="dj-orb-glyph">[^<]*[\u4e00-\u9fa5]/.test(模板), false);
  ok('单色描边 1.6px + currentColor', /svg\.dj-mark \{[\s\S]{0,160}stroke: currentColor[\s\S]{0,80}stroke-width: 1\.6/.test(样式));
  ok('球标宽取球的 47%（40×40 实机约 18.8px）', /\.dj-orb-glyph \{[\s\S]{0,220}width: 47%/.test(样式));
  ok('环与球标用 CSS Grid 叠层（各占 grid-area:1/1），不是 absolute 叠', /\.dj-orb-ring \{[\s\S]{0,140}grid-area: 1 \/ 1/.test(样式) && /\.dj-orb-glyph \{[\s\S]{0,140}grid-area: 1 \/ 1/.test(样式));
  ok('五态里球标形态不变（没有被某态隐藏/替换）', !/data-态='[^']+'\] \.dj-orb-glyph \{[^}]*display: none/.test(样式) && !/data-态='[^']+'\] \.dj-mark \{[^}]*d:/.test(样式));
  ok('编排中：三根刻度依次亮（0.18s / 0.36s 延迟）', /\.dj-tk2 \{ animation-delay: 0\.18s/.test(样式) && /\.dj-tk3 \{ animation-delay: 0\.36s/.test(样式));
  ok('信息气泡挂父页面 DOM（球自己的 40×40 iframe 装不下）', 气泡源.includes('window.parent') && 气泡源.includes('dj-orb-tip') && vueSource.includes("from './球气泡'"));
  ok('气泡不抢点击（pointer-events:none）', 气泡源.includes('pointer-events:none'));
}

console.log('\n[C] ③ 方向 A 的材质 / 层级 / 栅格 / 克制');
{
  ok('纸面细纹来自令牌（不在样式里写死渐变）', 样式.includes('var(--dj-paper)') && !!令牌.paper && !!白天令牌.paper);
  ok('球体高光来自令牌', 样式.includes('var(--dj-sheen)') && !!令牌.sheen);
  ok('衬线标题 + 衬线数字（A 的手稿味）', /\.dj-title \{[^}]*var\(--dj-serif\)/.test(样式) && /\.dj-metric b \{[^}]*var\(--dj-serif\)/.test(样式));
  // 规则体取出来按"包含全部片段"判断（声明顺序不该影响结论）
  const 规则体 = (选择器: string) => new RegExp(选择器.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(样式)?.[1] ?? '';
  const 含全部 = (体: string, 片段: string[]) => 片段.every(f => 体.includes(f));
  ok('四级层级 L1 标题：衬线 + 字号 + 字重 + 最亮墨 + 字距（四维同变）', 含全部(规则体('.dj-title'), ['var(--dj-serif)', 'font-size: 17px', 'font-weight: 600', 'letter-spacing: 0.5px', 'var(--dj-ink-strong)']));
  // 第二轮方案 5.4(真机走查): 分组标题原来 11.5px + 次级墨, 比正文(12.5px 主墨)还小还暗 → 扫视抓不到分区;
  // 说明原来 10.5px + 最弱墨, 设置页大段依赖它却读不清。改为: 分组 = 正文同号 + 衬线 + 最亮墨; 说明提一档。
  ok('四级层级 L2 分组：与正文同号 + 衬线 + 600 + 最亮墨(比正文强)', 含全部(规则体('.dj-card-h'), ['font-size: 12.5px', 'var(--dj-serif)', 'font-weight: 600', 'var(--dj-ink-strong)']));
  ok('四级层级 L3 正文：12.5px + 主墨 + 行高', 含全部(规则体('.dj-p'), ['font-size: 12.5px', 'var(--dj-ink)', 'line-height: 1.55']));
  ok('四级层级 L4 说明：11.5px + 次级墨(比原来提一档)', 含全部(规则体('.dj-hint'), ['font-size: 11.5px', 'var(--dj-ink-dim)', 'letter-spacing: 0.1px']));
  ok('间距走 4px 栅格变量（>=30 处）', (样式.match(/var\(--dj-s[1-6]\)/g) || []).length >= 30);
  ok('没有 8/12/16/20/24px 这类手写间距', !/(?:padding|gap|margin(?:-\w+)?):\s*(?:8|12|16|20|24)px/.test(样式));
  ok('朱红克制：没有任何"填充朱红"的按钮（比"只 1 处"更克制）', !/\.dj-btn[^{]*\{[^}]*background: var\(--dj-seal\)/.test(样式));
  ok('等宽数字仍成规模（tabular-nums）', (样式.match(/tabular-nums/g) || []).length >= 5);
}

console.log('\n[C] ④ 令牌与红线');
{
  const 新令牌 = ['paper', 'sheen', 'ctlTrack', 'ctlFill', 'ctlKnob', 'ctlOn', 'ctlOff', 'focus', 'listBg', 'radius', 's1', 's2', 's3', 's4', 's6'];
  check('新增令牌两套主题都有值', 新令牌.filter(k => !令牌[k] || !白天令牌[k]), []);
  const 根 = 取根变量('dark');
  ok('取根变量给得出控件令牌', !!根['--dj-ctl-track'] && !!根['--dj-focus'] && !!根['--dj-s3'] && !!根['--dj-radius'] && !!根['--dj-paper']);
  ok('零硬编码色（颜色只在 主题.ts）', !/(#[0-9a-fA-F]{3,8}\b)|rgba?\(|hsla?\(|oklch\(/.test(样式));
  check('vh 零处', /vh/.test(样式), false);
  check('position: absolute 仍是既有的三处（一处未新增）', (样式.match(/position: absolute/g) || []).length, 3);
  check('滚动容器不新增（仅 .dj-body 与 .dj-pre）', (样式.match(/overflow:\s*auto/g) || []).length, 2);
  ok('零截断：.dj-pre 保持可滚动（不用 hidden 裁正文）', /\.dj-pre \{[\s\S]{0,320}max-height: 260px;\s*overflow: auto/.test(样式));
  ok('旧类名延续（dj-check / dj-select 没被改名）', 模板.includes('class="dj-check"') && 模板.includes('dj-select'));
  ok('球仍按 --dj-orb-size 定位（position:absolute + 宽高来自令牌）', /\.dj-orb \{[\s\S]{0,120}position: absolute[\s\S]{0,200}width: var\(--dj-orb-size/.test(样式));
}

console.log('\n[C] ⑤ 规格 §1.1bis：文本类输入一律主题化（**不看类名**）');
{
  // 起因：用户实机发现「接口的地址、密钥居然还是原生的，都还是白的」——
  // 旧规则只挂在 .dj-input 类上，地址/密钥/8 个 number 都没类名 ⇒ 落回 UA 默认（白底 + 灰框 + 21.2px 高）。
  ok('文本类输入由**元素上下文**接管（排除自绘的 checkbox/range）', /\.dj-root input:not\(\[type='checkbox'\]\):not\(\[type='range'\]\)/.test(样式));
  ok('textarea 也一并接管（将来加多行输入不会漏）', /\.dj-root textarea \{/.test(样式));
  ok('背景/描边/字色全走令牌（不再是 UA 的 rgb(255,255,255) + rgb(118,118,118)）', /\.dj-root input:not\(\[type='checkbox'\]\):not\(\[type='range'\]\),[\s\S]{0,320}background: var\(--dj-bg\)[\s\S]{0,220}border: 1px solid var\(--dj-line\)[\s\S]{0,220}color: var\(--dj-ink\)/.test(样式));
  ok('appearance 归零（两种前缀）', /appearance: none;/.test(样式) && /-webkit-appearance: none;/.test(样式));
  ok('number 原生转轮去掉', /input\[type='number'\] \{ appearance: textfield/.test(样式) && 样式.includes('::-webkit-inner-spin-button'));
  ok('::placeholder 用弱墨令牌', /::placeholder \{ color: var\(--dj-ink-ghost\)/.test(样式));
  ok(':disabled 降透明', /not\(\[type='range'\]\):disabled/.test(样式));
  ok(':focus-visible 光环覆盖（全局规则管得到输入）', /\.dj-root :focus-visible \{/.test(样式));
  const 裸输入 = (模板.match(/<input(?![^>]*\bclass=)/g) || []).length;
  ok(`面板里还有 ${裸输入} 个**没类名**的 input（地址/密钥/8 个 number）—— 靠元素级选择器兜底`, 裸输入 >= 10);
  ok('样式里没有任何 UA 白底/灰框色值', !/#fff\b|#ffffff|rgb\(255,\s*255,\s*255\)|rgb\(118,\s*118,\s*118\)/i.test(样式));
  ok('.dj-field.inline input 的 90px 收窄仍然生效（优先级更高）', /\.dj-field\.inline input \{ width: 90px/.test(样式));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
