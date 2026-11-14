import type { Host } from './host';
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { buildInjectionPrompt } from './prompts';
import { BIFANG_WORLDBOOK_ENTRY_NAME, isBifangEntry, sanitizeBifangEntryName } from './彼方条目';
import { useMainPromptStore } from './日志仓';
import type { 世界书写入目标 } from './settings';

/**
 * 把彼方幕后状态写入一本世界书里的常驻条目(蓝灯常开):
 * - 角色卡主世界书: 主AI读取激活世界书时读到; 数据库剧情推进读取角色绑定世界书(主世界书)时也读到;
 * - 聊天世界书: 一场聊天一本, 群聊里各成员绑的卡不同也不会写串;
 * - 关闭: 把彼方条目从两本里都删掉(不知道上次写的是哪本, 索性都清一遍)。
 * 目标那本没绑时由 getOrCreateChat 建一本并绑上, 于是"开着开关但没绑书"不会静默不写。
 * 换目标不清理另一本: 旧条目留在原处, 由用户自己删。
 *
 * 平台访问全部走 host.worldbook(见 host.ts), 本函数不直接碰酒馆全局——
 * 于是测试里能塞一本假世界书进来, 把"新建 / 更新 / 改名 / 删除 / 没绑世界书"几种情形都跑一遍。
 * 这里保留的是**领域规则**(条目叫什么名、蓝灯常开、防递归、内容怎么渲染), 与平台无关。
 *
 * `未回票` 是**逐轮临时**的(来自本轮合并, 不落库): 本轮没被模型过问的进行中编号, 用来给那几条
 * 加上"（未表态，待确认）"。切聊天时 `handleChatChanged` 会不带它重写世界书 → 标记自然消失,
 * 语义正确——它描述的只是"这一轮"。
 */

/** 要写入的那本世界书; 关闭时返回 null, 取不到/建不出也返回 null */
async function 目标世界书(host: Pick<Host, 'worldbook'>, 目标: 世界书写入目标): Promise<string | null> {
    if (目标 === '角色卡主世界书')
        return host.worldbook.boundNames().primary;
    if (目标 === '聊天世界书') {
        try {
            return await host.worldbook.getOrCreateChat();
        }
        catch (error) {
            // 建/取书本身炸了(平台侧失败): 把原因带上去, 否则上层只能说"取不到", 排查无从下手
            throw Error(`取聊天世界书失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return null;
}

/** 关掉开关时要清理的世界书: 两本都试, 都不建新书 */
function 已有世界书(host: Pick<Host, 'worldbook'>): string[] {
    const names = [];
    const primary = host.worldbook.boundNames().primary;
    if (primary)
        names.push(primary);
    const chat = host.worldbook.chatName();
    if (chat && !names.includes(chat))
        names.push(chat);
    return names;
}

/**
 * 失败文案的唯一来源: 五个调用方(启动/切聊天、AI 更新、界面改设置、数据变更、清空)
 * 与 报告世界书失败 共用同一句, 同一种失败玩家读到的话才一样。
 *
 * 必须是"哪一步失败 + 怎么改": 只说"同步失败"等于让玩家去猜。
 */
function 世界书失败文案(error: unknown): string {
    return `写入世界书失败：${error instanceof Error ? error.message : String(error)}`;
}

/**
 * 同步世界书失败的**唯一上报出口**: 四个调用方(启动/切聊天、AI 更新、界面改设置、数据变更)
 * 都走它, 于是同一件事只弹一条 —— 以前注入层自己弹一条、调用方再弹一条, 玩家看到两条。
 */
function 报告世界书失败(host: Pick<Host, 'toast'>, error: unknown): void {
    console.error('[彼方] 同步世界书条目失败:', error);
    host.toast.warn(世界书失败文案(error), '彼方');
}

async function syncNpcStatesWorldbook(host: Pick<Host, 'worldbook'>, data, 目标: 世界书写入目标, 未回票?: Record<string, string[]>, 生理监测 = true) {
    if (目标 === '关闭') {
        for (const name of 已有世界书(host))
            await host.worldbook.remove(name, isBifangEntry);
        return;
    }
    const wbName = await 目标世界书(host, 目标);
    if (!wbName) {
        // 群聊里没有"当前角色卡"(this_chid 为空), 所以「角色卡主世界书」这一档在群聊里根本取不到书名。
        // 群聊能写的只有聊天世界书(一场一本, 不随发言者漂移)—— 原因里要说清楚, 否则用户会去反复改卡上的绑定。
        const 群聊 = host.worldbook.groupMemberNames().length > 0;
        throw Error(目标 === '角色卡主世界书'
            ? (群聊
                ? '群聊里没有「当前角色卡」，写不进角色卡主世界书；请把「写入世界书」改成「聊天世界书」'
                : '当前角色卡没有绑定主世界书；请先在角色卡上绑定一本世界书')
            : '没能取到当前聊天的世界书；请先在聊天上绑定一本世界书');
    }
    const npcEntries = Object.entries(data.NPC ?? {});
    if (npcEntries.length === 0) {
        await host.worldbook.remove(wbName, isBifangEntry);
        return;
    }
    const content = buildInjectionPrompt(npcEntries, 未回票, String(data?.剧情时间 ?? ''), 生理监测);
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

export { 世界书失败文案, 报告世界书失败, syncNpcStatesWorldbook };

