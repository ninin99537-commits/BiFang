// 彼方 · 状态快照: 状态怎么存进楼层、怎么读回来、旧版数据怎么迁移。
//
// 这一层是纯粹的数据存取——不碰 Vue, 不碰 pinia(界面要的那份响应式副本在 数据仓.ts),
// 于是它能脱离界面单独测一遍。平台访问全部走**调用方传进来的宿主**(约定见 host.ts 顶部):
// 本文件不再自己取宿主, 所以每个用例可以给一份假平台, 互不影响。
//
// 存储结构 (v3):
// - 聊天变量 `彼方` 只存轻量元数据: 哪些楼层有快照(索引) + 清空层
// - 状态本体(名单/NPC卡/统计/剧情时间)整体存在**楼层变量**里, 每次更新写入本次
//   分析的最后一条楼层。快照随楼层存亡——删除楼层/重roll(新swipe页没有快照)时状态
//   自动回退到更早楼层的快照, 因此不再需要任何自建的回滚/检测逻辑。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { klona } from 'klona';
import { toastError } from './toast';
import type { Host } from './host';
import type { 幕后事务 } from './事务台账';
import { 清空日志 } from './日志落盘';
import { 迁移旧字段名 } from './卡合并';

/** 本层真正需要的平台能力: 只读/写变量表与楼层。用 Pick 写在签名上, 依赖一目了然。 */
type 快照宿主 = Pick<Host, 'vars' | 'chat'>;

const STORAGE_KEY = '彼方';
const DATA_VERSION = 3;
/** 楼层快照最多保留的份数: 写入新快照时把更早楼层的快照物理删除, 防止聊天文件随楼层无限膨胀 */
const SNAPSHOT_LIMIT = 10;

/** 聊天变量 `彼方` 里存的那点轻量元数据: 哪些楼层有快照(索引) + 清空层。状态本体不在这里。 */
interface 快照元数据 {
    版本: number;
    快照楼层: number[];
    清空层: number;
}

/** 一份楼层快照的完整形状(整体写进楼层变量, 键名 `彼方`)。`楼层` 是写入时锚定的楼层号, 读取时用来判断编号是否对得上。 */
interface 快照载荷 {
    版本: number;
    楼层: number;
    处理到楼层: number;
    名单: string[];
    NPC: Record<string, Record<string, any>>;
    统计: { 更新次数: number; 最后更新: number };
    剧情时间: string;
}

