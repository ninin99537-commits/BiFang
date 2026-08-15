// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _prompts__WEBPACK_IMPORTED_MODULE_0__ from './prompts';
import * as _state__WEBPACK_IMPORTED_MODULE_1__ from './state';

/* harmony export */ 

function isBifangEntry(entry) {
    return entry?.name === _state__WEBPACK_IMPORTED_MODULE_1__.BIFANG_WORLDBOOK_ENTRY_NAME || entry?.extra?.bifang === true;
}
/** 数据库脚本(ACU)剧情推进的"条目屏蔽"关键词：命中则条目不进剧情推进上下文 */
const ACU_BLOCKED_KEYWORDS = ['规则', '思维链', 'cot', 'MVU', 'mvu', '变量', '状态', 'Status', 'Rule', 'rule', '检定', '判断', '叙事', '文风', 'InitVar', '格式'];
/** 若条目名命中 ACU 屏蔽词(如旧名"…幕后NPC状态"含"状态"), 改回安全条目名, 否则保留用户自定义名 */
function sanitizeBifangEntryName(currentName) {
    const name = String(currentName || '').trim();
    return ACU_BLOCKED_KEYWORDS.some(keyword => name.includes(keyword)) ? _state__WEBPACK_IMPORTED_MODULE_1__.BIFANG_WORLDBOOK_ENTRY_NAME : name;
}
/**
 * 把彼方幕后状态写入**当前角色卡主世界书**里的常驻条目(蓝灯常开):
 * - 主AI读取激活世界书时读到; 数据库剧情推进读取角色绑定世界书(主世界书)时也读到;
 * - 角色主世界书是共享的, 因此切换聊天时(handleChatChanged)会重新注入当前聊天的内容;
 * - 关闭或无NPC时删除该条目。
 * 彼方自己读取世界书时会在 getActiveWorldbookText 里排除本条目。
 */
async function syncNpcStatesWorldbook(data, enabled) {
    try {
        let wbName = null;
        try {
            wbName = getCharWorldbookNames('current').primary ?? null;
        }
        catch {
            wbName = null;
        }
        if (!wbName) {
            if (enabled)
                toastr.warning('当前角色卡没有绑定主世界书，无法注入「NPC幕后生活」条目。请先在角色卡上绑定一本世界书。', '彼方');
            return;
        }
        const npcEntries = Object.entries(data.NPC ?? {});
        if (!enabled || npcEntries.length === 0) {
            await deleteWorldbookEntries(wbName, isBifangEntry);
            return;
        }
        const content = _prompts__WEBPACK_IMPORTED_MODULE_0__.buildInjectionPrompt(npcEntries, data.在场NPC ?? []);
        const existing = (await getWorldbook(wbName)).find(isBifangEntry);
        if (existing) {
            // 保留其它字段, 只刷新内容; 确保防递归开启; 名字若命中 ACU 屏蔽词则改回安全名
            await updateWorldbookWith(wbName, wb => wb.map(entry => isBifangEntry(entry)
                ? {
                    ...entry,
                    name: sanitizeBifangEntryName(entry.name || _state__WEBPACK_IMPORTED_MODULE_1__.BIFANG_WORLDBOOK_ENTRY_NAME),
                    content,
                    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
                }
                : entry));
        }
        else {
            // 条目被删除/改名后找不到, 重新创建
            await createWorldbookEntries(wbName, [
                {
                    name: _state__WEBPACK_IMPORTED_MODULE_1__.BIFANG_WORLDBOOK_ENTRY_NAME,
                    content,
                    enabled: true,
                    probability: 100,
                    strategy: {
                        type: 'constant',
                        keys: [],
                        keys_secondary: { logic: 'not_any', keys: [] },
                        scan_depth: 'same_as_global',
                    },
                    position: { type: 'after_character_definition', role: 'system', depth: 0, order: 100 },
                    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
                    extra: { bifang: true },
                },
            ]);
        }
    }
    catch (error) {
        console.error('[彼方] 同步幕后状态到世界书失败:', error);
    }
}

export { syncNpcStatesWorldbook };
