// 剧情导演 · 风格 B「剧本批注」契约用例
//
// 为什么需要这个文件: 视觉改版最容易"改一次漂一次"—— 色值被抄回组件、圆角各写各的、
// 数字不等宽、动效乱加。这里把《风格B实现说明》的硬约束钉成可执行断言:
//   规范源码 = docs/mockups/剧情导演-风格对比.html 的 `.sB` 块(值照抄) + docs/剧情导演-前端改版-风格B实现说明.md
// 改版只动**呈现**: §6 那批行为(判据队列口径显示 / 状态条四态优先级 / E1 文案 / 零截断 / 尺寸)一并复查。
import { createPinia, setActivePinia } from 'pinia';
import { 深色, 白天, 取根变量, 悬浮球直径 } from '../src/剧情导演/主题';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;
import 运行状态源码 from '../src/剧情导演/球状态.ts?raw';

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

// 2026-11-12 P5 第二批：scoped 样式已搬到 悬浮球样式.scss —— 直接取那份（SFC 里只剩一个 src 引用）
const 样式原文 = vueSource__样式;
const 样式 = 样式原文.replace(/\/\*[\s\S]*?\*\//g, ''); // 注释里允许出现颜色名/中文, 不参与色值扫描
const 模板 = vueSource.slice(0, vueSource.indexOf('<script'));
const 令牌 = 深色 as Record<string, string>;
const 白天令牌 = 白天 as unknown as Record<string, string>;

function oklch(值: string) {
  const m = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(值.trim());
  return m ? { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]) } : null;
}