function emptyMeta(): 快照元数据 {
    return { 版本: DATA_VERSION, 快照楼层: [], 清空层: 0 };
}
/** 写元数据; 返回是否写成功。`静默` 由调用方在"自己会统一提示"时打开(避免一次失败弹两条)。 */
function saveMeta(host: 快照宿主, meta: 快照元数据, 静默 = false) {
    try {
        // 整体赋值该键(避免 insertOrAssign 深合并残留旧字段), 其他聊天变量键不动
        host.vars.update(variables => {
            variables[STORAGE_KEY] = klona(meta);
            return variables;
        }, { type: 'chat' });
        return true;
    }
    catch (error) {
        console.error('[彼方] 保存元数据失败:', error);
        if (!静默)
            toastError(`彼方: 保存元数据失败 ${error instanceof Error ? error.message : String(error)}`, '彼方');
        return false;
    }
}
function loadMeta(host: 快照宿主): 快照元数据 {
    let raw: Record<string, any> | null = null;
    try {
        raw = host.vars.get({ type: 'chat' })?.[STORAGE_KEY] ?? null;
    }
    catch {
        return emptyMeta();
    }
    if (!raw || typeof raw !== 'object')
        return emptyMeta();
    if (Array.isArray(raw.快照楼层)) {
        return {
            版本: DATA_VERSION,
            快照楼层: raw.快照楼层.filter((floor: unknown) => typeof floor === 'number' && Number.isFinite(floor)),
            清空层: typeof raw.清空层 === 'number' ? raw.清空层 : 0,
        };
    }
    // v2 及更早的旧结构(状态本体存在聊天变量): 迁移为楼层快照(含旧「快照」数组,
    // 回滚能力完整保留; 全部写入成功才覆盖旧结构, 失败则保留待重试)
    return migrateLegacyData(host, raw);
}
/** 读取全部非隐藏的 AI 回复楼层(升序), 供旧数据迁移时把「第N条AI回复」换算为楼层号 */
function listAssistantFloors(host: 快照宿主) {
    try {
        const lastId = host.chat.lastMessageId();
        if (lastId < 0)
            return [];
        return host.chat.messages(`0-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
    }
    catch {
        return [];
    }
}
/**
 * v2 及更早的旧结构(状态本体存在聊天变量)迁移为楼层快照:
 * - 旧「快照」数组(按AI楼层数记录的最近10份) → 换算成楼层号, 逐份写入对应楼层, 回滚能力完整保留;
 * - 旧当前状态(名单/NPC等) → 写入最后一条AI楼层(与最新历史快照同层时覆盖它, 它就是最新一次更新的结果);
 * - **全部写入成功后才用新元数据覆盖旧结构**; 任一步失败则保留旧结构, 下次访问时重试, 不丢数据。
 */
function migrateLegacyData(host: 快照宿主, raw: Record<string, any>): 快照元数据 {
    const meta = emptyMeta();
    meta.清空层 = typeof raw.清空层 === 'number' ? raw.清空层 : 0;
    // 兜底备份: 迁移前后无论发生什么(部分失败后被新快照覆盖等), 原始旧数据都有一份完整副本可找回
    try {
        host.vars.update(variables => {
            variables['彼方_旧版备份'] = klona(raw);
            return variables;
        }, { type: 'chat' });
    }
    catch {
        // 备份失败不阻塞迁移
    }
    try {
        const assistants = listAssistantFloors(host);
        const floorOfCount = (count: unknown): number | null => {
            // 旧快照的「层数」是第 N 条 AI 回复(从1起), 换算为楼层号
            const index = (typeof count === 'number' ? count : 0) - 1;
            return index >= 0 && index < assistants.length ? assistants[index].message_id : null;
        };
        const pending: Array<{ floorId: number; processedFloor: number; data: Record<string, any> }> = [];
        for (const legacy of (Array.isArray(raw.快照) ? raw.快照 : [])) {
            if (!legacy || typeof legacy !== 'object')
                continue;
            const floorId = floorOfCount(legacy.层数);
            if (floorId === null)
                continue;
            pending.push({ floorId, processedFloor: floorId, data: legacy });
        }
        const npc = raw.NPC;
        if (npc && typeof npc === 'object' && Object.keys(npc).length > 0 && assistants.length > 0) {
            const latestFloor = assistants[assistants.length - 1].message_id;
            pending.push({
                floorId: latestFloor,
                processedFloor: latestFloor,
                data: {
                    名单: Array.isArray(raw.名单) ? raw.名单 : [],
                    NPC: npc,
                    统计: raw.统计 ?? { 更新次数: 0, 最后更新: 0 },
                    剧情时间: typeof raw.剧情时间 === 'string' ? raw.剧情时间 : '',
                },
            });
        }
        // 同层去重(当前状态排最后, 覆盖同层的旧历史快照)
        const byFloor = new Map();
        for (const item of pending)
            byFloor.set(item.floorId, item);
        if (byFloor.size === 0) {
            // 没有可迁移的数据(空状态聊天), 直接以新结构接管(保留清空层)
            saveMeta(host, meta);
            return meta;
        }
        for (const [floorId, item] of byFloor) {
            const payload = buildSnapshotPayload(host, item.data, floorId, item.processedFloor);
            if (!payload)
                throw Error(`楼层 #${floorId} 不存在, 迁移中止`);
            writeFloorVariables(host, payload);
            meta.快照楼层.push(floorId);
        }
        meta.快照楼层.sort((a, b) => a - b);
        while (meta.快照楼层.length > SNAPSHOT_LIMIT) {
            const removed = meta.快照楼层.shift();
            try {
                host.vars.del(STORAGE_KEY, { type: 'message', message_id: removed });
            }
            catch {
                // 楼层可能已不存在, 忽略
            }
        }
        saveMeta(host, meta);
        // 迁移成功: 删除兜底备份键, 不在聊天变量里留永久残迹(失败路径才需要它)
        try {
            host.vars.del('彼方_旧版备份', { type: 'chat' });
        }
        catch {
            // 删除失败不影响迁移结果
        }
        console.info(`[彼方] 已把旧版聊天变量数据迁移为楼层快照: 楼层=[${meta.快照楼层.join(', ')}]`);
        return meta;
    }
    catch (error) {
        // 迁移失败: 不覆盖旧结构(聊天变量里的旧数据原样保留, 下次访问重试), 本次按空状态运行
        console.warn('[彼方] 旧版数据迁移失败, 已保留旧数据待下次重试:', error);
        return emptyMeta();
    }
}
/**
 * 彼方当前状态的形状(与旧版字段兼容, 供界面与更新流程使用); 快照本体存在楼层变量里。
 * 这是这个形状的唯一声明: emptyData() 产出它, 数据变更入口也按它合并草稿。
 * 末尾的索引签名给旧版/未来字段留位置(旧快照里可能带着已经不用的字段)。
 */
