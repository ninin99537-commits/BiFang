// 剧情导演 · 解析抢救层: 「原始文本 → 导演载荷」只此一份。
// 括号配平切分 / 载荷识别 / 中英键名别名 / 思考字段剥离 + 裸控制字符转义 / 双解析器择优。
// 同源实现见 烟火_世界运转/解析.ts(那边按「世界推进」载荷挑候选); 这里按「导演载荷」挑。
import json5 from 'json5';
import { 去信封 } from '../共用/去信封';

/** 逐个 { 起做括号配平, 返回所有完整的顶层对象候选(按出现顺序) */
function sliceBalancedCandidates(text: string): string[] {
  const out: string[] = [];
  let start = text.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let closed = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          start = text.indexOf('{', i + 1);
          closed = true;
          break;
        }
      }
    }
    if (!closed) break;
  }
  return out;
}

const PAYLOAD_KEYS = ['章回', '伏笔', '冲突', '弧线', '下一幕', '上一幕核验', '上一幕节拍', '张力校正', 'chapter', 'seeds', 'conflicts', 'arcs'];

function looksLikeDirectorPayload(value: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some(key => PAYLOAD_KEYS.includes(key));
}

/** 常见英文键名 → 中文, 避免整轮输出被判"格式不符"丢弃 */
const TOP_KEY_ALIASES: Record<string, string> = {
  chapter: '章回',
  chapters: '章回',
  act: '章回',
  seeds: '伏笔',
  seed: '伏笔',
  foreshadow: '伏笔',
  foreshadows: '伏笔',
  conflicts: '冲突',
  conflict: '冲突',
  arcs: '弧线',
  arc: '弧线',
  character_arcs: '弧线',
  next_act: '下一幕',
  next: '下一幕',
  next_beat: '下一幕',
  verification: '上一幕核验',
  verify: '上一幕核验',
  last_beat: '上一幕节拍',
  tension: '张力校正',
  tension_correction: '张力校正',
};

function remapKeys(value: any, aliases: Record<string, string>): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) out[aliases[key] ?? key] = item;
  return out;
}

const SEED_ALIASES: Record<string, string> = {
  id: '编号',
  content: '内容',
  status: '状态',
  window: '回收窗口',
  recovery_window: '回收窗口',
  conflict: '关联冲突',
};
const CONFLICT_ALIASES: Record<string, string> = {
  name: '名',
  opponent: '对立面',
  stakes: '赌注',
  intensity: '强度',
  stage: '阶段',
  next: '下一步',
};
const ARC_ALIASES: Record<string, string> = {
  character: '角色',
  gap: '缺口',
  stage: '阶段',
  opportunity: '下一步契机',
};
const ACT_ALIASES: Record<string, string> = {
  beat: '节拍',
  requirement: '硬性要求',
  requirements: '硬性要求',
  seeds: '伏笔现场',
  foreshadowing: '伏笔现场',
  forbidden: '禁止事项',
  prohibitions: '禁止事项',
};

function normalizeKeyAliases(parsed: any): any {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(parsed)) out[TOP_KEY_ALIASES[key] ?? key] = value;
  if (out.章回 && typeof out.章回 === 'object' && !Array.isArray(out.章回)) out.章回 = remapKeys(out.章回, { chapter: '章号', theme: '主题', climax: '计划高潮', progress: '进度' });
  for (const section of ['伏笔', '冲突', '弧线']) {
    const list = out[section];
    if (Array.isArray(list)) {
      const aliases = section === '伏笔' ? SEED_ALIASES : section === '冲突' ? CONFLICT_ALIASES : ARC_ALIASES;
      out[section] = list.map(item => remapKeys(item, aliases));
    }
  }
  if (out.下一幕 && typeof out.下一幕 === 'object') out.下一幕 = remapKeys(out.下一幕, ACT_ALIASES);
  return out;
}

const THINKING_FIELD_KEYS = ['静默思考流程', '思考流程', '思考过程', '思维链', '推理过程'];

