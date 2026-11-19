// 烟火 · 公开投影与同步归属：只选完整条目，超目标只提示，不裁内容
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { SettingsSchema } from '../src/烟火_世界运转/schema';
import { emptyData } from '../src/烟火_世界运转/保存世界状态';
import { 构建公开摘要, 选工作事件 } from '../src/烟火_世界运转/公开摘要';
import { validateAndNormalize } from '../src/烟火_世界运转/世界数据';
import { injectHostForTest } from '../src/烟火_世界运转/host';
import { syncWorldbookEntry } from '../src/烟火_世界运转/inject';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

const marker = '结论是明确拒绝，并非同意。';
const long = '完整事实与因果不能被切开，'.repeat(400) + marker;
const settings = SettingsSchema.parse({ 运转: { 公开摘要条数: 2, 摘要目标字符: 500 } });
function 事件(部分: Record<string, any>) {
  return {
    id: '', 描述: long, 地点: '', 时间: '2039-07-13 11:35', 规模: '要事', 传播: '本埠', 渠道: '',
    势力: '', 阶段: '进行', 隐秘: '公开', 代表人物: '', 前情: long, 演变: [], ...部分,
  };
}

const 数据 = {
  ...emptyData(),
  世界: { 时间: '2039-07-13 11:35', 氛围: '秘密氛围不应透传', 总览: '秘密总览不应透传' },
  事件: [
    事件({ id: 'e1', 标题: '公开事件一' }),
    事件({ id: 'e2', 标题: '隐秘事件', 隐秘: '隐秘' }),
    事件({ id: 'e3', 标题: '公开事件二' }),
    事件({ id: 'e6', 标题: '公开事件三' }),
  ],
  已了结: [
    事件({ id: 'e4', 标题: '公开旧事', 阶段: '已结束', 结束原因: long }),
    事件({ id: 'e5', 标题: '隐秘旧事', 阶段: '已结束', 隐秘: '隐秘', 结束原因: long }),
  ],
  势力: { 某组织: { 目标: '秘密目标', 动向: '秘密动向', 前情: long, 势力范围: '某地', 对外关系: '秘密关系', 头面人物: '' } },
};

const 摘要 = 构建公开摘要(数据 as any, settings);
assert.ok(摘要.selectedIds.length <= 2);
assert.ok(!摘要.text.includes('隐秘事件'));
assert.ok(!摘要.text.includes('秘密氛围') && !摘要.text.includes('秘密总览') && !摘要.text.includes('秘密动向'));
assert.ok(摘要.text.includes('公开事件一') || 摘要.text.includes('公开事件二'));
assert.ok(摘要.text.includes(marker), '超长完整事件必须原样保留，不能从中间截断');
assert.ok(摘要.text.includes('公开旧事'), '有明确结束原因的公开旧事结果必须保留');
assert.ok(!摘要.text.includes('隐秘旧事'), '隐秘旧事的结束原因不得进入公共投影');
assert.equal(摘要.overTarget, true, '超出字符目标只标 overTarget');
assert.equal(摘要.targetCharacters, 500);
assert.ok(摘要.omittedIds.length > 0, '未选中的完整条目只记 id，不删除');
console.log('PASS 公开投影只选完整公开条目；超目标完整保留并提示');

// 已了结记录会长期累积：只注入最近若干条完整结果，其余仍在存档，不裁切、不删除。
const 多条了结 = {
  ...数据,
  事件: [],
  已了结: Array.from({ length: 8 }, (_, i) => 事件({ id: `old${i + 1}`, 标题: `旧事${i + 1}`, 阶段: '已结束', 结束原因: `完整结果${i + 1}：${long}` })),
};
const 限定 = 构建公开摘要(多条了结 as any, SettingsSchema.parse({ 运转: { 公开摘要条数: 2 } }));
assert.ok(限定.text.includes('旧事7') && 限定.text.includes('旧事8'), '保留最近两条完整结果');
assert.ok(!限定.text.includes('旧事1'), '更早结果不注入');
assert.ok(限定.text.includes('另有 6 条更早的已结束公开事态未列出'), '更早条数如实说明');
assert.equal((多条了结.已了结 as any[]).length, 8, '未列出的记录仍在存档');
console.log('PASS 已了结结果按最近整条选择，不注入全部历史也不删除');

