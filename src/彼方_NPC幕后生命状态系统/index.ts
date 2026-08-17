// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _pinia__WEBPACK_IMPORTED_MODULE_0__ from './pinia';
import * as _prompts__WEBPACK_IMPORTED_MODULE_1__ from './prompts';
import * as _settings__WEBPACK_IMPORTED_MODULE_2__ from './settings';
import * as _state__WEBPACK_IMPORTED_MODULE_3__ from './state';
import * as _update__WEBPACK_IMPORTED_MODULE_4__ from './update';
import * as _worldbook_inject__WEBPACK_IMPORTED_MODULE_5__ from './worldbook-inject';
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
    eventOn(tavern_events.MESSAGE_RECEIVED, message_id => {
        handleMessageReceived(message_id).catch(error => {
            console.error('[彼方] 消息处理失败:', error);
        });
    });
    eventOn(tavern_events.MESSAGE_DELETED, message_id => {
        // 幕后总开关关闭时跳过回滚(避免意外改写状态数据)
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            _update__WEBPACK_IMPORTED_MODULE_4__.maybeRollback();
    });
    eventOn(tavern_events.MESSAGE_SWIPED, () => {
        // 幕后总开关关闭时跳过回滚
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            _update__WEBPACK_IMPORTED_MODULE_4__.maybeRollback();
    });
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, () => {
        if (_settings__WEBPACK_IMPORTED_MODULE_2__.getSettings().启用幕后)
            maybeInjectNpcStates();
    });
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
    });
    console.info('[彼方] NPC幕后生命状态系统已加载');
});
