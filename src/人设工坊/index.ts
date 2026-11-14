import { createPinia } from 'pinia';
import { createApp } from 'vue';
import 面板 from './面板.vue';
import { 面板开 } from './界面状态';

// ---------------------------------------------------------------------------
// 人设工坊 · 脚本入口(不是前端界面)
//
// 形态: 只有 index.ts、没有 index.html ⇒ webpack 按「脚本」打包, 产物是 dist/人设工坊/index.js。
//
// 入口位置(2026-10-14 #75 修正): **酒馆输入框左边的扩展菜单 `#extensionsMenu`**。
//   以前用 appendInexistentScriptButtons 注册脚本按钮, 那会出现在 **Quick Replies 栏** ——
//   和「魔法棒菜单」是两个完全不同的地方, 用户要的是后者。
//   所以: 优先往 #extensionsMenu 注入一个原生样式的条目; 注入失败才退回脚本按钮(并 warn)。
//
// 挂载方式照 剧情导演/悬浮球界面.ts: 建一个 fixed 的 iframe(srcdoc 透明底),
// 把脚本自己 <head> 里的样式拷进 iframe, 再把 Vue 应用挂到 iframe 的 body 上。
// 为什么必须搬样式: 脚本的样式只作用于脚本自己的 iframe, 不会自动进这个嵌套 iframe。
// ---------------------------------------------------------------------------

/** 外层 iframe 的层序: 与剧情导演/烟火同档, 高于酒馆自身 UI */
const 层序 = 2147483000;
/** 扩展菜单条目的 data 标记(幂等: 注入前先查它) */
const 菜单标记 = 'data-renshe-gongfang';
/** 兜底脚本按钮名 */
const 按钮名 = '人设工坊';

const SRCDOC = `<!DOCTYPE html><html><head><style>*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent;}body:focus,html:focus{outline:none;}</style></head><body></body></html>`;

/** 把脚本 iframe 里的 <style> 拷进嵌套 iframe(按文本去重, 可重复调用) */
function copyStylesTo(nestedDoc: Document) {
  const existing = new Set([...nestedDoc.head.querySelectorAll('style')].map(style => style.textContent));
  document.head.querySelectorAll('style').forEach(style => {
    if (style.textContent && !existing.has(style.textContent)) {
      nestedDoc.head.appendChild(style.cloneNode(true));
    }
  });
}

/** 钉住嵌套 iframe 的透明底(组件里的 html/body 背景是给整页写的, 会染出方块) */
function 钉透明底(nestedDoc: Document) {
  if (nestedDoc.getElementById('fg-transparent')) return;
  const style = nestedDoc.createElement('style');
  style.id = 'fg-transparent';
  style.textContent = 'html,body{background:transparent !important;margin:0 !important;padding:0 !important;}';
  nestedDoc.head.appendChild(style);
}

/** 酒馆主页面文档: **从脚本 iframe 的 parent 拿**, 绝不用裸 window 乱推 */
function 主文档(): Document | null {
  try {
    return window.parent?.document ?? null;
  } catch {
    return null;
  }
}

/**
 * 往 `#extensionsMenu` 注入一个看起来是原生的条目。
 * @returns 成功与否
 */
