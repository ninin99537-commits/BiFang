// 把模型的输出变成新的状态数据(候选2 拆出来的第二块)。
// 这一段以前和"取料/请求/收尾"一起挤在 updateNpcStates 里:
//   字段合并(已独立成 卡合并.ts) / 改名归并(resolveRenamedNpc) / 统计与移除(applyUpdate),
//   以及一件只服务于它们的小工具(接口地址脱敏; 剧情时间提示已随取料搬进 聊天取料.ts)。
// 它们不碰平台(不需要宿主), 只做纯数据变换 —— 所以能单独读、单独验证。

import { 合并 } from './卡合并';
import { parseStoryTimeRange } from './剧情时间';
import { 认出NPC } from './模型请求';
import { 归一名, 疑似重复提示 } from './名字归一';
import { 读取台账, 未回票编号, 新建台账诊断, 待核对事务 } from './事务台账';
import type { 彼方数据 } from './快照';
// 2026-11-14: lodash 是 webpack externals 注入的全局（webpack.config.ts:4），不在 auto-imports 里 ——
// 一旦把 no-undef 开成 error 就会报悬空，所以显式写出来（default 形式，与 设置.ts 一致）。
import _ from 'lodash';

/** 脱敏接口地址(隐藏地址中可能携带的 token/key 查询参数), 用于错误日志。
 *  这行注释原先落在 update.ts 的 updateNpcStates 头上(从导出脚本还原时串了行, 文档挂到了它不描述的函数上), 这里归位。 */
function maskBaseUrl(url: string) {
    const value = String(url || '').trim();
    return value.replace(/([?&](?:key|token|api_key|apiKey|apikey)=)[^&]*/gi, '$1***');
}
/**
 * 处理 NPC 改名合并: AI 输出状态卡时若带「曾用名」, 且该曾用名正好是已建档的旧卡 key,
 * 说明正文揭示了同一角色的真实姓名(如"林姐"→"林淑仪")。此时:
 * - 把旧卡内容作为合并基底(合并 的 旧卡), 新卡字段覆盖旧卡 → 状态连续不割裂
 * - 删除旧卡 key, 名单同步用新名替换旧名, 避免两张卡并存/名单重复
 * 返回 { name, oldCard } 供调用方 合并 使用; 无改名时返回原 name + 原旧卡。
 */
function resolveRenamedNpc(newData: 彼方数据, name: string, card: Record<string, any> | undefined, playerName: string | null): { name: string; oldCard: Record<string, any> | undefined } {
    const alias = String(card?.['曾用名'] ?? '').trim();
    if (alias && alias !== name && alias !== playerName && newData.NPC[alias] && !newData.NPC[name]) {
        console.info(`[彼方] NPC改名合并: ${alias} → ${name}, 旧卡状态并入新卡`);
        const oldCard = newData.NPC[alias];
        delete newData.NPC[alias];
        newData.名单 = newData.名单.map((n: string) => (n === alias ? name : n));
        return { name, oldCard };
    }
    return { name, oldCard: newData.NPC[name] };
}

/**
 * `applyUpdate` 的**临时输出**(调用方传一个空对象进来收, 不落库、不进快照):
 * `未回票` = 本轮每个 NPC 里没被模型过问的「进行中」编号, 供世界书注入当轮加"（未表态，待确认）"。
 * 为什么用出参而不是挂在返回值上: `newData` 会整体写进楼层快照, 任何挂上去的临时数据都会**持久化**;
 * 而这个标记的正确寿命只有一轮(换聊天/重写世界书时就该消失)。
 */
/**
 * 本轮**实际发生了什么** —— 由 applyUpdate 一处算出, 供日志页 / 提示 / 世界书注入消费。
 * 以前这件事由调用方(update.ts)拿着 parsed 再走一遍来推, 于是"什么算一次更新"有两张分类表;
 * 现在只有这一份。
 */
