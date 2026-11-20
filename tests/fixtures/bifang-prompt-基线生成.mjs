// 彼方 · C3 基线生成器 —— 批次 2026-11-20（需求方 #499）。
//
// ── 这个脚本干什么 ──
//
//  用**当前**代码跑 5 组配置，把 `buildUpdateMessages` + `buildInjectionPrompt` 的
//  全部输出序列化存成 fixture。之后拆提示词段时，逐字节判据拿它当**外部锚点**。
//
// ── 为什么基线必须来自"重构前的真实产物" ──
//
//  需求方 #472 那句：
//
//  > 为什么不靠"段表拼回去等于原字符串"这种自证：**拿它自证等于自己**。
//  > 基线来自**重构前的真实产物**，是外部锚点。
//
//  所以这个脚本**只读不写实现**，跑完把产物落盘，之后实现怎么拆都行，
//  只要产物逐字节不变。
//
// ── ⚠ 序列化必须两边用同一个函数 ──
//
//  `JSON.stringify` 的键序、转义、`\u` 处理都可能不同。所以：
//  本文件导出 `序列化(输出)`，判据文件 import 同一个 —— 不各写一份。
//
// ── 用法 ──
//
//  node tests/fixtures/bifang-prompt-基线生成.mjs          ← 生成/更新基线
//  node tests/fixtures/bifang-prompt-基线生成.mjs --check  ← 只比对，不写盘
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTest } from '../build.mjs';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 输入路径 = path.join(此处, 'bifang-prompt-基线输入.json');
const 产物路径 = path.join(此处, 'bifang-prompt-基线产物.txt');
const 入口 = path.join(此处, '_prompt-baseline.ts');
const 打包产物 = path.join(此处, '_prompt-baseline.mjs');

/**
 * **5 组配置** —— 覆盖提示词的所有条件分支。
 *
 * | 组 | 名字 | 覆盖什么 |
 * |---|---|---|
 * | 1 | 全关 | 生理关 + 自动建档开 + 无恋爱对象 + 无世界书 + 无轨迹 —— **最短的产物** |
 * | 2 | 生理开 | `physioEnabled: true` → PHYSIO_* 四段 + 生理注入列 |
 * | 3 | 恋爱开 | `恋爱对象名单` 非空 → 恋爱说明段 + 恋爱注入列 |
 * | 4 | 自动建档关 | `autoTrackEnabled: false` → "仅更新已追踪 NPC"段 |
 * | 5 | 世界书+场景判断非空 | `worldbook` + `recentTrace` + `storySpan` + `storyTimeHint` 全非空 |
 *
 * ⚠ 第 5 组还带**自定义段**（四个锚点各一条）—— 那是 `buildUpdateMessages` 里
 *   最容易漏的分支（`锚点段` 的过滤与归一化）。
 */
