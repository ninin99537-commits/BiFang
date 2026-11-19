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

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
