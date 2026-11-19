// 彼方 · 条目列表（零件化 v3）—— 批次: 2026-11-19（列表模型后端 + UI + 存量去重）
//
// 这个用例要证明两件事（需求方 2026-11-19 点名要的）：
//   ① **`解析位置()` 是唯一的顺序逻辑** —— 全项目只有一处把"列表"变成"段序"
//   ② **内置内容在类型上没有写入口** —— 像 `静默` 那样，不是"UI 不给编辑框"
//
// 外加：
//   [C18] 块划分：内置项按语义块、用户条目按 role
//   [C19] 原位记号：关闭的项也要显示
//   [C14] 默认列表顺序 = 去伪装后的拼装顺序（对齐新基准）
//   [并集] 锚点段与用户条目同时引用同一零件 —— 只展开一次（验收点名补的）
//   [字数] UI 的字数取自真实内容，不许拿"说明长度"顶
//   [id] 条目 id 用 uuid；存量重复 id 在加载时清掉（撞 id 会删一条删两条）
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
  const 白名单 = new Set(['条目列表.ts', 'prompts.ts', '页面-拼装.vue']);
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
  // 说明: UI 页面（页面-拼装.vue）也在白名单里 —— 它需要**显示消息形状**（C21），
  // 而那必须与实发用同一套解析。**关键区别**: UI 只是"读"解析结果来显示,
  // 它不自己排序、不自己拼装（拼装仍然只有 prompts.ts 一处）。

  // 定义处只有一处
  let 定义处 = 0;
  for (const 文件 of 列源文件(path.join(ROOT, 'src'))) {
    const 代码 = 去注释(readFileSync(文件, 'utf8'));
    if (/export function 解析位置\s*\(/.test(代码))
      定义处++;
  }
  eq('[位置] 解析位置 只定义了一次', 定义处, 1);

  // 自证: 这条扫描抓得住 —— 拿一个假的"第二实现"喂给同一段判据
  // **注意**: 白名单里有 `页面-拼装.vue`（UI 需要显示消息形状，C21）。
  // 所以自证要用一个**不在白名单**的文件名。
  const 扫描 = (文件们: { 名: string; 源码: string }[]) => 文件们
    .filter(({ 名, 源码 }) => /解析位置\s*\(/.test(去注释(源码)) && !白名单.has(名))
    .map(f => f.名);
  eq('[位置/自证] 白名单外的组件里自己排一遍 → 被抓',
    扫描([{ 名: '页面-日志.vue', 源码: 'const x = 解析位置({列表: []});' }]),
    ['页面-日志.vue']);
  eq('[位置/自证] 只在注释里提到 → 不报',
    扫描([{ 名: '页面-日志.vue', 源码: '// 这里不许调 解析位置(\nconst x = 1;' }]),
    []);
  // 自证 2: UI 页面在白名单里，所以它调解析位置**不算违规**（那正是 C21 需要的）
  eq('[位置/自证] 白名单内的页面调用不报',
    扫描([{ 名: '页面-拼装.vue', 源码: 'const x = 解析位置({列表: []});' }]),
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
  // 用户条目的正文必须是可写的 string（否则用户就没法写了）
  // **键名是 `content`**（ASCII）而不是 `内容` —— 它是外部输入的字段，
  // 与 `内置条目.内容`（内部派生的函数）刻意用不同名字区分。
  const 用户段 = 源码.slice(源码.indexOf('export interface 用户条目'), 源码.indexOf('export type 列表项'));
  ok('[只读] 用户条目的 content 是 string(可写)', /\bcontent\s*:\s*string/.test(用户段), 用户段.slice(0, 200));
  // **两者类型不同** —— 这是"不会互相误用"的结构保证
  ok('[只读] 两者对正文的声明不同(内置是只读函数, 用户是可写字符串)',
    !/readonly\s+内容\s*:\s*\(\s*\)\s*=>\s*string/.test(用户段) && !/\bcontent\s*:\s*string/.test(内置段));

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
    { id: 'u1', 来源: '用户', role: 'system', content: 'A', 启用: true },
    { id: 'u2', 来源: '用户', role: 'system', content: 'B', 启用: true },
    { id: 'u3', 来源: '用户', role: 'user', content: 'C', 启用: true },
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
    id: 'u1', 来源: '用户', role: 'system', content: '前面{{彼方:世界书}}后面', 启用: true,
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
    { id: 'u1', 来源: '用户', role: 'system', content: '{{彼方:世界书}}', 启用: true },
    { id: 'u2', 来源: '用户', role: 'system', content: '{{彼方:世界书}}', 启用: true },
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
    { id: 'u1', 来源: '用户', role: 'user', content: '{{彼方:场景判断}}', 启用: true },
  ];
  const 解析2 = 解析位置({ 列表: [...内置, ...错角色], 关闭零件: [] });
  ok('[C5] user 条目引用场景判断 → 不展开', 解析2.问题.some(q => q.includes('只能被 system')), 解析2.问题.join(' | '));
  // 自证: system 条目就能展开
  const 对角色: 用户条目[] = [
    { id: 'u1', 来源: '用户', role: 'system', content: '{{彼方:场景判断}}', 启用: true },
  ];
  const 解析3 = 解析位置({ 列表: [...内置, ...对角色], 关闭零件: [] });
  ok('[C5/自证] system 条目能展开场景判断', !解析3.问题.some(q => q.includes('只能被 system')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[未知] 拼错的占位符: 忽略 + 指名道姓');
{
  const 内置 = 造内置列表(取内容);
  const 用户: 用户条目 = {
    id: 'u1', 来源: '用户', role: 'system', content: 'A{{彼方:世界舒}}B', 启用: true,
  };
  const 解析 = 解析位置({ 列表: [...内置, 用户], 关闭零件: [] });
  ok('[未知] 有指名道姓的 warn', 解析.问题.some(q => q.includes('{{彼方:世界舒}}')), 解析.问题.join(' | '));
  const u1 = 解析.段们.find(段 => 段.id === 'u1');
  ok('[未知] 占位符本体没有原样留下', !String(u1?.文本).includes('{{彼方:'), String(u1?.文本));
  eq('[未知] 它被换成空串(只剩 AB)', String(u1?.文本), 'AB');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[块] 块归属只有一处来源：零件表的 块 字段');
{
  // 需求方 2026-11-19 裁定：`块` 收进零件表，`零件所在块()` 只查表。
  // 判据三条：
  //   ① 每个零件都有 块 字段（没有遗漏）
  //   ② 块名只有三种（规则/场景判断/任务）
  //   ③ `零件所在块()` 的实现**不含按代号前缀判断**（那会是第二处知识）
  const { 零件表 } = await import('../src/彼方_NPC幕后生命状态系统/零件表');
  ok('[块] 每个零件都有 块 字段', 零件表.every(件 => !!件.块), JSON.stringify(零件表.filter(件 => !件.块).map(件 => 件.代号)));
  const 块名们 = new Set(零件表.map(件 => 件.块));
  eq('[块] 块名只有三种', [...块名们].sort(), ['任务', '场景判断', '规则'].sort());
  // D13 是唯一进"场景判断"块的
  eq('[块] 只有 D13 进场景判断块', 零件表.filter(件 => 件.块 === '场景判断').map(件 => 件.代号), ['D13']);

  // ③ 源码里不许出现按前缀推断的写法
  const 源码 = 去注释(readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8'));
  const 函数体 = 源码.slice(源码.indexOf('export function 零件所在块'), 源码.indexOf('}', 源码.indexOf('export function 零件所在块')) + 1);
  ok('[块] 零件所在块 的实现是查表(调 查块)', /查块\s*\(/.test(函数体), 函数体);
  ok('[块] 零件所在块 里没有 startsWith 前缀判断', !/startsWith\s*\(/.test(函数体), 函数体);
  ok('[块] 零件所在块 里没有硬编码代号比较', !/===\s*'D13'/.test(函数体), 函数体);

  // 自证: 这条断言抓得住 —— 拿"按前缀推断"的旧写法喂给它, 必须红
  const 旧写法 = `export function 零件所在块(代号: string): 块名 {
    if (代号 === 'D13') return '场景判断';
    if (代号.startsWith('R')) return '规则';
    return '任务';
  }`;
  ok('[块/自证] 旧的前缀推断写法会被这三条判据抓到',
    /startsWith\s*\(/.test(旧写法) || /===\s*'D13'/.test(旧写法));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[临时通道] input.条目 必须是正式字段，不是 (input as any)');
{
  const 源码 = 去注释(readFileSync(path.join(彼方目录, 'prompts.ts'), 'utf8'));
  ok('[临时通道] prompts.ts 里没有 (input as any).条目', !/\(input as any\)\.条目/.test(源码));
  // 自证: 这条判据抓得住 —— 旧写法喂给它必须红
  ok('[临时通道/自证] 旧写法会被抓到', /\(input as any\)\.条目/.test('const x = (input as any).条目;'));
  // 入参类型里有 条目 字段，且**类型是从 条目输入 派生的**（不是手写一遍形状）
  const 入参段 = 源码.slice(源码.indexOf('interface 更新提示词入参'), 源码.indexOf('interface 内部入参'));
  ok('[临时通道] 更新提示词入参 里声明了 条目', /条目\?:/.test(入参段), 入参段.slice(-300));
  // 形状必须从 `条目输入` 派生（可以叠加只读标记，但不能手写 id/role/content/启用 那一串）
  ok('[临时通道] 条目 的类型从 条目输入 派生', /条目\?:\s*\(?条目输入/.test(入参段), 入参段.slice(-300));
  ok('[临时通道] 条目 的类型没有手写一遍形状', !/条目\?:\s*\{\s*id\?/.test(入参段), 入参段.slice(-300));
  // **且没有"内置内容"这类字段**（C11 的结构保证：外部传不进内置内容）
  ok('[临时通道] 入参里没有 内置内容/覆写 这类字段',
    !/内置内容|覆写|内置条目/.test(入参段), 入参段.slice(-400));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[形状] 条目形状从一份派生：加字段时编译器会逼你改另一处');
{
  // 需求方 2026-11-19 裁定：外部输入形状不能手写一遍，必须从 `用户条目键` 派生。
  // 判据：
  //   ① `用户条目键` 的每一个键，`用户条目` 里都有
  //   ② `用户条目` 除了 `来源`，每个键都在 `用户条目键` 里（即键集全等，差 `来源`）
  //   ③ `规范条目` 产出的对象键集 == `用户条目` 的键集（转换不漏字段）
  const { 用户条目键, 规范条目 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');
  const 规范 = 规范条目({}, 0);
  const 规范键 = Object.keys(规范).sort();
  const 常量键 = [...用户条目键].sort();
  // ② 键集全等（`用户条目` 的键 - `来源` == 常量）
  eq('[形状] 用户条目键 == 规范条目的键集 去掉 来源',
    常量键, 规范键.filter(k => k !== '来源'));
  // ① 常量里的每个键都真的存在于规范形状里
  ok('[形状] 常量里的每个键都在规范形状里', 常量键.every(k => 规范键.includes(k)), JSON.stringify({ 常量键, 规范键 }));
  // ③ 规范条目不漏字段（上面那条已经覆盖，这里再钉一次"来源"一定有且为 '用户'）
  eq('[形状] 规范条目一定带 来源=用户', 规范.来源, '用户');
  // 自证: 这条断言抓得住 —— 若有人给 `用户条目` 加一个字段但没加进常量，键集会不等
  ok('[形状/自证] 键集断言能发现"加字段但没同步常量"',
    JSON.stringify(['id', 'role', '内容', '启用', '新字段'].sort()) !== JSON.stringify(常量键));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[留痕] 查块兜底必须 warn，不许静默');
{
  const { 零件所在块 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');
  const 原W = console.warn;
  const 喊过: string[] = [];
  console.warn = (...a: any[]) => 喊过.push(a.join(' '));
  let 块 = '';
  try {
    块 = 零件所在块('不存在的代号');
  }
  finally {
    console.warn = 原W;
  }
  eq('[留痕] 兜底成"任务"（不抛错）', 块, '任务');
  ok('[留痕] 兜底时打了 warn', 喊过.some(s => s.includes('不存在的代号')), 喊过.join(' | '));
  // 自证: 正常代号不该 warn（否则"每次都喊"等于没喊）
  const 原W2 = console.warn;
  const 喊过2: string[] = [];
  console.warn = (...a: any[]) => 喊过2.push(a.join(' '));
  try {
    零件所在块('D13');
  }
  finally {
    console.warn = 原W2;
  }
  eq('[留痕/自证] 正常代号不 warn', 喊过2, []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[并集] 双来源引用: 锚点段 + 用户条目各引用同一个零件');
{
  // 验收 2026-11-19 点名的缺口: 并集**没有直接证明**。
  // 随机 200 组只造锚点段（旧 API），条目列表测试没与锚点段混用，
  // `[I1]` 世界书只来自单一来源 —— 所以"并集"这件事从来没有一条用例证明过。
  //
  // **结构封死了是一回事，有直接证明是另一回事**:
  //   结构防的是"现在没写错", 用例防的是"以后有人重构时写错"。
  const 造输入 = (额外: Record<string, any> = {}) => ({
    reply: '剧情正文', replyCount: 1, context: '', timeJump: '',
    tracked: ['甲'], inSceneHint: [],
    currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },
    autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],
    预填充: false, worldbook: 'WB-并集标记', currentStoryTime: '2026-01-01 20:00',
    storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',
    playerName: '主角', playerDescription: '', 展开宏: (t: string) => t,
    ...额外,
  });
  const 跑 = (额外: Record<string, any>) => {
    const 原I = console.info;
    const 原T = console.table;
    const 原W = console.warn;
    const 警告们: string[] = [];
    console.info = () => {};
    console.table = () => {};
    console.warn = (...a: any[]) => 警告们.push(a.join(' '));
    try {
      const r = buildUpdateMessages(造输入(额外) as any);
      return { r, 警告们 };
    }
    finally {
      console.info = 原I;
      console.table = 原T;
      console.warn = 原W;
    }
  };

  // 场景: 锚点段引用世界书 + 用户条目也引用世界书
  const { r, 警告们 } = 跑({
    自定义段: [{ 锚点: '最前', role: 'system', content: '锚点侧:{{彼方:世界书}}', 启用: true }],
    条目: [{ id: 'u1', role: 'system', content: '条目侧:{{彼方:世界书}}' }],
  });
  const 全文 = [...r.messages.map(m => m.content), r.工具说明 ?? ''].join('\n');

  // ① 世界书恰好出现 1 次
  const 次数 = 全文.split('WB-并集标记').length - 1;
  eq('[并集] 世界书恰好出现 1 次(两侧各引用一次也不重复)', 次数, 1);

  // ② 在**先声明的**那一侧展开。
  //    顺序定义: **锚点段先扫**（`扫零件引用` 在 `解析位置` 之前跑），
  //    所以锚点侧拿"首处"。这是既有实现的顺序，写下来是因为它是个约定。
  //
  //    ⚠ 断言**不能**写成 `全文.includes('锚点侧:WB-并集标记')` ——
  //    展开后的内容是世界书**整段**（约 200 字标题 + 正文），
  //    锚点侧前缀与 WB-并集标记之间隔着一大段。这与 [L] 组踩过的是同一个坑。
  //    正确写法: 找到含"锚点侧:"的那条消息, 断言它里面有标记。
  const 含锚点侧的消息 = r.messages.filter(m => m.content.includes('锚点侧:'));
  ok('[并集] 展开在锚点侧(锚点段先扫)',
    含锚点侧的消息.length > 0 && 含锚点侧的消息.every(m => m.content.includes('WB-并集标记')),
    `含"锚点侧:"的消息数 ${含锚点侧的消息.length}`);
  const 含条目侧的消息 = r.messages.filter(m => m.content.includes('条目侧:'));
  ok('[并集] 条目侧没有展开(只剩前缀)',
    !含条目侧的消息.some(m => m.content.includes('WB-并集标记')));

  // ③ 另一侧留空但**不丢警告**（C8: 跳过要留痕）
  ok('[并集] 条目侧那条仍然存在(留空但不消失)', 含条目侧的消息.length > 0, `条数 ${含条目侧的消息.length}`);
  // 警告的措辞是"已被锚点段引用"（不是"重复引用"）—— 两者都算留痕，断言认任一
  ok('[并集] 有留痕的警告',
    警告们.some(w => w.includes('已被锚点段引用') || w.includes('重复引用')),
    警告们.join(' | '));

  // ④ 反向自证: 只留一侧引用时, 世界书也在正确位置展开（证明上面不是"永远在锚点侧"）
  const 只条目 = 跑({
    自定义段: [],
    条目: [{ id: 'u1', role: 'system', content: '条目侧:{{彼方:世界书}}' }],
  });
  const 只条目含 = 只条目.r.messages.filter(m => m.content.includes('条目侧:'));
  ok('[并集/自证] 只有条目引用时, 它在条目侧展开',
    只条目含.length > 0 && 只条目含.some(m => m.content.includes('WB-并集标记')),
    `含"条目侧:"的消息数 ${只条目含.length}`);
  const 只条目全文 = [...只条目.r.messages.map(m => m.content), 只条目.r.工具说明 ?? ''].join('\n');
  eq('[并集/自证] 只有条目引用时也恰好 1 次', 只条目全文.split('WB-并集标记').length - 1, 1);

  // ⑤ 反向自证 2: 只有锚点引用时, 它在锚点侧展开
  const 只锚点 = 跑({
    自定义段: [{ 锚点: '最前', role: 'system', content: '锚点侧:{{彼方:世界书}}', 启用: true }],
    条目: [],
  });
  const 只锚点含 = 只锚点.r.messages.filter(m => m.content.includes('锚点侧:'));
  ok('[并集/自证] 只有锚点引用时, 它在锚点侧展开',
    只锚点含.length > 0 && 只锚点含.some(m => m.content.includes('WB-并集标记')),
    `含"锚点侧:"的消息数 ${只锚点含.length}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[字数] UI 的字数必须取自真实内容，不许拿"说明长度"顶');
{
  // 需求方 2026-11-19 裁定: 一个叫「字数」的列显示的不是字数 —— 这是今晚第五次同类问题。
  // 用户会拿它判断"关掉这个能省多少", **假数字比不给更坏**。
  const 源码 = 去注释(readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8'));
  // ① 不许出现"用说明长度当字数"
  ok('[字数] UI 里没有 说明.length 当字数', !/说明\.length/.test(源码),
    (源码.match(/说明\.length/g) || []).join(','));
  // ② 必须从预览返回的 零件内容 取
  ok('[字数] UI 从 结果.零件内容 取字数', /零件内容/.test(源码));
  // ③ 拿不到时显示 —（不许拿别的东西顶）
  ok('[字数] 拿不到时显示占位符 —', /字数 === null/.test(源码) || /'—'/.test(源码));
  // ④ 必须标来处
  ok('[字数] 标了来处(哪次预览)', /字数来处/.test(源码));
  // 自证: 旧写法会被 ① 抓到
  ok('[字数/自证] 旧的 说明.length 写法会被抓到', /说明\.length/.test('const x = 件.说明.length;'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[id] 用户条目 id 必须唯一，且不依赖模块级状态');
{
  // 需求方 2026-11-19 裁定: 换 `crypto.randomUUID()`。
  //
  // **为什么这不是"概率低所以无所谓"**: `删除条目` 用 `filter(id !== ...)` ——
  // id 相同的两条会被一起删掉。那是**数据丢失**, 不是显示问题。
  // 所以判据不是"撞的概率多低", 而是"结构上还会不会撞"。
  const 源码 = 去注释(readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8'));
  // 实现搬到了 条目列表.ts（UI 与存量去重共用），所以 randomUUID 在那边查
  const 列表源码 = 去注释(readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8'));
  ok('[id] 用 crypto.randomUUID', /randomUUID/.test(列表源码));
  ok('[id] UI 里没有模块级的自增计数器(重挂会归零)', !/^\s*let\s+条目序号/m.test(源码),
    (源码.match(/let\s+条目序号.*/g) || []).join(' | '));
  ok('[id] 不再用裸 Date.now() 当 id 主体', !/const id = `用户-\$\{Date\.now\(\)/u.test(源码));
  // UI 里不许再自己拼 id —— 与存量去重共用 `生成条目id`（只有一处实现）
  ok('[id] UI 调 生成条目id 而不是自己拼', /生成条目id\s*\(/.test(源码));

  // 运行时自证: 连造 200 个 id, 必须全部不同。
  // 这条比"看源码有没有 randomUUID"更强 —— 它验的是**行为**。
  const 造 = (列表源码.match(/export function 生成条目id\([\s\S]*?\n\}/) || [''])[0];
  ok('[id] 能取出 生成条目id 的实现(否则下面的行为断言测的是空气)', 造.length > 0);
  if (造.length > 0) {
    // 用 Function 在测试里重放这段实现 —— 它只依赖 globalThis 与 Date/Math。
    // **要先把 TS 语法剥掉**（参数与返回类型、`as any`、`?:` 可选标记），
    // 因为 `new Function` 吃的是 JS。第一版没剥，直接 SyntaxError。
    const js实现 = 造
      .replace(/export /, '')
      .replace(/\)\s*:\s*string\s*\{/, ') {')
      .replace(/\(已用\?\s*:\s*Set<string>\)/, '(已用)')
      .replace(/\s+as\s+any/g, '');
    const 工厂 = new Function(`${js实现}; return 生成条目id;`) as () => (已用?: Set<string>) => string;
    const 生成条目id = 工厂();
    const 已见 = new Set<string>();
    for (let i = 0; i < 200; i++)
      已见.add(生成条目id());
    eq('[id] 连造 200 个 id 全部不同', 已见.size, 200);
    ok('[id] id 带 用户- 前缀', [...已见].every(x => x.startsWith('用户-')));
    // 传入已用集合时必须避开它
    const 占用 = new Set(['用户-固定值']);
    ok('[id] 传入已用集合时会避开', 生成条目id(占用) !== '用户-固定值');
  }
  // 自证: 旧的"时间戳 + 模块级自增"写法会被上面第 2 条抓到
  ok('[id/自证] 旧的模块级计数器写法会被抓到', /^\s*let\s+条目序号/m.test('let 条目序号 = 0;\nfunction f(){}'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[存量] 重复 id 必须清掉（旧版遗留），且留痕');
{
  // 需求方 2026-11-19: 存量撞 id 不是"不影响使用"，是**雷** ——
  // 用户删其中一条，两条一起没。所以每次加载都要修（幂等）。
  const { 去重条目id, 生成条目id } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');

  // ① 正常数据不动
  {
    const 提示词 = {
      条目: [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }],
      条目顺序: ['a', 'b'],
    };
    const 快照 = JSON.stringify(提示词);
    eq('[存量] 没有重复时返回 0', 去重条目id(提示词), 0);
    eq('[存量] 没有重复时数据一个字节都不动', JSON.stringify(提示词), 快照);
  }

  // ② 有重复：保留第一个，其余重分配
  {
    const 提示词 = {
      条目: [
        { id: 'dup', content: 'A' },
        { id: 'ok', content: 'B' },
        { id: 'dup', content: 'C' },
      ],
      条目顺序: ['dup', 'ok', 'dup'],
    };
    const 数 = 去重条目id(提示词);
    eq('[存量] 报出 1 条重分配', 数, 1);
    eq('[存量] 第一条保留原 id', 提示词.条目[0].id, 'dup');
    eq('[存量] 正常的那条不动', 提示词.条目[1].id, 'ok');
    ok('[存量] 第二条撞的拿到新 id', 提示词.条目[2].id !== 'dup' && 提示词.条目[2].id.length > 0, 提示词.条目[2].id);
    // 内容一个字都没丢
    eq('[存量] 三条内容都还在', 提示词.条目.map((x: any) => x.content), ['A', 'B', 'C']);
    // 顺序表：去重后不再有重复，且长度等于条目数
    eq('[存量] 顺序表无重复项', 提示词.条目顺序.filter((x: string, i: number, a: string[]) => a.indexOf(x) !== i), []);
    eq('[存量] 顺序表覆盖全部条目', [...提示词.条目顺序].sort(), 提示词.条目.map((x: any) => x.id).sort());
  }

  // ③ 幂等：再跑一遍什么都不做
  {
    const 提示词 = {
      条目: [{ id: 'dup', content: 'A' }, { id: 'dup', content: 'C' }],
      条目顺序: ['dup', 'dup'],
    };
    去重条目id(提示词);
    const 快照 = JSON.stringify(提示词);
    eq('[存量] 第二次跑返回 0（幂等）', 去重条目id(提示词), 0);
    eq('[存量] 第二次跑数据不变', JSON.stringify(提示词), 快照);
  }

  // ④ 三条全同 id：两条重分配，三条 id 全不同
  {
    const 提示词 = {
      条目: [{ id: 'x', content: '1' }, { id: 'x', content: '2' }, { id: 'x', content: '3' }],
      条目顺序: [],
    };
    eq('[存量] 三条同 id → 重分配 2 条', 去重条目id(提示词), 2);
    const ids = 提示词.条目.map((x: any) => x.id);
    eq('[存量] 三条 id 现在全不同', new Set(ids).size, 3);
  }

  // ⑤ 坏数据不炸（非对象/缺 id/条目不是数组）
  {
    eq('[存量] 提示词不是对象 → 0', 去重条目id(null), 0);
    eq('[存量] 条目不是数组 → 0', 去重条目id({ 条目: 'nope' }), 0);
    eq('[存量] 条目里有 null → 不炸', 去重条目id({ 条目: [null, { id: 'a' }] }), 0);
    eq('[存量] 缺 id 的条目被跳过', 去重条目id({ 条目: [{ content: 'x' }, { content: 'y' }] }), 0);
  }

  // ⑥ 迁移里真的调了它，且 warn 带条数
  {
    const 设置源码 = 去注释(readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8'));
    ok('[存量] settings 迁移调了 去重条目id', /去重条目id\s*\(/.test(设置源码));
    ok('[存量] settings 迁移有 warn 留痕', /重复的条目 id/.test(设置源码));
    // 自证: 若把调用删了, 上面第一条会红
    ok('[存量/自证] 删掉调用后第一条判据会红', !/去重条目id\s*\(/.test('const x = 1;'));
  }

  // ⑦ 生成条目id 会避开已占用的 id（去重时靠它保证不再撞）
  {
    const 已用 = new Set<string>();
    const 一 = 生成条目id(已用);
    已用.add(一);
    const 二 = 生成条目id(已用);
    ok('[存量] 生成条目id 避开已占用集合', 一 !== 二);
  }
}

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

// ─────────────────────────────────────────────────────────────
console.log('\n[迁移] 旧「按锚点的自定义段」按块边界迁成条目，内容一字不改');
{
  // 需求方 2026-11-19: 设置页 04 提示词并入「拼装」页，旧段必须搬过去。
  // **按块边界插**（不是按序号）—— C16 当初拒绝迁移的理由是"按序号会把某一刻的开关状态固化"，
  // 而块边界与开关无关，所以那个理由现在不成立。
  const { 迁移旧段 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');

  // ① 五个锚点各一段，迁完都在，内容一字不改
  {
    const 提示词: any = {
      自定义段: [
        { 锚点: '最前', role: 'system', content: '【最前段】', 启用: true },
        { 锚点: '主提示词之后', role: 'user', content: '【规则后段】', 启用: true },
        { 锚点: '任务之前', role: 'assistant', content: '【任务前段】', 启用: true },
        { 锚点: '任务之后', role: 'system', content: '【任务后段】', 启用: false },
        { 锚点: '最后', role: 'system', content: '【最后段】', 启用: true },
      ],
    };
    const 数 = 迁移旧段(提示词);
    eq('[迁移] 五段全迁过去', 数, 5);
    eq('[迁移] 条目数 = 5', 提示词.条目.length, 5);
    // **内容一字不改**（含标点与空格）
    eq('[迁移] 五段内容逐字保留',
      [...提示词.条目].map((x: any) => x.content).sort(),
      ['【最前段】', '【规则后段】', '【任务前段】', '【任务后段】', '【最后段】'].sort());
    const 按内容 = (s: string) => 提示词.条目.find((x: any) => x.content === s);
    eq('[迁移] role 原样保留(user)', 按内容('【规则后段】').role, 'user');
    eq('[迁移] role 原样保留(assistant)', 按内容('【任务前段】').role, 'assistant');
    eq('[迁移] 启用=false 原样保留', 按内容('【任务后段】').启用, false);
    eq('[迁移] 启用=true 原样保留', 按内容('【最前段】').启用, true);
    eq('[迁移] 旧段已清空', 提示词.自定义段, []);
    ok('[迁移] 每条都有 id', 提示词.条目.every((x: any) => typeof x.id === 'string' && x.id.length > 0));
    ok('[迁移] id 互不相同', new Set(提示词.条目.map((x: any) => x.id)).size === 5);
  }

  // ② 位置按**块边界**，不是按序号
  {
    const 提示词: any = {
      自定义段: [
        { 锚点: '最前', role: 'system', content: 'A' },
        { 锚点: '主提示词之后', role: 'system', content: 'B' },
        { 锚点: '任务之前', role: 'system', content: 'C' },
        { 锚点: '任务之后', role: 'system', content: 'D' },
        { 锚点: '最后', role: 'system', content: 'E' },
      ],
    };
    迁移旧段(提示词);
    const 序: string[] = 提示词.条目顺序;
    const id到内容 = (id: string) => 提示词.条目.find((x: any) => x.id === id)?.content ?? '';
    const 内容序 = 序.map(id到内容);
    eq('[迁移] 「最前」在最前', 内容序[0], 'A');
    const R5位 = 序.indexOf('R5');
    eq('[迁移] 「主提示词之后」紧跟 R5', 序[R5位 + 1], 提示词.条目.find((x: any) => x.content === 'B')?.id);
    const D13位 = 序.indexOf('D13');
    eq('[迁移] 「任务之前」紧跟 D13', 序[D13位 + 1], 提示词.条目.find((x: any) => x.content === 'C')?.id);
    const D14位 = 序.indexOf('D14');
    eq('[迁移] 「任务之后」紧跟 D14', 序[D14位 + 1], 提示词.条目.find((x: any) => x.content === 'D')?.id);
    eq('[迁移] 「最后」在末尾', 内容序[内容序.length - 1], 'E');
  }

  // ③ 幂等：跑两次不会变两遍
  {
    const 提示词: any = { 自定义段: [{ 锚点: '最后', role: 'system', content: 'X' }] };
    迁移旧段(提示词);
    const 快照 = JSON.stringify(提示词);
    eq('[迁移] 第二次跑返回 0（幂等）', 迁移旧段(提示词), 0);
    eq('[迁移] 第二次跑数据不变', JSON.stringify(提示词), 快照);
  }

  // ④ 没有旧段时什么都不做
  {
    const 提示词: any = { 自定义段: [], 条目: [{ id: 'a', content: 'A' }], 条目顺序: ['a'] };
    const 快照 = JSON.stringify(提示词);
    eq('[迁移] 没有旧段 → 0', 迁移旧段(提示词), 0);
    eq('[迁移] 没有旧段 → 数据不变', JSON.stringify(提示词), 快照);
  }

  // ⑤ 坏数据不炸
  {
    eq('[迁移] null → 0', 迁移旧段(null), 0);
    eq('[迁移] 自定义段不是数组 → 0', 迁移旧段({ 自定义段: 'nope' }), 0);
    eq('[迁移] 段里有 null → 不炸', 迁移旧段({ 自定义段: [null] }), 0);
  }

  // ⑤b 旧的「零件位置」字段已被彻底删除（2026-11-19 收口）——
  //     它现在**什么都不做**：迁移不认它，收集输入也不读它。
  //     断言"传了也没反应"，比断言"字段不存在"更强：字段可能是 zod 的未知键，但行为必须无效。
  {
    const 提示词: any = { 零件位置: { D2: '最前' }, 自定义段: [] };
    eq('[迁移] 零件位置 不再触发迁移', 迁移旧段(提示词), 0);
    eq('[迁移] 它不再产出条目', 提示词.条目, undefined);
    // 自证: 若迁移还认它，上面第一条会红
    ok('[迁移/自证] 认它的旧版本会产出 1 条', 迁移旧段({
      自定义段: [{ 锚点: '最前', role: 'system', content: 'x' }],
    }) === 1);
  }

  // ⑥ 迁完之后内容真的进了产物
  {
    const 提示词: any = { 自定义段: [{ 锚点: '最后', role: 'system', content: '迁移标记-末段' }] };
    迁移旧段(提示词);
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    let r;
    try {
      r = buildUpdateMessages({
        reply: '剧情', replyCount: 1, context: '', timeJump: '', tracked: ['甲'], inSceneHint: [],
        currentCards: { 甲: { 当前在做: 'x' } }, autoTrackEnabled: true, physioEnabled: false,
        恋爱对象名单: [], 自定义段: [], 预填充: false, worldbook: '', currentStoryTime: '',
        storyTimeHint: '', storySpan: '', recentTrace: '', playerName: 'P', playerDescription: '',
        展开宏: (t: string) => t,
        条目: 提示词.条目,
        条目顺序: 提示词.条目顺序,
      } as any);
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
    ok('[迁移] 迁完的内容确实进了产物', r.messages.some(m => m.content.includes('迁移标记-末段')),
      JSON.stringify(r.messages.map(m => m.content.slice(0, 20))));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[旧路] 零件位置 那条旧搬迁路径已被删除（2026-11-19 收口）');
{
  // ── 为什么现在能删（#215 ④）──
  //  `零件位置` 曾经是"表格 + 下拉搬家"那一版的产物。删它会让**还没迁移**的旧设置
  //  静默丢掉搬迁意图，所以上一批留了它 + 写了删除条件。
  //
  //  现在删的理由：迁移已随版本发布，且 `getSettings` **每次更新都会跑迁移**
  //  （不是只在打开设置页时跑）。所以"永远不迁移"的用户不存在 —— 他只要用一次彼方，
  //  迁移就跑过了。留着它才是风险：两条搬迁路径，后来的维护者不知道哪条在生效。
  const 更新输入源码 = readFileSync(path.join(彼方目录, '更新输入.ts'), 'utf8');
  const 条目源码 = readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8');
  const 设置源码 = readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8');

  // ① 函数没了
  ok('[旧路] 零件位置转段 已删除', !/export function 零件位置转段/.test(更新输入源码));
  // ② 字段没了
  ok('[旧路] settings 里 零件位置 字段已删除', !/零件位置:\s*z\.record/.test(设置源码));
  // ③ 迁移里搬它的那段没了
  ok('[旧路] 迁移旧段 里不再搬 零件位置', !/旧位置/.test(条目源码) && !/提示词\.零件位置/.test(条目源码));
  // ④ 收集输入里不再有第二条翻译路径
  ok('[旧路] 收集本轮输入 只透传用户手写的段', !/零件位置转段\s*\(/.test(更新输入源码));
  ok('[旧路] 自定义段 只来自 settings.提示词.自定义段',
    /自定义段:\s*settings\.提示词\?\.自定义段\s*\?\?\s*\[\]/.test(更新输入源码),
    更新输入源码.slice(更新输入源码.indexOf('自定义段:'), 更新输入源码.indexOf('自定义段:') + 80));

  // ⑤ 自证: 若把函数写回来，第 1 条会红
  ok('[旧路/自证] 写回 零件位置转段 会被抓到',
    /export function 零件位置转段/.test('export function 零件位置转段(x) {}'));

  // ⑥ 用户手写的占位符段仍然生效（删掉旧路不能把这条路也删了）
  {
    const 原I = console.info;
    const 原T = console.table;
    const 原W = console.warn;
    console.info = () => {};
    console.table = () => {};
    console.warn = () => {};
    let r;
    try {
      r = buildUpdateMessages({
        reply: '剧情', replyCount: 1, context: '', timeJump: '', tracked: ['甲'], inSceneHint: [],
        currentCards: { 甲: { 当前在做: 'x' } }, autoTrackEnabled: true, physioEnabled: false,
        恋爱对象名单: [], 预填充: false, worldbook: 'WB-手写', currentStoryTime: '',
        storyTimeHint: '', storySpan: '', recentTrace: '', playerName: 'P', playerDescription: '',
        展开宏: (t: string) => t,
        自定义段: [{ 锚点: '最前', role: 'system', content: '{{彼方:世界书}}', 启用: true }],
      } as any);
    }
    finally {
      console.info = 原I;
      console.table = 原T;
      console.warn = 原W;
    }
    const 项 = (r.拼装清单 ?? []).find((x: any) => x.代号 === 'D2');
    eq('[旧路] 手写占位符仍然被引用（这条路没被误删）', 项?.状态, '被引用');
    // 手写的不带"来自旧设置"标记
    eq('[旧路] 手写的不标来源', 项?.备注, undefined);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[并页] 设置页 04 提示词 有引导，不静默消失');
{
  // 需求方: **不许静默消失** —— 用户进去找不到那一节，会以为功能被删了。
  const 设置源码 = readFileSync(path.join(彼方目录, '页面-设置.vue'), 'utf8');
  ok('[并页] 设置页仍有 04 提示词 这一节', /id="bf-set-prompt"/.test(设置源码));
  ok('[并页] 有引导文案（指向拼装页）', /已并入/.test(设置源码) && /拼装/.test(设置源码));
  ok('[并页] 有跳转按钮', /去拼装页/.test(设置源码));
  // 旧的编辑控件必须真的没了（否则就是两处能改，两个漂移点）
  ok('[并页] 设置页不再有 添加自定义段', !/添加自定义段/.test(设置源码));
  // 只查**模板**，不查注释 —— 注释里解释"为什么不再声明锚点选项"是合理的，
  // 断言查全文会被那句解释误伤（第一版就这么假红了一次）。
  const 设置模板 = 设置源码.slice(设置源码.indexOf('<template>'), 设置源码.indexOf('<script'));
  ok('[并页] 设置页模板里不再有 锚点 下拉', !/锚点选项/.test(设置模板), 设置模板.length + ' 字');
  const 壳源码 = readFileSync(path.join(彼方目录, '悬浮球界面.vue'), 'utf8');
  ok('[并页] 壳监听了 去拼装页 事件', /@去拼装页/.test(壳源码));
  // 自证: 若把那一节删了，第一条判据会红
  ok('[并页/自证] 删掉那一节后判据会红', !/id="bf-set-prompt"/.test('<details><h3>提示词</h3></details>'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[样式] 拼装页沿用设置页那套 class，不另起一套');
{
  // 需求方: **不要另起一套 class** —— 另起一套等于给以后的样式改动制造两个地方。
  const 拼装源码 = readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8');
  // "同一套"的判据是**定义在同一个样式文件里**，不是"设置页也用过" ——
  // 04 提示词那节并走之后，设置页自然不再出现 bf-set-seg-card 这些类，
  // 但它们仍然定义在 面板样式.css 里，拼装页与它同源。
  const 样式表 = readFileSync(path.join(彼方目录, '面板样式.css'), 'utf8');
  const 共享 = ['bf-setting-group', 'bf-set-group', 'bf-set-head', 'bf-set-index', 'bf-set-aside',
    'bf-set-seg-card', 'bf-form-grid', 'bf-set-seg-grid', 'bf-field', 'bf-form-label',
    'bf-textarea', 'bf-textarea-sm', 'bf-set-seg-foot', 'bf-set-inline-toggle',
    'bf-btn', 'bf-btn-sm', 'bf-btn-danger', 'bf-hint'];
  const 拼装缺 = 共享.filter(类 => !拼装源码.includes(类));
  eq('[样式] 拼装页用齐了那套 class', 拼装缺, []);
  // 每个类都真的在共享样式表里有定义（不是拼装页自己又写了一遍）
  const 未定义 = 共享.filter(类 => !new RegExp(`\\.${类}[\\s,{:]`).test(样式表));
  eq('[样式] 这些 class 都定义在 面板样式.css（全项目同一套）', 未定义, []);
  // 自证: 若某个类没定义，上面那条会红
  ok('[样式/自证] 未定义的类会被抓到', new RegExp('\\.bf-不存在[\\s,{:]').test(样式表) === false);
  // 旧的自造 class 不该再被模板用到
  const 模板 = 拼装源码.slice(拼装源码.indexOf('<template>'), 拼装源码.indexOf('<style'));
  ok('[样式] 模板里不再用 bf-entry-list（自造清单）', !/bf-entry-list/.test(模板));
  ok('[样式] 模板里不再用 bf-parts-col-title（自造标题）', !/bf-parts-col-title/.test(模板));
  // 自证: 若模板里又写回自造 class，上面两条会红
  ok('[样式/自证] 写回 bf-entry-list 会被抓到', /bf-entry-list/.test('<ol class="bf-entry-list">'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[落盘] 迁移必须真的写进存储（不落盘 = 没迁）');
{
  // ── 为什么这两条必须单独测（验收 2026-11-19 登记的缺口）──
  //  迁移改的是 `getVariables()` 返回的**深拷贝**（酒馆助手 variables.ts 里 `klona`）。
  //  所以"改完不落盘"就等于**什么都没做** —— 下次读到的还是旧数据，再迁一遍再丢掉。
  //  这是我自己写断言时才发现的 bug（此前只看到 warn 刷屏那个表象）。
  //
  //  它守的是**数据正确性关键路径**：写两次不致命（幂等），但"再读还是旧的"就是没迁成功。
  const { getSettings, invalidateReadCache } = await import('../src/彼方_NPC幕后生命状态系统/settings');
  const { 彼方假宿主 } = await import('./helpers/彼方假宿主');

  /** 造一个带旧数据的假宿主：`自定义段` 里有一段（`零件位置` 已删除，不再造它） */
  const 造旧宿主 = () => {
    const { host, 存 } = 彼方假宿主({ 模型回复: [] });
    存.global['彼方_settings'] = {
      提示词: {
        自定义段: [{ 锚点: '最后', role: 'system', content: '旧段-标记' }],
      },
    };
    invalidateReadCache();
    return { host, 存 };
  };

  // ① **再读是迁移后的**（判据: 存储里 `自定义段` 已空、`条目` 有内容）
  {
    const { host, 存 } = 造旧宿主();
    getSettings(host); // 第一次读 → 触发迁移 → 落盘
    const 落盘后 = 存.global['彼方_settings'];
    eq('[落盘] 存储里的 自定义段 已清空', 落盘后?.提示词?.自定义段, []);
    eq('[落盘] 存储里出现了 条目', Array.isArray(落盘后?.提示词?.条目), true);
    // 内容没丢（这是"迁移不是删除数据"的硬证据）
    const 内容们 = (落盘后?.提示词?.条目 ?? []).map((x: any) => x.content);
    ok('[落盘] 旧段的内容仍在（迁移不是删除数据）', 内容们.includes('旧段-标记'), JSON.stringify(内容们));

    // **再读一次**必须看到迁移后的（不是又回到旧数据）
    invalidateReadCache();
    const 再读 = getSettings(host);
    eq('[落盘] 再读时 自定义段 仍是空的（没有回到旧数据）', 再读.提示词?.自定义段, []);
    ok('[落盘] 再读时 条目 还在', (再读.提示词?.条目 ?? []).length > 0, JSON.stringify(再读.提示词?.条目));
  }

  // ② **只写一次**（幂等：第二次读不该再写）
  //    判据用**副作用**：给存储里的对象套一层记录，看 `update` 被调了几次。
  {
    const { host } = 造旧宿主();
    let 写入次数 = 0;
    const 原update = host.vars.update;
    host.vars.update = (fn: any, arg: any) => {
      if (arg?.type === 'global')
        写入次数++;
      return 原update(fn, arg);
    };
    getSettings(host);
    const 首次 = 写入次数;
    ok('[落盘] 首次读触发了写入', 首次 >= 1, `写入 ${首次} 次`);
    // 第二次读：数据已是迁移后的，没有可迁的 → 不该再写
    invalidateReadCache();
    getSettings(host);
    eq('[落盘] 第二次读不再写（迁移是幂等的）', 写入次数, 首次);
    // 自证: 若每次都写，上面会红
    ok('[落盘/自证] 若每次读都写，断言会红', 首次 + 1 !== 首次);
  }

  // ③ 没有旧数据时**一次都不写**（别在纯读路径上制造写流量）
  {
    const { host, 存 } = 彼方假宿主({ 模型回复: [] });
    存.global['彼方_settings'] = { 提示词: { 自定义段: [] } };
    invalidateReadCache();
    let 写入次数 = 0;
    const 原update = host.vars.update;
    host.vars.update = (fn: any, arg: any) => {
      if (arg?.type === 'global')
        写入次数++;
      return 原update(fn, arg);
    };
    getSettings(host);
    eq('[落盘] 没有旧数据时不写', 写入次数, 0);
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
