// 剧情导演 · 聊天未就绪时不许清空账本索引（I-S2）—— 批次 2026-11-20 C1 第 4 步（需求方 #433 ①）。
//
// ── 这个洞是什么 ──
//  导演原来**没有**"聊天未就绪 → 一个字节不写"这条护栏（另外两家都有）：
//  烟火「此前在这里误删索引，导致世界状态消失」、彼方 2026-11-20 补（#423）。
//  **导演一直缺** —— 本批补上。
//
// ── 同型的后果 ──
//  聊天没就绪时每一层都读不到 → 全进 `missingFloors` → 索引被清空
//  → 用户看到"打开聊天，账本没了"。**丢的是全部剧情账本，而且不报错。**
//
// ── 判据 ──
//  ① 未就绪（末层抛错 / -1）→ **索引一层都不许少**
//  ② 正常情况照旧（读到最新 / 往前找 / 超末层的照删）
//  ③ 结构：导演调了内核，且不再自己维护 missingFloors
import { createPinia, setActivePinia } from 'pinia';
import { loadData, 重置账本读取降级, 账本读取降级计数 } from '../src/剧情导演/快照';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { STORAGE_KEY } from '../src/剧情导演/运行状态';

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

const 原I = console.info;
const 原W = console.warn;
const 原E = console.error;
const 原T = console.table;
const 静默 = <T>(fn: () => T): T => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.table = () => {};
  try {
    return fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
    console.table = 原T;
  }
};

/**
 * 假平台 —— **形状照抄 `daoyan-snapshot.test.ts` 的 `makeFakePlatform`**（那个已被 74 个用例验证过）。
 *
 * 关键差异（我第一次写错过）：
 *  · `chat.messages` 接受**区间串**（`'0-10'`）或数字
 *  · `chatVars` 是**整个聊天变量对象**（索引在 `chatVars[STORAGE_KEY]` 里，不是 chatVars 本身）
 *  · `vars.get` 对不存在的楼层**抛错**
 */
function 造平台(选项: {
  索引?: number[];
  末层?: number | '抛错';
  消息在?: number[];
  有快照?: number[];
}) {
  const 楼层: Record<string, { role: string; message: string; is_hidden: boolean }> = {};
  const 楼层变量: Record<string, any> = {};
  let 聊天变量: Record<string, any> = {
    [STORAGE_KEY]: { 版本: 1, 快照楼层: [...(选项.索引 ?? [])], 清空层: 0, 已剧终: false, 离线: {} },
  };

  const 消息集合 = new Set(选项.消息在 ?? 选项.索引 ?? []);
  for (const id of 消息集合)
    楼层[String(id)] = { role: 'assistant', message: `第${id}楼正文`, is_hidden: false };

  for (const id of 选项.有快照 ?? 选项.索引 ?? []) {
    楼层变量[String(id)] = {
      [STORAGE_KEY]: { 版本: 1, 楼层: id, 处理到楼层: id, 章回: { 章号: id, 标题: `第${id}层` } },
    };
  }

  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat')
          return 聊天变量;
        if (option.type === 'global')
          return { 剧情导演_settings: {} };
        const id = String(option.message_id);
        if (!(id in 楼层))
          throw new Error(`楼层 #${id} 不存在`);
        return 楼层变量[id] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          聊天变量 = updater(聊天变量) ?? 聊天变量;
          return 聊天变量;
        }
        const id = String(option.message_id);
        if (!(id in 楼层))
          throw new Error(`楼层 #${id} 不存在`);
        楼层变量[id] = updater(楼层变量[id] ?? {}) ?? 楼层变量[id];
        return 楼层变量[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete 聊天变量[path];
          return { variables: 聊天变量, delete_occurred: true };
        }
        const id = String(option.message_id);
        if (楼层变量[id])
          delete 楼层变量[id][path];
        return { variables: 楼层变量[id] ?? {}, delete_occurred: true };
      },
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out = [];
        for (let i = from; i <= to; i++) {
          const m = 楼层[String(i)];
          if (!m)
            continue;
          if (options.role && options.role !== 'all' && m.role !== options.role)
            continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId() {
        if (选项.末层 === '抛错')
          throw new Error('模拟：宿主还没就绪');
        if (typeof 选项.末层 === 'number')
          return 选项.末层;
        const ids = Object.keys(楼层).map(Number);
        return ids.length > 0 ? Math.max(...ids) : -1;
      },
      currentSwipe: () => 0,
    },
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };

  return {
    host,
    取索引: () => [...(聊天变量[STORAGE_KEY]?.快照楼层 ?? [])],
  };
}

