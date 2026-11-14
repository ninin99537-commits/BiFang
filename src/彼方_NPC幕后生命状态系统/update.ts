// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { chatCompletion } from './api';
import { getSettings } from './settings';
import { syncNpcStatesWorldbook } from './worldbook-inject';
import { writeStateSnapshot } from './快照';
import { useStateStore } from './数据仓';
import { useDebugStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import { toastError, toastInfo, toastSuccess, toastWarning } from './toast';
import { 请求并校验 } from './模型请求';
import { applyUpdate, maskBaseUrl } from './应用更新';
import { 收集本轮输入 } from './更新输入';
import { 全部AI楼层, 重置聊天缓存, 正文过滤 } from './聊天取料';
import type { Host } from './host';

// 流水线入口收一次宿主, 往下传(约定见 host.ts 顶部): 本文件不再自己取宿主,
// 用例把假宿主传给 updateNpcStates 就能把整条更新流程跑一遍。

let isUpdating = false;
async function updateNpcStates(host: Host, force = false) {
    if (isUpdating) {
        console.warn('[彼方] 上一次更新尚未完成, 已跳过本次更新');
        return;
    }
    isUpdating = true;
    // 分段计时: 定位"更新慢"的瓶颈(前置/世界书激活/接口请求/解析应用/收尾)
    const timing = { start: Date.now(), 前置: 0, 世界书: 0, 请求: 0, 请求次数: 0, 解析应用: 0, 收尾: 0 };
    const debugStore = useDebugStore();
    const updatingStore = useUpdatingStore();
    const abortSignal = updatingStore.start('正在分析最近楼层…', '幕后');
    let parsed = null;
    let parseError = null;
    try {
        const settings = getSettings(host);
        const { 地址, 模型 } = settings.接口;
        if (!地址 || !模型) {
            toastWarning('彼方: 尚未配置接口地址或模型, 请先在设置中完成配置', '彼方');
            return;
        }
        const 输入 = await 收集本轮输入({ host, settings, force, timing, debugStore });
        if (!输入) return; // 前置条件不满足(如没有可用的 AI 回复): 上面已经提示过用户
        const { data, messages, playerName, recent, timeJump } = 输入;
        let 请求结果;
        try {
            // 取模型输出这一段已独立成模块(模型请求.ts): 发请求 → 解析 → 校验, 不合格就原样重试
            请求结果 = await 请求并校验({
                messages,
                预填充: settings.更新.预填充,
                现有卡: data.NPC ?? {},
                名单: data.名单 ?? [],
                玩家名: playerName,
                自动建档: settings.更新.自动建档 !== false,
                signal: abortSignal,
                发请求: (messages, options) => chatCompletion(host, messages, options),
                记日志: (partial) => debugStore.record(partial),
                报进度: (文字) => { updatingStore.message = 文字; },
                // 共用请求层在每个出口(成功/失败/中断)都会通知, 失败日志因此不会写成 0 次 0 秒
                记录请求统计: (统计) => {
                    timing.请求 = 统计.请求耗时;
                    timing.请求次数 = 统计.请求次数;
                },
            });
        }
        catch (error) {
            // 记下来给外层 catch 判定失败阶段用(与拆分前口径一致: 取模型输出这步失败就记作 JSON 解析)
            parseError = error instanceof Error ? error : Error(String(error));
            throw error;
        }
        // 统计已由 记录请求统计 回调写入(成功/失败/中断都覆盖), 这里不再累加
        parsed = 请求结果.parsed;
        const applyStart = Date.now();
        const autoTrack = settings.更新.自动建档 !== false;
        // applyUpdate 一处算出"这轮发生了什么"(更新/移除/跳过/未回票), 这里只消费摘要
        const { 数据: newData, 摘要 } = applyUpdate(data, parsed, timeJump, playerName, autoTrack, settings.更新.生理监测);
        debugStore.record({ time: Date.now(), updatedNpcs: 摘要.更新, removedNpcs: 摘要.移除 });
        timing.解析应用 = Date.now() - applyStart;
        const finalizeStart = Date.now();
        // 把更新后的状态整体写入本次分析的最后一条楼层(快照随该楼层存亡:
        // 删除楼层/重roll时状态自动回退, 楼层被编辑时由楼层hash校验作废), 并同步清空层清零
        const anchorFloor = recent[recent.length - 1].message_id;
        newData.处理到楼层 = anchorFloor;
        newData.清空层 = 0;
        const stateStore = useStateStore();
        if (writeStateSnapshot(host, newData, anchorFloor, anchorFloor, true)) {
            stateStore.data = { ...newData, 锚点楼层: anchorFloor };
        }
        else {
            stateStore.data = newData;
        }
        // 同步幕后状态到世界书(蓝灯常驻条目), 供主AI与数据库剧情推进读取
        if (settings.更新.世界书写入 !== '关闭') {
            syncNpcStatesWorldbook(host, newData, settings.更新.世界书写入, 摘要.未回票, settings.更新.生理监测).catch(error => {
                console.error('[彼方] 同步世界书条目失败:', error);
            });
        }
        timing.收尾 = Date.now() - finalizeStart;
        const secs = (ms) => (ms / 1000).toFixed(1);
        console.info(`[彼方] 本次更新总耗时 ${secs(Date.now() - timing.start)}s = 前置 ${secs(timing.前置)}s + 世界书 ${secs(timing.世界书)}s + 接口请求 ${secs(timing.请求)}s(${timing.请求次数}次) + 解析应用 ${secs(timing.解析应用)}s + 收尾 ${secs(timing.收尾)}s`);
        console.info(`[彼方] 幕后NPC状态更新完成: ${摘要.更新.join('、') || '(本次无重要NPC变化)'}${摘要.移除.length > 0 ? `; 已移除: ${摘要.移除.join('、')}` : ''}`);
        toastSuccess(摘要.更新.length > 0
            ? `彼方: 已更新 ${摘要.更新.length} 个NPC的幕后状态${摘要.移除.length > 0 ? `，移除 ${摘要.移除.length} 个NPC` : ''}`
            : 摘要.移除.length > 0
                ? `彼方: 已移除 ${摘要.移除.length} 个NPC`
                : '彼方: 本次没有重要NPC的幕后状态变化', '彼方');
    }
    catch (error) {
        if (abortSignal.aborted) {
            const message = '更新已中断';
            console.warn(`[彼方] 更新被中断: 已进行 ${((Date.now() - timing.start) / 1000).toFixed(1)}s(接口请求 ${timing.请求次数} 次, 累计 ${((timing.请求) / 1000).toFixed(1)}s)`);
            debugStore.record({ time: Date.now(), error: message });
            toastInfo(`彼方: ${message}`, '彼方');
            return;
        }
        console.error('[彼方] 更新失败:', error);
        const settingsNow = getSettings(host);
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
        toastError(message, '彼方更新失败');
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
export { updateNpcStates };

