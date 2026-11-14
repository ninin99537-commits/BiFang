// 彼方 · 世界书同步失败的"单一上报出口" —— 批次 0.5 的验收用例(派活单: #45, 基线 sha 3ad6b19)。
//
// 钉的契约: 同步失败时玩家**恰好看到一条**警告, 不多不少 ——
//   注入层(syncNpcStatesWorldbook)只 throw 不弹(签名里连 toast 都没有, 想弹也没有);
//   四个调用方(启动/切聊天、AI 更新、界面改设置、数据变更)全走同一个出口 报告世界书失败;
//   数据变更那条链路用同一个文案函数 世界书失败文案 —— 同一种失败, 玩家读到的话该一样。
// 成功路径(含关闭档清理)零警告。接线钉子是文本断言, 只做辅助 —— 行为证据在 [1]-[5]。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { 报告世界书失败, 世界书失败文案, syncNpcStatesWorldbook } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { 更新状态卡 } from '../src/彼方_NPC幕后生命状态系统/数据变更';
import update源码 from '../src/彼方_NPC幕后生命状态系统/update.ts?raw';
import index源码 from '../src/彼方_NPC幕后生命状态系统/index.ts?raw';
import 壳源码 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';
import 数据变更源码 from '../src/彼方_NPC幕后生命状态系统/数据变更.ts?raw';
import 注入层源码 from '../src/彼方_NPC幕后生命状态系统/worldbook-inject.ts?raw';

// 写路径的注入表经 卡合并/渲染注入表 的判定型尾部用 _
(globalThis as any)._ = lodash;
setActivePinia(createPinia()); // 写路径会经 日志仓 记录条目内容

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
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

/** 收 console.error(出口/报错 helper 的"报了一次"在 node 里可数的部分) */
function 收错误<T>(跑: () => Promise<T> | T) {
  const 行: string[] = [];
  const 原error = console.error;
  console.error = (...args: any[]) => 行.push(args.map(String).join(' '));
  return Promise.resolve()
    .then(跑)
    .finally(() => {
      console.error = 原error;
    })
    .then(结果 => ({ 结果, 行 }));
}

/**
 * 假世界书 + 弹窗记录。`弹` 是记录(数组), `toast` 是塞给 host 的 API(往记录里推)。
 * `炸` = 对应操作抛错(世界书同步失败的注入点)。
 */
