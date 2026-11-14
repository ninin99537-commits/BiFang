// 共用 · 提示条(贴球弹窗渲染器) —— 渲染机制从三份 toast.ts 收进一处之后, 它才第一次**测得动**。
//
// 以前为什么测不了: 三个 toast.ts 都往 window.parent.document 里画 DOM(脚本与悬浮球界面跑在 iframe 里,
// 弹窗画在酒馆父页面上), node 里没有那个文档, 所以旧用例只能断言源码文本 ——
// `update-pipeline.test.ts` / `world-pipeline.test.ts` 里都写着「提示条不在这里断言」。
// 现在渲染器只认 window.parent.document 这一条路径, 于是用 jsdom 把父页面摆出来就能真跑(见 提示条测试台.mjs)。
//
// 这里只测**渲染器自己的机制**: 三个父页面元素、贴球定位、堆叠、退场、配色下发、前缀隔离、闸门。
// 每个项目自己的配置(前缀、配色变量名与兜底色、球半径、导演的提示档闸门)在各自那份用例里断言:
//   theme.test.ts(彼方) / yanhuo-theme.test.ts(烟火) / daoyan-orb-status.test.ts(剧情导演)
//
// ⚠️ jsdom 的已知失真, 别在这儿白费力气: 它把 `border:1px solid var(--x,#hex)` 这种**简写**里的 var()
// 当成无法回写的值 —— 后面再出现一条 `border-left` 时, 整条 border 会被丢掉。真浏览器不会。
// 所以下面断言的是 border-left / background / color / animation(这几条 jsdom 都留得住),
// 「1px 实边框」那一条不在 jsdom 里验。
import { 建提示条 } from '../src/共用/提示条';
import { 装父文档, 装顶层窗口, 装跨域窗口, 装计时器, 取堆栈, 取提示条们 } from './提示条测试台.mjs';

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

/** 测试用的配置: 前缀 tt, 7 个变量名与兜底色都取成一眼能认出来的值 */
const 配置 = {
  前缀: 'tt',
  配色变量: {
    bg: '--tt-toast-bg',
    border: '--tt-toast-border',
    text: '--tt-toast-text',
    accent: '--tt-toast-accent',
    errorBg: '--tt-toast-error-bg',
    errorBorder: '--tt-toast-error-border',
    errorText: '--tt-toast-error-text',
  },
  配色兜底: {
    bg: '#010101',
    border: '#020202',
    text: '#030303',
    accent: '#040404',
    errorBg: '#050505',
    errorBorder: '#060606',
    errorText: '#070707',
  },
  严重度色: {
    success: '#0a0a0a',
    info: '#0b0b0b',
    warning: 'var(--tt-toast-accent,#0c0c0c)',
    error: 'var(--tt-toast-error-border,#060606)',
  },
  球半径: 20,
  兜底锚点: (视口宽: number, 视口高: number) => ({ x: 视口宽 - 60, y: 视口高 - 130 }),
};

/**
 * jsdom 会把 #0a0a0a 改写成 rgb(10, 10, 10), 期望值先过同一道改写再比。
 * 传**单个颜色**进来, 别传整条声明 —— jsdom 对含 var() 的值原样留着, 对不含 var() 的会去校验,
 * 所以 `3px solid #0a0a0a` 这种整条塞进 color 只会得到空串。
 */
function 归一色(doc: Document, 值: string): string {
  if (值.startsWith('var(')) return 值;
  const 探针 = doc.createElement('span');
  探针.style.color = 值;
  return 探针.style.color;
}

/** 造父文档 + 计时器 + 渲染器, 可选先写球心, 然后弹一条 */
function 渲染(类型: string, 锚点?: [number, number], 文案 = '文案', 标题?: string) {
  const doc = 装父文档();
  const 计时 = 装计时器();
  const 提示条 = 建提示条(配置);
  if (锚点) 提示条.setToastAnchor(锚点[0], 锚点[1]);
  提示条.showToast(类型, 文案, 标题);
  return { doc, 计时, 提示条, 堆栈: 取堆栈(doc, 'tt') as HTMLElement, 条: 取提示条们(doc, 'tt')[0] as HTMLElement };
}

