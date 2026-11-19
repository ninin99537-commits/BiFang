// 彼方 · 条目列表（零件化 v3）—— 批次: 2026-11-19 列表模型后端
//
// 这个用例要证明两件事（需求方 2026-11-19 点名要的）：
//   ① **`解析位置()` 是唯一的顺序逻辑** —— 全项目只有一处把"列表"变成"段序"
//   ② **内置内容在类型上没有写入口** —— 像 `静默` 那样，不是"UI 不给编辑框"
//
// 外加：
//   [C18] 块划分：内置项按语义块、用户条目按 role
//   [C19] 原位记号：关闭的项也要显示
//   [C14] 默认列表顺序 = 去伪装后的拼装顺序（对齐新基准）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import {
    默认列表顺序, 零件默认role, 零件所在块, 造内置列表,
    解析位置, 合并成块, 块内用户文本, 原位序号,
    type 列表项, type 用户条目,
} from '../src/彼方_NPC幕后生命状态系统/条目列表';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

const ROOT = process.cwd();
const 彼方目录 = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 备注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  FAIL ${名}${备注 ? `  (${备注})` : ''}`);
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
    console.log(`  FAIL ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 去注释（与 人设工坊-形态.test.ts 同一套写法） */
function 去注释(源码: string): string {
  return 源码
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function 列源文件(目录: string): string[] {
  const 结果: string[] = [];
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory())
      结果.push(...列源文件(全));
    else if (/\.(ts|vue)$/.test(名))
      结果.push(全);
  }
  return 结果;
}

const 取内容 = (代号: string) => `<${代号}的内容>`;