export interface 彼方数据 {
    版本: number;
    名单: string[];
    /** 每张 NPC 状态卡: 字段名 → 值(多数是字符串)。
     *  例外: **「未完成事项」是事务台账数组**(幕后事务[], 见 事务台账.ts), 不是字符串——
     *  写下即冻结、只能改状态/结果; 旧快照里可能还是旧格式字符串, 由 读取台账 在合并时迁移。 */
    NPC: Record<string, { 未完成事项?: 幕后事务[]; [其它字段: string]: any }>;
    统计: { 更新次数: number; 最后更新: number };
    剧情时间: string;
    /** 清空层(来自聊天变量元数据): 清空后只分析比它更新的楼层, 防旧NPC复活 */
    清空层: number;
    /** 当前状态来自哪个楼层的快照(-1=无快照) */
    锚点楼层: number;
    /** 已分析到哪条楼层(增量判定: 手动重填时判断最新层是否已处理过) */
    处理到楼层: number;
    [其它字段: string]: any;
}
/** 彼方当前状态的数据形状(与旧版字段兼容, 供界面与更新流程使用); 快照本体存在楼层变量里 */
function emptyData(): 彼方数据 {
    return {
        版本: DATA_VERSION,
        名单: [],
        NPC: {},
        统计: { 更新次数: 0, 最后更新: 0 },
        剧情时间: '',
        /** 清空层(来自聊天变量元数据): 清空后只分析比它更新的楼层, 防旧NPC复活 */
        清空层: 0,
        /** 当前状态来自哪个楼层的快照(-1=无快照) */
        锚点楼层: -1,
        /** 已分析到哪条楼层(增量判定: 手动重填时判断最新层是否已处理过) */
        处理到楼层: 0,
    };
}
/**
 * 读取"本轮更新该用的基线": 与 `loadData` 的唯一区别是**同层重跑时回退**。
 *
 * 为什么要单独一个函数而不改 `loadData`(方案 §23 W3):
 *   `loadData` 有四个调用方, 其中**界面(数据仓)与世界书注入读的是"现在是什么样"** ——
 *   它们不该跟着回退。只有"算这一轮的基线"这一处需要"像没填过"。
 *   所以 loadData 的行为一个字节都不变, 需要回退的人来调这个。
 *
 * 回退判据 `data.锚点楼层 >= anchorFloor`(用户 2026-11-18 裁定):
 *   同层重跑时锚点相等, 读到的正是**上一次在同一层写的结果** —— 它的名字、它的错误、
 *   它的幻觉全都回到提示词里, 与名字归一的自激回路叠加。
 *   手动保存的快照也一起回退(用户原话「既然重跑, 那这一层手动改的作废就作废呗」),
 *   不加来源标记、不分 force —— 单一规则, 行为可预测。
 *
 * @param anchorFloor 本轮要写的锚点楼层
 */
function 读取基线(host: 快照宿主, anchorFloor: number): 彼方数据 {
    const 现状 = loadData(host);
    if (!(现状.锚点楼层 >= anchorFloor))
        return 现状;
    // 回退: 找**严格早于** anchorFloor 的最新一份有效快照
    let meta: 快照元数据;
    try {
        meta = loadMeta(host);
    }
    catch {
        return { ...emptyData(), 清空层: 现状.清空层 };
    }
    const 更早 = [...meta.快照楼层].filter(floor => floor < anchorFloor).sort((a, b) => b - a);
    for (const floorId of 更早) {
        let message = null;
        try {
            message = host.chat.messages(floorId)[0] ?? null;
        }
        catch {
            message = null;
        }
        if (!message)
            continue;
        let snapshot = null;
        try {
            snapshot = host.vars.get({ type: 'message', message_id: floorId })?.[STORAGE_KEY] ?? null;
        }
        catch {
            snapshot = null;
        }
        if (!snapshot || typeof snapshot !== 'object')
            continue;
        if (snapshot.楼层 !== floorId)
            continue;
        const 原NPC = snapshot.NPC && typeof snapshot.NPC === 'object' ? snapshot.NPC : {};
        const 迁移后NPC: Record<string, any> = {};
        for (const [名, 卡] of Object.entries(原NPC))
            迁移后NPC[名] = 迁移旧字段名(卡 as Record<string, any>) ?? 卡;
        console.info(`[彼方] 同层重跑: 楼层 #${anchorFloor} 上已有本层的状态, 已回退到 #${floorId} 的基线重新计算(这一层的手动修改随之作废)`);
        return {
            ...emptyData(),
            名单: Array.isArray(snapshot.名单) ? [...snapshot.名单] : [],
            NPC: 迁移后NPC,
            统计: { 更新次数: 0, 最后更新: 0, ...(snapshot.统计 && typeof snapshot.统计 === 'object' ? snapshot.统计 : {}) },
            剧情时间: typeof snapshot.剧情时间 === 'string' ? snapshot.剧情时间 : '',
            清空层: meta.清空层,
            锚点楼层: floorId,
            处理到楼层: typeof snapshot.处理到楼层 === 'number' ? snapshot.处理到楼层 : 0,
        };
    }
    console.info(`[彼方] 同层重跑: 楼层 #${anchorFloor} 上已有本层的状态, 且没有更早的快照 —— 按"从没填过"的空状态重新计算`);
    return { ...emptyData(), 清空层: meta.清空层 };
}

