// 剧情导演 · 世界书条目归属与关闭清理 —— 2026-11-13 **A 案（只认精确标记）**
//
// 历史：用户报告"关掉总开关后世界书里还留着「导演指令 · …」条目，等于关了还在影响主 AI"，
// 于是把 `is导演条目` 放宽到「名字/备注含『剧情导演』、内容以【导演 开头」。
// **放宽的代价是数据丢失**：用户自建的《我的剧情导演笔记》《剧情导演参考》《关于剧情导演的设定》，
// 以及一条备注里带「剧情导演」的 NPC 卡，全被判成"我们的条目"然后被自动删掉
// （`tmp/prove-wb.mjs` 实测 4/4 中招）。
//
// 2026-11-13 用户拍板 A 案：**只认精确标记**；旧的宽松判定挪进 `列出疑似旧条目()`，**只列不删**。
// 取舍是"宁可漏删，绝不误删"—— 自动删用户数据不可逆，没清干净用户可以手动收拾。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/剧情导演/host';
import { is导演条目, 清空导演条目, 列出疑似旧条目 } from '../src/剧情导演/世界书落点';
import { WORLDBOOK_ENTRY_NAME } from '../src/剧情导演/state';

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

// 桩世界书: 主书 / 副书 / 聊天书 / 全局书 各一本
let 书: Record<string, any[]> = {};
function 造书() {
  书 = {
    主书: [
      // ① 我们写的（extra 标记）
      { name: '编剧备忘', content: '', extra: { daoyan: true } },
      // ② 旧版命名（不该再被删）
      { name: '导演指令 · 近期写作要求, 优先级高于剧情总纲', content: '（暂无特别指令, 按剧情总纲推进）' },
      // ③ 用户自建（一个都不能删）
      { name: '我的剧情导演笔记', content: '这是我自己的笔记' },
      { name: '剧情导演参考', content: '参考资料' },
      { name: '关于剧情导演的设定', content: '设定' },
      { name: 'NPC 卡 · 艾莉', comment: '剧情导演相关的一个 NPC', content: '艾莉，17 岁' },
    ],
    副书: [{ name: '旧版本残留', comment: '导演指令 · 旧版', content: '' }],
    全局书: [{ name: '【导演】旧全局条目', content: 'x' }],
    聊天书: [{ name: '本幕参考', content: '【本幕参考】…' }],
  };
}

injectHostForTest({
  worldbook: {
    boundNames: () => ({ primary: '主书', additional: ['副书'] }),
    chatName: () => '聊天书',
    globalNames: () => ['全局书'],
    entries: async (名: string) => {
      if (!(名 in 书)) throw new Error('没有这本世界书');
      return 书[名].map(条 => ({ ...条 }));
    },
    remove: async (名: string, 判定: (条: any) => boolean) => {
      书[名] = 书[名].filter(条 => !判定(条));
    },
    create: async () => {},
    update: async () => {},
    globalEntries: async () => [],
  } as any,
  vars: { get: () => ({}), update: (fn: any) => fn({}), del: () => ({}), insertOrAssign: () => ({}), scriptId: () => 't' } as any,
  chat: { currentChatId: () => 'c', isGroupChat: () => false, lastMessageId: () => 0, messages: () => [] } as any,
} as any);
setActivePinia(createPinia());

console.log('\n[1] 精确标记四种 → true');
{
  ok('① extra.daoyan === true', is导演条目({ name: '随便什么名字', content: '', extra: { daoyan: true } }));
  ok(`② 名字恰好等于 ${WORLDBOOK_ENTRY_NAME}`, is导演条目({ name: WORLDBOOK_ENTRY_NAME, content: '' }));
  ok('② 备注恰好等于（名字不同也算）', is导演条目({ name: 'x', comment: WORLDBOOK_ENTRY_NAME, content: '' }));
  ok('③ 内容以 [剧情导演 · 编剧备忘] 开头', is导演条目({ name: 'x', content: '[剧情导演 · 编剧备忘]\n- 事实' }));
  ok('④ 内容以【本幕参考】开头', is导演条目({ name: 'x', content: '【本幕参考】…' }));
  ok('空对象/null 不算', !is导演条目(null) && !is导演条目({}));
}

console.log('\n[2] 用户自建四条（opencode 的 prove-wb 样本）→ **必须 false**');
{
  ok('《我的剧情导演笔记》不是我写的', !is导演条目({ name: '我的剧情导演笔记', content: '这是我自己的笔记' }));
  ok('《剧情导演参考》不是我写的', !is导演条目({ name: '剧情导演参考', content: '参考资料' }));
  ok('《关于剧情导演的设定》不是我写的', !is导演条目({ name: '关于剧情导演的设定', content: '设定' }));
  ok('备注里带「剧情导演」的 NPC 卡不是我写的', !is导演条目({ name: 'NPC 卡 · 艾莉', comment: '剧情导演相关的一个 NPC', content: '艾莉，17 岁' }));
}

