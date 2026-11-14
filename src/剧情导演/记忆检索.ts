// 剧情导演 · 记忆检索(阶段 A 核心): 记忆插件的**两级**结构记忆读取。
// ---------------------------------------------------------------------------
// 记忆插件(ACU / TavernDB 导出)有两级内容记忆, 本模块只**读**世界书, 不改索引、不接管向量召回:
//
//   ① 蓝灯目录(当前可见, 最多 250 条, 动态变化)
//       条目名 `TavernDB-ACU-CustomExport-纪要索引`, strategy.type = 'constant'(蓝灯常驻)
//       内容: <已发生的事件概览> + 表格 `| 时间跨度 | 概览 | 编码索引 |`
//   ② 绿灯档案(按编码直接读取, **不需要**先被关键词激活)
//       条目名 `TavernDB-ACU-CustomExport-纪要-N`, strategy.type = 'selective'
//       strategy.keys 里含 `AM0001`(这才是事件引用), 内容: <记忆回溯> + `# 纪要表`
//
// 两条铁律(设计文档 §4):
//   - **索引用于发现新联系, 账本 AM 用于履行旧义务**。已登记的 AM 即使当前 250 条索引里
//     已经不出现, 也必须能按关键词直接调档 —— 这是跨几十章回收长伏笔的关键。
//   - **零截断**。索引全文给导演, 每条被选中的纪要**整篇**给导演。本文件里**不许**出现
//     `.slice(...)`、省略号、最大字数、摘要替代原文。规模控制只能发生在"选哪些完整条目"。
//
// 平台访问全部经 host 接缝(worldbook.entries 拿**全部**条目, 不是只有被激活的那些),
// 所以本模块可脱离酒馆单测: 喂一份假条目数组即可。
import type { Host } from './host';

// ---------------------------------------------------------------------------
// 契约常量: 记忆插件的条目名与关键词格式
// ---------------------------------------------------------------------------

/** 蓝灯索引条目名(精确匹配; 也接受"标题里含它"的近似写法, 见 是索引条目) */
export const 索引条目名 = 'TavernDB-ACU-CustomExport-纪要索引';
/** 绿灯详细纪要的条目标题前缀(标题形如 `TavernDB-ACU-CustomExport-纪要-1`) */
export const 纪要标题前缀 = 'TavernDB-ACU-CustomExport-纪要-';
/**
 * **包裹条目**(真机 2026-10-27 核对): 标签与表头是**独立条目**, 不是每条纪要自带的。
 *   `TavernDB-ACU-CustomExport-纪要-包裹-上` = `<记忆回溯>` + `# 纪要表` + 表格列头
 *   `TavernDB-ACU-CustomExport-纪要-包裹-下` = `</记忆回溯>`
 * 每条纪要只存**一行数据**(不带表头也不带标签)。所以:
 *   - 包裹条目**不是**纪要条目(它们没有 AM), 不能被当成任何引用的证据;
 *   - 但它们携带**列头**, 渲染时必须补在每条正文前面 —— 否则导演看到的是一行裸数据, 不知道哪一列是 AM。
 */
export const 包裹条目后缀 = '-包裹-上';
export const 包裹下条目后缀 = '-包裹-下';
/** AM 编码的合法形态: AM + 4 位以上数字(真实数据里见过 AM0384 这类) */
export const AM正则 = /AM\d{4,}/g;

// ---------------------------------------------------------------------------
// 数据结构(设计文档 §4 的接口, 名字保持中文以与项目一致)
// ---------------------------------------------------------------------------

/** 索引表的一行: 当前目录里的一条事件概览 */
export interface 索引项 {
  /** 如 AM0001 —— 这是事件引用, 标题数字只作辅助 */
  记忆引用: string;
  时间跨度: string;
  概览: string;
}

/** 一条完整详细纪要(正文 = 条目 content 原文, 零截断) */
export interface 详细纪要 {
  记忆引用: string;
  /** 条目所在世界书 */
  书名: string;
  /** 条目标题(如 TavernDB-ACU-CustomExport-纪要-1); 只用于辅助定位与诊断 */
  条目名: string;
  /** 该条目 strategy.keys 里命中的 AM 编码(可能多个) */
  关键词: string[];
  /** **完整**表格正文, 一个字不砍 */
  正文: string;
  /**
   * 表格列头(来自独立的「包裹-上」条目)。
   * 真机结构里每条纪要只有一行数据、**不带表头** —— 没有列头的话导演看到的是一行裸数据,
   * 根本认不出哪一列是编码索引。渲染时补在正文前面(原文照抄, 不改字)。
   */
  列头?: string;
}

