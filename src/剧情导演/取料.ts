// 剧情导演 · 取料: 本轮要发给导演引擎的东西(最近正文 / 玩家输入 / 世界书 / **记忆证据** / 提示词消息)只此一份。
// ---------------------------------------------------------------------------
// 与彼方 `收集本轮输入.ts` 同户型: 更新主流程只负责"编排", 取料的细节(读哪几层楼、
// 怎么按清空层过滤、拼几条回复、要不要读世界书、**这一轮要调哪些 AM**、怎么组消息)收在这里。
//
// 阶段 A 新增的两级记忆读取(设计文档 §4 / 每轮流水线 §3):
//   ① 完整读蓝灯索引(`TavernDB-ACU-CustomExport-纪要索引`)→ 目录给导演"发现新联系";
//   ② 按**账本登记的 AM**(到期伏笔 / 待核命运 / 上一幕任务 / 待读队列)直接调档绿灯纪要 ——
//      这一步**不依赖**那些 AM 是否仍出现在当前 250 条索引里, 这正是跨几十章回收长伏笔的关键。
// 零截断: 索引整篇、每条选中的纪要整篇, 一个字不砍。规模控制只发生在"选哪些条目"(选证.ts/记忆检索.选证)。
import type { Host } from './host';
import { getActiveWorldbookText } from './读书';
import { buildDirectorMessages } from './prompts';
import { createTextFilter } from '../共用/楼层标签过滤';
import type { Settings, 导演账本, 记忆审计 } from './schema';
import { 解析召回 } from './证据链';
import { 挑镜头外候选, 渲染镜头外块, type 镜头外候选 } from './镜头外';
import { 渲染书纲块, 需要生成书纲, type 书纲覆盖 } from './书纲';
import { 解析不知情, 渲染证据来源 } from './知情';

/** 取料的返回值: 主流程真正用得到的几样 */
export interface 本轮输入 {
  /** 最近 N 条 AI 回复(按楼层序, 最后一条最新) —— 锚点 = 最后一条的 message_id */
  recent: { message_id: number; message: string }[];
  /** 拼好的"最近正文"段落(已过标签过滤, 每条带【最新回复】/【较早回复 N】标注) */
  reply: string;
  /** 组好的导演引擎提示词消息 */
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** 本轮的记忆审计(实际读了哪些 AM / 完整条目数 / 请求规模 / 缺失与歧义) */
  记忆审计: 记忆审计;
  /** 本轮实际读取的引用(供 账本数据/待读队列 消费) */
  已读引用: string[];
  /** 本轮选证的依据(审计与日志) */
  选证理由: Record<string, string>;
  /** 本轮给导演的索引块与纪要块(渲染后原文; 审计用) */
  索引块: string;
  纪要块: string;
  /** 本轮真实解析出的索引项(纠偏: 用来校验导演的「候选证据」申请是否真在索引里) */
  索引项: { 记忆引用: string; 时间跨度: string; 概览: string }[];
  /** 阶段 D: 本轮挑中的镜头外推进候选(纠偏: 供写账流程实际校验与审计, 不只是渲染提示) */
  镜头外候选: 镜头外候选[];
  /** 第二轮方案 2.3: 主 AI 最近一次召回的 AM(记忆插件 qrf_plot 的 <recall>); 读不到 → 空集 */
  已召回: Set<string>;
  /** 反全知: 记忆插件 <cb> 的原文(每个角色不知道的事); 空 = 这一轮读不到 */
  信息边界: string;
}

/**
 * 读主 AI 最近一次的召回(第二轮方案 2.3): 最新一条**用户楼**上记忆插件存的 `qrf_plot`。
 * 字段属于记忆插件, 读不到/格式变了 → 空集(调用方退回"全部附原文"), 不抛。
 */
export function 读最近召回(host: Pick<Host, 'chat'>, 锚点楼层: number): Set<string> {
  return 解析召回(读最近召回原文(host, 锚点楼层));
}

/** 从锚点往前找最近一条带记忆插件召回的楼(就是生成这条回复时那条用户楼); 读不到 → '' */
export function 读最近召回原文(host: Pick<Host, 'chat'>, 锚点楼层: number): string {
  try {
    if (typeof host.chat.recallPlot !== 'function') return '';
    for (let id = 锚点楼层; id >= Math.max(0, 锚点楼层 - 4); id--) {
      const 原文 = host.chat.recallPlot(id);
      if (原文) return 原文;
    }
  } catch {
    // 忽略: 召回读不到不影响正确性(只是少了激活词和信息边界)
  }
  return '';
}

