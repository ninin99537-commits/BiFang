// 彼方 · 世界书写入(候选4「host」的第一块接缝) —— 用假世界书跑真实源码
//
// worldbook-inject.ts 现在只通过 host.worldbook / host.toast 访问平台, 所以不装酒馆、不开浏览器
// 也能把它的行为验证一遍: 新建 / 原地更新 / 保留用户改动 / ACU 改名 / 删除 / 没绑世界书 /
// 写的内容与日志页记录一致 / 世界书抛错不冒泡。
import { createPinia, setActivePinia } from 'pinia';
import {
  BIFANG_WORLDBOOK_ENTRY_NAME,
} from '../src/彼方_NPC幕后生命状态系统/快照';
import { useMainPromptStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { syncNpcStatesWorldbook } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';

setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 假世界书: 真存条目、真记录调用次数, 完全不碰酒馆 */
function makeFakeWorldbook(初始条目: any[] = [], 主世界书: string | null = '测试世界书') {
  const state: any = {
    条目: 初始条目.map(e => ({ ...e })),
    新建: [] as any[],
    更新次数: 0,
    删除次数: 0,
    警告: [] as string[],
  };
  const worldbook = {
    boundNames: () => ({ primary: 主世界书, additional: [] }),
    chatName: () => null,
    entries: async () => state.条目.map((e: any) => ({ ...e })),
    update: async (_name: string, updater: any) => {
      state.更新次数++;
      const 结果 = updater(state.条目.map((e: any) => ({ ...e })));
      if (Array.isArray(结果))
        state.条目 = 结果;
    },
    create: async (_name: string, entries: any[]) => {
      state.新建.push(...entries);
      state.条目 = [...state.条目, ...entries];
    },
    remove: async (_name: string, predicate: any) => {
      state.删除次数++;
      state.条目 = state.条目.filter((e: any) => !predicate(e));
    },
  };
  const toast = { warn: (text: string) => { state.警告.push(text); }, success: () => {} };
  return { host: { worldbook, toast } as any, state };
}

const 卡 = (over: any = {}) => ({
  当前在做: '整理账本',
  位置: '书房',
  当前状态: '平静',
  隐藏目标: '想杀了主角',
  ...over,
});
const 数据 = (npcs: any = {}) => ({ NPC: npcs, 锚点楼层: 1 });
const 日志 = useMainPromptStore();

console.log('\n[1] 角色卡没绑主世界书 → 只警告, 什么都不写');
{
  const { host, state } = makeFakeWorldbook([], null);
  const 记录前 = 日志.count;
  await syncNpcStatesWorldbook(host, 数据({ 爱丽丝: 卡() }), true);
  check('警告 1 次', state.警告.length, 1);
  ok('警告文案提到"没有绑定主世界书"', String(state.警告[0]).includes('没有绑定主世界书'));
  check('不新建', state.新建.length, 0);
  check('不更新', state.更新次数, 0);
  check('不删除', state.删除次数, 0);
  check('日志也不记', 日志.count, 记录前);
}

console.log('\n[2] 首次写入 → 新建条目, 形状正确, 且只注入可公开字段');
let 首条: any = null;
{
  const { host, state } = makeFakeWorldbook();
  await syncNpcStatesWorldbook(host, 数据({ 爱丽丝: 卡({ 生理周期: '月经期 Day 3' }) }), true);
  check('新建 1 条', state.新建.length, 1);
  首条 = state.新建[0];
  check('条目名', 首条.name, BIFANG_WORLDBOOK_ENTRY_NAME);
  check('蓝灯常开', 首条.strategy.type, 'constant');
  check('启用', 首条.enabled, true);
  check('概率 100', 首条.probability, 100);
  check('插在角色定义之后', 首条.position.type, 'after_character_definition');
  check('防递归(进/出)', [首条.recursion.prevent_incoming, 首条.recursion.prevent_outgoing], [true, true]);
  check('标记 extra.bifang(改过名也认得出)', 首条.extra.bifang, true);
  ok('内容以幕后状态段开头', 首条.content.startsWith('[彼方 · 幕后NPC状态]'));
  ok('内容含 NPC 名', 首条.content.includes('爱丽丝'));
  ok('内容含可见字段(当前在做)', 首条.content.includes('整理账本'));
  ok('内容含生理字段', 首条.content.includes('月经期 Day 3'));
  ok('防全知: 隐藏字段不进内容', !首条.content.includes('想杀了主角'));
}

console.log('\n[3] 已存在条目 → 原地更新, 用户改过的字段保留, 别人的条目不动');
{
  const 别人的 = { name: '别人写的条目', content: '别动我', extra: {} };
  const 我们的 = {
    name: BIFANG_WORLDBOOK_ENTRY_NAME,
    content: '旧内容',
    enabled: false,
    probability: 50,
    extra: { bifang: true, 我改过的: 1 },
  };
  const { host, state } = makeFakeWorldbook([别人的, 我们的]);
  await syncNpcStatesWorldbook(host, 数据({ 爱丽丝: 卡() }), true);
  check('更新 1 次', state.更新次数, 1);
  check('没有新建', state.新建.length, 0);
  check('条目总数不变', state.条目.length, 2);
  check('别人的条目原样', state.条目[0].content, '别动我');
  const 后 = state.条目[1];
  ok('内容已刷新', 后.content !== '旧内容' && 后.content.includes('爱丽丝'));
  check('用户关掉的 enabled 被保留', 后.enabled, false);
  check('用户改过的 probability 被保留', 后.probability, 50);
  check('用户加的字段被保留', 后.extra.我改过的, 1);
  check('extra.bifang 仍在', 后.extra.bifang, true);
  check('防递归被强制打开', 后.recursion.prevent_incoming, true);
}

console.log('\n[4] 条目名命中 ACU 屏蔽词 → 改回安全名; 自定义名不含屏蔽词 → 保留');
{
  const a = makeFakeWorldbook([{ name: '彼方NPC状态', content: 'x', extra: { bifang: true } }]);
  await syncNpcStatesWorldbook(a.host, 数据({ 爱丽丝: 卡() }), true);
  check('旧名含"状态" → 改回安全名', a.state.条目[0].name, BIFANG_WORLDBOOK_ENTRY_NAME);

  const b = makeFakeWorldbook([{ name: '我自己起的幕后生活', content: 'x', extra: { bifang: true } }]);
  await syncNpcStatesWorldbook(b.host, 数据({ 爱丽丝: 卡() }), true);
  check('自定义名不含屏蔽词 → 保留', b.state.条目[0].name, '我自己起的幕后生活');
}

console.log('\n[5] 关掉开关 / 没有 NPC → 删掉我们那条, 别人的不动');
{
  const 初始 = [
    { name: '别人写的条目', content: '别动我', extra: {} },
    { name: BIFANG_WORLDBOOK_ENTRY_NAME, content: '旧内容', extra: { bifang: true } },
  ];
  const a = makeFakeWorldbook(初始);
  await syncNpcStatesWorldbook(a.host, 数据({ 爱丽丝: 卡() }), false);
  check('关开关 → 删除 1 次', a.state.删除次数, 1);
  check('只剩别人的条目', a.state.条目.map((e: any) => e.name), ['别人写的条目']);

  const b = makeFakeWorldbook(初始);
  await syncNpcStatesWorldbook(b.host, 数据({}), true);
  check('没有 NPC → 也删除', b.state.条目.map((e: any) => e.name), ['别人写的条目']);

  const c = makeFakeWorldbook(初始);
  await syncNpcStatesWorldbook(c.host, 数据({}), false);
  check('关着且没 NPC → 仍然保证删干净', c.state.条目.map((e: any) => e.name), ['别人写的条目']);
}

console.log('\n[6] 写进世界书的内容 = 日志页「彼方写入世界书的内容」(同一个渲染函数)');
{
  const { host, state } = makeFakeWorldbook();
  const 记录前 = 日志.count;
  await syncNpcStatesWorldbook(host, 数据({ 爱丽丝: 卡() }), true);
  check('日志记录 +1', 日志.count, 记录前 + 1);
  check('日志内容 = 条目内容', 日志.prompt, state.新建[0].content);
  ok('日志内容非空', String(日志.prompt).length > 0);
}

console.log('\n[7] 世界书操作抛错 → 不冒泡(只会 console.error)');
{
  const { host } = makeFakeWorldbook();
  host.worldbook.entries = async () => { throw new Error('世界书不存在'); };
  let 抛了 = false;
  try {
    await syncNpcStatesWorldbook(host, 数据({ 爱丽丝: 卡() }), true);
  }
  catch {
    抛了 = true;
  }
  check('没有异常冒出来', 抛了, false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