/**
 * 读取彼方当前状态: 从最新快照楼层往前找第一份**有效**快照。
 * - 楼层不存在(被删) → 快照随之消亡, 从索引清理, 继续往前;
 * - 楼层变量里没有快照(如重roll产生的新swipe页) → 继续往前;
 * 命中或扫尽后返回状态; 一个快照都没有时返回空状态(清空层仍生效)。
 *
 * **注意**: 这是"现在是什么样", 界面与世界书注入用它。
 * "本轮更新该用的基线"(同层重跑要回退)用 读取基线, 不是这个。
 */
function loadData(host: 快照宿主): 彼方数据 {
    try {
        const meta = loadMeta(host);
        const floors = [...meta.快照楼层].sort((a, b) => a - b);
        const missingFloors: number[] = [];
        /** 编号对不上的快照(楼层被大段剪过 → 之后所有楼层号重排), 留作认领候选 */
        const 编号对不上: Array<{ floorId: number, snapshot: Record<string, any> }> = [];
        const 成数据 = (snapshot: Record<string, any>, floorId: number): 彼方数据 => {
            // 旧字段名迁移(批2·B1 的 V15): 存量卡与历史快照里的旧键必须在这里就搬走 ——
            // "读出来就要能看见", 不能等下一次更新(那期间玩家看自己的旧内容是一片空白)。
            // 与 卡合并.迁移旧字段名 是同一个函数: 读路径与写路径共用一份映射, 分开写两份一定会漂。
            const 原NPC = snapshot.NPC && typeof snapshot.NPC === 'object' ? snapshot.NPC : {};
            const 迁移后NPC: Record<string, any> = {};
            for (const [名, 卡] of Object.entries(原NPC))
                迁移后NPC[名] = 迁移旧字段名(卡 as Record<string, any>) ?? 卡;
            return {
                ...emptyData(),
                名单: Array.isArray(snapshot.名单) ? [...snapshot.名单] : [],
                NPC: 迁移后NPC,
                统计: { 更新次数: 0, 最后更新: 0, ...(snapshot.统计 && typeof snapshot.统计 === 'object' ? snapshot.统计 : {}) },
                剧情时间: typeof snapshot.剧情时间 === 'string' ? snapshot.剧情时间 : '',
                清空层: 0, // 调用方用 meta.清空层 覆盖
                锚点楼层: floorId,
                处理到楼层: typeof snapshot.处理到楼层 === 'number' ? snapshot.处理到楼层 : 0,
            };
        };
        for (let i = floors.length - 1; i >= 0; i--) {
            const floorId = floors[i];
            let message = null;
            try {
                message = host.chat.messages(floorId)[0] ?? null;
            }
            catch {
                message = null;
            }
            if (!message) {
                missingFloors.push(floorId);
                continue;
            }
            let snapshot = null;
            try {
                snapshot = host.vars.get({ type: 'message', message_id: floorId })?.[STORAGE_KEY] ?? null;
            }
            catch {
                snapshot = null;
            }
            if (!snapshot || typeof snapshot !== 'object')
                continue;
            if (snapshot.楼层 !== floorId) {
                // 编号对不上: 先别丢 —— 可能是删楼后整体重排(见下面认领那段), 继续找精确对得上的
                编号对不上.push({ floorId, snapshot });
                continue;
            }
            // 快照有效性只按"楼层存在 + 快照键匹配"判定, 不比对楼层内容:
            // 主AI楼层在快照写入后仍会变动(流式收尾/正则脚本后处理/世界书格式追加等),
            // 按内容比对会把"正常游玩"误判成"楼层被编辑", 导致每轮回退空状态
            // (更新次数恒为1、名单反复消失)。
            if (missingFloors.length > 0) {
                meta.快照楼层 = meta.快照楼层.filter(floor => !missingFloors.includes(floor));
                saveMeta(host, meta);
            }
            return { ...成数据(snapshot, floorId), 清空层: meta.清空层 };
        }
        // 没有任何一份的编号精确对得上: 楼层被大段剪过(典型是 /cut 删前段或删中间), 之后所有楼层号重排。
        // 楼层变量是**跟着消息走**的 —— 所以"这一楼上的快照就是这一楼自己的", 里面记的楼层号只是旧的。
        // 认领编号最大的那份(离现在最近), 并把 楼层/处理到楼层 改写成本楼: 之后一切自洽, 不会反复触发。
        // 注: 处理到楼层 只写不读(不参与任何判定), 所以不需要知道"到底删了几层"—— 多次删除也一样能认。
        // 情形一: 索引里的编号还在, 但那一楼上的快照记的是旧编号(删的是中间/尾部, 索引没被清)
        let 候选: { floorId: number, snapshot: Record<string, any> } | null = 编号对不上.sort((a, b) => b.floorId - a.floorId)[0] ?? null;
        // 情形二(更常见): 索引里的编号**整批都不存在了**(删的是前段), 索引已经失去意义 ——
        // 那就从最新楼层往下找第一份"还躺在这条消息身上"的快照: 它按写入时间就是最近那份。
        if (!候选) {
            const 最后 = (() => { try { return host.chat.lastMessageId(); } catch { return -1; } })();
            const 最多回溯 = 500; // 兜底上限: 再久以前的快照意义也不大, 不必扫穿整条聊天
            for (let id = 最后; id >= 0 && id > 最后 - 最多回溯; id--) {
                let 快照 = null;
                try {
                    快照 = host.vars.get({ type: 'message', message_id: id })?.[STORAGE_KEY] ?? null;
                }
                catch {
                    快照 = null;
                }
                if (快照 && typeof 快照 === 'object') {
                    候选 = { floorId: id, snapshot: 快照 };
                    break;
                }
            }
        }
        if (候选) {
            const { floorId, snapshot } = 候选;
            const 修正: Record<string, any> = { ...snapshot, 楼层: floorId, 处理到楼层: floorId };
            try {
                host.vars.insertOrAssign({ [STORAGE_KEY]: 修正 }, { type: 'message', message_id: floorId });
            }
            catch {
                // 写不回去也不影响本次读到的东西
            }
            meta.快照楼层 = [floorId];
            if (missingFloors.length > 0)
                meta.快照楼层 = meta.快照楼层.filter(floor => !missingFloors.includes(floor));
            saveMeta(host, meta);
            const 位移 = 编号对不上.map(x => x.floorId - Number(x.snapshot.楼层 ?? 0)).filter(n => Number.isFinite(n));
            console.warn(`[彼方] 楼层号与快照对不上(楼层被删过, 编号重排): 已按 #${floorId} 上的快照认领(它记的原编号 ${snapshot.楼层}), `
                + `恢复 ${Array.isArray(修正.名单) ? 修正.名单.length : 0} 个 NPC。位移线索: ${位移.join(' / ') || '(无)'}`);
            return { ...成数据(修正, floorId), 清空层: meta.清空层 };
        }
        if (missingFloors.length > 0) {
            meta.快照楼层 = meta.快照楼层.filter(floor => !missingFloors.includes(floor));
            saveMeta(host, meta);
        }
        return { ...emptyData(), 清空层: meta.清空层 };
    }
    catch (error) {
        console.warn('[彼方] 读取状态失败, 使用空状态:', error);
        return emptyData();
    }
}
/** 构造楼层快照数据(楼层不存在时返回 null) */
function buildSnapshotPayload(host: 快照宿主, data: 彼方数据, anchorFloor: number, processedFloor: number): 快照载荷 | null {
    let message = null;
    try {
        message = host.chat.messages(anchorFloor)[0] ?? null;
    }
    catch {
        message = null;
    }
    if (!message)
        return null;
    // 快照体积控制: 清理每张 NPC 卡的调试/运行时字段, 防止长聊天里快照无限膨胀
    // - 最后更新: 现实时间戳, 每次更新都变, 对恢复状态无意义
    // - 人设参考: 每轮更新动态注入的世界书人设(由 update.ts 按 NPC 名字激活), 不该入库
    // - 恋爱事件: 临时的结构化事件载荷(合并时已被消费删除), 防御性清理, 绝不入库
    // ⚠️ **「最后剧情时刻」必须保留**(批2·B2): 它是逐 NPC 跨度的唯一基准, 删了就永远算不出
    //   "这个 NPC 多久没被更新过"。它体积很小(一个 YYYY-MM-DD HH:mm 串), 不进上面的清理名单。
    const cleanedNpc: Record<string, Record<string, any>> = {};
    for (const [name, card] of Object.entries(data.NPC ?? {})) {
        if (!card || typeof card !== 'object')
            continue;
        const cleaned: Record<string, any> = { ...card };
        delete cleaned['最后更新'];
        delete cleaned['人设参考'];
        delete cleaned['恋爱事件'];
        cleanedNpc[name] = cleaned;
    }
    return {
        版本: DATA_VERSION,
        楼层: anchorFloor,
        处理到楼层: processedFloor,
        名单: [...(data.名单 ?? [])],
        NPC: klona(cleanedNpc),
        统计: { 更新次数: data.统计?.更新次数 ?? 0, 最后更新: data.统计?.最后更新 ?? 0 },
        剧情时间: data.剧情时间 ?? '',
    };
}
/** 把快照整体写入楼层变量(当前swipe页): 整体赋值该键避免深合并残留, 同楼层其他键(其他脚本的变量)不动 */
function writeFloorVariables(host: 快照宿主, payload: 快照载荷) {
    host.vars.update(variables => {
        variables[STORAGE_KEY] = payload;
        return variables;
    }, { type: 'message', message_id: payload.楼层 });
}
/**
 * 锚点之后是否已有一份更靠后的快照(通常来自玩家手动保存)。
 *
 * 为什么要有这一条: 自动更新锚在「取料末层」, 手动保存锚在「最新层」, 两者可以差好几楼。
 * 读侧只取最大层号那份, 于是自动更新那轮的结果**写进去了却永远读不到**——静默丢弃。
 * 检测到冲突时自动更新不写入, 由调用方告诉玩家「这轮结果因手动修改未保存」。
 *
 * 手动保存不会误伤: 它锚的就是最新层, 后面不可能还有更靠后的快照。
 */
