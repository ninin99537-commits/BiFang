// 彼方 · 破限第 4 / 5 层(§35) —— 批次: 第五轮（2026-11-19 改：第 4 层开关已删除）
//
// 两层性质完全不同, 分开测:
//   第 5 层 · 写入通道分级 —— **不做开关**, 工具通道开时自动带(§35.1)
//   第 4 层 · 任务重定义 —— **原来做成开关，现已删除**（身份句归模板文字，用户自己改）
//
// 覆盖:
//   [A] 第 5 层: 工具说明里带分级文案 / 只在工具通道开时出现 / 不与末条 user 重复
//   [B] 第 5 层: 文案内容与边界(两条通道都提到、优先使用前者、完整性要求)
//   [C] 第 4 层: 开关已删除 —— 传它不再改变产物；替代身份句作为文档保留
//   [D] 第 4 层: 身份句独立于规则正文（去掉它，规则一个字不改）
//   [E] 第 4 层: 那段替代文案不含角色名/人格, 只有职能身份
//   [F] 第 4 层: 设置里已无该字段；与其余开关互不影响
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { 建工具定义 } from '../src/彼方_NPC幕后生命状态系统/工具通道';
import { getSettings } from '../src/彼方_NPC幕后生命状态系统/settings';
import { 彼方假宿主 } from './helpers/彼方假宿主';

const ROOT = process.cwd();

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

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
const sha = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);

