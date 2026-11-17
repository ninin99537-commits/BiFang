// 彼方 · 剧情时间: 解析 / 格式化(纯函数, 不依赖酒馆平台)
// 从 update.ts 原样搬出(仅改归属, 行为未变)。剧情时间是彼方的全局基准——受孕日期、
// 生理周期日期、哺乳期到期、生活状态日期都按它计算, 因此解析规则收在这一个模块里。
//
// 与 剧情日期.ts 的分工: **日期部分**(认日期/比日差/切区间)在 剧情日期.ts, 那里是唯一口径;
// 这里只负责"带时分的完整时间戳"的解析与格式化, 以及"今天/昨天"这种相对时刻的补全。

import { 读日期, 写日期, 区间末 } from './剧情日期';


/**
 * 把生活状态里的相对时间("今天18:45"/"今天18点45"/"昨天15:30"等)补全为**剧情日期**。
 * 剧情日期取自本次更新的剧情时间文本(storyTimeText, 形如 "2026-08-15 18:41 至 2026-08-15 18:48"),
 * 取结束时刻所在日期作为"今天", 前一天作为"昨天"。
 */
function withStoryDate(text: string | null | undefined, storyTimeText: string): string | null | undefined {
    if (!text || !storyTimeText)
        return text;
    // "今天"取**区间末**(结束时刻所在那天)的日期 —— 日期怎么认归 剧情日期.ts, 这里不再自带一份正则。
    // 年份 3~6 位(0137 / 12640)照样认, 认不出就原样返回。
    const 日 = 读日期(区间末(storyTimeText));
    if (!日)
        return text;
    const today = 写日期(日);
    // 昨天 = 剧情日期 - 1 天。用 UTC 构造: 避开本地夏令时, 也避开 Date(y, m, d) 对 0~99 年映射到 1900+
    const 昨 = new Date(0);
    昨.setUTCFullYear(+日.年, +日.月 - 1, +日.日);
    昨.setUTCDate(昨.getUTCDate() - 1);
    const yesterday = `${String(昨.getUTCFullYear()).padStart(4, '0')}-${String(昨.getUTCMonth() + 1).padStart(2, '0')}-${String(昨.getUTCDate()).padStart(2, '0')}`;
    return String(text)
        .replace(/今天\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/g, `${today} $1:$2`)
        .replace(/今天\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/g, (_, h, m) => `${today} ${h}:${m ? m.padStart(2, '0') : '00'}`)
        .replace(/昨天\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/g, `${yesterday} $1:$2`)
        .replace(/昨天\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/g, (_, h, m) => `${yesterday} ${h}:${m ? m.padStart(2, '0') : '00'}`);
}
/** 解析剧情时间为时间戳（支持 YYYY-MM-DD HH:mm、YYYY.MM.DD、YYYY/MM/DD、YYYY年M月D日 HH:mm 等，分钟可省略）。
 * 年份 **3~6 位**都认(如 0004/0137/12640): 世界纪年不一定四位, 写死四位会把 12640 这类设定判成"格式错误"。
 * 中文年月日也顺手转成短横线: 提示词虽然要求用短横线, 模型仍常写"0137年6月12日 06:30",
 * 能认就认下来, 免得整轮没有时间基准。认不出的(如"天启三年")照样返回 null, 由调用方按"没有时间"兜底。
 * 用 setFullYear 构造, 避免 JS 对 0~99 年份自动映射到 1900+ */