console.log('\n[3] 旧版命名 → 也不认（改由 列出疑似旧条目 报告，不删）');
{
  ok('「导演指令 · …」不算我们的', !is导演条目({ name: '导演指令 · 近期写作要求, 优先级高于剧情总纲', content: '（暂无特别指令）' }));
  ok('注释带「导演指令」不算', !is导演条目({ name: 'x', comment: '导演指令 · 旧版', content: '' }));
  ok('「【导演】角色状态」不算', !is导演条目({ name: '【导演】角色状态', content: '角色: Lim 活跃' }));
  ok('内容以【导演指令 开头不算（旧内容签名已删）', !is导演条目({ name: 'x', content: '【导演指令 · 近期写作要求\n（暂无特别指令）' }));
}

console.log('\n[4] 清理：只删精确命中，用户自建与旧版命名**一条都不许动**');
{
  造书();
  const { 删掉, 疑似 } = await 清空导演条目();

  ok('主书里带 extra 标记的编剧备忘被删了', !书.主书.some(条 => 条.extra?.daoyan === true));
  ok('聊天书里的【本幕参考】被删了', 书.聊天书.length === 0);

  for (const 名 of ['我的剧情导演笔记', '剧情导演参考', '关于剧情导演的设定', 'NPC 卡 · 艾莉']) {
    ok(`用户自建「${名}」仍在书里（这是本批的核心）`, 书.主书.some(条 => 条.name === 名));
  }
  ok('旧版命名「导演指令 · …」仍在书里（不再自动删）', 书.主书.some(条 => String(条.name).startsWith('导演指令')));
  ok('副书的旧版残留仍在', 书.副书.length === 1);
  ok('全局书的【导演】旧全局条目仍在', 书.全局书.length === 1);

  ok('删除清单非空（能告诉用户删了什么）', 删掉.length >= 2);
  ok('清单带书名', 删掉.some(项 => 项.startsWith('主书#')));

  console.log('\n[5] 疑似清单：列出旧版命名，且不含已被精确删掉的');
  {
    const 条目名 = 疑似.map(项 => 项.条目);
    ok('列出「导演指令 · …」', 条目名.some(x => x.startsWith('导演指令')));
    ok('列出「旧版本残留」', 条目名.includes('旧版本残留'));
    ok('列出「【导演】旧全局条目」', 条目名.includes('【导演】旧全局条目'));
    ok('**不含**已被精确删掉的 编剧备忘', !条目名.includes('编剧备忘'));
    // 注意语义：疑似清单**会**列出含「剧情导演」的用户条目 —— 那正是"疑似"的意思（宁可疑似，不可漏报）。
    // 关键不是"不上榜"，而是"榜上有名也不会被删"（第 [4] 节已逐条证明它们仍在书里）。
    ok('用户自建条目会出现在疑似清单里（疑似 ≠ 删除）', 条目名.some(x => x.includes('我的剧情导演笔记')));
    ok('每条都带原因', 疑似.every(项 => !!项.原因 && !!项.书));
  }
}

console.log('\n[6] 幂等：再清一次不报错；疑似仍在（它本来就不会被删）');
{
  const 再删 = await 清空导演条目();
  check('删掉 = 空', 再删.删掉.length, 0);
  ok('用户条目还在', 书.主书.some(条 => 条.name === '我的剧情导演笔记'));
  ok('疑似仍非空（说明它没被"顺手"删掉）', 再删.疑似.length >= 3);
}

console.log('\n[7] 对照组：旧的宽松判定确实会删掉用户条目（证明第 4 节不是空转）');
{
  // 把旧规则原样抄一遍（`/剧情导演/` 无锚定 + 内容以【导演 开头），只看判定结果，不真删
  const 旧宽松判定 = (entry: any): boolean => {
    if (entry?.extra?.daoyan === true) return true;
    const 名 = String(entry?.name ?? '');
    const 注 = String(entry?.comment ?? '');
    if ([名, 注].some(t => [/^【导演/, /^【剧情导演/, /^导演指令/, /^编剧备忘/, /剧情导演/].some(re => re.test(t)))) return true;
    const 内容 = String(entry?.content ?? '').trimStart();
    return 内容.startsWith('【导演') || 内容.startsWith('【编剧备忘】') || 内容.startsWith('【本幕参考】');
  };
  const 用户条 = [
    { name: '我的剧情导演笔记', content: '这是我自己的笔记' },
    { name: '剧情导演参考', content: '参考资料' },
    { name: '关于剧情导演的设定', content: '设定' },
    { name: 'NPC 卡 · 艾莉', comment: '剧情导演相关的一个 NPC', content: '艾莉，17 岁' },
  ];
  check('旧规则会把 4 条用户条目全判成"我们的"（所以当年会全删）', 用户条.filter(旧宽松判定).length, 4);
  check('新规则一条都不认', 用户条.filter(is导演条目).length, 0);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