function 锚点之后有快照(meta: 快照元数据, anchorFloor: number): boolean {
    return meta.快照楼层.some(floor => floor > anchorFloor);
}

/** 锚点之后已有更新快照的楼层号(空数组 = 没有冲突)。调用方用它区分"写入失败"的两种原因。 */
function 锚点之后的快照楼层(host: 快照宿主, anchorFloor: number): number[] {
    return loadMeta(host).快照楼层.filter(floor => floor > anchorFloor);
}

/**
 * 把状态整体写成一份楼层快照, 存到 `anchorFloor` 楼层的楼层变量里(当前swipe页),
 * 并维护聊天变量里的快照楼层索引 + 物理清理超额的更早快照。
 *
 * @param data 要持久化的状态(名单/NPC/统计/剧情时间)
 * @param anchorFloor 快照锚定的楼层号(快照随该楼层存亡)
 * @param processedFloor 「已分析到哪条楼层」(增量判定用)
 * @param consumeClearLayer 成功写入后是否把「清空层」清零(自动更新成功后清零=清空层只在首次更新生效)
 * @param metaInput 调用方已持有的元数据; 不传则内部读取
 * @param 允许覆盖更新快照 自动更新路径传 false: 锚点之后已有更新快照时不写入(见 锚点之后有快照)。
 *   手动保存传 true——它锚的就是最新层, 不存在"后面还有更新的快照", 这条检测对它恒为假。
 */
