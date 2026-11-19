// 彼方 · 聊天未就绪时 loadData 不许清空快照索引 —— 批次 2026-11-20 P0（需求方 #423）。
//
// ── 这个 bug 是什么 ──
//  `loadData` 逐楼层读 `host.chat.messages(floorId)`，读不到就 push 进 `missingFloors`
//  （判成"楼层已删"），最后 `saveMeta` 把索引里那些楼层**删掉**。
//
//  而"读不到"有两种原因：
//    ① 楼层真的被删了            → 清索引是对的
//    ② **聊天还没就绪**（还没加载完 / `this_chid` 还没挂 /
//       脚本初始化早于聊天就绪）  → 每一层都读不到 → **索引被整个清空**
//
//  ② 的后果是**状态消失且不报错** —— 用户只看到"打开聊天，人物页空了"。
//  丢的不是设置，是**每个聊天里全部 NPC 状态**。
//
// ── 对照：烟火那份早就补了同一条 ──
//  `烟火_世界运转/保存世界状态.ts` 的注释直接写着
//  「此前在这里误删索引，导致世界状态消失」。彼方这份一直缺。
//
// ── 判据的核心 ──
//  **必须断言"一个字节都没写"**，不能只断言"返回空状态" ——
//  "返回空"和"把索引删了再返回空"在用户眼里一样，但后者是永久损坏。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { loadData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';

(globalThis as any)._ = lodash;
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
    恢复();
  }
};
const 恢复 = () => {
  console.info = 原I;
  console.warn = 原W;
  console.error = 原E;
  console.table = 原T;
};

/**
 * 造一个宿主。
 *
 * @param 选项.索引      聊天变量里的 快照楼层
 * @param 选项.末层      `lastMessageId()` 的返回值；`'抛错'` = 抛异常
 * @param 选项.楼层存在  哪些楼层 `messages()` 能读到（不在集合里 = 读不到）
 * @param 选项.快照楼层  哪些楼层有快照本体
 */
function 造宿主(选项: {
  索引: number[];
  末层: number | '抛错';
  楼层存在?: number[];
  快照楼层?: number[];
}) {
  const 存: any = { global: {}, chat: {}, message: {}, script: undefined };
  存.chat['彼方'] = { 版本: 3, 快照楼层: [...选项.索引], 清空层: 0 };

  const 楼层存在 = new Set(选项.楼层存在 ?? 选项.索引);
  const 有快照 = new Set(选项.快照楼层 ?? 选项.索引);
  for (const id of 有快照) {
    存.message[id] = {
      [STORAGE_KEY]: {
        版本: 3,
        楼层: id,
        原编号: id,
        NPC: { [`人${id}`]: { 当前在做: '测试' } },
        名单: [`人${id}`],
        剧情时间: '2026-01-02 12:30',
      },
    };
  }

  let saveMeta次数 = 0;
  let 写入次数 = 0;

  const host: any = {
    vars: {
      get: (arg: any) => (arg?.type === 'chat'
        ? 存.chat
        : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global)),
      update: (fn: any, arg: any) => {
        写入次数++;
        if (arg?.type === 'chat') {
          saveMeta次数++;
          存.chat = fn(存.chat);
        }
        else if (arg?.type === 'message') {
          存.message[arg.message_id] = fn(存.message[arg.message_id] ?? {});
        }
        else {
          存.global = fn(存.global);
        }
      },
      del: () => {},
      insertOrAssign: (数据: Record<string, any>, arg: any) => {
        写入次数++;
        if (arg?.type === 'message') {
          存.message[arg.message_id] ??= {};
          Object.assign(存.message[arg.message_id], 数据);
        }
      },
      scriptId: () => 't',
    },
    chat: {
      lastMessageId: () => {
        if (选项.末层 === '抛错')
          throw new Error('模拟：聊天还没就绪');
        return 选项.末层;
      },
      messages: (id: number) => (楼层存在.has(id)
        ? [{ message_id: id, role: 'assistant', is_hidden: false, message: `第${id}楼` }]
        : []),
    },
  };

  return {
    host,
    存,
    取SaveMeta次数: () => saveMeta次数,
    取写入次数: () => 写入次数,
    取索引: () => [...(存.chat['彼方']?.快照楼层 ?? [])],
  };
}

