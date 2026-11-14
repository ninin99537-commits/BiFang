import iframe_srcdoc from './iframe_srcdoc.html';

export async function loadReadme(url: string): Promise<boolean> {
  const readme = await fetch(url);
  if (!readme.ok) {
    return false;
  }
  const readme_text = await readme.text();
  replaceScriptInfo(readme_text);
  return true;
}

/** 酒馆主页面 document（脚本 iframe 内不能用本 iframe 的 document 查 #chat） */
export function getTavernDocument(): Document {
  try {
    return window.parent?.document ?? document;
  } catch {
    return document;
  }
}

export function teleportStyle(
  append_to: JQuery.Selector | JQuery.htmlString | JQuery.TypeOrArray<Element | DocumentFragment> | JQuery = 'head',
): { destroy: () => void } {
  // 全原生 DOM，避免 jQuery 在 Permissions-Policy 禁 unload 的文档里触发 violation
  const doc = getTavernDocument();
  const holder = doc.createElement('div');
  holder.setAttribute('script_id', getScriptId());

  // 样式产生在脚本 iframe 的 document.head；异步组件晚注入的 style 也要同步过去
  const seen = new WeakSet<Element>();
  const syncOne = (style: Element) => {
    if (!(style instanceof HTMLStyleElement) || seen.has(style)) return;
    seen.add(style);
    holder.appendChild(style.cloneNode(true));
  };
  const syncAll = () => {
    document.head?.querySelectorAll('style').forEach(syncOne);
  };
  syncAll();

  let parent: Element | null = null;
  if (typeof append_to === 'string') {
    parent = doc.querySelector(append_to) ?? doc.head;
  } else if (append_to && typeof (append_to as JQuery).jquery === 'string') {
    parent = (append_to as JQuery)[0] ?? doc.head;
  } else if (append_to instanceof Element) {
    parent = append_to;
  } else if (Array.isArray(append_to) && append_to[0] instanceof Element) {
    parent = append_to[0];
  } else {
    parent = doc.head;
  }
  parent?.appendChild(holder);

  let mo: MutationObserver | null = null;
  if (document.head && typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(node => {
          if (node instanceof HTMLStyleElement) syncOne(node);
        });
      }
    });
    mo.observe(document.head, { childList: true });
  }
  // 兜底：首帧后再扫一次（部分打包器会延迟插 style）
  const t1 = window.setTimeout(syncAll, 0);
  const t2 = window.setTimeout(syncAll, 300);
  const t3 = window.setTimeout(syncAll, 1200);

  return {
    destroy: () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      mo?.disconnect();
      holder.remove();
    },
  };
}

export function createScriptIdIframe(): JQuery<HTMLIFrameElement> {
  return $(`<iframe>`).attr({
    script_id: getScriptId(),
    frameborder: 0,
    srcdoc: iframe_srcdoc,
  }) as JQuery<HTMLIFrameElement>;
}

export function createScriptIdDiv(): JQuery<HTMLDivElement> {
  return $('<div>').attr('script_id', getScriptId()) as JQuery<HTMLDivElement>;
}

export function reloadOnChatChange(): EventOnReturn {
  let chat_id = SillyTavern.getCurrentChatId();
  return eventOn(tavern_events.CHAT_CHANGED, new_chat_id => {
    if (chat_id !== new_chat_id) {
      chat_id = new_chat_id;
      window.location.reload();
    }
  });
}