const 配置 = [
  {
    名: '全关',
    说明: '生理关 / 自动建档开 / 无恋爱对象 / 无世界书 / 无轨迹 —— 最短的产物',
    入参: {
      reply: '她抬头看了一眼门口，又低下头继续理货。',
      replyCount: 1,
      tracked: ['泰丝'],
      inSceneHint: ['泰丝'],
      currentCards: {
        泰丝: {
          当前在做: '整理货单',
          当前状态: '有点累',
          位置: '杂货铺',
          身份锚点: '杂货铺老板娘',
          心事: '房租又涨了',
          近期关键事件: ['2026-01-01 进了一批货'],
          未完成事项: [{ 编号: 'T1', 内容: '去码头取货', 状态: '进行中' }],
          最后剧情时刻: '2026-01-02 12:30',
        },
      },
      autoTrackEnabled: true,
      physioEnabled: false,
      恋爱对象名单: [],
      自定义段: [],
      worldbook: '',
      currentStoryTime: '2026-01-02 12:30',
      storySpan: '跳过（无时间）',
      recentTrace: '',
      playerName: '旅人',
      playerDescription: '一个路过的旅行者。',
      展开宏: null,
    },
  },
  {
    名: '生理开',
    说明: 'physioEnabled: true → PHYSIO_* 四段 + 生理注入列',
    入参: {
      reply: '她揉了揉小腹，算着日子。',
      replyCount: 2,
      tracked: ['泰丝', '莉莉'],
      inSceneHint: ['泰丝'],
      currentCards: {
        泰丝: {
          当前在做: '整理货单',
          当前状态: '有点累',
          位置: '杂货铺',
          身份锚点: '杂货铺老板娘',
          生理周期: '卵泡期 Day 8/33',
          是否怀孕: 'false',
          周期影响: '体力正常',
          当前防护: '无',
          近期性行为: '无',
          周期长度: '33',
          生理周期日期: '2026-01-01 06:00',
          怀孕知晓: '未知',
          最后剧情时刻: '2026-01-02 12:30',
        },
        莉莉: {
          当前在做: '擦酒杯',
          当前状态: '平静',
          位置: '酒馆',
          身份锚点: '酒馆老板娘',
          生理周期: '黄体期 Day 22/28',
          是否怀孕: 'false',
          周期影响: '容易疲惫',
          当前防护: '无',
          近期性行为: '无',
          周期长度: '28',
          生理周期日期: '2025-12-28 07:00',
          怀孕知晓: '未知',
          最后剧情时刻: '2026-01-02 12:00',
        },
      },
      autoTrackEnabled: true,
      physioEnabled: true,
      恋爱对象名单: [],
      自定义段: [],
      worldbook: '',
      currentStoryTime: '2026-01-02 12:30',
      storySpan: '约 0.5 天（按正文时刻估算）',
      recentTrace: '',
      playerName: '旅人',
      playerDescription: '',
      展开宏: null,
    },
  },
  {
    名: '恋爱开',
    说明: '恋爱对象名单非空 → 恋爱说明段 + 恋爱注入列',
    入参: {
      reply: '莉莉把手覆在他手背上，没抽开。',
      replyCount: 1,
      tracked: ['莉莉'],
      inSceneHint: ['莉莉'],
      currentCards: {
        莉莉: {
          当前在做: '擦酒杯',
          当前状态: '心跳有点快',
          位置: '酒馆吧台',
          身份锚点: '酒馆老板娘',
          恋爱对象: '是',
          恋爱态度: '明明在意却嘴硬',
          恋爱标签: '青梅竹马、嘴硬',
          好感阶段: '熟悉',
          情欲阶段: '微动',
          名分: '无',
          情感倾向: '外放',
          最后剧情时刻: '2026-01-02 21:00',
        },
      },
      autoTrackEnabled: true,
      physioEnabled: false,
      恋爱对象名单: ['莉莉'],
      自定义段: [],
      worldbook: '',
      currentStoryTime: '2026-01-02 20:30',
      storySpan: '约 2.0 小时（按正文时刻估算）',
      recentTrace: '',
      playerName: '旅人',
      playerDescription: '',
      展开宏: null,
    },
  },
  {
    名: '自动建档关',
    说明: 'autoTrackEnabled: false → "仅更新已追踪 NPC"段',
    入参: {
      reply: '一个陌生男人推门进来，扫了一圈。',
      replyCount: 1,
      tracked: ['泰丝'],
      inSceneHint: ['泰丝', '陌生男人'],
      currentCards: {
        泰丝: {
          当前在做: '整理货单',
          当前状态: '警惕',
          位置: '杂货铺',
          身份锚点: '杂货铺老板娘',
          最后剧情时刻: '2026-01-02 12:30',
        },
      },
      autoTrackEnabled: false,
      physioEnabled: false,
      恋爱对象名单: [],
      自定义段: [],
      worldbook: '',
      currentStoryTime: '2026-01-02 12:30',
      storySpan: '跳过（无时间）',
      recentTrace: '',
      playerName: '旅人',
      playerDescription: '',
      展开宏: null,
    },
  },
  {
    名: '世界书+场景判断非空',
    说明: 'worldbook + recentTrace + storySpan + storyTimeHint 全非空，且带四个锚点的自定义段',
    入参: {
      reply: '2026-01-03 09:15 泰丝推开店门，晨光洒在货架上。',
      replyCount: 3,
      context: '（上一轮：她把账本合上，吹灭了油灯。）',
      timeJump: '次日清晨',
      tracked: ['泰丝', '莉莉'],
      inSceneHint: ['泰丝'],
      currentCards: {
        泰丝: {
          当前在做: '开店铺货',
          当前状态: '精神不错',
          位置: '杂货铺',
          身份锚点: '杂货铺老板娘',
          心事: '账本上的亏空',
          近期关键事件: ['2026-01-02 取到货'],
          未完成事项: [{ 编号: 'T1', 内容: '去码头取货', 状态: '已完成', 结果: '货取到了' }],
          生活状态: '洗漱(2026-01-03 08:00)',
          最后剧情时刻: '2026-01-03 09:15',
        },
        莉莉: {
          当前在做: '睡觉',
          当前状态: '睡得很沉',
          位置: '酒馆二楼',
          身份锚点: '酒馆老板娘',
          最后剧情时刻: '2026-01-02 23:30',
        },
      },
      autoTrackEnabled: true,
      physioEnabled: true,
      恋爱对象名单: ['莉莉'],
      自定义段: [
        { 锚点: '最前', role: 'system', content: '（自定义最前段）', 启用: true },
        { 锚点: '主提示词之后', role: 'system', content: '（自定义主提示词之后段）', 启用: true },
        { 锚点: '任务之前', role: 'user', content: '（自定义任务之前段）', 启用: true },
        { 锚点: '任务之后', role: 'system', content: '（自定义任务之后段）', 启用: true },
        { 锚点: '最后', role: 'assistant', content: '（自定义最后段）', 启用: true },
        { 锚点: '最后', role: 'system', content: '（这条被禁用，不该出现）', 启用: false },
      ],
      worldbook: '【设定】这是一个边境小镇，常年有商队经过。\n\n【莉莉】酒馆老板娘，三十岁，说话直。',
      currentStoryTime: '2026-01-02 23:30',
      storySpan: '约 9.8 小时（按正文时刻估算）',
      recentTrace: '近期变化（从最近 3 份快照 diff）：\n泰丝：当前在做 整理货单 → 开店铺货；位置 杂货铺 → 杂货铺',
      storyTimeHint: '2026-01-03 09:15',
      storyTimeHint仅时分: '',
      playerName: '旅人',
      playerDescription: '一个路过的旅行者，背着旧行囊。',
      展开宏: null,
    },
  },
  {
    名: '条件段拆分组',
    说明: '只开 worldbook + recentTrace（不开生理/恋爱/自定义锚点/场景判断）—— 让世界书段与轨迹段各有两组覆盖',
    入参: {
      reply: '泰丝把账本翻到最后一页，皱了皱眉。',
      replyCount: 1,
      tracked: ['泰丝'],
      inSceneHint: ['泰丝'],
      currentCards: {
        泰丝: {
          当前在做: '对账',
          当前状态: '有点烦',
          位置: '杂货铺柜台',
          身份锚点: '杂货铺老板娘',
          最后剧情时刻: '2026-01-03 20:00',
        },
      },
      autoTrackEnabled: true,
      physioEnabled: false,
      恋爱对象名单: [],
      自定义段: [],
      worldbook: '【设定】这是一个边境小镇，常年有商队经过。',
      currentStoryTime: '2026-01-03 19:00',
      storySpan: '约 1.5 小时（按正文时刻估算）',
      recentTrace: '近期变化（从最近 2 份快照 diff）：\n泰丝：当前在做 开店铺货 → 对账',
      storyTimeHint: '',
      storyTimeHint仅时分: '',
      playerName: '旅人',
      playerDescription: '',
      展开宏: null,
    },
  },
];

