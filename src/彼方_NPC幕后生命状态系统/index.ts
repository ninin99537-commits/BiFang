// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _pinia__WEBPACK_IMPORTED_MODULE_0__ from './pinia';
import * as _prompts__WEBPACK_IMPORTED_MODULE_1__ from './prompts';
import * as _settings__WEBPACK_IMPORTED_MODULE_2__ from './settings';
import * as _state__WEBPACK_IMPORTED_MODULE_3__ from './state';
import * as _update__WEBPACK_IMPORTED_MODULE_4__ from './update';
import * as _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__ from './worldbook-inject';
import * as _dialogue_render__WEBPACK_IMPORTED_MODULE_6__ from './dialogue-render';
import './悬浮球界面';
import * as pinia__WEBPACK_IMPORTED_MODULE_8__ from 'pinia';

pinia__WEBPACK_IMPORTED_MODULE_8__.setActivePinia(_pinia__WEBPACK_IMPORTED_MODULE_0__.pinia);
_state__WEBPACK_IMPORTED_MODULE_3__.captureConsole();
function handleChatChanged() {
    // 切聊天只刷新数据与注入，不再整页重载，避免悬浮球闪烁消失
    _state__WEBPACK_IMPORTED_MODULE_3__.useStateStore().reload();
    _state__WEBPACK_IMPORTED_MODULE_3__.useDebugStore().clear();
    if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
        maybeInjectNpcStates();
}
/** 渲染指定楼层, 若 3 秒后仍未真正渲染成对话界面(消息 DOM 未就绪/仍为原文)则自动重试一次, 避免偶发"AI输出了但没自动渲染" */
function renderMessageWithRetry(messageId, label) {
    const render = () => _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderMessageById(messageId).catch(error => console.warn(`[彼方] ${label}失败:`, error));
    render();
    window.setTimeout(() => {
        try {
            const el = _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.findMessageTextElement(messageId);
            // 判定是否真正渲染成对话界面: reader 内出现对白行/旁白块; 元素不存在或只回退成原文都算未渲染
            const hasDialogueUi = !!el && !!(el.querySelector('.bfd-reader .bfd-line') || el.querySelector('.bfd-reader .bfd-narration'));
            if (!el || !hasDialogueUi) {
                console.warn(`[彼方] ${label}未完成(消息DOM未就绪或仍为原文), 自动重试`);
                render();
            }
        }
        catch {
            render();
        }
    }, 3000);
}
async function handleMessageReceived(message_id) {
    const settings = _settings__WEBPACK_IMPORTED_MODULE_2__.getSettings();
    if (!settings.启用幕后)
        return; // 幕后总开关: 关闭时不调用 API 不更新
    if (!settings.更新.自动更新)
        return;
    let latest;
    try {
        const messages = getChatMessages(message_id);
        latest = messages[messages.length - 1];
    }
    catch {
        return;
    }
    if (!latest || latest.role !== 'assistant' || latest.is_hidden)
        return;
    // 正文回复过短(疑似被截断/内容太少、没有足够剧情)时跳过自动更新, 避免浪费一次更新请求
    const replyText = String(latest.message || '').replace(/\s+/g, '').trim();
    if (replyText.length < 100) {
        console.warn(`[彼方] 最新正文回复过短(${replyText.length}字), 疑似被截断, 已跳过本次自动更新`);
        return;
    }
    const frequency = Math.max(1, settings.更新.更新频率);
    if (frequency > 1) {
        const assistantCount = getChatMessages(`0-${getLastMessageId()}`, {
            role: 'assistant',
        }).length;
        if (assistantCount % frequency !== 0)
            return;
    }
    await _update__WEBPACK_IMPORTED_MODULE_4__.updateNpcStates();
}
function maybeInjectNpcStates() {
    const settings = _settings__WEBPACK_IMPORTED_MODULE_2__.getSettings();
    const data = _state__WEBPACK_IMPORTED_MODULE_3__.loadData();
    const npcEntries = Object.entries(data.NPC);
    // 开了"注入世界书条目"时: 写入角色主世界书(蓝灯常驻), 主AI与数据库剧情推进都会读取激活世界书;
    // 无论有无 NPC 都同步(无则删除条目), 保证切换聊天后不会残留上一个聊天的内容
    if (settings.更新.注入世界书条目) {
        _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__.syncNpcStatesWorldbook(data, true);
        return;
    }
    if (npcEntries.length === 0)
        return;
    if (!settings.更新.注入到AI)
        return;
    const content = _prompts__WEBPACK_IMPORTED_MODULE_1__.buildInjectionPrompt(npcEntries, data.在场NPC ?? []);
    // 记录彼方注入给主AI的内容，供日志页查看
    _state__WEBPACK_IMPORTED_MODULE_3__.useMainPromptStore().record(content);
    injectPrompts([
        {
            id: `bifang_npc_states_${getScriptId()}`,
            position: 'in_chat',
            depth: 0,
            role: 'system',
            content,
        },
    ], { once: true });
}
$(() => {
    appendInexistentScriptButtons([{ name: '彼方·手动更新', visible: true }]);
    eventOn(getButtonEvent('彼方·手动更新'), () => {
        // 幕后总开关: 关闭时不调用 API, 不更新状态(已有状态数据保留)
        if (!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后) {
            toastr.warning('幕后系统已关闭(设置→启用幕后), 如需更新请先开启', '彼方');
            return;
        }
        _update__WEBPACK_IMPORTED_MODULE_4__.updateNpcStates(true).catch(error => {
            console.error('[彼方] 手动更新失败:', error);
        });
    });
    eventOn(tavern_events.MESSAGE_RECEIVED, message_id => {
        handleMessageReceived(message_id).catch(error => {
            console.error('[彼方] 消息处理失败:', error);
        });
    });
    eventOn(tavern_events.MESSAGE_DELETED, message_id => {
        // 幕后总开关关闭时跳过回滚(避免意外改写状态数据), 但仍清理渲染缓存
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            _update__WEBPACK_IMPORTED_MODULE_4__.maybeRollback();
        // 清理被删除楼层的正文解析缓存, 避免 localStorage 残留垃圾数据
        if (message_id != null)
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.clearMessageCache(Number(message_id));
    });
    eventOn(tavern_events.MESSAGE_SWIPED, message_id => {
        // 幕后总开关关闭时跳过回滚; 正文渲染独立不受影响
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            _update__WEBPACK_IMPORTED_MODULE_4__.maybeRollback();
        // 正文渲染: 重roll 后楼层内容变化, 清缓存并重新渲染最新层(避免显示旧渲染/内容错位)
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用) {
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
            const id = Number(message_id);
            if (Number.isFinite(id) && id > 0) {
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.clearMessageCache(id);
                renderMessageWithRetry(id, '重roll后渲染');
            }
            else {
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.reRenderLatestMessage().catch(error => console.warn('[彼方] 重roll后重新渲染失败:', error));
            }
        }
    });
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, () => {
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            maybeInjectNpcStates();
    });
    // 设置变化时: 处理"正文渲染"开关切换
    // (酒馆助手的脚本设置界面里改"正文渲染·启用"会触发 SETTINGS_UPDATED;
    //  关闭→清除已渲染楼层, 开启→重新渲染当前聊天里已渲染过的楼层)
    {
        let lastDialogueEnabled = !!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用;
        eventOn(tavern_events.SETTINGS_UPDATED, () => {
            const nowEnabled = !!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用;
            if (nowEnabled === lastDialogueEnabled)
                return;
            lastDialogueEnabled = nowEnabled;
            if (nowEnabled) {
                // 开启: 注入样式并重新渲染已缓存楼层(不触发解析, 复用缓存)
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderCachedMessagesInChat().catch(error => console.warn('[彼方] 重开渲染后恢复楼层失败:', error));
            }
            else {
                // 关闭: 清除所有已渲染楼层, 恢复原文显示
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.clearDialogueRenders();
            }
        });
    }
    let lastChatId = null;
    try {
        lastChatId = SillyTavern.getCurrentChatId();
    }
    catch {
        // 读取失败则首次 CHAT_CHANGED 事件直接刷新
    }
    eventOn(tavern_events.CHAT_CHANGED, new_chat_id => {
        if (lastChatId !== new_chat_id) {
            lastChatId = new_chat_id;
            handleChatChanged();
        }
        // 正文渲染: 等楼层加载后, 恢复"有缓存"楼层的渲染(不触发解析; 之前渲染过的切回时仍在)
        // 多跑几轮: 酒馆切换聊天后消息 DOM 是渐进的, 只跑一次可能漏掉晚渲染的楼层
        for (const delay of [800, 2500, 5000]) {
            window.setTimeout(() => {
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderCachedMessagesInChat().catch(error => console.warn('[彼方] 恢复已渲染楼层失败:', error));
            }, delay);
        }
    });
    // 正文对白视觉渲染: 新消息完成时解析并渲染(只改显示, 不改原始正文; 不遍历历史楼层, 不打断流式生成)
    const settings0 = _settings__WEBPACK_IMPORTED_MODULE_2__.getSettings();
    if (settings0.正文渲染?.启用) {
        _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
        // 刷新页面/脚本重载后彼方 iframe 重新加载: 先恢复 localStorage 持久化的解析缓存,
        // 再主动恢复"有缓存"楼层的渲染(CHAT_CHANGED 可能在绑定前已触发, 不能只依赖它)
        _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.loadParseCache();
        for (const delay of [1500, 3500]) {
            window.setTimeout(() => {
                _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderCachedMessagesInChat().catch(error => console.warn('[彼方] 初始化恢复已渲染楼层失败:', error));
            }, delay);
        }
    }
    eventOn(tavern_events.MESSAGE_RECEIVED, message_id => {
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用) {
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
            renderMessageWithRetry(Number(message_id), '正文渲染');
        }
    });
    // 流式优化: 正文标签一旦闭合就提前解析, 楼层生成完(MESSAGE_RECEIVED)时直接复用, 减少等待
    // 主AI生成走 tavern_events.STREAM_TOKEN_RECEIVED(带当前完整流式文本); iframe_events.STREAM_TOKEN_RECEIVED_FULLY
    // 只在酒馆助手自身 generate/generateRaw 流式调用时触发(如幕后更新的生成), 两者都监听以覆盖所有流式来源
    if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用) {
        const handleStreaming = (full_text) => {
            if (!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用)
                return;
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.preParseStreamingContent(full_text).catch(() => { });
        };
        eventOn(tavern_events.STREAM_TOKEN_RECEIVED, handleStreaming);
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, handleStreaming);
    }
    // 编辑正文后重新渲染; 流式生成中不渲染(避免打断), 编辑完成(非生成中)才渲染
    eventOn(tavern_events.MESSAGE_UPDATED, message_id => {
        if (!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用)
            return;
        try {
            const ctx = SillyTavern?.getContext?.();
            if (ctx?.generatingMessage)
                return;
        }
        catch {
            // 忽略
        }
        _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
        _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderMessageById(message_id).catch(error => console.warn('[彼方] 编辑后重新渲染失败:', error));
    });
    // 重roll(换生成结果)后内容变化, 清掉该楼层缓存并重新渲染, 否则停在旧渲染/原文
    eventOn(tavern_events.MESSAGE_SWIPED, message_id => {
        if (!_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().正文渲染?.启用)
            return;
        _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.injectDialogueStyles();
        const id = Number(message_id);
        if (Number.isFinite(id) && id > 0) {
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.clearMessageCache(id);
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.renderMessageById(id).catch(error => console.warn('[彼方] 重roll后渲染失败:', error));
        }
        else {
            _dialogue_render__WEBPACK_IMPORTED_MODULE_6__.reRenderLatestMessage().catch(error => console.warn('[彼方] 重roll后渲染失败:', error));
        }
    });
    console.info('[彼方] NPC幕后生命状态系统已加载');
});

