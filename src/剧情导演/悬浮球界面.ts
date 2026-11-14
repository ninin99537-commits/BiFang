import { useHost } from './host';
import { 清掉重复壳, 建壳卸载器 } from './壳去重';

/**
 * 2026-11-13 P1-8 补: 壳 → Vue app 的映射。
 * 拆旧壳时必须先 `app.unmount()` —— `remove()` 不会触发 `onUnmounted`，
 * 那套清理（父窗口 resize 监听 / 量球定时器 / 观察器）会全部泄漏（需求方 jsdom 实测）。
 * 用 WeakMap: 壳被移除后条目自然回收，不需要手动清。
 */
const 壳的app = new WeakMap<Element, any>();
import { pinia } from './pinia';
import { 层序, 悬浮球直径 } from './主题';
import 悬浮球界面 from './悬浮球界面.vue';
import { createApp } from 'vue';

const SRCDOC = `<!DOCTYPE html><html><head><style>*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent;}body:focus,html:focus{outline:none;}</style></head><body></body></html>`;

function copyStylesTo(nestedDoc: Document) {
  const existing = new Set([...nestedDoc.head.querySelectorAll('style')].map(style => style.textContent));
  document.head.querySelectorAll('style').forEach(style => {
    if (style.textContent && !existing.has(style.textContent)) {
      nestedDoc.head.appendChild(style.cloneNode(true));
    }
  });
}

$(() => {
  const app = createApp(悬浮球界面).use(pinia);
  if (!document.getElementById('dj-orb-force-style')) {
    const style = document.createElement('style');
    style.id = 'dj-orb-force-style';
    style.textContent = `
      iframe[script_id] { border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; }
      iframe[script_id]:focus, iframe[script_id]:focus-visible, iframe[script_id]:focus-within { outline: none !important; }`;
    document.head.appendChild(style);
  }
  // 2026-11-13 P1-8: 重复加载会挂出第二个壳（两个球、两套监听，pagehide 只清自己那一个）。
  // 先把同 id 的旧壳拆掉 —— **不复用**（旧 Vue app 已挂载，复用等于两套 app 抢同一个 document）。
  // 2026-11-13 接线修复: 壳是 appendTo('body') 插到**父文档**的 ——
  // 以前传脚本自己的 document，在错的文档里查，命中 0（真机实测），去重完全没生效。
  // 2026-11-13 v28: 不再在这里写 找body lambda（它会成为"用例读不到、变异改得动"的缺口）。
  // 默认的找body 在 壳去重.默认找body 里，是被测函数的一部分。
  清掉重复壳({
    兜底文档: document,
    scriptId: String(useHost().vars.scriptId()),
    卸载器: 建壳卸载器(壳的app),
  });
  const $app = $('<iframe>')
    .attr({ script_id: useHost().vars.scriptId(), frameborder: 0, tabindex: -1, srcdoc: SRCDOC })
    .css({
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: `${悬浮球直径}px`,
      height: `${悬浮球直径}px`,
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      // 挂载成功前绝不吃指针事件。这个壳一插进 DOM 就停在 [0,0] 且 40×40；
      // 若 setup 抛错（真机事故：useStateStore 未定义），onMounted 永不执行、位置永不迁走，
      // 它就会把左上角全部指针事件吃掉，压住别的插件（彼方、玉子手机都中过招）。
      pointerEvents: 'none',
      zIndex: String(层序.球iframe),
    })
    .appendTo('body');
  $app.on('load', () => {
    const nestedDoc = ($app[0] as HTMLIFrameElement).contentDocument;
    if (!nestedDoc) return;
    copyStylesTo(nestedDoc);
    app.mount(nestedDoc.body);
    壳的app.set($app[0], app); // 供"拆旧壳"时先 unmount
    // mount 走通 ⇒ onMounted 已把球迁到右下角，此刻才接管指针事件
    ($app[0] as HTMLIFrameElement).style.pointerEvents = 'auto';
    window.setTimeout(() => copyStylesTo(nestedDoc), 300);
    window.setTimeout(() => copyStylesTo(nestedDoc), 1200);
  });
  $(window).on('pagehide', () => {
    app.unmount();
    $app.remove();
  });
});
