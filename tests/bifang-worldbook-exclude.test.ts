// 彼方 · 「注入世界书排除」的判定口径 —— 标题里含这些字就排除, 不用一条条写全名。
//
// 场景(用户反馈): 一堆 [mvu_update]1、[mvu_update]2… 的条目, 一条条填太麻烦。
// 现行实现本来就是"标题/备注包含即命中", 2026-11-11 起再加两点: 不分大小写, 以及
// 日志里报出"挡掉了 N 条"(静默排除是排查黑洞)。这份用例把三件事都钉住:
//   ① 一条 [mvu_update] 挡掉整族条目(标题在 name 在 comment 都认);
//   ② 不相干的条目一条都不许误伤;
//   ③ 人设参考那条路(getPersonaTextForNpc)同一套判定。
import lodash from 'lodash';
import {
  getActiveWorldbookText,
  getPersonaTextForNpc,
  resetWorldbookCaches,
} from '../src/彼方_NPC幕后生命状态系统/worldbook';

(globalThis as any)._ = lodash;

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

/** 主 AI 激活结果: 每个用例自己换 */
let 激活: Record<string, any[]> = {};
const 模板环境: any = { getWorldInfoActivatedData: async (name: string) => 激活[name] ?? [] };

/** 假宿主: 只提供世界书读取这条链用到的东西 */
function 假宿主(全部条目: Record<string, any[]>) {
  return {
    worldbook: {
      boundNames: () => ({ primary: '主书', additional: [] }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      groupMemberNames: () => [],
      chatName: () => null,
      entries: async (name: string) => 全部条目[name] ?? [],
    },
    persona: { name: () => null, description: () => '', lorebook: () => '' },
    ejs: { prepareContext: async () => 模板环境, evaluate: async (t: string) => t, syntaxError: async () => '' },
    macros: { expand: (t: string) => t },
    vars: { get: () => ({}), update: () => ({}), del: () => ({}), insertOrAssign: () => ({}), scriptId: () => 't' },
    acu: { tables: () => undefined },
  } as any;
}

/** 收 console 输出(日志也得算行为: "挡掉几条"必须看得见) */
function 收日志<T>(跑: () => Promise<T>) {
  const 行: string[] = [];
  const 原info = console.info;
  const 原warn = console.warn;
  console.info = (...args: any[]) => 行.push(args.map(String).join(' '));
  console.warn = (...args: any[]) => 行.push(args.map(String).join(' '));
  return 跑().finally(() => {
    console.info = 原info;
    console.warn = 原warn;
  }).then(结果 => ({ 结果, 行 }));
}

const 人设 = (标题: string, 正文 = '人设正文') => ({ comment: 标题, name: 标题, content: 正文, key: ['艾莉'], disable: false });

console.log('\n[1] 一条 [mvu_update] 挡掉整族条目(标题在 comment / 只在 name 都认)');
{
  resetWorldbookCaches();
  激活 = {
    主书: [
      人设('[mvu_update]1', 'MVU_1'),
      { name: '[mvu_update]2', content: 'MVU_2', disable: false }, // 只有 name
      人设('[mvu_update]3', 'MVU_3'),
      人设('艾莉人设', '艾莉, 19岁, 杰克逊巡逻队。'),
    ],
  };
  const out = await getActiveWorldbookText(假宿主({ 主书: [] }), '艾莉在院子里', ['[mvu_update]'], []);
  check('三条 MVU 都没进来', ['MVU_1', 'MVU_2', 'MVU_3'].filter(标 => out.includes(标)), []);
  check('正常条目照常进来', out.includes('艾莉, 19岁'), true);
}

console.log('\n[2] 不分大小写');
{
  resetWorldbookCaches();
  激活 = { 主书: [人设('[MVU_UPDATE]规则', 'MVU_大'), 人设('艾莉人设', '艾莉, 19岁。')] };
  const out = await getActiveWorldbookText(假宿主({ 主书: [] }), '艾莉', ['[mvu_update]'], []);
  check('大写标题也被挡', out.includes('MVU_大'), false);
  check('正常条目还在', out.includes('艾莉, 19岁'), true);
}

console.log('\n[3] 不相干的条目不误伤(只认"含这些字", 不是模糊猜)');
{
  resetWorldbookCaches();
  激活 = {
    主书: [
      人设('mvu 变量说明', '无关A'),            // 没有方括号那串
      人设('[mvu_update_x] 注意', '无关B'),      // 前缀像但不是同一串
      人设('艾莉人设', '艾莉, 19岁。'),
    ],
  };
  const out = await getActiveWorldbookText(假宿主({ 主书: [] }), '艾莉', ['[mvu_update]'], []);
  check('没有方括号串的条目留下', out.includes('无关A'), true);
  check('相似但不相同的串留下', out.includes('无关B'), true);
  check('正常条目还在', out.includes('艾莉, 19岁'), true);
}

console.log('\n[4] 日志里报出"挡掉几条"(不再静默)');
{
  resetWorldbookCaches();
  激活 = { 主书: [人设('[mvu_update]1', 'A'), 人设('[mvu_update]2', 'B'), 人设('艾莉人设', 'C')] };
  const { 行 } = await 收日志(() => getActiveWorldbookText(假宿主({ 主书: [] }), '艾莉', ['[mvu_update]'], []));
  const 汇报 = 行.find(文 => 文.includes('[彼方] 世界书用上')) ?? '';
  check('报了挡掉 2 条', 汇报.includes('排除条目挡掉 2 条'), true);
  check('顺带点了条目名', 汇报.includes('[mvu_update]1'), true);
}

console.log('\n[5] 人设参考(按 NPC 名收条目)同一套判定');
{
  resetWorldbookCaches();
  const 全部 = [
    { name: '[mvu_update]9', comment: '[mvu_update]9', enabled: true, strategy: { type: 'selective', keys: ['艾莉'] }, content: 'MVU_人设' },
    { name: '艾莉人设', enabled: true, strategy: { type: 'selective', keys: ['艾莉'] }, content: '艾莉, 19岁。' },
  ];
  const out = await getPersonaTextForNpc(假宿主({ 主书: 全部 }), '艾莉', '', ['[mvu_update]'], '');
  check('被排除的没进人设参考', out.includes('MVU_人设'), false);
  check('正常人设进来了', out.includes('艾莉, 19岁'), true);
}

console.log(fail === 0 ? `\n世界书排除口径: 全部通过 (${pass} 断言)` : `\n世界书排除口径: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
