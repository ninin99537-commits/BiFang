// 彼方 · 「这条世界书条目是不是我们自己写的」(候选11) —— 四样信号, 一处判定
//
// 以前三处各写一份, 而且不一致: worldbook.ts 里两份一模一样的(读世界书时"把自己排除", 免得把上一轮
// 状态卡当设定), worldbook-inject.ts 一份少了"备注命中"与"正文开头"两样(注入时寻找/更新/删除自己那条)。
// 后果就是世界书里会多出一条重复的彼方条目。这里把四样信号、边界情形、以及"判定只有一处"都钉住。
import {
  ACU_BLOCKED_KEYWORDS,
  BIFANG_WORLDBOOK_ENTRY_NAME,
  isBifangEntry,
  sanitizeBifangEntryName,
} from '../src/彼方_NPC幕后生命状态系统/彼方条目';
import { buildInjectionPrompt } from '../src/彼方_NPC幕后生命状态系统/prompts';
import 条目源码 from '../src/彼方_NPC幕后生命状态系统/彼方条目.ts?raw';
import 读取源码 from '../src/彼方_NPC幕后生命状态系统/worldbook.ts?raw';
import 写入源码 from '../src/彼方_NPC幕后生命状态系统/worldbook-inject.ts?raw';

// prompts.ts 会牵到 settings.ts(用酒馆注入的 `_` 与浏览器 localStorage), 给两个最小替身
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
};
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

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

const 前缀 = '[彼方 · 幕后NPC状态]';

console.log('\n[1] 四样信号, 命中任意一样就算是我们写的');
{
  ok('正文开头', isBifangEntry({ content: `${前缀}\n- 爱丽丝 | 状态未知` }));
  ok('名字命中', isBifangEntry({ name: BIFANG_WORLDBOOK_ENTRY_NAME, content: '随便什么' }));
  ok('备注命中', isBifangEntry({ comment: BIFANG_WORLDBOOK_ENTRY_NAME, content: '随便什么' }));
  ok('extra 标记', isBifangEntry({ extra: { bifang: true }, content: '随便什么' }));
  ok('正文开头前有空白也算(酒馆回读常带换行)', isBifangEntry({ content: `\n\n  ${前缀}\n- 爱丽丝` }));
}

console.log('\n[2] 不像我们的条目不认');
{
  check('别人的条目', isBifangEntry({ name: '设定集', content: '世界观' }), false);
  check('空对象', isBifangEntry({}), false);
  check('null', isBifangEntry(null), false);
  check('undefined', isBifangEntry(undefined), false);
  check('前缀出现在中间不算', isBifangEntry({ content: `前面还有别的字 ${前缀}` }), false);
  check('名字相近但不相等', isBifangEntry({ name: `${BIFANG_WORLDBOOK_ENTRY_NAME}2` }), false);
  check('标记是 false', isBifangEntry({ extra: { bifang: false } }), false);
  check('标记是别的值', isBifangEntry({ extra: { bifang: 'yes' } }), false);
}

console.log('\n[3] 判定只有一处 —— 三份不一致的谓词正是这条候选的起因');
{
  check('彼方条目.ts 里定义一次', (条目源码.match(/function isBifangEntry/g) || []).length, 1);
  ok('worldbook.ts 不再自己写判定', !/isSelfEntry/.test(读取源码));
  ok('worldbook.ts 不再内联比较条目名', !/===\s*BIFANG_WORLDBOOK_ENTRY_NAME/.test(读取源码));
  ok('worldbook.ts 用的就是这一处', /import\s*\{\s*isBifangEntry\s*\}\s*from '\.\/彼方条目'/.test(读取源码));
  ok('worldbook-inject.ts 不再自己写判定', !/(function|const)\s+isBifangEntry/.test(写入源码));
  ok('worldbook-inject.ts 不再内联比较条目名', !/===\s*BIFANG_WORLDBOOK_ENTRY_NAME/.test(写入源码));
  ok('worldbook-inject.ts 用的就是这一处', /isBifangEntry[\s\S]{0,80}from '\.\/彼方条目'/.test(写入源码));
  ok('ACU 屏蔽词表也不再写第二份', !/ACU_BLOCKED_KEYWORDS\s*=/.test(写入源码));
}

console.log('\n[4] 真正写进世界书的内容, 一定认得回来');
{
  const 正文 = buildInjectionPrompt([]);
  check('空名单时正文就是那行开头', 正文, 前缀);
  ok('认得出', isBifangEntry({ content: 正文 }));
  ok('带一个 NPC 也认得出', isBifangEntry({ content: buildInjectionPrompt([['爱丽丝', { 当前在做: '看书' }]]) }));
}

console.log('\n[5] 条目名避开了 ACU 屏蔽词(否则剧情推进会读不到这一条)');
{
  check('没有一个屏蔽词命中', ACU_BLOCKED_KEYWORDS.filter(word => BIFANG_WORLDBOOK_ENTRY_NAME.includes(word)), []);
}

console.log('\n[6] 名字撞上屏蔽词 → 改回安全名; 用户自定义的名字 → 保留');
{
  check('旧名含"状态" → 改回安全名', sanitizeBifangEntryName('NPC幕后状态'), BIFANG_WORLDBOOK_ENTRY_NAME);
  check('含"规则" → 改回安全名', sanitizeBifangEntryName('我的规则条目'), BIFANG_WORLDBOOK_ENTRY_NAME);
  check('自定义名不含屏蔽词 → 保留', sanitizeBifangEntryName('我的幕后生活'), '我的幕后生活');
  check('两侧空白去掉', sanitizeBifangEntryName('  我的幕后生活  '), '我的幕后生活');
  check('空串 → 原样返回空(兜底名由调用方给: entry.name || 安全名)', sanitizeBifangEntryName(''), '');
  check('undefined → 原样返回空', sanitizeBifangEntryName(undefined), '');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
