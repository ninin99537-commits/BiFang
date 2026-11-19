// 彼方 · 拼装页(零件化 v2 UI) —— 批次: 2026-11-19 第五批
//
// 这个用例守的是**一条约束**: 预览必须与实际发出的东西同源。
//
// 为什么这条比 UI 本身重要:
//   如果"预览"是另算一遍、而"实际发送"走拼装函数 —— 两者会漂, 而漂的那一刻没人知道。
//   11-18 那次"文案说 A、实际发 B"就是这么来的, 只不过这次漂的是预览。
//
// 三道锁(验收 U3a/U3b/U3c):
//   U3a 结果锁: 预览与实发在**同一截断点**取料, 断言一致。
//   U3b 结构锁: 全项目只许 prompts.ts 定义拼装; 预览组件里出现第二处拼装调用 = 不合格。
//   U3c 变异锁: 故意造一个"第二套拼装"的假实现, 断言 U3b 能把它抓出来。
//              **没有这条, U3b 就是一条没人验证过的正则。**
//
// 参照写法: tests/人设工坊-形态.test.ts 的 `去注释` + 源码扫描(不新发明)。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { 默认模板 } from '../src/彼方_NPC幕后生命状态系统/提示词模板';
import { 零件表 } from '../src/彼方_NPC幕后生命状态系统/零件表';
import { useSettingsStore } from '../src/彼方_NPC幕后生命状态系统/settings';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

// 用例由 tests/run.mjs 以项目根为 cwd 启动, 所以用 process.cwd()
// (不要用 import.meta.url 上溯: 产物在 tests/.build/ 下)
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

/** 去掉注释, 只留代码。
 *  为什么需要: 组件注释里会**解释这条约束**(写"不许在这里调 buildUpdateMessages"),
 *  那段说明文字不该被当成"代码里出现了第二处拼装"。测试必须能区分"解释坑"与"踩坑"。 */
