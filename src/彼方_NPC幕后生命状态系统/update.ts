// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { chatCompletion } from './api';
import { getSettings } from './settings';
import { 报告世界书失败, syncNpcStatesWorldbook } from './worldbook-inject';
import { 锚点之后的快照楼层 } from './快照';
// 落盘 + 更新界面走同一个入口（C2）：**先落盘，成功了才更新界面；失败回滚**。
// 原来这里是 `writeStateSnapshot(...)` + `stateStore.data = newData` 两行手写配对，
// 失败那一支仍然把没落盘的 `newData` 交给了界面 —— 见 `当前状态.ts` 文件头。
import { 提交下一份 } from './当前状态';
import { useDebugStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import { toastError, toastInfo, toastSuccess, toastWarning } from './toast';
import { 请求并校验 } from './模型请求';
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
        const { data, messages, playerName, recent } = 输入;
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
        const { 数据: newData, 摘要 } = applyUpdate(data, parsed, playerName, autoTrack, settings.更新.生理监测);
        debugStore.record({ time: Date.now(), updatedNpcs: 摘要.更新, removedNpcs: 摘要.移除 });
        timing.解析应用 = Date.now() - applyStart;
        const finalizeStart = Date.now();
        // 把更新后的状态整体写入本次分析的最后一条楼层(快照随该楼层存亡:
        // 删除楼层/重roll时状态自动回退), 并同步清空层清零
        const anchorFloor = recent[recent.length - 1].message_id;
        newData.处理到楼层 = anchorFloor;
        newData.清空层 = 0;
        // ── 2026-11-20 C2：落盘 + 更新界面走同一个入口 ──
        //
        //  ── 原来错在哪 ──
        //  这里写的是：
        //      if (writeStateSnapshot(...)) stateStore.data = {...};
        //      else { stateStore.data = newData; ...warn... }
        //
        //  **失败那一支仍然把 `newData` 交给了界面** —— 而那份数据**没落盘**。
        //  用户看到"已更新 N 个NPC"，刷新后全没了。
        //
        //  「界面所见 == 落盘那份」这条不变量原来**没有任何模块拥有它**：
        //  `数据变更.ts` 写对了、`update.ts` 写错了，配对规则只写在注释里。
        //
        //  现在由 `当前状态.提交下一份` 统一负责：**先落盘，成功了才更新界面；
        //  失败就回滚成上一次落盘成功的那份**（见那个模块的"失败语义"）。
        const 提交结果 = 提交下一份(
            host,
            newData,
            '本轮状态没能存进楼层(楼层可能已被删除或变量写入失败)',
            {
                // 自动更新的落盘语义（与改动前逐字一致）：
                //   · 锚在本次分析的最后一条楼层 —— 这一轮读过的东西都到那里为止
                //   · 锚点之后若已有更新的快照（通常来自手动保存）就**不写** ——
                //     写进去也会被读侧按最大层号忽略，变成静默丢弃
                //   · 消费清空层：清空层只在清空后的首次更新生效
                锚点楼层: anchorFloor,
                处理到楼层: anchorFloor,
                消费清空层: true,
                允许覆盖更新快照: false,
            },
        );
        if (!提交结果.ok) {
            // 失败要出声: 玩家最容易误以为"更新完成 = 状态已保存"。
            // 失败有三种原因, 这里按"锚点冲突 / 其余"两档说 —— 两种都要弹, 且**同一次失败只弹一条**:
            //   · 锚点冲突(手动保存过更新的快照): 下面第一条;
            //   · 楼层不存在 / 写变量抛错 / 索引登记失败: 第二条。
            //
            // ── 2026-11-20 C2 补 A：必须解释"界面变了"这件事 ──
            //  `提交下一份` 失败时会把界面**回滚**到上一次落盘成功的那份（见 当前状态.ts 的失败语义）。
            //  但"界面自己变了"如果不解释，用户看到人物页突然退回上一轮，会以为**数据被吃掉了** ——
            //  那是比"这次没保存"更可怕的误读。
            //  所以两条文案都补一句 **"界面已回到上一次保存的状态"**，一句就够，不再写第二句。
            const 冲突楼层 = 锚点之后的快照楼层(host, anchorFloor);
            const 说明 = 冲突楼层.length > 0
                ? `本轮结果因手动修改未保存: 楼层 #${冲突楼层.join('、#')} 上有更新的快照, 本轮锚点 #${anchorFloor} 之后已有它。界面已回到上一次保存的状态。`
                : `本轮状态没能存进楼层 #${anchorFloor}(楼层可能已被删除或变量写入失败), 界面已回到上一次保存的状态, 请重新更新一次。`;
            debugStore.record({ time: Date.now(), error: 说明 });
            // 走 host.toast 而不是直连 toastWarning: 与 报告世界书失败 同一口径 ——
            // 两者都是"后台链路的结果没能落地", 玩家必须知道, 且不该由纯逻辑层自己弹提示。
            host.toast.warn(`彼方: ${说明}`, '彼方');
        }
        // 同步幕后状态到世界书(蓝灯常驻条目), 供主AI与数据库剧情推进读取。
        // 失败必须让玩家看见: 这条链路跑在 AI 更新之后, 玩家最容易误以为"状态更新成功 = 世界书也更新了"。
        if (settings.更新.世界书写入 !== '关闭') {
            syncNpcStatesWorldbook(host, newData, settings.更新.世界书写入, 摘要.未回票, settings.更新.生理监测).catch(error => 报告世界书失败(host, error));
        }
        timing.收尾 = Date.now() - finalizeStart;
        const secs = (ms: number) => (ms / 1000).toFixed(1);
        console.info(`[彼方] 本次更新总耗时 ${secs(Date.now() - timing.start)}s = 前置 ${secs(timing.前置)}s + 世界书 ${secs(timing.世界书)}s + 接口请求 ${secs(timing.请求)}s(${timing.请求次数}次) + 解析应用 ${secs(timing.解析应用)}s + 收尾 ${secs(timing.收尾)}s`);
        console.info(`[彼方] 幕后NPC状态更新完成: ${摘要.更新.join('、') || '(本次无重要NPC变化)'}${摘要.移除.length > 0 ? `; 已移除: ${摘要.移除.join('、')}` : ''}`);
        // ⚠ 提交失败时**不许弹成功提示**（需求方 #440 判据①：不许显示"已保存"）。
        //
        //  原来这一句无条件执行 —— 于是失败时玩家会先看到红字"本轮状态没能存进楼层"，
        //  紧接着又看到绿字"已更新 2 个NPC的幕后状态"。**两句互相矛盾，玩家会信后一句。**
        //  这正是"看起来成功了"的来源。
        if (提交结果.ok) {
            toastSuccess(摘要.更新.length > 0
                ? `彼方: 已更新 ${摘要.更新.length} 个NPC的幕后状态${摘要.移除.length > 0 ? `，移除 ${摘要.移除.length} 个NPC` : ''}`
                : 摘要.移除.length > 0
                    ? `彼方: 已移除 ${摘要.移除.length} 个NPC`
                    : '彼方: 本次没有重要NPC的幕后状态变化', '彼方');
        }
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