/**
 * 记忆插件 `<cb>` 段: 每个角色**不知道**的事(信息边界)。主 AI 生成时读得到, 导演原先读不到。
 * 它正好是「读者领先」与"知情角色"的原料。只取正文, 去掉插件自己的标题行。
 */
export function 解析信息边界(原文: string): string {
  const 段 = String(原文 ?? '').match(/<cb>([\s\S]*?)<\/cb>/i)?.[1] ?? '';
  return 段
    .split('\n')
    .map(行 => 行.trim())
    .filter(行 => 行 && !/^角色能力与信息边界[:：]?$/.test(行))
    .join('\n');
}

/** 漏读补齐的上限: 上次处理到的楼层之后最多补读这么多条回复(防推进停了很久后一次塞爆) */
export const 补读上限 = 8;

export type 取料结果 = { 成功: true; 输入: 本轮输入 } | { 成功: false; 原因: '没有可分析的AI回复' };

/** 只取末尾一小段楼层(足够找到最近 N 条 AI 回复), 避免每次推进都拉全量楼层 */
function 取最近AI回复(host: Pick<Host, 'chat'>, count: number): { message_id: number; message: string }[] {
  try {
    const lastId = host.chat.lastMessageId();
    const start = Math.max(0, lastId - count * 10);
    const messages = host.chat.messages(`${start}-${lastId}`, { role: 'assistant' });
    return messages
      .filter(message => !message.is_hidden)
      .slice(-count)
      .map(message => ({ message_id: message.message_id, message: String(message.message ?? '') }));
  } catch {
    return [];
  }
}

/**
 * 最新一条 AI 回复的楼层(没有则 -1)。
 *
 * 面板「重新推进」用它判断**当前这一层到底推过没有** —— 锚点停在最新楼 = 这一层推过了(该撤了重推);
 * 锚点更早 = 这几层压根没推过(撤了只会白白抹掉上一轮的账, 还让轮数原地打转)。
 */
export function 最新AI回复楼层(host: Pick<Host, 'chat'>): number {
  return 取最近AI回复(host, 1)[0]?.message_id ?? -1;
}

