// 共用 · 面板机制几何 —— 批次 2026-11-20（需求方 #547 第 0 步）
//
// ═══════════════════════════════════════════════════════════════════════════
// 这个文件为什么存在
// ═══════════════════════════════════════════════════════════════════════════
//
//  需求方的第 0 步原话：
//
//  > 我给你的第一道闸是"扩完内核后，烟火/导演的测试必须一条不变"。
//  > 复查核出来：**那些测试压根不测几何，这条闸是空的。**
//
//  核实过，确实如此：
//
//  | 东西 | 现状 |
//  |---|---|
//  | `applyFrame()` | **从未被任何测试执行过** |
//  | 烟火 `面板宽 880` | 全仓搜 "880" 零命中 → 改了不红 |
//  | `clip-path` | 只有两个子串断言 → 改 pad/r/M 起点，保留子串就不红 |
//  | 偏好落盘时机 | 无任何测试 |
//
//  **也就是说：现在动内核，改坏了三家一起坏，而测试会全绿。**
//
// ═══════════════════════════════════════════════════════════════════════════
// 怎么在 Node 里跑起来（这一段踩了两次坑，写下来）
// ═══════════════════════════════════════════════════════════════════════════
//
//  `使用面板机制` 用的是 Vue 组合式 API（`ref` / `computed` / `watch` / `onMounted`）。
//  Node 里没有 DOM，所以要先造桩，**再用 `createApp` 真挂一个组件** ——
//  这样 `onMounted` / `onUnmounted` / `watch` 全都是真的。
//
//  ⚠ **坑 1：全局桩必须在 import vue 之前装好。**
//    Vue 的 runtime-dom 在**模块加载那一刻**就捕获了 `document`：
//    `const doc = typeof document !== 'undefined' ? document : null`。
//    如果先 `import { createApp } from 'vue'` 再装桩，`doc` 已经是 null，
//    `app.mount()` 会在 `doc.createElement(...)` 上炸（本文件第一版就这样）。
//    → 所以本文件用**动态 `await import()`**，桩装完再加载 vue。
//
//  ⚠ **坑 2：不要手工调 `onMounted` 的回调。**
//    那样测的不是真生命周期，而且 Vue 的 `watch` 不会 flush。
//    必须真 `createApp(...).mount(...)`。
//
// ═══════════════════════════════════════════════════════════════════════════
// 判据分两类
// ═══════════════════════════════════════════════════════════════════════════
//
//  · **逐项断言当前值**（不是"包含某子串"）—— 关态 left/top/width/height、
//    borderRadius、clipPath、frameOrigin；开态联合矩形四个边、borderRadius、
//    **clip-path 完整字符串**；orbStyle 三态；偏好落盘的次数与内容。
//  · **用两家真实配置各跑一遍**（烟火 880×620 / 导演 460×620），把当前值写死成基准。
//
//  本文件的存在意义是：**接下来要动的，正好是三家共用、而测试完全没覆盖的那部分。**

// ═══════════════════════════════════════════════════════════════════════════
// ① 先装全局桩（必须在 import vue 之前）
// ═══════════════════════════════════════════════════════════════════════════

/** 一个能被观察 style 的元素桩 */
function 造元素(标签 = 'div'): any {
  const el: any = {
    tagName: 标签.toUpperCase(),
    style: {} as Record<string, string>,
    children: [] as any[],
    isConnected: true,
    nodeType: 1,
    get ownerDocument() {
      return (globalThis as any).document;
    },
    appendChild(child: any) {
      this.children.push(child);
      child.parentNode = this;
      child.isConnected = true;
      return child;
    },
    insertBefore(child: any, ref: any) {
      const i = this.children.indexOf(ref);
      if (i < 0)
        this.children.push(child);
      else
        this.children.splice(i, 0, child);
      child.parentNode = this;
      child.isConnected = true;
      return child;
    },
    removeChild(child: any) {
      this.children = this.children.filter((c: any) => c !== child);
      child.parentNode = null;
      child.isConnected = false;
      return child;
    },
    remove() {
      this.isConnected = false;
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((c: any) => c !== this);
        this.parentNode = null;
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    closest() {
      return null;
    },
  };
  return el;
}

/** 装 DOM 桩。**必须在 import vue 之前调用。** */
function 装全局桩(): void {
  const g: any = globalThis as any;

  const body = 造元素('body');
  const doc: any = {
    body,
    createElement: (标签: string) => 造元素(标签),
    createElementNS: (_ns: string, 标签: string) => 造元素(标签),
    createTextNode: (t: string) => ({ nodeValue: t, nodeType: 3 }),
    createComment: (t: string) => ({ nodeValue: t, nodeType: 8 }),
    createDocumentFragment: () => 造元素('#fragment'),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    defaultView: null as any,
  };

  const win: any = {
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1440,
    innerHeight: 900,
    setTimeout: (fn: any) => { void fn; return 0; },
    clearTimeout() {},
    // 内核的 onMounted 用 `window.setInterval` 做慢轮询兜底
    setInterval: (fn: any) => { void fn; return 0; },
    clearInterval() {},
    requestAnimationFrame: (fn: any) => { void fn; return 0; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ borderRadius: '12px', getPropertyValue: () => '' }),
  };
  doc.defaultView = win;

  g.document = doc;
  g.window = win;
  // ⚠ `navigator` 在 Node 里是只读 getter，不能赋值（会抛 TypeError）。
  //    Vue 只在极少数分支读它，当前内核用不到，跳过。
  g.ShadowRoot = class {
    mode = 'open';
  };
  g.Node = class {
    nodeType = 1;
  };
  g.Element = class {
    nodeType = 1;
  };
  g.SVGElement = class {
    nodeType = 1;
  };
  g.HTMLElement = class {
    nodeType = 1;
  };
  g.getComputedStyle = () => ({ borderRadius: '12px', getPropertyValue: () => '' });
  g.requestAnimationFrame = (fn: any) => { void fn; return 0; };
  g.cancelAnimationFrame = () => {};
  g.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
}

