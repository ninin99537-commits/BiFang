// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import type { Host } from './host';
import * as _prompts__WEBPACK_IMPORTED_MODULE_0__ from './prompts';
import { BIFANG_WORLDBOOK_ENTRY_NAME } from './快照';
import { useMainPromptStore } from './日志仓';

/* harmony export */ 

function isBifangEntry(entry) {
    return entry?.name === BIFANG_WORLDBOOK_ENTRY_NAME || entry?.extra?.bifang === true;
}
/** 数据库脚本(ACU)剧情推进的"条目屏蔽"关键词：命中则条目不进剧情推进上下文 */
const ACU_BLOCKED_KEYWORDS = ['规则', '思维链', 'cot', 'MVU', 'mvu', '变量', '状态', 'Status', 'Rule', 'rule', '检定', '判断', '叙事', '文风', 'InitVar', '格式'];
/** 若条目名命中 ACU 屏蔽词(如旧名"…幕后NPC状态"含"状态"), 改回安全条目名, 否则保留用户自定义名 */
function sanitizeBifangEntryName(currentName) {
    const name = String(currentName || '').trim();
    return ACU_BLOCKED_KEYWORDS.some(keyword => name.includes(keyword)) ? BIFANG_WORLDBOOK_ENTRY_NAME : name;
}
/**
 * 把彼方幕后状态写入**当前角色卡主世界书**里的常驻条目(蓝灯常开):
 * - 主AI读取激活世界书时读到; 数据库剧情推进读取角色绑定世界书(主世界书)时也读到;
 * - 角色主世界书是共享的, 因此切换聊天时(handleChatChanged)会重新注入当前聊天的内容;
 * - 关闭或无NPC时删除该条目。
 * 彼方自己读取世界书时会在 getActiveWorldbookText 里排除本条目。
 *
 * 平台访问全部走 host.worldbook / host.toast(见 host.ts), 本函数不直接碰酒馆全局——
 * 于是测试里能塞一本假世界书进来, 把"新建 / 更新 / 改名 / 删除 / 没绑世界书"几种情形都跑一遍。
 * 这里保留的是**领域规则**(条目叫什么名、蓝灯常开、防递归、内容怎么渲染), 与平台无关。
 */
async function syncNpcStatesWorldbook(host: Pick<Host, 'worldbook' | 'toast'>, data, enabled) {
    try {
        const wbName = host.worldbook.boundNames().primary;
        if (!wbName) {
            if (enabled)
                host.toast.warn('当前角色卡没有绑定主世界书，无法注入「NPC幕后生活」条目。请先在角色卡上绑定一本世界书。', '彼方');
            return;
        }
        const npcEntries = Object.entries(data.NPC ?? {});
        if (!enabled || npcEntries.length === 0) {
            await host.worldbook.remove(wbName, isBifangEntry);
            return;
        }
        const content = _prompts__WEBPACK_IMPORTED_MODULE_0__.buildInjectionPrompt(npcEntries);
        // 日志页「彼方写入世界书的内容」记录: 与写入条目的内容完全一致(同一个渲染函数),
        // 主AI 以及任何读取该世界书的环节读到的就是这一段
        useMainPromptStore().record(content);
        const existing = (await host.worldbook.entries(wbName)).find(isBifangEntry);
        if (existing) {
            // 保留其它字段, 只刷新内容; 确保防递归开启; 名字若命中 ACU 屏蔽词则改回安全名
            await host.worldbook.update(wbName, wb => wb.map(entry => isBifangEntry(entry)
                ? {
                    ...entry,
                    name: sanitizeBifangEntryName(entry.name || BIFANG_WORLDBOOK_ENTRY_NAME),
                    content,
                    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
                }
                : entry));
        }
        else {
            // 条目被删除/改名后找不到, 重新创建
            await host.worldbook.create(wbName, [
                {
                    name: BIFANG_WORLDBOOK_ENTRY_NAME,
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