const 源码 = `
import { buildUpdateMessages, buildInjectionPrompt } from '../../src/彼方_NPC幕后生命状态系统/prompts';

/**
 * **序列化** —— 两边（生成器与判据）必须用**同一个函数**。
 *
 * 为什么不能各写一份 \`JSON.stringify\`：键序、转义、\`\\\\u\` 处理都可能不同，
 * 那会让"逐字节相同"变成一个测不准的判据。
 *
 * 这里固定格式：
 *   - 每条消息一段，形如 \`--- [0] role=system ---\\n<content>\`
 *   - 组之间用 \`\\n@@@ GROUP <名> @@@\\n\`
 *   - 末尾不留多余换行
 */
export function 序列化(结果们) {
  const 段 = [];
  for (const { 名, 输出 } of 结果们) {
    段.push(\`@@@ GROUP \${名} @@@\`);
    if (输出.messages) {
      输出.messages.forEach((m, i) => {
        段.push(\`--- [\${i}] role=\${m.role} ---\`);
        段.push(m.content);
      });
    } else {
      // buildInjectionPrompt 返回的是**字符串**（不是 messages 数组）
      段.push('--- [注入段] ---');
      段.push(输出);
    }
  }
  return 段.join('\\n');
}

export function 跑全部(配置) {
  const 结果们 = [];
  for (const { 名, 入参 } of 配置) {
    // ① 更新提示词（messages 数组）
    const 更新 = buildUpdateMessages(入参);
    结果们.push({ 名: \`\${名} / 更新提示词\`, 输出: 更新 });

    // ② 注入提示词（单段字符串）—— 用同一份卡
    const entries = Object.entries(入参.currentCards ?? {});
    const 注入 = buildInjectionPrompt(entries, {
      未回票: { 泰丝: ['T1'] },
      剧情时间: 入参.currentStoryTime ?? '',
      生理监测: !!入参.physioEnabled,
    });
    结果们.push({ 名: \`\${名} / 注入段\`, 输出: 注入 });
  }
  return 结果们;
}
`;

