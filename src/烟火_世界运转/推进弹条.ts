// 烟火 · 推进中弹条: 面板收起时也能看见"世界正在推进", 并能就地中断。
//
// 它**不是**窗口机制的一部分(剧情导演没有这条弹条), 所以留在烟火这边, 只从 共用/面板机制
// 取它需要的三样: 父窗口(挂到酒馆页面上, 才不被 iframe 的 clip-path 裁掉)、面板开关、
// 以及**贴球锚点**(被收纳时是坞图标, 否则是球 iframe 的真实矩形)。
//
// 以前它和 iframe 几何/拖动/阴影挤在同一个 668 行的 composable 里, 靠闭包直接读 panelOpen 与
// 球锚点(); 现在靠 watch 贴球锚点 跟随 —— 于是"球没动但坞动了"也照样跟得上, 不需要内核为它开洞。
import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { 弹窗兜底配色, 弹窗变量, 层序, 取弹窗配色 } from './主题';

export interface 推进弹条依赖 {
  /** 「世界正在推进」——推进中弹条的出现/消失看它 */
  推进中: Ref<boolean>;
  /** 推进中的一句话文案(弹条上那行字) */
  推进文案: Ref<string>;
  /** 点弹条上的「中断」 */
  中断推进: () => void;
}

/** 弹条要向窗口机制借的东西(全部由 共用/面板机制 返回, 这里只声明形状) */
export interface 弹条宿主 {
  parentWin: Ref<Window | null>;
  panelOpen: Ref<boolean>;
  贴球锚点: Ref<{ x: number; y: number; r: number }>;
  theme: Ref<'dark' | 'light'>;
  viewportW(): number;
  viewportH(): number;
  clamp(值: number, 低: number, 高: number): number;
}

/**
 * 弹条的生命周期跟着组件走: 在 setup 里调一次, 组件卸载时自己摘掉。
 */
export function 使用推进弹条(依赖: 推进弹条依赖, 宿主: 弹条宿主) {
  const pillEl = ref<HTMLElement | null>(null);

  /** 弹条的内联配色跟当前主题走(它不在弹窗容器里, 所以变量要单独补) */
  function 上色() {
    const el = pillEl.value;
    if (!el) return;
    const 配色 = 取弹窗配色(宿主.theme.value);
    el.style.setProperty(弹窗变量.bg, 配色.bg);
    el.style.setProperty(弹窗变量.border, 配色.border);
    el.style.setProperty(弹窗变量.text, 配色.text);
    el.style.setProperty(弹窗变量.accent, 配色.accent);
  }

  /** 弹条贴着悬浮球左方弹出(左方空间不足则弹到右方), 垂直居中对齐球, 跟随球的位置 */
  function 定位() {
    const el = pillEl.value;
    if (!el) return;
    const vw = 宿主.viewportW();
    const vh = 宿主.viewportH();
    // 窄屏: 弹条太宽会超出视口, 先压缩内容(允许换行)再定位
    if (vw < 700) {
      el.style.whiteSpace = 'normal';
      el.style.maxWidth = `${Math.min(240, vw - 96)}px`;
    }
    const w = el.offsetWidth || 160;
    const h = el.offsetHeight || 32;
    // 锚点由 共用/面板机制 统一解析: 被收纳时=坞图标(28×28, 半径更小), 否则=球 iframe 真实矩形
    const { x: 心x, y: 心y, r: 半径 } = 宿主.贴球锚点.value;
    let left = 心x - 半径 - w - 10;
    if (left < 8) left = 心x + 半径 + 10;
    left = 宿主.clamp(left, 8, Math.max(8, vw - w - 8));
    const top = 宿主.clamp(心y - h / 2, 8, Math.max(8, vh - h - 8));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function 移除() {
    pillEl.value?.remove();
    pillEl.value = null;
  }

  function 建() {
    const parentDoc = 宿主.parentWin.value?.document;
    if (!parentDoc || pillEl.value) return;
    const el = parentDoc.createElement('div');
    el.style.cssText =
      'position:fixed;top:0;left:0;display:flex;align-items:center;gap:9px;padding:7px 9px 7px 15px;border-radius:999px;' +
      `background:var(--yh-toast-bg,${弹窗兜底配色.bg});border:1px solid var(--yh-toast-border,${弹窗兜底配色.border});color:var(--yh-toast-text,${弹窗兜底配色.text});` +
      `font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);z-index:${层序.更新弹条};cursor:pointer;white-space:nowrap;transform-origin:left center;animation:yhPillIn .32s cubic-bezier(.34,1.56,.64,1);`;
    const keyframes = parentDoc.createElement('style');
    keyframes.textContent =
      '@keyframes yhPillBreath{0%,100%{opacity:.35}50%{opacity:1}}@keyframes yhPillIn{from{opacity:0;transform:translateX(14px) scale(.9)}to{opacity:1;transform:none}}';
    const dot = parentDoc.createElement('span');
    dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:var(--yh-toast-accent,${弹窗兜底配色.accent});animation:yhPillBreath 1.4s ease-in-out infinite;flex:none;`;
    const text = parentDoc.createElement('span');
    text.textContent = 依赖.推进文案.value || '世界运转中…';
    const btn = parentDoc.createElement('button');
    btn.textContent = '中断';
    btn.style.cssText = `padding:3px 11px;border-radius:999px;border:1px solid var(--yh-toast-accent,${弹窗兜底配色.accent});background:transparent;color:var(--yh-toast-accent,${弹窗兜底配色.accent});cursor:pointer;font:12px "Segoe UI","Microsoft YaHei",sans-serif;`;
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      依赖.中断推进();
    });
    el.addEventListener('click', () => {
      宿主.panelOpen.value = true;
    });
    el.append(keyframes, dot, text, btn);
    parentDoc.body.appendChild(el);
    pillEl.value = el;
    上色();
    定位();
  }

  watch([依赖.推进中, 宿主.panelOpen], ([active, open]) => {
    if (active && !open) 建();
    else 移除();
  });
  watch(依赖.推进文案, msg => {
    if (pillEl.value) pillEl.value.children[2].textContent = msg || '世界运转中…';
  });
  // 球挪了 / 被收纳坞收走 / 坞本身被拖动折叠 —— 都只反映在 贴球锚点 上
  watch(宿主.贴球锚点, () => 定位());
  watch(宿主.theme, () => 上色());
  // 视口变了: 内核会重排 iframe 并刷新锚点(定位随之走), 但窄屏换行规则要自己再来一次。
  // parentWin 要等 rootEl 挂上才有值 —— setup 期取只会拿到 null, 监听就永远挂不上。
  onMounted(() => {
    宿主.parentWin.value?.addEventListener('resize', 定位);
  });
  onUnmounted(() => {
    宿主.parentWin.value?.removeEventListener('resize', 定位);
    移除();
  });
}