// ─────────────────────────────────────────────────────────────
console.log('\n[护栏①] lastMessageId 抛错 + 索引有 3 层 → 一个字节都不许写');
{
  // ── 这条是本次 P0 的核心 ──
  const { host, 取索引, 取SaveMeta次数, 取写入次数 } = 造宿主({
    索引: [3, 5, 7],
    末层: '抛错',
    楼层存在: [], // 每一层都读不到 —— 这就是"聊天还没就绪"的样子
  });

  const 前索引 = 取索引();
  const 数据 = 静默(() => loadData(host));

  eq('★ 索引仍是 3 层（没被清）', 取索引(), 前索引);
  eq('★ saveMeta 一次都没被调', 取SaveMeta次数(), 0);
  eq('★ 任何写盘都没发生（一个字节都没写）', 取写入次数(), 0);
  eq('返回空状态（这是对的，界面先按空展示）', Object.keys(数据.NPC ?? {}), []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[护栏①] lastMessageId 返回 -1 + 索引有 3 层 → 同样一个字节都不许写');
{
  // ── -1 是"一个有效楼层都没有"，与抛错同义 ──
  const { host, 取索引, 取写入次数 } = 造宿主({
    索引: [3, 5, 7],
    末层: -1,
    楼层存在: [],
  });

  const 前索引 = 取索引();
  静默(() => loadData(host));

  eq('索引仍是 3 层', 取索引(), 前索引);
  eq('一个字节都没写', 取写入次数(), 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[护栏②] 末层有效、但楼层号在范围内却读不到 → 不动索引');
{
  // ── 同一条 P0 的另一半 ──
  //  `lastMessageId() >= 0` 说明聊天有内容，此时"读不到"自相矛盾：
  //  楼层号 <= 末层 → 那个位置应该有消息 → 只能是平台临时异常 → **宁可不清**
  const { host, 取索引, 取写入次数 } = 造宿主({
    索引: [3, 5, 7],
    末层: 10,       // 聊天有 10 层，索引里的 3/5/7 都在范围内
    楼层存在: [],   // 但都读不到 —— 自相矛盾
  });

  const 前索引 = 取索引();
  静默(() => loadData(host));

  eq('索引仍是 3 层（范围内读不到不算"已删"）', 取索引(), 前索引);
  eq('一个字节都没写', 取写入次数(), 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 楼层号超出末层 → 必须照常清索引（护栏不能把正常清理也挡掉）');
{
  // ── 这条防的是"干脆永远不清" ──
  //  楼层号 > 末层 = 聊天被截短了（/cut 删尾）→ 那些楼层真的没了 → 该清
  const { host, 取索引, 取写入次数 } = 造宿主({
    索引: [3, 5, 20],
    末层: 10,        // 只有 10 层，索引里的 20 已经不存在
    楼层存在: [3, 5], // 3 和 5 还在
    快照楼层: [3, 5],
  });

  静默(() => loadData(host));

  eq('[自证] 超范围的 20 被从索引里剔掉', 取索引().includes(20), false);
  eq('[自证] 有效的 3 和 5 留着', 取索引().sort((a, b) => a - b), [3, 5]);
  ok('[自证] 确实写了盘（正常清理该写）', 取写入次数() > 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 正常情况：楼层都在、快照都在 → 读到数据');
{
  // ── 证明护栏没把正常路径挡住 ──
  const { host } = 造宿主({
    索引: [3, 5, 7],
    末层: 7,
    楼层存在: [3, 5, 7],
    快照楼层: [3, 5, 7],
  });

  const 数据 = 静默(() => loadData(host));

  eq('[自证] 读到最新那层（#7）的 NPC', Object.keys(数据.NPC ?? {}), ['人7']);
  eq('[自证] 锚点楼层是 7', 数据.锚点楼层, 7);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 索引为空时，护栏不该干预');
{
  const { host, 取写入次数 } = 造宿主({ 索引: [], 末层: '抛错' });
  静默(() => loadData(host));
  eq('[自证] 空索引 + 聊天没就绪 → 不写盘（也没东西可写）', 取写入次数(), 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] 源码里必须有这两条护栏');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/快照.ts'), 'utf8');
  const 代码行 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] 有"聊天未就绪"的判断（lastMessageId）', /lastMessageId\(\)/.test(代码行));
  ok('[结构] 未就绪时直接 return（不清索引）', /!\(最后楼层 >= 0\)[\s\S]{0,400}?return \{ \.\.\.emptyData\(\)/.test(代码行));
  ok('[结构] 有"可判为已删"的判据（楼层号 > 末层）', /可判为已删\s*=/.test(代码行));
  ok('[结构] missingFloors.push 被"可判为已删"保护', /if \(可判为已删\(floorId\)\)[\s\S]{0,120}?missingFloors\.push/.test(代码行));

  // **自证**：这些正则可以抓到"没有护栏"的写法
  const 旧写法 = `
    for (let i = floors.length - 1; i >= 0; i--) {
      if (!message) { missingFloors.push(floorId); continue; }
    }`;
  ok('[自证] 旧写法没有"可判为已删"保护', !/可判为已删/.test(旧写法));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