/** 缺失诊断: 明确说"哪个引用没找到、为什么", 绝不拿相近纪要冒充 */
export interface 缺失引用 {
  引用: string;
  原因: string;
}

export interface 按引用读取结果 {
  已找到: 详细纪要[];
  缺失: 缺失引用[];
  /** 同一次读取里被重复请求的引用(显式报告, 不静默去重成"读到了") */
  重复: string[];
}

/** 记忆检索器: 宿主世界书 adapter 之后的一层, 隐藏索引解析/关键词定位/缺失诊断 */
export interface 记忆检索器 {
  读当前索引(): Promise<{ 索引: 索引项[]; 诊断: 检索诊断 }>;
  按引用读取(引用们: string[]): Promise<按引用读取结果 & { 诊断: 检索诊断 }>;
}

/** 一次检索的可观察诊断(写入审计信息, 也用于面板/日志) */
export interface 检索诊断 {
  /** 参与了扫描的世界书名 */
  扫描书: string[];
  /** 索引条目实际找到了几本(多本同名时全部列出, 取第一本非空) */
  索引来源: string[];
  /** 索引条目原文长度(零截断: 原文完整读入) */
  索引原文长度: number;
  /** 解析出多少条索引项 */
  索引条数: number;
  /** 世界书里一共有多少条目被看过 */
  看过条目数: number;
  /** 关键词命中但同一 AM 出现在多条里(歧义) */
  歧义引用: string[];
  /** 标题像纪要但没有 AM 关键词的条目(诊断用, 不当证据) */
  无关键词条目: string[];
  /** 读取失败的书名与原因 */
  读取失败: { 书名: string; 原因: string }[];
}

function 空诊断(): 检索诊断 {
  return {
    扫描书: [],
    索引来源: [],
    索引原文长度: 0,
    索引条数: 0,
    看过条目数: 0,
    歧义引用: [],
    无关键词条目: [],
    读取失败: [],
  };
}

// ---------------------------------------------------------------------------
// 文本与条目识别的小工具
// ---------------------------------------------------------------------------

/** 取条目的显示名: name 优先, 退回 comment(记忆插件两种都可能用) */
function 条目显示名(entry: any): string {
  const name = String(entry?.name ?? '').trim();
  if (name) return name;
  return String(entry?.comment ?? '').trim();
}

/**
 * 从包裹条目里取**表格列头**(真机结构: 包裹-上 里带 `| 时间跨度 | 地点 | ... |` 与分隔行)。
 * 取第一条以 `|` 开头且含列名的行 + 紧随的分隔行, 原样返回; 找不到给空串。
 * 这是"每条纪要只有一行裸数据"时导演能读懂它的**唯一**线索, 所以必须补。
 */
export function 取包裹列头(包裹正文: string): string {
  const lines = String(包裹正文 ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const 行 = lines[i].trim();
    if (!行.startsWith('|')) continue;
    // 列头行: 至少要有一个"看起来是列名"的单元格(含 时间跨度/地点/纪要/编码索引 之一)
    if (!/(时间跨度|地点|纪要|重要对白|编码索引|与今天的关系|涉及角色)/.test(行)) continue;
    const 下一行 = (lines[i + 1] ?? '').trim();
    return 是分隔行(下一行) ? `${行}\n${下一行}` : 行;
  }
  return '';
}