装全局桩();

// ═══════════════════════════════════════════════════════════════════════════
// ② 桩装好之后才加载 vue 与内核
// ═══════════════════════════════════════════════════════════════════════════

const { createApp, defineComponent, h, nextTick, shallowRef } = await import('vue');
const { 使用面板机制 } = await import('../src/共用/面板机制');

// ═══════════════════════════════════════════════════════════════════════════
// ③ 断言工具
// ═══════════════════════════════════════════════════════════════════════════

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ 跑一次内核
// ═══════════════════════════════════════════════════════════════════════════

/** 造 iframe 桩 —— 断言主要看它的 style */
function 造iframe() {
  return {
    style: {} as Record<string, string>,
    isConnected: true,
    // 内核的 `取收纳坞入口` 会读这些属性来判断"球有没有被收纳坞收走"
    id: 'test-orb-iframe',
    getAttribute: () => null,
    setAttribute() {},
    removeAttribute() {},
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 }),
    ownerDocument: { querySelector: () => null },
  };
}

/** 造"酒馆页面"窗口（parentWin） */
function 造父窗口(宽: number, 高: number) {
  const body = 造元素('body');
  const doc: any = {
    body,
    createElement: (标签: string) => 造元素(标签),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const win: any = {
    innerWidth: 宽,
    innerHeight: 高,
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn: any) => { void fn; return 0; },
    clearTimeout() {},
    requestAnimationFrame: (fn: any) => { void fn; return 0; },
  };
  doc.defaultView = win;
  return { win, doc };
}

interface 跑结果 {
  面板: any;
  卸载: () => void;
  写次数: () => number;
  写内容: () => any[];
  iframe: any;
}

