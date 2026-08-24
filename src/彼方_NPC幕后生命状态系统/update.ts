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
    // 边界排除 ASCII 字母/数字/下划线/连字符: \b 只对 ASCII 有效, 中文标签需自定边界;
    // 必须排除 _ 和 -, 否则标签 "summary" 会误匹配 "<summary_format>"(下划线不算字母数字),
    // 导致 summary_format 块被当作 summary 误删
    const boundary = '(?![a-zA-Z0-9_-])';
    let result = text.replace(new RegExp(`<${escaped}${boundary}[^>]*>[\\s\\S]*?<\\/${escaped}>`, 'gi'), '');
    result = result.replace(new RegExp(`<${escaped}${boundary}[^>]*\\/?>`, 'gi'), '');
    return result;
}
function extractTagContent(text, tag) {
    const escaped = escapeRegExp(tag);
    const boundary = '(?![a-zA-Z0-9_-])';
    const matches = [];
    const re = new RegExp(`<${escaped}${boundary}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
        matches.push(match[1].trim());
    }
    return matches;
}
/**
 * 清除"孤立闭合标签"(只有 </tag> 没有配对 <tag> 的残留)。
 * **只删除闭合标签本身, 绝不从文本开头删到它**——否则正文里若出现某个过滤标签的
 * 孤立闭合(如模型残留 </summary_format> 或正文合法出现的 </xxx>), 会把整段正文删光。
 * (旧逻辑"从楼层开头删到闭合标签"针对无开标签的思维链, 但误伤正文, 已废弃)
 */
function stripLoneClosingBlocks(text, tag) {
    const escaped = escapeRegExp(tag);
    const boundary = '(?![a-zA-Z0-9_-])';
    const closeRe = new RegExp(`</${escaped}${boundary}[^>]*>`, 'gi');
    return text.replace(closeRe, '');
}
function createTextFilter(settings) {
    const tags = (settings.标签?.列表 ?? []).map(tag => tag.trim().replace(/^<|>$/g, '')).filter(Boolean);
    // 去掉 begin_of_X ... end_of_X 的思维链整块（标记是注释、内容却是纯文本，需连同内容一起删）；再清理剩余 HTML 注释
    // (正文中的创作注释如 <!-- 模拟段落 -->/<!-- 草稿优化 --> 等一律删除; 无论标签模式是排除还是只读都删)
    const stripComments = (text) => text
        .replace(/<!--\s*begin_of_[a-zA-Z0-9_\u4e00-\u9fa5]+[\s\S]*?end_of_[a-zA-Z0-9_\u4e00-\u9fa5]+\s*-->/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
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
            console.warn(`[彼方] 自动回退: 楼层全部删除(当前AI楼层=0), 清空所有NPC数据`);
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
        if (targetLayer === null) {
            // 不触发回滚也留个日志, 方便排查"没回滚/回滚错"的情况
            console.info(`[彼方] 回滚检查: 未触发. 已处理层=${data.已处理层数} 当前AI层=${curCount} lastId=${lastId} 摘要非空=${!!data.最后处理摘要} 摘要一致=${data.最后处理摘要 === curLastHash} 快照层=[${(data.快照 || []).map(s => s.层数).join(',')}]`);
            return changed;
        }
        console.warn(`[彼方] 自动回退: ${rollbackReason} (快照层=${(data.快照 || []).map(s => s.层数).join(',')} 目标层=${targetLayer} 已处理=${data.已处理层数} 当前=${curCount} lastId=${lastId})`);
        _state__WEBPACK_IMPORTED_MODULE_6__.useDebugStore().record({ time: Date.now(), error: `[自动回退] ${rollbackReason} (目标层=${targetLayer})` });
        const snap = [...data.快照].reverse().find(s => s.层数 <= targetLayer);
        if (snap) {
            console.info(`[彼方] 回滚执行: 命中快照层=${snap.层数} (目标层=${targetLayer}), 恢复NPC=${Object.keys(snap.NPC ?? {}).length}个 名单=[${(snap.名单 ?? []).join(',')}]`);
            data.名单 = [...snap.名单];
            data.NPC = _.cloneDeep(snap.NPC);
            data.在场NPC = [...(snap.在场NPC ?? [])];
            data.后台互动 = [...snap.后台互动];
            data.时间轴 = [...(snap.时间轴 ?? [])];
            data.卡字段计数 = _.cloneDeep(snap.卡字段计数 ?? {});
            data.统计 = { ...snap.统计 };
        }
        else if (targetLayer <= 0) {
            console.warn(`[彼方] 回滚执行: 目标层<=0 且无快照, 清空所有NPC数据`);
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
            console.warn(`[彼方] 回滚跳过: 目标层=${targetLayer} 之前没有可用快照, 保留当前状态`);
            return changed;
        }
        // 关键: 回滚后同步"已处理层数"到目标层, 并清空摘要——否则下次更新会重复判定"楼层被删"而反复回滚, 永远卡在上一层
        data.已处理层数 = targetLayer;
        data.最后处理摘要 = '';
        data.快照 = data.快照.filter(s => s.层数 <= targetLayer);
        console.info(`[彼方] 回滚完成: 已处理层数=${data.已处理层数}, 剩余快照层=[${data.快照.map(s => s.层数).join(',')}]`);
        return true;
    }
    catch {
        return false;
    }
}
function maybeRollback() {
    try {
        // 重roll/编辑后楼层数不变但内容变了, 必须清掉 allAssistantCache(其按 lastId 缓存),
        // 否则 applyRollback 里 curLastHash 用旧内容计算, 判定"摘要一致"导致不回滚 NPC 状态
        allAssistantCache = null;
        const data = _state__WEBPACK_IMPORTED_MODULE_6__.loadData();
        const before = {
            已处理层数: data.已处理层数,
            NPC数: Object.keys(data.NPC ?? {}).length,
            快照层: (data.快照 ?? []).map(s => s.层数),
            摘要: data.最后处理摘要 || '(空)',
        };
        if (!applyRollback(data)) {
            return false;
        }
        _state__WEBPACK_IMPORTED_MODULE_6__.saveData(data);
        _state__WEBPACK_IMPORTED_MODULE_6__.useStateStore().data = data;
        console.info(`[彼方] 回滚触发完成: 回滚前=${JSON.stringify(before)}, 回滚后已处理层=${data.已处理层数} NPC数=${Object.keys(data.NPC ?? {}).length}`);
        // 回滚改了数据, 世界书条目(如已开启注入)也要同步回滚, 否则主AI读到的是旧内容
        try {
            const settings = _settings__WEBPACK_IMPORTED_MODULE_3__.getSettings();
            if (settings.更新.注入世界书条目)
                _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__.syncNpcStatesWorldbook(data, true).catch(() => { });
        }
        catch {
            // 忽略
        }
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
    console.info(`[彼方] 快照记录: 层数=${layer}, NPC=${Object.keys(data.NPC ?? {}).length}个, 快照总览=[${data.快照.map(s => s.层数).join(',')}]`);
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
/** 生理字段(仅当某 NPC 卡里出现了任一生理字段、即被判定为女性/双性等可怀孕角色时, 才要求全部补全) */
const PHYSIO_FIELDS = ['生理周期', '是否怀孕', '周期影响', '当前防护', '近期性行为'];
/** 每张被返回的状态卡都必须包含的普通字符串字段(全部字段, 缺一即判定不完整并自动重试) */
const REQUIRED_CARD_FIELDS = _state__WEBPACK_IMPORTED_MODULE_6__.CARD_FIELDS.filter(field => !PHYSIO_FIELDS.includes(field));
/** 校验 AI 输出的 JSON 结构是否符合预期; 结构错误、"新增 NPC 字段不全"、"女性 NPC 生理字段不全"抛错重试, 已有 NPC 缺普通字段只警告(保留旧值) */
function validateParsedFormat(parsed, existingNpcNames = new Set(), existingCards = {}, physioEnabled = false) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Error('AI 返回的 JSON 结构不符合预期(顶层不是对象)');
    }
    // 剧情时间格式校验: 生理周期日期/受孕判定/时间轴都依赖它解析, 必须为标准
    // "YYYY-MM-DD HH:mm"(年份4位补零如 0004/0025/0137), 否则自动重试让 AI 修正格式
    const storyTime = parsed['剧情时间'];
    let storyEndTs = null;
    if (storyTime && typeof storyTime === 'object' && !Array.isArray(storyTime)) {
        const bad = [];
        for (const key of ['开始', '结束']) {
            const value = String(storyTime[key] ?? '').trim();
            if (value && parseStoryTime(value) === null)
                bad.push(`${key}="${value}"`);
        }
        if (bad.length > 0) {
            throw Error(`"剧情时间"格式不正确(${bad.join('、')}): 必须为 "YYYY-MM-DD HH:mm", 年份固定4位补零(如 0004、0025、0137), 月/日/时/分2位补零, 重新输出`);
        }
        const endStr = String(storyTime['结束'] ?? '').trim();
        storyEndTs = endStr ? parseStoryTime(endStr) : null;
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
        // 普通字段: 缺失一律只警告(保留旧值), 不抛错重试——避免频繁重试失败浪费请求
        const missingNormal = REQUIRED_CARD_FIELDS.filter(field => typeof card?.[field] !== 'string' || !String(card?.[field] ?? '').trim());
        if (missingNormal.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失字段: ${missingNormal.join('、')}(保留旧值)`);
        }
        // 「可能偶遇」是扩展字段(仅不在场 NPC 需要; 在场 NPC 已在场景中, 不需要偶遇标记)。
        // 缺失一律不抛错(避免频繁重试), 只对不在场 NPC 保留警告, 让 AI 有机会补上
        if (!isInScene && !('可能偶遇' in (card ?? {}))) {
            console.warn(`[彼方] NPC「${npcName}」缺失「可能偶遇」(保留旧值)`);
        }
        // 睡眠时间合理性告警(仅不在场 NPC): 剧情结束时刻已到白天(约07:00~21:00),
        // 但"当前在做/当前状态"仍停留在过夜睡眠(睡觉/入睡/就寝/赖床), 提示 AI 按时间推进
        if (!isInScene && storyEndTs !== null) {
            const hour = new Date(storyEndTs).getHours();
            if (hour >= 7 && hour <= 21) {
                const sleepText = `${String(card?.['当前在做'] ?? '')} ${String(card?.['当前状态'] ?? '')}`;
                if (/睡觉|就寝|入睡|睡着|赖床|睡觉中|仍在睡/.test(sleepText) && !/午休|打盹|小憩|补觉|夜班|熬夜|守夜|病床|卧床/.test(sleepText)) {
                    console.warn(`[彼方] NPC「${npcName}」剧情已到 ${String(hour).padStart(2, '0')}:00 仍在过夜睡眠状态, 应按时间推进(起床/洗漱/做事等), 除非剧情明确其在补觉/值夜班/卧床`);
                }
            }
        }
        // 生理字段: 生理监测开启且判定为女性(本卡或旧卡出现过生理字段)时, 缺失一律只警告(保留旧值),
        // 不抛错重试——「是否怀孕」由代码掷骰写回, 其余字段缺失由 mergeCard 保留旧值/提示词约束
        const cardHasPhysio = PHYSIO_FIELDS.some(field => card?.[field] !== undefined && card?.[field] !== null && String(card?.[field] ?? '').trim() !== '');
        const oldCard = (existingCards ?? {})[npcName];
        const oldHasPhysio = !!oldCard && PHYSIO_FIELDS.some(field => oldCard[field] !== undefined && oldCard[field] !== null && String(oldCard[field] ?? '').trim() !== '');
        const isFemale = cardHasPhysio || (physioEnabled && oldHasPhysio);
        const missingPhysio = PHYSIO_FIELDS.filter(field => card?.[field] === undefined || card?.[field] === null || (typeof card?.[field] === 'string' && !card[field].trim()));
        if (physioEnabled && isFemale && missingPhysio.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺少生理字段: ${missingPhysio.join('、')}(保留旧值)`);
        }
        else if (cardHasPhysio && missingPhysio.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失生理字段: ${missingPhysio.join('、')}(保留旧值)`);
        }
        // 防全知字段: 孕期角色必须有「怀孕知晓」(NPC 本人是否知晓怀孕); 缺失时警告(mergeCard 会按孕周兜底补全)
        const isPregnantOut = String(card?.['是否怀孕'] ?? '') === 'true' || String(card?.['是否怀孕']) === '是' || String(card?.['生理周期'] ?? '').includes('孕期');
        if (isPregnantOut && (card?.['怀孕知晓'] === undefined || card?.['怀孕知晓'] === null || !String(card?.['怀孕知晓'] ?? '').trim())) {
            console.warn(`[彼方] NPC「${npcName}」孕期但缺「怀孕知晓」字段(将按孕周兜底补全)`);
        }
    };
    for (const [name, card] of Object.entries(parsed)) {
        if (name === '在场NPC' || name === '后台互动' || name === '移除NPC' || name === '剧情时间' || name === '受孕事件')
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
/** 周期长度随机范围(可怀孕角色首次建档时确定, 之后锁死, 不随 AI 覆盖变化) */
const PHYSIO_CYCLE_MIN = 21;
const PHYSIO_CYCLE_MAX = 35;
/** 从"生理周期"文本提取当前 Day(如 "排卵期 Day 13/25" → 13; "孕期 孕6周+3天" → null) */
function extractCycleDay(physioText) {
    const m = String(physioText ?? '').match(/Day\s*(\d+)/i);
    return m ? +m[1] : null;
}
/** 计算某 NPC 在指定 Day 发生受孕行为的单次受孕率(0~1), 基于锁定周期长度与防护 */
function calcConceptionRate(cycleLen, day, protection) {
    if (!cycleLen || !day)
        return 0;
    const ovuDay = cycleLen - 14; // 排卵日 = 周期长度-14
    const dist = day - ovuDay;    // 正=排卵后, 负=排卵前
    let base = 0.01; // 窗口外(安全期)保底 1%
    if (dist === 0)
        base = 0.25;              // 排卵日当天
    else if (dist >= -1 && dist <= -2)
        base = 0.20;              // 排卵前1-2天
    else if (dist >= -5 && dist <= -3)
        base = 0.10;              // 排卵前3-5天
    else if (dist === 1)
        base = 0.05;              // 排卵后1天
    const prot = String(protection ?? '').trim();
    const factor = prot.includes('避孕药') ? 0.01
        : prot.includes('避孕套') ? 0.02
            : prot.includes('外射') ? 0.05
                : prot.includes('无') ? 1
                    : 1;
    return Math.min(1, base * factor);
}
/**
 * 彼方自动受孕判定: AI 报告了"受孕事件"(阴道内射/阴道外射外阴附近)时, 由彼方代码
 * 掷 D100 并判定是否怀孕, 结果写回卡——不依赖 AI 自觉遵守规则。
 * 触发条件: 方式∈{阴道内射, 阴道外射(外阴附近)}, 且该 NPC 未怀孕(孕期不再判定),
 * 且该事件**发生在本次剧情时间窗口内**(旧事件——如剧情已跨过一晚仍被 AI 沿用的——不再判定)。
 */
function applyConceptionCheck(merged, oldCard, storyTimeText = '') {
    const ev = merged['受孕事件'];
    if (!ev || typeof ev !== 'object')
        return;
    try {
        const way = String(ev['方式'] ?? '').trim();
        const isConceptive = way.includes('阴道内射') || way.includes('阴道外射');
        if (!isConceptive)
            return; // 口内/肛内/体外不判定
        // 旧事件过滤(防反复判定): AI 每次更新会把旧卡里的受孕事件原样带上(如剧情已过了一晚),
        // 若事件时间明显早于本次剧情开始(或晚于剧情结束), 说明不是本次新发生的行为, 跳过判定。
        const range = parseStoryTimeRange(storyTimeText);
        const evTs = parsePregnancyEventTime(ev['时间'], storyTimeText);
        if (evTs !== null && range.startTs !== null && (evTs < range.startTs || (range.endTs !== null && evTs > range.endTs))) {
            console.info(`[彼方] 受孕事件为旧事件(不在本次剧情时间窗口内), 跳过判定: 事件=${ev['时间']} 剧情=${storyTimeText}`);
            return;
        }
        // 事件时间无法解析时, 若与旧卡里的受孕事件时间完全相同, 视为旧事件被沿用, 同样跳过
        if (evTs === null && storyTimeText) {
            const oldEv = oldCard?.['受孕事件'];
            if (oldEv && oldEv['时间'] && ev['时间'] && String(ev['时间']) === String(oldEv['时间'])) {
                console.info(`[彼方] 受孕事件时间无法解析且与旧卡相同, 视为旧事件, 跳过判定`);
                return;
            }
        }
        // 已怀孕: 不再判定(孕期无排卵, 不会二次怀孕)
        if (String(merged['是否怀孕'] ?? '') === 'true' || String(merged['是否怀孕']) === '是')
            return;
        const phy = merged['生理周期'] || '';
        if (String(phy).includes('孕期'))
            return;
        const day = extractCycleDay(phy);
        const cycleLen = merged['周期长度'];
        if (!day || !cycleLen)
            return;
        const rate = calcConceptionRate(cycleLen, day, ev['防护']);
        // 彼方掷骰 D100(1~100)
        const roll = 1 + Math.floor(Math.random() * 100);
        const ovuDay = cycleLen - 14;
        const pregnant = roll <= Math.round(rate * 100);
        console.info(`[彼方] 受孕判定: ${merged['是否怀孕'] !== undefined ? 'AI输出=' + merged['是否怀孕'] : '新卡'} 周期=${cycleLen} Day=${day}(排卵日${ovuDay}) 方式=${way} 防护=${ev['防护'] || '无'} 受孕率=${(rate * 100).toFixed(1)}% 掷骰=${roll} → ${pregnant ? '怀孕!' : '未怀'}`);
        if (pregnant) {
            merged['是否怀孕'] = 'true';
            if (!String(phy).includes('孕期'))
                merged['生理周期'] = `孕期 孕0周+0天`;
            // 防全知: 刚受孕的 NPC 本人完全不知情, 知晓状态固定为"未知"
            merged['怀孕知晓'] = '未知';
            // 记录受孕日期(剧情时间): 优先用受孕事件时间, 解析失败用剧情结束时刻。
            // 这是孕周推进的**绝对基准**——之后孕周一律按"当前剧情日期 - 受孕日期"重算,
            // 彻底摆脱 AI/旧卡孕周被写快后越推越快的问题。
            const pregTs = evTs !== null ? evTs : range.endTs;
            if (pregTs !== null)
                merged['受孕日期'] = fmtStoryTime(pregTs);
            console.info(`[彼方] ${merged['曾用名'] || ''} 判定为怀孕, 生理周期转孕期(本人尚不知晓), 受孕日期=${merged['受孕日期'] || '(未知)'}`);
        }
        else if (String(merged['是否怀孕'] ?? '') !== 'false') {
            merged['是否怀孕'] = 'false';
        }
    }
    finally {
        // 无论是否判定(已怀孕/孕期/方式非受孕/数据缺失/旧事件), 都从卡中清空受孕事件——
        // 避免残留后下一轮 AI 沿用旧事件再次触发重复判定/怀孕。
        delete merged['受孕事件'];
    }
}
/** 解析受孕事件的"时间"字段为时间戳: 兼容 "0137-06-09 21:40" 与缺年份的 "06-09 21:40"(用剧情时间补年份); 解析失败返回 null */
function parsePregnancyEventTime(timeText, storyTimeText) {
    let t = String(timeText ?? '').trim();
    if (!t)
        return null;
    // 缺年份(如 "06-09 21:40")时, 用剧情时间里的年份补全
    if (!/^\d{4}[-/.]/.test(t)) {
        const yearMatch = String(storyTimeText ?? '').match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
        const year = yearMatch ? yearMatch[0].slice(0, 4) : String(new Date().getFullYear());
        t = `${year}-${t}`;
    }
    return parseStoryTime(t);
}
/** 从"生理周期"孕期文本提取孕周(如 "孕期 孕6周+3天" → 6; 提取不到返回 null) */
function extractPregnancyWeek(physioText) {
    const m = String(physioText ?? '').match(/孕\s*(\d+)\s*周/);
    return m ? +m[1] : null;
}
/** 由 Day 与锁定周期长度推算阶段名(与提示词规则一致): 排卵日 = 周期长度 - 14;
 *  月经期 Day1~5, 卵泡期 Day6~排卵日-2, 排卵期 排卵日±1, 黄体期 排卵日+2~周期长度 */
function cycleStageName(day, cycleLen) {
    const ovuDay = cycleLen - 14;
    if (day >= 1 && day <= 5)
        return '月经期';
    if (day >= 6 && day <= ovuDay - 2)
        return '卵泡期';
    if (day >= ovuDay - 1 && day <= ovuDay + 1)
        return '排卵期';
    return '黄体期';
}
/**
 * 时间戳的"日期"部分时间戳(忽略时分, 用于按**日历日**计算天数差)。
 * 用 setFullYear 构造, 避免 JS 对 0~99 年份自动映射到 1900+。
 */
function dateOnlyTs(ts) {
    const d = new Date(ts);
    const t = new Date(0);
    t.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    return t.getTime();
}
/**
 * 生理周期兜底校正: 以旧卡中(AI 维护的)"生理周期日期"到本次剧情结束时刻的
 * **日历日差**推进 Day/孕周, 纠正 AI 偶发失误(同一天/过一晚就 +1~+2 天)。
 * 仅供兜底——AI 自行正确推进时不冲突; 旧卡无基准/剧情时间不可解析/时间倒退时跳过。
 * - 同一日历日(未跨午夜): 强制 Day/孕周保持与旧卡一致(不改动)
 * - 跨过午夜进入新的一天(即使只差几分钟, 如 23:45 → 00:20): Day+1
 * - 过了几个日历日: Day = 旧Day + 日历日差, 超过锁定周期长度归零进入新周期; 孕期按总天数推进
 */
function correctPhysioByStoryTime(merged, oldCard, storyTimeText) {
    const oldDate = oldCard?.['生理周期日期'];
    if (!oldDate)
        return;
    const range = parseStoryTimeRange(storyTimeText);
    const endTs = range.endTs;
    // 兼容旧数据: 早期 fmtStoryTime 年份没补零(如 "137-06-12 07:45"), 补零到4位再解析
    const rawDate = String(oldDate).trim();
    let oldTs = parseStoryTime(rawDate);
    if (oldTs === null) {
        const m = rawDate.match(/^(\d{1,3})([-/.]\d)/);
        if (m)
            oldTs = parseStoryTime(m[1].padStart(4, '0') + m[2] + rawDate.slice(m[0].length));
    }
    if (endTs === null || oldTs === null)
        return;
    // 按日历日差推进(忽略时分): 跨午夜(23:45→00:20)算 1 天, 同日算 0 天。
    // 注意: 剧情时间与上次同刻或倒退(endTs <= oldTs)时**不跳过**——days 会被
    // Math.max(0) 压成 0, 强制把 Day/孕周拉回旧卡值, 防止 AI 乱写(如手动重更时
    // AI 把 Day6 又写成 Day20, 却因 endTs==oldTs 而跳过校正直接入库)。
    const days = Math.max(0, Math.round((dateOnlyTs(endTs) - dateOnlyTs(oldTs)) / 86400000));
    const oldPhy = String(oldCard?.['生理周期'] ?? '').trim();
    if (!oldPhy)
        return;
    // 孕期: 优先按「受孕日期」重算孕周 = (当前剧情结束日期 - 受孕日期)的天数,
    // 彻底不依赖 AI/旧卡孕周(它们可能被 AI 写快后越推越快)。
    // 无受孕日期(存量旧卡)时退回: 旧卡孕周 + 天数差。
    const oldPreg = oldPhy.match(/孕期\s*孕(\d+)\s*周\s*\+\s*(\d+)\s*天/);
    // 关键: 旧卡是孕期, 但 AI 已把生理周期改为**非孕期**(哺乳期/普通周期) = AI 明确结束
    // 孕期(剧情写了分娩/孩子出生)。此时**不强制改回孕期**——否则 AI 输出哺乳期会被
    // 下面的孕期分支(受孕日期重算/旧卡孕周推进)覆盖回孕期, 导致"分娩了还显示孕期"。
    if (oldPreg && !String(merged['生理周期'] ?? '').includes('孕期')) {
        return;
    }
    const pregDate = merged['受孕日期'] || oldCard?.['受孕日期'];
    if (pregDate) {
        const pregTs = parseStoryTime(String(pregDate).trim());
        if (pregTs !== null && endTs !== null && endTs > pregTs) {
            const totalDays = Math.max(0, Math.round((dateOnlyTs(endTs) - dateOnlyTs(pregTs)) / 86400000));
            merged['生理周期'] = `孕期 孕${Math.floor(totalDays / 7)}周+${totalDays % 7}天`;
            return;
        }
    }
    if (oldPreg) {
        const total = (+oldPreg[1]) * 7 + (+oldPreg[2]) + days;
        merged['生理周期'] = `孕期 孕${Math.floor(total / 7)}周+${total % 7}天`;
        return;
    }
    // 普通周期: 以旧卡 Day 为基准推进, 超过周期长度归零进入新周期
    const oldDay = extractCycleDay(oldPhy);
    const cycleLen = merged['周期长度'];
    if (oldDay === null || !cycleLen || typeof merged['生理周期'] !== 'string' || !merged['生理周期'])
        return;
    const newDay = ((oldDay - 1 + days) % cycleLen) + 1;
    merged['生理周期'] = String(merged['生理周期'])
        .replace(/Day\s*\d+(?:\/\d+)?/i, `Day ${newDay}/${cycleLen}`);
}
/** 「怀孕知晓」的合法取值: 反映 NPC 本人对自己怀孕的知晓程度(防全知) */
const PREGNANCY_KNOWN_UNKNOWN = '未知';
const PREGNANCY_KNOWN_SUSPECT = '疑似';
const PREGNANCY_KNOWN_CONFIRMED = '已确认';
const PREGNANCY_KNOWN_VALUES = [PREGNANCY_KNOWN_UNKNOWN, PREGNANCY_KNOWN_SUSPECT, PREGNANCY_KNOWN_CONFIRMED];
/**
 * 防全知兜底: 保证孕期 NPC 一定有「怀孕知晓」字段(该字段只属于怀孕角色)。
 * - 未怀孕: 清理残留的知晓字段;
 * - 孕期但缺字段(存量旧卡升级): 按当前孕周推断初始知晓度——孕0~4周本人不知情(未知),
 *   孕4~6周停经开始怀疑(疑似), 孕6周+早孕反应/验孕早已确认(已确认), 符合现实认知。
 */
function ensurePregnancyKnowledge(merged) {
    const pregnant = String(merged['是否怀孕'] ?? '') === 'true' || String(merged['是否怀孕']) === '是' || String(merged['生理周期'] ?? '').includes('孕期');
    if (!pregnant) {
        delete merged['怀孕知晓'];
        return;
    }
    if (typeof merged['怀孕知晓'] === 'string' && merged['怀孕知晓'].trim())
        return;
    const week = extractPregnancyWeek(merged['生理周期']);
    merged['怀孕知晓'] = week === null ? PREGNANCY_KNOWN_UNKNOWN
        : week < 4 ? PREGNANCY_KNOWN_UNKNOWN
            : week < 6 ? PREGNANCY_KNOWN_SUSPECT
                : PREGNANCY_KNOWN_CONFIRMED;
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
    // 受孕事件: AI 报告的结构化对象(时间/对象/方式/防护), 整块覆盖; 未报告则保留旧值
    let 本次有新受孕事件 = false;
    if (update['受孕事件'] && typeof update['受孕事件'] === 'object' && !Array.isArray(update['受孕事件'])) {
        merged['受孕事件'] = _.cloneDeep(update['受孕事件']);
        本次有新受孕事件 = true;
    }
    if (merged['周期长度'] === undefined || merged['周期长度'] === null) {
        const hasPhysio = PHYSIO_FIELDS.some(field => merged[field] !== undefined && merged[field] !== null && String(merged[field] ?? '').trim() !== '');
        if (hasPhysio) {
            merged['周期长度'] = PHYSIO_CYCLE_MIN + Math.floor(Math.random() * (PHYSIO_CYCLE_MAX - PHYSIO_CYCLE_MIN + 1));
        }
    }
    // 受孕日期兜底(存量孕期卡): 孕期但缺「受孕日期」(旧版本受孕的卡)时, 用旧卡孕周反推
    // 受孕日 = 本次剧情结束时刻 - 孕周总天数, 作为后续孕周推进的绝对基准。
    // 必须放在 correctPhysioByStoryTime 之前, 让本次更新就能按受孕日期重算孕周。
    {
        const phyForPregDate = typeof merged['生理周期'] === 'string' ? merged['生理周期'] : '';
        if (phyForPregDate.includes('孕期') && !merged['受孕日期']) {
            const oldPhyStr = String(oldCard?.['生理周期'] ?? '');
            const oldWeekNum = extractPregnancyWeek(oldPhyStr);
            const oldDaysNum = oldPhyStr.match(/孕\s*\d+\s*周\s*\+\s*(\d+)\s*天/);
            const physioEndTs = parseStoryTimeRange(storyTimeText).endTs;
            if (physioEndTs !== null) {
                const totalDays = (oldWeekNum !== null ? oldWeekNum * 7 : 0) + (oldDaysNum ? +oldDaysNum[1] : 0);
                merged['受孕日期'] = fmtStoryTime(physioEndTs - totalDays * 86400000);
                console.info(`[彼方] ${merged['曾用名'] || ''} 孕期旧卡补记受孕日期=${merged['受孕日期']}`);
            }
        }
    }
    // 生理周期按剧情时间校正: 以"生理周期日期"到本次剧情时间的真实天数差强制修正 Day/孕周,
    // 防止 AI 凭轮次惯性乱跳(同一天多次变、过一晚+2)。放在受孕判定前, 让判定使用校正后的 Day。
    correctPhysioByStoryTime(merged, oldCard, storyTimeText);
    // 受孕判定: 由彼方代码执行(掷D100+算受孕率+更新是否怀孕), AI 只负责报告受孕事件。
    // **只对本次剧情时间窗口内新发生的受孕事件判定**——旧事件(如剧情已跨过一晚仍被 AI 沿用的)
    // 会被 applyConceptionCheck 按事件时间过滤掉, 避免同一事件反复掷骰刷怀孕。
    if (本次有新受孕事件)
        applyConceptionCheck(merged, oldCard, storyTimeText);
    // 一致性兜底: "是否怀孕=true"的角色, 生理周期必须是孕期文本——
    // 若 AI 误把孕期写成普通周期(如"排卵期 Day 12/25", 非哺乳期), 强制改回孕期; 孕周优先从旧卡恢复。
    // 反向: 生理周期已是孕期但"是否怀孕"未标记, 补标记为 true。
    // 例外: 生理周期为「哺乳期」= AI 明确结束孕期(剧情已分娩), 强制补 是否怀孕=false 并清残留,
    // 不得恢复孕期——否则"分娩了还显示孕期"。
    const isPregnantNow = String(merged['是否怀孕'] ?? '') === 'true' || String(merged['是否怀孕']) === '是';
    const phyNow = typeof merged['生理周期'] === 'string' ? merged['生理周期'] : '';
    if (phyNow.includes('哺乳期')) {
        merged['是否怀孕'] = 'false';
        delete merged['受孕日期'];
        delete merged['怀孕知晓'];
        // 记录哺乳期开始日期(首次进入时, 供后续判断哺乳期是否超期): 哺乳期是产后约6个月的
        // 短期状态, 超过后应恢复普通周期(由 AI 按提示词处理), 代码在超期时只告警不强制
        const physioEndNow = parseStoryTimeRange(storyTimeText).endTs;
        if (!merged['哺乳期开始日期'] && physioEndNow !== null)
            merged['哺乳期开始日期'] = fmtStoryTime(physioEndNow);
        // 哺乳期超期处理(>180天): 哺乳期是产后约6个月的短期状态, 剧情大跳跃(如3年后)后
        // 早已断奶, AI 若不推进, 这里强制恢复普通周期(月经期 Day 1, 产后月经恢复的合理起点),
        // 之后由校正/AI 按"生理周期日期"正常推进。
        const lactStartRaw = String(merged['哺乳期开始日期'] ?? '').trim();
        if (lactStartRaw && physioEndNow !== null) {
            const lactStartTs = parseStoryTime(lactStartRaw);
            if (lactStartTs !== null && physioEndNow - lactStartTs > 180 * 86400000) {
                merged['生理周期'] = `月经期 Day 1/${merged['周期长度'] || 28}`;
                delete merged['哺乳期开始日期'];
                console.warn(`[彼方] ${merged['曾用名'] || ''} 哺乳期已超过6个月(自${lactStartRaw}), 已恢复普通周期(月经期 Day 1)`);
            }
        }
    }
    else if (isPregnantNow && !phyNow.includes('孕期')) {
        // 旧卡是否孕期: 是 → AI 误把孕期改成普通周期, 强制恢复; 否 → AI 无受孕判定
        // 依据凭空写"是否怀孕=true", 纠正回 false(防止"之前怀孕的角色又怀孕")
        const oldCardIsPreg = String(oldCard?.['是否怀孕'] ?? '') === 'true' || String(oldCard?.['是否怀孕']) === '是' || String(oldCard?.['生理周期'] ?? '').includes('孕期');
        if (oldCardIsPreg) {
            const oldWeek = extractPregnancyWeek(String(oldCard?.['生理周期'] ?? ''));
            merged['生理周期'] = oldWeek !== null ? `孕期 孕${oldWeek}周+0天` : `孕期 孕0周+0天`;
            console.warn(`[彼方] ${merged['曾用名'] || ''} 生理周期被AI写回普通周期, 已强制恢复为孕期`);
        }
        else {
            merged['是否怀孕'] = 'false';
            console.warn(`[彼方] ${merged['曾用名'] || ''} AI 无受孕判定依据把"是否怀孕"写成 true, 已纠正为 false`);
        }
    }
    else if (!isPregnantNow && phyNow.includes('孕期')) {
        merged['是否怀孕'] = 'true';
        console.warn(`[彼方] ${merged['曾用名'] || ''} 生理周期为孕期但"是否怀孕"未标记, 已补标记`);
    }
    // 结束孕期后的清理: 生理周期既非孕期也非哺乳期(已结束孕期/恢复普通周期)时,
    // 受孕日期不应残留——否则旧卡会带着过期的受孕日期(如三年后已分娩却还留着三年前的受孕日期)
    if (!phyNow.includes('孕期') && !phyNow.includes('哺乳期'))
        delete merged['受孕日期'];
    // 怀孕知晓: AI 维护的 NPC 自我认知字段(仅孕期角色), 只接受合法取值, 非法/空值忽略(走下方兜底)
    if (update['怀孕知晓'] !== undefined) {
        const known = String(update['怀孕知晓'] ?? '').trim();
        if (PREGNANCY_KNOWN_VALUES.includes(known))
            merged['怀孕知晓'] = known;
    }
    // 防全知兜底: 未怀孕清理该字段; 孕期缺该字段(旧卡升级)按孕周补初始知晓度
    ensurePregnancyKnowledge(merged);
    // 哺乳期开始日期清理: 不再处于哺乳期时清除(哺乳期已结束/从未进入)
    if (!String(merged['生理周期'] ?? '').includes('哺乳期'))
        delete merged['哺乳期开始日期'];
    // 生理周期字段的分母修正: AI 常惯性写 "Day X/28", 但周期长度是锁定的个体值(21~35)。
    // 这里用锁定的周期长度自动替换分母, 不依赖 AI 自觉——保证排卵日计算(锁定长度-14)正确。
    if (merged['周期长度'] && typeof merged['生理周期'] === 'string' && merged['生理周期']) {
        const lockedLen = merged['周期长度'];
        // 匹配 "Day X/任意分母" 或 "Day X" 后补分母; 孕期文本不动(没有 Day 结构)
        merged['生理周期'] = String(merged['生理周期'])
            .replace(/Day\s*\d+\/\d+/gi, (m) => m.replace(/\/\d+$/, `/${lockedLen}`));
    }
    // 阶段名重算(与提示词阶段判定规则一致, 排卵日=周期长度-14): 阶段由 Day 决定,
    // 防止 AI 惯性写错阶段名——如 "Day 22/22" 却被写成排卵期(实际排卵期只有排卵日±1)。
    // 放在分母修正之后, 此时 Day 为最终值。孕期文本没有 Day 结构, 不受影响。
    {
        const finalPhy = typeof merged['生理周期'] === 'string' ? merged['生理周期'] : '';
        const dayOnly = finalPhy.match(/Day\s*(\d+)/i);
        if (dayOnly && merged['周期长度']) {
            const stage = cycleStageName(+dayOnly[1], merged['周期长度']);
            const stageRe = /^(月经期|卵泡期|排卵期|黄体期|经前期|孕期|哺乳期)\s*/;
            const hasStage = stageRe.test(finalPhy);
            merged['生理周期'] = hasStage
                ? finalPhy.replace(stageRe, `${stage} `)
                : `${stage} ${finalPhy}`;
        }
    }
    // 清理旧版生理字段残留(累计受孕率/受孕率记录/生理结算 已被新系统取代)
    delete merged['累计受孕率'];
    delete merged['受孕率记录'];
    delete merged['生理结算'];
    if ('可能偶遇' in update) {
        const raw = update['可能偶遇'];
        merged['可能偶遇'] = typeof raw === 'boolean' ? raw : raw === 'true' || raw === '是' || raw === '会';
    }
    // 曾用名: AI 在改名时标注的旧名(如"林姐"其实是"林淑仪"), 保留供彼方识别与合并
    if (update['曾用名'] && typeof update['曾用名'] === 'string' && update['曾用名'].trim()) {
        merged['曾用名'] = update['曾用名'].trim();
    }
    // 生理周期日期: 由彼方代码维护的只读参考字段——记录"上次推进到哪一天"的剧情结束时刻,
    // 供 AI 按真实天数差推进 Day/孕周(防跳天), 也供 correctPhysioByStoryTime 校正。
    // 关键: **剧情时间倒退/同刻时保留旧基准, 不回退**——否则重roll/删楼层后基准变小,
    // 之后 days 从倒退日期算起会虚增, Day 越推越快。
    const hasPhysioNow = PHYSIO_FIELDS.some(field => merged[field] !== undefined && merged[field] !== null && String(merged[field] ?? '').trim() !== '');
    if (hasPhysioNow) {
        const physioRange = parseStoryTimeRange(storyTimeText);
        if (physioRange.endTs) {
            const curPhysioTs = physioRange.endTs;
            const oldPhysioRaw = merged['生理周期日期'] ? String(merged['生理周期日期']).trim() : '';
            let oldPhysioTs = oldPhysioRaw ? parseStoryTime(oldPhysioRaw) : null;
            if (oldPhysioTs === null) {
                const m = oldPhysioRaw.match(/^(\d{1,3})([-/.]\d)/);
                if (m)
                    oldPhysioTs = parseStoryTime(m[1].padStart(4, '0') + m[2] + oldPhysioRaw.slice(m[0].length));
            }
            if (oldPhysioTs === null || curPhysioTs >= oldPhysioTs)
                merged['生理周期日期'] = fmtStoryTime(curPhysioTs);
        }
    }
    else {
        delete merged['生理周期日期'];
    }
    merged['最后更新'] = Date.now();
    return merged;
}

/**
 * 处理 NPC 改名合并: AI 输出状态卡时若带「曾用名」, 且该曾用名正好是已建档的旧卡 key,
 * 说明正文揭示了同一角色的真实姓名(如"林姐"→"林淑仪")。此时:
 * - 把旧卡内容作为合并基底(mergeCard 的 oldCard), 新卡字段覆盖旧卡 → 状态连续不割裂
 * - 删除旧卡 key, 名单同步用新名替换旧名, 避免两张卡并存/名单重复
 * 返回 { name, oldCard } 供调用方 mergeCard 使用; 无改名时返回原 name + 原旧卡。
 */
function resolveRenamedNpc(newData, name, card, playerName) {
    const alias = String(card?.['曾用名'] ?? '').trim();
    if (alias && alias !== name && alias !== playerName && newData.NPC[alias] && !newData.NPC[name]) {
        console.info(`[彼方] NPC改名合并: ${alias} → ${name}, 旧卡状态并入新卡`);
        const oldCard = newData.NPC[alias];
        delete newData.NPC[alias];
        newData.名单 = newData.名单.map(n => (n === alias ? name : n));
        return { name, oldCard };
    }
    return { name, oldCard: newData.NPC[name] };
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
/** 解析剧情时间为时间戳（支持 YYYY-MM-DD HH:mm、YYYY.MM.DD HH:mm、YYYY/MM/DD 等，分钟可省略）。
 * 年份固定 4 位数字(如 0004/0025/0137); 用 setFullYear 构造, 避免 JS 对 0~99 年份自动映射到 1900+ */
function parseStoryTime(text) {
    const t = text.trim().replace(/[./]/g, '-');
    const match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
    if (!match)
        return null;
    const [, year, month, day, hour, minute] = match;
    const d = new Date(0);
    d.setFullYear(+year, +month - 1, +day);
    d.setHours(+(hour ?? 0), +(minute ?? 0), 0, 0);
    const ts = d.getTime();
    return Number.isNaN(ts) ? null : ts;
}
/** 时间戳格式化为 "YYYY-MM-DD HH:mm"（年份固定 4 位补零, 如 0137-06-12 07:45） */
function fmtStoryTime(ts) {
    const date = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 解析 AI 返回的"剧情时间"（兼容字符串或 {开始, 结束} 对象）为起止时间戳 */
function parseStoryTimeRange(raw) {
    if (typeof raw === 'string') {
        const text = raw.trim();
        // 兼容 "开始 至 结束" 时间段字符串(如 mergeCard 收到的 storyTimeText):
        // 拆成起止两段分别解析, 否则整串解析失败 → startTs=null, 受孕判定的窗口过滤会失效
        const parts = text.split(/\s*(?:至|到|~)\s*/);
        if (parts.length >= 2) {
            const start = parts[0].trim().replace(/[./]/g, '-');
            const end = parts[parts.length - 1].trim().replace(/[./]/g, '-');
            return { text, startTs: parseStoryTime(start), endTs: parseStoryTime(end) };
        }
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
                        const resolved = resolveRenamedNpc(newData, name, card, playerName);
                        newData.NPC[resolved.name] = mergeCard(resolved.oldCard, card, storyTimeText);
                        inSceneCardNames.push(resolved.name);
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
        // 顶层保留键(防止 AI 误把受孕事件/剧情时间等放顶层被当成 NPC 建档)
        if (name === '在场NPC' || name === '后台互动' || name === '受孕事件' || name === '剧情时间'
            || typeof card !== 'object' || card === null || Array.isArray(card))
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
        const resolved = resolveRenamedNpc(newData, name, card, playerName);
        newData.NPC[resolved.name] = mergeCard(resolved.oldCard, card, storyTimeText);
        updatedNames.push(resolved.name);
        if (!newData.名单.includes(resolved.name))
            newData.名单.push(resolved.name);
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
    // 已追踪但本次未被 AI 返回的 NPC: 警告(状态保持旧值, 可能漏更新——如大幅时间跳跃时
    // AI 只更新了部分 NPC, 其余卡会停留在上次日期, 生理周期/状态不推进)
    const notUpdatedNpcs = newData.名单.filter(name => !updatedNames.includes(name) && !removedNpcs.includes(name));
    if (notUpdatedNpcs.length > 0) {
        console.warn(`[彼方] 以下已追踪NPC本次未被AI返回(状态保持旧值, 可能漏更新): ${notUpdatedNpcs.join('、')}`);
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
            ? await _worldbook__WEBPACK_IMPORTED_MODULE_4__.getActiveWorldbookText([context, reply].filter(Boolean).join('\n\n'), settings.更新.注入世界书上限, settings.更新.注入世界书条数, settings.更新.注入世界书排除 ?? [])
            : '';
        const storyTimeHint = extractCurrentTimeHint(worldbook, reply, context);
        const currentCards = {};
        // 无论是否重填都发送现有状态卡: 重填时它们作为"旧卡参考"传给 AI, 保证角色设定连续, 但要求 AI 忽略具体状态从零重填
        for (const name of tracked) {
            const oldCard = data.NPC[name];
            if (!oldCard)
                continue;
            const card = { ...oldCard };
            // 关键: 周期长度只在 mergeCard(合并后)才生成, 而发给 AI 的是合并前的旧卡——
            // 若缺周期长度, AI 看不到锁定值就只能写死 28。这里先补上(有生理字段的可怀孕角色),
            // 并回写 data, 让后续 mergeCard 直接沿用, 不重复随机。
            if ((card['周期长度'] === undefined || card['周期长度'] === null)
                && PHYSIO_FIELDS.some(field => card[field] !== undefined && card[field] !== null && String(card[field] ?? '').trim() !== '')) {
                card['周期长度'] = PHYSIO_CYCLE_MIN + Math.floor(Math.random() * (PHYSIO_CYCLE_MAX - PHYSIO_CYCLE_MIN + 1));
                oldCard['周期长度'] = card['周期长度'];
            }
            // 清理旧版生理字段残留, 避免 AI 继续沿用旧台账逻辑
            delete card['累计受孕率'];
            delete card['受孕率记录'];
            delete card['生理结算'];
            currentCards[name] = card;
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
            gemini3FJB: !!settings.更新.gemini37f破限,
            worldbook,
            currentStoryTime: data.剧情时间,
            storyTimeHint,
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
            // 预填充(prefill): 开启时在最后追加一条 assistant 消息, 引导模型直接从 JSON 开头开始输出
            // (提示词要求"只输出 JSON、不用 markdown 围栏", 所以 prefill 直接用 { 开头而非 ```json)。
            // 注意: prefill 的 { 只作为提示发给模型, 模型不会在输出里重复它 → 返回后需把 { 拼回开头,
            // 否则 parseModelResponse 的 indexOf('{') 会切到"剧情时间"的子对象导致 JSON 不完整。
            const prefill = settings.更新.预填充 && attemptMessages.length > 0 && attemptMessages[attemptMessages.length - 1].role === 'user'
                ? '{\n'
                : '';
            if (prefill)
                attemptMessages.push({ role: 'assistant', content: prefill });
            content = await _api__WEBPACK_IMPORTED_MODULE_1__.chatCompletion(attemptMessages, { signal: abortSignal });
            // 拼回 prefill 的 { (仅当模型输出不是以 { 开头, 避免双 { )
            if (prefill && String(content).trim().charAt(0) !== '{')
                content = prefill + content;
            debugStore.record({ time: Date.now(), response: content });
            try {
                parsed = parseModelResponse(content);
                validateParsedFormat(parsed, new Set(Object.keys(data.NPC ?? {})), data.NPC ?? {}, settings.更新.生理监测);
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
        console.info(`[彼方] 更新完成: 已处理层数=${assistantCount}, 摘要=${newData.最后处理摘要.slice(0, 12)}, 快照层数=${assistantCount}`);
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