function 注入扩展菜单(): boolean {
  const doc = 主文档();
  if (!doc) return false;
  const 菜单 = doc.getElementById('extensionsMenu');
  if (!菜单) return false;

  // 幂等: 已经注入过就不重复插
  if (菜单.querySelector(`[${菜单标记}]`)) return true;

  // 结构照抄旁边的原生条目: 优先放进 extension_container, 没有就放菜单本身
  const 容器 = (菜单.querySelector('.extension_container') as HTMLElement | null) ?? 菜单;
  // 借一个现成条目当模板, 这样 class 与原生的完全一致(不自己造样式)
  const 模板 = 菜单.querySelector('.list-group-item') as HTMLElement | null;

  const 条目 = doc.createElement(模板?.tagName ?? 'div');
  条目.setAttribute(菜单标记, '1');
  if (模板) {
    条目.className = 模板.className; // 原样照抄, 保证外观一致
  } else {
    条目.className = 'list-group-item flex-container flexGap5 interactable';
  }
  条目.setAttribute('tabindex', '0');
  条目.setAttribute('role', 'button');
  条目.setAttribute('title', '打开人设工坊');
  // 图标沿用扩展菜单里常见的 fa 图标(原生条目也是这么写的)
  条目.innerHTML =
    '<div class="fa-solid fa-users-gear extensionsMenuExtensionButton" aria-hidden="true"></div>' +
    '<span>人设工坊</span>';

  条目.addEventListener('click', () => {
    面板开.value = !面板开.value;
    // 原生条目的行为是点完收起菜单
    doc.getElementById('extensionsMenuButton')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  容器.appendChild(条目);
  console.info('[人设工坊] 已注入扩展菜单条目');
  return true;
}

/** 兜底: 退回脚本按钮(会出现在 Quick Replies 栏)。只在注入失败时用。 */
function 注册脚本按钮(): void {
  appendInexistentScriptButtons([{ name: 按钮名, visible: true }]);
  eventOn(getButtonEvent(按钮名), () => {
    面板开.value = !面板开.value;
  });
  console.warn('[人设工坊] 扩展菜单注入失败, 已退回脚本按钮(会出现在 Quick Replies 栏)');
}

/**
 * 扩展菜单注入**成功**后, 清掉 Quick Replies 栏里遗留的旧「人设工坊」脚本按钮。
 *
 * ⚠️ **只有注入成功才清** —— 走兜底时那个按钮是唯一入口, 清了就没入口了(#78 dsh 强调)。
 * 幂等: 反复调用无害(表里没有这个名字就是空操作)。
 */
function 清理旧脚本按钮(): void {
  try {
    updateScriptButtonsWith(表 => 表.filter(项 => 项.name !== 按钮名));
  } catch (error) {
    console.warn('[人设工坊] 清理 Quick Replies 栏的旧脚本按钮失败, 可手动删:', error);
  }
}

/** 挂入口: 先试扩展菜单, 失败才退回脚本按钮 */
function 挂入口(): void {
  if (注入扩展菜单()) 清理旧脚本按钮();
  else 注册脚本按钮();
  // 酒馆可能重建菜单 —— APP_READY 后补注入一次(不用轮询定时器)
  eventOn(tavern_events.APP_READY, () => {
    if (注入扩展菜单()) 清理旧脚本按钮();
  });
}

function 启动() {
  const app = createApp(面板).use(createPinia());

  挂入口();

  // 清掉酒馆助手给 iframe 加的默认边框/焦点环
  if (!document.getElementById('fg-panel-force-style')) {
    const style = document.createElement('style');
    style.id = 'fg-panel-force-style';
    style.textContent = `
      iframe[script_id] { border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; }
      iframe[script_id]:focus, iframe[script_id]:focus-visible, iframe[script_id]:focus-within { outline: none !important; }`;
    document.head.appendChild(style);
  }

  const $app = $('<iframe>')
    .attr({ script_id: getScriptId(), frameborder: 0, tabindex: -1, srcdoc: SRCDOC })
    .css({
      position: 'fixed',
      left: '0px',
      top: '0px',
      // 初始 0×0: 没开面板时完全不占位置, 也不吃指针事件
      width: '0px',
      height: '0px',
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      pointerEvents: 'none',
      zIndex: String(层序),
    })
    .appendTo('body');

  $app.on('load', () => {
    const nestedDoc = ($app[0] as HTMLIFrameElement).contentDocument;
    if (!nestedDoc) return;
    copyStylesTo(nestedDoc);
    钉透明底(nestedDoc);
    app.mount(nestedDoc.body);
    window.setTimeout(() => {
      copyStylesTo(nestedDoc);
      钉透明底(nestedDoc);
    }, 300);
    window.setTimeout(() => {
      copyStylesTo(nestedDoc);
      钉透明底(nestedDoc);
    }, 1200);
  });

  $(window).on('pagehide', () => {
    app.unmount();
    $app.remove();
  });
}

$(() => {
  errorCatched(启动)();
});