/** 取最近一条**用户输入**作为本轮情境(与回复同口径过滤; 清空层之前的不取) */
function 取最近用户输入(host: Pick<Host, 'chat'>, replyMessageId: number, filter: (text: string) => string, replyIds: Set<number>, minId: number): string {
  try {
    const lastId = host.chat.lastMessageId();
    const start = Math.max(0, Math.min(replyMessageId, lastId) - 4);
    const messages = host
      .chat.messages(`${start}-${lastId}`)
      .filter(message => message.role === 'user' && !message.is_hidden && message.message_id > minId && !replyIds.has(message.message_id))
      .slice(-1);
    return messages.map(message => filter(message.message ?? '')).join('\n\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 2026-11-12 P5 拆分后的过渡层：**再导出**（一个符号都不许删）
//
// 14 个测试文件 + 注入/update 都 import 这个文件；改名会让 71 处引用一起动 ——
// 那是"拆"变成"重写"。所以搬走的符号在这里原样出借，P6 再决定要不要删这层。
// ---------------------------------------------------------------------------
export * from './提醒';
export * from './选证入口';
export * from './记忆读取';
import { 结构提醒 } from './提醒';
import { 读取记忆 } from './记忆读取';

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 采集本轮输入。
 *
 * @param 账本 当前账本(读清空层/死亡抉择/记忆义务)
 * @param 设置 当前设置(读最近回复数 / 世界书开关 / 破限等)
 * @param force 手动推进: **不受清空层约束**(清空前的楼层也读), 用于"我刚清空但想重推"
 */
export async function 采集本轮输入(
  host: Pick<Host, 'chat' | 'persona' | 'worldbook'>,
  账本: 导演账本,
  设置: Settings,
  force: boolean,
  /** 用户对书纲的覆盖(聊天变量; 由调用方读好传进来, 取料不碰存储) */
  书纲覆盖?: 书纲覆盖 | null,
): Promise<取料结果> {
  let playerName: string | null = null;
  let playerDesc = '';
  try {
    playerName = host.persona.name();
    playerDesc = host.persona.description().trim();
  } catch {
    playerName = null;
    playerDesc = '';
  }

  const 设定条数 = Math.max(1, 设置.导演.读取最近回复数 ?? 3);
  const clearLayer = 账本.清空层 ?? 0;
  // 漏读补齐(2026-11-01): 推进失败/熔断/推进中又来新消息时, 上次处理到的楼层之后可能已经有好几条回复。
  // 只读最近 N 条的话, 中间那几条导演永远看不到 —— 所以多读到"上次之后的全部", 但不超过 补读上限。
  const 处理到 = Number(账本.处理到楼层) || 0;
  let recent = 取最近AI回复(host, Math.max(设定条数, 补读上限));
  if (!force) recent = recent.filter(message => message.message_id > clearLayer);
  const 未读 = 处理到 > 0 ? recent.filter(message => message.message_id > 处理到).length : 0;
  recent = recent.slice(-Math.max(设定条数, Math.min(未读, 补读上限)));
  /**
   * 跳读计数(2026-11-11): 补读上限只管"多读几条", 超过它的那些楼层**再也没人读**,
   * 而 处理到楼层 照样跳到最新层 —— 它们从此被当成"已处理"。以前这件事是静默的
   * (注释还写着"读到上次之后的全部", 实现却是"只读最后 N 条")。
   * 现在把缺口摆给导演看: 它至少知道"中间有一段我没读过", 而不是凭账本脑补成"什么都没发生"。
   */
  const 跳读 = Math.max(0, 未读 - recent.length);
  if (跳读 > 0) {
    console.warn(
      `[剧情导演] 上次处理之后还有 ${跳读} 条更早的回复没读(补读上限 ${补读上限}), 本轮只读最近 ${recent.length} 条; 已把缺口写进导演输入`,
    );
  }
  if (recent.length === 0) return { 成功: false, 原因: '没有可分析的AI回复' };

  const filter = createTextFilter(设置.标签);
  // 标注每条回复的顺序，最后一条为【最新回复】，让 AI 明确当前场景以最新一条为准
  const reply = recent
    .map((message, index) => `【${index === recent.length - 1 ? '最新回复' : `较早回复 ${index + 1}`}】\n${filter(message.message)}`)
    .join('\n\n');
  const replyIds = new Set(recent.map(message => message.message_id));
  const 原用户输入 = 取最近用户输入(host, recent[recent.length - 1].message_id, filter, replyIds, force ? 0 : clearLayer);
  const anchorFloor = recent[recent.length - 1].message_id;
  // 记忆插件的召回: 生成时它把召回的 AM 编码追加进用户输入, 主 AI 因此激活那些纪要条目。
  // 两种存法都要认: ① 用户楼正文里就带着 <recall>/<cb>(常见); ② 正文只有用户原话, 召回存在楼上的 qrf_plot 里。
  // 扫描文本里编码出现两遍也不会让条目激活两次(世界书按"命中没有"判, 每条最多出一次)。
  const 召回原文 = 读最近召回原文(host, anchorFloor);
  const 召回 = new Set([...解析召回(召回原文), ...解析召回(原用户输入)]);
  // 信息边界只给导演一份: 用户输入里已经带着 <cb> 时, 从用户输入里剥掉, 只保留下面那块带用法说明的
  const 信息边界 = 解析信息边界(召回原文) || 解析信息边界(原用户输入);
  const context = 信息边界 ? 原用户输入.replace(/<cb>[\s\S]*?<\/cb>/gi, '').trim() : 原用户输入;
  // 反全知: 把 <cb> 变成"谁不知道什么"的名册 —— 既有用的地方(镜头外块、必演闸门)共用这一份
  const 不知情表 = 解析不知情(信息边界);
  const worldbook = 设置.导演.读取世界书
    ? await getActiveWorldbookText([原用户输入, reply, [...召回].join(' ')].filter(Boolean).join('\n\n'), {
        excludeNames: 设置.导演.世界书排除 ?? [],
        includeGlobal: 设置.导演.读取全局世界书,
      })
    : '';
  // 阶段 A: 两级记忆读取(索引整篇 + 按 AM 直读绿灯纪要)
  const 记忆 = await 读取记忆(host, 账本, 设置, anchorFloor);
  // 阶段 D: 镜头外推进(低频, 只挑少数关键 NPC; 复用**同一次**导演调用, 不额外发请求)
  // 纠偏: ① 用**幕计数**(已分析轮数)而不是章号/楼层; ② 把"在场"传进去 ——
  //   当前视角人物一定在场, 不能再给他排一份"镜头外"推进(那样同一个人会同时出现在两处)。
  const 在场 = [账本.当前视角, 账本.续演视角].map(x => String(x ?? '').trim()).filter(Boolean);
  const 镜头外候选 = 挑镜头外候选({ 账本, 当前幕: Number(账本.已分析轮数) || 0, 在场 });

  const messages = buildDirectorMessages({
    账本,
    reply,
    replyCount: recent.length,
    // 补读窗口之外的缺口(见上面的 跳读): 让导演知道"中间有一段我没读过"
    跳读条数: 跳读,
    context,
    worldbook,
    playerName,
    playerDesc,
    偏离度: 设置.导演.偏离度,
    死亡抉择: 账本.死亡抉择,
    破限: 设置.导演.破限,
    头部填充: 设置.导演.头部填充,
    头部填充文本: 设置.导演.头部填充文本 ?? '',
    防截断: 设置.导演.防截断,
    预填充: 设置.导演.预填充,
    // 平静期(2026-11-08): 这些"该推进了/该收线了"的提醒一条都不给 —— 那正是它要摆脱的东西。
    // 记账用的账本本身照常传, 所以伏笔状态、章回、命运都还是准的。
    // 2026-11-13 D-2: 传 **+1 之后**的场号（与 `update.ts` → `构造本幕指令` → `引擎规则` 同口径）。
    // 以前传 `已分析轮数`，引擎侧用 +1，同一轮两个「收束已用」差 1 → 收束预算那句永远不响。
    // 2026-11-13 批 C: 阈值三层贯通。保持单行形状 —— 老用例有源码级断言盯着
    // 「结构提醒: 设置.导演.平静模式 ? [] : 结构提醒(」这个前缀（daoyan-calm:163）。
    结构提醒: 设置.导演.平静模式 ? [] : 结构提醒(账本, (Number(账本.已分析轮数) || 0) + 1, { 高: 设置.导演.连续高阈值, 低: 设置.导演.连续低阈值 }),
    平静: !!设置.导演.平静模式,
    // 记忆证据块(零截断): 索引给"发现新联系", 详细纪要给"履行旧义务"
    记忆索引: 记忆.索引块,
    记忆纪要: 记忆.纪要块,
    档位: 设置.导演.强度档位,
    // 类型承诺(2026-11-12): 「不限」→ build类型块 返回空串, 一个字节都不注入
    类型: 设置.导演.类型,
    书纲块: 渲染书纲块({
      书纲: 账本.书纲 ?? null,
      伏笔: [...(账本.伏笔 ?? []), ...(账本.历史档案?.伏笔 ?? [])],
      需要生成: 需要生成书纲(
        账本.书纲 ?? null,
        书纲覆盖,
        Number(账本.已分析轮数) || 0,
        设置.导演.接管轮数,
        账本.章回?.进度 === '收束' || !!账本.收官请求 || !!账本.已剧终,
      ),
      请求重写: !!书纲覆盖?.请求重写,
      否决: 书纲覆盖?.否决 ?? {},
      有既有剧情: (账本.伏笔 ?? []).length + (账本.角色命运 ?? []).length + (账本.冲突 ?? []).length > 0,
    }),
    镜头外: 渲染镜头外块(镜头外候选, 不知情表),
    证据来源: 渲染证据来源(账本, 召回),
    信息边界,
  });

  return {
    成功: true,
    输入: {
      recent,
      reply,
      messages,
      记忆审计: 记忆.审计,
      已读引用: 记忆.已读引用,
      选证理由: 记忆.选证理由,
      索引块: 记忆.索引块,
      纪要块: 记忆.纪要块,
      索引项: 记忆.索引项,
      镜头外候选,
      已召回: 召回,
      信息边界,
    },
  };
}
