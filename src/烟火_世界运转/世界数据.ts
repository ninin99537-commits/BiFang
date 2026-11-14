import type { Settings, WorldData, WorldEvent, WorldFaction, WorldMetric, WorldOccasion, WorldSeed } from './schema';
import { SEED_MATURITY } from './schema';
import { EVENT_LIMIT, 内容字段键, 取层, 占位词, 沿用条目, 规范化事件字段, 规范化条目, 事件层 } from './世界字段表';
import { 校验世界时间, 解析日期, type 世界时间约束 } from './时间校验';
import { 取运转策略, type 运转密度 } from './运转策略';

export function 签事件id(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
export function 有世界数据(data: WorldData): boolean {
  return Boolean(data.世界.时间 || data.世界.总览 || data.事件.length || Object.keys(data.势力).length
    || Object.keys(data.地域 ?? {}).length || Object.keys(data.大势 ?? {}).length || data.伏笔?.length
    || data.节令?.length || Object.keys(data.指标 ?? {}).length);
}
export function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(String(value ?? '').trim()) ? String(value).trim() as T : fallback;
}
function 文本(value: unknown, field = '字段'): string {
  if (value != null && typeof value === 'object') throw Error(`「${field}」应为完整文本，不接受对象或数组`);
  return String(value ?? '').trim();
}
function 合并文本(value: unknown, old: string | undefined, field: string): string {
  const text = 文本(value, field);
  return !text || (field === '前情' && 占位词(text)) ? old ?? '' : text;
}
function 对象(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 默认值只用于新事件，旧事件先认领身份，再继承缺失字段；所有内容均不裁切。 */
export function normalizeEvent(raw: any, worldTime: string, old?: WorldEvent): (WorldEvent & { 变化: string }) | null {
  if (!对象(raw)) return null;
  const source: Record<string, unknown> = {};
  for (const field of 事件层.字段) {
    const names = [field.键, ...(field.别名 ?? []), ...(field.旧名 ?? [])];
    const key = names.find(name => raw[name] != null);
    let value = key === undefined ? (old as any)?.[field.键] : raw[key];
    if (old && field.枚举 && !field.枚举.includes(文本(value, field.键))) value = (old as any)[field.键];
    if (field.键 === '前情') value = 合并文本(value, old?.前情, field.键);
    source[field.键] = value;
  }
  const fields = 规范化事件字段(source, 'AI', { 世界时间: worldTime });
  if (!fields) return null;
  const optional: Record<string, string> = {};
  for (const key of ['结束原因', '等待条件', '下次判定时间']) {
    const 原始 = (raw as Record<string, unknown>)[key];
    if (原始 !== undefined && 原始 !== null) {
      // 显式空串 = 明确清空(等待条件解除/不再判定)；没带这个键才沿用旧值
      const 文本值 = 合并文本(原始, undefined, key);
      if (文本值) optional[key] = 文本值;
      continue;
    }
    if ((old as any)?.[key] != null) optional[key] = 合并文本(undefined, (old as any)[key], key);
  }
  // 结束原因只属于已结束的事态；活跃事件上留着上一轮的原因会让下一轮误读成"已经结束"
  const 阶段值 = 文本(raw.阶段) || old?.阶段 || '进行';
  if (optional.结束原因 && 阶段值 !== '已结束') delete optional.结束原因;
  return {
    id: 文本(raw.id ?? raw.标识 ?? old?.id),
    ...(fields as unknown as Omit<WorldEvent, 'id' | '演变'>),
    ...optional,
    演变: [],
    变化: 文本(raw.变化 ?? raw.本次变化 ?? raw.本次推进),
  };
}

/** 先保留既有实体，再准入完整新条目；旧档超容量只诊断，不静默销毁。 */
export function normalizeLayer(raw: unknown, old: Record<string, any>, limit: number, fields: string[]): Record<string, any> {
  const out: Record<string, any> = Object.fromEntries(Object.entries(old));
  if (!对象(raw)) return out;
  for (const [name, item] of Object.entries(raw)) {
    const key = 文本(name);
    if (!key || !对象(item)) continue;
    if (!(key in out) && Object.keys(out).length >= limit) continue;
    out[key] = Object.fromEntries(fields.map(field => [field, 合并文本(item[field], old[key]?.[field], field)]));
  }
  return out;
}

export interface 维护选项 {
  密度?: 运转密度;
  运转?: Partial<Settings['运转']>;
  工作事件?: readonly string[];
}

/** 周期节令的下一轮日期：只处理能解析成公历的周期(每年/每季/每月/每周/每天)，
 *  古代历法保持原文不伪造日期；算出来的新日期若仍早于当前世界时间，继续往前推。 */
function 下一次节令日期(时间: string, 周期: string, 世界日: number): string | null {
  const 周期文本 = String(周期 ?? '').trim();
  const 步长 = /每年|一年/.test(周期文本) ? { 年: 1 }
    : /每季|一季|季度/.test(周期文本) ? { 月: 3 }
      : /每月|一月|月度/.test(周期文本) ? { 月: 1 }
        : /每周|一周|星期/.test(周期文本) ? { 日: 7 }
          : /每天|每日/.test(周期文本) ? { 日: 1 }
            : null;
  if (!步长) return null;
  let 日期 = 解析日期(时间);
  if (!日期) return null;
  for (let i = 0; i < 500; i++) {
    const 基准: Date = new Date(日期.天);
    if (步长.年) 基准.setUTCFullYear(基准.getUTCFullYear() + 步长.年);
    if (步长.月) 基准.setUTCMonth(基准.getUTCMonth() + 步长.月);
    if (步长.日) 基准.setUTCDate(基准.getUTCDate() + 步长.日);
    const 下一天: number = 基准.getTime();
    if (下一天 <= 世界日) { 日期 = { 年: 基准.getUTCFullYear(), 月: 基准.getUTCMonth() + 1, 日: 基准.getUTCDate(), 天: 下一天 }; continue; }
    const 原时间 = 时间;
    const 格式 = /(\d{4})年(\d{1,2})月(\d{1,2})/.test(原时间) ? '中文' : 'iso';
    const 新日期 = 基准;
    const 年月日 = 格式 === '中文'
      ? `${新日期.getUTCFullYear()}年${新日期.getUTCMonth() + 1}月${新日期.getUTCDate()}日`
      : `${新日期.getUTCFullYear()}-${String(新日期.getUTCMonth() + 1).padStart(2, '0')}-${String(新日期.getUTCDate()).padStart(2, '0')}`;
    return 原时间.replace(/(\d{4})年(\d{1,2})月(\d{1,2})[日号]?|(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, 年月日);
  }
  return null;
}

export function validateAndNormalize(parsed: any, oldData: WorldData, 时间约束?: 世界时间约束, options: 维护选项 = {}): WorldData {
  if (!对象(parsed)) throw Error('AI 返回的 JSON 顶层必须是对象');
  if (!对象(parsed.世界)) throw Error('缺少「世界」对象(应包含 时间/氛围/总览)，请重新输出');
  const time = 文本(parsed.世界.时间, '世界.时间');
  if (!time) throw Error('「世界.时间」为空；没有新时间依据时原样沿用上次时间');
  if (时间约束) 校验世界时间(time, 时间约束);
  if (!Array.isArray(parsed.事件)) throw Error('「事件」必须是数组(无事件时返回 [])');
  for (const layer of ['地域', '大势', '指标', '势力']) if (parsed[layer] !== undefined && !对象(parsed[layer])) throw Error(`「${layer}」必须是对象`);
  for (const layer of ['伏笔', '节令']) if (parsed[layer] !== undefined && !Array.isArray(parsed[layer])) throw Error(`「${layer}」必须是数组`);
  const notes: string[] = [];
  const policy = 取运转策略({ 世界密度: options.密度 ?? options.运转?.世界密度 ?? '正常', ...options.运转 });
  const oldEvents = oldData.事件 ?? [];
  const oldById = new Map(oldEvents.filter(e => e.id).map(e => [e.id, e]));
  const oldByTitle = new Map(oldEvents.map(e => [e.标题, e]));
  const ended = [...(oldData.已了结 ?? [])];
  const terminalIds = new Set(ended.map(e => e.id).filter(Boolean));
  const terminalTitles = new Set(ended.map(e => e.标题));
  const used = new Set<WorldEvent>();
  const updated = new Map<WorldEvent, WorldEvent>();
  const newborn: WorldEvent[] = [];
  const seenTitles = new Set<string>();
  const workIds = options.工作事件 ? new Set(options.工作事件) : null;
  for (const raw of parsed.事件) {
    if (!对象(raw)) { notes.push('跳过非对象的事件候选'); continue; }
    const title = 文本(raw.标题 ?? raw.事件);
    const rawId = 文本(raw.id ?? raw.标识);
    const old = oldById.get(rawId) ?? oldByTitle.get(title);
    if (old && used.has(old)) { notes.push(`重复认领「${old.标题}」，只接受一份完整更新`); continue; }
    if (!old && (terminalIds.has(rawId) || terminalTitles.has(title))) { notes.push(`「${title}」已经结束，未因旧回忆重开`); continue; }
    if (old && workIds && !workIds.has(old.id || old.标题)) {
      continue;
    }
    const event = normalizeEvent(raw, time, old);
    if (!event) { notes.push(`缺少事件标题，候选未入账：${JSON.stringify(raw)}`); continue; }
    if (seenTitles.has(event.标题)) { notes.push(`事件标题「${event.标题}」重复，未另开条目`); continue; }
    seenTitles.add(event.标题);
    if (!old && event.阶段 === '已结束') { notes.push(`新事件「${event.标题}」不能未经记录直接结束`); continue; }
    const { 变化, ...fields } = event;
    const change = 占位词(变化) ? '' : 变化;
    const evolution = [...(old?.演变 ?? [])];
    if (change && change !== evolution.at(-1)?.变化) evolution.push({ 时间: time, 变化: change });
    const item: WorldEvent = { ...fields, id: old?.id || 签事件id(), 演变: evolution };
    // 事件.时间 = 最近一次进展：AI 显式给了时间就用它；没给时，有实质变化才更新为本次世界时间，
    // 没有实质变化则保留旧时间，避免把静止档案伪装成"刚发生"。
    const 显式给了时间 = 文本(raw.时间) !== '';
    const 有实质变化 = !!change || (old ? item.阶段 !== old.阶段 || item.描述 !== old.描述 : true);
    if (old && !显式给了时间 && !有实质变化) item.时间 = old.时间;
    if (old && !显式给了时间 && 有实质变化) item.时间 = time;
    if (old) {
      used.add(old);
      const 阶段没依据 = item.阶段 !== old.阶段 && !(item.结束原因 || change);
      if (阶段没依据) {
        notes.push(`「${old.标题}」阶段变化没有依据，沿用原阶段`);
        item.阶段 = old.阶段;
      }
      if (item.隐秘 !== old.隐秘 && !(change || (item.描述 && item.描述 !== old.描述))) {
        item.隐秘 = old.隐秘; notes.push(`「${old.标题}」未提供曝光依据，沿用原公开性`);
      }
      if (item.阶段 === '已结束' && !item.结束原因) {
        notes.push(`「${old.标题}」已结束但缺少完整结束原因；仍按已结束入档，原因请在下一轮补全`);
      }
      if (item.阶段 === '已结束') ended.push(item);
      else updated.set(old, item);
    } else {
      if (item.阶段 !== '已结束' && !change) {
        notes.push(`新事件「${item.标题}」没有一句本次变化：只作为档案入册，别指望下一轮还能从一句话里看出它为什么发生`);
      }
      newborn.push(item);
    }
  }
  const active = oldEvents.filter(e => !used.has(e) || updated.has(e)).map(e => updated.get(e) ?? e);
  const omitted = oldEvents.filter(e => !used.has(e));
  if (omitted.length) notes.push(`保留${omitted.length}条未被带回或未参与本轮推演的旧事件；省略不代表结束`);
  const oldDate = 解析日期(oldData.世界.时间);
  const newDate = 解析日期(time);
  const jumped = !!oldDate && !!newDate && newDate.天 > oldDate.天;
  const configured = options.密度 !== undefined || options.运转 !== undefined;
  const cap = configured ? policy.进行中上限 : EVENT_LIMIT;
  const quota = configured ? (jumped ? policy.大跳新增 : policy.每轮新增) : EVENT_LIMIT;
  let admitted = 0;
  for (const event of newborn) {
    if (admitted >= quota || active.length >= cap) { notes.push(`新候选「${event.标题}」超过本轮准入额度，未添加；旧记录完整保留`); continue; }
    active.push(event); admitted++;
  }
  if (active.length > cap) notes.push(`旧档保留${active.length}条事态，超过${cap}条准入参考；停止额外新增，不强行判结束`);

  const factions: Record<string, WorldFaction> = { ...(oldData.势力 ?? {}) };
  const factionLayer = 取层('势力');
  for (const [name, raw] of Object.entries(parsed.势力 ?? {})) {
    if (!name || !对象(raw)) continue;
    if (!(name in factions) && Object.keys(factions).length >= factionLayer.容量) { notes.push(`势力「${name}」暂无新名额，旧实体不被挤掉`); continue; }
    factions[name] = 沿用条目(factionLayer, raw, (oldData.势力?.[name] as unknown as Record<string, unknown>)) as unknown as WorldFaction;
  }
  const regions = normalizeLayer(parsed.地域, oldData.地域 ?? {}, 取层('地域').容量, 内容字段键(取层('地域')));
  const trends = normalizeLayer(parsed.大势, oldData.大势 ?? {}, 取层('大势').容量, 内容字段键(取层('大势')));
  const metricLayer = 取层('指标');
  const metrics: Record<string, WorldMetric> = {};
  const metricRaw = options.运转?.世界指标 === false ? oldData.指标 ?? {} : normalizeLayer(parsed.指标, oldData.指标 ?? {}, metricLayer.容量, 内容字段键(metricLayer));
  for (const [name, entry] of Object.entries(metricRaw)) {
    const value = 规范化条目<WorldMetric>(metricLayer, entry);
    if (oldData.指标?.[name]?.值 === value.值) value.趋势 = oldData.指标[name].趋势;
    metrics[name] = value;
  }

  const invalidSeeds = [...(oldData.已失效伏笔 ?? [])];
  const seeds = [...(oldData.伏笔 ?? [])];
  const oldSeeds = new Map(seeds.map(e => [e.标题, e]));
  const seedSeen = new Set<string>();
  for (const raw of parsed.伏笔 ?? []) {
    if (!对象(raw)) continue;
    const name = 文本(raw.标题);
    if (!name || seedSeen.has(name) || invalidSeeds.some(e => e.标题 === name)) continue;
    seedSeen.add(name);
    const old = oldSeeds.get(name);
    const item: WorldSeed = { 标题: name, 埋设: 合并文本(raw.埋设, old?.埋设, '埋设'), 指向: 合并文本(raw.指向, old?.指向, '指向'), 成熟度: pickEnum(raw.成熟度, SEED_MATURITY, old?.成熟度 ?? '酝酿'), 前情: 合并文本(raw.前情, old?.前情, '前情') };
    const 终止原因 = 合并文本(raw.结束原因, old?.结束原因, '结束原因');
    if (终止原因) item.结束原因 = 终止原因;
    const index = seeds.findIndex(e => e.标题 === name);
    if (item.成熟度 === '已爆发' || item.成熟度 === '已消亡') {
      if (!old || !文本(raw.结束原因 ?? raw.变化)) { notes.push(`伏笔「${name}」终止缺少依据，原线头保留`); continue; }
      if (index >= 0) seeds.splice(index, 1);
      invalidSeeds.push(item);
    } else if (index >= 0) seeds[index] = item;
    else if (seeds.length < 取层('伏笔').容量) seeds.push(item);
    else notes.push(`伏笔「${name}」暂无新名额，未替换旧线头`);
  }

  const expired = [...(oldData.已过期节令 ?? [])];
  let occasions = [...(oldData.节令 ?? [])];
  if (options.运转?.节令历法 !== false) {
    const rawMap = new Map<string, Record<string, any>>();
    for (const raw of parsed.节令 ?? []) if (对象(raw) && 文本(raw.名称) && !rawMap.has(文本(raw.名称))) rawMap.set(文本(raw.名称), raw);
    const oldMap = new Map(occasions.map(e => [e.名称, e]));
    for (const [name, raw] of rawMap) {
      const old = oldMap.get(name);
      const item: WorldOccasion = { 名称: name, 周期: 合并文本(raw.周期, old?.周期, '周期'), 时间: 合并文本(raw.时间, old?.时间, '时间'), 概况: 合并文本(raw.概况, old?.概况, '概况') };
      const index = occasions.findIndex(e => e.名称 === name);
      if (index >= 0) {
        if (!item.时间 && old?.时间) item.时间 = old.时间;
        if (!item.周期 && old?.周期) item.周期 = old.周期;
        if (!item.概况 && old?.概况) item.概况 = old.概况;
        occasions[index] = item;
      }
      else if (occasions.length < 取层('节令').容量) occasions.push(item);
      else notes.push(`节令「${name}」暂无新名额，尚未来临的旧节点保持`);
    }
    occasions = occasions.filter(item => {
      const date = 解析日期(item.时间);
      if (!newDate || !date || date.天 >= newDate.天) return true;
      if (item.周期 === '一次性') {
        if (!expired.some(e => e.名称 === item.名称 && e.时间 === item.时间)) expired.push(item);
        return false;
      }
      // 周期项不能永远停在同一个旧日期：到点后按周期顺延到下一次发生时间。
      const 下一 = 下一次节令日期(item.时间, item.周期, newDate.天);
      if (下一) {
        item.时间 = 下一;
        notes.push(`节令「${item.名称}」已过，按周期「${item.周期}」顺延到下一次 ${下一}`);
      }
      else {
        notes.push(`节令「${item.名称}」已过，但周期「${item.周期}」或日期无法按公历解析，保留原写法，请人工确认`);
      }
      return true;
    });
    occasions.sort((a,b) => (解析日期(a.时间)?.天 ?? Infinity) - (解析日期(b.时间)?.天 ?? Infinity));
  }
  return {
    ...oldData,
    世界: { 时间: time, 氛围: 合并文本(parsed.世界.氛围, oldData.世界.氛围, '氛围'), 总览: 合并文本(parsed.世界.总览 ?? parsed.世界.大势, oldData.世界.总览, '总览') },
    地域: regions, 大势: trends, 伏笔: seeds, 节令: occasions, 指标: metrics,
    事件: active, 已了结: ended, 势力: factions,
    小结: 文本(parsed.小结 ?? parsed.小小结),
    已失效伏笔: invalidSeeds, 已过期节令: expired, 维护备注: notes,
  };
}

export function 事件账目(oldEvents: WorldEvent[], newEvents: WorldEvent[]) {
  const identity = (event: WorldEvent) => event.id || `标题:${event.标题}`;
  const oldMap = new Map(oldEvents.map(e => [identity(e), e]));
  const keys = new Set(newEvents.map(identity));
  const added: string[] = [], updated: string[] = [];
  for (const event of newEvents) {
    const old = oldMap.get(identity(event));
    if (!old) added.push(event.标题);
    else if (JSON.stringify(old) !== JSON.stringify(event)) updated.push(event.标题);
  }
  const removed = oldEvents.filter(e => !keys.has(identity(e))).map(e => e.标题);
  return { added, updated, removed };
}
