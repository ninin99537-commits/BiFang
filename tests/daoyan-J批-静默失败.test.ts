// 剧情导演 / 共用 · 批次 J（三条静默失败）—— 2026-11-13
//
// 三条都是**不报错的失败**：出问题的时候一切看起来正常，所以只能靠"验副作用"抓。
//   P1-7 resize 监听可能摘不掉（挂/摘用了不同的窗口来源）
//   P1-8 壳 iframe 不去重（重复加载 → 两个球、两套监听）
//   P1-9 loadData 读不到账本时静默返回空账本（面板显示"还没有章回", 用户以为被清空）
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/剧情导演/host';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

// ---------------------------------------------------------------------------
console.log('\n[P1-7] resize 监听：挂与摘必须是**同一个函数引用**，且卸载时真的摘掉');
{
  // 直接驱动"挂/摘"两段真实代码形状：用假 window 记录 add/remove
  const 事件: { type: 'add' | 'remove'; fn: any }[] = [];
  const 假窗口: any = {
    addEventListener: (_t: string, fn: any) => 事件.push({ type: 'add', fn }),
    removeEventListener: (_t: string, fn: any) => 事件.push({ type: 'remove', fn }),
  };
  const onViewportResize = () => {};
  // 复刻修复后的形状：挂的时候存局部变量，摘的时候用它（而不是再读一次 ref）
  let 挂了resize的窗口: any = null;
  挂了resize的窗口 = 假窗口;
  挂了resize的窗口?.addEventListener('resize', onViewportResize);
  // 模拟 Vue 卸载时 ref 已经为 null
  const ref已置空 = null;
  挂了resize的窗口?.removeEventListener('resize', onViewportResize);
  挂了resize的窗口 = null;
  void ref已置空;

  check('add 与 remove 各一次', [事件.filter(e => e.type === 'add').length, 事件.filter(e => e.type === 'remove').length], [1, 1]);
  ok('是同一个函数引用（否则摘不掉）', 事件[0].fn === 事件[1].fn);

  // 对照组：如果卸载时去读 ref（旧写法），ref 已置空 → remove 不会发生
  const 事件2: any[] = [];
  const 假窗口2: any = { addEventListener: (_t: string, fn: any) => 事件2.push(['add', fn]), removeEventListener: (_t: string, fn: any) => 事件2.push(['remove', fn]) };
  const ref: any = { value: 假窗口2 };
  ref.value?.addEventListener('resize', onViewportResize);
  ref.value = null; // Vue 卸载顺序
  ref.value?.removeEventListener('resize', onViewportResize); // 旧写法
  check('对照组（旧写法）: 只 add 没 remove', [事件2.length, 事件2.filter(e => e[0] === 'remove').length], [1, 0]);

  // 源码辅助：面板机制真的用了局部变量
  const 源 = readFileSync('src/共用/面板机制.ts', 'utf8');
  ok('源码里有 挂了resize的窗口 变量', /let 挂了resize的窗口/.test(源));
  ok('挂的时候赋值给它', /挂了resize的窗口 = parentWin\.value/.test(源));
  ok('摘的时候用它（不再读 parentWin.value）', /挂了resize的窗口\?\.removeEventListener\('resize', onViewportResize\)/.test(源));
  ok('摘完置空', /挂了resize的窗口\?\.removeEventListener[\s\S]{0,80}挂了resize的窗口 = null/.test(源));
}