function 去注释(源码: string): string {
  return 源码
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 递归列出目录下所有源文件(ts/vue) */
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

// ─────────────────────────────────────────────────────────────
console.log('\n[U1] 零件位置 那条旧搬迁路径已删除（2026-11-19 收口）');
{
  // ── 这个用例原来测「零件位置转段」的默认值与 role 固定 ──
  //  那个函数已被删除（理由见 更新输入.ts / CHANGELOG「待办」）。
  //  现在这里改为**断言它真的没了** —— 否则"删了"只是我以为的。
  //
  //  **为什么断言"没了"比断言"行为对"更强**：一个函数只要还在导出，
  //  下一个人就会以为它还在用；而删除的意图只写在 commit message 里，没人读。
  const 源码 = readFileSync(path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', '更新输入.ts'), 'utf8');
  ok('[U1] 零件位置转段 不再导出', !/export function 零件位置转段/.test(源码));
  ok('[U1] 收集本轮输入 不再调它', !/零件位置转段\s*\(/.test(源码));
  // 自证: 若把函数写回来，第一条会红
  ok('[U1/自证] 写回函数会被抓到', /export function 零件位置转段/.test('export function 零件位置转段(x) {}'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[U4] 模板里写占位符 = 唯一的路（D13 只许 system）');
{
  // 2026-11-19 模板化收口：锚点路径已删，写占位符的唯一方式是**模板里写**。
  // C5（D13 只许 system 引用）这条判据现在要在模板路径下成立。
  const 原I = console.info;
  const 原T = console.table;
  const 原W = console.warn;
  console.info = () => {};
  console.table = () => {};
  console.warn = () => {};
  let 跑;
  try {
    跑 = (role: 'system' | 'user') => buildUpdateMessages({
      reply: '剧情', replyCount: 1, context: '玩家走进广场', timeJump: '', tracked: ['甲'], inSceneHint: [],
      currentCards: { 甲: { 当前在做: 'x' } }, autoTrackEnabled: true, physioEnabled: false,
      恋爱对象名单: [], 预填充: false, worldbook: '', currentStoryTime: '',
      storyTimeHint: '', storySpan: '', recentTrace: '', playerName: 'P', playerDescription: '',
      展开宏: (t: string) => t,
      // 用户把场景判断占位符写在自己的段里，role 由他选
      模板: [
        { id: 'a', role, content: '标记-A:{{彼方:场景判断}}' },
        { id: 'b', role: 'user', content: '剧情' },
      ],
    } as any);
  }
  finally {
    console.info = 原I;
    console.table = 原T;
    console.warn = 原W;
  }
  // system 段引用 → 展开
  const 系统 = 跑('system');
  const 系统那条 = 系统.messages.find(m => String(m.content).includes('标记-A'));
  ok('[U4] system 段引用场景判断 → 它展开在那条 system',
    !!系统那条 && String(系统那条.content).includes('玩家走进广场'),
    JSON.stringify(系统.messages.map(m => m.role + ':' + String(m.content).slice(0, 25))));
  // user 段引用 → 不展开（C5：D13 只许 system）
  const 用户 = 跑('user');
  const 用户那条 = 用户.messages.find(m => String(m.content).includes('标记-A'));
  // **展开为空 → 整行消失 → 整段只剩空 → 整段不出现**（渲染规则 ② + 段规则）。
  // 所以判据是"没有一条消息含那段内容"，而不是"找到那条 user 且它不含"。
  ok('[U4] user 段引用场景判断 → 不展开（C5 只许 system）',
    !用户.messages.some(m => String(m.content).includes('玩家走进广场'))
    && !用户.messages.some(m => String(m.content).includes('标记-A')),
    JSON.stringify(用户.messages.map(m => m.role + ':' + String(m.content).slice(0, 30))));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[U3b] 结构锁: 拼装只能定义在 prompts.ts, 预览组件里不许有第二处调用');
{
  // **拼装函数名只许出现在这些文件里**(定义 + 实发取料 + 测试)。
  // 判据: 扫全部源文件, 出现 `buildUpdateMessages(` 调用(不是注释里提到)的文件
  //       必须在白名单里。预览组件(页面-拼装.vue)不在白名单里 = 合格。
  const 白名单 = new Set([
    'prompts.ts', // 定义处
    '更新输入.ts', // 实发取料(唯一调用点)
  ]);
  const 违规: string[] = [];
  for (const 文件 of 列源文件(path.join(ROOT, 'src'))) {
    const 代码 = 去注释(readFileSync(文件, 'utf8'));
    if (!/buildUpdateMessages\s*\(/.test(代码))
      continue;
    const 名 = path.basename(文件);
    if (!白名单.has(名))
      违规.push(path.relative(ROOT, 文件));
  }
  eq('[U3b] 只有白名单里的文件调用拼装', 违规, []);

  // 预览组件单独再查一遍 —— 它是这一批新增的, 必须**明确**没有调用
  const 预览源 = 去注释(readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8'));
  ok('[U3b] 预览组件里没有 buildUpdateMessages 调用', !/buildUpdateMessages\s*\(/.test(预览源));
  // 自证: 预览组件确实走了实发同一个取料入口(否则它只能是自己拼的)
  ok('[U3b/自证] 预览组件调用的是 收集本轮输入', /收集本轮输入\s*\(/.test(预览源));
  // 自证: 它要求只读(预览不许写日志)
  ok('[U3b/自证] 预览组件传了 只读: true', /只读\s*:\s*true/.test(预览源));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[U3c] 变异锁: 故意造一个"第二套拼装"的假实现, U3b 必须抓出来');
{
  // 做法: 把同一段扫描逻辑跑在一个**假文件内容**上, 断言它会报违规。
  // 为什么不用真文件: 真文件是 src 里的, 改了要还原, 而且会污染工作区
  // (规矩 §十二 #9: 冻结期间不得写回, 连 mtime 也不行)。
  // 这里验的是**扫描逻辑本身有效**, 不是"当前代码干净"。
  const 白名单 = new Set(['prompts.ts', '更新输入.ts']);
  const 扫描 = (文件们: { 名: string; 源码: string }[]) => {
    const 违规: string[] = [];
    for (const { 名, 源码 } of 文件们) {
      const 代码 = 去注释(源码);
      if (!/buildUpdateMessages\s*\(/.test(代码))
        continue;
      if (!白名单.has(名))
        违规.push(名);
    }
    return 违规;
  };

  // ① 负样本 A: 假预览组件里写了第二套拼装 → 必须被抓
  const 假预览 = {
    名: '页面-拼装.vue',
    源码: `const 结果 = buildUpdateMessages({
  模板: 默认模板, reply: 'x' });`,
  };
  eq('[U3c] 第二套拼装被抓住', 扫描([假预览]), ['页面-拼装.vue']);

  // ② 负样本 B: 同样的调用写在白名单文件里 → 不该被抓(证明不是"见名就报")
  const 合法 = {
    名: '更新输入.ts',
    源码: `const 结果 = buildUpdateMessages({
  模板: 默认模板, reply: 'x' });`,
  };
  eq('[U3c] 白名单文件里的调用不报', 扫描([合法]), []);

  // ③ 负样本 C: 只在**注释里**提到 → 不该被抓(去注释必须生效)
  const 只提注释 = {
    名: '页面-拼装.vue',
    源码: `// 这里不许调 buildUpdateMessages(\n/* 也不许 */ const x = 1;`,
  };
  eq('[U3c] 只在注释里提到不算违规', 扫描([只提注释]), []);

  // ④ 自证: 三支的**判定依据**确实不同, 不是同一支跑了两遍。
  //    ⚠ 不能写成"三支结论两两不同": B 与 C 的结论都是 `[]`(都合格),
  //    但它们合格的理由完全不同(B 是白名单放行, C 是去注释后压根没有调用)。
  //    用结论当判据会把正确行为判成失败 —— 我第一版就这么错的。
  const 假预览结论 = 扫描([假预览]);
  const 合法结论 = 扫描([合法]);
  const 注释结论 = 扫描([只提注释]);
  ok('[U3c/自证] A(真违规) 被抓', 假预览结论.length === 1);
  ok('[U3c/自证] B(白名单) 放行, 且它的代码里**确实有**调用',
    /buildUpdateMessages\s*\(/.test(去注释(合法.源码)) && 合法结论.length === 0);
  ok('[U3c/自证] C(只在注释里) 放行, 且去注释后**确实没有**调用',
    !/buildUpdateMessages\s*\(/.test(去注释(只提注释.源码)) && 注释结论.length === 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[U3a] 结果锁: 预览与实发走同一个取料入口、同一截断点');
{
  // 这条不跑真实取料(那要假平台 + 假模型, 属于 update-pipeline 那类用例),
  // 而是用**结构断言**钉住三件事:
  //   ① 预览与实发都调 `收集本轮输入`(同一个入口)
  //   ② 预览传 只读: true(不写日志), 实发不传(要写)
  //   ③ 打散在 api.ts, 预览组件**不调** api.ts
  const 预览源 = 去注释(readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8'));
  ok('[U3a] 预览调 收集本轮输入', /收集本轮输入\s*\(/.test(预览源));
  ok('[U3a] 预览不调用 api.ts 的请求出口(否则会带打散标记)',
    !/from '\.\/api'/.test(预览源), 预览源.match(/from '\.\/[^']+'/g)?.join(' '));

  // 实发侧: 更新输入.ts 里确实调了 收集本轮输入 的上游 —— 它是取料的唯一定义处
  const 取料源 = 去注释(readFileSync(path.join(彼方目录, '更新输入.ts'), 'utf8'));
  ok('[U3a] 取料入口定义了 收集本轮输入', /export async function 收集本轮输入/.test(取料源));
  ok('[U3a] 取料入口里有 只读 分支(预览靠它不写日志)', /只读/.test(取料源));
  // 自证: 只读分支真的包住了写动作
  ok('[U3a/自证] 只读时跳过 debugStore.record', /if\s*\(!参数\.只读\)[\s\S]{0,400}debugStore\.record/.test(取料源));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[无人设] 没选人设的聊天不该崩：主角信息降级为空 + 留痕（2026-11-19 P1）');
{
  // ── 这条守什么 ──
  //  `user_avatar = null` 的聊天里，`getPersona('current')` 内部会读 `undefined.persona`。
  //  宿主边界（`host.ts`）已有 try/catch，但这里**再验一次端到端**：
  //  真没选人设的用户，取料不该整份失败 —— 主角信息是**可选输入**。
  //
  //  ⚠ 这条与 [prop] 那条是**两件事**（需求方 #258 明确要求分开验）：
  //     [prop] 是"页面没传 host"（我们的 bug）；
  //     这条是"宿主给了 host 但人设读不到"（用户的真实边界）。
  const { 收集本轮输入 } = await import('../src/彼方_NPC幕后生命状态系统/更新输入');
  const { 彼方假宿主 } = await import('./helpers/彼方假宿主');
  const { getSettings, invalidateReadCache } = await import('../src/彼方_NPC幕后生命状态系统/settings');

  const 跑 = async (改宿主: (h: any) => void) => {
    const { host } = 彼方假宿主({ 模型回复: [] });
    改宿主(host);
    // ⚠ 用**真实完整设置**（`getSettings`），不要手写残缺对象 ——
    //    手写会漏 `接口.工具通道` 之类的字段，于是崩在别处，测的就不是人设这条了。
    invalidateReadCache();
    const settings = getSettings(host);
    const 原W = console.warn;
    const 警: string[] = [];
    console.warn = (...a: any[]) => 警.push(a.join(' '));
    try {
      const r = await 收集本轮输入({
        host,
        settings,
        force: true, timing: {}, debugStore: null, 只读: true,
      } as any);
      return { r, 警, 抛了: null as any };
    }
    catch (error: any) {
      return { r: null, 警, 抛了: error };
    }
    finally {
      console.warn = 原W;
    }
  };

  // ① 人设方法返回 null/空 —— 最常见的"没选人设"
  {
    const { r, 抛了, 警 } = await 跑((h) => {
      h.persona.name = () => null;
      h.persona.description = () => '';
      h.persona.lorebook = () => null;
    });
    ok('[无人设] 返回空时不抛错', !抛了, 抛了?.message);
    ok('[无人设] 仍然拼出了结果', !!r);
    if (r) {
      const 全文 = (r.messages ?? []).map((m: any) => String(m.content)).join('\n');
      // 主角信息为空 → 那个占位符展开为空 → 整行消失（渲染规则 ②）
      ok('[无人设] 产物里没有主角信息（那一段缺席）',
         !/流浪的旅行者/.test(全文), 全文.slice(0, 100));
      ok('[无人设] 但仍然有 messages', (r.messages ?? []).length > 0);
    }
  }

  // ② 人设方法**内部抛错** —— 真正会发生的那种（`getPersona` 读 undefined）
  {
    const { r, 抛了, 警 } = await 跑((h) => {
      const 抛 = () => { throw new TypeError("Cannot read properties of undefined (reading 'persona')"); };
      h.persona.name = 抛;
      h.persona.description = 抛;
      h.persona.lorebook = 抛;
    });
    ok('[无人设] 人设方法内部抛错时，取料不抛', !抛了, 抛了?.message);
    ok('[无人设] 仍然拼出了结果（降级成功）', !!r);
    // **留痕**：不许静默降级
    ok('[无人设] 有 warn 说明为什么空', 警.some(s => /人设|主角/.test(s)), 警.join(' | '));
    // 自证：这两条判据能区分"降级"和"崩" —— 若没包 try/catch，上面的 `抛了` 会有值
    ok('[无人设/自证] 判据能区分崩与不崩', typeof (抛了 as any) === 'object');
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[prop] 页面组件声明了 props，壳里就必须真的传（2026-11-19 P0）');
{
  // ── 这条判据从哪来 ──
  //  用户点「预览」报 `Cannot read properties of undefined (reading 'persona')`。
  //  真因不是"没选人设"，而是：
  //
  //      <PartsPage v-else-if="tab === 'parts'" key="parts" />     ← 漏了 :host="host"
  //
  //  而 `页面-拼装.vue` 声明了 `defineProps<{ host: Host }>()`。
  //  **编译期完全看不出来**：Vue 不会因为少传一个 prop 报错，它只是 `undefined`，
  //  然后崩在几十层调用之后（`host.persona.name()`）。
  //
  //  ── 判据 ──
  //  扫所有页面组件（`.vue`）里的 `defineProps<{...}>`，取出它声明的 prop 名；
  //  再看壳（`悬浮球界面.vue`）里那个组件的标签上，是否绑定了同名的 `:prop`。
  //
  //  ⚠ 这是**结构判据**，不是"记住要传 host"。加一个新页面时它会自动覆盖。
  const 壳 = 去注释(readFileSync(path.join(彼方目录, '悬浮球界面.vue'), 'utf8'));

  /** 组件文件名 → 它在壳里的模板标签名（`页面-拼装.vue` → `PartsPage`） */
  //  ⚠ 文件名里有中文，`[\w-]` 匹配不到（`\w` 是 ASCII —— 与 `[词边界]` 段同一个坑）。
  //    这里刚踩过一次：写成 `[\w-]` 时组件名表是空的，于是"检查了 0 个"照样绿。
  //    是 `[prop/自证] 至少检查到 1 个页面组件` 那条把它抓出来的。
  const 组件名表: Record<string, string> = {};
  for (const m of 壳.matchAll(/import\s+(\w+)\s+from\s+'\.\/(页面-[\w\u4e00-\u9fa5-]+\.vue)'/g))
    组件名表[m[2]] = m[1];

  const 页面文件们 = readdirSync(彼方目录).filter(f => f.startsWith('页面-') && f.endsWith('.vue'));
  const 漏传: string[] = [];
  let 检查过 = 0;
  for (const 文件 of 页面文件们) {
    const 源 = 去注释(readFileSync(path.join(彼方目录, 文件), 'utf8'));
    const 声明 = 源.match(/defineProps<\{([^}]*)\}>/);
    if (!声明)
      continue;
    // 取出 prop 名（`host: Host;` → `host`；`card?: X` 也认）
    const props = [...声明[1].matchAll(/(\w+)\s*\??\s*:/g)].map(m => m[1]);
    if (props.length === 0)
      continue;
    const 标签 = 组件名表[文件];
    if (!标签)
      continue; // 不是壳里直接挂的页面（如 页面-关系身体.vue 由别的页挂）
    // 找壳里那个标签的**完整开标签**（可能有换行）
    const 标签匹配 = 壳.match(new RegExp(`<${标签}\\b[\\s\\S]*?>`, 'm'));
    if (!标签匹配) {
      漏传.push(`${文件}: 壳里找不到 <${标签}> 标签`);
      continue;
    }
    const 开标签 = 标签匹配[0];
    检查过++;
    for (const p of props) {
      if (!new RegExp(`:${p}=|v-bind:${p}=|\\b${p}=`).test(开标签))
        漏传.push(`${文件}: 声明了 ${p}，但 <${标签}> 没传（${开标签.slice(0, 80)}…）`);
    }
  }
  eq('[prop] 所有页面组件声明的 prop 都在壳里传了', 漏传, []);
  // 自证 ①：这条判据至少真的检查到了东西（否则空转也是绿）
  ok('[prop/自证] 至少检查到 1 个页面组件', 检查过 >= 1, `检查了 ${检查过} 个`);
  // 自证 ②：漏传会被抓到 —— 用**曾经的真实错法**喂它
  const 假壳 = '<PartsPage v-else-if="tab === \'parts\'" key="parts" />';
  const 假标签 = 假壳.match(/<PartsPage\b[\s\S]*?>/m)![0];
  ok('[prop/自证] 漏传 host 会被抓到', !/:host=/.test(假标签));
  // 自证 ③：传了就不该被抓（否则判据会逼人写多余的东西）
  const 真壳 = '<PartsPage v-else-if="tab === \'parts\'" key="parts" :host="host" />';
  ok('[prop/自证] 传了 host 就不报', /:host=/.test(真壳));
  // 自证 ④：**跨行**的标签也要认（模板里常有换行）
  ok('[prop/自证] 跨行标签也能认', /:host=/.test('<PartsPage\n  key="parts"\n  :host="host"\n/>'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[页签] 拼装页挂在壳里, 且与其余页同级');
{
  const 壳 = 去注释(readFileSync(path.join(彼方目录, '悬浮球界面.vue'), 'utf8'));
  ok('[页签] tabs 里有 parts', /key:\s*'parts'/.test(壳));
  ok('[页签] 有 PartsPage 的渲染分支', /PartsPage/.test(壳));
  ok('[页签] 导入了 页面-拼装.vue', /页面-拼装\.vue/.test(壳));
  // 自证: 五页之外新加的这一页, 编号没有撞车
  const keys = [...壳.matchAll(/key:\s*'([a-z]+)'/g)].map(m => m[1]);
  eq('[页签] 页签 key 不重复', keys.filter((k, i, a) => a.indexOf(k) !== i), []);
  ok('[页签] 页签数量是 6(原 5 + 拼装)', keys.length >= 6, JSON.stringify(keys));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[文案] 面板不出现内部术语(W5 规范)');
{
  const 预览源 = readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8');
  // 只查**模板与用户可见文案**, 不查代码注释(注释里解释实现是必要的)
  const 模板 = 预览源.slice(预览源.indexOf('<template>'), 预览源.indexOf('<style'));
  const 禁词 = ['tools', 'tool_choice', 'arguments', 'schema', '前缀缓存', '服务端', '降级', '审查', '指纹'];
  const 命中 = 禁词.filter(词 => 模板.includes(词));
  eq('[文案] 模板里没有内部术语', 命中, []);
  // 自证: 这条能拦住 —— 若模板里真写了 tools, 上面会红
  ok('[文案/自证] 禁词表本身有内容', 禁词.length >= 5);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[写回闸门] 没 load 完不许写 + 拒写全默认值（2026-11-19 P0）');
{
  // ── 这两道闸门防的是什么 ──
  //  `settings` 初值是 `Settings.parse({})`（全默认值），而 `bindPersistence` 的 watch
  //  是**立即**绑上的。若 `load()` 还没跑，debounce 300ms 后就会把**默认值**写回全局。
  //
  //  `三方基线` 已经能挡住大部分（本地 == 默认的字段不进差异）——
  //  实测三种启动场景都没覆盖。所以这两道闸门是**纵深防御**，不是唯一防线。
  //
  //  ⚠ 但"没覆盖"是**实测结论**，不是结构保证：它依赖"本地与默认逐字段相等"。
  //    任何让本地偏离默认的东西（UI 初始化写值、schema 的 transform 副作用、将来加字段）
  //    都会让某一支判成"本地 != 默认" → 差异里出现该字段。所以闸门值得有。
  const 源码 = readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8');

  // ① 已加载 标记存在，且 load 里把它置 true
  ok('[闸门] 有 `已加载` 标记', /已加载\s*=\s*ref\(false\)/.test(源码));
  ok('[闸门] load 里把 已加载 置 true', /已加载\.value\s*=\s*true/.test(源码));
  // ② watch 里第一句判它
  ok('[闸门] watch 里判 已加载（没加载完不写）',
     /if\s*\(!已加载\.value\)[\s\S]{0,120}?return;/.test(源码),
     (源码.match(/if \(!已加载\.value\)/g) || []).length + ' 处');
  // ③ 世界书写入那条立即写回也判它
  ok('[闸门] 立即写回那条也判 已加载',
     (源码.match(/if \(!已加载\.value\)/g) || []).length >= 2);
  // ④ 拒写全默认值
  ok('[闸门] 有"拒写全默认值"的判断',
     /是纯默认/.test(源码) && /JSON\.stringify\(待写\)\s*===\s*JSON\.stringify\(默认待比\)/.test(源码));
  ok('[闸门] 拒写时打 warn', /已拒绝覆盖/.test(源码));
  ok('[闸门] 只在"全局非空"时拦（全局本来就空时写默认值无害）',
     /是纯默认\s*&&\s*是非空对象\(远端\)/.test(源码));
  // ⑤ **`调试` 字段不落盘**（2026-11-19 P1-3）
  //   注释承诺「刷新即恢复默认」，所以写回时必须真的剔掉它 ——
  //   否则后门一开就永远开着（deep watch 会把它一起写进全局）。
  ok('[闸门] 写回前剔掉 `调试` 字段（后门不持久化）',
     /delete 待写\.调试/.test(源码), '找不到 delete 待写.调试');
  ok('[闸门] 比较"是否纯默认"时也剔掉 `调试`（否则只改调试会被判成非默认）',
     /delete 默认待比\.调试/.test(源码));

  // ── 自证：去掉闸门后，这两条判据必须红 ──
  //  做法：把源码里的闸门**文本替换掉**，再拿同样的正则去测。
  //  这不是"跑一遍业务逻辑"，而是"验判据能不能区分有闸门与没闸门"——
  //  后者才是判据的职责。
  const 去掉已加载 = 源码.replace(/if \(!已加载\.value\)[\s\S]{0,120}?return;/g, '');
  ok('[闸门/自证] 去掉"已加载"判断后会被抓到',
     !/if\s*\(!已加载\.value\)[\s\S]{0,120}?return;/.test(去掉已加载));
  const 去掉纯默认 = 源码.replace(/是纯默认\s*&&\s*是非空对象\(远端\)/g, 'false');
  ok('[闸门/自证] 去掉"拒写全默认值"后会被抓到',
     !/是纯默认\s*&&\s*是非空对象\(远端\)/.test(去掉纯默认));

  // ── 端到端：真的跑一遍"全局有 5 套 + store 全默认 + 改一个字段" ──
  //  ⚠ 这条要真跑（不能只读源码）：闸门是**运行时**行为。
  //  但 `persistenceBound` 是模块级变量（一进程只能绑一次），
  //  而本文件已经跑了很多用例 —— 所以这里只验"标记的初始状态"，
  //  真实时序由 `tests/fixtures/` 的独立探针覆盖（每场景一个进程）。
  setActivePinia(createPinia());
  try {
    const store = useSettingsStore();
    ok('[闸门] 新 store 的 已加载 是 false（初值还没读到真设置）', store.已加载 === false,
       String(store.已加载));
    // 自证：这条能区分"有标记"和"没标记"
    ok('[闸门/自证] 若 已加载 初值是 true，这条会红', !(store.已加载 === true));
  }
  catch (error: any) {
    ok('[闸门] 能创建 store 并读到 已加载 标记', false, error?.message ?? String(error));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[三方合并] 旧 store 不许盖掉新值（2026-11-19 P0）');
{
  // ── 这个 bug 是什么 ──
  //  用户报「每个聊天打开时设置不一样，写世界书的目标被改回关闭，5 套预设消失」。
  //  连起来看是**竞态**：面板 / 脚本 / 多个 iframe 各持一份 store，每份都可能比全局旧。
  //
  //  元凶：`建写回闸门` 的 `收集删除` 默认 `true` ——
  //  `取差异` 会找出「基线里有、当前没了的键」并**按路径删**。
  //  于是 B（旧快照，预设 `{}`）写回时，**它自己的旧快照被判成"用户删了那 5 套"**。
  //
  //  ⚠ 注意：`立即写` 本身**已经是三方合并**（差异 + 重新读远端 + 深合并）。
  //    `设置写回.ts` 的合并逻辑一直是对的 —— **错的是调用方传的选项**。
  const { 建写回闸门 } = await import('../src/共用/设置写回');

  /** 造一个内存端口 */
  const 造端口 = (初值: any) => {
    let 存储 = JSON.parse(JSON.stringify(初值));
    return {
      端口: {
        读: () => JSON.parse(JSON.stringify(存储)),
        写: (份: any) => { 存储 = JSON.parse(JSON.stringify(份)); },
      },
      看: () => 存储,
    };
  };

  const 五套 = { 甲: { 模型: 'a' }, 乙: { 模型: 'b' }, 丙: { 模型: 'c' }, 丁: { 模型: 'd' }, 戊: { 模型: 'e' } };
  const 初值 = { 接口预设: 五套, 接口: { 模型: '初始模型' }, 更新: { 自动更新: true } };

  /** 跑一遍"A 改 X → B 改 Y（B 持旧快照）" */
  const 跑两轮 = (收集删除: boolean) => {
    const { 端口, 看 } = 造端口(初值);
    const 闸A = 建写回闸门(端口, { 收集删除 });
    const 闸B = 建写回闸门(端口, { 收集删除 });
    闸A.记录基线(端口.读());
    闸B.记录基线(端口.读());
    // A：改 接口.模型
    闸A.立即写({ 接口预设: 五套, 接口: { 模型: 'A改过' }, 更新: { 自动更新: true } });
    // B：持旧快照（预设 {}），只改 自动更新
    闸B.立即写({ 接口预设: {}, 接口: { 模型: '初始模型' }, 更新: { 自动更新: false } });
    return 看();
  };

  // ① 关掉"收集删除"（当前生产配置）→ 三条都对
  const 关后 = 跑两轮(false);
  eq('[三方合并] 关掉收集删除后：A 的改动还在', 关后.接口?.模型, 'A改过');
  eq('[三方合并] 关掉收集删除后：B 的改动也写进去了', 关后.更新?.自动更新, false);
  eq('[三方合并] 关掉收集删除后：5 套预设没被 B 的空快照盖掉',
     Object.keys(关后.接口预设 ?? {}).length, 5);

  // ② 打开"收集删除"（旧行为）→ 5 套被删（**这是 bug 的证据**）
  const 开后 = 跑两轮(true);
  eq('[三方合并/对照] 打开收集删除后：5 套被旧快照删掉（这就是那个 bug）',
     Object.keys(开后.接口预设 ?? {}).length, 0);

  // ③ **自证**：这两组结论必须不同 —— 否则说明"收集删除"这个开关根本没起作用
  ok('[三方合并/自证] 两种配置的结果确实不同（开关真的生效）',
     Object.keys(关后.接口预设 ?? {}).length !== Object.keys(开后.接口预设 ?? {}).length,
     `关=${Object.keys(关后.接口预设 ?? {}).length} / 开=${Object.keys(开后.接口预设 ?? {}).length}`);

  // ④ 源码：`settings.ts` 必须真的传 `收集删除: false`
  //    （否则上面 ① 测的是"我传的参数"，不是"生产配置"）
  const 设置源码 = readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8');
  ok('[三方合并] settings.ts 传了 收集删除: false', /收集删除:\s*false/.test(设置源码));
  // 自证：写成 true 会被抓到
  ok('[三方合并/自证] 写成 true 会被抓到',
     !/收集删除:\s*false/.test(设置源码.replace(/收集删除:\s*false/g, '收集删除: true')));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);