function writeStateSnapshot(host: 快照宿主, data: 彼方数据, anchorFloor: number, processedFloor: number, consumeClearLayer: boolean, metaInput: 快照元数据 | null = null, 允许覆盖更新快照 = true): boolean {
    const meta = metaInput ?? loadMeta(host);
    if (!允许覆盖更新快照 && 锚点之后有快照(meta, anchorFloor)) {
        // 不写入, 但要说清楚: 玩家以为更新成功了、其实这轮结果没进库。
        const 更新的楼层 = meta.快照楼层.filter(floor => floor > anchorFloor);
        const 说明 = `本轮结果因手动修改未保存: 楼层 #${更新的楼层.join('、#')} 上有更新的快照(通常来自手动保存), 本轮锚点 #${anchorFloor} 之后已有它, 写入会被读侧忽略。`;
        console.warn(`[彼方] ${说明}`);
        return false;
    }
    const payload = buildSnapshotPayload(host, data, anchorFloor, processedFloor);
    if (!payload) {
        console.warn(`[彼方] 楼层 #${anchorFloor} 不存在, 无法保存快照`);
        return false;
    }
    try {
        writeFloorVariables(host, payload);
    }
    catch (error) {
        console.error(`[彼方] 写入楼层快照失败(楼层 #${anchorFloor}):`, error);
        return false;
    }
    // 维护索引(同层重填时去重替换)并物理清理超额快照
    meta.快照楼层 = meta.快照楼层.filter(floor => floor !== anchorFloor);
    meta.快照楼层.push(anchorFloor);
    meta.快照楼层.sort((a, b) => a - b);
    while (meta.快照楼层.length > SNAPSHOT_LIMIT) {
        const removed = meta.快照楼层.shift();
        try {
            host.vars.del(STORAGE_KEY, { type: 'message', message_id: removed });
        }
        catch {
            // 楼层可能已不存在, 忽略
        }
    }
    if (consumeClearLayer)
        meta.清空层 = 0;
    // ⚠ **索引写失败 = 整次保存失败**（2026-11-19 P1-1）。
    //
    //  ── 原来为什么会骗人 ──
    //  这里丢弃了 `saveMeta` 的返回值。而 `saveMeta` 失败时只 console + toast 然后 `return false`。
    //  于是：**楼层快照写了、索引没更新** → 刷新后读侧找不到这一层 → **状态回退**，
    //  而 `writeStateSnapshot` 仍然 `return true` → 界面弹「已更新」。
    //
    //  **用户看到的是成功，实际是数据丢了。** 这比直接报错糟得多。
    //
    //  ── 为什么索引失败就该整体失败 ──
    //  索引是"哪些楼层有快照"的唯一来源；快照本体存在但索引里没有 = 读侧看不见 = 等于没存。
    //  所以这两件事要么都成、要么都算失败。
    if (!saveMeta(host, meta)) {
        console.error(`[彼方] 快照索引写入失败(楼层 #${anchorFloor}): 快照本体已写但读侧找不到它, 本次按失败处理`);
        return false;
    }
    console.info(`[彼方] 快照写入楼层 #${anchorFloor} (NPC=${Object.keys(payload.NPC).length}个: ${Object.keys(payload.NPC).join('、') || '(空)'}; 更新次数=${payload.统计?.更新次数}; 保留快照楼层=[${meta.快照楼层.join(',')}]${consumeClearLayer ? ', 清空层已生效清零' : ''})`);
    console.info(`[彼方] 本轮更新前名单: [${(data.名单 ?? []).join('、') || '(空)'}] → 更新后名单: [${(payload.名单 ?? []).join('、') || '(空)'}]`);
    return true;
}
/**
 * 保存当前状态(界面手动编辑用): 以最新楼层为锚点写入快照, 不改变「已分析到哪」的进度。
 *
 * **返回值就是"落盘了没有"**: 调用方必须据此决定要不要提交给界面、要不要提示。
 * 提示不在这一层弹——同一句话在"保存"与"清空"两条路上的说法不同, 由调用方出。
 */