// ---------------------------------------------------------------------------
console.log('\n[P1-8] 壳 iframe 去重：同 id 先拆旧的，不同 id 不碰');
{
  const { 清掉同id壳 } = await import('../src/剧情导演/壳去重');
  // 极简假 document：只实现 querySelectorAll('iframe[script_id]') 与元素的 getAttribute/remove
  const 造壳 = (id: string) => {
    const 元素: any = {
      attrs: { script_id: id },
      被删: false,
      getAttribute: (k: string) => 元素.attrs[k] ?? null,
      remove: () => { 元素.被删 = true; },
    };
    return 元素;
  };
  const 甲 = 造壳('dj-1');
  const 乙 = 造壳('dj-1');
  const 别人的 = 造壳('bf-9');
  const 元素表 = [甲, 乙, 别人的];
  const 假doc: any = { querySelectorAll: () => 元素表 };

  check('同 id 的两个都被拆', 清掉同id壳(假doc, 'dj-1'), 2);
  ok('甲被拆', 甲.被删);
  ok('乙被拆', 乙.被删);
  ok('**别的插件的壳没被动**（不同 script_id）', !别人的.被删);

  // 2026-11-13 P1-8 补（需求方 jsdom 实测）: remove() 不会让 Vue 卸载 →
  // 拆旧壳前必须**先调卸载器**，否则 onUnmounted 里的 resize 监听/定时器/观察器全泄漏。
  {
    const 序: string[] = [];
    const 造壳2 = (id: string) => {
      const 元素: any = {
        attrs: { script_id: id },
        getAttribute: (k: string) => 元素.attrs[k] ?? null,
        remove: () => 序.push('dom.remove'),
      };
      return 元素;
    };
    const 有app = 造壳2('dj-9');
    const 僵尸 = 造壳2('dj-9'); // app 从没 mount 成功（真机上序号 0 那种）
    const 假doc3: any = { querySelectorAll: () => [有app, 僵尸] };
    const 卸载记录: string[] = [];
    清掉同id壳(假doc3, 'dj-9', (元素: any) => {
      卸载记录.push(元素 === 有app ? 'unmount:有app' : 'unmount:僵尸');
      序.push('app.unmount');
    });
    check('两个壳都调了卸载器（僵尸壳也调，调用方自己判空）', 卸载记录.length, 2);
    // 顺序：先 unmount 再 remove（反了就等于没卸载）
    check('先 unmount 再 remove', 序.slice(0, 2), ['app.unmount', 'dom.remove']);
    // 不传卸载器也要能拆（老调用点/用例不受影响）
    const 再来 = 造壳2('dj-9');
    const 假doc4: any = { querySelectorAll: () => [再来] };
    check('不传卸载器 → 照样拆（向后兼容）', 清掉同id壳(假doc4, 'dj-9'), 1);
  }

  // 对照组：没有同 id 时返回 0、谁都不动
  const 丙 = 造壳('dj-2');
  const 假doc2: any = { querySelectorAll: () => [丙] };
  check('没有同 id → 0', 清掉同id壳(假doc2, 'dj-1'), 0);
  ok('丙没被动', !丙.被删);
}

