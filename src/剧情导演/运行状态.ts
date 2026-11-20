// 剧情导演 · 运行状态(聊天变量 meta): 离线熔断 + 已剧终
//
// 这一块原先在 快照.ts 里, 和"楼层快照怎么存"挤在一起, 但它俩**完全无关**:
// 快照存的是账本(随楼层存亡), meta 存的是"引擎此刻还能不能跑"(失败时账本根本没落盘,
// 所以离线计数只能放 meta; 放快照会随删楼丢, 放全局会跨聊天串味)。
// 拆出来之后: 存储管账本, 运行状态管熔断与剧终标记, 两边各自能单测。
import { klona } from 'klona';
import { useHost } from './host';
import { toastError } from './toast';
import { 规范化书纲覆盖, 空书纲覆盖, type 书纲覆盖 } from './书纲';

export const STORAGE_KEY = '剧情导演';
export const DATA_VERSION = 1;

/** 引擎离线状态(熔断): 存**聊天变量 meta** —— 失败时账本快照根本不落盘, 存快照会丢; 也不存全局(跨聊天串味) */
export interface 离线状态 {
  连败次数: number;
  最后失败原因: string;
  最后失败时间: number;
  自动暂停: boolean;
}

/** 连败多少次自动暂停自动接管(防 token 白烧) */
export const 熔断阈值 = 3;

/**
 * 熔断冷却(2026-11-08): 暂停超过这么久, 自动放行**一次**试探。
 *
 * 为什么要它: 旧实现在暂停后直接跳过自动推进, 而"复位"只认"成功一次" ——
 * 不跑就不会成功, 不成功就不会复位, 于是**死锁**。用户唯一的出口是面板上那个
 * 「恢复自动接管」按钮, 而它只 console.warn, 不弹提示, 等于没有。
 *
 * 放行不改标记: 成功会照常 `清推进失败`; 失败会照常 `记推进失败` —— 那里的
 * `最后失败时间` 会把冷却重新推后, 所以天然就是"每 N 分钟最多试一次"。
 */
export const 熔断冷却毫秒 = 10 * 60 * 1000;

/**
 * 熔断之后还能不能试一次(纯函数, 可单测)。`自动暂停` 为假 → 本来就能跑。
 *
 * 两个宽容口子: 没有 `最后失败时间`(老数据/手工置位)时直接放行 —— 不能因为一个
 * 缺失的时间戳把用户永久锁死。
 */
export function 熔断可放行(离线: 离线状态, 现在 = Date.now()): boolean {
  if (!离线?.自动暂停) return true;
  const 上次 = Number(离线.最后失败时间) || 0;
  if (上次 <= 0) return true;
  return 现在 - 上次 >= 熔断冷却毫秒;
}

export function empty离线(): 离线状态 {
  return { 连败次数: 0, 最后失败原因: '', 最后失败时间: 0, 自动暂停: false };
}

export interface ChatMeta {
  版本: number;
  快照楼层: number[];
  清空层: number;
  /** 已剧终(与账本字段**双写**: 账本会随快照回退/清空, meta 不会, 故取两者之或) */
  已剧终: boolean;
  /** 熔断/离线可观测(独立于账本: 失败时账本根本没落盘) */
  离线: 离线状态;
}

export function emptyMeta(): ChatMeta {
  return { 版本: DATA_VERSION, 快照楼层: [], 清空层: 0, 已剧终: false, 离线: empty离线() };
}

function 解析离线(raw: any): 离线状态 {
  if (!raw || typeof raw !== 'object') return empty离线();
  return {
    连败次数: Math.max(0, Number(raw.连败次数) || 0),
    最后失败原因: String(raw.最后失败原因 ?? ''),
    最后失败时间: Number(raw.最后失败时间) || 0,
    自动暂停: !!raw.自动暂停,
  };
}

/**
 * 写整份 meta(只给本模块与 快照.ts 的快照楼层登记用)。
 *
 * **2026-11-13 批次H-1: 返回 boolean。** 以前返回 `void`，catch 里只打日志 ——
 * 于是 `writeStateSnapshot` 无条件 `return true`：快照写进楼层了、但 `meta.快照楼层` 没登记，
 * 下次 `loadData` 从 `meta.快照楼层` 往前找就找不到这份 → 回退到更早的快照。
 * **面板说"已保存"，引擎用的却是旧账本** —— 这是静默的数据分叉，不是"少一条日志"。
 */
export function saveMeta(meta: ChatMeta): boolean {
  try {
    useHost().vars.update(variables => {
      variables[STORAGE_KEY] = klona(meta);
      return variables;
    }, { type: 'chat' });
    return true;
  } catch (error) {
    console.error('[剧情导演] 保存元数据失败:', error);
    toastError(`剧情导演: 保存元数据失败 ${error instanceof Error ? error.message : String(error)}`, '剧情导演');
    return false;
  }
}

