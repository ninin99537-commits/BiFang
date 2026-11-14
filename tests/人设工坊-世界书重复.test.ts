// 人设工坊 · 世界书条目重复 + 写入匹配（2026-10-16）
//
// 用户报: 「我们的插件写入世界书之后，插件里的世界书条目有重复，但是酒馆世界书上是正常的」
//
// 实测证据(双生潮.json, 32 条): **ST 把条目标题存在 `comment` 里, `name` 全为空** ——
// 我们插件自己写进去的 5 条也一样(酒馆助手把传入的 name 映射成 comment, 落盘后 name 仍是空)。
// 于是两处都读错了字段:
//   · 读取端 `世界书.ts` 读 `条.name` → 全部回退成「条目{uid}」;
//   · 写入端 `sink.ts` 用 `项.name === 名` 找"已有条目" → **永远匹配不上** → 每次写入都新建 →
//     酒馆助手给新条目分配**新的随机 uid**(实测 45851/491332/604543/812542/908922),
//     而卡里的内嵌快照还留着导出时的数组下标 → 同一条内容在候选列表里出现两行。
//   酒馆里只有一份(快照不在书里), 所以"酒馆上是正常的"。
//
// 真实数据实跑: 修前 32 条的书读成 **35 行**(3 组内容完全相同 + 1 组标题相同);
//               修后 **32 行**, 键/标题/内容三种重复全部为 0。
import { 取条目标题, 取世界书条目, type 世界书条目 } from '../src/人设工坊/lib/世界书';
import { 写入世界书, 写入人物索引, 人物索引条目名 } from '../src/人设工坊/lib/sink';

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
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

const G = globalThis as unknown as Record<string, unknown>;

console.log('\n[1] 标题在 comment 里，不在 name 里（实测 32/32 条 name 为空）');
{
  check('comment 有值 → 用 comment', 取条目标题({ comment: '桐生千夏', name: '' }, 812542), '桐生千夏');
  check('comment 空、name 有值 → 用 name（老格式兜底）', 取条目标题({ comment: '', name: '旧格式' }, 1), '旧格式');
  check('两个都有 → comment 优先', 取条目标题({ comment: 'A', name: 'B' }, 1), 'A');
  check('都空 + 给了 uid → 「条目{uid}」占位', 取条目标题({ comment: '', name: '' }, 45851), '条目45851');
  check('都空 + 没给 uid（写入端匹配用）→ 空串，不匹配任何名字', 取条目标题({ comment: '', name: '' }), '');
}

console.log('\n[2] ★ 对照组: 旧判据在真实形状上必须给错答案');
{
  const 真实条目 = { comment: '桐生千夏', name: '', uid: 812542 }; // 从 双生潮.json 抄的形状
  const 旧判据 = (项: { name?: unknown }, 名: string) => 项.name === 名; // 以前的写法
  check('旧判据认为「没有同名条目」→ 所以它会新建 → 重复', 旧判据(真实条目, '桐生千夏'), false);
  check('新判据认为「有同名条目」→ 所以它会覆盖', 取条目标题(真实条目) === '桐生千夏', true);
}

