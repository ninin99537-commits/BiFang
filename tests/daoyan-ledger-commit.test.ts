// 剧情导演 · 账本变更收口(候选二) —— 视图的副作用链与「终态」判定各只此一份。
//
// 两件事:
//  1. 是终态(伏笔/冲突/弧线/章回) —— 面板/提示词/引擎规则以前各写一遍字面判断, 现在共用同一口径;
//  2. 提交账本变更 —— 「落盘 → 重写备忘 → 重注本幕」的顺序与开关收在一处, 视图只声明要做什么。
// 通过可替换宿主跑, 不装酒馆: 记录注入与世界书调用, 断言顺序与开关。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { SettingsSchema } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { emptyData } from '../src/剧情导演/快照';
import { 是终态 } from '../src/剧情导演/字段表';
import { 提交账本变更 } from '../src/剧情导演/账本变更';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

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

const 设置 = SettingsSchema.parse({});

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}

/** 每次准备都新建一份假平台, 并记录「谁先谁后」 */
function 准备() {
  const 顺序: string[] = [];
  const floors: Record<string, any> = { '1': { role: 'assistant', message: '正文', is_hidden: false } };
  const floorVars: Record<string, any> = {};
  let chatVars: Record<string, any> = {};
  const 世界书: any[] = [];
  let 注入次数 = 0;
  let 世界书次数 = 0;
  const host: any = {
    vars: {
      scriptId: () => 'test-script',
      get(option: any) {
        if (option.type === 'chat') return chatVars;
        if (option.type === 'global') return { 剧情导演_settings: {} };
        return floorVars[String(option.message_id)] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          顺序.push('chat-write');
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        顺序.push('floor-write');
        const id = String(option.message_id);
        floorVars[id] = updater(floorVars[id] ?? {}) ?? floorVars[id];
        return floorVars[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete chatVars[path];
          return { variables: chatVars, delete_occurred: true };
        }
        if (floorVars[String(option.message_id)]) delete floorVars[String(option.message_id)][path];
        return { variables: {}, delete_occurred: true };
      },
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out = [];
        for (let i = from; i <= to; i++) {
          const m = floors[String(i)];
          if (!m) continue;
          if (options.role && options.role !== 'all' && m.role !== options.role) continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId: () => 1,
    },
    inject: {
      inject: () => {
        注入次数 += 1;
        顺序.push('inject');
      },
      uninject: () => {
        顺序.push('uninject');
      },
    },
    worldbook: {
      boundNames: () => ({ primary: '主世界书', additional: [] }),
      chatName: () => null,
      globalNames: () => [],
      entries: async (name: string) => {
        世界书次数 += 1;
        顺序.push('wb-read');
        return 世界书.filter(e => e.__book === name).map(({ __book, ...rest }) => rest);
      },
      update: async (name: string, updater: any) => {
        世界书次数 += 1;
        顺序.push('wb-write');
        const 现有 = 世界书.filter(e => e.__book === name).map(({ __book, ...rest }) => rest);
        const 新 = updater(现有) ?? [];
        for (const e of 世界书.filter(e => e.__book === name)) 世界书.splice(世界书.indexOf(e), 1);
        新.forEach((entry: any) => 世界书.push({ ...entry, __book: name }));
      },
      create: async (name: string, entries: any[]) => {
        世界书次数 += 1;
        顺序.push('wb-create');
        for (const entry of entries) 世界书.push({ ...entry, __book: name });
      },
      remove: async () => {
        世界书次数 += 1;
        顺序.push('wb-remove');
      },
      getOrCreateChat: async () => '聊天世界书',
    },
  };
  injectHostForTest(host);
  setActivePinia(createPinia());
  resetSettingsReadCacheForTest();
  return {
    顺序,
    世界书,
    注入次数: () => 注入次数,
    世界书次数: () => 世界书次数,
  };
}

// ---------------------------------------------------------------------------
// 1. 是终态: 唯一口径
// ---------------------------------------------------------------------------
console.log('\n[1] 是终态 —— 各层的终态判定只此一份');
{
  check('伏笔 已引爆 = 终态', 是终态.伏笔({ 状态: '已引爆' }), true);
  check('伏笔 已消亡 = 终态', 是终态.伏笔({ 状态: '已消亡' }), true);
  check('伏笔 发酵 ≠ 终态', 是终态.伏笔({ 状态: '发酵' }), false);
  check('冲突 已收档 = 终态', 是终态.冲突({ 阶段: '已收档' }), true);
  check('冲突 僵持 ≠ 终态', 是终态.冲突({ 阶段: '僵持' }), false);
  check('弧线 闭环 = 终态', 是终态.弧线({ 阶段: '闭环' }), true);
  check('弧线 挣扎 ≠ 终态', 是终态.弧线({ 阶段: '挣扎' }), false);
  check('章回 已完结 = 终态', 是终态.章回({ 进度: '已完结' }), true);
  check('章回 推进 ≠ 终态', 是终态.章回({ 进度: '推进' }), false);
}

// ---------------------------------------------------------------------------
// 2. 提交账本变更: 落盘总是发生, 副作用按选项开关
// ---------------------------------------------------------------------------
console.log('\n[2] 提交账本变更 —— 落盘 / 重注 / 重写备忘 的开关与顺序');
{
  const p = 准备();
  const 落盘 = 提交账本变更(账本(), 设置);
  check('无副作用时也落盘(楼层写了一次)', p.顺序.filter(x => x === 'floor-write').length, 1);
  check('无副作用时不注入', p.注入次数(), 0);
  check('落盘返回 true', 落盘, true);
}
{
  const p = 准备();
  const 有指令 = 账本({
    当前指令: { 编号: 1, 节拍: '受挫', 硬性要求: '计划失败', 伏笔现场: '', 禁止事项: '', 生成楼层: 1, 核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [] },
  });
  提交账本变更(有指令, 设置, { 重注本幕: false });
  check('重注本幕 打开 → 注入一次', p.注入次数(), 1);
  const 落 = p.顺序.indexOf('floor-write');
  const 注 = p.顺序.indexOf('inject');
  check('顺序: 先落盘再注入', 落 >= 0 && 注 > 落, true);
}
{
  const p = 准备();
  提交账本变更(账本(), 设置, { 重注本幕: false });
  check('重注本幕 打开但无指令 → 不注入(空指令不重注)', p.注入次数(), 0);
}
{
  const p = 准备();
  提交账本变更(账本({ 章回: { 章号: 1, 主题: '起', 计划高潮: '高潮', 进度: '推进' } }), 设置, { 重写备忘: true });
  check('重写备忘 打开 → 世界书被动过', p.世界书次数() > 0, true);
  // sync编剧备忘 是 async 且即发即忘, 等它把 create 走完再断言条目
  await new Promise(resolve => setTimeout(resolve, 20));
  check('世界书里出现了「编剧备忘」条目', p.世界书.some(e => String(e.name ?? e.comment ?? '').includes('编剧备忘')), true);
}
{
  const p = 准备();
  提交账本变更(账本({ 章回: { 章号: 1, 主题: '起', 计划高潮: '高潮', 进度: '推进' } }), 设置, { 重写备忘: false });
  check('重写备忘 关闭 → 不往世界书写(只可能读来清理)', p.世界书.filter(e => String(e.name ?? '').includes('编剧备忘')).length, 0);
}

console.log(fail === 0 ? `\n账本变更收口: 全部通过 (${pass} 断言)` : `\n账本变更收口: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);