// ---------------------------------------------------------------------------
console.log('\n[1] 父页面上长出来的三个元素, 都按前缀取名');
{
  const doc = 装父文档();
  装计时器();
  const 提示条 = 建提示条(配置);
  提示条.toastSuccess('世界动了');
  ok('style 元素在', !!doc.getElementById('tt-toast-style'));
  ok('stack 元素在', !!doc.getElementById('tt-toast-stack'));
  ok('还没写过球心, 就不该有 anchor', !doc.getElementById('tt-toast-anchor'));

  提示条.setToastAnchor(500.4, 299.6);
  const 锚 = doc.getElementById('tt-toast-anchor');
  ok('anchor 元素在', !!锚);
  check('锚点存的是取整后的球心', [锚!.getAttribute('data-x'), 锚!.getAttribute('data-y')], ['500', '300']);
  check('锚点自己是隐藏的(不占位)', 锚!.style.display, 'none');

  const 堆栈 = 取堆栈(doc, 'tt')!;
  check('容器贴在视口上', 堆栈.style.position, 'fixed');
  check('容器纵向堆叠、右对齐', [堆栈.style.flexDirection, 堆栈.style.alignItems], ['column', 'flex-end']);
  check('容器不吃鼠标事件(只有提示条本身吃)', 堆栈.style.pointerEvents, 'none');
  check('默认堆栈层序', 堆栈.style.zIndex, '2147482998');

  const 样式文本 = doc.getElementById('tt-toast-style')!.textContent!;
  for (const 名 of ['ttToastIn', 'ttToastOut', 'ttToastShake'])
    ok(`关键帧 ${名} 写进了 style`, 样式文本.includes(`@keyframes ${名}{`));
}

console.log('\n[2] 前缀隔离: 两套提示条互不撞车');
{
  const doc = 装父文档();
  装计时器();
  const 甲 = 建提示条({ ...配置, 前缀: 'aa' });
  const 乙 = 建提示条({ ...配置, 前缀: 'bb' });
  甲.toastSuccess('甲的');
  ok('甲的容器在', !!取堆栈(doc, 'aa'));
  check('乙没出声就不占 DOM', 取堆栈(doc, 'bb'), null);
  乙.toastWarning('乙的');
  check('两套容器各装各的', [取提示条们(doc, 'aa').length, 取提示条们(doc, 'bb').length], [1, 1]);
  check('两个 style 元素', doc.querySelectorAll('style').length, 2);
  甲.toastSuccess('甲的2');
  乙.toastInfo('乙的2');
  check('style 不会重复插', doc.querySelectorAll('style').length, 2);
  check('层序可配', 取堆栈(doc, 'bb')!.style.zIndex, '2147482998');
  const 丙 = 建提示条({ ...配置, 前缀: 'cc', 堆栈层序: 123 });
  丙.toastInfo('丙的');
  check('配了就用自己的层序', 取堆栈(doc, 'cc')!.style.zIndex, '123');
}

// ---------------------------------------------------------------------------
console.log('\n[3] 贴球定位: 球心 → 左侧优先 / 空间不足弹到右方 / 越界收进视口');
{
  // 视口 1024×768, 球半径 20; jsdom 没有排版, 容器宽高都是 0
  const a = 渲染('success', [500, 300]);
  check('贴在球左侧(球左 - 10 - 宽)', [a.堆栈.style.left, a.堆栈.style.top], ['470px', '300px']);

  const b = 渲染('success', [25, 300]);
  check('左边放不下就弹到球右方(球右 + 10)', b.堆栈.style.left, '55px');

  const c = 渲染('success');
  check('没写过球心 → 用兜底球心(1024-60, 768-130)', [c.堆栈.style.left, c.堆栈.style.top], ['934px', '638px']);

  const d = 渲染('success', [500, 1000]);
  check('纵坐标越界时收进视口(768 - 高 - 8)', d.堆栈.style.top, '760px');

  const e = 渲染('success', [1050, 300]);
  check('横坐标越界时收进视口(1024 - 宽 - 8)', e.堆栈.style.left, '1016px');
}

