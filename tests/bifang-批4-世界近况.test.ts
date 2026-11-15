// 彼方 · 批4-1：世界近况约定句（D′ 的零代码那一半）
//
// 定位（#287 裁定）：缺的那五层（指标/节令/地域/大势/伏笔）**主 AI 也看不到**，
// 所以 D′ 不是"让 NPC 知道镇上发生了什么"（那一半已由烟火的蓝灯常驻条目天然生效），
// 而是**给幕后更新模型补一层世界背景**。
//
// 这份用例钉三件事：
//   ① 约定句真的在提示词里（否则等于没做）
//   ② 它明说"可以用"（推演生活流转时参考）
//   ③ 它明说"必须过防全知闸"（公开事件可知道 + 要能说出信息来源；私下事件仍不知道）
//   ④ 它明说"没有就别编"（防止模型凭空假设世界大事）
//   ⑤ 它明说"不要当成正文"（防止据此新开未完成事项）
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, note?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}${note ? `  (${note})` : ''}`);
  }
}

/** 造一份最小注入文本（纯函数） */
function 造文本(带世界书: boolean) {
  return buildUpdateMessages({
    reply: '【最新回复】\n2039-09-17 11:35 车库里很安静。',
    replyCount: 1,
    tracked: ['艾莉'],
    inSceneHint: ['艾莉'],
    currentCards: { 艾莉: { 当前在做: '修发电机', 当前状态: '专注', 位置: '车库' } },
    currentStoryTime: '2039-09-17 10:00',
    storyTimeHint: '2039-09-17 11:35',
    storySpan: '约 2 小时（按正文时刻估算）(≤6 小时, 同一段生活内)',
    worldbook: 带世界书 ? '【烟火】世界动向\n2039-09-17 西雅图城区开始限水, 各区设配给点。' : '',
    physioEnabled: false,
  }).messages.map(m => m.content).join('\n');
}

console.log('\n[1] 约定句存在（无世界书时也要在 —— 它是常驻规则，不是条件段）');
{
  const 无书 = 造文本(false);
  const 有书 = 造文本(true);

  ok('无世界书时也含"世界近况"', 无书.includes('世界近况'));
  ok('有世界书时含"世界近况"', 有书.includes('世界近况'));
  ok('两处都在（是常驻规则）', 无书.includes('世界近况') && 有书.includes('世界近况'));
}

console.log('\n[2] 三个关键措辞：可以用 / 必须过闸 / 没有就别编');
{
  const 文本 = 造文本(true);

  ok('写明"可以用"（推演生活流转时参考）', 文本.includes('**可以用**'));
  ok('举例说明世界近况怎么用（物资紧张/节令/停水）',
   文本.includes('物资紧张') && 文本.includes('节令') && 文本.includes('停水'));
  ok('写明"必须过防全知闸"', 文本.includes('必须过防全知闸'));
  ok('写明公开事件可以知道', 文本.includes('公开事件'));
  ok('写明要能说出信息来源', 文本.includes('要能说出信息来源'));
  ok('举例信息来源（听邻居说/集会上宣布/广播里讲）',
   文本.includes('听邻居说') && 文本.includes('集会上宣布') && 文本.includes('广播里讲'));
  ok('写明私下事件仍不知道', 文本.includes('私下发生的事'));
  ok('写明"没有这类内容时不要编"', 文本.includes('没有这类内容时不要编'));
  ok('写明"不要把它当成正文"', 文本.includes('不要把它当成正文'));
  ok('写明不要据此新开未完成事项', 文本.includes('新开「未完成事项」'));
}

console.log('\n[3] 不破坏防全知优先级（原则 10 仍是最高）');
{
  const 文本 = 造文本(true);
  ok('原则 10 仍写着"优先级第一"', 文本.includes('优先级第一'));
  ok('世界近况那条明确写了"原则 10 优先级更高"', 文本.includes('原则 10 优先级更高'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
