// 彼方 · 生活状态的相对时间(纯函数, 不依赖酒馆平台)
//
// 卡上存的是绝对时间: "吃饭(2026-10-17 18:40); 洗漱(2026-10-17 22:10); 睡眠(2026-10-16 23:00-次日07:00)"。
// 主 AI 拿到绝对时间要自己和剧情时间相减才知道过了多久, 它常常不算, 于是刚吃完又吃、一整天不吃不洗。
// 注入时代码替它算好: 每条后面补"约 N 小时前"和一个短提示(饿了 / 该洗澡了 / 困了)。
// 卡上的数据不改, 只改注入给主 AI 的那一份。
//
// 旧版还在这三条里写"已用 / 已洗 / 没吃"这类状态词。问题: 状态词只说明"那一刻做过", 但读的人
// 会当成"现在也是已完成状态"——「已洗」写了三天也像刚洗过, 时间就被无视了。现在状态词一律剥掉,
// 判断依据只有时刻 + 注入时算出的"约 N 小时前"(见 规范化生活状态)。

import { parseStoryTime, parseStoryTimeRange } from './剧情时间';

const 时 = 3600000;
/** 一条生活状态: "吃饭(2026-10-17 18:40)" */
const 条目正则 = /(睡眠|洗漱|吃饭)\s*[(（]([^()（）]*)[)）]/g;
const 时刻正则 = /(\d{3,6}[-/.]\d{1,2}[-/.]\d{1,2})\s+(\d{1,2}:\d{2})/;
/** 旧格式/模型自作主张加的状态词(以及它们前后的分隔符), 统一剥掉 */
const 状态词正则 = /[\s,，;；、]*(?:已用|已洗|已吃|已睡|已起|没吃|没洗|未洗|未睡|还没吃|还没洗|还在睡|在睡)[\s,，;；、]*/g;

function 时长(毫秒: number): string {
    const 小时 = Math.round(毫秒 / 时);
    if (小时 < 1)
        return '刚刚';
    if (小时 < 48)
        return `约 ${小时} 小时前`;
    return `约 ${Math.round(小时 / 24)} 天前`;
}

/**
 * 统一生活状态的写法: **只留时刻, 剥掉状态词**("已用 / 已洗 / 已吃 / 没吃 / 未洗"…)。
 *
 * 为什么剥: 状态词只描述"那一刻做过", 但 AI 读到「已洗」会当成"现在也是洗过了", 写了三天也像刚洗过,
 * 于是无视时间。判断"隔了多久"靠的是时刻 + 注入时算的"约 N 小时前", 不需要状态词。
 * 只剩状态词、没有时刻的条目(如 "吃饭(没吃)")整条丢掉 —— 它不提供任何时间信息。
 * 没有可识别条目结构的自由文本(用户手写的描述)原样返回, 不动。
 */
export function 规范化生活状态(文本: unknown): string {
    const 原文 = String(文本 ?? '').trim();
    if (!原文)
        return 原文;
    const 条目们: string[] = [];
    let 命中条目 = false;
    for (const m of 原文.matchAll(条目正则)) {
        命中条目 = true;
        const 清理 = String(m[2]).replace(状态词正则, ' ').replace(/[\s,，、;；]+/g, ' ').trim();
        if (清理)
            条目们.push(`${m[1]}(${清理})`);
    }
    if (!命中条目)
        return 原文;
    // 条目之外剩下的文字(非标准写法)原样接在后面, 不丢信息
    const 其余 = 原文.replace(条目正则, ' ').replace(/[\s,，、;；]+/g, ' ').trim();
    if (其余)
        条目们.push(其余);
    return 条目们.join('; ');
}

/** 睡眠的醒来时刻: "2026-10-16 23:00-次日07:00" → 10-17 07:00; "23:00-07:00" 跨午夜同理; 没有终点(还在睡)返回 null */
function 醒来时刻(内容: string): number | null {
    const 起 = 内容.match(时刻正则);
    if (!起)
        return null;
    const 起ts = parseStoryTime(`${起[1]} ${起[2]}`);
    const 止 = 内容.slice((起.index ?? 0) + 起[0].length).match(/[-~至到]\s*(次日)?\s*(\d{1,2}):(\d{2})/);
    if (起ts === null || !止)
        return null;
    const d = new Date(起ts);
    d.setHours(+止[2], +止[3], 0, 0);
    let ts = d.getTime();
    if (止[1] || ts <= 起ts)
        ts += 24 * 时;
    return ts;
}

function 提示(类: string, 距今: number): string {
    // 与显示的"约 N 小时前"用同一个取整, 免得写着 16 小时却不提示困
    const 小时 = Math.round(距今 / 时);
    if (类 === '吃饭')
        return 小时 < 3 ? '刚吃过' : 小时 >= 10 ? '一天没怎么吃' : 小时 >= 5 ? '饿了' : '';
    if (类 === '洗漱')
        return 小时 >= 24 ? '该洗澡了' : '';
    // 睡眠: 距今 = 已经醒了多久
    return 小时 >= 22 ? '熬了一整夜' : 小时 >= 16 ? '困了' : '';
}

/** 饭点窗口: 按剧情本地时刻, 早餐 6–9 / 午餐 11–14 / 晚餐 17–21 */
function 饭点(小时: number): string {
    if (小时 >= 6 && 小时 < 9) return '早餐';
    if (小时 >= 11 && 小时 < 14) return '午餐';
    if (小时 >= 17 && 小时 < 21) return '晚餐';
    return '';
}