/** 读整份 meta(读不到/形状不对 → 空 meta, 不抛) */
export function loadMeta(): ChatMeta {
  let raw = null;
  try {
    raw = useHost().vars.get({ type: 'chat' })?.[STORAGE_KEY] ?? null;
  } catch {
    return emptyMeta();
  }
  if (!raw || typeof raw !== 'object') return emptyMeta();
  const 已剧终 = !!raw.已剧终;
  const 离线 = 解析离线(raw.离线);
  if (!Array.isArray(raw.快照楼层)) {
    return { 版本: DATA_VERSION, 快照楼层: [], 清空层: typeof raw.清空层 === 'number' ? raw.清空层 : 0, 已剧终, 离线 };
  }
  return {
    版本: DATA_VERSION,
    快照楼层: raw.快照楼层.filter((floor: unknown) => typeof floor === 'number' && Number.isFinite(floor)),
    清空层: typeof raw.清空层 === 'number' ? raw.清空层 : 0,
    已剧终,
    离线,
  };
}

// ---------------------------------------------------------------------------
// 熔断/离线 与 已剧终 的读写(都落在聊天变量 meta, **不依赖账本快照**)
// ---------------------------------------------------------------------------

export function 读离线状态(): 离线状态 {
  try {
    return loadMeta().离线;
  } catch {
    return empty离线();
  }
}

/** 记一次推进失败: 连败 +1; 达到阈值 → 自动暂停自动接管 */
export function 记推进失败(原因: string): 离线状态 {
  try {
    const meta = loadMeta();
    const 连败次数 = Math.max(0, Number(meta.离线?.连败次数) || 0) + 1;
    meta.离线 = {
      连败次数,
      最后失败原因: String(原因 ?? ''),
      最后失败时间: Date.now(),
      自动暂停: 连败次数 >= 熔断阈值,
    };
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 记录推进失败失败:', error);
    return empty离线();
  }
}

/** 一次成功 → 连败清零、自动暂停解除(本来就没计数时不写存储) */
export function 清推进失败(): 离线状态 {
  try {
    const meta = loadMeta();
    const 之前 = meta.离线;
    if (之前.连败次数 === 0 && !之前.最后失败原因 && !之前.自动暂停) return 之前;
    meta.离线 = empty离线();
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 清除推进失败计数失败:', error);
    return empty离线();
  }
}

/** 面板「恢复自动接管」(false) / 需要时临时暂停(true; 保留上次失败原因便于展示) */
export function 设自动暂停(值: boolean): 离线状态 {
  try {
    const meta = loadMeta();
    meta.离线 = 值
      ? {
          连败次数: Math.max(熔断阈值, Number(meta.离线?.连败次数) || 0),
          最后失败原因: String(meta.离线?.最后失败原因 ?? ''),
          最后失败时间: Number(meta.离线?.最后失败时间) || Date.now(),
          自动暂停: true,
        }
      : empty离线();
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 更新自动暂停失败:', error);
    return empty离线();
  }
}

// ---------------------------------------------------------------------------
// 书纲覆盖(第二轮方案 2.1): 用户的编辑/锁定/否决, 存聊天变量**单独一把键**,
// 不进 meta(saveMeta 整份写, 会互相覆盖)也不进快照(删楼不能把用户亲手改的东西回滚掉)。
// ---------------------------------------------------------------------------

export const 书纲覆盖键 = '剧情导演_书纲覆盖';

export function 读书纲覆盖(): 书纲覆盖 {
  try {
    return 规范化书纲覆盖(useHost().vars.get({ type: 'chat' })?.[书纲覆盖键]);
  } catch {
    return 空书纲覆盖();
  }
}

export function 写书纲覆盖(覆盖: 书纲覆盖): boolean {
  try {
    useHost().vars.update(variables => {
      variables[书纲覆盖键] = klona(覆盖);
      return variables;
    }, { type: 'chat' });
    return true;
  } catch (error) {
    console.warn('[剧情导演] 保存书纲覆盖失败:', error);
    toastError(`剧情导演: 书纲改动没存上 ${error instanceof Error ? error.message : String(error)}`, '剧情导演');
    return false;
  }
}

export function 读已剧终(): boolean {
  try {
    return !!loadMeta().已剧终;
  } catch {
    return false;
  }
}

/**
 * 写「已剧终」到 chat 变量 meta(账本侧的字段由调用方一起写, 构成双写)
 *
 * ── ⚠ 调用时序：必须在**账本落盘成功之后**（2026-11-20 #542②）──
 *
 *  这个函数是"第三个写口"的一半 —— 它写 meta，账本侧由调用方写。
 *  两边必须**同时成立**，否则会出现"meta 说已剧终、账本不认"（引擎停了但面板还在演）。
 *
 *  目前由 `确认剧终` / `清除剧终` 保证：
 *    ① 账本落盘（唯一可能失败的步骤）
 *    ② 成功 → 调本函数写 meta
 *    ③ 成功 → 结算死亡
 *    ④ 任一步失败 → ②③ 一个字都不写
 *  顺序断言在 `tests/daoyan-commands.test.ts` 的 [6] 段。
 *
 *  **将来若有第二个调用方**：请在这里加"账本已落盘"的前置校验，
 *  或者确保调用方自己遵守上面的顺序 —— 别直接调它。
 */
export function 写已剧终(值: boolean): boolean {
  try {
    const meta = loadMeta();
    meta.已剧终 = !!值;
    saveMeta(meta);
    return true;
  } catch (error) {
    console.warn('[剧情导演] 写已剧终到 meta 失败:', error);
    return false;
  }
}
