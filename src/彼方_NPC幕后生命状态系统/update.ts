// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as json5__WEBPACK_IMPORTED_MODULE_0__ from 'json5';
import * as _api__WEBPACK_IMPORTED_MODULE_1__ from './api';
import * as _prompts__WEBPACK_IMPORTED_MODULE_2__ from './prompts';
import * as _settings__WEBPACK_IMPORTED_MODULE_3__ from './settings';
import * as _worldbook__WEBPACK_IMPORTED_MODULE_4__ from './worldbook';
import * as _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__ from './worldbook-inject';
import * as _state__WEBPACK_IMPORTED_MODULE_6__ from './state';

/* harmony export */ 






let isUpdating = false;
const TIME_JUMP_PATTERN = /(一夜之间|第二天一早|第二天|次日|隔天|几天后|数天后|十几天后|一两周后|两周后|几周后|数周后|几个星期后|几个礼拜后|一个月后|两个月后|数月后|几个月后|半年后|一年后|两年后|几年后|数年后|多年后|若干年后)/;
function detectTimeJump(text) {
    const match = text.match(TIME_JUMP_PATTERN);
    return match ? match[0] : null;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripTagContent(text, tag) {
    const escaped = escapeRegExp(tag);
    // \b 只对 ASCII 有效, 中文标签用 (?![a-zA-Z0-9]) 作边界(后面不是 ASCII 字母数字即可)
    const boundary = '(?![a-zA-Z0-9])';
    let result = text.replace(new RegExp(`<${escaped}${boundary}[^>]*>[\\s\\S]*?<\\/${escaped}>`, 'gi'), '');
    result = result.replace(new RegExp(`<${escaped}${boundary}[^>]*\\/?>`, 'gi'), '');
    return result;
}
function extractTagContent(text, tag) {
    const escaped = escapeRegExp(tag);
    const boundary = '(?![a-zA-Z0-9])';
    const matches = [];
    const re = new RegExp(`<${escaped}${boundary}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
        matches.push(match[1].trim());
    }
    return matches;
}
function stripLoneClosingBlocks(text, tag) {
    const escaped = escapeRegExp(tag);
    const boundary = '(?![a-zA-Z0-9])';
    const closeRe = new RegExp(`</${escaped}${boundary}[^>]*>`, 'gi');
    let result = text;
    let match;
    while ((match = closeRe.exec(result)) !== null) {
        const closeEnd = match.index + match[0].length;
        result = result.slice(closeEnd);
        closeRe.lastIndex = 0;
    }
    return result;
}
function createTextFilter(settings) {
    const tags = (settings.标签?.列表 ?? []).map(tag => tag.trim().replace(/^<|>$/g, '')).filter(Boolean);
    // 去掉 begin_of_X ... end_of_X 的思维链整块（标记是注释、内容却是纯文本，需连同内容一起删）；再清理剩余 HTML 注释
    const stripComments = (text) => text
        .replace(/x3c!--\s*begin_of_[a-zA-Z0-9_\u4e00-\u9fa5]+[\s\S]*?end_of_[a-zA-Z0-9_\u4e00-\u9fa5]+\s*--x3e/gi, '')
        .replace(/x3c!--[\s\S]*?--x3e/g, '');
    if (tags.length === 0)
        return stripComments;
    if (settings.标签?.模式 === '只读') {
        return text => {
            const parts = [];
            for (const tag of tags)
                parts.push(...extractTagContent(text, tag));
            return stripComments(parts.join('\n\n') || text);
        };
    }
    return text => stripComments(tags.reduce((acc, tag) => stripLoneClosingBlocks(stripTagContent(acc, tag), tag), text));
}
function isNameMentioned(text, name) {
    const trimmed = name.trim();
    if (!trimmed)
        return false;
    if (trimmed.length >= 2)
        return text.includes(trimmed);
    return new RegExp(`(^|[^\\p{L}])${trimmed}([^\\p{L}]|$)`, 'u').test(text);
}
function collectTrackedNpcs(settings, data) {
    const names = new Set();
    for (const name of data.名单) {
        const trimmed = name.trim();
        if (trimmed)
            names.add(trimmed);
    }
    if (settings.更新.追踪当前角色) {
        try {
            const character = getCharData('current');
            if (character?.name)
                names.add(character.name);
        }
        catch {
            // 未打开角色卡时忽略
        }
    }
    return [...names];
}
function getRecentAssistantMessages(count) {
    try {
        const lastId = getLastMessageId();
        // 只取末尾一小段楼层（足够找到最近 N 条 AI 回复），避免每次更新都拉全量楼层
        const start = Math.max(0, lastId - count * 10);
        const messages = getChatMessages(`${start}-${lastId}`, { role: 'assistant' });
        return messages.filter(message => !message.is_hidden).slice(-count);
    }
    catch {
        return [];
    }
}
function buildContext(replyMessageId, filter, window, replyIds, minId = 0) {
    try {
        const lastId = getLastMessageId();
        const start = Math.max(0, Math.min(replyMessageId, lastId) - window * 2);
        const messages = getChatMessages(`${start}-${lastId}`)
            .filter(message => message.role !== 'system' && !message.is_hidden && message.message_id > minId && !replyIds.has(message.message_id))
            .slice(-window);
        return messages
            .map(message => `${message.role === 'user' ? '玩家' : message.name || 'AI'}: ${filter(message.message).slice(0, 2000)}`)
            .join('\n\n');
    }
    catch {
        return '';
    }
}
function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
}
let allAssistantCache = null;
function getAllAssistantMessages() {
    try {
        const lastId = getLastMessageId();
        if (allAssistantCache && allAssistantCache.lastId === lastId)
            return allAssistantCache.messages;
        if (lastId <= 0)
            return [];
        const messages = getChatMessages(`0-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
        allAssistantCache = { lastId, messages };
        return messages;
    }
    catch {
        return [];
    }
}
function applyRollback(data) {
    try {
        const assistants = getAllAssistantMessages();
        const curCount = assistants.length;
        let changed = false;
        // 楼层被删到清空层以下时，清空层失效，挪到当前楼层末尾，避免更新一直找不到新楼层
        const lastId = getLastMessageId();
        if ((data.清空层 ?? 0) > 0 && lastId < data.清空层) {
            data.清空层 = lastId;
            changed = true;
        }
        if (curCount === 0) {
            if (data.快照.length === 0 && data.已处理层数 === 0 && Object.keys(data.NPC).length === 0 && !changed)
                return false;
            data.名单 = [];
            data.NPC = {};
            data.在场NPC = [];
            data.后台互动 = [];
            data.时间轴 = [];
            data.卡字段计数 = {};
            data.统计 = { 更新次数: 0, 最后更新: 0 };
            data.快照 = [];
            data.已处理层数 = 0;
            data.最后处理摘要 = '';
            return true;
        }
        const curLastHash = hashString(assistants[assistants.length - 1].message);
        let targetLayer = null;
        let rollbackReason = '';
        if (data.已处理层数 > curCount) {
            targetLayer = curCount;
            rollbackReason = `楼层被删除: 彼方已处理 ${data.已处理层数} 层, 当前仅检测到 ${curCount} 层 AI 楼层(lastId=${lastId})`;
        }
        else if (data.已处理层数 === curCount && data.最后处理摘要 && data.最后处理摘要 !== curLastHash) {
            targetLayer = curCount - 1;
            rollbackReason = `最后一条 AI 回复变化(疑似重roll/编辑): 彼方已处理 ${data.已处理层数} 层, 最后处理摘要与当前不一致`;
        }
        if (targetLayer === null)
            return changed;
        console.warn(`[彼方] 自动回退: ${rollbackReason}`);
        _state__WEBPACK_IMPORTED_MODULE_6__.useDebugStore().record({ time: Date.now(), error: `[自动回退] ${rollbackReason}` });
        const snap = [...data.快照].reverse().find(s => s.层数 <= targetLayer);
        if (snap) {
            data.名单 = [...snap.名单];
            data.NPC = _.cloneDeep(snap.NPC);
            data.在场NPC = [...(snap.在场NPC ?? [])];
            data.后台互动 = [...snap.后台互动];
            data.时间轴 = [...(snap.时间轴 ?? [])];
            data.卡字段计数 = _.cloneDeep(snap.卡字段计数 ?? {});
            data.统计 = { ...snap.统计 };
        }
        else if (targetLayer <= 0) {
            data.名单 = [];
            data.NPC = {};
            data.在场NPC = [];
            data.后台互动 = [];
            data.时间轴 = [];
            data.卡字段计数 = {};
            data.统计 = { 更新次数: 0, 最后更新: 0 };
        }
        else {
            // 目标楼层之前没有快照（通常是升级前就有的历史楼层），保留当前状态避免误清
            return changed;
        }
        // 关键: 回滚后同步"已处理层数"到目标层, 并清空摘要——否则下次更新会重复判定"楼层被删"而反复回滚, 永远卡在上一层
        data.已处理层数 = targetLayer;
        data.最后处理摘要 = '';
        data.快照 = data.快照.filter(s => s.层数 <= targetLayer);
        return true;
    }
    catch {
        return false;
    }
}
function maybeRollback() {
    try {
        const data = _state__WEBPACK_IMPORTED_MODULE_6__.loadData();
        if (!applyRollback(data))
            return false;
        _state__WEBPACK_IMPORTED_MODULE_6__.saveData(data);
        _state__WEBPACK_IMPORTED_MODULE_6__.useStateStore().data = data;
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 撤销最新一次彼方更新（"重新填写"用）: 恢复到比当前 AI 楼层数更早的最新快照,
 * 把最新层当作从未填写过。若之后重填失败, 数据保持在此状态, 下次更新会自动重新填写。
 */
function rollbackLatestUpdate() {
    try {
        const data = _state__WEBPACK_IMPORTED_MODULE_6__.loadData();
        const assistants = getAllAssistantMessages();
        const curCount = assistants.length;
        if (curCount <= 0)
            return false;
        const snap = [...data.快照].reverse().find(s => s.层数 < curCount);
        if (!snap)
            return false;
        data.名单 = [...snap.名单];
        data.NPC = _.cloneDeep(snap.NPC);
        data.在场NPC = [...(snap.在场NPC ?? [])];
        data.后台互动 = [...snap.后台互动];
        data.时间轴 = [...(snap.时间轴 ?? [])];
        data.卡字段计数 = _.cloneDeep(snap.卡字段计数 ?? {});
        data.统计 = { ...snap.统计 };
        data.快照 = data.快照.filter(s => s.层数 < curCount);
        data.已处理层数 = snap.层数;
        _state__WEBPACK_IMPORTED_MODULE_6__.saveData(data);
        _state__WEBPACK_IMPORTED_MODULE_6__.useStateStore().data = data;
        return true;
    }
    catch {
        return false;
    }
}
function thinSnapshots(snaps) {
    return snaps.slice(-_state__WEBPACK_IMPORTED_MODULE_6__.SNAPSHOT_LIMIT);
}
function recordSnapshot(data, layer) {
    // 同层(重填/重roll 等不产生新楼层的情况)只保留最新一次快照, 避免连续重填挤掉更早楼层的检查点
    data.快照 = data.快照.filter(snapshot => snapshot.层数 !== layer);
    data.快照.push({
        层数: layer,
        时间: Date.now(),
        名单: [...data.名单],
        NPC: _.cloneDeep(data.NPC),
        在场NPC: [...(data.在场NPC ?? [])],
        后台互动: [...data.后台互动],
        时间轴: [...data.时间轴],
        卡字段计数: _.cloneDeep(data.卡字段计数 ?? {}),
        统计: { ...data.统计 },
    });
    data.快照 = thinSnapshots(data.快照);
}
function parseModelResponse(content) {
    let text = content.trim();
    const fence = text.match(/^```(?:json|yaml)?\s*([\s\S]*?)\s*```$/);
    if (fence)
        text = fence[1].trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) {
        throw Error(`AI 没有返回 JSON 对象（只输出了文字/推理内容）。\n原始内容: ${content.slice(0, 400)}`);
    }
    text = text.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(text);
    }
    catch (jsonError) {
        try {
            // eslint-disable-next-line import-x/no-named-as-default-member
            return json5__WEBPACK_IMPORTED_MODULE_0__["default"].parse(text);
        }
        catch {
            throw Error(`AI 返回的 JSON 不完整或格式错误（已自动重试，多次失败请调大「最大输出Token」或检查模型）。解析错误: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}\n原始内容: ${content.slice(0, 600)}`, { cause: jsonError });
        }
    }
}
function sameNpcSet(a, b) {
    if (a.length !== b.length)
        return false;
    const set = new Set(a);
    return b.every(name => set.has(name));
}
/** 从 AI 原始输出中提取 JSON 部分(去思维链/正文等杂质), 供重试时回喂给 AI 指明格式错误 */
function extractJsonSnippet(content) {
    let text = String(content || '').trim();
    const fence = text.match(/^```(?:json|yaml)?\s*([\s\S]*?)\s*```$/);
    if (fence)
        text = fence[1].trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace)
        return '';
    return text.slice(firstBrace, lastBrace + 1);
}
/** 生理字段(仅当某 NPC 卡里出现了任一生理字段、即被判定为女性时, 才要求全部补全) */
const PHYSIO_FIELDS = ['生理周期', '是否怀孕', '累计受孕率', '当前防护', '近期性行为', '生理结算', '受孕率记录'];
/** 每张被返回的状态卡都必须包含的普通字符串字段(全部字段, 缺一即判定不完整并自动重试) */
const REQUIRED_CARD_FIELDS = _state__WEBPACK_IMPORTED_MODULE_6__.CARD_FIELDS.filter(field => !PHYSIO_FIELDS.includes(field));
/** 校验 AI 输出的 JSON 结构是否符合预期; 结构错误、"新增 NPC 字段不全"、"女性 NPC 生理字段不全"、"剧情时间与正文标注不符"抛错重试, 已有 NPC 缺普通字段只警告(保留旧值) */
function validateParsedFormat(parsed, existingNpcNames = new Set(), existingCards = {}, physioEnabled = false, storyTimeHint = '') {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Error('AI 返回的 JSON 结构不符合预期(顶层不是对象)');
    }
    // 剧情时间校验: 若从正文/时间表提取到了明确时间, AI 的"结束"必须与之相符(±30分钟), 否则判定时间错误并重试
    if (storyTimeHint) {
        const storyTime = parsed['剧情时间'];
        const endText = storyTime && typeof storyTime === 'object' ? String(storyTime['结束'] ?? '') : '';
        if (/^\d{1,2}:\d{1,2}$/.test(storyTimeHint)) {
            // 只有时分(特殊纪年/无标准日期): 只校验 AI "结束"的时分部分
            const endMatch = endText.match(/(\d{1,2}):(\d{1,2})/);
            if (endMatch) {
                const [hintH, hintM] = storyTimeHint.split(':').map(Number);
                const endTs = +endMatch[1] * 60 + +endMatch[2];
                const hintTs = hintH * 60 + hintM;
                if (Math.abs(endTs - hintTs) > 30) {
                    throw Error(`剧情时间错误: 正文标注的当前时刻是 ${storyTimeHint}, 但"剧情时间.结束"写成了 ${endText}, 时分必须与正文标注相符(不许超前或改动)`);
                }
            }
        }
        else {
            const hintTs = parseStoryTime(storyTimeHint);
            const endTs = endText ? parseStoryTime(endText) : null;
            if (hintTs !== null && endTs !== null && Math.abs(endTs - hintTs) > 30 * 60 * 1000) {
                throw Error(`剧情时间错误: 正文/时间表标注的当前时间是 ${storyTimeHint}, 但"剧情时间.结束"写成了 ${endText}, 请修正为正文标注的时间(不许超前或改动)`);
            }
        }
    }
    const raw = parsed['在场NPC'];
    if (typeof raw !== 'undefined' && raw !== null) {
        if (!Array.isArray(raw)) {
            throw Error('"在场NPC" 应为数组, 请按输出格式说明返回');
        }
        for (const item of raw) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                // 对象元素必须含"姓名/名字"字段; 禁止把 NPC 名字用作对象键(如 {"艾莉": {...}})
                const name = String(item['姓名'] ?? item['名字'] ?? '').trim();
                if (!name) {
                    throw Error('"在场NPC" 的对象元素必须含"姓名"字段, 请按输出格式说明返回(禁止把名字用作对象键)');
                }
            }
        }
    }
    const checkCard = (npcName, card, isNew, isInScene) => {
        // 普通字段: 新增 NPC 或 在场 NPC 必须全部补全(抛错重试); 不在场的已有 NPC 缺失只警告(保留旧值)
        const missingNormal = REQUIRED_CARD_FIELDS.filter(field => typeof card?.[field] !== 'string' || !String(card?.[field] ?? '').trim());
        if ((isNew || isInScene) && missingNormal.length > 0) {
            throw Error(`NPC「${npcName}」缺少字段: ${missingNormal.join('、')}, 必须补全所有字段后重新输出`);
        }
        if (missingNormal.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失字段: ${missingNormal.join('、')}(保留旧值)`);
        }
        if ((isNew || isInScene) && !('可能偶遇' in (card ?? {}))) {
            throw Error(`NPC「${npcName}」缺少字段「可能偶遇」, 必须补全所有字段后重新输出`);
        }
        if (!('可能偶遇' in (card ?? {}))) {
            console.warn(`[彼方] NPC「${npcName}」缺失「可能偶遇」(保留旧值)`);
        }
        // 生理字段: 生理监测开启且判定为女性(本卡或旧卡出现过生理字段)时, 全部生理字段缺失即抛错重试
        const cardHasPhysio = PHYSIO_FIELDS.some(field => card?.[field] !== undefined && card?.[field] !== null && String(card?.[field] ?? '').trim() !== '');
        const oldCard = (existingCards ?? {})[npcName];
        const oldHasPhysio = !!oldCard && PHYSIO_FIELDS.some(field => oldCard[field] !== undefined && oldCard[field] !== null && String(oldCard[field] ?? '').trim() !== '');
        const isFemale = cardHasPhysio || (physioEnabled && oldHasPhysio);
        const missingPhysio = PHYSIO_FIELDS.filter(field => card?.[field] === undefined || card?.[field] === null || (typeof card?.[field] === 'string' && !card[field].trim()));
        if (physioEnabled && isFemale && missingPhysio.length > 0) {
            throw Error(`NPC「${npcName}」缺少生理字段: ${missingPhysio.join('、')}, 必须补全后重新输出`);
        }
        if (cardHasPhysio && missingPhysio.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失生理字段: ${missingPhysio.join('、')}(保留旧值)`);
        }
    };
    for (const [name, card] of Object.entries(parsed)) {
        if (name === '在场NPC' || name === '后台互动' || name === '移除NPC' || name === '剧情时间')
            continue;
        if (card && typeof card === 'object' && !Array.isArray(card))
            checkCard(name, card, !existingNpcNames.has(name), false);
    }
    if (Array.isArray(raw)) {
        for (const item of raw) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const name = String(item['姓名'] ?? item['名字'] ?? '').trim();
                if (name)
                    checkCard(name, item, !existingNpcNames.has(name), true);
            }
        }
    }
}
/** 脱敏接口地址(隐藏地址中可能携带的 token/key 查询参数), 用于错误日志 */
function maskBaseUrl(url) {
    const value = String(url || '').trim();
    return value.replace(/([?&](?:key|token|api_key|apiKey|apikey)=)[^&]*/gi, '$1***');
}
/** 从世界书/正文/上下文中提取明确标注的"当前时间"(如全局时间表的"当前时间"列、<time_format> 的 time 行), 作为剧情时间的参考提示 */
function extractCurrentTimeHint(worldbook, reply, context) {
    const pad = (n) => String(n).padStart(2, '0');
    // 正文时间**只从 reply(最近回复)里提取**——worldbook/context 含彼方自己写的
    // "当前时间"固定标签(会干扰), 且拼接在 reply 之后, 取"最后一次"会取到它们。
    // reply 拼接顺序是"较早回复在前、最新回复在后", 最新正文在末尾, 取 reply 内最后一次出现的时间。
    const extractFrom = (text) => {
        if (!text)
            return '';
        // 1. 明确的"当前时间"标签(时间表列), 取最后一次出现
        for (const pattern of [/当前时间[^\d]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g, /现在(?:是|为)?[^\d]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g]) {
            const matches = [...text.matchAll(pattern)];
            if (matches.length > 0)
                return matches[matches.length - 1][1].replace(/[/.]/g, '-');
        }
        // 2. 中文格式: 2025年11月15日 ... 19:20-19:25 (时间段取结束时刻), 取最后一次
        const cnRe = /(\d{4})年(\d{1,2})月(\d{1,2})日[^\n]*?(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/g;
        const cnMatches = [...text.matchAll(cnRe)];
        if (cnMatches.length > 0) {
            const [, y, mo, d, h1, m1, h2, m2] = cnMatches[cnMatches.length - 1];
            const h = h2 ?? h1;
            const m = m2 ?? m1;
            return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(m)}`;
        }
        // 3. 数字格式(日期+时间), 取最后一次
        const numericRe = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g;
        const numericMatches = [...text.matchAll(numericRe)];
        if (numericMatches.length > 0)
            return numericMatches[numericMatches.length - 1][1].replace(/[/.]/g, '-');
        // 4. 特殊纪年/无标准日期的时间标注: "time:" 行取最后一行, 时间段取结束时刻
        const timeLines = [...text.matchAll(/time:([^\n]*)/gi)].map(match => match[1]);
        const timeLine = timeLines[timeLines.length - 1];
        if (timeLine) {
            const hm = timeLine.match(/(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/);
            if (hm) {
                const [, h1, m1, h2, m2] = hm;
                const h = h2 ?? h1;
                const m = m2 ?? m1;
                return `${pad(h)}:${pad(m)}`;
            }
        }
        // 5. 备选: 任意 "☆" 标注后的时分(时间段取结束时刻), 取最后一次
        const hm2Re = /☆[^\n]{0,80}?(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/g;
        const hm2Matches = [...text.matchAll(hm2Re)];
        if (hm2Matches.length > 0) {
            const [, h1, m1, h2, m2] = hm2Matches[hm2Matches.length - 1];
            const h = h2 ?? h1;
            const m = m2 ?? m1;
            return `${pad(h)}:${pad(m)}`;
        }
        return '';
    };
    // 优先 reply(最新正文), 其次 context(最近剧情上下文), 最后 worldbook(世界书)
    const fromReply = extractFrom(reply);
    if (fromReply)
        return fromReply;
    const fromContext = extractFrom(context);
    if (fromContext)
        return fromContext;
    return extractFrom(worldbook);
}
function mergeCard(oldCard, update, storyTimeText = '') {
    const merged = { ...(oldCard ?? {}) };
    // 剧情时间只用于时间轴展示(独立记录), 不再写入状态卡; 顺带清理旧数据残留
    delete merged['剧情时间'];
    for (const key of _state__WEBPACK_IMPORTED_MODULE_6__.CARD_FIELDS) {
        const value = update[key];
        if (typeof value === 'string' && value.trim()) {
            // 生活状态: AI 若写了"今天/昨天 HH:mm"等相对时间, 用本次剧情时间补全为带日期格式
            merged[key] = key === '生活状态' ? withStoryDate(value.trim(), storyTimeText) : value.trim();
        }
    }
    if ('可能偶遇' in update) {
        const raw = update['可能偶遇'];
        merged['可能偶遇'] = typeof raw === 'boolean' ? raw : raw === 'true' || raw === '是' || raw === '会';
    }
    merged['最后更新'] = Date.now();
    return merged;
}

/**
 * 把生活状态里的相对时间("今天18:45"/"今天18点45"/"昨天15:30"等)补全为**剧情日期**。
 * 剧情日期取自本次更新的剧情时间文本(storyTimeText, 形如 "2026-08-15 18:41 至 2026-08-15 18:48"),
 * 取结束时刻所在日期作为"今天", 前一天作为"昨天"。
 */
function withStoryDate(text, storyTimeText) {
    if (!text || !storyTimeText)
        return text;
    // 从剧情时间文本里提取日期(取最后一个出现的 YYYY-MM-DD, 通常为结束时刻)
    const dates = String(storyTimeText).match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g);
    if (!dates || dates.length === 0)
        return text;
    const lastDate = dates[dates.length - 1].replace(/[./]/g, '-');
    const parts = lastDate.split('-');
    const today = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    // 昨天 = 剧情日期 - 1 天
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return String(text)
        .replace(/今天\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/g, `${today} $1:$2`)
        .replace(/今天\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/g, (_, h, m) => `${today} ${h}:${m ? m.padStart(2, '0') : '00'}`)
        .replace(/昨天\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/g, `${yesterday} $1:$2`)
        .replace(/昨天\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/g, (_, h, m) => `${yesterday} ${h}:${m ? m.padStart(2, '0') : '00'}`);
}
/** 解析剧情时间为时间戳（支持 YYYY-MM-DD HH:mm、YYYY.MM.DD HH:mm、YYYY/MM/DD 等，分钟可省略） */
function parseStoryTime(text) {
    const t = text.trim().replace(/[./]/g, '-');
    const match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
    if (!match)
        return null;
    const [, year, month, day, hour, minute] = match;
    const ts = new Date(+year, +month - 1, +day, +(hour ?? 0), +(minute ?? 0)).getTime();
    return Number.isNaN(ts) ? null : ts;
}
/** 时间戳格式化为 "YYYY-MM-DD HH:mm" */
function fmtStoryTime(ts) {
    const date = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 解析 AI 返回的"剧情时间"（兼容字符串或 {开始, 结束} 对象）为起止时间戳 */
function parseStoryTimeRange(raw) {
    if (typeof raw === 'string') {
        const text = raw.trim();
        const ts = text ? parseStoryTime(text) : null;
        return { text, startTs: ts, endTs: ts };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const start = String(raw['开始'] ?? '').trim();
        const end = String(raw['结束'] ?? '').trim();
        const text = start && end && start !== end ? `${start} 至 ${end}` : end || start;
        return { text, startTs: parseStoryTime(start), endTs: parseStoryTime(end) };
    }
    return { text: '', startTs: null, endTs: null };
}
/**
 * 为本次更新的条目分配剧情时间（均匀分布在 [开始, 结束] 时间段内, 不超出剧情时间范围）:
 * - 顺序(早→晚): 不在场 NPC 卡 → 在场 NPC 卡(最新, 贴近结束时刻), 互动紧随其后
 * - 时间跳跃(开始=结束)或时间不可解析: 全部统一写剧情时间
 * 返回与 orderedNames 和 interactions 一一对应的分配结果, 供时间轴记录使用(不写入状态卡)
 */
function assignStoryTimes(names, interactions, inSceneNames, startTs, endTs, storyTimeText, timeJump) {
    if (!storyTimeText)
        return { orderedNames: [], times: [] };
    const inSceneSet = new Set(inSceneNames);
    const orderedNames = [
        ...names.filter(name => !inSceneSet.has(name)),
        ...names.filter(name => inSceneSet.has(name)),
    ];
    const total = orderedNames.length + interactions.length;
    if (total === 0)
        return { orderedNames, times: [] };
    const canSpread = startTs !== null && endTs !== null && endTs > startTs && !timeJump;
    const span = canSpread ? endTs - startTs : 0;
    const times = [];
    for (let i = 0; i < total; i++) {
        if (canSpread && total > 1) {
            times.push(fmtStoryTime(startTs + Math.round((span * i) / (total - 1))));
        }
        else if (canSpread) {
            times.push(fmtStoryTime(endTs));
        }
        else {
            times.push(storyTimeText);
        }
    }
    return { orderedNames, times };
}
function applyUpdate(data, parsed, timeJump = null, playerName = null) {
    const newData = {
        ...data,
        名单: [...data.名单],
        NPC: _.cloneDeep(data.NPC),
        在场NPC: [...(data.在场NPC ?? [])],
        后台互动: [...data.后台互动],
        时间轴: [...data.时间轴],
        卡字段计数: _.cloneDeep(data.卡字段计数 ?? {}),
        统计: { ...data.统计 },
        快照: [...data.快照],
    };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return newData;
    const storyRange = parseStoryTimeRange(parsed['剧情时间']);
    const storyTimeText = storyRange.text;
    if (storyTimeText)
        newData.剧情时间 = storyTimeText;
    // 解析"在场NPC"（兼容三种格式: 名字字符串数组 / [{姓名, ...卡字段}] / [{"NPC名": {...卡字段}}]）; 对象形式一并合并卡
    const inSceneList = [];
    const inSceneCardNames = [];
    if (typeof parsed['在场NPC'] !== 'undefined') {
        const raw = parsed['在场NPC'];
        if (Array.isArray(raw)) {
            for (const item of raw) {
                if (typeof item === 'string') {
                    const name = item.trim();
                    // 主角不计入在场名单
                    if (name && name !== playerName && !inSceneList.includes(name))
                        inSceneList.push(name);
                }
                else if (item && typeof item === 'object' && !Array.isArray(item)) {
                    // 优先取 "姓名/名字" 字段; 没有则把对象里第一个键当作 NPC 名, 其值为状态卡
                    let name = String(item['姓名'] ?? item['名字'] ?? '').trim();
                    let card = item;
                    if (!name) {
                        const first = Object.entries(item).find(([key, value]) => key !== '姓名' && key !== '名字' && value && typeof value === 'object');
                        if (first) {
                            name = String(first[0]).trim();
                            card = first[1];
                        }
                    }
                    if (name && name !== playerName) {
                        if (!inSceneList.includes(name))
                            inSceneList.push(name);
                        newData.NPC[name] = mergeCard(newData.NPC[name], card, storyTimeText);
                        inSceneCardNames.push(name);
                    }
                }
            }
        }
        // 记录最近一次更新时在场的名单，供注入主 AI 时区分在场/不在场措辞
        newData.在场NPC = inSceneList;
    }
    let npcUpdates;
    if (typeof parsed['NPC'] === 'object' && parsed['NPC'] !== null && !Array.isArray(parsed['NPC'])) {
        npcUpdates = parsed['NPC'];
    }
    else {
        npcUpdates = { ...parsed };
        delete npcUpdates['在场NPC'];
        delete npcUpdates['后台互动'];
        delete npcUpdates['剧情时间'];
    }
    const updatedNames = [];
    for (const [name, card] of Object.entries(npcUpdates)) {
        if (name === '在场NPC' || name === '后台互动' || typeof card !== 'object' || card === null || Array.isArray(card))
            continue;
        // 主角: 跳过合并, 并清理误建的主角卡/名单项
        if (playerName && name === playerName) {
            delete newData.NPC[name];
            newData.名单 = newData.名单.filter(n => n !== name);
            continue;
        }
        // 在场 NPC 只按"在场NPC"数组中的版本合并一次, 顶层(幕后)跳过, 避免同一 NPC 双重更新/互相覆盖
        if (inSceneList.includes(name))
            continue;
        newData.NPC[name] = mergeCard(newData.NPC[name], card, storyTimeText);
        updatedNames.push(name);
        if (!newData.名单.includes(name))
            newData.名单.push(name);
    }
    for (const name of inSceneCardNames) {
        if (!updatedNames.includes(name))
            updatedNames.push(name);
        if (!newData.名单.includes(name))
            newData.名单.push(name);
    }
    for (const name of inSceneList) {
        if (!newData.名单.includes(name))
            newData.名单.push(name);
    }
    const removedNpcs = [];
    if (typeof parsed['移除NPC'] !== 'undefined') {
        removedNpcs.push(...(Array.isArray(parsed['移除NPC']) ? parsed['移除NPC'].map(String).filter(Boolean) : []));
    }
    for (const name of removedNpcs) {
        delete newData.NPC[name];
        delete newData.卡字段计数[name];
    }
    if (removedNpcs.length > 0) {
        newData.名单 = newData.名单.filter(name => !removedNpcs.includes(name));
    }
    // 后台互动按"当前仍在进行"整体替换：AI 返回的清单即当前有效互动，已结束的自然消失；返回空数组则清空
    if (Array.isArray(parsed['后台互动'])) {
        const prevList = newData.后台互动;
        const newList = [];
        for (const item of parsed['后台互动']) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const npcList = Array.isArray(item['NPC']) ? item['NPC'].map(String).filter(Boolean) : [];
                const eventText = String(item['事件'] ?? '').trim();
                if (npcList.length > 0 && eventText) {
                    // 同一组 NPC 的互动延续上一轮, 自动递增"已持续轮次", 供提示词引导 AI 推进进展而不是重新开始
                    const prev = prevList.find(interaction => sameNpcSet(interaction.NPC, npcList));
                    const rounds = (prev?.轮次 ?? 0) + 1;
                    newList.unshift({
                        // 时间用**剧情时间**(结束时刻), 不用现实时间——后台互动发生在剧情里
                        时间: storyRange.endTs ? fmtStoryTime(storyRange.endTs) : (storyTimeText || new Date().toLocaleString()),
                        NPC: npcList,
                        事件: eventText,
                        轮次: rounds,
                    });
                }
            }
        }
        newData.后台互动 = newList.slice(0, 30);
    }
    // 分配剧情时间并写入时间轴记录（均匀分布在 [开始, 结束] 内, 在场角色贴近结束时刻）
    const newInteractions = newData.后台互动;
    const { orderedNames, times } = assignStoryTimes(updatedNames, newInteractions, inSceneList, storyRange.startTs, storyRange.endTs, storyTimeText, timeJump);
    if (times.length > 0) {
        const now = Date.now();
        const entries = [];
        orderedNames.forEach((name, i) => {
            const card = newData.NPC[name];
            entries.push({
                时间: now,
                剧情时间: times[i],
                标题: name,
                描述: card['当前在做'] || card['最近变化'] || '状态更新',
                类型: '状态',
            });
        });
        [...newInteractions].reverse().forEach((item, j) => {
            entries.push({
                时间: now,
                剧情时间: times[orderedNames.length + j],
                标题: item.NPC.join(' × '),
                描述: item.事件,
                类型: '互动',
            });
        });
        // 时间轴只保留最近 5 次更新的内容(同一次更新内多条条目时间戳相同, 按批次去重), 超出删除最早的
        const merged = [...entries, ...newData.时间轴];
        const keptTimes = [];
        const kept = [];
        for (const entry of merged) {
            if (!keptTimes.includes(entry.时间)) {
                if (keptTimes.length >= 5)
                    break;
                keptTimes.push(entry.时间);
            }
            kept.push(entry);
        }
        newData.时间轴 = kept;
    }
    // 更新"字段未变化计数": 比较本轮合并后与上一轮的差异——没变化的字段 +1(最多5), 变化的重置为0(生理字段与可能偶遇不参与)
    const stagnationFields = _state__WEBPACK_IMPORTED_MODULE_6__.CARD_FIELDS.filter(field => !PHYSIO_FIELDS.includes(field));
    const newCounts = {};
    for (const [name, newCard] of Object.entries(newData.NPC)) {
        const oldCard = (data.NPC ?? {})[name];
        const prev = data.卡字段计数?.[name] ?? {};
        const counts = {};
        for (const field of stagnationFields) {
            const oldVal = oldCard ? String(oldCard[field] ?? '') : '';
            const newVal = String(newCard[field] ?? '');
            if (!oldCard) {
                counts[field] = 0;
            }
            else if (newVal === oldVal) {
                counts[field] = Math.min((prev[field] ?? 0) + 1, 5);
            }
            else {
                counts[field] = 0;
            }
        }
        newCounts[name] = counts;
    }
    newData.卡字段计数 = newCounts;
    newData.统计.更新次数 = (newData.统计.更新次数 ?? 0) + 1;
    newData.统计.最后更新 = Date.now();
    return newData;
}
async function updateNpcStates(force = false, fresh = false) {
    if (isUpdating) {
        console.warn('[彼方] 上一次更新尚未完成, 已跳过本次更新');
        return;
    }
    isUpdating = true;
    const debugStore = _state__WEBPACK_IMPORTED_MODULE_6__.useDebugStore();
    const updatingStore = _state__WEBPACK_IMPORTED_MODULE_6__.useUpdatingStore();
    const abortSignal = updatingStore.start('正在分析最近楼层…', '幕后');
    let parsed = null;
    let parseError = null;
    try {
        const settings = _settings__WEBPACK_IMPORTED_MODULE_3__.getSettings();
        const { 地址, 模型 } = settings.接口;
        if (!地址 || !模型) {
            toastr.warning('彼方: 尚未配置接口地址或模型, 请先在设置中完成配置', '彼方');
            return;
        }
        maybeRollback();
        let data = _state__WEBPACK_IMPORTED_MODULE_6__.loadData();
        // 获取玩家/主角名, 避免给主角建档; 顺带清理历史误建的主角卡
        let playerName = null;
        try {
            playerName = getCurrentPersonaName();
        }
        catch {
            playerName = null;
        }
        if (playerName && data.NPC[playerName]) {
            delete data.NPC[playerName];
            data.名单 = data.名单.filter(name => name !== playerName);
        }
        if (fresh || (force && data.已处理层数 >= getAllAssistantMessages().length)) {
            // 手动更新: 若最新层已更新过, 先撤销最新一次更新(回滚到上一层快照)再重新填写(避免基于不满意的结果继续);
            // 若最新层尚未更新过, 则无需撤销直接填写。fresh 参数保留兼容(同语义)。
            if (rollbackLatestUpdate()) {
                data = _state__WEBPACK_IMPORTED_MODULE_6__.loadData();
            }
        }
        const tracked = collectTrackedNpcs(settings, data);
        const recentCount = Math.max(1, settings.更新.读取最近回复数 ?? 3);
        const clearLayer = data.清空层 ?? 0;
        // 自动更新只分析清空之后的楼层；手动更新(force)强制分析最近 N 条
        let recent = getRecentAssistantMessages(recentCount);
        if (!force)
            recent = recent.filter(message => message.message_id > clearLayer);
        if (recent.length === 0) {
            if (force) {
                toastr.warning('彼方: 没有可分析的AI回复（请确认已生成至少一条AI回复）', '彼方');
            }
            else {
                console.warn('[彼方] 未找到新的AI回复(清空后或仅剩旧楼层), 跳过本次更新');
            }
            return;
        }
        const filter = createTextFilter(settings);
        // 标注每条回复的顺序，最后一条为【最新回复】，让 AI 明确当前场景以最新一条为准
        const reply = recent
            .map((message, index) => `【${index === recent.length - 1 ? '最新回复' : `较早回复 ${index + 1}`}】\n${filter(message.message)}`)
            .join('\n\n');
        const timeJump = detectTimeJump(reply);
        const inSceneHint = tracked.filter(name => recent.some(message => isNameMentioned(message.message, name)));
        const replyIds = new Set(recent.map(message => message.message_id));
        // 手动更新(force)连上下文一起完整分析（含清空前的用户输入）；自动更新才受清空层约束
        // 「最近剧情」上下文只取最新 1 层用户输入（正文仍按「读取最近 N 条」）
        const context = buildContext(recent[recent.length - 1].message_id, filter, 1, replyIds, force ? 0 : clearLayer);
        const worldbook = settings.更新.注入世界书
            ? await _worldbook__WEBPACK_IMPORTED_MODULE_4__.getActiveWorldbookText([context, reply].filter(Boolean).join('\n\n'), settings.更新.注入世界书上限, settings.更新.注入世界书条数)
            : '';
        const storyTimeHint = extractCurrentTimeHint(worldbook, reply, context);
        const currentCards = {};
        // 无论是否重填都发送现有状态卡: 重填时它们作为"旧卡参考"传给 AI, 保证角色设定连续, 但要求 AI 忽略具体状态从零重填
        for (const name of tracked) {
            if (data.NPC[name])
                currentCards[name] = data.NPC[name];
        }
        const messages = _prompts__WEBPACK_IMPORTED_MODULE_2__.buildUpdateMessages({
            reply,
            replyCount: recent.length,
            context,
            timeJump,
            tracked,
            inSceneHint,
            currentCards,
            interactions: data.后台互动 ?? [],
            interactionsEnabled: settings.更新.后台互动,
            physioEnabled: settings.更新.生理监测,
            worldbook,
            currentStoryTime: data.剧情时间,
            storyTimeHint,
            cardStagnation: data.卡字段计数,
            playerName,
            自定义提示词: settings.更新.自定义提示词 ?? [],
        });
        debugStore.record({
            time: Date.now(),
            model: settings.接口.模型,
            replyIds: recent.map(message => message.message_id),
            replyPreview: reply.slice(0, 150),
            request: messages
                .map(message => `【${message.role === 'system' ? '系统指令' : message.role === 'user' ? '用户' : '助手'}】\n${message.content}`)
                .join('\n\n────────\n\n'),
        });
        console.info(`[彼方] 开始更新幕后NPC状态 (使用最近 ${recent.length} 条回复: #${recent.map(message => message.message_id).join(', #')})`);
        // JSON 解析失败或结构不符合预期时自动重试（最多 3 次）; 重试时把上次的错误输出和原因回喂给 AI, 让它知道格式错在哪
        let content = '';
        let lastErrorReason = '';
        let lastErrorOutput = '';
        for (let attempt = 1; attempt <= 3; attempt++) {
            const attemptMessages = attempt === 1 || !lastErrorOutput
                ? messages
                : [
                    ...messages.slice(0, -1),
                    {
                        role: 'user',
                        content: `${messages[messages.length - 1].content}\n\n【上次输出不符合要求, 请根据错误原因修正后重新输出】\n错误原因: ${lastErrorReason}\n上次输出(仅 JSON 部分):\n\`\`\`json\n${lastErrorOutput}\n\`\`\``,
                    },
                ];
            content = await _api__WEBPACK_IMPORTED_MODULE_1__.chatCompletion(attemptMessages, { signal: abortSignal });
            debugStore.record({ time: Date.now(), response: content });
            try {
                parsed = parseModelResponse(content);
                validateParsedFormat(parsed, new Set(Object.keys(data.NPC ?? {})), data.NPC ?? {}, settings.更新.生理监测, storyTimeHint);
                break;
            }
            catch (error) {
                parsed = null;
                parseError = error instanceof Error ? error : Error(String(error));
                lastErrorReason = parseError.message;
                // 每次失败都记录原因到日志页, 便于排查(不再等 3 次都失败才输出)
                debugStore.record({ time: Date.now(), error: `更新失败(第 ${attempt}/3 次): ${parseError.message}` });
                // 只回喂 JSON 部分, 不带思维链/正文等杂质
                const jsonSnippet = extractJsonSnippet(content);
                lastErrorOutput = jsonSnippet
                    ? jsonSnippet.length > 3000
                        ? `${jsonSnippet.slice(0, 3000)}\n…(过长已截断)`
                        : jsonSnippet
                    : '（上次输出中未找到可解析的 JSON 结构）';
                if (attempt < 3 && !abortSignal.aborted) {
                    const errMsg = parseError.message ?? '';
                    const reason = errMsg.includes('缺少必返字段')
                        ? 'AI 输出缺少必填字段'
                        : errMsg.includes('JSON') || errMsg.includes('解析')
                            ? 'AI 返回的 JSON 不完整'
                            : 'AI 返回格式不符合要求';
                    updatingStore.message = `正在重试（${attempt}/3）：${reason}`;
                    console.warn(`[彼方] ${reason}(第 ${attempt} 次)，正在重试…`);
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            }
        }
        if (parsed === null) {
            throw parseError ?? Error('解析失败');
        }
        const newData = applyUpdate(data, parsed, timeJump, playerName);
        const updatedNpcs = [];
        const removedNpcs = [];
        if (parsed && typeof parsed === 'object') {
            for (const [name, card] of Object.entries(parsed)) {
                if (name === '后台互动')
                    continue;
                if (name === '移除NPC') {
                    if (Array.isArray(card))
                        removedNpcs.push(...card.map(String));
                    continue;
                }
                if (name === '在场NPC') {
                    if (Array.isArray(card)) {
                        for (const item of card) {
                            if (typeof item === 'string') {
                                updatedNpcs.push(item);
                            }
                            else if (item && typeof item === 'object' && !Array.isArray(item)) {
                                const n = String(item['姓名'] ?? item['名字'] ?? '').trim();
                                if (n) {
                                    updatedNpcs.push(n);
                                }
                                else {
                                    const first = Object.entries(item).find(([, v]) => v && typeof v === 'object');
                                    if (first)
                                        updatedNpcs.push(String(first[0]));
                                }
                            }
                        }
                    }
                    continue;
                }
                if (card && typeof card === 'object')
                    updatedNpcs.push(name);
            }
        }
        debugStore.record({ time: Date.now(), updatedNpcs, removedNpcs });
        const assistantCount = getAllAssistantMessages().length;
        recordSnapshot(newData, assistantCount);
        newData.已处理层数 = assistantCount;
        newData.最后处理摘要 = hashString(recent[recent.length - 1].message);
        // 清空层只在清空后的首次更新生效（防旧NPC复活），之后恢复正常分析最近 N 楼
        newData.清空层 = 0;
        const stateStore = _state__WEBPACK_IMPORTED_MODULE_6__.useStateStore();
        stateStore.data = newData;
        stateStore.save();
        // 同步幕后状态到角色卡主世界书(蓝灯常驻条目), 供主AI与数据库剧情推进读取
        if (settings.更新.注入世界书条目) {
            _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__.syncNpcStatesWorldbook(newData, true).catch(error => {
                console.error('[彼方] 同步世界书条目失败:', error);
            });
        }
        console.info(`[彼方] 幕后NPC状态更新完成: ${updatedNpcs.join('、') || '(本次无重要NPC变化)'}${removedNpcs.length > 0 ? `; 已移除: ${removedNpcs.join('、')}` : ''}`);
        toastr.success(updatedNpcs.length > 0
            ? `彼方: 已更新 ${updatedNpcs.length} 个NPC的幕后状态${removedNpcs.length > 0 ? `，移除 ${removedNpcs.length} 个NPC` : ''}`
            : removedNpcs.length > 0
                ? `彼方: 已移除 ${removedNpcs.length} 个NPC`
                : '彼方: 本次没有重要NPC的幕后状态变化', '彼方');
    }
    catch (error) {
        if (abortSignal.aborted) {
            const message = '更新已中断';
            debugStore.record({ time: Date.now(), error: message });
            toastr.info(`彼方: ${message}`, '彼方');
            return;
        }
        console.error('[彼方] 更新失败:', error);
        const settingsNow = _settings__WEBPACK_IMPORTED_MODULE_3__.getSettings();
        const stack = error instanceof Error ? (error.stack ?? '') : '';
        const message = error instanceof Error ? error.message : String(error);
        const detail = [
            '[彼方] 更新失败',
            `阶段: ${parseError && parsed === null ? 'JSON 解析' : '接口调用/其他'}`,
            `接口: ${maskBaseUrl(settingsNow.接口.地址) || '(未填)'} / 模型: ${settingsNow.接口.模型 || '(未选)'} / 最大token: ${settingsNow.接口.最大token} / 服务端转发: ${settingsNow.接口.服务端转发 ? '开' : '关'}`,
            `错误: ${message}`,
            ...(stack ? ['堆栈:', stack] : []),
        ].join('\n');
        debugStore.record({ time: Date.now(), error: detail });
        toastr.error(message, '彼方更新失败');
    }
    finally {
        isUpdating = false;
        updatingStore.stop('幕后');
    }
}

export { detectTimeJump, maybeRollback, rollbackLatestUpdate, updateNpcStates };
