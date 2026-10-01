// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _api__WEBPACK_IMPORTED_MODULE_1__ from './api';
import * as _prompts__WEBPACK_IMPORTED_MODULE_2__ from './prompts';
import * as _settings__WEBPACK_IMPORTED_MODULE_3__ from './settings';
import * as _worldbook__WEBPACK_IMPORTED_MODULE_4__ from './worldbook';
import * as _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__ from './worldbook-inject';
import { APPEND_CARD_FIELDS, CARD_FIELDS, LEGACY_CARD_FIELDS } from './卡字段';
import { loadData, updateClearLayer, writeStateSnapshot } from './快照';
import { useStateStore } from './数据仓';
import { useDebugStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import * as _toast__WEBPACK_IMPORTED_MODULE_7__ from './toast';
import { applyConceptionCheck, CYCLE_STAGE_INFLUENCE, correctPhysioByStoryTime, ensurePregnancyKnowledge, extractLactationMonths, extractPregnancyWeek, cycleStageName, lactationExpired, normalizeRaceScale, PHYSIO_CYCLE_MAX, PHYSIO_CYCLE_MIN, PHYSIO_FIELDS, PREGNANCY_KNOWN_CONFIRMED, PREGNANCY_KNOWN_SUSPECT, PREGNANCY_KNOWN_UNKNOWN, PREGNANCY_KNOWN_VALUES, RACE_SCALE_FIELDS } from './生理规则';
import { fmtStoryTime, parseStoryTime, parseStoryTimeRange, withStoryDate } from './剧情时间';
import { useHost } from './host';
import { isReservedTopLevelKey, THINKING_FIELD_KEYS, 请求并校验 } from './模型请求';

/* harmony export */ 

// 这里属于流水线顶层(收尾时要写世界书), 按边界处理, 所以自己构造一次真实宿主。
// 待 updateNpcStates 拆分(候选2)后, 宿主应从调用方传进来, 而不是在本文件里自己造。
// 当前宿主: 在 updateNpcStates 开头重新取一次(用例会替换它, 见 host.ts 的 injectHostForTest)。
// 刻意不在模块加载时抓死: 那样用例注入的假平台到不了这条流水线, 整条更新流程就只能靠真酒馆验证。
let host = useHost();







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
        const characterName = host.character.name();
        if (characterName)
            names.add(characterName);
    }
    return [...names];
}
function getRecentAssistantMessages(count) {
    try {
        const lastId = host.chat.lastMessageId();
        if (lastId < 0)
            return [];
        // 循环扩大窗口直到取够 N 条可见 AI 回复(或扫完整个聊天)。
        // 旧版固定 count*10 窗口, 隐藏楼层多时会取不够导致本轮更新被跳过。
        let window = Math.max(count * 4, 10);
        for (;;) {
            const start = Math.max(0, lastId - window);
            const messages = host.chat.messages(`${start}-${lastId}`, { role: 'assistant' });
            const visible = messages.filter(message => !message.is_hidden);
            if (visible.length >= count || start === 0)
                return visible.slice(-count);
            window *= 2;
        }
    }
    catch {
        return [];
    }
}
function buildContext(replyMessageId, filter, window, replyIds, minId = 0) {
    try {
        const lastId = host.chat.lastMessageId();
        const start = Math.max(0, Math.min(replyMessageId, lastId) - window * 2);
        const messages = host.chat.messages(`${start}-${lastId}`)
            .filter(message => message.role !== 'system' && !message.is_hidden && message.message_id > minId && !replyIds.has(message.message_id))
            .slice(-window);
        return messages
            .map(message => `${message.role === 'user' ? '玩家' : message.name || 'AI'}: ${filter(message.message)}`)
            .join('\n\n');
    }
    catch {
        return '';
    }
}
let allAssistantCache = null;
function getAllAssistantMessages() {
    try {
        const lastId = host.chat.lastMessageId();
        if (allAssistantCache && allAssistantCache.lastId === lastId)
            return allAssistantCache.messages;
        if (lastId <= 0)
            return [];
        const messages = host.chat.messages(`0-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
        allAssistantCache = { lastId, messages };
        return messages;
    }
    catch {
        return [];
    }
}
/** 供 index.ts 等外部调用(更新频率判定): 带缓存的全部可见 AI 楼层 */
function getAllAssistantMessagesCached() {
    return getAllAssistantMessages();
}
/** 脱敏接口地址(隐藏地址中可能携带的 token/key 查询参数), 用于错误日志 */
function maskBaseUrl(url) {
    const value = String(url || '').trim();
    return value.replace(/([?&](?:key|token|api_key|apiKey|apikey)=)[^&]*/gi, '$1***');
}
/** 从正文/上下文中提取明确标注的"当前时间"(如 <time_format> 的 time 行、正文里的日期+时刻), 作为剧情时间的参考提示。
 *  **只从正文与上下文提取, 不读世界书**——世界书里的"当前时间"表/全局时间表是其他系统或彼方
 *  上次写入的推断值, 可能滞后或与正文不符, 作为"务必以此为准"的提示反而会把剧情时间带偏。 */
function extractCurrentTimeHint(_worldbook, reply, context) {
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
    // 优先 reply(最新正文), 其次 context(最近剧情上下文)——两者都是本聊天的
    // 实际剧情内容, 时间标注可信; 世界书不参与(见函数注释)
    const fromReply = extractFrom(reply);
    if (fromReply)
        return fromReply;
    return extractFrom(context);
}

/**
 * 近期关键事件的语义近似去重。
 *
 * AI 常把同一件事换一种说法再次返回，例如：
 * - 2026-05-20 因诊所宣传日需提早出门，临走前叮嘱家中孩子们
 * - 2026-05-20 因诊所宣传日提早出门上班
 *
 * 精确字符串去重认不出这种重复。这里用“同日期 + 最长公共连续文本占较短事件正文 >= 60%”
 * 判断为同一事件，并保留信息更完整（正文更长）的一条。不同日期永不合并。
 */
function dedupeRecentEvents(text) {
    const items = String(text ?? '').split(/[；;、\n]+/).map(item => item.trim()).filter(Boolean);
    const parse = (item) => {
        const match = item.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*(.*)$/);
        return {
            date: match?.[1] ?? '',
            body: String(match?.[2] ?? item).replace(/[\s，。！？、；;,.!?：:的了需]/g, ''),
        };
    };
    const longestCommonSubstringLength = (a, b) => {
        if (!a || !b)
            return 0;
        const previous = new Array(b.length + 1).fill(0);
        let longest = 0;
        for (let i = 1; i <= a.length; i++) {
            const current = new Array(b.length + 1).fill(0);
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) {
                    current[j] = previous[j - 1] + 1;
                    longest = Math.max(longest, current[j]);
                }
            }
            for (let j = 0; j <= b.length; j++)
                previous[j] = current[j];
        }
        return longest;
    };
    const result = [];
    for (const item of items) {
        const candidate = parse(item);
        const duplicateIndex = result.findIndex(existing => {
            const prior = parse(existing);
            if (!candidate.date || candidate.date !== prior.date)
                return false;
            const shorter = Math.min(candidate.body.length, prior.body.length);
            return shorter > 0 && longestCommonSubstringLength(candidate.body, prior.body) / shorter >= 0.6;
        });
        if (duplicateIndex === -1) {
            result.push(item);
        }
        else if (item.length > result[duplicateIndex].length) {
            result[duplicateIndex] = item;
        }
    }
    return result.slice(-3).join('；');
}

function mergeCard(oldCard, update, storyTimeText = '') {
    const merged = { ...(oldCard ?? {}) };
    // 剧情时间已废弃独立记录(时间轴功能已下线), 不再写入状态卡; 顺带清理旧数据残留
    delete merged['剧情时间'];
    // 人设参考是发给 AI 的只读参考(每张卡附在末尾的世界书条目), AI 不应把它当字段返回——
    // 若 AI 误把它写进 JSON, 直接丢弃不合并, 防止它进入快照无限累积。
    delete merged['人设参考'];
    // 清理旧版字段(最近变化已从 CARD_FIELDS 移除)
    for (const legacyField of LEGACY_CARD_FIELDS) {
        delete merged[legacyField];
    }
    for (const key of CARD_FIELDS) {
        const value = update[key];
        if (typeof value === 'string' && value.trim()) {
            // 持有物/近期关键事件: 追加式合并, 不覆盖(见原则4.5一致性铁律)
            if (APPEND_CARD_FIELDS.includes(key)) {
                const oldText = String(merged[key] ?? '').trim();
                const newText = value.trim();
                if (!oldText) {
                    merged[key] = newText;
                }
                else if (key === '近期关键事件') {
                    // FIFO 最多3条, 新条目追加到末尾, 去重(避免AI重复返回已入库条目)
                    // 分隔符兼容: 提示词未强制, AI 可能用 ；、;、顿号、换行 分隔多条
                    const splitItems = (text) => text.split(/[；;、\n]+/).map(s => s.trim()).filter(Boolean);
                    const oldItems = splitItems(oldText);
                    const newItems = splitItems(newText);
                    const combined = [...oldItems];
                    for (const item of newItems) {
                        if (!combined.includes(item))
                            combined.push(item);
                    }
                    merged[key] = dedupeRecentEvents(combined.join('；'));
                }
                else {
                    // 持有物: 去重合并, 旧物品保留
                    // 分隔符兼容: 提示词要求顿号, 但 AI 可能用 , 、, 逗号、顿号、分号
                    const splitItems = (text) => text.split(/[、,，;；]+/).map(s => s.trim()).filter(Boolean);
                    const oldItems = splitItems(oldText);
                    const newItems = splitItems(newText);
                    const combined = [...oldItems];
                    for (const item of newItems) {
                        if (!combined.includes(item))
                            combined.push(item);
                    }
                    merged[key] = combined.join('、');
                }
            }
            else {
                // 生活状态: AI 若写了"今天/昨天 HH:mm"等相对时间, 用本次剧情时间补全为带日期格式
                merged[key] = key === '生活状态' ? withStoryDate(value.trim(), storyTimeText) : value.trim();
            }
        }
    }
    // 即使本轮 AI 没返回近期关键事件，也清理旧快照里已经存在的近义重复。
    if (merged['近期关键事件'])
        merged['近期关键事件'] = dedupeRecentEvents(merged['近期关键事件']);
    // 受孕事件: AI 报告的结构化对象(时间/对象/方式/防护/次数)或事件数组, 整块覆盖; 未报告则保留旧值
    let 本次有新受孕事件 = false;
    const evUpdate = update['受孕事件'];
    const evValid = !!evUpdate && typeof evUpdate === 'object'
        && (!Array.isArray(evUpdate) || evUpdate.some(item => item && typeof item === 'object' && !Array.isArray(item)));
    if (evValid) {
        merged['受孕事件'] = _.cloneDeep(evUpdate);
        本次有新受孕事件 = true;
    }
    if (merged['周期长度'] === undefined || merged['周期长度'] === null) {
        const hasPhysio = PHYSIO_FIELDS.some(field => merged[field] !== undefined && merged[field] !== null && String(merged[field] ?? '').trim() !== '');
        if (hasPhysio) {
            merged['周期长度'] = PHYSIO_CYCLE_MIN + Math.floor(Math.random() * (PHYSIO_CYCLE_MAX - PHYSIO_CYCLE_MIN + 1));
        }
    }
    // 种族时间尺度(「孕程周数」「哺乳期月数」): AI 按 NPC 种族/世界书设定填写, 只接受范围内的正整数。
    // 非法/缺失一律**保留原值**并告警——缺数字时彼方没有依据, 下游按"不推断、不改写"处理, 绝不默认人类。
    for (const scaleField of RACE_SCALE_FIELDS) {
        const rawScale = update[scaleField];
        if (rawScale === undefined)
            continue;
        const normalized = normalizeRaceScale(scaleField, rawScale);
        if (normalized === null) {
            console.warn(`[彼方] ${merged['曾用名'] || ''} 「${scaleField}」取值不合法(${rawScale}), 已忽略并保留原值`);
            continue;
        }
        merged[scaleField] = normalized;
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
        // 记录哺乳期开始日期(首次进入时, 供后续判断哺乳期是否超期)
        const physioEndNow = parseStoryTimeRange(storyTimeText).endTs;
        if (!merged['哺乳期开始日期'] && physioEndNow !== null)
            merged['哺乳期开始日期'] = fmtStoryTime(physioEndNow);
        // 哺乳期超期处理: 时长按该 NPC 的「哺乳期月数」(AI 按种族/世界书设定填写, 人类约 6)判定, 30 天/月。
        // 剧情大跳跃(如3年后)且 AI 未推进时, 强制恢复普通周期(月经期 Day 1, 产后月经恢复的合理起点),
        // 之后由校正/AI 按"生理周期日期"正常推进。
        // **未填「哺乳期月数」= 彼方没有依据 → 只告警、绝不改数据**, 交回 AI 按种族设定决定。
        // (这里以前硬编码 180 天, 等于把人类时长套给所有种族——龙族/天使等更长的会被错误地强制恢复)
        const lactStartRaw = String(merged['哺乳期开始日期'] ?? '').trim();
        if (lactStartRaw && physioEndNow !== null) {
            const lactStartTs = parseStoryTime(lactStartRaw);
            const expired = lactationExpired(lactStartTs, physioEndNow, merged);
            if (expired === true) {
                merged['生理周期'] = `月经期 Day 1/${merged['周期长度'] || 28}`;
                delete merged['哺乳期开始日期'];
                // 阶段联动: 哺乳期强制恢复普通周期后, 原"周期影响"(哺乳相关描述)已不适用
                if (typeof merged['周期影响'] === 'string' && merged['周期影响'].includes('哺乳'))
                    merged['周期影响'] = CYCLE_STAGE_INFLUENCE['月经期'];
                console.warn(`[彼方] ${merged['曾用名'] || ''} 哺乳期已超过${extractLactationMonths(merged)}个月(自${lactStartRaw}), 已恢复普通周期(月经期 Day 1)`);
            }
            else if (expired === null) {
                console.info(`[彼方] ${merged['曾用名'] || ''} 哺乳期时长无从判断(未填「哺乳期月数」或时间不可解析), 不改写, 交回 AI 按种族设定处理(自${lactStartRaw})`);
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
    // 单向闸: 只能 未知→疑似→已确认 前进, 不能倒退(AI 误标"未知"为"已确认"时拦截)
    if (update['怀孕知晓'] !== undefined) {
        const known = String(update['怀孕知晓'] ?? '').trim();
        if (PREGNANCY_KNOWN_VALUES.includes(known)) {
            const oldKnown = String(merged['怀孕知晓'] ?? '').trim();
            const order = { [PREGNANCY_KNOWN_UNKNOWN]: 0, [PREGNANCY_KNOWN_SUSPECT]: 1, [PREGNANCY_KNOWN_CONFIRMED]: 2 };
            const oldIdx = order[oldKnown] ?? -1;
            const newIdx = order[known] ?? -1;
            if (newIdx >= oldIdx) {
                merged['怀孕知晓'] = known;
            }
            else {
                console.warn(`[彼方] ${merged['曾用名'] || ''} 怀孕知晓倒退被拦截(${oldKnown}→${known}), 保持旧值`);
            }
        }
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
            const oldStageMatch = finalPhy.match(stageRe);
            const oldStage = oldStageMatch ? oldStageMatch[1] : '';
            merged['生理周期'] = oldStage
                ? finalPhy.replace(stageRe, `${stage} `)
                : `${stage} ${finalPhy}`;
            // 阶段被修正时联动「周期影响」: AI 的"周期影响"是按它写的(错误)阶段撰写的,
            // 彼方修正阶段名后二者矛盾(如写了排卵期影响、实际已是黄体期)——
            // 影响文本包含旧阶段名时, 用新阶段的通用描述覆盖(下一轮 AI 可按剧情自然细化)。
            if (oldStage && oldStage !== stage
                && typeof merged['周期影响'] === 'string' && merged['周期影响'].includes(oldStage)) {
                merged['周期影响'] = CYCLE_STAGE_INFLUENCE[stage];
                console.warn(`[彼方] ${merged['曾用名'] || ''} 生理周期阶段被修正(${oldStage}→${stage}), "周期影响"已同步替换`);
            }
        }
    }
    // 清理旧版生理字段残留(累计受孕率/受孕率记录/生理结算 已被新系统取代)
    delete merged['累计受孕率'];
    delete merged['受孕率记录'];
    delete merged['生理结算'];
    // 清理已下线的「可能偶遇」字段: 主 AI 通过"位置+当前在做"即可推断偶遇可能性,
    // 单独维护布尔字段反而容易出现"位置在公司但可能偶遇=true"的矛盾
    delete merged['可能偶遇'];
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

function applyUpdate(data, parsed, timeJump = null, playerName = null, autoTrack = true) {
    const newData = {
        ...data,
        名单: [...data.名单],
        NPC: _.cloneDeep(data.NPC),
        卡字段计数: _.cloneDeep(data.卡字段计数 ?? {}),
        统计: { ...data.统计 },
    };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return newData;
    const storyRange = parseStoryTimeRange(parsed['剧情时间']);
    const storyTimeText = storyRange.text;
    if (!storyTimeText) {
        // AI 完全省略"剧情时间"时静默通过会导致生理推进失去基准, 至少留一条警告
        console.warn('[彼方] AI 输出缺少"剧情时间", 生理周期推进将使用旧基准');
    }
    if (storyTimeText)
        newData.剧情时间 = storyTimeText;
    let npcUpdates;
    if (typeof parsed['NPC'] === 'object' && parsed['NPC'] !== null && !Array.isArray(parsed['NPC'])) {
        npcUpdates = parsed['NPC'];
    }
    else {
        npcUpdates = { ...parsed };
        delete npcUpdates['在场NPC'];
        delete npcUpdates['剧情时间'];
    }
    // 「自动建档」关闭时: 只允许合并**已追踪**的 NPC(名单内或已有卡), AI 返回的新角色一律跳过——
    // 已有卡但不在名单的(如改名后的新键)仍放行, 由 resolveRenamedNpc 的改名合并逻辑处理
    const isTrackedNpc = (name) => newData.名单.includes(name) || !!newData.NPC[name];
    const skippedNewNpcs = [];
    const updatedNames = [];
    for (const [name, card] of Object.entries(npcUpdates)) {
        // 顶层保留键(防止 AI 误把受孕事件/剧情时间/思考流程等放顶层被当成 NPC 建档)
        if (isReservedTopLevelKey(name)
            || typeof card !== 'object' || card === null || Array.isArray(card))
            continue;
        // 主角: 跳过合并, 并清理误建的主角卡/名单项
        if (playerName && name === playerName) {
            delete newData.NPC[name];
            newData.名单 = newData.名单.filter(n => n !== name);
            continue;
        }
        // 自动建档关闭: 新角色(未在名单且无卡)不建档不追踪, 记录后跳过
        if (!autoTrack && !isTrackedNpc(name)) {
            skippedNewNpcs.push(name);
            continue;
        }
        const resolved = resolveRenamedNpc(newData, name, card, playerName);
        newData.NPC[resolved.name] = mergeCard(resolved.oldCard, card, storyTimeText);
        updatedNames.push(resolved.name);
        if (!newData.名单.includes(resolved.name))
            newData.名单.push(resolved.name);
    }
    // 兼容旧版输出格式: 旧提示词会让 AI 返回「在场NPC」数组(对象=完整状态卡), 照常建档合并,
    // 不丢数据; 新提示词不再要求该数组, 所有 NPC 一律顶层返回
    if (Array.isArray(parsed['在场NPC'])) {
        for (const item of parsed['在场NPC']) {
            if (!item || typeof item !== 'object' || Array.isArray(item))
                continue;
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
                // 自动建档关闭: 旧格式数组里的新角色同样不建档
                if (!autoTrack && !isTrackedNpc(name)) {
                    skippedNewNpcs.push(name);
                    continue;
                }
                const resolved = resolveRenamedNpc(newData, name, card, playerName);
                newData.NPC[resolved.name] = mergeCard(resolved.oldCard, card, storyTimeText);
                if (!updatedNames.includes(resolved.name))
                    updatedNames.push(resolved.name);
                if (!newData.名单.includes(resolved.name))
                    newData.名单.push(resolved.name);
            }
        }
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
    // 自动建档关闭时, 提示本次被跳过的新角色(仅提示, 不影响其他更新)
    if (skippedNewNpcs.length > 0) {
        console.info(`[彼方] 「自动建档」已关闭, 本次跳过新角色(未建档): ${skippedNewNpcs.join('、')}`);
    }
    // 已追踪但本次整卡未被 AI 返回的 NPC: 警告(增量更新下核心三字段应每次必返, 整卡省略=状态停留旧值——
    // 如大幅时间跳跃时 AI 只更新了部分 NPC, 其余卡会停留在上次日期)
    const notUpdatedNpcs = newData.名单.filter(name => !updatedNames.includes(name) && !removedNpcs.includes(name));
    if (notUpdatedNpcs.length > 0) {
        console.warn(`[彼方] 以下已追踪NPC本次整卡未返回(状态保持旧值, 剧情已推进时可能漏更新): ${notUpdatedNpcs.join('、')}`);
    }
    newData.统计.更新次数 = (newData.统计.更新次数 ?? 0) + 1;
    newData.统计.最后更新 = Date.now();
    return newData;
}
async function updateNpcStates(force = false) {    if (isUpdating) {
        console.warn('[彼方] 上一次更新尚未完成, 已跳过本次更新');
        return;
    }
    isUpdating = true;
    host = useHost();
    // 分段计时: 定位"更新慢"的瓶颈(前置/世界书激活/接口请求/解析应用/收尾)
    const timing = { start: Date.now(), 前置: 0, 世界书: 0, 请求: 0, 请求次数: 0, 解析应用: 0, 收尾: 0 };
    const debugStore = useDebugStore();
    const updatingStore = useUpdatingStore();
    const abortSignal = updatingStore.start('正在分析最近楼层…', '幕后');
    let parsed = null;
    let parseError = null;
    try {
        const settings = _settings__WEBPACK_IMPORTED_MODULE_3__.getSettings();
        const { 地址, 模型 } = settings.接口;
        if (!地址 || !模型) {
            _toast__WEBPACK_IMPORTED_MODULE_7__.toastWarning('彼方: 尚未配置接口地址或模型, 请先在设置中完成配置', '彼方');
            return;
        }
        let data = loadData();
        // 获取玩家/主角名, 避免给主角建档; 顺带清理历史误建的主角卡
        const playerName = host.persona.name();
        // 主角信息(persona 描述): 主 AI 能看到 persona, 彼方此前没有读取渠道——
        // 主角设定不写在世界书里时, 更新 AI 完全不知道主角是谁, 这里补齐
        const playerDescription = host.persona.description().trim().slice(0, 4000);
        if (playerName && data.NPC[playerName]) {
            delete data.NPC[playerName];
            data.名单 = data.名单.filter(name => name !== playerName);
        }
        // 手动更新不再撤销当前快照(旧行为"先回退再重填"会把本轮自动更新积累的其他 NPC
        // 一起退回旧快照, 频繁手动更新时表现为角色/更新次数反复消失)——直接以现有状态为基底
        // 增量重填, 更新次数照常累加。
        const tracked = collectTrackedNpcs(settings, data);
        const recentCount = Math.max(1, settings.更新.读取最近回复数 ?? 3);
        let clearLayer = data.清空层 ?? 0;
        // 清空层自适应: 清空后楼层被删到清空层以下时, 现有楼层号永远追不上清空层,
        // 自动更新会被静默卡死。此时把清空层自动挪到最新楼层(等价于"从没更新过",
        // 之后的新楼层照常分析), 与 v1.10 的行为一致。
        if (!force && clearLayer > 0) {
            let lastId = -1;
            try {
                lastId = host.chat.lastMessageId();
            }
            catch {
                lastId = -1;
            }
            if (lastId >= 0 && clearLayer > lastId) {
                const oldClearLayer = clearLayer;
                clearLayer = lastId;
                data.清空层 = clearLayer;
                try {
                    updateClearLayer(clearLayer);
                    console.warn(`[彼方] 清空层 #${oldClearLayer} 高于当前最新楼层 #${lastId}, 已自动下移到 #${lastId}(之后的新楼层照常分析)`);
                }
                catch (error) {
                    console.warn('[彼方] 清空层下移失败(不影响本次更新):', error);
                }
            }
        }
        // 自动更新只分析清空之后的楼层；手动更新(force)强制分析最近 N 条
        let recent = getRecentAssistantMessages(recentCount);
        if (!force)
            recent = recent.filter(message => message.message_id > clearLayer);
        if (recent.length === 0) {
            if (force) {
                _toast__WEBPACK_IMPORTED_MODULE_7__.toastWarning('彼方: 没有可分析的AI回复（请确认已生成至少一条AI回复）', '彼方');
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
        // 名字提示用**过滤后**的正文判断(思维链/隐藏标签里提到的名字不算"出现过")
        const inSceneHint = tracked.filter(name => isNameMentioned(reply, name));
        const replyIds = new Set(recent.map(message => message.message_id));
        // 手动更新(force)连上下文一起完整分析（含清空前的用户输入）；自动更新才受清空层约束
        // 「最近剧情」上下文只取最新 1 层用户输入（正文仍按「读取最近 N 条」）
        const context = buildContext(recent[recent.length - 1].message_id, filter, 1, replyIds, force ? 0 : clearLayer);
        timing.前置 = Date.now() - timing.start;
        const worldbookStart = Date.now();
        const worldbook = settings.更新.注入世界书
            ? await _worldbook__WEBPACK_IMPORTED_MODULE_4__.getActiveWorldbookText([context, reply].filter(Boolean).join('\n\n'), settings.更新.注入世界书排除 ?? [], settings.更新.常驻世界书条目 ?? [])
            : '';
        timing.世界书 = Date.now() - worldbookStart;
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
        // 人设注入: 对每个已追踪 NPC, 收集**该 NPC 名字能触发的绿灯(关键词)条目**作为"人设参考"附在卡旁。
        // 与整包 worldbook 注入的区别: 这里**跳过蓝灯常驻条目**——蓝灯无条件下发, 给所有 NPC 的都是同一份
        // "基础世界观", 失去按 NPC 区分人设的意义; 只保留"keys 数组里显式包含 NPC 名字(或曾用名)"的条目,
        // 保证每张卡附的人设参考真的是它自己的人设, 而不是基础世界观。
        if (settings.更新.注入世界书 && tracked.length > 0) {
            for (const name of tracked) {
                const card = currentCards[name];
                if (!card)
                    continue;
                const alias = String(card['曾用名'] ?? '').trim();
                try {
                    const personaText = await _worldbook__WEBPACK_IMPORTED_MODULE_4__.getPersonaTextForNpc(name, alias, settings.更新.注入世界书排除 ?? []);
                    if (personaText && personaText.trim()) {
                        // 截断到 1500 字: 防止人设条目超长挤占输出 token
                        card['人设参考'] = personaText.trim().slice(0, 1500);
                    }
                }
                catch (error) {
                    console.warn(`[彼方] 获取 NPC「${name}」人设条目失败(不影响本次更新):`, error);
                }
            }
        }
        const { messages, 锚点 } = _prompts__WEBPACK_IMPORTED_MODULE_2__.buildUpdateMessages({
            reply,
            replyCount: recent.length,
            context,
            timeJump,
            tracked,
            inSceneHint,
            currentCards,
            autoTrackEnabled: settings.更新.自动建档 !== false,
            physioEnabled: settings.更新.生理监测,
            破限: !!settings.更新.破限,
            头部填充: !!settings.更新.提示词头部填充,
            头部填充文本: settings.更新.头部填充文本 ?? '',
            防截断: !!settings.更新.防截断,
            预填充: !!settings.更新.预填充,
            worldbook,
            currentStoryTime: data.剧情时间,
            storyTimeHint,
            playerName,
            playerDescription,
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
        let 请求结果;
        try {
            // 取模型输出这一段已独立成模块(模型请求.ts): 发请求 → 解析 → 校验, 不合格就带着错误原因重试
            请求结果 = await 请求并校验({
                messages,
                锚点,
                预填充: settings.更新.预填充,
                现有卡: data.NPC ?? {},
                名单: data.名单 ?? [],
                玩家名: playerName,
                自动建档: settings.更新.自动建档 !== false,
                signal: abortSignal,
                发请求: _api__WEBPACK_IMPORTED_MODULE_1__.chatCompletion,
                记日志: (partial) => debugStore.record(partial),
                报进度: (文字) => { updatingStore.message = 文字; },
            });
        }
        catch (error) {
            // 记下来给外层 catch 判定失败阶段用(与拆分前口径一致: 取模型输出这步失败就记作 JSON 解析)
            parseError = error instanceof Error ? error : Error(String(error));
            throw error;
        }
        timing.请求 += 请求结果.请求耗时;
        timing.请求次数 += 请求结果.请求次数;
        parsed = 请求结果.parsed;
        const applyStart = Date.now();
        const autoTrack = settings.更新.自动建档 !== false;
        const newData = applyUpdate(data, parsed, timeJump, playerName, autoTrack);
        const updatedNpcs = [];
        const removedNpcs = [];
        if (parsed && typeof parsed === 'object') {
            for (const [name, card] of Object.entries(parsed)) {
                // 顶层非 NPC 键(剧情时间/受孕事件/思考流程)不计入"已更新"统计
                if (name === '剧情时间' || name === '受孕事件' || THINKING_FIELD_KEYS.includes(name))
                    continue;
                if (name === '移除NPC') {
                    if (Array.isArray(card))
                        removedNpcs.push(...card.map(String).filter(Boolean));
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
        // 自动建档关闭时: 被跳过的新角色不计入"已更新"统计(实际未建档), 与提示口径一致
        const skippedNewNpcs = autoTrack ? [] : updatedNpcs.filter(name => !(newData.名单.includes(name) || newData.NPC[name]));
        if (!autoTrack && skippedNewNpcs.length > 0) {
            for (const name of skippedNewNpcs) {
                const idx = updatedNpcs.indexOf(name);
                if (idx >= 0)
                    updatedNpcs.splice(idx, 1);
            }
        }
        debugStore.record({ time: Date.now(), updatedNpcs, removedNpcs });
        timing.解析应用 = Date.now() - applyStart;
        const finalizeStart = Date.now();
        // 把更新后的状态整体写入本次分析的最后一条楼层(快照随该楼层存亡:
        // 删除楼层/重roll时状态自动回退, 楼层被编辑时由楼层hash校验作废), 并同步清空层清零
        const anchorFloor = recent[recent.length - 1].message_id;
        newData.处理到楼层 = anchorFloor;
        newData.清空层 = 0;
        const stateStore = useStateStore();
        if (writeStateSnapshot(newData, anchorFloor, anchorFloor, true)) {
            stateStore.data = { ...newData, 锚点楼层: anchorFloor };
        }
        else {
            stateStore.data = newData;
        }
        // 同步幕后状态到角色卡主世界书(蓝灯常驻条目), 供主AI与数据库剧情推进读取
        if (settings.更新.注入世界书条目) {
            _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__.syncNpcStatesWorldbook(host, newData, true).catch(error => {
                console.error('[彼方] 同步世界书条目失败:', error);
            });
        }
        timing.收尾 = Date.now() - finalizeStart;
        const secs = (ms) => (ms / 1000).toFixed(1);
        console.info(`[彼方] 本次更新总耗时 ${secs(Date.now() - timing.start)}s = 前置 ${secs(timing.前置)}s + 世界书 ${secs(timing.世界书)}s + 接口请求 ${secs(timing.请求)}s(${timing.请求次数}次) + 解析应用 ${secs(timing.解析应用)}s + 收尾 ${secs(timing.收尾)}s`);
        console.info(`[彼方] 幕后NPC状态更新完成: ${updatedNpcs.join('、') || '(本次无重要NPC变化)'}${removedNpcs.length > 0 ? `; 已移除: ${removedNpcs.join('、')}` : ''}`);
        _toast__WEBPACK_IMPORTED_MODULE_7__.toastSuccess(updatedNpcs.length > 0
            ? `彼方: 已更新 ${updatedNpcs.length} 个NPC的幕后状态${removedNpcs.length > 0 ? `，移除 ${removedNpcs.length} 个NPC` : ''}`
            : removedNpcs.length > 0
                ? `彼方: 已移除 ${removedNpcs.length} 个NPC`
                : '彼方: 本次没有重要NPC的幕后状态变化', '彼方');
    }
    catch (error) {
        if (abortSignal.aborted) {
            const message = '更新已中断';
            console.warn(`[彼方] 更新被中断: 已进行 ${((Date.now() - timing.start) / 1000).toFixed(1)}s(接口请求 ${timing.请求次数} 次, 累计 ${((timing.请求) / 1000).toFixed(1)}s)`);
            debugStore.record({ time: Date.now(), error: message });
            _toast__WEBPACK_IMPORTED_MODULE_7__.toastInfo(`彼方: ${message}`, '彼方');
            return;
        }
        console.error('[彼方] 更新失败:', error);
        const settingsNow = _settings__WEBPACK_IMPORTED_MODULE_3__.getSettings();
        const stack = error instanceof Error ? (error.stack ?? '') : '';
        const message = error instanceof Error ? error.message : String(error);
        const detail = [
            '[彼方] 更新失败',
            `阶段: ${parseError && parsed === null ? 'JSON 解析' : '接口调用/其他'}`,
            `耗时: 总 ${((Date.now() - timing.start) / 1000).toFixed(1)}s(前置 ${(timing.前置 / 1000).toFixed(1)}s / 世界书 ${(timing.世界书 / 1000).toFixed(1)}s / 接口请求 ${(timing.请求 / 1000).toFixed(1)}s×${timing.请求次数}次 / 解析应用 ${(timing.解析应用 / 1000).toFixed(1)}s)`,
            `接口: ${maskBaseUrl(settingsNow.接口.地址) || '(未填)'} / 模型: ${settingsNow.接口.模型 || '(未选)'} / 最大token: ${settingsNow.接口.最大token}`,
            `错误: ${message}`,
            ...(stack ? ['堆栈:', stack] : []),
        ].join('\n');
        debugStore.record({ time: Date.now(), error: detail });
        _toast__WEBPACK_IMPORTED_MODULE_7__.toastError(message, '彼方更新失败');
    }
    finally {
        isUpdating = false;
        updatingStore.stop('幕后');
    }
}

/** 切聊天时重置按楼层号缓存的数据(两个聊天楼层号可能相同, 不重置会用到上一聊天的楼层内容) */
function resetChatCaches() {
    allAssistantCache = null;
}
export { createTextFilter as createTextFilterExported, detectTimeJump, getAllAssistantMessagesCached, resetChatCaches, updateNpcStates };
