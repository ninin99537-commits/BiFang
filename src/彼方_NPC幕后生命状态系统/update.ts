// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { chatCompletion } from './api';
import { getSettings, 设置读取可信 } from './settings';
import { 报告世界书失败, syncNpcStatesWorldbook } from './worldbook-inject';
import { writeStateSnapshot, loadData, 锚点之后的快照楼层 } from './快照';
import { useStateStore } from './数据仓';
import { useDebugStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import { toastError, toastInfo, toastSuccess, toastWarning } from './toast';
import { 请求并校验 } from './模型请求';
import { 新建请求态 } from './请求归属';
import { applyUpdate, maskBaseUrl } from './应用更新';
import { 收集本轮输入 } from './更新输入';
import { 写入日志 } from './日志落盘';
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
    // 本轮是否真的发出过请求(复查 P1-11): 状态机判收尾要靠这个**事实**,
    // 不能靠"有没有 error 日志"反推 —— 提前 return 的路径一条 error 都不写,
    // 那样会被判成"成功", 面板弹"已更新"绿, 而什么都没发生。
    // 这个事实存在 updatingStore 里(界面读它), 不在本文件留副本 —— 两份状态一定会漂。
    const 标记发过请求 = () => {
        updatingStore.记本轮发过请求();
    };
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
        const { data, messages, 工具说明, playerName, recent } = 输入;
        // 一轮更新一个请求态: 多次重试共用(请求序号连续), 但不跨轮、不进 pinia、不落盘。
        const 请求态 = 新建请求态();
        let 请求结果;
        try {
            // 取模型输出这一段已独立成模块(模型请求.ts): 发请求 → 解析 → 校验, 不合格就原样重试
            请求结果 = await 请求并校验({
                messages,
                // 预填充与工具通道互斥(方案 §16 方案 5): 预填充会在末位补一条 assistant '{',
                // 与"必须调工具"语义打架; 而共用层的"拼回"在彼方侧关不掉, 只能让预填充恒为 false。
                // **不改用户设置** —— 只是本次不生效, 开关在面板上仍是用户设的那个值。
                预填充: settings.更新.预填充 && !settings.接口.工具通道,
                现有卡: data.NPC ?? {},
                名单: data.名单 ?? [],
                玩家名: playerName,
                自动建档: settings.更新.自动建档 !== false,
                signal: abortSignal,
                发请求: (messages, options) => chatCompletion(host, messages, { ...options, 请求态, 工具说明, 记发过请求: () => 标记发过请求() }),
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
        const { 数据: newData, 摘要 } = applyUpdate(data, parsed, playerName, autoTrack, settings.更新.生理监测);
        debugStore.record({ time: Date.now(), updatedNpcs: 摘要.更新, removedNpcs: 摘要.移除 });
        timing.解析应用 = Date.now() - applyStart;
        const finalizeStart = Date.now();
        // 把更新后的状态整体写入本次分析的最后一条楼层(快照随该楼层存亡:
        // 删除楼层/重roll时状态自动回退), 并同步清空层清零
        const anchorFloor = recent[recent.length - 1].message_id;
        newData.处理到楼层 = anchorFloor;
        newData.清空层 = 0;
        const stateStore = useStateStore();
        // 自动更新路径传 允许覆盖更新快照=false: 锚点之后若已有更新的快照(通常来自手动保存),
        // 这一轮不写入 —— 否则写进去了也会被读侧按最大层号忽略, 变成静默丢弃。
        const 已落盘 = writeStateSnapshot(host, newData, anchorFloor, anchorFloor, true, null, false);
        if (已落盘) {
            stateStore.data = { ...newData, 锚点楼层: anchorFloor };
        }
        else {
            // ⚠ **没落盘的数据不许提交给界面**（2026-11-19 P1-2）。
            //
            //  ── 原来错在哪 ──
            //  这里原来无条件 `stateStore.data = newData` —— 而 `newData` 是**没存进去的那份**。
            //  后果有两层：
            //    ① **抹掉用户刚手动保存的显示**：他在更新期间改了卡并保存，界面却显示回 AI 的结果；
            //    ② **世界书也用这份同步**（下面那句 syncNpcStatesWorldbook）——
            //       于是世界书里写的是"没进库的那份"，刷新页面后又变回用户那份，**前后不一致**。
            //
            //  ── 为什么"什么都不做"才对 ──
            //  `stateStore.data` 现在装的是**已落盘的那份**（用户的，或上一次更新的）。
            //  它比"没落盘的新结果"更接近真相 —— **界面应当显示库里有什么，不是内存里算了什么**。
            stateStore.data = loadData(host);
            // 写入失败要出声: 玩家最容易误以为"更新完成 = 状态已保存"。
            // 失败有三种原因, 这里按"锚点冲突 / 其余"两档说 —— 两种都要弹, 且**同一次失败只弹一条**:
            //   · 锚点冲突(手动保存过更新的快照): 下面第一条;
            //   · 楼层不存在 / 写变量抛错 / 索引写失败: 第二条。这几种 writeStateSnapshot 只在 console 里记,
            //     玩家看不到 —— 于是"更新成功"的绿字后面藏着一份没存下的状态。
            const 冲突楼层 = 锚点之后的快照楼层(host, anchorFloor);
            const 说明 = 冲突楼层.length > 0
                ? `本轮结果因手动修改未保存: 楼层 #${冲突楼层.join('、#')} 上有更新的快照, 本轮锚点 #${anchorFloor} 之后已有它。`
                : `本轮状态没能存进楼层 #${anchorFloor}(楼层可能已被删除或变量写入失败), 界面上的状态不会被保存, 请重新更新一次。`;
            debugStore.record({ time: Date.now(), error: 说明 });
            // 走 host.toast 而不是直连 toastWarning: 与 报告世界书失败 同一口径 ——
            // 两者都是"后台链路的结果没能落地", 玩家必须知道, 且不该由纯逻辑层自己弹提示。
            host.toast.warn(`彼方: ${说明}`, '彼方');
        }
        // 同步幕后状态到世界书(蓝灯常驻条目), 供主AI与数据库剧情推进读取。
        // 失败必须让玩家看见: 这条链路跑在 AI 更新之后, 玩家最容易误以为"状态更新成功 = 世界书也更新了"。
        //
        // ⚠ **只用已落盘的那份同步**（2026-11-19 P1-2）：没落盘的数据进世界书 = 主 AI 读到一份
        //    刷新后就不存在的东西。没落盘时用 `stateStore.data`（= 库里真实那份）同步，
        //    这样世界书与库始终一致 —— 它可能"没变化"，但**不会说谎**。
        // ⚠ **读不到设置 ≠ 用户关掉了**（2026-11-19 波2「发现6」）。
        //    原来这里只判 `!== '关闭'`：读失败时 `settings` 是默认值（世界书写入='关闭'），
        //    于是**静默不同步**；更糟的是别的触发器（`maybeInjectNpcStates`）会把同一个默认值
        //    当成"关闭"去**删条目**。两处都要求"读到了才动"。
        if (设置读取可信() && settings.更新.世界书写入 !== '关闭') {
            syncNpcStatesWorldbook(host, stateStore.data, settings.更新.世界书写入, 已落盘 ? 摘要.未回票 : undefined, settings.更新.生理监测).catch(error => 报告世界书失败(host, error));
        }
        timing.收尾 = Date.now() - finalizeStart;
        const secs = (ms: number) => (ms / 1000).toFixed(1);
        console.info(`[彼方] 本次更新总耗时 ${secs(Date.now() - timing.start)}s = 前置 ${secs(timing.前置)}s + 世界书 ${secs(timing.世界书)}s + 接口请求 ${secs(timing.请求)}s(${timing.请求次数}次) + 解析应用 ${secs(timing.解析应用)}s + 收尾 ${secs(timing.收尾)}s`);
        console.info(`[彼方] 幕后NPC状态更新完成: ${摘要.更新.join('、') || '(本次无重要NPC变化)'}${摘要.移除.length > 0 ? `; 已移除: ${摘要.移除.join('、')}` : ''}`);
        // ⚠ **没落盘就不许弹成功**（2026-11-19 P1-2）：
        //  上面已经弹过 warn 说明为什么没存住。再弹一条"已更新 N 个NPC"，
        //  玩家会以为存住了 —— **那正是这个 bug 最伤人的地方。**
        if (!已落盘) {
            console.warn('[彼方] 本轮结果没落盘, 不弹"已更新"提示(已在上面说明原因)');
            return;
        }
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
        // 3-3 日志落盘: 把这一轮的请求/响应存进聊天变量(只留 1 份), 重载后仍读得到。
        // 放在 finally 里: 失败/中断那轮也有现场可查(中断时的请求体同样值得留下)。
        const 当前日志 = debugStore.log;
        if (当前日志) {
            const 写成 = 写入日志(host, {
                时间: 当前日志.time,
                请求: 当前日志.request,
                响应: 当前日志.response,
                错误: 当前日志.error,
            });
            // 3-2: 落盘失败要出声 —— 用户以为"日志页那份就是存下来的那份", 其实重载就没了
            if (!写成)
                host.toast.warn('彼方: 日志没能存进聊天变量, 重载后这一轮的记录会消失', '彼方');
        }
    }
}

export { updateNpcStates };

