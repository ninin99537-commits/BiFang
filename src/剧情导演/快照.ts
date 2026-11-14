// 剧情导演 · 剧情账本怎么落盘、怎么读回、怎么迁移、怎么清空(同族户型, 与烟火 保存世界状态.ts 同款)。
//
// 存储结构 (v1):
// - 聊天变量 `剧情导演` 只存轻量元数据: 哪些楼层有快照(索引) + 清空层
// - 账本本体(章回/伏笔/冲突/弧线/当前指令/张力/统计)整体存在**楼层变量**里, 每次引擎推进写入
//   本次分析的最后一条楼层。快照随楼层存亡——删楼/重roll/切分支时账本自动回退。
// - 楼层 hash 校验沿用同族决定: 已移除(主AI楼层在快照写入后仍会变动, hash 失配会把正常游玩误判为"被编辑")。
// 这一层不碰 Vue / pinia, 平台访问全部走 useHost(), 可脱离界面单独测。
import { useHost } from './host';
import type { 导演账本 } from './schema';
import { getSettings } from './settings';
import { toastError, toastWarning } from './toast';
import { 错误文本 } from './世界书落点';

// STORAGE_KEY / DATA_VERSION 随离线熔断一起搬进了 运行状态.ts(两者都只服务 chat meta 与快照登记)。
// 这里 import 进来自己用; STORAGE_KEY 仍原样再导出(调用方从 快照 取它), DATA_VERSION 没有外部
// 消费者就**不再转发** —— 转发没人用的名字, 只会让"这个符号谁拥有"多出一条假路径。
import { STORAGE_KEY, DATA_VERSION } from './运行状态';
export { STORAGE_KEY } from './运行状态';
/** 楼层快照默认保留份数(设置「导演.快照保留份数」可调, 默认 30) */
export const SNAPSHOT_LIMIT = 30;

// 空账本与旧快照迁移已独立成 账本迁移.ts —— schema 一改最先坏的就是那里。
// 这里 import 进来自己用(读快照要空账本/要迁移); emptyData 仍再导出(调用方从 快照 取它),
// sanitizeSnapshot 只有本文件在用, 不再转发。
import { emptyData, sanitizeSnapshot, 快照载荷 } from './账本迁移';
export { emptyData } from './账本迁移';

// 离线熔断 / 已剧终 的读写已独立成 运行状态.ts —— 它们与账本快照**完全无关**
// (失败时账本根本没落盘, 所以离线计数只能放 chat meta)。
// 这里 import 进来自己用(读快照要读 meta), 同时原样再导出, 既有调用方不用改 import。
import { emptyMeta, loadMeta, saveMeta, 读书纲覆盖 } from './运行状态';
import { 叠加覆盖 } from './书纲';
import type { ChatMeta } from './运行状态';
export { 熔断阈值, empty离线, 读离线状态, 记推进失败, 清推进失败, 设自动暂停, 读已剧终, 写已剧终 } from './运行状态';
export type { 离线状态 } from './运行状态';

// 终局三件(请求收官 / 落定剧终 / 解除剧终)已独立成 终局.ts —— 它们是纯函数, 原先却住在这个存储层里,
// 还让"存储"反过来依赖"指标域"(落定剧终 要 计算判据)。这里原样再导出, 既有调用方不用改 import。
export { 请求收官, 落定剧终, 解除剧终 } from './终局';



/** 读取账本: 从最新快照楼层往前找第一份**有效**快照(楼层被删/swipe 无快照则继续往前) */
/**
 * 2026-11-13 P1-9: 「账本读不到就返回空账本」以前是个**完全静默**的路径 ——
 * 面板显示"还没有章回/伏笔", 用户以为账本被清空了。
 * 现在：抛错与"聊天为空"分开报，并且 toast **只弹一次**（模块级标记；
 * 每次 reload 都弹等于噪音, 而这条路径可能每几秒被重试一次）。
 */
let 读取降级已提示 = false;
let 读取降级次数 = 0;
/**
 * 给用例/诊断看的计数（生产上没人调它不影响行为）。
 * 口径 = **抛错次数 + 走降级分支次数**：抛错本身也是"读不到"（宿主没就绪），只是不走提示。
 */