console.log('\n[4] 窗口一改大小就跟着重定位(监听只绑一次)');
{
  const doc = 装父文档();
  装计时器();
  const 提示条 = 建提示条(配置);
  提示条.setToastAnchor(500, 300);
  提示条.toastSuccess('跟随');
  const 堆栈 = 取堆栈(doc, 'tt')!;
  check('先贴在 (500,300)', 堆栈.style.left, '470px');
  check('resize 只绑一次(打标记防重绑)', 堆栈.dataset.resizeBound, '1');

  const 锚 = doc.getElementById('tt-toast-anchor')!;
  锚.setAttribute('data-x', '700');
  锚.setAttribute('data-y', '400');
  doc.defaultView!.dispatchEvent(new doc.defaultView!.Event('resize'));
  check('球一动, 弹窗跟着走', [堆栈.style.left, 堆栈.style.top], ['670px', '400px']);
}

// ---------------------------------------------------------------------------
console.log('\n[5] 堆叠与文案: 后到的在下面, 标题是加粗小标题');
{
  const doc = 装父文档();
  装计时器();
  const 提示条 = 建提示条(配置);
  提示条.toastSuccess('第一条', '彼方');
  提示条.toastWarning('第二条');
  const 条 = 取提示条们(doc, 'tt') as HTMLElement[];
  check('两条都在, 按先后顺序', 条.map(e => e.textContent), ['彼方第一条', '第二条']);
  check('每条都是「标记 + 正文」两段', 条.map(e => e.children.length), [2, 2]);
  check('标题是 <b>', 条[0].children[1].children[0].tagName, 'B');
  check('标题加粗', (条[0].children[1].children[0] as HTMLElement).style.fontWeight, '600');
  check('没给标题就只有正文', 条[1].children[1].children.length, 0);
}

console.log('\n[6] 严重度: 左边框取配置里的严重度色, 标记点区分错误');
{
  const 期望色 = {
    success: '#0a0a0a',
    info: '#0b0b0b',
    warning: 'var(--tt-toast-accent,#0c0c0c)',
    error: 'var(--tt-toast-error-border,#060606)',
  } as Record<string, string>;
  for (const 类型 of ['success', 'info', 'warning', 'error'] as const) {
    const { doc, 条 } = 渲染(类型, [500, 300], '消息');
    check(`${类型}: 左边框 = 配置的严重度色`, 条.style.borderLeft, `3px solid ${归一色(doc, 期望色[类型])}`);
  }

  const s = 渲染('success', [500, 300]);
  const 点 = s.条.children[0] as HTMLElement;
  check('普通档: 小圆点', [点.style.width, 点.style.height], ['7px', '7px']);
  check('普通档: 圆点色 = 严重度色', 点.style.background, 归一色(s.doc, '#0a0a0a'));
  check('普通档: 没有文字', 点.textContent, '');
  check('普通档: 背景走 bg 变量与兜底', s.条.style.background, 'var(--tt-toast-bg,#010101)');
  check('普通档: 文字走 text 变量与兜底', s.条.style.color, 'var(--tt-toast-text,#030303)');
  check('普通档: 入场动画', s.条.style.animation, 'ttToastIn .3s cubic-bezier(.34,1.56,.64,1)');

  const e = 渲染('error', [500, 300]);
  const 叹 = e.条.children[0] as HTMLElement;
  check('错误档: 大圆点 + 叹号', [叹.style.width, 叹.textContent], ['16px', '!']);
  check('错误档: 标记走 errorBorder 变量', 叹.style.background, 'var(--tt-toast-error-border,#060606)');
  check('错误档: 叹号字是白的', 叹.style.color, 归一色(e.doc, '#fff'));
  check('错误档: 背景换 errorBg 变量', e.条.style.background, 'var(--tt-toast-error-bg,#050505)');
  check('错误档: 文字换 errorText 变量', e.条.style.color, 'var(--tt-toast-error-text,#070707)');
  check('错误档: 入场之后接一段晃动', e.条.style.animation, 'ttToastIn .3s cubic-bezier(.34,1.56,.64,1),ttToastShake .45s ease .32s');
}