export type 更新摘要 = {
    /** 实际合并进数据的 NPC(含改名后的新名) */
    更新: string[];
    /** 本轮被移除的 NPC */
    移除: string[];
    /** 自动建档关闭时被跳过的新角色 */
    跳过: string[];
    /** 本轮没被模型过问的「进行中」事务编号(逐轮临时, 不落库) */
    未回票: Record<string, string[]>;
    /** 疑似重复但**未合并**的名字(只报告, 供面板与日志提示玩家手动确认) */
    疑似重复: Array<{ 新名: string; 疑似: string }>;
};

export type 更新结果 = { 数据: 彼方数据; 摘要: 更新摘要 };

function 空摘要(): 更新摘要 {
    return { 更新: [], 移除: [], 跳过: [], 未回票: {}, 疑似重复: [] };
}

/**
 * 把 AI 输出合并进数据。
 *
 * **参数顺序注意**: 2026-11-14 起去掉了从未被读的 `timeJump`(时间跳跃在提示词层生效:
 * 更新输入.ts → buildPrompts → `时间跳跃: ...`, 与本函数无关)。按**位置**传参的调用点
 * 需要同步去掉那一位, 否则后面的实参会整体左移(`autoTrack` 会收到 `null`, 等价于"自动建档关闭")。
 */
