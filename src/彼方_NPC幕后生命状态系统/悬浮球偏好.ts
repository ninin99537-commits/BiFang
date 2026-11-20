// 彼方 · 界面偏好接线: 悬浮球落点 + 面板主题。
//
// 这两项只是"用户把界面摆成什么样", 与彼方数据无关, 所以存**全局变量**而不是聊天变量。
// 但"怎么存"不再由彼方自己决定 —— 读写纪律收在 共用/界面偏好.ts:
//   ① 全局变量优先、localStorage 兜底(刷新时全局可能还没从服务器加载完);
//   ② 写回**只写相对基线改动过的字段**, 再合并进存储里当前那份(整键 insertOrAssign 会冲掉别的窗口刚改的字段);
//   ③ 从没成功读到过就不写全局(否则拿内存默认值覆盖用户的真实坐标)。
// 本文件只负责: 键名、脏数据判定、以及把 storage 接口接到 host.vars / localStorage 上。
//
// 旧版是"两个键 + 整键覆盖 + 无本地兜底"(`彼方_主题` / `彼方_悬浮球`)。旧键**只读不写**:
// 第一次读到就迁进新形状, 之后一律走新键; 旧键留着不删, 回退到上一版还能用。

import { ref, watch } from 'vue';
import { 建偏好会话 } from '../共用/界面偏好';
import type { 偏好会话, 偏好存储, 偏好主题, 界面偏好 } from '../共用/界面偏好';
import type { Host } from './host';

export type 面板主题 = 偏好主题;
export type 球位置 = { x: number; y: number };

/** 只用到变量读写, 不要求整个宿主 */
type 偏好宿主 = Pick<Host, 'vars'>;

const 偏好键 = '彼方_界面偏好';
const 本地键 = '彼方_界面偏好';
/** 旧版两个键(整键覆盖、无本地兜底): 只读, 用于一次性迁移 */
const 旧主题键 = '彼方_主题';
const 旧位置键 = '彼方_悬浮球';

function 读本地(键: string): string | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(键);
    }
    catch {
        return null;
    }
}

function 写本地(键: string, 文本: string): void {
    try {
        if (typeof localStorage !== 'undefined')
            localStorage.setItem(键, 文本);
    }
    catch {
        // 忽略: 本地缓存坏掉只是下次少一层兜底
    }
}

/** 存储接缝: 全局变量是真相, localStorage 是本机缓存 */
function 建存储(host: 偏好宿主): 偏好存储 {
    return {
        读全局: () => {
            try {
                return host.vars.get({ type: 'global' })?.[偏好键];
            }
            catch {
                return null;
            }
        },
        写全局: (值: 界面偏好) => {
            try {
                host.vars.insertOrAssign({ [偏好键]: 值 }, { type: 'global' });
            }
            catch {
                // 忽略保存失败: 存不住只是下次回到默认, 不该打断使用
            }
        },
        读本地: () => 读本地(本地键),
        写本地: (文本: string) => 写本地(本地键, 文本),
    };
}

/**
 * 旧版两个键 → 新形状(一次性)。
 * 这里是**唯一**允许"没有基线也写全局"的地方: 迁移就是把旧值搬过去, 不存在覆盖别人的问题。
 */
function 迁移旧偏好(host: 偏好宿主, 存: 偏好存储): 界面偏好 | null {
    try {
        const 全局 = host.vars.get({ type: 'global' });
        const 旧主题 = 全局?.[旧主题键];
        const 旧位置 = 全局?.[旧位置键];
        const 主题: 偏好主题 | undefined = 旧主题 === 'light' || 旧主题 === 'dark' ? 旧主题 : undefined;
        const 位置合法 = !!旧位置 && typeof 旧位置.x === 'number' && typeof 旧位置.y === 'number';
        if (主题 === undefined && !位置合法)
            return null;
        // 没存过位置就用 0,0 这个**哨兵**(球永远不可能停在 0,0: 视口钳制至少留半个球),
        // 读球位置 见到它仍返回 null, 界面照旧用自己的默认位
        const 偏好: 界面偏好 = { x: 位置合法 ? 旧位置.x : 0, y: 位置合法 ? 旧位置.y : 0, 主题: 主题 ?? 'dark' };
        存.写全局(偏好);
        存.写本地(JSON.stringify(偏好));
        return 偏好;
    }
    catch {
        return null;
    }
}

/** 每个宿主一份会话: 会话要记住"读到过什么"当写回基线, 不能每次调用新建 */
const 会话表 = new WeakMap<object, 偏好会话>();

function 取会话(host: 偏好宿主): { 会话: 偏好会话; 存: 偏好存储 } {
    const 键 = host as unknown as object;
    const 已有 = 会话表.get(键);
    if (已有)
        return { 会话: 已有, 存: 建存储(host) };
    const 存 = 建存储(host);
    const 会话 = 建偏好会话(存);
    会话表.set(键, 会话);
    return { 会话, 存 };
}

/** 读偏好: 新键 → (没有就)迁移旧键 → 还是没有就 null(界面用自己的默认) */
function 读偏好(host: 偏好宿主): 界面偏好 | null {
    const { 会话, 存 } = 取会话(host);
    const 现成 = 会话.读();
    if (现成)
        return 现成;
    const 迁移 = 迁移旧偏好(host, 存);
    if (!迁移)
        return null;
    // 迁移后重读一次: 让会话把这份值记成写回基线(否则之后的写永远不会落全局)
    return 会话.读();
}