// ─────────────────────────────────────────────────────────────
console.log('\n[位置] 证明 ①: 全项目只有一处把"列表"变成"段序"');
{
  // 判据: 调 `解析位置(` 的文件必须是白名单。
  // **白名单只有两个**: 定义处（条目列表.ts）+ 唯一调用方（prompts.ts）。
  // 若有人在 UI 组件里自己排一遍，这里会红。
  const 白名单 = new Set(['条目列表.ts', 'prompts.ts']);
  const 违规: string[] = [];
  for (const 文件 of 列源文件(path.join(ROOT, 'src'))) {
    const 代码 = 去注释(readFileSync(文件, 'utf8'));
    if (!/解析位置\s*\(/.test(代码))
      continue;
    const 名 = path.basename(文件);
    if (!白名单.has(名))
      违规.push(path.relative(ROOT, 文件));
  }
  eq('[位置] 只有白名单里的文件调用 解析位置', 违规, []);

  // 定义处只有一处
  let 定义处 = 0;
  for (const 文件 of 列源文件(path.join(ROOT, 'src'))) {
    const 代码 = 去注释(readFileSync(文件, 'utf8'));
    if (/export function 解析位置\s*\(/.test(代码))
      定义处++;
  }
  eq('[位置] 解析位置 只定义了一次', 定义处, 1);

  // 自证: 这条扫描抓得住 —— 拿一个假的"第二实现"喂给同一段判据
  const 扫描 = (文件们: { 名: string; 源码: string }[]) => 文件们
    .filter(({ 名, 源码 }) => /解析位置\s*\(/.test(去注释(源码)) && !白名单.has(名))
    .map(f => f.名);
  eq('[位置/自证] 假 UI 组件里自己排一遍 → 被抓',
    扫描([{ 名: '页面-拼装.vue', 源码: 'const x = 解析位置({列表: []});' }]),
    ['页面-拼装.vue']);
  eq('[位置/自证] 只在注释里提到 → 不报',
    扫描([{ 名: '页面-拼装.vue', 源码: '// 这里不许调 解析位置(\nconst x = 1;' }]),
    []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[只读] 证明 ②: 内置内容在类型上没有写入口');
{
  const 源码 = readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8');
  // 内置条目的 `内容` 必须是函数类型（`() => string`），不是字符串字段。
  // 字符串字段可以被赋值；函数字段不能。
  const 内置段 = 源码.slice(源码.indexOf('export interface 内置条目'), 源码.indexOf('export interface 用户条目'));
  ok('[只读] 内置条目的 内容 声明为函数(不是 string)',
    /readonly\s+内容\s*:\s*\(\s*\)\s*=>\s*string/.test(内置段), 内置段.slice(0, 200));
  ok('[只读] 内置条目的 内容 是 readonly',
    /readonly\s+内容/.test(内置段));
  // 用户条目的 `内容` 必须是可写的 string（否则用户就没法写了）
  const 用户段 = 源码.slice(源码.indexOf('export interface 用户条目'), 源码.indexOf('export type 列表项'));
  ok('[只读] 用户条目的 内容 是 string(可写)', /内容\s*:\s*string/.test(用户段), 用户段.slice(0, 200));
  // **两者类型不同** —— 这是"不会互相误用"的结构保证
  ok('[只读] 两者对 内容 的声明不同(内置是函数, 用户是字符串)',
    !/readonly\s+内容\s*:\s*\(\s*\)\s*=>\s*string/.test(用户段) && !/内容\s*:\s*string/.test(内置段));

  // 运行时自证: 造出来的内置项, 内容字段确实是函数
  const 内置 = 造内置列表(取内容);
  ok('[只读/自证] 内置项的内容字段是函数', typeof 内置[0].内容 === 'function');
  eq('[只读/自证] 调用它拿到内容', 内置[0].内容(), `<${内置[0].代号}的内容>`);
  // 自证: 函数字段不能被"赋值成字符串"而不报错(运行时会变成非函数, 但那不是我们要的路径)
  ok('[只读/自证] 内容字段不是普通字符串', typeof 内置[0].内容 !== 'string');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C14] 默认列表顺序 = 去伪装后的拼装顺序');
{
  // 判据不是"我写的顺序看着对", 而是**与实发产物逐块对照**。
  // 实发(去伪装后): 无场景 → [system(规则), user(任务)]；有场景 → 加一条 system(场景判断)
  eq('[C14] 默认顺序含全部 15 个零件', 默认列表顺序.length, 15);
  const 重号 = 默认列表顺序.filter((代, i, a) => a.indexOf(代) !== i);
  eq('[C14] 默认顺序里没有重复代号', 重号, []);
  // R5 必须在 R4 之后、且在 D13 之前（伪装移除后它回到规则正文末尾）
  const R4位 = 默认列表顺序.indexOf('R4');
  const R5位 = 默认列表顺序.indexOf('R5');
  const D13位 = 默认列表顺序.indexOf('D13');
  ok('[C14] R5 在 R4 之后', R5位 > R4位, `R4@${R4位} R5@${R5位}`);
  ok('[C14] R5 在 D13 之前(不在最末 —— 那是伪装的做法)', R5位 < D13位, `R5@${R5位} D13@${D13位}`);
  ok('[C14] D13 在全部数据零件之前', D13位 < 默认列表顺序.indexOf('D1'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C18] 块划分: 内置项按语义块、用户条目按 role');
{
  // 块划分必须能重现实发结构。用 role 序列对照。
  const 造输入 = (额外: Record<string, any> = {}) => ({
    reply: '剧情正文', replyCount: 1, context: '', timeJump: '',
    tracked: ['甲'], inSceneHint: [],
    currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },
    autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],
    预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',
    storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',
    playerName: '主角', playerDescription: '', 展开宏: (t: string) => t,
    ...额外,
  });
  const 实发role = (额外: Record<string, any>) => {
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    try {
      return buildUpdateMessages(造输入(额外) as any).messages.map(m => m.role);
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
  };

  // ① 无场景: system, user
  eq('[C18] 无场景时实发是 system,user', 实发role({}), ['system', 'user']);
  // ② 有场景: system, system, user —— **两条 system 不能合并**
  eq('[C18] 有场景时实发是 system,system,user(场景判断独立一条)', 实发role({ context: '广场' }), ['system', 'system', 'user']);

  // ③ 块划分本身：三个语义块
  const 内置 = 造内置列表(取内容);
  const 解析 = 解析位置({ 列表: 内置, 关闭零件: [] });
  const 块们 = 合并成块(解析.段们);
  eq('[C18] 无场景时是 3 块(规则/场景判断/任务)', 块们.length, 3);
  eq('[C18] 第一块是规则块', 零件所在块(块们[0][0].代号!), '规则');
  eq('[C18] 第二块是场景判断块', 零件所在块(块们[1][0].代号!), '场景判断');
  eq('[C18] 第三块是任务块', 零件所在块(块们[2][0].代号!), '任务');
  // 规则块含 R1–R5，场景判断块只含 D13，任务块含全部 D*
  eq('[C18] 规则块含 R1–R5', 块们[0].map(段 => 段.代号), ['R1', 'R2', 'R3', 'R4', 'R5']);
  eq('[C18] 场景判断块只有 D13', 块们[1].map(段 => 段.代号), ['D13']);

  // ④ 用户条目之间才合并
  const 用户们: 用户条目[] = [
    { id: 'u1', 来源: '用户', role: 'system', 内容: 'A', 启用: true },
    { id: 'u2', 来源: '用户', role: 'system', 内容: 'B', 启用: true },
    { id: 'u3', 来源: '用户', role: 'user', 内容: 'C', 启用: true },
  ];
  const 解析2 = 解析位置({ 列表: [...内置, ...用户们], 关闭零件: [] });
  const 块2 = 合并成块(解析2.段们);
  // 规则/场景/任务 三块 + 用户两条 system 合成一块 + 一条 user 一块 = 5 块
  eq('[C18] 相邻同 role 的用户条目合成一块', 块2.length, 5);
  const 末两块 = 块2.slice(3);
  eq('[C18] 用户的两条 system 在一块里', 末两块[0].length, 2);
  eq('[C18] 块内文本用 \\n\\n 连接', 块内用户文本(末两块[0]), 'A\n\nB');
  eq('[C18] 用户条目不会与内置项合并', 末两块[0][0].来源, '用户');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C19] 原位记号: 关闭的项也要显示');
{
  // 原位序号是"它本来在哪"，与开关无关
  eq('[C19] R1 的原位是 0', 原位序号('R1'), 0);
  eq('[C19] D1 的原位可查', typeof 原位序号('D1'), 'number');
  eq('[C19] 用户条目没有原位', 原位序号('随便一个用户 id'), undefined);

  // 关键: 关闭某零件后，它的原位序号**仍然可查**
  const 内置 = 造内置列表(取内容);
  for (const 项 of 内置) {
    if (项.代号 === 'D2')
      项.启用 = false;
  }
  eq('[C19] 关掉 D2 之后原位序号仍在', 原位序号('D2'), 默认列表顺序.indexOf('D2'));
  // 自证: 它在解析结果里确实不出现了（关闭生效）
  const 解析 = 解析位置({ 列表: 内置, 关闭零件: ['D2'] });
  ok('[C19/自证] 关掉的零件不在段序里', !解析.段们.some(段 => 段.代号 === 'D2'));
  ok('[C19/自证] 但它仍有原位序号', 原位序号('D2') !== undefined);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C15] 引用即搬迁: 被引用的零件从默认位置移除');
{
  const 内置 = 造内置列表(取内容);
  const 用户: 用户条目 = {
    id: 'u1', 来源: '用户', role: 'system', 内容: '前面{{彼方:世界书}}后面', 启用: true,
  };
  const 解析 = 解析位置({ 列表: [...内置, 用户], 关闭零件: [] });
  ok('[C15] 世界书被标记为"被引用"', 解析.被引用.has('D2'));
  ok('[C15] 它不在默认位置(段序里没有 D2)', !解析.段们.some(段 => 段.代号 === 'D2'));
  const 用户段 = 解析.段们.find(段 => 段.id === 'u1');
  ok('[C15] 用户条目里展开了它', String(用户段?.文本).includes('<D2的内容>'), String(用户段?.文本));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C4/C5] 首处生效 / D13 只许 system');
{
  const 内置 = 造内置列表(取内容);
  // C4: 两处引用同一零件 → 只第一处展开
  const 两条: 用户条目[] = [
    { id: 'u1', 来源: '用户', role: 'system', 内容: '{{彼方:世界书}}', 启用: true },
    { id: 'u2', 来源: '用户', role: 'system', 内容: '{{彼方:世界书}}', 启用: true },
  ];
  const 解析 = 解析位置({ 列表: [...内置, ...两条], 关闭零件: [] });
  const u1 = 解析.段们.find(段 => 段.id === 'u1');
  const u2 = 解析.段们.find(段 => 段.id === 'u2');
  ok('[C4] 第一处展开', String(u1?.文本).includes('<D2的内容>'));
  // 第二处展开后是空串 → 整条为空 → 不出现在段序里
  ok('[C4] 第二处被忽略(整条变空后不出现)', u2 === undefined, JSON.stringify(u2));
  ok('[C4] 有重复引用的 warn', 解析.问题.some(q => q.includes('重复引用')), 解析.问题.join(' | '));

  // C5: D13 被 user 条目引用 → 不展开
  const 错角色: 用户条目[] = [
    { id: 'u1', 来源: '用户', role: 'user', 内容: '{{彼方:场景判断}}', 启用: true },
  ];
  const 解析2 = 解析位置({ 列表: [...内置, ...错角色], 关闭零件: [] });
  ok('[C5] user 条目引用场景判断 → 不展开', 解析2.问题.some(q => q.includes('只能被 system')), 解析2.问题.join(' | '));
  // 自证: system 条目就能展开
  const 对角色: 用户条目[] = [
    { id: 'u1', 来源: '用户', role: 'system', 内容: '{{彼方:场景判断}}', 启用: true },
  ];
  const 解析3 = 解析位置({ 列表: [...内置, ...对角色], 关闭零件: [] });
  ok('[C5/自证] system 条目能展开场景判断', !解析3.问题.some(q => q.includes('只能被 system')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[未知] 拼错的占位符: 忽略 + 指名道姓');
{
  const 内置 = 造内置列表(取内容);
  const 用户: 用户条目 = {
    id: 'u1', 来源: '用户', role: 'system', 内容: 'A{{彼方:世界舒}}B', 启用: true,
  };
  const 解析 = 解析位置({ 列表: [...内置, 用户], 关闭零件: [] });
  ok('[未知] 有指名道姓的 warn', 解析.问题.some(q => q.includes('{{彼方:世界舒}}')), 解析.问题.join(' | '));
  const u1 = 解析.段们.find(段 => 段.id === 'u1');
  ok('[未知] 占位符本体没有原样留下', !String(u1?.文本).includes('{{彼方:'), String(u1?.文本));
  eq('[未知] 它被换成空串(只剩 AB)', String(u1?.文本), 'AB');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[默认] 不引用、不关闭时, 列表产出与实发一致(I3 的结构面)');
{
  const 造输入 = (额外: Record<string, any> = {}) => ({
    reply: '剧情正文', replyCount: 1, context: '', timeJump: '',
    tracked: ['甲'], inSceneHint: [],
    currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },
    autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],
    预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',
    storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',
    playerName: '主角', playerDescription: '', 展开宏: (t: string) => t,
    ...额外,
  });
  const 取 = (额外: Record<string, any>) => {
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    try {
      return buildUpdateMessages(造输入(额外) as any);
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
  };
  // 列表模型不改变默认输出: 与"没有条目"时完全一致
  const 无条目 = 取({});
  const 空条目 = 取({ 条目: [] });
  eq('[默认] 条目为空数组时 messages 与不传时相同',
    JSON.stringify(空条目.messages), JSON.stringify(无条目.messages));
  eq('[默认] 条目为空数组时工具说明相同', 空条目.工具说明 ?? null, 无条目.工具说明 ?? null);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
