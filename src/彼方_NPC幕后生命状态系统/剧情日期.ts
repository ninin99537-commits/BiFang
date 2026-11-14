// 彼方 · 剧情日期: 认日期 / 写日期 / 比日差 / 切区间 —— 剧情时间的**日期部分**只有这一套口径。
//
// 为什么单独一个 module: 同一个 "YYYY-MM-DD"(年份 3~6 位, 连字符/斜杠/点号/中文年月日都认)
// 以前在 7 个文件里被 13 个正则各认一遍; 日历日差散着算了 5 处; 区间切分有两份, 分隔符还不一样
// (剧情时间用 /至|到|~/, 事务台账用 /至|~|—/ —— 少了「到」, 于是"18:41 到 00:20"这种跨午夜的
// 剧情时间在台账侧被当成**开始那天**, 已挂天数与"约定日期已过"都差一天)。
//
// 口径(全库一致, 改这里就是改全部):
//   - 年份 3~6 位(0004 / 0137 / 12640 都认), **不写死四位**; 月日按需补零, 不截断年份
//   - 日期一律用 UTC 零点做基准算日历日差(不受本地时区/夏令时影响)
//   - 年份 0~99 不能被 JS 的 Date.UTC 悄悄映射到 1900+(用 setUTCFullYear 绕开)

/** 认出来的日期(年原样, 月日补零) */
export type 日期 = { 年: string; 月: string; 日: string };

/** 能认出来的日期: 2025-09-18 / 2025/9/18 / 2025.9.18 / 2025年9月18日 */
const 日期模式 = /(\d{3,6})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/;
/** "YYYY-M-D" / "YYYY/M/D"(已带年份的整日期, 用于算日差) */
const 整日期模式 = /^(\d{3,6})-(\d{1,2})-(\d{1,2})$/;
/** 区间分隔符: 剧情时间写成"开始 至 结束"时用。**四家写法都得认** —— 少一个就是一天误差 */
const 区间分隔 = /至|到|~|—|－/;

/** 从文本里认出**第一个**日期; 认不出返回 null */
export function 读日期(文本: unknown): 日期 | null {
    const m = String(文本 ?? '').match(日期模式);
    if (!m)
        return null;
    return { 年: m[1], 月: m[2].padStart(2, '0'), 日: m[3].padStart(2, '0') };
}

/** 日期 → "YYYY-MM-DD"; 年份可选补到至少 4 位(0137 已是 4 位, 12640 保持原样) */
export function 写日期(日期: 日期, 年补到4位 = false): string {
    const 年 = 年补到4位 ? 日期.年.padStart(4, '0') : 日期.年;
    return `${年}-${日期.月}-${日期.日}`;
}

/** 从文本里认出第一个日期并写成 "YYYY-MM-DD"; 认不出返回空串(调用方按"认不出"兜底) */
export function 读日期文本(文本: unknown): string {
    const 日 = 读日期(文本);
    return 日 ? 写日期(日) : '';
}

/** "YYYY-MM-DD" → 当天 UTC 零点的毫秒数; 认不出返回 null */
export function 日序(日期文本: unknown): number | null {
    const m = String(日期文本 ?? '').trim().match(整日期模式);
    if (!m)
        return null;
    const d = new Date(0);
    // setUTCFullYear: Date.UTC 对 0~99 年会映射到 1900+(0004 这类世界纪年会被算到 1904)
    d.setUTCFullYear(+m[1], +m[2] - 1, +m[3]);
    d.setUTCHours(0, 0, 0, 0);
    const ts = d.getTime();
    return Number.isNaN(ts) ? null : ts;
}

/** 两个日期文本之间差几个**日历日**(甲 − 乙); 任一认不出返回 null */
export function 日差(甲: unknown, 乙: unknown): number | null {
    const a = 日序(甲);
    const b = 日序(乙);
    if (a === null || b === null)
        return null;
    return Math.round((a - b) / 86400000);
}

/** 按区间分隔符切开(剧情时间 "开始 至 结束" → ['开始', '结束']) */
export function 切区间(文本: unknown): string[] {
    return String(文本 ?? '').split(区间分隔).map(段 => 段.trim()).filter(Boolean);
}

/** 区间里**最后一段**(= 结束时刻所在那一段); 不是区间时就是整串。认日期/算"今天"都用它 */
export function 区间末(文本: unknown): string {
    const 段们 = 切区间(文本);
    return 段们.length > 0 ? 段们[段们.length - 1] : '';
}

/** 时间戳 → 当天(按剧情时间那套本地年月日)的日序。**要拿时间戳比日差就先过这里**,
 *  别再各算一套(local 一套、UTC 一套) —— 两套引擎算出来的差在跨时区/跨夏令时的时候会打架。 */
export function 日序自时间戳(ts: number | null | undefined): number | null {
    if (ts === null || ts === undefined || !Number.isFinite(ts))
        return null;
    const d = new Date(ts);
    return 日序(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

/** 两个日序之间差几个日历日(甲 − 乙); 任一为空返回 null */
export function 日差序(甲: number | null, 乙: number | null): number | null {
    if (甲 === null || 乙 === null)
        return null;
    return Math.round((甲 - 乙) / 86400000);
}

/** 两个时间戳之间差几个日历日(甲 − 乙) */
export function 日差自时间戳(甲: number | null | undefined, 乙: number | null | undefined): number | null {
    return 日差序(日序自时间戳(甲), 日序自时间戳(乙));
}

/** 时间戳 → 日期键 "YYYY-MM-DD"。
 *  **不能对 fmtStoryTime 的结果 slice(0,10)**: 年份可能是 5~6 位(12640-03-01), 那样会截掉日期最后一位 */
export function 日期键自时间戳(ts: number | null | undefined): string {
    if (ts === null || ts === undefined || !Number.isFinite(ts))
        return '';
    const d = new Date(ts);
    return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