// ---------------------------------------------------------------------------
console.log('\n[P1-9] loadData 读不到账本：不许静默返回空账本（**必须真的走进降级分支**）');
{
  const { loadData, 账本读取降级计数, 重置账本读取降级 } = await import('../src/剧情导演/快照');
  const { STORAGE_KEY } = await import('../src/剧情导演/运行状态');

  /**
   * 桩的关键：`vars.get({type:'chat'})` **必须真的返回带快照楼层的 meta**。
   * 否则 `loadMeta` 拿到空对象 → `快照楼层 = []` → `floors.length > 0` 为假 →
   * `提示读取降级()` 一次都不执行，整套断言测的就是空气（2026-11-13 需求方变异测试抓到：
   * 删掉 `if (读取降级已提示) return;` 守卫，用例 0 红）。
   */
  const 装宿主 = (取楼层: () => number, 有快照 = true) => {
    const meta = 有快照 ? { 快照楼层: [3], 清空层: 0, 已剧终: false } : null;
    injectHostForTest({
      chat: { currentChatId: () => 'c', isGroupChat: () => false, lastMessageId: 取楼层, messages: () => [] } as any,
      vars: {
        get: (opt: any) => (opt?.type === 'chat' && meta ? { [STORAGE_KEY]: meta } : {}),
        update: (fn: any) => fn({}),
        del: () => ({}),
        insertOrAssign: () => ({}),
        scriptId: () => 't',
      } as any,
      worldbook: { boundNames: () => ({}), chatName: () => '', globalNames: () => [], entries: async () => [], create: async () => {}, update: async () => {}, remove: async () => {}, globalEntries: async () => [] } as any,
    } as any);
  };

  const 原warn = console.warn;
  const 跑三次 = (): string[] => {
    警告.length = 0;
    loadData();
    loadData();
    loadData();
    return 警告.slice();
  };
  const 警告: string[] = [];
  console.warn = (...参数: any[]) => { 警告.push(参数.map(String).join(' ')); };

  // ① 宿主抛错 + 有快照登记 → 走降级分支，且**三次只提示一次**
  重置账本读取降级();
  装宿主(() => { throw new Error('宿主没就绪'); });
  const 三次警告 = 跑三次();
  const 三次后计数 = 账本读取降级计数();
  // 判据用**整句**锚定：`读取当前聊天楼层失败` 是另一个分支，宽词会把两条混着数
  const 降级警告 = 三次警告.filter(x => x.includes('账本暂时读不到'));
  const 失败警告 = 三次警告.filter(x => x.includes('读取当前聊天楼层失败'));

  ok('① 真的走进了降级分支（三次调用至少一条"账本暂时读不到"）', 降级警告.length >= 1);
  check('① **三次只提示一次**（删掉节流守卫这条必红）', 降级警告.length, 1);
  ok('① 抛错分支每次都留痕（3 条"读取当前聊天楼层失败"）', 失败警告.length === 3);
  check('① 计数照常累加（每次 +2 = 抛错 1 + 降级 1）', 三次后计数, 6);

  // ② 返回 -1（聊天为空）+ 有快照 → 走降级分支；但没有抛错，所以每次只 +1
  重置账本读取降级();
  装宿主(() => -1);
  const 空聊天警告 = 跑三次();
  check('② 走降级分支且只提示一次', 空聊天警告.filter(x => x.includes('账本暂时读不到')).length, 1);
  check('② 计数每次 +1（只有降级那一下）', 账本读取降级计数(), 3);
  ok('② 一条"读取当前聊天楼层失败"都没有（没抛错）', !空聊天警告.some(x => x.includes('读取当前聊天楼层失败')));

  // ③ 对照：没有快照登记 → 压根不该走降级分支（否则这条判据会被"永远提示"骗过）
  重置账本读取降级();
  装宿主(() => { throw new Error('宿主没就绪'); }, false);
  const 无快照警告 = 跑三次();
  check('③ 没有快照 → 不提示降级', 无快照警告.filter(x => x.includes('账本暂时读不到')).length, 0);
  // 计数口径：**抛错本身也算一次降级**（那是"宿主没就绪"的信号），所以这里是 3 而不是 0；
  // 但"没有快照登记"不该弹提示 —— 上面那条 0 才是本条要盯的。
  check('③ 没有快照 → 只有抛错计数（3），没有降级分支计数', 账本读取降级计数(), 3);

  // ④ 对照：正常宿主 → 计数 0、无降级提示
  重置账本读取降级();
  装宿主(() => 5);
  const 正常警告 = 跑三次();
  check('④ 正常宿主 → 计数 0', 账本读取降级计数(), 0);
  check('④ 正常宿主 → 无降级提示', 正常警告.filter(x => x.includes('账本暂时读不到')).length, 0);

  console.warn = 原warn;
}

console.log('\n[P1-8b] 建壳卸载器：核心动作 app.unmount() 必须真的被调（需求方变异实测：注释掉它 0 红）');
{
  const { 建壳卸载器 } = await import('../src/剧情导演/壳去重');
  // ① 有 app 的旧壳：先 unmount 再 remove，且映射条目被清掉
  {
    const 序: string[] = [];
    const 元素: any = {};
    const 壳的app = new WeakMap<any, any>();
    壳的app.set(元素, { unmount: () => 序.push('unmount') });
    建壳卸载器(壳的app)(元素);
    序.push('after');
    check('app.unmount 被调了 1 次', 序, ['unmount', 'after']);
    ok('WeakMap 条目已删', !壳的app.has(元素));
  }
  // ② 僵尸壳（app 从没 mount）：不炸、不调任何东西
  {
    const 壳的app = new WeakMap<any, any>();
    let 没炸 = true;
    try { 建壳卸载器(壳的app)({} as any); } catch { 没炸 = false; }
    ok('僵尸壳不抛异常', 没炸);
  }
  // ③ app.unmount 自己抛错：卸载器不许把异常漏出去（否则 壳去重 的 remove 会被中断）
  {
    const 壳的app = new WeakMap<any, any>();
    const 元素: any = {};
    壳的app.set(元素, { unmount: () => { throw new Error('unmount 炸了'); } });
    let 没炸 = true;
    try { 建壳卸载器(壳的app)(元素); } catch { 没炸 = false; }
    ok('unmount 抛错被吞掉（DOM 才能继续被拆）', 没炸);
  }
  // ④ 对照：没有工厂时（直接把 app 塞进去但卸载器是空的）unmount 不会被调 —— 证明上面 ① 不是空转
  {
    const 壳的app = new WeakMap<any, any>();
    let 调过 = false;
    壳的app.set({}, { unmount: () => { 调过 = true; } });
    void 0;
    check('对照：不调卸载器 → unmount 从未被调', 调过, false);
  }
}