function saveData(host: 快照宿主, data: 彼方数据): boolean {
    try {
        const anchor = host.chat.lastMessageId();
        // 手动保存锚的就是最新层, 后面不可能有更新的快照 —— 冲突检测对它恒为假, 显式传 true 表明这一点
        return writeStateSnapshot(host, data, anchor, typeof data.处理到楼层 === 'number' ? data.处理到楼层 : 0, false, null, true);
    }
    catch (error) {
        console.error('[彼方] 保存NPC状态失败:', error);
        return false;
    }
}
/** 单独更新清空层(不动快照): 清空层自适应下移等场景使用 */
function updateClearLayer(host: 快照宿主, clearLayer: number) {
    const meta = loadMeta(host);
    meta.清空层 = clearLayer;
    saveMeta(host, meta);
}
/** 撤销指定楼层的快照(手动「重新填写」用): 从索引移除并物理删除, 状态自动回落到更早楼层 */
function discardSnapshotAt(host: 快照宿主, floorId: number) {
    const meta = loadMeta(host);
    if (!meta.快照楼层.includes(floorId))
        return false;
    meta.快照楼层 = meta.快照楼层.filter(floor => floor !== floorId);
    saveMeta(host, meta);
    try {
        host.vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
    }
    catch {
        // 楼层可能已不存在, 忽略
    }
    console.info(`[彼方] 已撤销楼层 #${floorId} 的快照`);
    return true;
}
/** 清空的结果: `成功=false` 时**什么都没改**(清空层仍是旧值, 快照一份没删) */
export interface 清空结果 {
    成功: boolean;
    /** 实际生效的清空层; 失败时是调用前的旧值 */
    清空层: number;
    /** 失败原因(成功时没有) */
    失败原因?: string;
}

/**
 * 清空全部彼方数据: 物理删除所有楼层的快照 + 重置元数据, 并记录当前楼层为「清空层」。
 *
 * 顺序是"先定截止点、再动手": 读不到当前楼层就**直接放弃**, 一份快照都不删。
 * 反过来(先删后定)会让清空层停在 0 —— 那等于下一轮把整条聊天重分析一遍, 而玩家以为自己清空了。
 */