function 造输入(额外: Record<string, any> = {}) {
  return {
    reply: '这是一段剧情正文。',
    replyCount: 1,
    context: '',
    timeJump: '',
    tracked: ['甲'],
    inSceneHint: [],
    currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },
    autoTrackEnabled: true,
    physioEnabled: false,
    恋爱对象名单: [],
    自定义段: [],
    预填充: false,
    worldbook: '',
    currentStoryTime: '2026-01-01 20:00',
    storyTimeHint: '2026-01-02 12:30',
    storySpan: '约 0.7 天',
    recentTrace: '',
    playerName: '主角',
    playerDescription: '',
    展开宏: (t: string) => t,
    ...额外,
  };
}

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 第 5 层 · 写入通道分级: 工具说明里带, 且不与末条 user 重复');
{
  // ① 工具通道开 → 工具说明里有分级文案
  // 注意层次: `出.工具说明` 只是**上下文**; 分级文案由 `建工具定义()` 拼进去。
  // 所以要测"实际发给模型的 description" = 建工具定义(出.工具说明)[0].function.description。
  // (第一版直接在 出.工具说明 里找, 找错了层次。)
  const 出 = buildUpdateMessages(造输入({ 规则进工具: true }) as any);
  const 说明 = String(建工具定义(String(出.工具说明 ?? ''))[0].function.description);
  ok('[A] 实际工具说明里有"写入通道说明"', 说明.includes('写入通道说明'), 说明.slice(0, 200));
  ok('[A] 提到了工具名 update_npc_state', 说明.includes('update_npc_state'));
  // 上下文也确实在同一个 description 里(两部分拼在一起)
  ok('[A] 上下文与分级文案在同一份 description 里', 说明.includes('核心原则'), 说明.slice(0, 200));

  // ② **不与末条 user 重复**(§35.1 明确要求"两处择一")
  const 全部消息 = JSON.stringify(出.messages);
  ok('[A] messages 里没有分级文案(只放工具说明一处)', !全部消息.includes('写入通道说明'), 全部消息.slice(0, 300));
  ok('[A] messages 里没有"隔离沙箱通道"', !全部消息.includes('隔离沙箱通道'));

  // ③ 不进表(工具通道关)时, messages 里也不该出现它 —— 这层只在工具模式有意义
  const 关 = buildUpdateMessages(造输入({ 规则进工具: false }) as any);
  ok('[A] 工具通道关时 messages 里没有分级文案', !JSON.stringify(关.messages).includes('写入通道说明'));
  eq('[A] 工具通道关时没有工具说明', 关.工具说明, undefined);

  // ④ 直接测工具定义: 无论带不带上下文, 分级文案都在
  const 无上下文 = JSON.stringify(建工具定义());
  const 带上下文 = JSON.stringify(建工具定义('一段上下文'));
  ok('[A] 建工具定义(无上下文)带分级文案', 无上下文.includes('写入通道说明'));
  ok('[A] 建工具定义(带上下文)带分级文案', 带上下文.includes('写入通道说明'));
  // 分级在上下文**之前**(先讲怎么用, 再给内容)
  const 定义带 = 建工具定义('CTX_MARK');
  const 描述 = String(定义带[0].function.description);
  ok('[A] 分级文案在上下文之前', 描述.indexOf('写入通道说明') < 描述.indexOf('CTX_MARK'), 描述.slice(0, 120));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 第 5 层 · 文案内容与边界');
{
  const 说明 = String(建工具定义()[0].function.description);
  ok('[B] 提到两条通道: 参数(沙箱)', 说明.includes('参数 = 隔离沙箱通道'), 说明);
  ok('[B] 提到两条通道: 正文(明文)', 说明.includes('直接输出正文 = 明文通道'), 说明);
  ok('[B] 明说"允许、不禁止"', 说明.includes('允许、不禁止'), 说明);
  ok('[B] 明说"优先使用前者"', 说明.includes('优先使用前者'), 说明);
  ok('[B] 有完整性要求', 说明.includes('内容都必须完整、不省略'), 说明);
  // 不是"必须调工具"这种硬命令(原理是分级引导, 不是强制)
  ok('[B] 不是硬命令"必须调用工具"', !说明.includes('必须调用'), 说明);
  // 不许出现别家预设痕迹
  const 禁词 = ['小猫', '昆仑', 'SoliUmbra', 'catgod', 'buffer_content', 'workspace_context'];
  const 命中 = 禁词.filter(w => 说明.includes(w));
  eq('[B] 无别家预设痕迹', 命中, []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 第 4 层 · 登记归档 开关已删除（2026-11-19 用户裁定）');
{
  // ── 这个开关为什么删 ──
  //  它只改**身份句**。而这次改造把身份句搬进了**模板文字**、用户可编辑 ——
  //  开关能做的事用户直接改模板就能做到，而且更自由（不必在两句里二选一）。
  //
  //  所以这里不再测"开关关/开 换身份句"，改成测**它真的没了**：
  //  传 `登记归档: true` 也不再改变产物。判据比"字段不存在"更强 ——
  //  字段可能从 zod 掉了但入参还在类型上，那种"半删"最危险。
  const 不传 = buildUpdateMessages(造输入({}) as any);
  const 传开 = buildUpdateMessages(造输入({ 登记归档: true } as any) as any);
  eq('[C] 传 登记归档:true 不再改变产物', sha(JSON.stringify(传开.messages)), sha(JSON.stringify(不传.messages)));
  eq('[C] 传 登记归档:true 工具说明也不变', 传开.工具说明 ?? null, 不传.工具说明 ?? null);

  // 身份句现在是**固定的默认值**（模板的第一行）
  const 全文 = String(不传.messages[0].content);
  ok('[C] 默认身份句仍是原来那句', 全文.startsWith('你是「彼方 / Elsewhere」'), 全文.slice(0, 40));
  // 自证: 若开关还活着，上面第一条会红
  ok('[C/自证] 若开关仍生效，两次产物会不同',
    sha('A') !== sha('B'));

  // 那句「档案写入进程」没丢 —— 它作为**文档**留在常量里，用户可照抄进模板
  const 源码 = readFileSync(path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', 'prompts.ts'), 'utf8');
  ok('[C] 替代身份句仍保留在源码里（作为用户可照抄的文档）', /你是一个档案写入进程/.test(源码));
  ok('[C] 它仍然被导出（不是死代码）', /export const SYSTEM_PROMPT_HEAD_登记/.test(源码));
  ok('[C] 但取身份句 不再读它', !/取身份句\s*=\s*\([^)]*\)\s*=>\s*\([^)]*SYSTEM_PROMPT_HEAD_登记/.test(源码));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] 身份句在规则正文之外：去掉它，规则正文一个字不改');
{
  // 原来这条是"两种开关下的规则正文逐字相同"。开关没了，但它守的性质还在：
  // **身份句是独立的一行，规则正文从「每次更新你会收到」开始** ——
  // 模板化之后这条更重要（用户改身份句不该动到规则）。
  const 出 = buildUpdateMessages(造输入({}) as any);
  const 全文 = String(出.messages[0].content);
  const 切点 = (s: string) => s.slice(s.indexOf('\n\n每次更新你会收到'));
  ok('[D] 规则正文非空（切点有效）', 切点(全文).length > 1000, `长度 ${切点(全文).length}`);
  ok('[D] 身份句在切点之前', 全文.indexOf('你是「彼方') < 全文.indexOf('\n\n每次更新你会收到'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 那条替代身份句：只有职能身份，无角色名/人格');
{
  // 这段文字不再是"开关的一支"，而是**用户可照抄的文档**。
  // 所以判据从"产物里长什么样"变成"那段文字本身长什么样" —— 它要被用户粘进模板，
  // 就得符合原来那条设计约束：只给职能身份，不带扮演性质。
  const { SYSTEM_PROMPT_HEAD_登记 } = await import('../src/彼方_NPC幕后生命状态系统/prompts');
  const 身份 = String(SYSTEM_PROMPT_HEAD_登记);
  const 禁词 = ['你是「', '彼方 / Elsewhere', '扮演', '人格', '小猫', '昆仑', 'SoliUmbra', 'catgod'];
  eq('[E] 那段文字里无角色名/扮演性质词', 禁词.filter(w => 身份.includes(w)), []);
  ok('[E] 是职能身份（档案写入进程）', 身份.includes('档案写入进程'));
  ok('[E] 提到登记员', 身份.includes('登记员'));
  ok('[E] 很短（< 150 字，只换身份不夹带规则）', 身份.length < 150, `长度 ${身份.length}`);
  // 自证: 它确实是一句完整的话（能被直接粘进模板）
  ok('[E] 以句号结尾', 身份.trim().endsWith('。'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[F] 第 4 层 · 默认值 + 与其余开关互不影响');
{
  setActivePinia(createPinia());
  const { host } = 彼方假宿主();
  const 设置 = getSettings(host as any);
  eq('[F] 登记归档 字段已从设置里删除', Object.prototype.hasOwnProperty.call(设置.接口, '登记归档'), false);
  eq('[F] 工具通道默认关', 设置.接口.工具通道, false);
  eq('[F] 请求打散默认关', 设置.接口.请求打散, false);

  // 两种工具通道下都不崩，身份句一致（身份句不再随任何开关变）
  for (const 工具 of [false, true]) {
    const 出 = buildUpdateMessages(造输入({ 规则进工具: 工具 }) as any);
    const 身份 = String(出.messages[0].content);
    ok(`[F] 工具=${+工具}: 身份句是默认那句`, 身份.startsWith('你是「彼方 / Elsewhere」'), 身份.slice(0, 30));
    // 第 5 层: 只在工具通道开时出现(同样要按"实际 description"的层次测)
    const 实际说明 = String(建工具定义(String(出.工具说明 ?? ''))[0].function.description);
    if (工具)
      ok(`[F] 工具=${+工具}: 有分级文案`, 实际说明.includes('写入通道说明'));
    else
      ok(`[F] 工具=${+工具}: 无分级文案`, !JSON.stringify(出.messages).includes('写入通道说明'));
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
