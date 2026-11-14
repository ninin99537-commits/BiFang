// 剧情导演 · 壳 iframe 去重（2026-11-13 P1-8）
//
// 重复加载插件会挂出第二个壳 iframe：两个球、两套监听，而 `pagehide` 只清自己那一个。
// 所以 append 之前先把**同 script_id** 的旧壳拆掉。
//
// 单独一个文件是为了能单测：`悬浮球界面.ts` 会 import .vue，用例不该把 SFC 拉进打包图。
/**
 * 2026-11-13 P1-8: 拆掉**同 script_id** 的旧壳（重复加载会挂出第二个球）。
 *
 * 不用 CSS 选择器拼字符串（script_id 里可能有引号/空格），改成取全部再按属性值比。
 * **不复用旧 iframe**：它里面已经挂了一个 Vue app，复用等于两套 app 抢同一个 document。
 * @returns 拆掉了几个
 */
export function 清掉同id壳(doc: Document, id: string, 卸载?: (元素: any) => void): number {
  const 旧壳 = Array.from(doc.querySelectorAll('iframe[script_id]')).filter(
    (元素: any) => String(元素?.getAttribute?.('script_id') ?? '') === id,
  ) as any[];
  for (const 元素 of 旧壳) {
    /**
     * 2026-11-13 P1-8 补（需求方 jsdom 实测）: **`remove()` 不会让 Vue 卸载** ——
     * 它只把 DOM 节点从树里摘走，Vue 不知道，于是 `onUnmounted` 里那套清理
     * （父窗口的 resize 监听 / 量球定时器 / 两个观察器）**全都还在跑**。
     * 而 resize 监听挂在**父窗口**上，iframe 被移除也不会自动回收 ——
     * 真机上已经出现过 2 个同 id 壳（一个是僵尸），如果历史上重复加载过多次，
     * 父窗口上可能已经叠了好几份监听。
     * 所以拆之前必须先让调用方 `app.unmount()`（拿不到 app 实例 = 僵尸壳，卸载器是空操作）。
     */
    try {
      卸载?.(元素);
    } catch (error) {
      console.warn('[剧情导演] 卸载旧壳内的 app 失败（继续拆 DOM）:', error);
    }
    元素?.remove?.();
  }
  if (旧壳.length > 0) console.warn(`[剧情导演] 发现 ${旧壳.length} 个同 id 的旧壳 iframe（重复加载）→ 已卸载并拆掉`);
  return 旧壳.length;
}

/**
 * 2026-11-13 P1-8: 壳 → Vue app 的**卸载器工厂**。
 *
 * 抽出来的唯一理由：`悬浮球界面.ts` import 了 .vue，用例拉不进打包图，
 * 于是 `旧app.unmount()` 这个**核心动作**长期没有用例盯
 * （需求方变异实测：把它注释掉，162 个文件仍然全绿）。
 * 行为与原来内联的回调逐字同形。
 */
export function 建壳卸载器(壳的app: WeakMap<any, any>): (元素: any) => void {
  return (元素: any) => {
    const 旧app = 壳的app.get(元素);
    if (!旧app) return; // 僵尸壳: app 从没 mount 成功过, 没有清理要跑
    try {
      旧app.unmount();
    } catch {
      // 已卸载/未挂载: 忽略
    }
    壳的app.delete(元素);
  };
}

/**
 * 2026-11-13 P1-8 **接线修复**（需求方真机实测）: 算出壳 iframe 真正所在的 document。
 *
 * 为什么需要它：壳是 `$('<iframe>').appendTo('body')` 插进去的 —— 在脚本 iframe 里，
 * jQuery 的 `$('body')` 解析到的是**父文档（酒馆顶层页）的 body**，所以壳活在**父文档**里。
 * 而调用点以前传的是脚本自己的 `document` → 清掉同id壳 在错的文档里查 → 命中 0 → 去重完全没生效
 * （函数体本身是对的：同一份函数体换成父文档，返回 2、壳全拆掉）。
 *
 * 抽成纯函数是为了**让接线本身可测**：传进来的"找 body"是函数，用例可以喂假 body。
 * ⚠️ 不要改成在 `清掉同id壳` 内部自己找 `window.parent` —— 那会把纯函数重新绑回平台。
 */
export function 取壳文档(找body: () => any, 兜底: Document): Document {
  try {
    const 体 = 找body();
    return (体 && 体.ownerDocument) || 兜底;
  } catch {
    return 兜底;
  }
}

/**
 * 2026-11-13 v28: **默认的"找 body"**（原先它作为 lambda 写在调用点里）。
 *
 * 为什么挪进来：接线以前在调用点写 `找body: () => $('body')[0]`，用例只能自己构造一个"正确"的
 * 找body 去喂 清掉重复壳 —— **从没读过调用点那个 lambda**。于是把它改成 `() => undefined`（= 退回
 * "查错文档"那个 bug）时，43 条断言全绿（需求方变异 G 实测）。挪进这里之后，它就是被测函数的一部分。
 */
export function 默认找body(): any {
  const jq = (globalThis as any).$;
  return typeof jq === 'function' ? jq('body')[0] : undefined;
}

/**
 * 取壳文档 的**退化**不许静默：拿不到 body / body 无 ownerDocument / 抛错，都会退回调用点给的兜底文档 ——
 * 而调用点给的兜底是**脚本自己的 document**，那正是 #94 那个 bug 的形态。
 * 所以退化时要出声（有日志），否则又是"静默失效"。
 */
export function 取壳文档并报告(找body: () => any, 兜底: Document): { 文档: Document; 用了兜底: boolean } {
  try {
    const 体 = 找body();
    if (体 && 体.ownerDocument) return { 文档: 体.ownerDocument, 用了兜底: false };
  } catch (error) {
    console.warn('[剧情导演] 取父文档 body 失败（会退回脚本自己的文档, 去重可能失效）:', error);
    return { 文档: 兜底, 用了兜底: true };
  }
  return { 文档: 兜底, 用了兜底: true };
}

/** 同上，但 找body 可省略（省略 = 用 默认找body）。返回值多一个"用了兜底"标记。 */
export function 清掉重复壳(参数: {
  找body?: () => any;
  兜底文档: Document;
  scriptId: string;
  卸载器?: (元素: any) => void;
}): { 拆了: number; 用了哪个文档: Document; 用了兜底: boolean } {
  const 取 = 取壳文档并报告(参数.找body ?? 默认找body, 参数.兜底文档);
  if (取.用了兜底) {
    console.warn('[剧情导演] 壳去重用的是**脚本自己的文档**（不是父文档）—— 真机上去重会命中 0, 等于没生效');
  }
  const 拆了 = 清掉同id壳(取.文档, 参数.scriptId, 参数.卸载器);
  return { 拆了, 用了哪个文档: 取.文档, 用了兜底: 取.用了兜底 };
}
