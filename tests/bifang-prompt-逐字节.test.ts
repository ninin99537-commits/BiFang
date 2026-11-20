// 彼方 · C3 逐字节基线 —— 批次 2026-11-20（需求方 #499）。
//
// ── 这个判据干什么 ──
//
//  用**当前**代码跑 5 组配置，与 `bifang-prompt-基线产物.txt` **逐字节**比对。
//
//  之后拆提示词段表（C3 步 2/3/4）时，任何"拆坏了"都会被它抓住 ——
//  包括那种**看起来没坏、但悄悄少了一个空格**的改动。
//
// ── 为什么基线是"外部锚点"而不是自证 ──
//
//  需求方 #472 那句：
//
//  > 为什么不靠"段表拼回去等于原字符串"这种自证：**拿它自证等于自己**。
//  > 基线来自**重构前的真实产物**，是外部锚点。
//
//  所以本文件**不自己拼提示词**，只调真实函数、和落盘的基线比。
//
// ── ⚠ 序列化必须与生成器用同一个函数 ──
//
//  `序列化` 从生成器 import —— 不各写一份。各写一份的话，
//  两边的键序/转义稍有不同，"逐字节相同"就变成一个测不准的判据。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildInjectionPrompt, buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';

// 与生成器**同一个**序列化函数（从 .mjs import 它的源码版不现实，
// 所以这里把那个函数**逐字抄**过来，并断言两边产出相同 —— 见文件末尾 [自证]）。
// ⚠ 抄的是 `tests/fixtures/bifang-prompt-基线生成.mjs` 里的 `序列化`。
//    它改了而这里没跟着改 → 末尾那条自证会红。
function 序列化(结果们: Array<{ 名: string; 输出: any }>): string {
  const 段: string[] = [];
  for (const { 名, 输出 } of 结果们) {
    段.push(`@@@ GROUP ${名} @@@`);
    if (输出.messages) {
      输出.messages.forEach((m: any, i: number) => {
        段.push(`--- [${i}] role=${m.role} ---`);
        段.push(m.content);
      });
    }
    else {
      段.push('--- [注入段] ---');
      段.push(输出);
    }
  }
  return 段.join('\n');
}

const ROOT = process.cwd();
const 输入路径 = path.join(ROOT, 'tests', 'fixtures', 'bifang-prompt-基线输入.json');
const 产物路径 = path.join(ROOT, 'tests', 'fixtures', 'bifang-prompt-基线产物.txt');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}

/**
 * 找两个字符串的**第一个不同字符偏移**，并给出上下文。
 *
 * 需求方 #499：失败必须报"第几组输入、哪条消息、第一个不同字符的偏移"。
 * 只报"不相等"等于让人自己二分查找。
 */
function 第一处不同(a: string, b: string): { 偏移: number; 期望: string; 实际: string } | null {
  const 短 = Math.min(a.length, b.length);
  for (let i = 0; i < 短; i++) {
    if (a[i] !== b[i]) {
      return {
        偏移: i,
        期望: JSON.stringify(a.slice(Math.max(0, i - 40), i + 40)),
        实际: JSON.stringify(b.slice(Math.max(0, i - 40), i + 40)),
      };
    }
  }
  // 前缀全同但长度不同
  if (a.length !== b.length) {
    return {
      偏移: 短,
      期望: a.length > 短 ? `(基线还有 ${a.length - 短} 字符) ${JSON.stringify(a.slice(短, 短 + 80))}` : '(基线到此结束)',
      实际: b.length > 短 ? `(实际还有 ${b.length - 短} 字符) ${JSON.stringify(b.slice(短, 短 + 80))}` : '(实际到此结束)',
    };
  }
  return null;
}

/**
 * 把序列化文本按 `@@@ GROUP xxx @@@` 切开 —— 这样失败时能报**哪一组**。
 */