writeFileSync(入口, 源码);
await buildTest(入口, 打包产物);

const { 序列化, 跑全部 } = await import(new URL(`file:///${打包产物.replace(/\\/g, '/')}`).href);

const 结果们 = 跑全部(配置);
const 文本 = 序列化(结果们);

const 模式 = process.argv[2];
if (模式 === '--check') {
  let 基线 = '';
  try {
    基线 = readFileSync(产物路径, 'utf8');
  }
  catch {
    console.error('✗ 基线文件不存在，先跑一次不带 --check 的');
    process.exit(1);
  }
  if (基线 === 文本) {
    console.log('✓ 与基线逐字节相同');
    process.exit(0);
  }
  console.error('✗ 与基线不同');
  process.exit(1);
}

writeFileSync(输入路径, `${JSON.stringify(配置.map(({ 名, 说明, 入参 }) => ({ 名, 说明, 入参 })), null, 2)}\n`, 'utf8');
writeFileSync(产物路径, 文本, 'utf8');

console.log(`已生成基线：${配置.length} 组配置`);
console.log(`  输入: ${输入路径}`);
console.log(`  产物: ${产物路径}（${文本.length} 字符）`);
console.log('');
console.log('各组产物长度：');
for (const { 名, 输出 } of 结果们) {
  const 长度 = 输出.messages ? 输出.messages.reduce((s, m) => s + m.content.length, 0) : 输出.length;
  const 条数 = 输出.messages ? ` / ${输出.messages.length} 条消息` : ' / 单段';
  console.log(`  ${名}: ${长度} 字符${条数}`);
}