/**
 * 存偏好: 只把改动的字段并进去(纪律在 共用/界面偏好.ts)。
 *
 * 例外: **从没读到过任何偏好**(全新装上、或全局与本地都空)时, 会话还没有写回基线,
 * 共用那边的规矩是"没有基线就不写全局"(防默认值盖掉真实坐标)。但这条路径只由**用户动作**
 * 触发(拖完球、切主题), 写下去的是一次真实的拖动结果, 不是默认值 —— 所以这里走"初始化写",
 * 写完立刻重读一次, 让会话把这份值记成基线。少了这一步, 新用户的第一次拖动只落 localStorage,
 * 换设备/清缓存就没了。
 */
function 存偏好(host: 偏好宿主, 补丁: Partial<界面偏好>): void {
    const { 会话, 存 } = 取会话(host);
    const 现 = 读偏好(host);
    const 新值: 界面偏好 = { ...(现 ?? { x: 0, y: 0, 主题: 'dark' as 偏好主题 }), ...补丁 };
    if (!现) {
        存.写全局(新值);
        存.写本地(JSON.stringify(新值));
        会话.读();
        return;
    }
    会话.写(新值);
}

/** 主题: 读到的值做初值, 之后每次切换写回; 读失败都退回默认深色 */
export function use面板主题(host: 偏好宿主) {
    const theme = ref<面板主题>(读偏好(host)?.主题 === 'light' ? 'light' : 'dark');

    function toggleTheme() {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
    }

    watch(theme, 值 => 存偏好(host, { 主题: 值 }));

    return { theme, toggleTheme };
}

/**
 * 球位有效性判定 —— **与 `共用/面板机制.ts` 同口径**（2026-11-20 毒值小修，需求方 #469）。
 *
 * ── 为什么需要它 ──
 *
 *  原来 `读球位置` 只挡 `0,0` 这个迁移哨兵。于是 **`{20,20}` 这种毒值原样返回**：
 *    · 挂载恢复的下界是 `halfOrb() - EDGE_GAP` = `CLOSED_SIZE/2` ≈ 20 → `{20,20}` 能通过
 *    · `persistOrbPos` 只查 `null` → clamp 后的 `(20,20)` 直接写回全局
 *  → **球被钉在左上角，永久**（毒值每次被读回、又被写回）。
 *
 * ── 判据（照抄共用那份）──
 *
 *  下界用 **`CLOSED_SIZE`** 而不是半个球 —— 与拖动夹取同口径，
 *  于是 `{x:20, y:20}` 这类历史毒值一律判无效。
 *
 *  > **夹到边界不等于安全**：夹出来的 `20,20` 还是毒值。差一个阈值就是永久钉住。
 */
function 球位有效(x: unknown, y: unknown, vw: number, vh: number, 球直径: number): boolean {
    const 半 = 球直径 / 2;
    return (
        typeof x === 'number' && typeof y === 'number'
        && Number.isFinite(x) && Number.isFinite(y)
        && x >= 球直径 && y >= 球直径
        && x <= vw - 半 && y <= vh - 半
    );
}

/** 视口可用吗 —— 量不出宽高时**绝不落盘**（否则会把当帧的兜底结果永久写进去） */
function 视口可用(vw: number, vh: number): boolean {
    return vw >= 200 && vh >= 200;
}

/**
 * 读球落点: 从没存过(或旧值认不出/是毒值)就返回 null, 界面用自己的默认位。
 *
 * @param 视口 当前视口尺寸（宽/高）。量不出时（宽或高 < 200）**一律返回 null** ——
 *   那时任何坐标都不可信，界面的默认位比一个瞎猜的值安全。
 * @param 球直径 悬浮球直径（`theme.ts` 的 `悬浮球直径`）。有效性判定的下界是它。
 */
export function 读球位置(host: 偏好宿主, 视口?: { w: number, h: number }, 球直径 = 44): 球位置 | null {
    const 偏好 = 读偏好(host);
    if (!偏好 || typeof 偏好.x !== 'number' || typeof 偏好.y !== 'number')
        return null;
    // 0,0 是迁移时的哨兵(只迁了主题、没存过位置), 不算"存过"
    if (偏好.x === 0 && 偏好.y === 0)
        return null;
    // ── 毒值净化（2026-11-20 新增）──
    //  给了视口就必须过有效性判定；没给视口（旧调用方）则只做"有限数字"这一档，
    //  避免把"没传视口"误判成"毒值"。
    if (视口) {
        if (!视口可用(视口.w, 视口.h))
            return null;
        if (!球位有效(偏好.x, 偏好.y, 视口.w, 视口.h, 球直径))
            return null;
    }
    else if (!Number.isFinite(偏好.x) || !Number.isFinite(偏好.y)) {
        return null;
    }
    return { x: 偏好.x, y: 偏好.y };
}

export function 存球位置(host: 偏好宿主, pos: 球位置): void {
    存偏好(host, { x: pos.x, y: pos.y });
}

export { 球位有效, 视口可用 };