function applyUpdate(data: 彼方数据, parsed: Record<string, any> | null, playerName: string | null = null, autoTrack = true, 生理监测 = true): 更新结果 {
    const newData: 彼方数据 = {
        ...data,
        名单: [...data.名单],
        NPC: _.cloneDeep(data.NPC),
        统计: { ...data.统计 },
    };
    const 摘要 = 空摘要();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return { 数据: newData, 摘要 };
    const storyRange = parseStoryTimeRange(parsed['剧情时间']);
    const storyTimeText = storyRange.text;
    if (!storyTimeText) {
        // AI 完全省略"剧情时间"时不能静默通过: 生理推进失去基准, 下一轮的**跨度补写**也会失去基准。
        // 这里要明确说出"跳过", 而不是只说"用旧基准" —— 旧基准会让跨度算成 0,
        // 模型就会以为"刚刚才过", 比不算更糟(批1·A2 的负判据)。
        console.warn('[彼方] AI 输出缺少"剧情时间": 本轮跳过跨度补写(无时间基准), 生理周期推进沿用旧基准');
    }
    if (storyTimeText)
        newData.剧情时间 = storyTimeText;
    // 谁是 NPC、卡在哪: 由 模型请求.认出NPC 一处认(新旧两种输出格式都在那边兼容)
    // 「自动建档」关闭时: 只允许合并**已追踪**的 NPC(名单内或已有卡), AI 返回的新角色一律跳过——
    // 已有卡但不在名单的(如改名后的新键)仍放行, 由 resolveRenamedNpc 的改名合并逻辑处理
    const isTrackedNpc = (name: string) => newData.名单.includes(name) || !!newData.NPC[name];
    const skippedNewNpcs: string[] = [];
    const updatedNames: string[] = [];
    /** 本轮每个 NPC 的未回票编号(逐轮临时, 只进摘要, 不落库) */
    const 未回票记录: Record<string, string[]> = {};
    /** 本轮"疑似重复但未合并"的名字(只报告) */
    const 疑似重复: Array<{ 新名: string; 疑似: string }> = [];
    /**
     * 合并一张卡, 并把台账层的三条**静默路径**汇总成日志(每轮每 NPC 至多三行)。
     * 为什么必须留痕: 这三条路径过去全是无声的——载荷被丢(内容重复)、改动被吞(重抄+改状态)、
     * 条目根本没被过问(缺席即继续)。出问题时无从查起, 而"看不见"本身会掩盖模型服从度的真相。
     */
    const 合并一张卡 = (名字: string, 旧卡: Record<string, any> | undefined, 新卡: Record<string, any>) => {
        const 诊断 = 新建台账诊断();
        const 旧台账 = 读取台账(旧卡?.['未完成事项']);
        // 只有"待核对"(挂满老化天数 / 约定日期已过)的进行中才要求表态; 其余没变化不回是正常的
        const 需核对 = new Set(待核对事务(旧台账, storyTimeText).map(项 => 项.编号));
        const 未回票 = 未回票编号(旧台账, 新卡?.['未完成事项']).filter(编号 => 需核对.has(编号));
        const 合并后 = 合并(旧卡, 新卡, { 剧情时间: storyTimeText, 写入: '增量', 空值: '跳过', 钩子: '全部', 生理关闭: !生理监测 }, 诊断);
        // v3.1 温度计: 本轮**新变成**"已作废"、账上却没留下任何理由的条目(§2-3 要求作废必带原因)。
        // 只计数不改行为——死活仍是模型的语义裁决, 代码不拦, 但"作废时到底给没给理由"从此看得见。
        // 为什么不塞进 台账诊断: 那个结构的形状被用例逐字段深比对钉着, 而这条能完全由前后台账推出来。
        const 作废无原因 = 读取台账(合并后?.['未完成事项']).filter(事务 =>
            事务.状态 === '已作废' && !事务.结果
            && 旧台账.find(旧 => 旧.编号 === 事务.编号)?.状态 !== '已作废');
        if (作废无原因.length > 0)
            console.info(`[彼方] NPC「${名字}」本轮 ${作废无原因.length} 条事务收成"已作废"但没写原因(账上只有状态, 没有"为什么"): ${作废无原因.map(事务 => 事务.编号).join('/')}`);
        if (诊断.重复丢弃 > 0)
            console.info(`[彼方] NPC「${名字}」本轮 ${诊断.重复丢弃} 条载荷因内容重复被丢弃(其中 ${诊断.重复命中终态} 条命中终态条目)`);
        if (诊断.复活拦截.length > 0)
            console.warn(`[彼方] NPC「${名字}」${诊断.复活拦截.join('/')} 收到"改回进行中"的重复内容载荷, 已忽略(内容重抄只许收束; 要重开请用编号指名或面板按钮)`);
        if (诊断.相对锚.length > 0)
            console.info(`[彼方] NPC「${名字}」新事务内容仍是相对时间词且无绝对日期(时间锚纪律): ${诊断.相对锚.join(' / ')}`);
        if (未回票.length > 0) {
            未回票记录[名字] = 未回票;
            const 进行中条数 = 旧台账.filter(事务 => 事务.状态 === '进行中').length;
            console.warn(`[彼方] NPC「${名字}」${进行中条数} 条进行中里有 ${未回票.length} 条本轮未表态(注入侧已标"待确认"): ${未回票.join('/')}`);
        }
        // 本轮变动(隐藏字段, 只给面板看): 让"事实档案"能标出这一轮哪条承诺变了。
        // 形状固定为 "T3:已完成;T5:新增", 读侧按冒号/分号解析; 没有变动就删掉字段, 不留空串。
        const 本轮变动: string[] = [];
        for (const 事务 of 读取台账(合并后?.['未完成事项'])) {
            const 旧事务 = 旧台账.find(旧 => 旧.编号 === 事务.编号);
            if (!旧事务)
                本轮变动.push(`${事务.编号}:新增`);
            else if (旧事务.状态 !== 事务.状态)
                本轮变动.push(`${事务.编号}:${事务.状态}`);
        }
        if (本轮变动.length > 0)
            合并后['未完成事项变动'] = 本轮变动.join(';');
        else if (合并后?.['未完成事项变动'] !== undefined)
            delete 合并后['未完成事项变动'];
        return 合并后;
    };
    for (const { 名: name, 卡: card } of 认出NPC(parsed)) {
        // 主角: 跳过合并, 并清理误建的主角卡/名单项
        if (playerName && name === playerName) {
            delete newData.NPC[name];
            newData.名单 = newData.名单.filter((n: string) => n !== name);
            continue;
        }
        // 名字归一守卫(方案 §23 W1, 2026-11-18 改判 §25): 模型会把同一个人写成两个只差一个字的名字
        // (实测: "埃莉" / "艾莉", 内容一字不差)。而**错名字一旦进名单, 之后每轮提示词都带着它**,
        // 模型照着输出 —— 自激回路, 自己不会好。
        //
        // 合并的条件必须是**证据**, 不是**相似**(§25 裁定):
        //   证据 → 自动合并: 完全同名 / 去姓前缀 / 同一回复内名字相近且内容重合度高
        //   相似 → 只报告:   跨轮次的近名(如已有「艾莉」遇到新的「埃莉」)照常建卡, 留一行提示
        // 因为同长度单字替换会把「张三/张四」判成两个真不同的人 —— 误伤比漏判贵得多。
        const 归一 = 归一名(
            name,
            [...newData.名单, ...Object.keys(newData.NPC)],
            updatedNames,
            card,
            newData.NPC,
        );
        if (归一.合并到 && 归一.合并到 !== name) {
            console.info(`[彼方] 名字归一: 「${name}」并入「${归一.合并到}」(依据=${归一.理由}), 不新建卡`);
        }
        if (归一.疑似重复) {
            // 只报告不合并: 照常建卡, 但让人看见。**绝对不许静默合并**, 也不许静默放过。
            console.warn(`[彼方] ${疑似重复提示(name, 归一.疑似重复)}`);
            疑似重复.push({ 新名: name, 疑似: 归一.疑似重复 });
        }
        const 采用名 = 归一.名;
        // 自动建档关闭: 新角色(未在名单且无卡)不建档不追踪, 记录后跳过
        // 注意判据用的是**归一后的名字** —— 否则"艾莉"会被当成新角色跳过, 而它其实是"埃莉"的重复
        if (!autoTrack && !isTrackedNpc(采用名)) {
            skippedNewNpcs.push(采用名);
            continue;
        }
        const resolved = resolveRenamedNpc(newData, 采用名, card, playerName);
        newData.NPC[resolved.name] = 合并一张卡(resolved.name, resolved.oldCard, card);
        updatedNames.push(resolved.name);
        if (!newData.名单.includes(resolved.name))
            newData.名单.push(resolved.name);
    }
    const removedNpcs: string[] = [];
    if (typeof parsed['移除NPC'] !== 'undefined') {
        removedNpcs.push(...(Array.isArray(parsed['移除NPC']) ? parsed['移除NPC'].map(String).filter(Boolean) : []));
    }
    for (const name of removedNpcs) {
        delete newData.NPC[name];
    }
    if (removedNpcs.length > 0) {
        newData.名单 = newData.名单.filter((name: string) => !removedNpcs.includes(name));
    }
    // 自动建档关闭时, 提示本次被跳过的新角色(仅提示, 不影响其他更新)
    if (skippedNewNpcs.length > 0) {
        console.info(`[彼方] 「自动建档」已关闭, 本次跳过新角色(未建档): ${skippedNewNpcs.join('、')}`);
    }
    // 已追踪但本次整卡未被 AI 返回的 NPC: 警告(增量更新下核心三字段应每次必返, 整卡省略=状态停留旧值——
    // 如大幅时间跳跃时 AI 只更新了部分 NPC, 其余卡会停留在上次日期)
    const notUpdatedNpcs = newData.名单.filter((name: string) => !updatedNames.includes(name) && !removedNpcs.includes(name));
    if (notUpdatedNpcs.length > 0) {
        console.warn(`[彼方] 以下已追踪NPC本次整卡未返回(状态保持旧值, 剧情已推进时可能漏更新): ${notUpdatedNpcs.join('、')}`);
    }
    newData.统计.更新次数 = (newData.统计.更新次数 ?? 0) + 1;
    newData.统计.最后更新 = Date.now();
    摘要.更新 = updatedNames;
    摘要.移除 = removedNpcs;
    摘要.跳过 = skippedNewNpcs;
    摘要.未回票 = 未回票记录;
    摘要.疑似重复 = 疑似重复;
    return { 数据: newData, 摘要 };
}

export { applyUpdate, maskBaseUrl };