export function 账本读取降级计数(): number {
  return 读取降级次数;
}
/** 只给用例用：重置"提示过一次"的标记与计数 */
export function 重置账本读取降级(): void {
  读取降级已提示 = false;
  读取降级次数 = 0;
}
function 提示读取降级(原因: string): void {
  if (读取降级已提示) return;
  读取降级已提示 = true;
  console.warn(`[剧情导演] 账本暂时读不到（${原因}）—— 会自动重试`);
  try {
    toastWarning('剧情导演: 账本暂时读不到（聊天可能还在加载）—— 会自动重试, 不用手动处理', '剧情导演');
  } catch {
    // 提示失败不该影响读账本
  }
}

export function loadData(): 导演账本 {
  try {
    const meta = loadMeta();
    const floors = [...meta.快照楼层].sort((a, b) => a - b);
    let lastId = -1;
    try {
      lastId = useHost().chat.lastMessageId();
    } catch (error) {
      // 抛错 = 宿主还没就绪（**不是**"聊天为空"）—— 两件事要分开报，否则永远查不出是谁在丢数据
      lastId = -1;
      读取降级次数 += 1;
      console.warn('[剧情导演] 读取当前聊天楼层失败（宿主可能还没就绪）:', 错误文本(error));
    }
    if (floors.length > 0 && lastId < 0) {
      读取降级次数 += 1;
      提示读取降级(`${floors.length} 份快照登记着, 但读不到当前聊天楼层`);
      return { ...emptyData(), 清空层: meta.清空层, 已剧终: !!meta.已剧终 };
    }
    const missingFloors: number[] = [];
    let result: 导演账本 | null = null;
    for (let i = floors.length - 1; i >= 0; i--) {
      const floorId = floors[i];
      if (floorId > lastId) {
        missingFloors.push(floorId);
        continue;
      }
      let message = null;
      try {
        message = useHost().chat.messages(floorId)[0] ?? null;
      } catch {
        message = null;
      }
      if (!message) continue;
      let snapshot = null;
      try {
        snapshot = useHost().vars.get({ type: 'message', message_id: floorId })?.[STORAGE_KEY] ?? null;
      } catch {
        snapshot = null;
      }
      if (!snapshot || typeof snapshot !== 'object' || snapshot.楼层 !== floorId) continue;
      result = {
        ...sanitizeSnapshot(snapshot),
        锚点楼层: floorId,
        处理到楼层: Number(snapshot.处理到楼层) || 0,
        清空层: meta.清空层,
        // 已剧终双写取"或": 账本侧随快照回退, meta 侧不会 → 剧终不该被删楼/回退悄悄撤销
        已剧终: !!snapshot.已剧终 || !!meta.已剧终,
      };
      break;
    }
    if (missingFloors.length > 0) {
      meta.快照楼层 = meta.快照楼层.filter(floor => !missingFloors.includes(floor));
      // 2026-11-13 H-1: 登记失败要可见（这次只是清理脏楼层，失败不影响本次装载，但下次还会再清理一遍）
      if (!saveMeta(meta)) console.error('[剧情导演] 清理失效快照楼层后, meta 没写回去 —— 下次装载会再清理一遍');
    }
    const 账 = result ?? { ...emptyData(), 清空层: meta.清空层, 已剧终: !!meta.已剧终 };
    // 第二轮方案 2.1: 用户对书纲的编辑/锁定/否决**不随快照回滚**, 每次装载都叠上来
    账.书纲 = 叠加覆盖(账.书纲 ?? null, 读书纲覆盖());
    return 账;
  } catch (error) {
    console.warn('[剧情导演] 读取账本失败, 使用空账本:', error);
    return emptyData();
  }
}

function buildSnapshotPayload(data: 导演账本, anchorFloor: number, processedFloor: number): Record<string, any> | null {
  let message = null;
  try {
    message = useHost().chat.messages(anchorFloor)[0] ?? null;
  } catch {
    message = null;
  }
  if (!message) return null;
  // 2026-11-12(架构深化 ①): 数据部分由 `账本字段表` 派生 —— 这里不再逐个列字段。
  // 以前"存了没读/读了没存"只能靠一个正则扫源码的用例兜着, 现在是结构性的。
  return {
    版本: DATA_VERSION,
    楼层: anchorFloor,
    处理到楼层: processedFloor,
    ...快照载荷(data),
  };
}