/**
 * 给更新 AI 的催更: 饭点已过两小时仍没有新饭, 一天没洗漱, 或已醒 16 小时仍没入睡。
 * 只返回短标签, 由调用方附在发送副本上; 认不出时间就不催, 不自己改卡。
 */
export function 生活状态待更新(文本: unknown, 剧情时间: string): string[] {
    const 原文 = 规范化生活状态(文本);
    const 今 = parseStoryTimeRange(剧情时间 ?? '').endTs;
    if (!原文 || 今 === null) return [];
    const 结果: string[] = [];
    const 间隔: Record<string, number | null> = { 吃饭: null, 洗漱: null, 睡眠: null };
    for (const m of 原文.matchAll(条目正则)) {
        const 类 = m[1];
        const 时刻 = m[2].match(时刻正则);
        if (类 === '睡眠') 间隔[类] = 醒来时刻(m[2]);
        else 间隔[类] = 时刻 ? parseStoryTime(`${时刻[1]} ${时刻[2]}`) : null;
    }
    const 饭点已到 = 饭点(new Date(今 - 2 * 时).getHours());
    if (饭点已到 && (间隔.吃饭 === null || 今 - 间隔.吃饭 >= 5 * 时))
        结果.push(`${饭点已到}时间已过, 请返回本轮吃饭的时刻`);
    if (间隔.洗漱 === null || 今 - 间隔.洗漱 >= 24 * 时)
        结果.push('洗漱已超过一天, 请返回洗漱的时刻');
    if (间隔.睡眠 !== null && 今 - 间隔.睡眠 >= 16 * 时)
        结果.push('已醒较久, 请返回当前睡眠安排(还在睡就只写起点)');
    return 结果;
}

/**
 * 按类目合并新旧生活状态: 新值里有的类目用新值, **新值里缺的类目保留旧值**。
 *
 * 为什么需要: 模型有时只回一条(或回了"吃饭(没吃)"这种没有时刻的), 整串覆盖会把另外两类
 * 的时刻弄丢 —— 而"上次什么时候吃的/洗的"正是主 AI 判断时间流逝的唯一依据。
 */
export function 合并生活状态(旧文本: unknown, 新文本: unknown): string {
    const 新 = 规范化生活状态(新文本);
    if (!新)
        return 规范化生活状态(旧文本);
    const 旧 = 规范化生活状态(旧文本);
    if (!旧)
        return 新;
    const 取条目 = (文本: string) => Array.from(文本.matchAll(条目正则), m => ({ 类: String(m[1]), 条目: `${m[1]}(${String(m[2]).trim()})` }));
    const 新条目们 = 取条目(新);
    // 新值不是三条格式(自由文本) → 以它为准
    if (新条目们.length === 0)
        return 新;
    const 结果 = 新条目们.map(x => x.条目);
    for (const 旧条 of 取条目(旧)) {
        if (!新条目们.some(x => x.类 === 旧条.类))
            结果.push(旧条.条目);
    }
    return 结果.join('; ');
}

/**
 * 给界面用: 把生活状态拆成条目 [{ 类, 时间, 距今 }]。
 * 界面不再把整串原样摊成一行, 而是每条一个: "吃饭 0137-08-15 18:20 · 约 8 小时前"。
 * 认不出时刻的条目(如"睡眠(23:00 起)")也照样返回, 只是 距今 为空。
 */
export function 拆分生活状态(文本: unknown, 剧情时间: string): Array<{ 类: string; 时间: string; 距今: string }> {
    const 原文 = 规范化生活状态(文本);
    if (!原文)
        return [];
    const 今 = parseStoryTimeRange(剧情时间 ?? '').endTs;
    const 结果: Array<{ 类: string; 时间: string; 距今: string }> = [];
    for (const m of 原文.matchAll(条目正则)) {
        const 类 = String(m[1]);
        const 内容 = String(m[2]).trim();
        let 基准: number | null;
        if (类 === '睡眠') {
            基准 = 醒来时刻(内容);
        }
        else {
            const 时刻 = 内容.match(时刻正则);
            基准 = 时刻 ? parseStoryTime(`${时刻[1]} ${时刻[2]}`) : null;
        }
        const 距今 = 今 !== null && 基准 !== null && 基准 <= 今 ? 时长(今 - 基准) : '';
        结果.push({ 类, 时间: 内容, 距今 });
    }
    return 结果;
}

/**
 * 把生活状态改写成带相对时间的注入文本。剧情时间认不出、或某条认不出时刻时, 那一条原样保留。
 * 顺手剥掉状态词(见 规范化生活状态): 旧卡里的「已用/已洗」不会进主 AI 的提示词。
 */
export function 生活状态相对化(文本: unknown, 剧情时间: string): string {
    const 原文 = 规范化生活状态(文本);
    const 今 = parseStoryTimeRange(剧情时间 ?? '').endTs;
    if (!原文 || 今 === null)
        return 原文;
    return 原文.replace(条目正则, (整条, 类: string, 内容: string) => {
        let 基准: number | null;
        let 前缀 = '';
        if (类 === '睡眠') {
            基准 = 醒来时刻(内容);
            前缀 = '醒来';
        }
        else {
            const m = 内容.match(时刻正则);
            基准 = m ? parseStoryTime(`${m[1]} ${m[2]}`) : null;
        }
        if (基准 === null || 基准 > 今)
            return 整条;
        const 距今 = 今 - 基准;
        const 补 = [`${前缀}${时长(距今)}`, 提示(类, 距今)].filter(Boolean).join('，');
        return `${类}(${内容.trim()}；${补})`;
    });
}