// ---------------------------------------------------------------------------
console.log('\n[7] 停留时长: 错误最长(给人读完), 警告次之');
{
  for (const [类型, 毫秒] of [['success', 3400], ['info', 3400], ['warning', 5200], ['error', 8000]] as const) {
    const { 计时 } = 渲染(类型, [500, 300]);
    check(`${类型} 停 ${毫秒}ms`, 计时.待触发().map(t => t.ms), [毫秒]);
  }
}

console.log('\n[8] 退场: 超时 / 点击都走同一条路, 且只退一次');
{
  const 超时 = 渲染('warning', [500, 300]);
  超时.计时.到期(5200);
  check('超时后先播退场动画', 超时.条.style.animation, 'ttToastOut .2s ease forwards');
  check('动画没跑完时还留在 DOM 里', 取提示条们(超时.doc, 'tt').length, 1);
  超时.计时.到期(210);
  check('动画结束后摘掉', 取提示条们(超时.doc, 'tt').length, 0);

  const 点击 = 渲染('info', [500, 300]);
  点击.条.click();
  check('点一下就标记退场', 点击.条.dataset.dismissed, '1');
  check('点了就把超时定时器取消掉', 点击.计时.待触发(3400).length, 0);
  点击.条.click();
  check('再点不再排退场(只有一条 210ms)', 点击.计时.待触发(210).length, 1);
  点击.计时.到期(210);
  check('摘掉之后容器空着', 取提示条们(点击.doc, 'tt').length, 0);
}

// ---------------------------------------------------------------------------
console.log('\n[9] 配色下发: 只写给了的那几项, 空值不覆盖');
{
  const doc = 装父文档();
  装计时器();
  const 提示条 = 建提示条(配置);
  提示条.setToastColors({ bg: '#111111', text: '#222222' });
  const 堆栈 = 取堆栈(doc, 'tt')!;
  check('给了的写下去', [堆栈.style.getPropertyValue('--tt-toast-bg'), 堆栈.style.getPropertyValue('--tt-toast-text')], ['#111111', '#222222']);
  check('没给的不动(留给兜底色)', 堆栈.style.getPropertyValue('--tt-toast-border'), '');
  提示条.setToastColors({ bg: '', accent: '#333333' });
  check('空值不覆盖已有的', 堆栈.style.getPropertyValue('--tt-toast-bg'), '#111111');
  check('后给的照写', 堆栈.style.getPropertyValue('--tt-toast-accent'), '#333333');
  提示条.toastSuccess('配色下发后才弹的');
  check('提示条读的就是容器上这份变量', 取提示条们(doc, 'tt')[0].style.background, 'var(--tt-toast-bg,#010101)');
}

console.log('\n[10] 闸门: 放行 不通过就一条都不发(连容器都不建)');
{
  const doc = 装父文档();
  装计时器();
  const 拦info = 建提示条({ ...配置, 前缀: 'gg', 放行: t => t !== 'info' });
  拦info.toastInfo('不该出声');
  check('被拦下的连容器都不建', 取堆栈(doc, 'gg'), null);
  拦info.toastWarning('要出声');
  check('放行的照常', 取提示条们(doc, 'gg').length, 1);
  拦info.toastInfo('还是不出声');
  check('拦得住第二条', 取提示条们(doc, 'gg').length, 1);
}

console.log('\n[11] 取不到父文档时静默: 不抛错, 也不画在自己文档里');
{
  for (const [说明, 造] of [['顶层窗口(没有父页面)', 装顶层窗口], ['跨域(读 window.parent 就抛)', 装跨域窗口]] as const) {
    const doc = 造();
    装计时器();
    const 提示条 = 建提示条(配置);
    let 抛了 = '';
    try {
      提示条.toastSuccess('没人看得见');
      提示条.toastWarning('也没人看得见');
      提示条.setToastColors({ bg: '#111111' });
      提示条.setToastAnchor(10, 10);
    }
    catch (e) {
      抛了 = String(e);
    }
    check(`${说明}: 四个出口都不抛错`, 抛了, '');
    check(`${说明}: 一个元素都不画`, doc.body.children.length, 0);
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