function writeFloorVariables(payload: Record<string, any>) {
  useHost().vars.update(variables => {
    variables[STORAGE_KEY] = payload;
    return variables;
  }, { type: 'message', message_id: payload.楼层 });
}

function snapshotLimit(): number {
  let limit = SNAPSHOT_LIMIT;
  try {
    const configured = getSettings().导演.快照保留份数;
    if (Number.isFinite(configured) && configured >= 1) limit = Math.min(100, Math.round(configured));
  } catch {
    // 设置读取失败用默认值
  }
  return limit;
}

/**
 * 把账本整体写成一份楼层快照。@param consumeClearLayer 成功写入后是否清零「清空层」。
 */
export function writeStateSnapshot(data: 导演账本, anchorFloor: number, processedFloor: number, consumeClearLayer: boolean, metaInput: ChatMeta | null = null): boolean {
  const meta = metaInput ?? loadMeta();
  const payload = buildSnapshotPayload(data, anchorFloor, processedFloor);
  if (!payload) {
    console.warn(`[剧情导演] 楼层 #${anchorFloor} 不存在, 无法保存快照`);
    return false;
  }
  try {
    writeFloorVariables(payload);
  } catch (error) {
    console.error(`[剧情导演] 写入楼层快照失败(楼层 #${anchorFloor}):`, error);
    return false;
  }
  meta.快照楼层 = meta.快照楼层.filter(floor => floor !== anchorFloor);
  meta.快照楼层.push(anchorFloor);
  meta.快照楼层.sort((a, b) => a - b);
  const limit = snapshotLimit();
  while (meta.快照楼层.length > limit) {
    const removed = meta.快照楼层.shift() as number;
    try {
      useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: removed });
    } catch {
      // 楼层可能已不存在, 忽略
    }
  }
  if (consumeClearLayer) meta.清空层 = 0;
  // 2026-11-13 批次H-1: 索引登记失败 = 这次快照**白写**（下次 loadData 找不到它）→ 必须如实返回 false
  if (!saveMeta(meta)) {
    console.error(`[剧情导演] 快照已写进楼层 #${anchorFloor}, 但索引没登记成功 —— 下次读回会跳过它`);
    return false;
  }
  console.info(`[剧情导演] 快照写入楼层 #${anchorFloor} (章回=${payload.章回 ? payload.章回.章号 : '无'}, 伏笔=${payload.伏笔.length}, 冲突=${payload.冲突.length}, 弧线=${payload.弧线.length}, 保留${meta.快照楼层.length}/${limit}份)`);
  return true;
}

/** 界面手动编辑用: 写回**原来那一楼的锚点**, 不改变进度(2026-11-11 修) */
export function saveData(data: 导演账本): boolean {
  try {
    const 最新 = useHost().chat.lastMessageId();
    const 原锚点 = Number(data.锚点楼层 ?? -1);
    /**
     * 手改账本只改**内容**, 不该改"这次编排算在哪一楼层"。
     *
     * 以前无条件写 `lastMessageId` —— 于是"只改了一个伏笔状态"也会把锚点挪到最新楼, 后果有两个:
     *   ① `取撤销楼层(锚点, 最新楼)` 会认为这一层推过 → 「重新推进」撤掉重来(而不是当普通推进);
     *   ② 删楼回退的粒度错位: 锚点越新, 能回退的楼层越少。
     * 所以: 原锚点还有效(≥0 且不超过最新楼)就写回原处; 只有从没推进过(-1)才用最新楼占位;
     * 原锚点那楼已经被删了 → 退回最新楼(否则 buildSnapshotPayload 拿不到楼层, 手改白丢)。
     */
    const 原锚点有效 = 原锚点 >= 0 && 原锚点 <= 最新;
    const 处理到 = typeof data.处理到楼层 === 'number' ? data.处理到楼层 : 0;
    const 写 = (锚: number) => writeStateSnapshot(data, 锚, 处理到, false);
    /** 那一楼还在不在（删楼回退后原锚点会指向一个不存在的楼层） */
    const 楼层还在 = (锚: number): boolean => {
      try {
        return !!useHost().chat.messages(锚)[0];
      } catch {
        return false;
      }
    };
    /**
     * 2026-11-13 批次H-3: 把「锚点无效 / 楼层被删」与「写入失败」分开。
     *
     * 旧写法 `if (原锚点有效 && 写(原锚点)) return true;` 在**写原锚点失败**时也会掉到
     * 「改写到最新楼」那条路 —— 那正是上面注释说要修掉的锚点漂移（删楼回退粒度错位、
     * `取撤销楼层` 误判为已推）。
     * 但**"那楼被删了"仍然必须退回最新楼**（否则 buildSnapshotPayload 拿不到楼层，手改白丢）——
     * 那是"锚点失效"，不是"写入失败"，所以用 `楼层还在()` 判，而不是用"写成功没成功"判。
     */
    if (原锚点有效 && 楼层还在(原锚点)) return 写(原锚点);
    return 最新 !== 原锚点 ? 写(最新) : false;
  } catch (error) {
    console.error('[剧情导演] 保存账本失败:', error);
    toastError(`剧情导演: 保存失败 ${error instanceof Error ? error.message : String(error)}`, '剧情导演');
    return false;
  }
}