/** 条目所有可能的"名字"来源(name / comment), 用于识别标题 */
function 条目名们(entry: any): string[] {
  const out: string[] = [];
  for (const raw of [entry?.name, entry?.comment]) {
    const text = String(raw ?? '').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** 是不是蓝灯索引条目: 名字**精确**等于契约名, 或名字里含契约名(兼容带前后缀的导出写法) */
export function 是索引条目(entry: any): boolean {
  return 条目名们(entry).some(name => name === 索引条目名 || name.includes(索引条目名));
}

/** 是不是包裹条目(上/下): 它们带标签与列头, 但**没有 AM**, 不是纪要本身 */
export function 是包裹条目(entry: any): boolean {
  return 条目名们(entry).some(name => name.endsWith(包裹条目后缀) || name.endsWith(包裹下条目后缀));
}

/**
 * 是不是绿灯详细纪要条目: 标题以契约前缀开头, **且不是包裹条目**。
 *
 * 真机教训: 包裹条目 `纪要-包裹-上` 也以 `纪要-` 开头, 最初被一起认成纪要条目 ——
 * 它没有 AM, 于是每条日志都会多一条"标题像纪要但没有 AM 关键词"的假诊断。这里显式排除。
 */
export function 是纪要条目(entry: any): boolean {
  if (是包裹条目(entry)) return false;
  return 条目名们(entry).some(name => name.startsWith(纪要标题前缀));
}

/**
 * 从条目里取 AM 关键词。**AM 才是事件引用**, 所以:
 *   - 只认 `strategy.keys`(绿灯关键词)里的 AM —— 那是记忆插件真正用来触发条目的位置;
 *   - 标题/正文里的 AM 只作诊断参考, **不用来建立引用关系**(避免"标题数字猜事件")。
 * 返回去重后的 AM 列表(保持出现顺序)。
 */
export function 取条目AM关键词(entry: any): string[] {
  const keys = Array.isArray(entry?.strategy?.keys) ? entry.strategy.keys : [];
  const out: string[] = [];
  for (const key of keys) {
    // 关键词可能是字符串或正则(WorldbookEntry 的类型允许 RegExp); 正则取不到字面 AM, 跳过
    if (typeof key !== 'string') continue;
    for (const hit of key.match(AM正则) ?? []) {
      if (!out.includes(hit)) out.push(hit);
    }
  }
  return out;
}

/** 归一化一个 AM 引用: 去空白、统一大写(AM0001 与 am0001 视为同一引用) */
/**
 * AM 编码的**唯一**规范化入口(2026-10-28 审查).
 *
 * 事故形态: 世界书条目的关键词是 `AM1`, 代码调档时按 `AM0001` 拼; 读到的是同一条纪要,
 * 但账本里存 `AM1`、检索表里键是 `AM0001` → 下一轮查不到 → 产生"假缺失", 已核集合也比不上。
 * 所以**所有**进入账本 / 队列 / 检索表 / 盖章集合的地方都必须走这里:
 * `AM` 前缀大写 + 数字段补足到至少 4 位(超过 4 位保持原样, 不做截断)。
 * 不是 `AM\d+` 形态的引用原样大写返回(交给诊断, 不猜)。
 */
export function 归一引用(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// 表格解析: 蓝灯索引
// ---------------------------------------------------------------------------

/**
 * 把一行 markdown 表格拆成单元格。
 * 处理: 首尾的 `|` 去掉; `\|` 是转义的字面竖线; 单元格两端空白裁掉(表格排版用的, 不是内容截断)。
 */
export function 拆表格行(line: string): string[] {
  let text = String(line ?? '').trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

/** 分隔行: `|:---:|---|` 这类只有横线与冒号的行, 解析时跳过 */
function 是分隔行(line: string): boolean {
  const 文本 = String(line ?? '').trim();
  if (!文本.includes('-')) return false;
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(文本);
}

/** 表头 → 列下标(按名字找, 不假定列顺序) */
function 找列(表头: string[], 候选名: string[]): number {
  for (let i = 0; i < 表头.length; i++) {
    const 列名 = 表头[i].replace(/\s+/g, '');
    if (候选名.some(名 => 列名 === 名 || 列名.includes(名))) return i;
  }
  return -1;
}

/**
 * 解析蓝灯索引正文 → 索引项[]。
 *
 * 契约格式是 `| 时间跨度 | 概览 | 编码索引 |`, 但真实导出可能有 row_id 列、列名带空格、
 * 甚至列顺序不同 —— 所以**按表头名字定位列**, 不假定固定下标。
 * 找不到 AM 的行整行跳过(它是排版/空行, 不是事件), 但**不丢内容**: 索引原文照样整篇交给导演。
 */
export function 解析索引表格(正文: string): 索引项[] {
  const lines = String(正文 ?? '').split(/\r?\n/);
  const out: 索引项[] = [];
  let 列: { 时间: number; 概览: number; 编码: number } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) continue;
    if (是分隔行(trimmed)) continue;
    const cells = 拆表格行(trimmed);
    if (cells.length < 2) continue;
    if (!列) {
      // 第一行含 `编码索引`(或 AM)且含 `概览` → 认作表头
      const 编码列 = 找列(cells, ['编码索引', '编码', 'AM']);
      const 概览列 = 找列(cells, ['概览', '摘要', '简介']);
      if (编码列 >= 0 && 概览列 >= 0) {
        列 = { 编码: 编码列, 概览: 概览列, 时间: 找列(cells, ['时间跨度', '时间']) };
        continue;
      }
      // 没有可识别表头: 退化成"含 AM 的那一列 + 前一列"的启发式, 仍然只认 AM 行
    }
    const 编码单元格 = 列 ? (cells[列.编码] ?? '') : cells.find(cell => /AM\d{4,}/.test(cell)) ?? '';
    const 匹配 = 编码单元格.match(AM正则);
    if (!匹配 || 匹配.length === 0) continue;
    const 时间 = 列 && 列.时间 >= 0 ? (cells[列.时间] ?? '') : '';
    const 概览 = 列 ? (cells[列.概览] ?? '') : (cells.filter(cell => cell && !/AM\d{4,}/.test(cell)).join(' | '));
    // 一行可能带多个 AM(合并行): 每个 AM 各成一项, 概览共用 —— 不合并成一条, 否则会丢引用
    for (const ref of 匹配) {
      out.push({ 记忆引用: ref.toUpperCase(), 时间跨度: 时间, 概览 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 候选世界书: 哪些书可能有记忆插件条目
// ---------------------------------------------------------------------------

/**
 * 候选世界书: 角色卡主书 + 附加书 + 聊天书 + (可选)全局书。
 * 记忆插件通常把索引与纪要放在角色卡主书里, 但导出/改名后可能落到附加书或聊天书,
 * 所以**全都扫一遍**再按条目名筛 —— 只多读几个数组, 不触发向量召回。
 */
export function 候选世界书(host: Pick<Host, 'worldbook'>, includeGlobal: boolean): string[] {
  const names: string[] = [];
  const push = (name: string | null | undefined) => {
    const 文本 = String(name ?? '').trim();
    if (文本 && !names.includes(文本)) names.push(文本);
  };
  try {
    const 绑定 = host.worldbook.boundNames();
    push(绑定?.primary);
    for (const name of 绑定?.additional ?? []) push(name);
  } catch {
    // 未打开角色卡: 忽略
  }
  try {
    push(host.worldbook.chatName());
  } catch {
    // 忽略
  }
  if (includeGlobal) {
    try {
      for (const name of host.worldbook.globalNames()) push(name);
    } catch {
      // 忽略
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// 检索器实现
// ---------------------------------------------------------------------------

export interface 检索选项 {
  /** 是否把全局世界书也算进候选(设置「包含全局世界书」) */
  includeGlobal?: boolean;
  /** 由调用方显式指定候选书(用例与真机排查用; 不传则走 候选世界书) */
  books?: string[];
}


/**
 * 一次"把候选书的全部条目读进来"的快照。
 * 每轮只读一次: 索引解析与按 AM 调档共用这份快照, 避免同轮把世界书读两遍。
 */
interface 条目快照 {
  条目: { 书名: string; entry: any }[];
  诊断: 检索诊断;
}

async function 读全部条目(host: Pick<Host, 'worldbook'>, 选项: 检索选项): Promise<条目快照> {
  const 诊断 = 空诊断();
  const books = 选项.books && 选项.books.length > 0 ? [...选项.books] : 候选世界书(host, !!选项.includeGlobal);
  诊断.扫描书 = [...books];
  const 条目: { 书名: string; entry: any }[] = [];
  for (const 书名 of books) {
    let list: any[];
    try {
      list = (await host.worldbook.entries(书名)) ?? [];
    } catch (error) {
      诊断.读取失败.push({ 书名, 原因: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const entry of list) {
      if (!entry || entry.disable === true) continue;
      条目.push({ 书名, entry });
    }
  }
  诊断.看过条目数 = 条目.length;
  return { 条目, 诊断 };
}

/**
 * 建立"AM → 详细纪要"的索引。**只在 memory 里建**, 不落盘、不改世界书。
 * 同一 AM 命中多条 → 记进 歧义引用(读取时显式报歧义, 不静默挑一条冒充)。
 */
function 建引用表(快照: 条目快照): { 表: Map<string, 详细纪要[]>; 诊断: 检索诊断 } {
  const 表 = new Map<string, 详细纪要[]>();
  // 先扫一遍包裹条目取列头(真机: 每条纪要只有一行数据, 表头在独立条目里)
  let 列头 = '';
  for (const { entry } of 快照.条目) {
    if (!是包裹条目(entry)) continue;
    const 找到 = 取包裹列头(String(entry?.content ?? ''));
    if (找到) {
      列头 = 找到;
      break;
    }
  }
  for (const { 书名, entry } of 快照.条目) {
    if (!是纪要条目(entry)) continue;
    const 关键词 = 取条目AM关键词(entry);
    const 条目名 = 条目显示名(entry);
    if (关键词.length === 0) {
      // 标题像纪要却没有 AM 关键词: 记诊断。**不**把它当任何引用的证据(禁止凭标题猜编码)
      if (!快照.诊断.无关键词条目.includes(条目名)) 快照.诊断.无关键词条目.push(条目名);
      continue;
    }
    for (const 原始 of 关键词) {
      // 检索表的键也必须走同一个归一(否则条目写 AM1、账本存 AM0001 时永远查不到)
      const ref = 归一引用(原始);
      if (!ref) continue;
      const 纪要: 详细纪要 = {
        记忆引用: ref,
        书名,
        条目名,
        关键词: [...关键词],
        正文: String(entry?.content ?? ''),
        ...(列头 ? { 列头 } : {}),
      };
      const 已有 = 表.get(ref);
      if (已有) 已有.push(纪要);
      else 表.set(ref, [纪要]);
    }
  }
  for (const [ref, list] of 表) {
    if (list.length > 1) 快照.诊断.歧义引用.push(ref);
  }
  return { 表, 诊断: 快照.诊断 };
}

/** 建一个检索器: 每轮先 读当前索引, 再用 按引用读取 调档(两者共用同一份条目快照) */
export function 建记忆检索器(host: Pick<Host, 'worldbook'>, 选项: 检索选项 = {}): 记忆检索器 {
  // 惰性快照: 同一次检索器生命周期内只读一遍世界书
  let 缓存: { 快照: 条目快照; 表: Map<string, 详细纪要[]> } | null = null;
  async function 取缓存() {
    if (!缓存) {
      const 快照 = await 读全部条目(host, 选项);
      const { 表 } = 建引用表(快照);
      缓存 = { 快照, 表 };
    }
    return 缓存;
  }

  return {
    async 读当前索引() {
      const { 快照 } = await 取缓存();
      const 诊断 = { ...快照.诊断, 歧义引用: [...快照.诊断.歧义引用], 无关键词条目: [...快照.诊断.无关键词条目] };
      // 索引可能有多本(例如主书与聊天书各有一份): 取**第一本非空**的那份, 全部来源都记进诊断
      let 索引: 索引项[] = [];
      let 原文长度 = 0;
      for (const { 书名, entry } of 快照.条目) {
        if (!是索引条目(entry)) continue;
        if (!诊断.索引来源.includes(书名)) 诊断.索引来源.push(书名);
        const 正文 = String(entry?.content ?? '');
        if (原文长度 === 0 && 正文.length > 0) 原文长度 = 正文.length;
        if (索引.length === 0) {
          const 解析 = 解析索引表格(正文);
          if (解析.length > 0) 索引 = 解析;
        }
      }
      诊断.索引原文长度 = 原文长度;
      诊断.索引条数 = 索引.length;
      return { 索引, 诊断 };
    },

    async 按引用读取(引用们: string[]) {
      const { 快照, 表 } = await 取缓存();
      const 诊断 = { ...快照.诊断, 歧义引用: [...快照.诊断.歧义引用], 无关键词条目: [...快照.诊断.无关键词条目] };
      const 已找到: 详细纪要[] = [];
      const 缺失: 缺失引用[] = [];
      const 重复: string[] = [];
      const 已请求 = new Set<string>();
      for (const raw of 引用们) {
        const ref = 归一引用(raw);
        if (!ref) continue;
        if (已请求.has(ref)) {
          // 显式记重复: 不静默去重(否则"申请 100 条、读到 60 条"会被悄悄吞掉)
          if (!重复.includes(ref)) 重复.push(ref);
          continue;
        }
        已请求.add(ref);
        const list = 表.get(ref);
        if (!list || list.length === 0) {
          // 缺失时**如实报告**, 绝不拿相近纪要冒充(设计文档 §4 定位与失败纪律)
          缺失.push({ 引用: ref, 原因: `世界书里没有任何条目的关键词包含 ${ref}` });
          continue;
        }
        if (list.length > 1) {
          // 歧义: 报出来, 但仍然把**每一条命中的完整正文**都给导演 —— 让他自己判断,
          // 代码不替他挑一条(挑了就等于"用相似纪要冒充缺失证据")。
          诊断.歧义引用 = [...new Set([...诊断.歧义引用, ref])];
          for (const 纪要 of list) 已找到.push(纪要);
          continue;
        }
        已找到.push(list[0]);
      }
      return { 已找到, 缺失, 重复, 诊断 };
    },
  };
}

// ---------------------------------------------------------------------------
// 渲染: 给导演引擎的"证据块"(零截断)
// ---------------------------------------------------------------------------

/**
 * 把索引渲染成给导演的一段文本。**完整**给 —— 索引原文不重排、不摘要、不省略。
 * 这里只加一行表头说明, 方便模型知道这是"当前可见目录"而不是全部历史。
 */
export function 渲染索引块(索引: 索引项[], 诊断: 检索诊断, 原文 = ''): string {
  if (索引.length === 0) {
    return `【当前记忆索引】记忆插件此刻没有提供可解析的索引条目(扫描书: ${诊断.扫描书.join('、') || '无'})。`;
  }
  const lines: string[] = [
    `【当前记忆索引】(记忆插件按当前剧情动态选出的最多 250 条事件概览; 共 ${索引.length} 条, 来自「${诊断.索引来源.join('、') || '?'}」)`,
    '用途: 从中**发现**与本章相关的新联系; 已登记在账本里的 AM 即使不在这张表里, 代码也会另行直接调档。',
  ];
  // 零截断(2026-10-28 审查): 有原文就给**原文**, 不再把索引重排成三列(那会丢掉额外列/表外说明)。
  const 有原文 = String(原文 ?? '').trim().length > 0;
  if (有原文) {
    lines.push('(以下为记忆插件生成的索引原文, 未做任何裁剪或重排)');
    lines.push(String(原文));
    return lines.join('\n');
  }
  lines.push('| 时间跨度 | 概览 | 编码索引 |');
  lines.push('| --- | --- | --- |');
  for (const 项 of 索引) {
    // 概览/时间跨度是**内容**: 原样输出, 不裁字
    lines.push(`| ${项.时间跨度} | ${项.概览} | ${项.记忆引用} |`);
  }
  return lines.join('\n');
}

/**
 * 把被选中的详细纪要渲染成给导演的证据块。**每一条都整篇正文**, 一条不少、一字不砍。
 * 缺失/歧义/重复显式写在块尾 —— 让导演知道"哪些旧证据真的没读到", 而不是以为读全了。
 */
export function 渲染纪要块(结果: 按引用读取结果, 诊断: 检索诊断): string {
  const lines: string[] = [];
  if (结果.已找到.length === 0 && 结果.缺失.length === 0) return '';
  lines.push(`【已调档的详细纪要】(共 ${结果.已找到.length} 条完整纪要; 按 AM 关键词直接读取, 不依赖当前索引是否可见)`);
  for (const 纪要 of 结果.已找到) {
    lines.push('');
    lines.push(`—— ${纪要.记忆引用} · 「${纪要.书名}」/「${纪要.条目名}」 ——`);
    // 真机结构: 正文只有一行数据, 表头在独立的「包裹-上」条目里 —— 必须补上, 否则这行数据没法读。
    // 列头里**已经含分隔行**(取包裹列头 会把列头+分隔行一起取回), 所以这里不再自己补一行,
    // 免得列数与真实表格对不上(markdown 会渲染成错位的表)。
    if (纪要.列头) lines.push(纪要.列头);
    lines.push(纪要.正文);
  }
  if (结果.缺失.length > 0) {
    lines.push('');
    lines.push('【证据缺失 · 显式报告】以下引用在世界书里找不到对应条目。**不得凭印象补写这些事件**; 依赖它们的关键回收应降级为「证据待核」, 先安排发酵/逼近, 不要冒充已兑现:');
    for (const 缺 of 结果.缺失) lines.push(`- ${缺.引用}: ${缺.原因}`);
  }
  if (结果.重复.length > 0) {
    lines.push('');
    lines.push(`【重复申请】以下引用在同一次申请里出现了多次(只读了一次, 完整正文仍在上方): ${结果.重复.join('、')}`);
  }
  if (诊断.歧义引用.length > 0) {
    lines.push('');
    lines.push(`【引用歧义】以下 AM 在世界书里命中**多条**条目, 上方已把每一条的完整正文都列出, 请按内容判断哪条才是你要的事件: ${诊断.歧义引用.join('、')}`);
  }
  if (诊断.无关键词条目.length > 0) {
    lines.push('');
    lines.push(`【诊断】以下条目标题像纪要但没有 AM 关键词, 因此**没有**被当作任何引用的证据(标题数字不等于 AM): ${诊断.无关键词条目.join('、')}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 选证: 代码按任务挑选"这一轮需要读哪些 AM"(不是数量预算)
// ---------------------------------------------------------------------------

/** 一条待读引用 + 为什么选它(审计与日志用) */
export interface 选证理由 {
  引用: string;
  理由: string;
}

export interface 选证输入 {
  /** 账本里登记的、本轮与任务相关的引用(到期伏笔/待核命运/上一幕任务/本幕候选) —— 带理由 */
  必需: 选证理由[];
  /** 导演从当前索引申请补充的引用(只认索引里出现过的 AM, 防止瞎编) */
  导演申请?: string[];
  /** 当前索引(用于校验"导演申请的是真实存在的新联系") */
  索引?: 索引项[];
}

export interface 选证结果 {
  /** 本轮要完整读取的引用(去重后, 保持"必需在前、导演申请在后"的顺序) */
  引用: string[];
  /** 每个引用的理由(审计用) */
  理由: Record<string, string>;
  /** 导演申请了但当前索引里没有的引用(显式报告, 不静默丢掉也不假装读得到) */
  索引外申请: string[];
  /** 申请里重复的引用 */
  重复: string[];
}

/**
 * 选证: 代码按"本幕回收 / 上一幕核验 / 命运冲突 / 临近窗口"选, 导演可补充。
 *
 * **不设条数上限**。用户明确允许一次读几十至上百条; 规模控制只发生在"选哪些完整条目",
 * 绝不发生在条目内部, 也不因为"省 token"擅自减少已确认需要的证据(设计文档 §4 / 实施提示词)。
 */
export function 选证(输入: 选证输入): 选证结果 {
  const 引用: string[] = [];
  const 理由: Record<string, string> = {};
  const 重复: string[] = [];
  const 索引集 = new Set((输入.索引 ?? []).map(项 => 归一引用(项.记忆引用)));
  const 索引外申请: string[] = [];
  const push = (raw: string, why: string) => {
    const ref = 归一引用(raw);
    if (!ref) return;
    if (引用.includes(ref)) {
      if (!重复.includes(ref)) 重复.push(ref);
      // 已选中的条目再被另一条理由命中: 把理由并进去(审计要看得出"它被几个任务同时需要")
      if (why && !理由[ref].includes(why)) 理由[ref] = `${理由[ref]}；${why}`;
      return;
    }
    引用.push(ref);
    理由[ref] = why;
  };
  for (const 项 of 输入.必需) push(项.引用, 项.理由);
  for (const raw of 输入.导演申请 ?? []) {
    const ref = 归一引用(raw);
    if (!ref) continue;
    if (输入.索引 && 输入.索引.length > 0 && !索引集.has(ref)) {
      // 导演从"当前索引"申请, 但索引里没有它: 报出来。仍然去读(账本可能记着它),
      // 但审计里写明"这是索引外申请", 不假装它是新发现的新联系。
      if (!索引外申请.includes(ref)) 索引外申请.push(ref);
    }
    push(ref, '导演从当前索引申请补充');
  }
  return { 引用, 理由, 索引外申请, 重复 };
}