function 假宿主(书: Record<string, any[]>, 选项: { 主书绑?: string | null; remove炸?: boolean; create炸?: boolean; entries炸?: boolean } = {}) {
  const 条目 = 书;
  const 弹 = { warn: [] as any[], error: [] as any[], success: [] as any[], info: [] as any[] };
  const host = {
    worldbook: {
      boundNames: () => ({ primary: 选项.主书绑 === undefined ? '主书' : 选项.主书绑, additional: [] }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      groupMemberNames: () => [] as string[],
      chatName: () => '聊天书',
      getOrCreateChat: async () => '聊天书',
      entries: async (name: string) => {
        if (选项.entries炸)
          throw new Error('读条目失败(测试注入)');
        return 条目[name] ?? [];
      },
      update: async (name: string, updater: any) => {
        条目[name] = updater(条目[name] ?? []);
      },
      create: async (name: string, list: any[]) => {
        if (选项.create炸)
          throw new Error('建条目失败(测试注入)');
        条目[name] = [...(条目[name] ?? []), ...list];
      },
      remove: async (name: string, predicate?: (entry: any) => boolean) => {
        if (选项.remove炸)
          throw new Error('删条目失败(测试注入)');
        条目[name] = (条目[name] ?? []).filter(entry => !predicate?.(entry));
      },
    },
    toast: {
      warn: (text: string, header: string) => {
        弹.warn.push({ text, header });
      },
      error: (text: string, header: string) => {
        弹.error.push({ text, header });
      },
      success: (text: string, header: string) => {
        弹.success.push({ text, header });
      },
      info: (text: string, header: string) => {
        弹.info.push({ text, header });
      },
    },
  };
  return { host, 弹, 条目 };
}

const 数据样本 = () => ({ NPC: { 甲: { 位置: '厨房' } }, 剧情时间: '' }) as any;
const 彼方条目样本 = () => ({ name: '【彼方】NPC幕后生活', content: '【NPC幕后生活】\n甲 | 位置: 家', comment: '', enabled: true, extra: { bifang: true } });
const 人设条目样本 = () => ({ name: '艾莉人设', content: '艾莉, 19岁。', comment: '艾莉', enabled: true });

console.log('\n[1] 单一出口: 报告世界书失败 = 恰好一次 console.error + 恰好一次 toast.warn, 文案出自 世界书失败文案');
{
  const { host, 弹 } = 假宿主({});
  const { 行 } = await 收错误(() => 报告世界书失败(host as any, new Error('测试炸因')));
  eq('toast.warn 恰好一条', 弹.warn.length, 1);
  eq('文案 === 世界书失败文案(同一句)', 弹.warn[0]?.text, 世界书失败文案(new Error('测试炸因')));
  eq('文案句式', 弹.warn[0]?.text, '写入世界书失败：测试炸因');
  eq('频道头', 弹.warn[0]?.header, '彼方');
  eq('console.error 恰好一条(排障现场也要在)', 行.length, 1);
  ok('其它档位零调用', 弹.error.length === 0 && 弹.success.length === 0 && 弹.info.length === 0);
}

console.log('\n[2] 注入层只 throw 不弹: 同步失败时 host.toast 零调用、console 零输出(报是调用方的事)');
{
  // A. 取不到世界书 → throw(带原因), 不弹
  const 甲 = 假宿主({ 主书: [] }, { 主书绑: null });
  let 炸: any = null;
  const { 行: 行甲 } = await 收错误(async () => {
    try {
      await syncNpcStatesWorldbook(甲.host as any, 数据样本(), '角色卡主世界书');
    }
    catch (e) {
      炸 = e;
    }
  });
  ok('取不到世界书 → throw 且带原因', 炸 instanceof Error && String(炸.message).includes('没有绑定主世界书'));
  eq('注入层 toast 零调用', 甲.弹.warn.length + 甲.弹.error.length, 0);
  eq('注入层 console 零输出', 行甲.length, 0);

  // B. 世界书操作炸(写路径 create / 关闭档 remove) → reject, 不弹
  const 乙 = 假宿主({ 主书: [] }, { create炸: true });
  let 炸乙: any = null;
  await 收错误(async () => {
    try {
      await syncNpcStatesWorldbook(乙.host as any, 数据样本(), '角色卡主世界书');
    }
    catch (e) {
      炸乙 = e;
    }
  });
  ok('create 炸 → reject 且带原因', 炸乙 instanceof Error && String(炸乙.message).includes('建条目失败'));
  eq('注入层 toast 零调用(create 炸)', 乙.弹.warn.length + 乙.弹.error.length, 0);

  const 丙 = 假宿主({ 主书: [彼方条目样本()] }, { remove炸: true });
  let 炸丙: any = null;
  await 收错误(async () => {
    try {
      await syncNpcStatesWorldbook(丙.host as any, 数据样本(), '关闭');
    }
    catch (e) {
      炸丙 = e;
    }
  });
  ok('关闭档 remove 炸 → reject 且带原因', 炸丙 instanceof Error && String(炸丙.message).includes('删条目失败'));
  eq('注入层 toast 零调用(关闭档炸)', 丙.弹.warn.length + 丙.弹.error.length, 0);
}

console.log('\n[3] 出口链路恰好一条 toast: 复刻调用方接线 sync(...).catch(报告世界书失败) —— 不是 0 条也不是 2 条');
{
  const 链 = async (host: any, 目标: string) => {
    try {
      await syncNpcStatesWorldbook(host, 数据样本(), 目标 as any);
    }
    catch (error) {
      报告世界书失败(host, error);
    }
  };
  const 甲 = 假宿主({ 主书: [] }, { create炸: true });
  await 收错误(() => 链(甲.host as any, '角色卡主世界书'));
  eq('写入档炸 → 恰好一条', 甲.弹.warn.length, 1);
  eq('文案同源', 甲.弹.warn[0]?.text, 世界书失败文案(new Error('建条目失败(测试注入)')));

  const 乙 = 假宿主({ 主书: [彼方条目样本(), 人设条目样本()] }, { remove炸: true });
  await 收错误(() => 链(乙.host as any, '关闭'));
  eq('关闭档炸 → 恰好一条', 乙.弹.warn.length, 1);

  const 丙 = 假宿主({ 主书: [] }, { 主书绑: null });
  await 收错误(() => 链(丙.host as any, '角色卡主世界书'));
  eq('取不到世界书 → 恰好一条', 丙.弹.warn.length, 1);
  ok('文案带原因', String(丙.弹.warn[0]?.text).includes('没有绑定主世界书'));
}

console.log('\n[4] 成功路径零警告: 写入成功与关闭档清理成功, toast 与 console 都干净');
{
  const 甲 = 假宿主({ 主书: [] });
  const { 行: 行甲 } = await 收错误(() => syncNpcStatesWorldbook(甲.host as any, 数据样本(), '角色卡主世界书'));
  eq('写入成功 → toast 零调用', 甲.弹.warn.length + 甲.弹.error.length, 0);
  eq('写入成功 → console 零错误', 行甲.length, 0);

  const 乙 = 假宿主({ 主书: [彼方条目样本(), 人设条目样本()], 聊天书: [人设条目样本()] });
  const { 行: 行乙 } = await 收错误(() => syncNpcStatesWorldbook(乙.host as any, 数据样本(), '关闭'));
  eq('关闭档清理成功 → toast 零调用', 乙.弹.warn.length + 乙.弹.error.length, 0);
  eq('关闭档清理成功 → console 零错误', 行乙.length, 0);
  eq('且真的清掉了彼方条目', (乙.条目.主书 ?? []).filter((e: any) => e.extra?.bifang === true).length, 0);
}

console.log('\n[5] 数据变更链路: 同一句文案, 报一次, 且失败不并进 变更返回(世界书是派生视图)');
{
  const 记错误: any[] = [];
  const 原error = console.error;
  console.error = (...args: any[]) => 记错误.push(args.map(String).join(' '));
  let 返回: any;
  try {
    const 环境: any = {
      世界书写入: '角色卡主世界书',
      保存: () => true,
      清空: () => undefined,
      // 同步抛错(同步 throw 形态): 报错 helper 走 catch 分支
      同步世界书: () => {
        throw new Error('同步炸了(测试注入)');
      },
      现在: () => 1234567890,
    };
    const 原数据: any = { 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭', 位置: '客厅' } } };
    返回 = 更新状态卡(原数据, '甲', { 位置: '厨房' }, 环境);
  }
  finally {
    console.error = 原error;
  }
  eq('报错恰好一次(报错 helper)', 记错误.length, 1);
  ok('console 带原始炸因(排障现场不丢真因)', 记错误.some(s => s.includes('同步炸了(测试注入)')));
  ok('变更返回不受世界书失败影响(数据是合并后的新卡)', 返回?.数据?.NPC?.['甲']?.位置 === '厨房');
  ok('且没有把同步失败混进 失败 位', 返回?.失败 === undefined);

  // rejected promise 形态: 结果.catch(报错) 那条路也要报一次
  const 记错误乙: any[] = [];
  console.error = (...args: any[]) => 记错误乙.push(args.map(String).join(' '));
  try {
    const 环境: any = {
      世界书写入: '角色卡主世界书',
      保存: () => true,
      清空: () => undefined,
      同步世界书: () => Promise.reject(new Error('异步炸了(测试注入)')),
      现在: () => 1234567890,
    };
    更新状态卡({ 名单: ['甲'], NPC: { 甲: {} } } as any, '甲', {}, 环境);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  finally {
    console.error = 原error;
  }
  eq('rejected promise 形态也报恰好一次', 记错误乙.length, 1);
}

console.log('\n[6] 接线钉子(文本, 辅助): 四条链路都接在同一个出口上, 注入层自身无 toast');
{
  const 接线 = '.catch(error => 报告世界书失败(host, error))';
  ok('update.ts 的同步 catch 走单一出口', update源码.includes(接线));
  // 观察点变更(实现把 maybeInjectNpcStates 挪进 worldbook-inject.ts, 非断言放宽): 启动/切聊天的接线随之搬了家
  const 注入层源码 = (await import('../src/彼方_NPC幕后生命状态系统/worldbook-inject.ts?raw')).default;
  ok('index.ts(启动/切聊天)的调用走单一出口(接线在注入层的 maybeInjectNpcStates 里)', 注入层源码.includes(接线));
  ok('悬浮球界面(改设置)走单一出口', 壳源码.includes(接线));
  ok('数据变更走同一句文案函数', 数据变更源码.includes('toastWarning(世界书失败文案(error), \'彼方\')'));
  eq('注入层自身 toast.warn 只出现在出口那一处', 注入层源码.split('toast.warn').length - 1, 1);
  ok('且那一处在 报告世界书失败 里(不在同步函数体里)', 注入层源码.indexOf('toast.warn') > 注入层源码.indexOf('function 报告世界书失败'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
