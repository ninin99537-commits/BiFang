import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';
import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';

const 甲 = {
  reply: 'AAAREPLY', replyCount: 987654, context: 'AAACTX', timeJump: 'AAAJUMP',
  tracked: ['AAATRK1', 'AAATRK2'], inSceneHint: ['AAAHINT'],
  currentCards: { AAACARD: { 当前在做: 'aaa' } },
  worldbook: 'AAAWB', currentStoryTime: 'AAACTIME',
  storyTimeHint: 'AAASTIME', storySpan: 'AAASPAN', recentTrace: 'AAATRACE',
  playerName: 'AAAPNAME', playerDescription: 'AAAPDESC',
};

const 造 = (标, 额外 = {}) => ({
  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],
  预填充: false, 展开宏: (t) => t, ...标, ...额外,
});

const 跑 = (标, 额外) => {
  const 原I = console.info, 原T = console.table, 原W = console.warn;
  console.info = () => {}; console.table = () => {}; console.warn = () => {};
  let r;
  try { r = buildUpdateMessages(造(标, 额外)); }
  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }
  return r;
};

const A = 跑(甲);
const 内容 = A.零件内容 ?? {};

// ── 每条消息由哪些零件组成（按默认顺序, 且跳过空的）──
const 默认顺序 = ['R1','R2','R3','R4','R5','D13','D1','D2','D-T','D-N','D9','D10','D11','D12','D14'];
const 块归属 = Object.fromEntries(零件表.map(件 => [件.代号, 件.块]));

console.log('=== 每个零件的长度与块 ===');
for (const 代 of 默认顺序) {
  const c = String(内容[代] ?? '');
  console.log(代.padEnd(5), String(c.length).padStart(5), 块归属[代] ?? '?', c ? '' : '(空)');
}

// ── 用零件级占位符重建三条消息 ──
// 规则块: R1..R5（R1 会变模板文字, 其余占位符）
// 场景判断: D13
// 任务块: D1..D14
function 拼(代号们) {
  return 代号们.map(代 => {
    const c = String(内容[代] ?? '');
    return c ? '{{彼方:' + (零件表.find(x => x.代号 === 代)?.名 ?? 代) + '}}' : '';
  }).join('');
}

const 规则段 = 拼(['R1','R2','R3','R4','R5']);
const 场景段 = 拼(['D13']);
const 任务段 = 拼(['D1','D2','D-T','D-N','D9','D10','D11','D12','D14']);

console.log('');
console.log('=== 零件级占位符重建 ===');
console.log('规则段:', JSON.stringify(规则段));
console.log('场景段:', JSON.stringify(场景段));
console.log('任务段:', JSON.stringify(任务段));

// ── 验证: 填回后必须逐字节等于原消息 ──
const 名到内容 = Object.fromEntries(零件表.map(件 => [件.名, String(内容[件.代号] ?? '')]));
function 填(文) {
  return 文.replace(/\{\{彼方:([^}]+)\}\}/g, (_, 名) => 名到内容[名] ?? '\u0000缺' + 名 + '\u0000');
}
console.log('');
console.log('=== 填回验证 ===');
[['规则段', 规则段, 0], ['场景段', 场景段, 1], ['任务段', 任务段, 2]].forEach(([名, 文, i]) => {
  const 出 = 填(String(文));
  const 原 = String(A.messages[i].content);
  console.log(名, '逐字节相同?', 出 === 原);
  if (出 !== 原) {
    for (let k = 0; k < Math.max(出.length, 原.length); k++) {
      if (出[k] !== 原[k]) {
        console.log('  差异 @', k, '| 填:', JSON.stringify(出.slice(Math.max(0,k-40),k+40)), '| 原:', JSON.stringify(原.slice(Math.max(0,k-40),k+40)));
        break;
      }
    }
  }
});

// ── 关键: 这些零件的内容**全部**是动态的吗? 有没有静态部分可搬进模板? ──
// 判据: 同一零件在两组数据下的**公共前后缀** = 静态部分
console.log('');
console.log('=== 每个零件的静态部分（两组数据的公共前缀/后缀）===');
const 乙 = {
  reply: 'BBBREPLY', replyCount: 246813, context: 'BBBCTX', timeJump: 'BBBJUMP',
  tracked: ['BBBT1'], inSceneHint: ['BBBH1'],
  currentCards: { BBBCARD: { 当前在做: 'bbb' } },
  worldbook: 'BBBWB', currentStoryTime: 'BBBCTIME',
  storyTimeHint: 'BBBSTIME', storySpan: 'BBBSPAN', recentTrace: 'BBBTTRACE',
  playerName: 'BBBPNAME', playerDescription: 'BBBDESC',
};
const B = 跑(乙);
const 内容B = B.零件内容 ?? {};
for (const 代 of 默认顺序) {
  const a = String(内容[代] ?? '');
  const b = String(内容B[代] ?? '');
  if (!a && !b) continue;
  let 前 = 0;
  while (前 < a.length && 前 < b.length && a[前] === b[前]) 前++;
  let 后 = 0;
  while (后 < a.length - 前 && 后 < b.length - 前 && a[a.length-1-后] === b[b.length-1-后]) 后++;
  const 静态 = a.length - 前 - 后;
  console.log(代.padEnd(5), 'len=' + String(a.length).padStart(5), '公共前缀=' + String(前).padStart(4), '公共后缀=' + String(后).padStart(4), '→ 中间动态区=' + 静态);
}