const 工作 = 选工作事件(数据 as any, SettingsSchema.parse({}), '公开事件二');
assert.ok(工作.length <= 6);
assert.ok(工作.every(事件 => '标题' in 事件 && '描述' in 事件), '工作集返回完整事件对象');
assert.ok(工作.some(事件 => 事件.标题 === '公开事件二'), '正文提及的事件优先进入工作集');
console.log('PASS 工作集按完整事件选择，正文提及优先');

// 等待中的事不能永久沉底：即使没被正文点名、没到期，也要轮换进工作集复审。
const 等待世界 = {
  ...emptyData(),
  事件: Array.from({ length: 10 }, (_, i) => ({
    id: `w${i}`, 标题: `等待事${i}`, 描述: '等待条件未解除', 地点: '', 时间: '2039-07-13 11:35',
    规模: '要事', 传播: '本埠', 渠道: '', 势力: '', 阶段: '进行', 隐秘: '公开', 代表人物: '', 前情: '',
    演变: [], 等待条件: '等商会复函', 下次判定时间: '2039-08-01 00:00',
  })),
};
const 等待工作集 = 选工作事件(等待世界 as any, SettingsSchema.parse({}), '与等待事件无关的正文');
assert.equal(等待工作集.length, 6);
assert.ok(等待工作集.some(e => e.标题.startsWith('等待事')), '等待中的事件也能被复审选中');
console.log('PASS 等待条件事件按轮换强制复审，不会永久冷藏');

const 旧 = {
  ...数据, 事件: [], 已了结: [],
  伏笔: [{ 标题: '完整伏笔', 埋设: long, 指向: long, 成熟度: '将熟', 前情: long }],
  节令: [{ 名称: '完整节令', 周期: '一次性', 时间: '2039-07-01 00:00', 概况: long }],
};
const 更新 = validateAndNormalize({
  协议: '烟火增量-v1', 世界: { 时间: '2039-07-14 11:35' }, 事件: [],
  伏笔: [{ 标题: '完整伏笔', 埋设: long, 指向: long, 成熟度: '已消亡', 前情: long, 结束原因: long }],
  节令: [{ 名称: '完整节令', 周期: '一次性', 时间: '2039-07-01 00:00', 概况: long }],
}, 旧 as any, undefined, { 密度: '正常' });
assert.equal(更新.已失效伏笔?.[0]?.前情, long);
assert.equal(更新.已失效伏笔?.[0]?.前情?.length, long.length);
assert.equal(更新.已失效伏笔?.[0]?.结束原因, long);
assert.equal(更新.已过期节令?.[0]?.概况, long);
assert.equal(更新.已过期节令?.[0]?.概况?.length, long.length);
console.log('PASS 失效伏笔与过期节令完整归档，不截断');

const 书: any[] = [{ uid: 1, name: '【烟火】世界动向', comment: '', content: '旧投影', enabled: true, extra: { yanhuo: true } }];
let 仍当前 = false;
injectHostForTest({
  chat: { messages: () => [], lastMessageId: () => 3, currentChatId: () => 'chat-b', currentSwipe: () => 0 },
  worldbook: {
    boundNames: () => ({ primary: '主书', additional: [] }), chatName: () => null, globalNames: () => [],
    entries: async () => 书,
    update: async (_name: string, updater: any) => { const 新 = updater([...书]); 书.splice(0, 书.length, ...新); },
    create: async () => {}, remove: async () => {},
  },
} as any);
const 结果 = await syncWorldbookEntry(数据 as any, true, settings, () => 仍当前);
assert.equal(结果.状态, '待同步');
assert.equal(书[0].content, '旧投影', '已切换聊天的晚到结果不得覆盖主世界书');
仍当前 = true;
const 再同步 = await syncWorldbookEntry(数据 as any, true, settings, () => 仍当前);
assert.equal(再同步.状态, '已同步');
assert.ok(书[0].content.includes(marker), '允许写入时完整内容进入主世界书');
console.log('PASS 主世界书同步核对归属；旧聊天晚到结果不覆盖当前内容');

// ── 汇总行（2026-11-19 补）──
// 为什么必须有: run.mjs 靠这行把本文件的通过数计入 TOTAL。
// 没有它 = 这个文件的断言数**从来没进过账**（run.mjs 的自检现在会把这种情况报出来）。
// 失败时 node:assert 会抛错 → 进程非零退出 → run.mjs 的 code!==0 能抓到，所以这里只报通过数。
console.log(`结果: ${6} 通过, 0 失败`);
