import type { Settings, WorldData, WorldEvent } from './schema';
import { 取运转策略 } from './运转策略';
import { 解析日期 } from './时间校验';

/** 只选完整事件；等待不会被伪装成结束，未选中记录仍存在存档里。
 *  等待中的事态不能永久沉底：到期、被正文点名、或已经等够轮数的，都要重新进入工作集。 */
export function 选工作事件(data: WorldData, settings: Settings, evidence: string): WorldEvent[] {
  const policy = 取运转策略(settings.运转);
  const now = 解析日期(data.世界.时间)?.天;
  const start = (data.统计.推进次数 ?? 0) % Math.max(1, data.事件.length);
  return data.事件.map((event, index) => {
    const due = 解析日期(event.下次判定时间)?.天;
    const mentioned = [event.标题, event.势力, event.地点].filter(Boolean).some(key => evidence.includes(key));
    const waiting = !!event.等待条件 && !mentioned && !(now != null && due != null && due <= now);
    // 等待中的事如果一直没被点名/没到期，按位置轮换强制复审，避免"等待"变成永久冷藏。
    const 复审 = waiting && (index - start + data.事件.length) % Math.max(1, data.事件.length) < Math.max(1, Math.floor(policy.重点跟进 / 2));
    const priority = mentioned ? 30 : now != null && due != null && due <= now ? 20 : 复审 ? 5 : waiting ? -10 : event.阶段 === '进行' ? 10 : 0;
    return { event, priority, position: (index - start + data.事件.length) % Math.max(1, data.事件.length) };
  }).sort((a,b) => b.priority - a.priority || a.position - b.position)
    .slice(0, policy.重点跟进).map(row => row.event);
}

export interface 公开摘要结果 {
  text: string;
  selectedIds: string[];
  omittedIds: string[];
  /** 本轮注入的最近已结束公开事态(整条选择，不是删除) */
  了结Ids: string[];
  characters: number;
  targetCharacters: number;
  overTarget: boolean;
}
function 事件文本(event: WorldEvent): string {
  const fields: [string, string | undefined][] = [
    ['时间', event.时间], ['地点', event.地点], ['当前', event.描述], ['前情', event.前情],
    ['渠道', event.渠道], ['归属', event.势力], ['代表人物', event.代表人物], ['等待条件', event.等待条件],
  ];
  return `${event.标题}（${event.阶段}）\n` + fields.filter(([,text]) => !!text).map(([label,text]) => `${label}：${text}`).join('\n');
}

/** 公共输出只由已标记公开的事件及其公开后果派生；不透传可能复写秘密的总览/势力暗流。 */
export function 构建公开摘要(data: WorldData, settings: Settings): 公开摘要结果 {
  const policy = 取运转策略(settings.运转);
  const candidates = data.事件.filter(e => settings.运转.注入隐秘事件 || e.隐秘 === '公开');
  const selected = [...candidates].reverse().slice(0, policy.公开摘要);
  const selectedIds = selected.map(e => e.id || e.标题);
  const selectedSet = new Set(selectedIds);
  const omittedIds = candidates.filter(e => !selectedSet.has(e.id || e.标题)).map(e => e.id || e.标题);
  // 已了结的公开结果也按"整条选择"计入预算：旧记录会长期累积，不能每轮把全部历史都注入。
  const 保留条数 = Math.max(1, policy.公开摘要);
  const 公开了结 = (data.已了结 ?? []).filter(event => event.隐秘 === '公开' && event.结束原因);
  const 最近了结 = 公开了结.slice(-保留条数);
  const 更早了结 = 公开了结.length - 最近了结.length;
  const 了结Ids = 最近了结.map(e => e.id || e.标题);
  const lines = [
    '[烟火 · 世界动向]',
    '以下为已记录的世界公共事实。角色只能通过合理渠道得知，不许全知，不要大段播报。过去记忆不代表本轮重新发生；未列出的记录不等于已结束。',
    `世界时间：${data.世界.时间 || '未知'}`,
  ];
  for (const event of selected) lines.push(event.隐秘 === '隐秘' ? `隐秘背景（主角不得无依据知晓）：\n${事件文本(event)}` : 事件文本(event));
  // 持续后果独立于摘要条数；必要完整事实即使超目标也不裁切。
  for (const event of 最近了结) {
    lines.push(`已结束事态「${event.标题}」的公开结果：\n${event.结束原因}`);
  }
  if (更早了结 > 0) lines.push(`另有 ${更早了结} 条更早的已结束公开事态未列出；它们仍在存档里，未被删除，也不表示没有发生过。`);
  if (!selected.length) lines.push('本轮没有需要补充的在册公共事态，不表示旧事已经结束。');
  const text = lines.join('\n\n');
  return { text, selectedIds, omittedIds, 了结Ids, characters: text.length, targetCharacters: policy.摘要目标字符, overTarget: text.length > policy.摘要目标字符 };
}
