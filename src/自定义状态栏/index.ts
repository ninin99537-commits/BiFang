import './polyfill';
import { createApp, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createScriptIdDiv, getTavernDocument, reloadOnChatChange, teleportStyle } from '@util/script';
import App from './App.vue';
import { initDataSource } from './lib/datasource';

const HOST_ID = 'custom-status-bar-host';
const HOST_ATTR = 'data-custom-status-bar';

/** 最新消息楼层（主页面 #chat 直接子节点 .mes） */
function findLastMes(doc: Document): HTMLElement | null {
  const chat = doc.querySelector('#chat');
  if (!chat) return null;
  const lastMarked = chat.querySelector(':scope > .mes.last_mes') as HTMLElement | null;
  if (lastMarked) return lastMarked;
  const all = chat.querySelectorAll(':scope > .mes');
  return (all[all.length - 1] as HTMLElement) || null;
}

/** #chat 直接子节点里的 ACU 根（.acu-wrapper） */
function findAcuWrapper(chat: HTMLElement): HTMLElement | null {
  return (
    (chat.querySelector(':scope > .acu-wrapper') as HTMLElement | null) ||
    (chat.querySelector(':scope > .acu-dice-ui-root') as HTMLElement | null)
  );
}

/**
 * 挂到 #chat 内、ACU(.acu-wrapper) 上方（最新 .mes 与 ACU 之间）。
 * #chat 为 flex column，勿设过大 order，否则会被排到 ACU 下面。
 * 脚本在 iframe 内，必须用 getTavernDocument()。
 */
function placeHost(host: HTMLElement) {
  const doc = getTavernDocument();
  const chat = doc.querySelector('#chat') as HTMLElement | null;
  if (!chat) {
    if (!host.parentElement) doc.body.appendChild(host);
    return;
  }

  const acu = findAcuWrapper(chat);
  if (acu) {
    if (host.parentElement !== chat || acu.previousElementSibling !== host) {
      acu.before(host);
    }
    return;
  }

  const lastMes = findLastMes(doc);
  if (lastMes) {
    if (host.parentElement !== chat || lastMes.nextElementSibling !== host) {
      lastMes.after(host);
    }
    return;
  }

  if (host.parentElement !== chat || chat.lastElementChild !== host) {
    chat.appendChild(host);
  }
}

function init() {
  const doc = getTavernDocument();
  doc.getElementById(HOST_ID)?.remove();
  doc.querySelectorAll(`[${HOST_ATTR}]`).forEach(el => el.remove());
  doc.getElementById('custom-status-bar-dock-style')?.remove();
  try {
    doc.documentElement.style.removeProperty('--csb-dock-height');
  } catch {
    /* ignore */
  }

  void initDataSource();

  // createScriptIdDiv 用的是脚本侧 jQuery（实际是 parent.$），元素需插入主页面
  const $host = createScriptIdDiv()
    .attr({ id: HOST_ID, [HOST_ATTR]: '1' })
    .css({
      display: 'block',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      margin: '8px 0 4px',
      flexShrink: '0',
      position: 'relative',
      zIndex: '1',
      // 弹窗在状态栏内 absolute 扩展时不被裁切
      overflow: 'visible',
      // 勿设过大 order：#chat 为 flex，order 过大会把本栏排到 .acu-wrapper 下面
      order: '0',
    });
  const host = $host[0] as HTMLElement;

  placeHost(host);

  const app: VueApp = createApp(App).use(createPinia());
  app.mount(host);
  const { destroy: destroyStyle } = teleportStyle();

  const reanchor = () => placeHost(host);

  const bootTimers = [0, 50, 150, 400, 1000, 2000].map(ms => window.setTimeout(reanchor, ms));

  const stops: Array<() => void> = [];
  const on = <T extends EventType>(ev: T, fn: ListenerType[T]) => {
    stops.push(eventOn(ev, errorCatched(fn)).stop);
  };

  on(tavern_events.CHARACTER_MESSAGE_RENDERED, () => setTimeout(reanchor, 0));
  on(tavern_events.USER_MESSAGE_RENDERED, () => setTimeout(reanchor, 0));
  on(tavern_events.MESSAGE_RECEIVED, () => setTimeout(reanchor, 0));
  on(tavern_events.MESSAGE_SENT, () => setTimeout(reanchor, 0));
  on(tavern_events.MESSAGE_DELETED, () => setTimeout(reanchor, 50));
  on(tavern_events.MESSAGE_SWIPED, () => setTimeout(reanchor, 0));
  on(tavern_events.GENERATION_ENDED, () => setTimeout(reanchor, 0));
  on(tavern_events.MORE_MESSAGES_LOADED, () => setTimeout(reanchor, 200));
  on(tavern_events.CHAT_CHANGED, () => setTimeout(reanchor, 100));
  on('chatLoaded' as EventType, () => setTimeout(reanchor, 100));

  const chatEl = doc.querySelector('#chat');
  let chatMo: MutationObserver | null = null;
  if (chatEl && typeof MutationObserver !== 'undefined') {
    let t: number | null = null;
    chatMo = new MutationObserver(() => {
      if (t != null) return;
      t = window.setTimeout(() => {
        t = null;
        if (!doc.documentElement.contains(host)) placeHost(host);
        else reanchor();
      }, 30);
    });
    chatMo.observe(chatEl, { childList: true });
  }

  const chatReload = reloadOnChatChange();

  console.info('[自定义状态栏] 已挂载到输入框上方');

  // pagehide 在脚本 iframe 上触发
  $(window).on('pagehide', () => {
    bootTimers.forEach(id => window.clearTimeout(id));
    chatReload.stop();
    stops.forEach(s => s());
    chatMo?.disconnect();
    app.unmount();
    destroyStyle();
    host.remove();
  });
}

$(() => {
  errorCatched(init)();
});