function escapeRawControlCharsInStrings(text: string): string {
  const src = String(text ?? '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code === 0x0a) out += '\\n';
      else if (code === 0x0d) out += '\\r';
      else if (code === 0x09) out += '\\t';
      else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
      else out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function stripThinkingFields(text: string): string {
  let result = String(text ?? '');
  for (const key of THINKING_FIELD_KEYS) {
    const keyRe = new RegExp(`"${key}"\\s*:`, 'g');
    let match = keyRe.exec(result);
    while (match) {
      const valueStart = keyRe.lastIndex;
      let end = -1;
      let endWithComma = false;
      for (let i = valueStart; i < result.length; i++) {
        if (result[i] === ',') {
          const rest = result.slice(i + 1);
          if (/^\s*\n\s*"/.test(rest)) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) {
        const closeIdx = result.lastIndexOf('}');
        if (closeIdx > valueStart) {
          end = closeIdx;
          endWithComma = true;
        }
      }
      if (end === -1) break;
      const before = result.slice(0, match.index);
      const after = result.slice(end + (endWithComma ? 0 : 1));
      result = before + after.replace(/^\s*/, '');
      keyRe.lastIndex = 0;
      match = keyRe.exec(result);
    }
  }
  return result;
}

/** 失败诊断: 三个计数就能把"真截断"和"字符串状态被打翻"分开 ——
 *  左括号比右括号多 → 接口真砍在半路; 引号是奇数 → 有未转义的 `"` 把后面的 `}` 吞进了字符串。 */
function 括号诊断(text: string): string {
  const 左 = (text.match(/\{/g) ?? []).length;
  const 右 = (text.match(/\}/g) ?? []).length;
  const 引号 = (text.match(/"/g) ?? []).length;
  const 判 = 引号 % 2 ? '(奇数←字符串状态被打翻)' : 左 > 右 ? '(左多←截断)' : '';
  return `诊断: '{' ${左} / '}' ${右} / '"' ${引号}${判}`;
}

function parseModelResponse(content: string): any {
  let text = content.trim();
  const fence = text.match(/^```(?:json|yaml)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  // 上游注入的工具调用信封(emit_complete_response_<nonce>{content:…}): 剥掉它, text 才是原本的载荷
  text = 去信封(text);
  const candidates = sliceBalancedCandidates(text);
  if (candidates.length === 0) {
    throw Error(
      `AI 没有返回 JSON 对象(只输出了文字/推理内容, 或大括号不配平被截断)。\n原始内容(共 ${content.length} 字): ${content.slice(0, 300)}${content.length > 300 ? '……' : ''}\n${括号诊断(content)}`,
    );
  }
  let fallback: any = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const stripped = stripThinkingFields(candidate);
    const variants = [
      ...new Set([
        ...(stripped !== candidate ? [escapeRawControlCharsInStrings(stripped), stripped] : []),
        escapeRawControlCharsInStrings(candidate),
        candidate,
      ]),
    ];
    for (const variant of variants) {
      for (const parse of [(t: string) => JSON.parse(t), (t: string) => json5.parse(t)]) {
        let parsed: any;
        try {
          parsed = parse(variant);
        } catch (error) {
          lastError = error;
          continue;
        }
        const normalized = normalizeKeyAliases(parsed);
        if (looksLikeDirectorPayload(normalized)) return normalized;
        if (fallback === null) fallback = normalized;
      }
    }
  }
  if (fallback !== null) return fallback;
  throw Error(
    `AI 返回的 JSON 不完整或格式错误(已自动重试, 多次失败请调大「最大输出Token」或检查模型)。解析错误: ${lastError instanceof Error ? lastError.message : String(lastError)}\n原始内容(共 ${content.length} 字): ${content.slice(0, 400)}${content.length > 400 ? '……' : ''}`,
    { cause: lastError },
  );
}

export type 解析结果 =
  | { 成功: true; 载荷: any }
  | { 成功: false; 原因: string; 截断: boolean };

/** 唯一入口。解析成功给载荷; 失败给原因。截断 = '{' 比 '}' 多(接口被砍在半路) */
export function 解析导演载荷(原始文本: string): 解析结果 {
  try {
    return { 成功: true, 载荷: parseModelResponse(原始文本) };
  } catch (error) {
    const 截断 = (原始文本.match(/\{/g) ?? []).length > (原始文本.match(/\}/g) ?? []).length;
    return { 成功: false, 原因: error instanceof Error ? error.message : String(error), 截断 };
  }
}