function clearAllData(host: 快照宿主): 清空结果 {
    const meta = loadMeta(host);
    let 当前楼层: number;
    try {
        当前楼层 = host.chat.lastMessageId();
    }
    catch (error) {
        console.error('[彼方] 清空失败: 读不到当前楼层:', error);
        return { 成功: false, 清空层: meta.清空层, 失败原因: '读不到当前楼层' };
    }
    for (const floorId of meta.快照楼层) {
        try {
            host.vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
        }
        catch {
            // 楼层可能已不存在, 忽略
        }
    }
    const fresh = emptyMeta();
    fresh.清空层 = 当前楼层;
    // 元数据写不进去 = 清空层没生效, 状态会在下一轮被当成"没清过"; 提示由调用方统一出
    if (!saveMeta(host, fresh, true))
        return { 成功: false, 清空层: meta.清空层, 失败原因: '清空层没能写入聊天变量' };
    // 日志也是彼方的数据: 清空数据却留着上一轮的请求/响应, 会让"清空后打开日志页"看到旧现场。
    // 放在这里而不是界面层: clearAllData 是"清空彼方数据"的唯一落点(用例也直接打它)。
    清空日志(host);
    return { 成功: true, 清空层: 当前楼层 };
}

/**
 * 读取**最近 K 份**快照的载荷(按楼层升序返回: 旧 → 新), 供批1.5 的「近期轨迹」做 diff。
 *
 * 与 `loadData` 的分工: `loadData` 只取**最新一份有效快照**(当前状态), 这里要的是**一串历史**。
 * 两者共用同一套"哪份算有效"的判断(楼层存在 + 快照键编号对得上), 但这里**不认领**编号错位的快照 ——
 * 认领是"把旧编号改成本楼"的一次性修复, 对 diff 来说, 一份编号错位的快照只会让相邻配对失真,
 * 直接跳过更安全(它会在下一轮被 `loadData` 修好)。
 *
 * **为什么必须在这里读**: 楼层快照的物理位置(`{type:'message', message_id}`)只有这个模块知道;
 * 让 `轨迹.ts` 自己遍历楼层变量, 等于把存储细节复制一份, 早晚漂。
 *
 * @param K 最多取几份(轨迹侧还有自己的上限, 这里只是"别把整条聊天读一遍")
 */
function 读取快照序列(host: 快照宿主, K: number): Array<{ 楼层: number, NPC: Record<string, Record<string, any>> }> {
    const 结果: Array<{ 楼层: number, NPC: Record<string, Record<string, any>> }> = [];
    try {
        const meta = loadMeta(host);
        const floors = [...meta.快照楼层].sort((a, b) => a - b);
        for (let i = floors.length - 1; i >= 0 && 结果.length < K; i--) {
            const floorId = floors[i];
            let message = null;
            try {
                message = host.chat.messages(floorId)[0] ?? null;
            }
            catch {
                message = null;
            }
            // 楼层被删了: 快照随之消亡, 跳过(不清理索引 —— 那是 loadData 的活, 读路径不该有副作用)
            if (!message)
                continue;
            let snapshot: Record<string, any> | null = null;
            try {
                snapshot = host.vars.get({ type: 'message', message_id: floorId })?.[STORAGE_KEY] ?? null;
            }
            catch {
                snapshot = null;
            }
            if (!snapshot || typeof snapshot !== 'object')
                continue;
            // 编号对不上 → 跳过(理由见函数注释: 认领是 loadData 的事)
            if (snapshot.楼层 !== floorId)
                continue;
            const npc = snapshot.NPC && typeof snapshot.NPC === 'object' ? snapshot.NPC : {};
            结果.push({ 楼层: floorId, NPC: npc as Record<string, Record<string, any>> });
        }
    }
    catch (error) {
        // 读快照序列失败不该让整轮更新崩掉: 轨迹是"锦上添花", 没有它照常更新
        console.warn('[彼方] 读取快照序列失败(本轮不生成近期轨迹):', error);
        return [];
    }
    // 上面是从新往旧扫的, 反转成"旧 → 新"(diff 需要这个方向)
    return 结果.reverse();
}

export { DATA_VERSION, SNAPSHOT_LIMIT, STORAGE_KEY, clearAllData, discardSnapshotAt, emptyData, loadData, saveData, updateClearLayer, writeStateSnapshot, 读取基线, 读取快照序列, 锚点之后的快照楼层 };
export type { 快照宿主 };
