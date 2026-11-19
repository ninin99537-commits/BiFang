// 彼方 · 模型输出里的**非法 NPC 名字**（`__proto__` 型）—— 批次 2026-11-19（需求方 #340 / F1）。
//
// 这个用例守的是一条**数据完整性**约束：模型给出 `__proto__` 这种名字时，
// 不许出现「名单里有它、NPC 里没有它」的半死状态。
//
// ── 为什么这条比"格式校验"重要 ──
//  这个 bug 是**每轮复现、永不自愈**的：
//    第 N 轮：名单 = ['__proto__']，NPC = {}
//    第 N+1 轮：AI 被要求更新一张不存在的卡 → 可能触发格式失败循环
//  而它**不报错**——面板只是少一个人，没人知道为什么。
//
// ── 两道防线，各测各的 ──
//  ① 入口：`认出NPC` 拦下非法名字（不进名单、不建卡、warn）
//  ② 写入：`写自身属性` 用 defineProperty，即使名字漏过来也不会走 setter
//
// 参照写法: tests/bifang-worldbook-shutdown.test.ts 的 ok/eq + 自证段。
import { createPinia, setActivePinia } from 'pinia';
import { 认出NPC } from '../src/彼方_NPC幕后生命状态系统/模型请求';
import { useUpdatingStore } from '../src/彼方_NPC幕后生命状态系统/任务中断';

setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 收集 warn（判据要能看见"有没有出声"） */
function 静默收警(fn: () => void): string[] {
  const 原W = console.warn;
  const 警: string[] = [];
  console.warn = (...a: any[]) => 警.push(a.join(' '));
  try {
    fn();
  }
  finally {
    console.warn = 原W;
  }
  return 警;
}

// ─────────────────────────────────────────────────────────────
console.log('\n[1] 入口拦：`__proto__` 不进 NPC 清单、不建卡、有 warn');
{
  // ⚠ 必须用 `JSON.parse` 造输入 —— 对象字面量里写 `{__proto__: x}` 会**直接改原型**，
  //   连"模型输出的那个键"都造不出来。模型给的是 JSON 文本，JSON.parse 之后才有那个自身属性。
  const parsed = { NPC: JSON.parse('{"__proto__": {"当前在做": "在柜台后"}}') };
  eq('构造的输入里确实有 __proto__ 这个键', Object.keys(parsed.NPC), ['__proto__']);

  let 结果: ReturnType<typeof 认出NPC> = [];
  const 警 = 静默收警(() => { 结果 = 认出NPC(parsed); });

  eq('__proto__ 不进 NPC 清单', 结果.map(x => x.名), []);
  ok('有 warn 说明为什么忽略', 警.some(s => s.includes('非法名字')), 警.join(' | ').slice(0, 120));
  ok('不抛错（能正常返回）', Array.isArray(结果));

  // 自证：这条判据能区分"拦住了"和"根本没测到"
  ok('[自证] 若输入里没有这个键，上面第一条会假绿', Object.keys(parsed.NPC).length === 1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[2] `constructor` 照常放行（实测它没有 __proto__ 那个问题）');
{
  // 为什么单列一条：如果判据写成"所有名字都要转义"，这条会红 ——
  // 那说明改坏了本来正常的路径（验收实测 constructor 是正常的）。
  const 警 = 静默收警(() => {
    const 结果 = 认出NPC({ NPC: { constructor: { 当前在做: 'x' } } });
    eq('constructor 被正常收下', 结果.map(x => x.名), ['constructor']);
  });
  eq('constructor 不触发 warn', 警.length, 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[3] 正常名字照常建卡（防判据误伤）');
{
  const 名单 = ['泰丝', '乔尔', '艾莉', '张三', '带 空格 的名字', '带"引号"的名字', '换\n行的名字', 'x'.repeat(500)];
  const NPC: Record<string, any> = {};
  for (const 名 of 名单)
    NPC[名] = { 当前在做: 'x' };

  const 警 = 静默收警(() => {
    const 结果 = 认出NPC({ NPC });
    eq('所有正常名字都被收下', 结果.length, 名单.length);
  });
  eq('正常名字不触发 warn', 警.length, 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[4] 自证：绕过入口直接赋值会丢卡（证明入口那道不是空转）');
{
  // 这就是"没有入口过滤"时会发生的事。**它不是模拟，就是那个 bug 本身。**
  const NPC: Record<string, any> = {};
  NPC['__proto__'] = { 当前在做: 'x' };
  eq('直接赋值：Object.keys 里没有 __proto__', Object.keys(NPC).includes('__proto__'), false);
  // 而且原型被改了 —— 这是更隐蔽的副作用
  eq('直接赋值：原型被改成了那张卡', (NPC as any).当前在做, 'x');

  // 第二道防线用的写法能保住自身属性
  const NPC2: Record<string, any> = {};
  Object.defineProperty(NPC2, '__proto__', { value: { 当前在做: 'x' }, enumerable: true, writable: true, configurable: true });
  eq('defineProperty：能保住自身属性', Object.keys(NPC2).includes('__proto__'), true);

  // **判据自证**：两条路的结果必须不同，否则说明这条断言测不到东西
  ok('[自证] 两条路结果确实不同', Object.keys(NPC).length !== Object.keys(NPC2).length,
     `直接=${Object.keys(NPC).length} / defineProperty=${Object.keys(NPC2).length}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[5] F2：更新中切聊天 → cancel + stop 必须复位（#344）');
{
  // ── 这条防的是什么 ──
  //  聊天 A 点「手动更新」→ 请求在飞 → 用户切到聊天 B →
  //  若不取消，更新 A 的收尾会用**聊天 B 的世界书**写入 **A 的状态**。
  //
  //  这里测的是 `handleChatChanged` 里那三句（cancel / stop / toast）的**效果**；
  //  函数本身在 index.ts（会拉进 .vue，node 里加载不了），所以按"它调用的能力"验。
  const 仓 = useUpdatingStore();
  const signal = 仓.start('正在分析最近楼层', '幕后');

  ok('start 后 isActive 为真', 仓.isActive() === true);
  ok('start 后 active 为真', 仓.active === true);
  eq('信号未中断', signal.aborted, false);

  // handleChatChanged 里做的事
  仓.cancel();
  仓.stop();

  eq('cancel 后信号被中断（旧请求真的会停）', signal.aborted, true);
  eq('stop 后 isActive 为假', 仓.isActive(), false);
  eq('stop 后 active 为假（界面不再显示"更新中"）', 仓.active, false);

  // 自证：不 cancel 就不会中断 —— 证明上面那条不是恒真
  const 仓2 = useUpdatingStore();
  const signal2 = 仓2.start('第二次', '幕后2');
  仓2.stop(); // 只 stop 不 cancel
  eq('[自证] 只 stop 不 cancel 时信号仍是活的', signal2.aborted, false);
  仓2.cancel();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
