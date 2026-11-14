// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { pinia } from './pinia';
import { getSettings } from './settings';
import { loadData } from './快照';
import { useStateStore } from './数据仓';
import { captureConsole, useDebugStore } from './日志仓';
import { updateNpcStates } from './update';
import { 全部AI楼层, 正文过滤 } from './聊天取料';
import { resetWorldbookCaches } from './worldbook';
import { 报告世界书失败, syncNpcStatesWorldbook } from './worldbook-inject';
import { mountFloatingOrb } from './悬浮球界面';
import { setActivePinia } from 'pinia';
import { createTavernHost } from './host';
import type { Host } from './host';
import { 构建标识 } from './构建';

// 脚本入口就是平台边界: 真实宿主在这里构造一次, 往下只传窄能力(host.worldbook 等)或直接传值。
// 平台全局(getVariables/getChatMessages/getWorldbook…)只在 host.ts 里出现, 见那边的约定。
const host = createTavernHost();
/** 酒馆助手脚本库里的按钮名: 注册与监听共用同一个名字 */
const 脚本按钮名 = '打开彼方';

setActivePinia(pinia);
captureConsole();
function handleChatChanged(host: Host) {
    // 切聊天只刷新数据与注入，不再整页重载，避免悬浮球闪烁消失
    resetWorldbookCaches();
    useStateStore().reload(host);
    useDebugStore().clear();
    // 关着也要走一趟: 换到的这场聊天可能还留着上一个开关状态写下的条目
    maybeInjectNpcStates(host);
}
async function handleMessageReceived(host: Host, message_id: number) {
    const settings = getSettings(host);
    if (!settings.启用幕后)
        return; // 幕后总开关: 关闭时不调用 API 不更新
    if (!settings.更新.自动更新)
        return;
    let latest;
    try {
        const messages = host.chat.messages(message_id);
        latest = messages[messages.length - 1];
    }
    catch {
        return;
    }
    if (!latest || latest.role !== 'assistant' || latest.is_hidden)
        return;
    // 正文回复过短(疑似被截断/内容太少、没有足够剧情)时跳过自动更新, 避免浪费一次更新请求。
    // 用**标签过滤后**的文本判断——与实际发送给接口的内容同口径: 思维链占比高的回复
    // 用原文判断会误以为很长, 过滤后才是真正的剧情正文。
    // 长度统计: 仅剔除换行/制表等结构空白, 保留普通空格——对中文/英文/代码块都更接近真实字数;
    // 旧版把所有 \s+ 全删掉, 英文文本会被严重低估(空格全没, 单词粘连算 1 字)。
    const filter = 正文过滤(settings.标签);
    const replyText = filter(String(latest.message || '')).replace(/[\r\n\t]+/g, '').trim();
    if (replyText.length < 500) {
        console.warn(`[彼方] 最新正文回复过短(过滤后 ${replyText.length}字), 疑似被截断, 已跳过本次自动更新`);
        return;
    }
    const frequency = Math.max(1, settings.更新.更新频率);
    if (frequency > 1) {
        // 全部 AI 楼层列表: 已排除隐藏楼层, 与 最近回复 的可见口径一致
        // ——用 getChatMessages 全量扫会包含隐藏楼层导致频率算错
        const assistantCount = 全部AI楼层(host).length;
        if (assistantCount % frequency !== 0)
            return;
    }
    await updateNpcStates(host);
}
function maybeInjectNpcStates(host: Host) {
    const settings = getSettings(host);
    const data = loadData(host);
    // 总开关关掉 = 与「写入世界书: 关闭」同一件事: 把两本里彼方的条目删掉。
    // 不这么做的话, 上一轮写进去的常驻条目会一直留在世界书里, 主AI 继续读一份过期状态。
    const 目标 = settings.启用幕后 ? settings.更新.世界书写入 : '关闭';
    // 同步失败要报到界面: 这条链路是 fire-and-forget, 吞掉异常等于"关掉了但没清干净"没人知道。
    syncNpcStatesWorldbook(host, data, 目标, undefined, settings.更新.生理监测).catch(error => 报告世界书失败(host, error));
}
$(function () {
    // 状态快照存在楼层变量里, 随楼层存亡——删除楼层/重roll(新swipe页没有快照)时状态
    // 自动回退。因此事件处理只剩"刷新界面与世界书注入":
    // - MESSAGE_DELETED 只"延迟"刷新, 若 2 秒内收到新消息(regenerate/重roll)则取消,
    //   由 MESSAGE_RECEIVED 的正常更新流程自然同步, 避免中间态闪烁;
    //   手动删除楼层(无后续新消息)才真正刷新。
    // - MESSAGE_SWIPED(切分支): 切回旧swipe页会恢复该页当时的快照, 新页则回退到更早
    //   楼层的快照, 刷新即可。
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    function clearPendingRefresh() {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    }
    function refreshAfterFloorChange(host: Host) {
        useStateStore().reload(host);
        // 与切聊天同理: 关着也要走一趟(该删的条目还在)
        maybeInjectNpcStates(host);
    }
    host.events.onMessageReceived(message_id => {
        // 重roll/regenerate 的新消息到达: 取消待处理的删除刷新(更新完成后会自然同步)
        clearPendingRefresh();
        handleMessageReceived(host, message_id).catch(error => {
            console.error('[彼方] 消息处理失败:', error);
        });
    });
    host.events.onMessageDeleted(() => {
        clearPendingRefresh();
        // 延迟执行: 若是重roll/regenerate 的"删旧", 新消息到达时 clearPendingRefresh 取消;
        // 手动删除楼层(无后续新消息)才真正刷新
        refreshTimer = setTimeout(function () {
            refreshTimer = null;
            refreshAfterFloorChange(host);
        }, 2000);
    });
    host.events.onMessageSwiped(() => {
        refreshAfterFloorChange(host);
    });
    host.events.onGenerationAfterCommands(() => {
        if (getSettings(host).启用幕后)
            maybeInjectNpcStates(host);
    });
    // 读不到时返回 null, 此时首次 CHAT_CHANGED 事件直接刷新
    let lastChatId = host.chat.currentChatId();
    host.events.onChatChanged(new_chat_id => {
        if (lastChatId !== new_chat_id) {
            lastChatId = new_chat_id;
            handleChatChanged(host);
        }
    });
    // 脚本按钮「打开彼方」: 悬浮球被拖出视口 / 被收纳坞收走 / 被别的插件盖住时的备用入口。
    // 注册失败不影响悬浮球这条主路径, 所以整段包在 try 里。
    try {
        host.script.注册按钮(脚本按钮名);
        host.script.监听按钮(脚本按钮名, () => 界面.打开面板());
    } catch (error) {
        console.warn('[彼方] 注册脚本按钮失败(悬浮球不受影响):', error);
    }
    console.info(`[彼方] NPC幕后生命状态系统已加载 (构建 ${构建标识})`);
});

// 界面挂载器也是边界: 把同一个宿主交给悬浮球界面
const 界面 = mountFloatingOrb(host);

