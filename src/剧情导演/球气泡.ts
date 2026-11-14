// 剧情导演 · 悬浮球的信息气泡（规格 §1.3-15）：**挂在父页面 DOM**，与 `toast.ts` 同机制。
//
// 为什么不能画在球自己的 iframe 里：那个 iframe 只有 **40×40**（= 悬浮球直径），
// 而且 `共用/面板机制.ts` 的 `applyFrame()` 还会用 clip-path 把它裁成"球 ∪ 面板"的并集 ——
// 气泡画在球里必被裁掉；要装下气泡就得放大 iframe，那会动**尺寸契约**（规格 §1.4-18 明令不变）。
// 于是：复用 toast.ts 已经建立的锚点标记（`#dj-toast-anchor`，球移动时由 `setToastAnchor` 更新），
// 在父页面里画一个小气泡贴在球旁边 —— **不改几何、不改 40×40、零外部依赖**。
import { 悬浮球直径 } from './主题';

const 气泡ID = 'dj-orb-tip';
const 与球间距 = 10;

function 父文档(): Document | null {
  try {
    return window.parent !== window ? window.parent.document : null;
  } catch {
    return null; // 跨域拿不到就安静放弃：气泡只是锦上添花, 不该影响球本身
  }
}

/**
 * 取球心（父页面视口坐标）。**优先用调用方传进来的实时球心**（`面板机制` 的 anchorX/anchorY）：
 * 那才是"球现在在哪"的权威值，拖动后立刻生效、resize 后也是新值。
 * 只在没传时才退回去读 toast 锚点，最后才退回右下角 —— 缺陷 1 的根因就是**只依赖那个锚点**，
 * 而它属于 toast 系统、只在弹 toast 时才更新，球没被拖动过时一直是空的（实测 display:none / 0×0）。
 */
function 锚点坐标(doc: Document, 实时球心?: { x: number; y: number }): { x: number; y: number } {
  if (实时球心 && Number.isFinite(实时球心.x) && Number.isFinite(实时球心.y) && 实时球心.x > 0 && 实时球心.y > 0) return 实时球心;
  const 标记 = doc.getElementById('dj-toast-anchor');
  if (标记) {
    const x = Number(标记.getAttribute('data-x'));
    const y = Number(标记.getAttribute('data-y'));
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  const win = doc.defaultView;
  return { x: (win?.innerWidth ?? 1080) - 60, y: (win?.innerHeight ?? 720) - 130 };
}

function 确保气泡(doc: Document): HTMLElement {
  let 气泡 = doc.getElementById(气泡ID);
  if (!气泡) {
    气泡 = doc.createElement('div');
    气泡.id = 气泡ID;
    气泡.setAttribute('role', 'tooltip');
    气泡.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'max-width:220px',
      'padding:6px 9px',
      'border-radius:2px',
      'border:1px solid var(--dj-toast-border,#3c3c42)',
      'background:var(--dj-toast-bg,#202024)',
      'color:var(--dj-toast-text,#e9e8e6)',
      'font:11px/1.5 "Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 8px 20px rgba(0,0,0,.45)',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity .12s ease',
      'z-index:2147482998',
      'white-space:pre-wrap',
      'word-break:break-word',
    ].join(';');
    doc.body.appendChild(气泡);
  }
  return 气泡;
}

/** 把父页面那份弹窗主题色搬到气泡上（toast.ts 的 setToastColors 写在 stack 上, 这里拷一份） */
function 同步主题色(doc: Document, 气泡: HTMLElement): void {
  const 栈 = doc.getElementById('dj-toast-stack') as HTMLElement | null;
  if (!栈) return;
  for (const 名 of ['--dj-toast-bg', '--dj-toast-border', '--dj-toast-text', '--dj-toast-accent']) {
    气泡.style.setProperty(名, 栈.style.getPropertyValue(名));
  }
}

/** 贴球显示。文本里用 `\n` 分行（气泡第一行会被加粗，当作"当前态"）。`球心` 由面板机制传入（实时） */
export function 显示气泡(文本: string, 球心?: { x: number; y: number }): void {
  const doc = 父文档();
  if (!doc) return;
  const 气泡 = 确保气泡(doc);
  同步主题色(doc, 气泡);
  const [首行, ...其余] = String(文本 ?? '').split('\n');
  const 标题 = doc.createElement('b');
  标题.style.cssText = 'display:block;font-weight:600;margin-bottom:1px;';
  标题.textContent = 首行 ?? '';
  气泡.replaceChildren(标题, doc.createTextNode(其余.join('\n')));

  const win = doc.defaultView;
  const { x, y } = 锚点坐标(doc, 球心);
  const 球左 = x - 悬浮球直径 / 2;
  const 球右 = x + 悬浮球直径 / 2;
  const 宽 = 气泡.offsetWidth || 180;
  const 高 = 气泡.offsetHeight || 40;
  let left = 球左 - 与球间距 - 宽;
  if (left < 8) left = 球右 + 与球间距;
  left = Math.min(Math.max(left, 8), Math.max(8, (win?.innerWidth ?? 1080) - 宽 - 8));
  const top = Math.min(Math.max(y - 高 / 2, 8), Math.max(8, (win?.innerHeight ?? 720) - 高 - 8));
  气泡.style.left = `${Math.round(left)}px`;
  气泡.style.top = `${Math.round(top)}px`;
  气泡.style.opacity = '1';
}

export function 藏气泡(): void {
  const doc = 父文档();
  if (!doc) return;
  const 气泡 = doc.getElementById(气泡ID);
  if (气泡) (气泡 as HTMLElement).style.opacity = '0';
}
