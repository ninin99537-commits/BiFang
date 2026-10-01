// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _api__WEBPACK_IMPORTED_MODULE_1__ from './api';
import * as _prompts__WEBPACK_IMPORTED_MODULE_2__ from './prompts';
import * as _settings__WEBPACK_IMPORTED_MODULE_3__ from './settings';
import * as _worldbook__WEBPACK_IMPORTED_MODULE_4__ from './worldbook';
import * as _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__ from './worldbook-inject';
import { loadData, updateClearLayer, writeStateSnapshot } from './快照';
import { useStateStore } from './数据仓';
import { useDebugStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import * as _toast__WEBPACK_IMPORTED_MODULE_7__ from './toast';
import { PHYSIO_CYCLE_MAX, PHYSIO_CYCLE_MIN, PHYSIO_FIELDS } from './生理规则';
import { useHost } from './host';
import { THINKING_FIELD_KEYS, 请求并校验 } from './模型请求';
import { applyUpdate, extractCurrentTimeHint, maskBaseUrl } from './应用更新';

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