export interface 存档结果 {
  落盘: boolean;
  锚点楼层: number;
  数据: 导演账本;
  说明: string;
}

/** 一轮引擎推进跑完后的落盘: 锚点 = 本次分析的最后一条楼层, 成功才消费清空层 */
export function 保存推进结果(data: 导演账本, 锚点楼层: number): 存档结果 {
  /**
   * 2026-11-13 批次H-2: 落盘失败要把内存改回去。
   *
   * `writeStateSnapshot` 的 payload 要读 `data.处理到楼层`，所以这两行**必须先设**；
   * 但以前落盘失败也不回滚 —— 于是 `处理到楼层` 已前进、`清空层` 已清 0，
   * 内存与磁盘分叉，下一轮会以为"这一层已经推过了"（删除/回退时尤其危险）。
   */
  const 旧处理到 = data.处理到楼层;
  const 旧清空层 = data.清空层;
  data.处理到楼层 = 锚点楼层;
  data.清空层 = 0;
  const 落盘 = writeStateSnapshot(data, 锚点楼层, 锚点楼层, true);
  if (!落盘) {
    data.处理到楼层 = 旧处理到;
    data.清空层 = 旧清空层;
  }
  return {
    落盘,
    锚点楼层: 落盘 ? 锚点楼层 : -1,
    数据: 落盘 ? { ...data, 锚点楼层 } : data,
    说明: 落盘 ? `账本已存进楼层 #${锚点楼层}` : `楼层 #${锚点楼层} 写不进去, 快照没落盘`,
  };
}

/** 撤销指定楼层的快照(面板「重新推进」用) */
export function discardSnapshotAt(floorId: number): boolean {
  const meta = loadMeta();
  if (!meta.快照楼层.includes(floorId)) return false;
  meta.快照楼层 = meta.快照楼层.filter(floor => floor !== floorId);
  // 2026-11-13 H-1: 同上 —— 撤销后 meta 写不回去 = 那一楼下次还会被当成"有效快照"
  if (!saveMeta(meta)) console.error('[剧情导演] 撤销快照后 meta 没写回去 —— 那一楼下次还会被当成有效快照');
  try {
    useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
  } catch {
    // 忽略
  }
  return true;
}

/** 清空全部账本数据: 物理删除所有楼层快照 + 重置元数据, 记录当前楼层为「清空层」 */
export function clearAllData(): number {
  const meta = loadMeta();
  for (const floorId of meta.快照楼层) {
    try {
      useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
    } catch {
      // 忽略
    }
  }
  const fresh = emptyMeta();
  try {
    fresh.清空层 = useHost().chat.lastMessageId();
  } catch {
    // 保持 0
  }
  // 2026-11-13 H-1: 清空后 meta 写不回去 = 旧登记残留，下次装载会去找已经不存在的楼层
  if (!saveMeta(fresh)) console.error('[剧情导演] 清空账本后 meta 没写回去 —— 旧楼层登记还留着');
  return fresh.清空层;
}