function parseStoryTime(text: unknown): number | null {
    const t = String(text ?? '')
        .trim()
        .replace(/年|月/g, '-')
        .replace(/日/g, ' ')
        .replace(/[./]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    const match = t.match(/^(\d{3,6})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
    if (!match)
        return null;
    const [, year, month, day, hour, minute] = match;
    const d = new Date(0);
    d.setFullYear(+year, +month - 1, +day);
    d.setHours(+(hour ?? 0), +(minute ?? 0), 0, 0);
    const ts = d.getTime();
    return Number.isNaN(ts) ? null : ts;
}
/** 时间戳格式化为 "YYYY-MM-DD HH:mm"（年份至少 4 位补零, 如 0137-06-12 07:45; 更长的年份原样保留） */
function fmtStoryTime(ts: number) {
    const date = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 剧情时间区间: 原文 + 解析出的起止时间戳(解析不出的一侧为 null) */
interface 剧情时间区间 {
    text: string;
    startTs: number | null;
    endTs: number | null;
}

/** 解析 AI 返回的"剧情时间"（兼容字符串或 {开始, 结束} 对象）为起止时间戳 */
function parseStoryTimeRange(raw: unknown): 剧情时间区间 {
    if (typeof raw === 'string') {
        const text = raw.trim();
        // 兼容 "开始 至 结束" 时间段字符串(如 mergeCard 收到的 storyTimeText):
        // 拆成起止两段分别解析, 否则整串解析失败 → startTs=null, 受孕判定的窗口过滤会失效
        const parts = text.split(/\s*(?:至|到|~)\s*/);
        if (parts.length >= 2) {
            const start = parts[0].trim().replace(/[./]/g, '-');
            const end = parts[parts.length - 1].trim().replace(/[./]/g, '-');
            return { text, startTs: parseStoryTime(start), endTs: parseStoryTime(end) };
        }
        const ts = text ? parseStoryTime(text) : null;
        return { text, startTs: ts, endTs: ts };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        // AI 返回的 {开始, 结束}: 键名由提示词约定, 形状是"模型给的动态字段", 只取这两个已知键
        const 区间 = raw as Record<string, unknown>;
        const start = String(区间['开始'] ?? '').trim();
        const end = String(区间['结束'] ?? '').trim();
        const text = start && end && start !== end ? `${start} 至 ${end}` : end || start;
        return { text, startTs: parseStoryTime(start), endTs: parseStoryTime(end) };
    }
    return { text: '', startTs: null, endTs: null };
}

export { fmtStoryTime, parseStoryTime, parseStoryTimeRange, withStoryDate, 剧情跨度 };
export type { 剧情跨度结果 };

/** 跨度分档结果(批1·A2): `档` 是给提示词用的三档名, `文本` 是直接注入的那句人话。 */
interface 剧情跨度结果 {
    小时: number;
    档: '短' | '中' | '长';
    文本: string;
}

/** 把小时数写成"X 小时"或"X.X 天" */
function 跨度文本(小时: number): string {
    return 小时 < 48 ? `${Math.round(小时)} 小时` : `${(小时 / 24).toFixed(1)} 天`;
}

/** 统一措辞: **必须带"约"与"按正文时刻估算"** —— 两端口径不对称(本轮=正文抽取, 上轮=模型判定区间终点),
 *  验收明确"不接受把估算值当精确值判"。所有分支都过这里, 免得哪一条漏了定语。 */
function 跨度措辞(小时: number, 档说明: string): string {
    return `约 ${跨度文本(小时)}（按正文时刻估算）${档说明}`;
}

/**
 * 两次更新之间的**剧情跨度分档**(批1·A2: 跨度由代码算, 不让模型自己回忆)。
 *
 * 为什么不交给模型: 模型只看得到最近 N 条回复, 它没有"上次更新是什么时候"的可靠记忆——
 * 让它自己判断"过了三天还是一小时", 它只能从正文的"第二天""几天后"里猜, 而正文没写就猜不出来。
 *
 * **口径是不对称的, 所以只能算"约"**(清单终稿 A2 + V11):
 * - 本轮这一端 = `本次时刻`, 即从**正文抽取**的 `storyTimeHint`(发模型那一刻还没有"本轮剧情时间.结束",
 *   那是模型返回之后才有的);
 * - 上一轮那一端 = `上次剧情时间` 的**区间终点**(模型上一轮自己判定的)。
 * 两端口径不同, 差异只出现在"正文标了时间段"的分支; 代价小, 但**不能让调用方当精确值用** ——
 * 返回的 `文本` 里就带"约…（按正文时刻估算）", 注入文案照抄它。
 *
 * 返回 `null` = **算不出来**(缺任一侧时间基准)。调用方按"跳过（无时间）"处理, **绝不当 0** ——
 * 当成 0 会让模型以为"刚刚才过", 比不算更糟。
 *
 * 负数跨度: 正文给出的时间比上次推断的更早(上轮推错了, 本轮修正)。不按"时间倒流"处理,
 * 而是按短跨度算 —— 修正不是跳跃, 不该凭空补一段经历。
 */
function 剧情跨度(上次剧情时间: unknown, 本次时刻: unknown): 剧情跨度结果 | null {
    const 上次 = parseStoryTimeRange(上次剧情时间).endTs;
    const 本次 = parseStoryTime(本次时刻);
    if (上次 === null || 本次 === null)
        return null;
    const 小时 = (本次 - 上次) / 3600000;
    if (小时 < 0) {
        return {
            小时,
            档: '短',
            文本: `${跨度措辞(Math.abs(小时), '')} 的**向前修正**(正文时间比上次推断的更早, 不是时间倒流): 按"同一段生活内"处理`,
        };
    }
    if (小时 <= 6) {
        return { 小时, 档: '短', 文本: 跨度措辞(小时, '(≤6 小时, 同一段生活内)') };
    }
    if (小时 <= 48) {
        return { 小时, 档: '中', 文本: 跨度措辞(小时, '(超过 6 小时、两天以内)') };
    }
    return { 小时, 档: '长', 文本: 跨度措辞(小时, '(超过两天)') };
}