async function 主流程() {
  // -------------------------------------------------------------------------
  console.log('\n[B] ① 令牌: 暖墨纸面 + 唯一朱红 + 五档墨色');
  {
    check('两套主题键完全一致(视图 var() 两套都给得出)', Object.keys(深色), Object.keys(白天));
    for (const k of ['body', 'num', 'inkStrong', 'inkGhost']) {
      ok(`新令牌 ${k} 两套主题都有值`, !!令牌[k] && !!白天令牌[k]);
    }
    const 高饱和 = ['accent', 'accentStrong', 'accentDeep', 'seal', 'gold', 'good', 'ctlFill', 'ctlOn', 'focus'];
    const 越界 = Object.entries(令牌).filter(([k, v]) => {
      const p = oklch(v);
      return p && !高饱和.includes(k) && p.C > 0.02;
    });
    check('除朱红/gold/good 外全是"纸与墨"(彩度 ≤ 0.02)', 越界.map(x => x[0]), []);
    const 冷灰 = Object.entries(令牌).filter(([k, v]) => {
      const p = oklch(v);
      return p && !高饱和.includes(k) && (p.H < 60 || p.H > 100);
    });
    check('底色与墨色一律暖色相(hue 60–100, 旧冷灰 270 已清)', 冷灰.map(x => x[0]), []);
    for (const k of ['accent', 'accentStrong', 'accentDeep', 'seal']) {
      const p = oklch(令牌[k]);
      ok(`${k} 是那支朱红(hue 28 · 彩度 ≥ 0.14)`, !!p && p.H === 28 && p.C >= 0.14);
    }
    check('语义色分工: 警告=gold(85) 成功=good(148)', [oklch(令牌.gold)?.H, oklch(令牌.good)?.H], [85, 148]);
    check('白天不留旧冷灰', Object.values(白天令牌).some(v => / 270\)/.test(v)), false);
    for (const [名, token] of [['深色', 令牌], ['白天', 白天令牌]] as const) {
      check(`${名} 阴影只留一层(不双阴影)`, (token.shadow.match(/rgba\(/g) || []).length, 1);
    }
    for (const k of ['serif', 'body', 'num']) {
      ok(`${k} 只用本地字体栈(无 url/@import/远程)`, !/url\(|@import|https?:/.test(令牌[k]));
    }
    ok('body 显式含中文字体栈', 令牌.body.includes('Microsoft YaHei') && 令牌.body.includes('PingFang SC'));
    const 根 = 取根变量('dark');
    for (const v of ['--dj-ink-strong', '--dj-ink-ghost', '--dj-num', '--dj-body', '--dj-seal']) {
      ok(`取根变量生成 ${v}`, !!根[v]);
    }
    check('尺寸契约: 球 40×40', 悬浮球直径, 40);
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ② 样式块: scss / 零硬编码色 / 圆角 2px / 字号五级 / 等宽数字 / 动效只回答动作');
  {
    // 2026-11-12 P5 第二批：样式块搬到独立 scss —— 判据改成"用 scss + scoped + 指向那份文件"（意图不变）
  ok('样式用 scss + scoped, 且指向独立样式文件', /<style lang="scss" scoped src="\.\/悬浮球样式\.scss"><\/style>/.test(vueSource));
    ok('样式块确实很大(不是空断言)', 样式.length > 3000);
    const 硬色 = [...样式.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/g)].map(m => m[0]);
    check('CSS 里没有任何硬编码色值(颜色只在 主题.ts)', [...new Set(硬色)], []);
    ok('颜色一律走 var(--dj-*)', (样式.match(/var\(--dj-[a-z-]+\)/g) || []).length > 60);

    const 圆角 = [...样式.matchAll(/border-radius:\s*([^;]+);/g)].map(m => m[1].trim());
    const 允许圆角 = new Set(['var(--dj-radius)', 'var(--dj-radius) var(--dj-radius) 0 0', '1px', '1px 1px 0 0', '50%']);
    check('圆角只有 2px(及一角变体)与球的 50%', [...new Set(圆角)].filter(v => !允许圆角.has(v)), []);
    ok('圆角真的写了不少(≥8 处)', 圆角.length >= 8);

    const 字号 = [...样式.matchAll(/font-size:\s*([^;]+);/g)].map(m => m[1].trim()).filter(v => !v.includes('var('));
    const 允许字号 = new Set(['0', '10px', '10.5px', '11px', '11.5px', '12px', '12.5px', '17px']);
    check('字号收敛(不再有 12/13/14/20/22 混用)', [...new Set(字号)].filter(v => !允许字号.has(v)), []);
    ok('标题用衬线 + 17px + inkStrong', /\.dj-title \{[^}]*--dj-serif[^}]*17px[^}]*--dj-ink-strong/.test(样式));
    // A 方向（排练厅手稿）用户选定后：指标数字改**衬线** 17px —— 与稿子一致, 仍然是 tabular-nums
    ok('指标数字走 A 方向口径: 衬线 + 17px + 600 + 最强墨 + 等宽数字', /\.dj-metric b \{[^}]*var\(--dj-serif\)[^}]*17px[^}]*600[^}]*--dj-ink-strong[^}]*tabular-nums/.test(样式));

    ok('tabular-nums 成规模(指标/明细/张力/核验/指令/次要数字)', (样式.match(/tabular-nums/g) || []).length >= 5);
    ok('数字容器绑定 --dj-num', (样式.match(/var\(--dj-num\)/g) || []).length >= 2);
    ok('正文绑定 --dj-body', 样式.includes('var(--dj-body)'));

    const 时长 = [...样式.matchAll(/transition:[^;]*?(\d*\.?\d+)s/g)].map(m => Number(m[1]));
    check('动效时长全在 120–180ms', 时长.filter(t => t < 0.12 || t > 0.18), []);
    ok('确有动效(≥5 条 transition)', 时长.length >= 5);
    ok('prefers-reduced-motion 兜底全关', /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none !important/.test(样式));
    // 可观测性(规格 §3/§5)要求"编排中"有 1.6s 呼吸环、面板里有回扫进度条 —— 所以关键帧不是零, 而是**只有这两条**。
    const 动画声明 = [...样式.matchAll(/animation:\s*([^;!]+)/g)].map(m => m[1].trim()).filter(v => v !== 'none');
    const 关键帧 = [...new Set([...样式.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]))].sort();
    check('关键帧只有这四条: 呼吸 / 环旋转 / 刻度依次亮 / 进度回扫', 关键帧, ['dj-breathe', 'dj-orb-spin', 'dj-sweep', 'dj-tick']);
    ok('每条动画都点名上面四个关键帧之一且时长 1.6s', 动画声明.length >= 3 && 动画声明.every(v => /1\.6s/.test(v) && /dj-(breathe|orb-spin|tick|sweep)/.test(v)));
    ok('没有入场逐个淡入/扫描线之类多余动效(只有这四条功能性关键帧)', 关键帧.length === 4);
    const 投影 = [...样式.matchAll(/box-shadow:\s*([^;}]+)/g)].map(m => m[1].trim());
    check('没有外投影(面板阴影仍归 iframe; 球上的环只用 inset)', 投影.filter(v => !/^inset/.test(v) && v !== 'none'), []);
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ③ 硬约束: 无 vh / 不新增滚动容器 / 不脱流 / 零截断');
  {
    ok('一个 vh 都没有', !/\b\d*\.?\d+vh\b/.test(样式));
    check('min-height 零使用', (样式.match(/min-height/g) || []).length, 0);
    check('滚动容器不新增(仅既有的 .dj-body 与 .dj-pre)', (样式.match(/overflow:\s*auto/g) || []).length, 2);
    check('position: fixed 仍是既有的 1 处(根)', (样式.match(/position:\s*fixed/g) || []).length, 1);
    check('position: absolute 仍是既有的三处(球 / 面板 / 页签选中下划线伪元素 —— 一处都没新增)', (样式.match(/position:\s*absolute/g) || []).length, 3);
    ok('.dj-pre 保持 max-height + 可滚动(不用 hidden 裁正文)', /\.dj-pre \{[\s\S]*?max-height: 260px;\s*overflow:\s*auto/.test(样式));
    ok('.dj-body 可滚动(面板定高, 内容长时不裁)', /\.dj-body \{[^}]*overflow:\s*auto/.test(样式));
    ok('栅格允许列宽收缩(不产生横向滚动)', 样式.includes('minmax(0, 1fr)') && 样式.includes('min-width: 0'));
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ④ 图标: 内联 SVG(currentColor), 零依赖; 卡片头用 § 记号');
  {
    const 图标数 = (模板.match(/<svg class="i"/g) || []).length;
    ok('内联 SVG 图标成规模(≥8 个: 关闭/主题×2/空态×3/跳过/错误×3/成功×2)', 图标数 >= 8);
    ok('样式定义了 svg.i 且用 currentColor', /svg\.i \{[^}]*stroke: currentColor[^}]*fill: none/.test(样式));
    ok('标题栏图标 14px(其余 13px)', /\.dj-head svg\.i, \.dj-tabs svg\.i \{ width: 14px/.test(样式));
    ok('没有 fontawesome / 外部图标依赖(样式无 url()/@import, 模板无 <link)', !/fa-|fontawesome|@import|url\(/.test(样式) && !/<link|fontawesome/i.test(模板));
    ok('卡片头用 B 稿的 § 批注记号(不是图标)', /\.dj-card-h::before \{ content: '§'/.test(样式));
    ok('§ 记号用的是朱红', /\.dj-card-h::before[^}]*var\(--dj-(accent|seal)\)/.test(样式));
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ⑤ 语义色分工(危险=seal · 警告=gold · 成功=good · 离线/冷启动=inkFaint)');
  {
    ok('剧终/危险 = seal', /\.dj-status-over \{[^}]*border-left-color: var\(--dj-seal\)/.test(样式));
    ok('离线 ≠ 危险: 用 inkFaint(改版前是 seal)', /\.dj-status-off \{[^}]*border-left-color: var\(--dj-ink-faint\)/.test(样式));
    ok('冷启动 = inkFaint', /\.dj-status-cold \{[^}]*border-left-color: var\(--dj-ink-faint\)/.test(样式));
    ok('运行中 = good', /\.dj-status-on \{[^}]*border-left-color: var\(--dj-good\)/.test(样式));
    ok('警告 = gold', /\.dj-status-warn \{[^}]*border-left-color: var\(--dj-gold\)/.test(样式));
    ok('数据异常仍标红, 且红来自令牌(不再是 #e0574a)', /\.dj-metric \.dj-bad \{ color: var\(--dj-seal\)/.test(样式) && !/#e0574a/.test(vueSource));
    ok('重点卡(判据/指令)左边线是朱红', 样式.includes('.dj-card:has(.dj-metrics), .dj-card:has(.dj-pre)') && /border-left-color: var\(--dj-seal\)/.test(样式));
    ok('状态条有语义色圆点(伪元素, 不加 DOM)', /\.dj-status-h::before \{[^}]*border-radius: 50%/.test(样式));
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ⑥ 改版只动呈现: §6 必须保留的行为仍在');
  {
    ok('指标卡仍读 判据.明细 的队列数字', 模板.includes('已了结 {{ 指标.明细.累计了结 }}/{{ 指标.明细.累计埋设 }}'));
    ok('异常态仍显示 >100%? 并给原因', vueSource.includes("伏笔回收率异常 ? '>100%?'") && vueSource.includes('数据异常：累计了结'));
    ok('状态条四态优先级未回退(剧终最先判)', vueSource.indexOf("'over'") < vueSource.indexOf("'cold'"));
    ok('离线判断仍在冷启动之前', vueSource.indexOf('离线.value.自动暂停') < vueSource.indexOf("'cold'"));
    ok('冷启动/离线/运行三态文案未改', ['冷启动攒轮', '引擎离线', '上次编排成功于'].every(k => 运行状态源码.includes(k)));
    ok('E1 开关文案不变(回退语义)', vueSource.includes('优先写角色卡主世界书') && vueSource.includes('自动回退聊天世界书'));
    ok('接口设置那条"不要调小 max_token"的提示不变', vueSource.includes('16384') && vueSource.includes('60000'));
    ok('剧终二次确认入口不变', vueSource.includes('确认剧终结算') && vueSource.includes('待确认剧终'));
    ok('代码调整上面板接线不变', vueSource.includes('本轮代码规则触发') && 样式.includes('.dj-adjust-list'));
    check('面板默认尺寸未动(实现是 460×620, 说明书写的 522×628 是对比稿的示例宽)', [
      /面板宽: (\d+)/.exec(vueSource)?.[1],
      /面板高: (\d+)/.exec(vueSource)?.[1],
    ], ['460', '620']);
  }

  // -------------------------------------------------------------------------
  console.log('\n[B] ⑦ DOM 契约: 模板里用到的每个 dj-* 类名都还有样式规则(改名/漏写都会被抓)');
  {
    const 类名原文 =
      [...模板.matchAll(/class="([^"]*)"/g)].map(m => m[1]).join(' ') +
      ' ' + [...模板.matchAll(/:class="([^"]*)"/g)].map(m => m[1]).join(' ');
    const 用到的 = [...new Set((类名原文.match(/dj-[a-z0-9-]+/g) || []).map(s => s.replace(/-$/, '')))];
    const 没样式 = 用到的.filter(名 => !样式.includes(`.${名}`));
    check(`模板里 ${用到的.length} 个 dj-* 类名全部有对应规则`, 没样式, []);
    ok('类名集合够大(不是空断言)', 用到的.length >= 30);
    ok('悬浮球 class 与事件入口没动', 模板.includes('class="dj-orb"') && 模板.includes('@click="onOrbClick"') && 模板.includes('@pointerdown="onOrbPointerDown"'));
    ok('面板 class/ref/拖动入口没动', 模板.includes('class="dj-panel"') && 模板.includes('ref="panelRef"') && 模板.includes('@pointerdown="onPanelPointerDown"'));
    ok('根元素仍绑主题变量', 模板.includes('class="dj-root"') && 模板.includes(':style="根变量"'));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exitCode = 1;
}

await 主流程();