function 准备(选项: Parameters<typeof 造平台>[0]) {
  const p = 造平台(选项);
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  resetSettingsReadCacheForTest();
  重置账本读取降级();
  return p;
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I-S2] 末层抛错 + 索引有 3 层 → 索引一层都不许少');
{
  // ── 这条是本次补的洞 ──
  const { 取索引 } = 准备({
    索引: [3, 5, 7],
    末层: '抛错',
    消息在: [],      // 全读不到 = 没就绪的样子
    有快照: [3, 5, 7],
  });

  const 前 = 取索引();
  const 账 = 静默(() => loadData());

  eq('★ 索引仍是 3 层（没被清）', 取索引(), 前);
  eq('★ 返回空账本（界面先按空展示）', 账.章回, null);
  ok('★ 降级计数被记了（可观测）', 账本读取降级计数() > 0);
}

console.log('\n[I-S2] 末层返回 -1 → 同样不许清');
{
  const { 取索引 } = 准备({ 索引: [3, 5], 末层: -1, 消息在: [], 有快照: [3, 5] });
  const 前 = 取索引();
  静默(() => loadData());
  eq('索引仍是 2 层', 取索引(), 前);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[正常] 楼层都在、快照都在 → 读到最新那份');
{
  const { host } = 准备({ 索引: [3, 5, 7], 末层: 7, 消息在: [3, 5, 7], 有快照: [3, 5, 7] });
  const 账 = 静默(() => loadData());
  eq('读到最新那份（#7）', 账.章回?.章号, 7);
  eq('锚点楼层是 7', 账.锚点楼层, 7);
}

console.log('\n[正常] 最新那层没快照（重 roll）→ 往前找，且不算已删');
{
  const { 取索引 } = 准备({
    索引: [3, 5, 7],
    末层: 7,
    消息在: [3, 5, 7],
    有快照: [3, 5],   // 7 没有快照
  });
  const 账 = 静默(() => loadData());
  eq('往前找到 #5', 账.章回?.章号, 5);
  eq('#7 没被从索引里剔掉（它只是没存过）', 取索引().includes(7), true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[I-S4] 楼层号超出末层 → 该删的照删（护栏不许把正常清理也挡掉）');
{
  const { 取索引 } = 准备({
    索引: [3, 5, 20],
    末层: 10,
    消息在: [3, 5],
    有快照: [3, 5],
  });
  静默(() => loadData());
  eq('超范围的 20 被剔掉', 取索引().includes(20), false);
  eq('有效的 3、5 留着', 取索引().sort((a: number, b: number) => a - b), [3, 5]);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] 导演确实调了内核，且不再自己维护 missingFloors');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 导演源 = readFileSync(path.join(process.cwd(), 'src/剧情导演/快照.ts'), 'utf8');
  const 内核源 = readFileSync(path.join(process.cwd(), 'src/共用/楼层快照.ts'), 'utf8');
  const 导演代码 = 导演源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const 内核代码 = 内核源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] 导演调了 取最新有效', /取最新有效\(/.test(导演代码));
  ok('[结构] 导演处理了 未就绪', /读结果\.未就绪/.test(导演代码));
  ok('[结构] 内核有 I-S2 护栏', /!\(末层 >= 0\)[\s\S]{0,300}?未就绪: true/.test(内核代码));

  // **自证**：旧写法（自己 for 循环 + missingFloors）已经不在了
  ok('[自证] 导演不再自己维护 missingFloors',
     !/missingFloors\.push/.test(导演代码));
  // **自证**：旧写法确实有过（用注释里的历史说明证明）
  ok('[自证] 注释里保留了"原来没有护栏"的记录',
     /I-S2|没有.*护栏|一直缺/.test(导演源));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