console.log('\n[3] 去重: 键 / 内容 / 书名+标题 三种重复都要消掉');
{
  // 合成数据，形状照真实那张卡: 内嵌快照(uid 是数组下标) + 绑定书(uid 是 ST 分配的)
  const 内嵌 = {
    name: '测试书',
    entries: [
      { comment: '甲', name: null, content: 'AAA', constant: true, enabled: true },
      { comment: '乙', name: null, content: 'BBB', constant: false, enabled: true },
      { comment: 人物索引条目名, name: null, content: '旧索引', constant: true, enabled: true },
    ],
  };
  const 绑定 = [
    { uid: 812542, comment: '甲', name: '', content: 'AAA', enabled: true, strategy: { type: 'constant' } },
    { uid: 908922, comment: '乙', name: '', content: 'BBB', enabled: true, strategy: { type: 'selective' } },
    { uid: 604543, comment: 人物索引条目名, name: '', content: '新索引（比旧的长一些）', enabled: true, strategy: { type: 'constant' } },
  ];
  G.getCharData = () => ({ name: '测试卡', data: { character_book: 内嵌 } });
  G.getCharWorldbookNames = () => ({ primary: '测试书', additional: [] });
  G.getChatWorldbookName = () => null;
  G.getWorldbook = async () => 绑定;

  const 行 = await 取世界书条目();
  check('3 条(不是 6 条 —— 修前就是 6 条)', 行.length, 3);
  check(
    '保留绑定书的 uid（活的），不保留卡里快照的下标',
    行.map(条 => 条.键).sort(),
    ['测试书#604543', '测试书#812542', '测试书#908922'],
  );
  check('标题取到真名，不再是「条目{uid}」', 行.map(条 => 条.名).sort(), ['乙', 人物索引条目名, '甲'].sort());
  ok('按字数降序', 行.every((条, i) => i === 0 || 行[i - 1].字数 >= 条.字数));
  ok('内容也各不相同（内容去重生效）', new Set(行.map(条 => 条.内容)).size === 行.length);

  // 对照组: 只按键去重的旧逻辑在同一份数据上留 6 行 —— 证明这个测试有分辨力
  const 旧逻辑 = (() => {
    const 全部: Array<Pick<世界书条目, '键' | '名' | '内容'>> = [
      ...内嵌.entries.map((e, i) => ({ 键: `测试书#${i}`, 名: String(e.comment), 内容: e.content })),
      ...绑定.map(e => ({ 键: `测试书#${e.uid}`, 名: String(e.name), 内容: e.content })),
    ];
    const 见 = new Set<string>();
    return 全部.filter(条 => (见.has(条.键) ? false : (见.add(条.键), true)));
  })();
  check('★ 旧逻辑同一份数据给 6 行（所以用户看到重复）', 旧逻辑.length, 6);
  check('★ 新逻辑给 3 行', 行.length, 3);
}

console.log('\n[4] ★ 写入: 已有同名条目必须「覆盖」，绝不新建（重复条目的根因）');
{
  const 调用: string[] = [];
  const 已有 = [
    { uid: 812542, comment: '桐生千夏', name: '', content: '旧人设', enabled: true, strategy: { type: 'selective' } },
    { uid: 604543, comment: 人物索引条目名, name: '', content: '桐生千夏 — 旧介绍', enabled: true, strategy: { type: 'constant' } },
  ];
  G.getWorldbook = async () => 已有;
  G.updateWorldbookWith = async (_书: string, 改: (条: unknown[]) => unknown[]) => {
    调用.push('update');
    return 改(已有);
  };
  G.createWorldbookEntries = async () => {
    调用.push('create');
    return [];
  };

  await 写入世界书('桐生千夏', '# 角色：桐生千夏\n新的正文', ['桐生千夏'], 'user');
  check('写入人设 → 走 update，没走 create', 调用, ['update']);

  调用.length = 0;
  await 写入人物索引('桐生千夏', '新的介绍', 'user');
  check('写入人物索引 → 走 update，没走 create', 调用, ['update']);
}

console.log('\n[5] 没有同名条目时才新建（别把新角色也挡住了）');
{
  const 调用: string[] = [];
  G.getWorldbook = async () => [
    { uid: 1, comment: '别的角色', name: '', content: 'xxx', enabled: true, strategy: { type: 'selective' } },
  ];
  G.updateWorldbookWith = async () => {
    调用.push('update');
    return [];
  };
  G.createWorldbookEntries = async () => {
    调用.push('create');
    return [];
  };
  await 写入世界书('全新的角色', '# 角色：全新的角色\n正文', ['全新的角色'], 'user');
  check('新角色 → 走 create', 调用, ['create']);
}

console.log(`\n人设工坊世界书重复: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