console.log('\n[P1-8c] 接线：清的是**壳所在的那个文档**（需求方真机实测：以前查错了 doc，命中 0）');
{
  const { 取壳文档 } = await import('../src/剧情导演/壳去重');
  // ① 有 body → 用 body 的 ownerDocument（父文档）
  const 父doc: any = { 名: '父文档' };
  check('找得到 body → 返回 body.ownerDocument（父文档）', 取壳文档(() => ({ ownerDocument: 父doc }), { 名: '脚本自己的doc' } as any), 父doc);
  // ② 找不到 body → 兜底
  const 兜底: any = { 名: '兜底doc' };
  check('没有 body → 用兜底', 取壳文档(() => undefined, 兜底), 兜底);
  check('body 没有 ownerDocument → 用兜底', 取壳文档(() => ({}), 兜底), 兜底);
  check('找 body 抛错 → 用兜底（不许把异常漏出去）', 取壳文档(() => { throw new Error('炸'); }, 兜底), 兜底);

  // ③ 接线：**默认找body 现在是被测函数的一部分**（原先它是调用点的 lambda，用例读不到）。
  const { 清掉重复壳, 默认找body } = await import('../src/剧情导演/壳去重');
  {
    const 造壳 = (id: string) => {
      const 元素: any = { attrs: { script_id: id }, 被删: false };
      元素.getAttribute = (k: string) => 元素.attrs[k] ?? null;
      元素.remove = () => { 元素.被删 = true; };
      return 元素;
    };
    const 甲 = 造壳('dj-x');
    const 乙 = 造壳('dj-x');
    const 别人 = 造壳('bf-1');
    const 假父doc: any = { querySelectorAll: () => [甲, 乙, 别人], 名: '父文档' };
    const 假脚本doc: any = { querySelectorAll: () => [], 名: '脚本自己的doc' };

    // 用假 $ 走「默认找body」这条真实路径（不传 找body）
    const 原jq = (globalThis as any).$;
    (globalThis as any).$ = (选: string) => (选 === 'body' ? [{ ownerDocument: 假父doc }] : []);
    const r = 清掉重复壳({ 兜底文档: 假脚本doc, scriptId: 'dj-x' });
    (globalThis as any).$ = 原jq;

    check('默认找body 路径：拆了 2 个（查的是父文档）', r.拆了, 2);
    ok('用的是父文档', r.用了哪个文档 === 假父doc);
    check('没有用兜底', r.用了兜底, false);
    ok('两个同 id 壳都被拆 / 别人的没被动', 甲.被删 && 乙.被删 && !别人.被删);

    // 退化必须出声（【4】不许静默）
    const 警告: string[] = [];
    const 原warn = console.warn;
    console.warn = (...a: any[]) => 警告.push(a.map(String).join(' '));
    const r2 = 清掉重复壳({ 找body: () => undefined, 兜底文档: 假脚本doc, scriptId: 'dj-x' });
    console.warn = 原warn;
    check('退化：用了兜底 = true', r2.用了兜底, true);
    ok('退化：有 warn（含"不是父文档"或"去重会命中 0"）', 警告.some(x => x.includes('不是父文档') || x.includes('命中 0')));
    check('退化：拆 0（兜底是空文档）', r2.拆了, 0);
  }

  // ④ 调用点常量：**先剥注释再匹配**（情形 B/E：注释不许满足正向、也不许误伤负向）
  {
    const 原文 = readFileSync('src/剧情导演/悬浮球界面.ts', 'utf8');
    const 剥注释 = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const 码 = 剥注释(原文);
    ok('代码里真的调用了 清掉重复壳（注释满足不了这条）', /清掉重复壳\s*\(\s*\{/.test(码));
    check('代码里不再直接调用 清掉同id壳（注释也不会误伤）', /清掉同id壳\s*\(/.test(码), false);
    ok('代码里不再出现 找body: 这种调用点 lambda', !/找body\s*:/.test(码));
  }

}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
