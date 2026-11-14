// 测试台: 把「提示条画在哪个文档上」这件事摆出来, 让 node 里也能真跑一遍 DOM。
//
// 背景: 三个插件的提示条都是往 window.parent.document 里画 DOM 的 —— 脚本与悬浮球界面跑在 iframe 里,
// 弹窗画在酒馆父页面上。node 里没有那个文档, 所以旧用例只能断言源码文本(世界流水线用例里明确写着
// "提示条不在这里断言")。现在渲染机制收进了 共用/提示条.ts, 它只认 window.parent.document 这一条路径,
// 于是这里用 jsdom 造出**父页面**, 再把 globalThis.window 伪装成 iframe 窗口, 就能真渲染了。
//
// 用法:
//   const doc = 装父文档();            // 拿到酒馆父页面的 document(globalThis.window 已伪装好)
//   const 计时 = 装计时器();            // 接管 setTimeout/clearTimeout, 退场不再等真的 3.4 秒
//   const 提示条 = 建提示条({ ... });
//   提示条.toastSuccess('...');
//   计时.到期(3400);                    // 手动触发"超时退场"
import { JSDOM } from 'jsdom';

const 父页面骨架 = '<!doctype html><html><head></head><body></body></html>';

/**
 * 造一个"酒馆父页面", 并把 globalThis.window 伪装成跑在 iframe 里的那个窗口
 * (window.parent 指向父页面, 所以 取父文档() 会返回父页面的 document)。
 */
export function 装父文档() {
  const 父 = new JSDOM(父页面骨架);
  const 子 = new JSDOM(父页面骨架);
  globalThis.window = { parent: 父.window, document: 子.window.document };
  return 父.window.document;
}

/** 把 window 伪装成**顶层**窗口(没有父页面): 渲染器应当静默, 不抛错、也不画在自己文档里 */
export function 装顶层窗口() {
  const 自己 = new JSDOM(父页面骨架);
  const 窗口 = { document: 自己.window.document };
  窗口.parent = 窗口;
  globalThis.window = 窗口;
  return 自己.window.document;
}

/** 把 window.parent 换成一个一读就抛的取值器(跨域时就是这个样子) */
export function 装跨域窗口() {
  const 自己 = new JSDOM(父页面骨架);
  globalThis.window = {
    document: 自己.window.document,
    get parent() {
      throw new Error('Blocked a frame from accessing a cross-origin frame');
    },
  };
  return 自己.window.document;
}

/** 接管定时器: 记下 (回调, 延迟), 由用例自己决定什么时候到期 */
export function 装计时器() {
  const 真设 = globalThis.setTimeout;
  const 真清 = globalThis.clearTimeout;
  const 队列 = [];
  let 序号 = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++序号;
    队列.push({ id, fn, ms, 已清: false, 已跑: false });
    return id;
  };
  globalThis.clearTimeout = id => {
    const 项 = 队列.find(t => t.id === id);
    if (项) 项.已清 = true;
  };
  return {
    队列,
    /** 还没被清掉、也还没跑过的定时器 */
    待触发: (ms) => 队列.filter(t => !t.已清 && !t.已跑 && (ms === undefined || t.ms === ms)),
    /** 触发一个延迟为 ms 的待触发定时器(按登记顺序取第一个) */
    到期(ms) {
      const 项 = 队列.find(t => !t.已清 && !t.已跑 && t.ms === ms);
      if (!项) throw new Error(`没有待触发的 ${ms}ms 定时器(现有: ${队列.map(t => `${t.ms}${t.已清 ? '已清' : ''}`).join(',')})`);
      项.已跑 = true;
      项.fn();
      return 项;
    },
    还原() {
      globalThis.setTimeout = 真设;
      globalThis.clearTimeout = 真清;
    },
  };
}

/** 取提示条容器 */
export const 取堆栈 = (doc, 前缀) => doc.getElementById(`${前缀}-toast-stack`);
/** 取容器里现有的提示条(从旧到新) */
export const 取提示条们 = (doc, 前缀) => [...(取堆栈(doc, 前缀)?.children ?? [])];

/**
 * jsdom 会把 #0a0a0a 改写成 rgb(10, 10, 10), 所以期望的颜色先过同一道改写再比。
 * 传**单个颜色**进来, 别传整条声明 —— jsdom 对含 var() 的值原样留着, 对不含 var() 的会去校验,
 * 所以 `3px solid #0a0a0a` 这种整条塞进 color 只会得到空串。
 */
export function 归一色(doc, 值) {
  if (值.startsWith('var(')) return 值;
  const 探针 = doc.createElement('span');
  探针.style.color = 值;
  return 探针.style.color;
}