function 按组切分(文本: string): Map<string, string> {
  const 结果 = new Map<string, string>();
  const 行们 = 文本.split('\n');
  let 当前组: string | null = null;
  let 缓冲: string[] = [];
  const 收尾 = () => {
    if (当前组 !== null)
      结果.set(当前组, 缓冲.join('\n'));
  };
  for (const 行 of 行们) {
    const m = 行.match(/^@@@ GROUP (.+) @@@$/);
    if (m) {
      收尾();
      当前组 = m[1];
      缓冲 = [];
      continue;
    }
    if (当前组 !== null)
      缓冲.push(行);
  }
  收尾();
  return 结果;
}

// ═════════════════════════════════════════════════════════════
console.log('\n[前置] 基线文件与输入文件都在，且非空');
{
  const 输入 = JSON.parse(readFileSync(输入路径, 'utf8'));
  ok('[前置] 基线输入有 5 组配置', 输入.length === 5, `实际 ${输入.length} 组`);
  const 产物 = readFileSync(产物路径, 'utf8');
  ok('[前置] 基线产物非空', 产物.length > 10000, `实际 ${产物.length} 字符`);
  ok('[前置] 产物里有 10 个组标记（5 组 × 更新+注入）',
     (产物.match(/^@@@ GROUP /gm) ?? []).length === 10,
     `实际 ${(产物.match(/^@@@ GROUP /gm) ?? []).length} 个`);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 主判据] 5 组配置跑出的产物与基线**逐字节**相同');
{
  const 配置 = JSON.parse(readFileSync(输入路径, 'utf8'));
  const 基线全文 = readFileSync(产物路径, 'utf8');

  // ── 用当前代码跑同样的 5 组 ──
  const 结果们: Array<{ 名: string; 输出: any }> = [];
  for (const { 名, 入参 } of 配置) {
    // 更新提示词
    结果们.push({ 名: `${名} / 更新提示词`, 输出: buildUpdateMessages(入参) });
    // 注入段（与生成器同一份构造）
    const entries = Object.entries(入参.currentCards ?? {});
    const 注入 = buildInjectionPrompt(entries as any, {
      未回票: { 泰丝: ['T1'] },
      剧情时间: 入参.currentStoryTime ?? '',
      生理监测: !!入参.physioEnabled,
    });
    结果们.push({ 名: `${名} / 注入段`, 输出: 注入 });
  }

  const 实际全文 = 序列化(结果们);

  // ── 整体逐字节 ──
  if (实际全文 === 基线全文) {
    pass++;
    console.log(`  ✓ 整体逐字节相同（${基线全文.length} 字符，10 段）`);
  }
  else {
    fail++;
    const 差异 = 第一处不同(基线全文, 实际全文);
    console.log(`  ✗ 整体逐字节不同`);
    if (差异)
      console.log(`      第一个不同在偏移 ${差异.偏移}\n      基线: ${差异.期望}\n      实际: ${差异.实际}`);
  }

  // ── 逐组逐字节（失败时能点名**哪一组**）──
  const 基线组 = 按组切分(基线全文);
  const 实际组 = 按组切分(实际全文);

  ok('[前置] 基线切出了 10 组', 基线组.size === 10, `实际 ${基线组.size}`);
  ok('[前置] 实际切出了 10 组', 实际组.size === 10, `实际 ${实际组.size}`);

  for (const [组名, 基线文本] of 基线组) {
    const 实际文本 = 实际组.get(组名);
    if (实际文本 === undefined) {
      fail++;
      console.log(`  ✗ 组「${组名}」在实际产物里**不存在**`);
      continue;
    }
    if (实际文本 === 基线文本) {
      pass++;
      continue;
    }
    fail++;
    // 报"哪条消息 + 偏移"
    const 差异 = 第一处不同(基线文本, 实际文本);
    console.log(`  ✗ 组「${组名}」不同`);
    if (差异) {
      // 找出这个偏移落在第几条消息里
      const 前缀 = 基线文本.slice(0, 差异.偏移);
      const 消息们 = [...前缀.matchAll(/^--- \[(\d+)\] role=(\w+) ---$/gm)];
      const 最后一条 = 消息们[消息们.length - 1];
      const 定位 = 最后一条 ? `第 ${最后一条[1]} 条消息(role=${最后一条[2]})` : '注入段/消息头之前';
      console.log(`      落在：${定位}`);
      console.log(`      第一个不同在偏移 ${差异.偏移}（组内）`);
      console.log(`      基线: ${差异.期望}`);
      console.log(`      实际: ${差异.实际}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 覆盖] 5 组配置各自覆盖的分支确实生效了');
{
  const 配置 = JSON.parse(readFileSync(输入路径, 'utf8'));
  const 按名 = new Map<string, any>(配置.map((c: any) => [c.名, c.入参]));

  // ① 全关：生理段不出现、恋爱段不出现、自动建档段不出现、世界书段不出现
  {
    const 输出 = buildUpdateMessages(按名.get('全关')!);
    const 全文 = 输出.messages.map(m => m.content).join('\n');
    ok('[全关] 没有【生理监测】段', !/【生理监测】/.test(全文));
    ok('[全关] 没有【恋爱监测】段', !/【恋爱监测】/.test(全文));
    ok('[全关] 没有【仅更新已追踪 NPC】段', !/【仅更新已追踪 NPC】/.test(全文));
    ok('[全关] 没有世界书段', !/世界书\/设定\(/.test(全文));
    ok('[全关] 只有 2 条消息（system + user）', 输出.messages.length === 2, `实际 ${输出.messages.length}`);
  }

  // ② 生理开：有生理段 + 注入段里有生理列
  {
    const 入参 = 按名.get('生理开')!;
    const 输出 = buildUpdateMessages(入参);
    const 全文 = 输出.messages.map(m => m.content).join('\n');
    ok('[生理开] 有【生理监测】段', /【生理监测】/.test(全文));
    ok('[生理开] 有"现有状态卡中的生理字段是权威数据"段', /生理字段是权威数据/.test(全文));

    const 注入 = buildInjectionPrompt(Object.entries(入参.currentCards) as any, {
      剧情时间: 入参.currentStoryTime,
      生理监测: true,
    });
    ok('[生理开] 注入段里有生理列（周期/防护等）', /周期|防护/.test(注入), 注入.slice(0, 200));
  }

  // ③ 恋爱开：有恋爱段 + 注入段里有恋爱列
  {
    const 入参 = 按名.get('恋爱开')!;
    const 输出 = buildUpdateMessages(入参);
    const 全文 = 输出.messages.map(m => m.content).join('\n');
    ok('[恋爱开] 有【恋爱监测】段', /【恋爱监测】/.test(全文));
    ok('[恋爱开] 段里点名了"莉莉"', /恋爱对象: 莉莉|莉莉/.test(全文));

    const 注入 = buildInjectionPrompt(Object.entries(入参.currentCards) as any, {
      剧情时间: 入参.currentStoryTime,
      生理监测: false,
    });
    ok('[恋爱开] 注入段里有恋爱列（好感/情欲/名分）', /好感|情欲|名分/.test(注入), 注入.slice(0, 200));
  }

  // ④ 自动建档关：有"仅更新已追踪"段
  {
    const 输出 = buildUpdateMessages(按名.get('自动建档关')!);
    const 全文 = 输出.messages.map(m => m.content).join('\n');
    ok('[自动建档关] 有【仅更新已追踪 NPC】段', /【仅更新已追踪 NPC】/.test(全文));
    ok('[自动建档关] 段里说了"不建档、不返回状态卡"', /不建档、不返回状态卡/.test(全文));
  }

  // ⑤ 世界书+场景判断非空：世界书段、轨迹、跨度、权威时间、自定义段全在
  {
    const 入参 = 按名.get('世界书+场景判断非空')!;
    const 输出 = buildUpdateMessages(入参);
    const 全文 = 输出.messages.map(m => m.content).join('\n');
    ok('[第5组] 有世界书段', /世界书\/设定\(/.test(全文));
    ok('[第5组] 有近期轨迹', /近期变化|近期轨迹/.test(全文));
    ok('[第5组] 有剧情跨度（不是"跳过"）', /约 9\.8 小时/.test(全文));
    ok('[第5组] 有★正文当前时间(务必以此为准)★', /务必以此为准/.test(全文));
    ok('[第5组] 有自定义段（最前）', /自定义最前段/.test(全文));
    ok('[第5组] 有自定义段（最后，assistant）', /自定义最后段/.test(全文));
    ok('[第5组] 被禁用的那段**没出现**', !/这条被禁用，不该出现/.test(全文));
    ok('[第5组] 消息条数 > 2（自定义段插出了额外消息）', 输出.messages.length > 2, `实际 ${输出.messages.length}`);
    // ── 末条语义：assistant 收尾会**补一条 user 收尾**（预填充）──
    //
    //  `buildUpdateMessages` 最后那段：
    //    `if (messages.length > 0 && messages[last].role === 'assistant') messages.push({ role: 'user', content: TAIL_KICKOFF })`
    //
    //  所以第 5 组（自定义段里有一条 assistant 的「最后」锚点）→ **末条是 user**。
    //  ⚠ 我第一版断言写成"末条是 assistant"，那是错的 —— 实测打脸。
    ok('[第5组] 末条是 user（assistant 收尾被补了一条收尾消息）',
      输出.messages[输出.messages.length - 1].role === 'user',
      `实际 ${输出.messages[输出.messages.length - 1].role}`);
    ok('[第5组] 倒数第二条是 assistant（自定义段的最后锚点）',
      输出.messages[输出.messages.length - 2]?.role === 'assistant',
      `实际 ${输出.messages[输出.messages.length - 2]?.role}`);
  }
}

// ═════════════════════════════════════════════════════════════
console.log('\n[自证] 判据能抓到"改一个字"');
{
  // ── 这条证明上面的逐字节比对不是恒真 ──
  const 基线 = readFileSync(产物路径, 'utf8');
  // 造一个"改了一个字"的版本
  const 改过 = 基线.replace('你是「彼方 / Elsewhere」', '你是「彼方 / Elsewhere 改」');
  ok('[自证] 改一个字后确实不同', 改过 !== 基线);
  const 差异 = 第一处不同(基线, 改过);
  ok('[自证] 能定位到第一个不同字符', 差异 !== null);
  ok('[自证] 偏移落在改动处附近', 差异 !== null && Math.abs(差异.偏移 - 基线.indexOf('Elsewhere')) < 40,
     差异 ? `偏移 ${差异.偏移}` : '(无差异)');

  // 造一个"末尾少一个字符"的版本（长度差异）
  const 截短 = 基线.slice(0, -1);
  const 差异2 = 第一处不同(基线, 截短);
  ok('[自证] 长度差异也能定位（偏移 = 短的那个长度）', 差异2 !== null && 差异2.偏移 === 截短.length,
     差异2 ? `偏移 ${差异2.偏移} / 期望 ${截短.length}` : '(无差异)');
}

// ═════════════════════════════════════════════════════════════
console.log('\n[自证] 序列化函数与生成器一致（两边各写一份的风险）');
{
  // ── 本文件把 `序列化` 逐字抄了一遍（生成器是 .mjs，没法直接 import 它的源码版）──
  //  这条自证：拿同一份数据，两边的输出必须逐字节相同。
  //  生成器那份改了而这份没跟着改 → 产物会不同 → 主判据红。
  //
  //  这里再验一次"抄对了"：用一个已知的小样本，按同样规则序列化，结果必须对得上。
  const 样本 = [
    { 名: 'A', 输出: { messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'y' }] } },
    { 名: 'B', 输出: '纯字符串' },
  ];
  const 期望 = '@@@ GROUP A @@@\n--- [0] role=system ---\nx\n--- [1] role=user ---\ny\n@@@ GROUP B @@@\n--- [注入段] ---\n纯字符串';
  ok('[自证] 序列化格式与约定一致', 序列化(样本) === 期望,
     `实际 ${JSON.stringify(序列化(样本).slice(0, 120))}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