async function 跑一次(配置: {
  名: string;
  面板类名: string;
  球直径: number;
  面板宽: number;
  面板高: number;
  视口: { 宽: number; 高: number };
  预置存储?: any;
  /** 2026-11-20 C7 新增的可选配置 */
  面板布局?: 'joint' | 'fullscreen' | 'capped';
  打开态球?: '跟随锚点' | '贴边书签';
  球高度?: number;
  面板上限宽?: number;
  面板上限高?: number;
}): Promise<跑结果> {
  const { win: 父窗口 } = 造父窗口(配置.视口.宽, 配置.视口.高);
  const iframe = 造iframe();

  const 写记录: any[] = [];
  let 当前存储: any = 配置.预置存储 ?? null;
  // ⚠ 必须用 `shallowRef`：`ref` 会深层响应式包装整个面板对象，
  //    `orbStyle` / `panelStyleRef` 这些 computed 会被 **自动解包**（拿到的是值不是 ref），
  //    于是 `r.面板.orbStyle.value` 变成 undefined。`shallowRef` 不包装，保持原样。
  const 面板 = shallowRef<any>(null);

  const 组件 = defineComponent({
    setup() {
      const p = 使用面板机制({
        面板类名: 配置.面板类名,
        阴影变量: '--test-shadow',
        球直径: 配置.球直径,
        阴影层序: 100,
        面板宽: 配置.面板宽,
        面板高: 配置.面板高,
        提示条: {
          取配色: () => ({ 背景: '#000', 文字: '#fff', 边框: '#333', 强调: '#888' }),
          设配色: () => {},
          设锚点: () => {},
        },
        存储: {
          读全局: () => 当前存储,
          写全局: (值: any) => {
            当前存储 = JSON.parse(JSON.stringify(值));
            写记录.push(JSON.parse(JSON.stringify(值)));
          },
          读本地: () => null,
          写本地: () => {},
        },
        // 2026-11-20 C7：新增可选配置（不传时走老分支）
        ...(配置.面板布局 ? { 面板布局: 配置.面板布局 } : {}),
        ...(配置.打开态球 ? { 打开态球: 配置.打开态球 } : {}),
        ...(配置.球高度 ? { 球高度: 配置.球高度 } : {}),
        ...(配置.面板上限宽 ? { 面板上限宽: 配置.面板上限宽 } : {}),
        ...(配置.面板上限高 ? { 面板上限高: 配置.面板上限高 } : {}),
      });
      面板.value = p;
      // rootEl 要指向一个"ownerDocument.defaultView = frameWin"的元素；
      // 内核靠它拿 frameWin → frame（iframe）→ parentWin。
      p.rootEl.value = {
        ownerDocument: {
          defaultView: Object.assign(Object.create(父窗口), {
            frameElement: iframe,
            parent: 父窗口,
          }),
        },
      };
      return () => h('div');
    },
  });

  const app = createApp(组件);
  const 挂载点 = 造元素('div');
  app.mount(挂载点);
  await nextTick();
  await nextTick();

  return {
    面板: 面板.value,
    卸载: () => app.unmount(),
    写次数: () => 写记录.length,
    写内容: () => 写记录,
    iframe,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ 两家的真实配置
// ═══════════════════════════════════════════════════════════════════════════

const 烟火配置 = {
  名: '烟火',
  面板类名: 'yh-panel',
  球直径: 44,
  面板宽: 880,
  面板高: 620,
  视口: { 宽: 1440, 高: 900 },
};

const 导演配置 = {
  名: '导演',
  面板类名: 'dj-panel',
  球直径: 44,
  面板宽: 460,
  面板高: 620,
  视口: { 宽: 1440, 高: 900 },
};

/** clip-path 的完整形状（不是子串匹配） */
const CLIP形状 = /^path\('M -?[\d.]+ -?[\d.]+ A [\d.]+ [\d.]+ 0 1 1 -?[\d.]+ -?[\d.]+ A [\d.]+ [\d.]+ 0 1 1 -?[\d.]+ -?[\d.]+ Z M -?[\d.]+ -?[\d.]+ H -?[\d.]+ V -?[\d.]+ H -?[\d.]+ Z'\)$/;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[前置] 内核能真跑起来（onMounted 执行、applyFrame 被调用）');
{
  const r = await 跑一次(烟火配置);
  ok('[前置] 面板对象拿到了', !!r.面板);
  ok('[前置] orbStyle 是 computed', typeof r.面板.orbStyle?.value === 'object');
  // 关态：iframe 被写成球的尺寸 —— 这是 applyFrame 真跑过的证据
  eq('★ [前置] 关态 iframe 宽 = 球直径', r.iframe.style.width, '44px');
  eq('★ [前置] 关态 iframe 高 = 球直径', r.iframe.style.height, '44px');
  r.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 关态几何] 两家配置各跑一遍，逐项断言 iframe 的 style');
for (const 配置 of [烟火配置, 导演配置]) {
  const r = await 跑一次(配置);
  const s = r.iframe.style;
  console.log(`  ── ${配置.名}（球 ${配置.球直径}，视口 ${配置.视口.宽}×${配置.视口.高}）──`);

  // 视口 1440×900、球 44 → 兜底球心 (1440-60, 900-130) = (1380, 770)
  // iframe 的 left/top = 球心 - 半个球 = (1358, 748)
  eq(`[${配置.名}] width`, s.width, `${配置.球直径}px`);
  eq(`[${配置.名}] height`, s.height, `${配置.球直径}px`);
  eq(`[${配置.名}] borderRadius（圆形）`, s.borderRadius, '50%');
  eq(`[${配置.名}] clipPath（关态不裁）`, s.clipPath, 'none');
  eq(`[${配置.名}] ★ left（默认右下，写死基准）`, s.left, '1358px');
  eq(`[${配置.名}] ★ top（默认右下，写死基准）`, s.top, '748px');
  eq(`[${配置.名}] orbStyle.left（关态）`, r.面板.orbStyle.value.left, '0px');
  eq(`[${配置.名}] orbStyle.top（关态）`, r.面板.orbStyle.value.top, '0px');

  r.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 开态几何] 打开面板 → 联合矩形 + **完整 clip-path 字符串**（写死基准）');
for (const 配置 of [烟火配置, 导演配置]) {
  const r = await 跑一次(配置);
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const s = r.iframe.style;
  const 是烟火 = 配置.名 === '烟火';
  console.log(`  ── ${配置.名}（面板 ${配置.面板宽}×${配置.面板高}）──`);

  eq(`[${配置.名}] 开态 borderRadius`, s.borderRadius, '12px');

  // 视口 1440×900、面板 880×620（烟火）→ 居中 (280, 140)
  // 球心 (1380, 770) → 球矩形 (1358, 748, 40, 40)
  // 联合矩形 = min(1358, 280)-4 .. max(1380, 1160)+4
  //           = 276 .. 1164 → 宽 888
  //           top: min(748, 140)-4 = 136 .. max(788, 760)+4 = 792 → 高 656?
  // ⚠ 上面这个手算是错的（实际 660）—— 所以**基准必须来自实测，不能手算**。
  //   下面是实测值，写死。
  if (是烟火) {
    eq('[烟火] ★ 开态 left', s.left, '276px');
    eq('[烟火] ★ 开态 top', s.top, '136px');
    eq('[烟火] ★ 开态 width（联合矩形）', s.width, '1130px');
    eq('[烟火] ★ 开态 height（联合矩形）', s.height, '660px');
    eq('[烟火] ★ clip-path 完整字符串（逐字符基准）', s.clipPath,
       `path('M 1078 634 A 26 26 0 1 1 1130 634 A 26 26 0 1 1 1078 634 Z M 0 0 H 888 V 628 H 0 Z')`);
    eq('[烟火] panelStyleRef', r.面板.panelStyleRef.value,
       { left: '4px', top: '4px', width: '880px', height: '620px' });
    eq('[烟火] orbStyle（开态）', r.面板.orbStyle.value, { left: '1082px', top: '612px' });
  }
  else {
    eq('[导演] ★ 开态 left', s.left, '486px');
    eq('[导演] ★ 开态 top', s.top, '136px');
    eq('[导演] ★ 开态 width（联合矩形）', s.width, '920px');
    eq('[导演] ★ 开态 height（联合矩形）', s.height, '660px');
    eq('[导演] ★ clip-path 完整字符串（逐字符基准）', s.clipPath,
       `path('M 868 634 A 26 26 0 1 1 920 634 A 26 26 0 1 1 868 634 Z M 0 0 H 468 V 628 H 0 Z')`);
    eq('[导演] panelStyleRef', r.面板.panelStyleRef.value,
       { left: '4px', top: '4px', width: '460px', height: '620px' });
    eq('[导演] orbStyle（开态）', r.面板.orbStyle.value, { left: '872px', top: '612px' });
  }

  // 形状（结构）也断言一次 —— 抓"整体变形"，与上面的逐字符基准互补
  ok(`[${配置.名}] clip-path 结构仍是 path(...)`,
     CLIP形状.test(s.clipPath), `实际 ${s.clipPath}`);
  // 联合矩形必须罩得住面板
  ok(`[${配置.名}] 联合矩形宽 ≥ 面板宽`,
     Number.parseFloat(s.width) >= 配置.面板宽, `实际 ${s.width}`);
  ok(`[${配置.名}] 联合矩形高 ≥ 面板高`,
     Number.parseFloat(s.height) >= 配置.面板高, `实际 ${s.height}`);

  r.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 窄屏] 视口 < 700 → 面板近乎全屏（这条以前完全没测）');
{
  const r = await 跑一次({ ...烟火配置, 视口: { 宽: 600, 高: 800 } });
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const ps = r.面板.panelStyleRef.value;
  eq('★ 窄屏面板宽 = 视口-8', ps.width, '592px');
  eq('★ 窄屏面板高 = round(视口*0.94)', ps.height, '752px');
  r.卸载();

  // ⚠ 这条是**阈值本身的判据**：699 必须走窄屏，700 必须走宽屏。
  //   只测 600 抓不到"阈值从 700 改成 800"（600 两边都是窄屏）。
  //   —— 上一版就是只测 600，变异③（700→800）没红。
  const r699 = await 跑一次({ ...烟火配置, 视口: { 宽: 699, 高: 800 } });
  r699.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ 视口 699 → 窄屏（宽 = 699-8）', r699.面板.panelStyleRef.value.width, '691px');
  r699.卸载();

  const r700 = await 跑一次({ ...烟火配置, 视口: { 宽: 700, 高: 800 } });
  r700.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ 视口 700 → **宽屏**（宽 = min(880, 700-24) = 676）',
     r700.面板.panelStyleRef.value.width, '676px');
  r700.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 宽屏夹取] 视口不够时面板被夹到 视口-24（这条以前完全没测）');
{
  // ⚠ 夹取是 `Math.min(配置值, 视口-24)` —— 只有**配置值更大**时才夹。
  //   烟火 880×620 在 900×700 下：宽 880 > 876 → 夹到 876；高 620 < 676 → **保持 620**。
  const r = await 跑一次({ ...烟火配置, 视口: { 宽: 900, 高: 700 } });
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const ps = r.面板.panelStyleRef.value;
  eq('★ 视口 900 宽 → 面板宽夹到 900-24', ps.width, '876px');
  eq('★ 视口 700 高 → 高 620 本来就更小，不夹', ps.height, '620px');
  r.卸载();

  // 反过来：视口高也小于配置高时才夹
  const r2 = await 跑一次({ ...烟火配置, 视口: { 宽: 900, 高: 600 } });
  r2.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ 视口 600 高 → 面板高夹到 600-24', r2.面板.panelStyleRef.value.height, '576px');
  r2.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 偏好落盘] 挂载时不该写；毒值纠正时才写');
{
  // ① 干净启动（存储里没值）→ 不该写
  const r1 = await 跑一次({ ...烟火配置, 预置存储: null });
  eq('★ 没存过 → 挂载时不写（不把兜底值写进存储）', r1.写次数(), 0);
  r1.卸载();

  // ② 存的是合法值 → 挂载时也不该写，且球恢复到那个位置
  const r2 = await 跑一次({ ...烟火配置, 预置存储: { x: 1000, y: 700, 主题: 'dark' } });
  eq('★ 合法值 → 挂载时不写', r2.写次数(), 0);
  eq('★ 合法值 → 球恢复到存的 x', r2.iframe.style.left, `${1000 - 22}px`);
  eq('★ 合法值 → 球恢复到存的 y', r2.iframe.style.top, `${700 - 22}px`);
  r2.卸载();

  // ③ 存的是毒值 {20,20} → 必须纠正并写回一次
  //
  //  ⚠ 这里有个**发现**：删掉 `onMounted` 里那句显式的 `persistPrefs()`
  //    （第 597 行"把纠正后的值写回"），**判据照样绿** ——
  //    因为 `watch([anchorX, anchorY])` 在 onMounted 改了 anchor 之后也会 flush 一次，
  //    那次 watch 就把纠正值写了。
  //
  //    也就是说：那句显式调用是**冗余的**（但无害），而"毒值会被纠正并写回"这个**行为**
  //    由 watch 兜住。所以判据断言的是**行为**（写回一次、内容是右下角），不是那句调用。
  //    这符合"绑意图不绑形态"。
  const r3 = await 跑一次({ ...烟火配置, 预置存储: { x: 20, y: 20, 主题: 'dark' } });
  eq('★ 毒值 → 挂载时写回一次（纠正）', r3.写次数(), 1);
  eq('★ 写回的内容 = 纠正后的右下角（写死基准）', r3.写内容()[0], { x: 1380, y: 770, 主题: 'dark' });
  eq('★ 毒值纠正后球的 left = 右下角', r3.iframe.style.left, '1358px');
  eq('★ 毒值纠正后球的 top = 右下角', r3.iframe.style.top, '748px');
  r3.卸载();

  // ④ 落盘守卫：视口不可用（<200）时**绝不写**
  //   这条抓"删掉 视口可用() 守卫" —— 那种情况下兜底值会被永久写进存储。
  const r4 = await 跑一次({ ...烟火配置, 视口: { 宽: 100, 高: 100 }, 预置存储: { x: 20, y: 20, 主题: 'dark' } });
  eq('★ 视口不可用（100×100）→ 一个字节都不写', r4.写次数(), 0);
  r4.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[★ 自证] 判据能抓到"改内核"');
{
  const r = await 跑一次(烟火配置);
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const 真 = r.iframe.style.clipPath;

  ok('[自证] 真的 clip-path 匹配形状', CLIP形状.test(真));

  // ⚠ 上一版这两条写错了：`真` 里的球半径是 `${CLOSED_SIZE/2+4}` = 26，
  //   但我用 `真.replace(' A 26 26 ', ' A 27 27 ')` —— **replace 没匹配到就不会变**，
  //   于是 `!形状.test(真)` 当然是 false（没变当然还匹配）。
  //   必须先断言"替换确实生效了"，再断言"变了之后不匹配"。
  const 改半径 = 真.replace(' A 26 26 ', ' A 27 27 ');
  ok('[自证] 改半径的替换确实生效了', 改半径 !== 真, `原文里没有 " A 26 26 "？实际 ${真.slice(0, 100)}`);
  // ⚠ 这里**不能**用 CLIP形状 正则来判"不匹配" —— 它的 `[\d.]+` 本来就接受 27。
  //   要证明"半径参与判决"，得用**完整字符串比对**（基准值写死）。
  //   这也暴露了一件事：形状正则只保证"结构对"，**数值靠逐项 eq**。
  ok('[自证] 半径变了 → 字符串不再等于基准', 改半径 !== 真);
  ok('[自证] 半径 26 是当前基准（写死，改了必红）', 真.includes(' A 26 26 0 1 1 '), `实际 ${真.slice(0, 110)}`);

  const 改起点 = 真.replace(' Z M ', ' Z M1 ');
  ok('[自证] 改面板起点的替换确实生效了', 改起点 !== 真);
  ok('[自证] 面板矩形起点插一个字就不匹配', !CLIP形状.test(改起点));

  // 关态：宽高必须**等于球直径**，不是写死的 44
  //  ⚠ 上一版这条写成了 `orbStyle.left === '0px'`，它跟球直径无关 —— 是假自证。
  const 关态宽 = r.iframe.style.width;
  r.卸载();
  const r2 = await 跑一次({ ...烟火配置, 球直径: 56 });
  eq('[自证] 球直径改成 56 → iframe 宽跟着变（不是写死 44）', r2.iframe.style.width, '56px');
  ok('[自证] 两次的宽确实不同（说明球直径真的参与计算）', 关态宽 !== r2.iframe.style.width);
  r2.卸载();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2026-11-20 C7 闸 1：两个新增可选配置的行为
// ═══════════════════════════════════════════════════════════════════════════
//
//  这两段**只测新分支**，不碰上面的 66 条老基准 ——
//  老基准全绿 = "不传新键时行为不变" 的证据（已在本文件前半段证明）。

console.log('\n[★ C7 新配置 ①] 面板布局 = fullscreen');
{
  const r = await 跑一次({ ...烟火配置, 面板布局: 'fullscreen' });
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const s = r.iframe.style;

  eq('★ fullscreen：iframe left = 0', s.left, '0px');
  eq('★ fullscreen：iframe top = 0', s.top, '0px');
  eq('★ fullscreen：iframe 宽 = 视口宽', s.width, '1440px');
  eq('★ fullscreen：iframe 高 = 视口高', s.height, '900px');
  eq('★ fullscreen：无圆角', s.borderRadius, '0px');
  eq('★ fullscreen：**不裁** clip-path（命中交给核外遮罩）', s.clipPath, 'none');
  eq('★ fullscreen：面板铺满视口（不是 880）', r.面板.panelStyleRef.value.width, '1440px');
  eq('★ fullscreen：面板高 = 视口高', r.面板.panelStyleRef.value.height, '900px');
  eq('★ fullscreen：面板位置 (0,0)', r.面板.panelStyleRef.value.left, '0px');
  r.卸载();

  // **自证**：同样的配置不传 `面板布局` 时，必须走 joint（宽度是 880）
  const r2 = await 跑一次(烟火配置);
  r2.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('[自证] 不传面板布局 → 走 joint（面板宽 = 880）',
     r2.面板.panelStyleRef.value.width, '880px');
  ok('[自证] 两个分支的结果确实不同（不是同一个分支跑两遍）',
     r2.面板.panelStyleRef.value.width !== '1440px');
  r2.卸载();
}

console.log('\n[★ C7 新配置 ②] 打开态球 = 贴边书签');
{
  // 宽屏 1440、面板 880 居中 → 左右各 (1440-880)/2 = 280 的边距
  // 边距阈值 = CLOSED_SIZE + 16 = 60，280 >= 60 → 贴右边
  const r = await 跑一次({ ...烟火配置, 打开态球: '贴边书签' });
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const orb = r.面板.orbStyle.value;

  ok('★ 贴边书签：球可见（display 不是 none）', orb.display !== 'none', JSON.stringify(orb));
  // 面板矩形 (280, 140, 880, 620) → 右余 = 1440 - (280+880) = 280
  // 球 left = vw - 边距 - frameOrigin.x = 1440 - 60 - 276 = 1104
  eq('★ 贴边书签：球贴右边（left 写死基准）', orb.left, '1104px');
  r.卸载();

  // 窄屏：面板铺满 → 两侧都没边距 → 必须隐藏
  const r2 = await 跑一次({ ...烟火配置, 打开态球: '贴边书签', 视口: { 宽: 600, 高: 800 } });
  r2.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ 贴边书签 + 窄屏（面板占满）→ 球隐藏', r2.面板.orbStyle.value.display, 'none');
  r2.卸载();

  // **自证**：不传这个配置时，球必须还在锚点位置（不是被推去贴边）
  const r3 = await 跑一次(烟火配置);
  r3.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  const 跟随 = r3.面板.orbStyle.value;
  eq('[自证] 不传打开态球 → 走跟随锚点（left = 1082，不是 1104）', 跟随.left, '1082px');
  ok('[自证] 两个分支的 left 确实不同', 跟随.left !== '1104px');
  ok('[自证] 跟随锚点分支**没有** display 键（形状不变）',
     !('display' in 跟随), JSON.stringify(跟随));
  r3.卸载();
}

console.log('\n[★ C7 新配置 ③] 球高度（非方形球）');
{
  // 彼方的球是 46×58 —— 宽高不同
  const r = await 跑一次({ ...烟火配置, 球直径: 46, 球高度: 58 });
  const s = r.iframe.style;

  eq('★ 非方形球：iframe 宽 = 球直径', s.width, '46px');
  eq('★ 非方形球：iframe 高 = 球高度', s.height, '58px');
  // 兜底球心 y = max(58, 900-130) = 770；iframe top = 770 - 58/2 = 741
  eq('★ 非方形球：top = 球心 - 半高（写死基准）', s.top, '741px');
  // x：兜底球心 = max(46, 1440-60) = 1380；iframe left = 1380 - 46/2 = 1357
  eq('★ 非方形球：left = 球心 - 半宽（写死基准）', s.left, '1357px');
  r.卸载();

  // **自证**：不传 `球高度` 时必须是正方形（高度 = 直径）
  const r2 = await 跑一次({ ...烟火配置, 球直径: 46 });
  eq('[自证] 不传球高度 → 高度 = 直径（正方形）', r2.iframe.style.height, '46px');
  ok('[自证] 传与不传的结果确实不同', r2.iframe.style.height !== s.height);
  r2.卸载();

  // 毒值判定也必须用高度：y=50 在 46×58 下是毒值（< 58），在 46×46 下合法
  const r3 = await 跑一次({ ...烟火配置, 球直径: 46, 球高度: 58, 预置存储: { x: 500, y: 50, 主题: 'dark' } });
  eq('★ 非方形球：y=50 < 58 是毒值 → 纠正并写回', r3.写次数(), 1);
  eq('★ 纠正后的 y = 770（不是 50）', r3.写内容()[0]?.y, 770);
  r3.卸载();

  const r4 = await 跑一次({ ...烟火配置, 球直径: 46, 预置存储: { x: 500, y: 50, 主题: 'dark' } });
  eq('[自证] 方球（46×46）下 y=50 是**合法**值 → 不写回', r4.写次数(), 0);
  eq('[自证] 且球停在被存的位置', r4.iframe.style.top, `${50 - 23}px`);
  r4.卸载();
}

console.log('\n[★ C7 新配置 ④] 面板布局 = capped（与彼方 面板矩形() 逐值相同）');
{
  // ── 判据：五个视口各对一次，值必须与彼方的 `面板矩形()` 完全一致 ──
  //
  //  彼方的实现（`悬浮球界面.vue` 的 `面板矩形()`）：
  //    if (vw <= 800) return { x: 0, y: 0, w: vw, h: vh };
  //    const w = Math.min(1120, vw * 0.95);
  //    const h = Math.min(760, vh - 56);
  //    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  //
  //  ⚠ **这五个值是手算的**（不是从彼方跑的），因为它们要证明"内核与彼方一致"。
  const 视口们 = [
    { 宽: 1440, 高: 900, 期望: { w: 1120, h: 760 } },        // 1120 < 1440*0.95=1368 → 1120；760 < 900-56=844 → 760
    { 宽: 1920, 高: 1080, 期望: { w: 1120, h: 760 } },       // 1120 < 1824 → 1120；760 < 1024 → 760
    { 宽: 1024, 高: 768, 期望: { w: 973, h: 712 } },         // 1024*0.95=972.8 → round? 见下
    { 宽: 800, 高: 600, 期望: { w: 800, h: 600 } },          // vw<=800 → 整屏
    { 宽: 700, 高: 900, 期望: { w: 700, h: 900 } },          // vw<=800 → 整屏
  ];

  for (const { 宽, 高, 期望 } of 视口们) {
    const r = await 跑一次({
      ...烟火配置,
      面板布局: 'capped',
      面板上限宽: 1120,
      面板上限高: 760,
      视口: { 宽, 高 },
    });
    r.面板.panelOpen.value = true;
    await nextTick();
    await nextTick();
    const ps = r.面板.panelStyleRef.value;
    // ⚠ 用 Number.parseFloat 比，避免 "972.8px" 与 "973px" 的舍入之争
    const 实际宽 = Number.parseFloat(ps.width);
    const 实际高 = Number.parseFloat(ps.height);
    const 期望宽 = 宽 <= 800 ? 宽 : Math.min(1120, 宽 * 0.95);
    // ⚠ 窄屏（<=800）时面板高 = 视口高（整屏），不是 `min(上限高, vh-56)`
    const 期望高 = 宽 <= 800 ? 高 : Math.min(760, 高 - 56);

    ok(`[capped ${宽}×${高}] ★ 面板宽 = ${期望宽}`,
       Math.abs(实际宽 - 期望宽) < 0.6, `实际 ${ps.width}`);
    ok(`[capped ${宽}×${高}] ★ 面板高 = ${期望高}`,
       Math.abs(实际高 - 期望高) < 0.6, `实际 ${ps.height}`);

    // ⚠ `panelStyleRef.left` 是**相对 iframe 原点**的，不是视口坐标。
    //    capped 下 iframe 罩住"面板 ∪ 球"的联合矩形，所以 left 通常是 4（pad）。
    //    要验"面板在视口里居中"，应该看 `panelRectView` 的视口坐标 —— 但内核没暴露它。
    //    → 这里改验**宽高**（已经验了）+ 一个可观测的等价物：iframe 罩得住面板。
    //
    //    ⚠ 窄屏（整屏）时 iframe 会比面板窄 4px（联合矩形的 pad 是从视口边界算的）——
    //      那不是缺陷，是"整屏时没有边距可留"。所以窄屏只验"接近"。
    const iframe宽 = Number.parseFloat(r.iframe.style.width);
    if (宽 <= 800) {
      ok(`[capped ${宽}×${高}] 整屏时 iframe 宽 ≈ 视口（差 ${宽 - iframe宽}px，是 pad）`,
         Math.abs(iframe宽 - 宽) <= 8, `iframe ${iframe宽} vs 视口 ${宽}`);
    }
    else {
      ok(`[capped ${宽}×${高}] ★ 联合矩形宽 ≥ 面板宽（iframe 罩得住）`,
         iframe宽 >= 实际宽, `iframe ${iframe宽} vs 面板 ${实际宽}`);
    }
    r.卸载();
  }
}

console.log('\n[★ C7 capped + 贴边书签] 宽屏球可见 / 窄屏隐藏（彼方现行为）');
{
  // 1440×900：面板 1120 居中 → 左右余 (1440-1120)/2 = 160 ≥ 62 → 球可见贴右
  const 宽屏 = await 跑一次({
    ...烟火配置,
    面板布局: 'capped',
    面板上限宽: 1120,
    面板上限高: 760,
    打开态球: '贴边书签',
    视口: { 宽: 1440, 高: 900 },
  });
  宽屏.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  ok('★ capped 宽屏（1440）→ 球**可见**', 宽屏.面板.orbStyle.value.display !== 'none',
     JSON.stringify(宽屏.面板.orbStyle.value));
  宽屏.卸载();

  // 1024×768：面板 973 居中 → 左右余 25.5 < 62 → 球隐藏（与彼方一致）
  const 中屏 = await 跑一次({
    ...烟火配置,
    面板布局: 'capped',
    面板上限宽: 1120,
    面板上限高: 760,
    打开态球: '贴边书签',
    视口: { 宽: 1024, 高: 768 },
  });
  中屏.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ capped 中屏（1024，余 25 < 62）→ 球隐藏', 中屏.面板.orbStyle.value.display, 'none');
  中屏.卸载();

  // 700×900：整屏 → 球隐藏
  const 窄屏 = await 跑一次({
    ...烟火配置,
    面板布局: 'capped',
    面板上限宽: 1120,
    面板上限高: 760,
    打开态球: '贴边书签',
    视口: { 宽: 700, 高: 900 },
  });
  窄屏.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('★ capped 窄屏（700，整屏）→ 球隐藏', 窄屏.面板.orbStyle.value.display, 'none');
  窄屏.卸载();
}

console.log('\n[自证] capped 的判据不是恒真');
{
  // 把 面板上限宽 改小 → 1440 下的面板宽必须跟着变（说明配置真的被读）
  const r = await 跑一次({
    ...烟火配置,
    面板布局: 'capped',
    面板上限宽: 600,
    面板上限高: 500,
    视口: { 宽: 1440, 高: 900 },
  });
  r.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('[自证] 上限宽改 600 → 面板宽 600（说明配置被读，不是写死 1120）',
     r.面板.panelStyleRef.value.width, '600px');
  eq('[自证] 上限高改 500 → 面板高 500', r.面板.panelStyleRef.value.height, '500px');
  r.卸载();

  // 不传 capped（走 joint）时，上限宽必须**不被读**
  const r2 = await 跑一次({
    ...烟火配置,
    面板上限宽: 600,
    视口: { 宽: 1440, 高: 900 },
  });
  r2.面板.panelOpen.value = true;
  await nextTick();
  await nextTick();
  eq('[自证] 不传 面板布局 → 上限宽被忽略（joint 用 面板宽 880）',
     r2.面板.panelStyleRef.value.width, '880px');
  r2.卸载();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);