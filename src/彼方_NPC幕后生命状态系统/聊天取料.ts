// 彼方 · 聊天取料: 从楼层里取出"这一轮要分析的东西"。
//
// 以前这些函数住在 update.ts, 而 更新输入.ts 要用它们 → 两个文件互相 import 会成环, 于是走了一条
// 绕路: update.ts 把每个函数包成闭包, 装进一个 7 个 any 的 `依赖` 袋传进去。可 `更新输入` 本来就
// 直接持有 host(读 persona / chat / macros), 这个袋子既不换来可测性(照旧要真 host), 也不换来解耦
// (闭包全是对 host 的闭包), 只换来 7 个 any 参数和一个看不懂的签名。
//
// 现在两个文件都从这里拿, 谁也不用再包一层。

import { createTextFilter } from '../共用/楼层标签过滤';
import type { Host } from './host';

/** 明显的时间跳跃词: 命中就把这句话交给模型当"剧情时间可能跳了"的提示 */
const TIME_JUMP_PATTERN = /(一夜之间|第二天一早|第二天|次日|隔天|几天后|数天后|十几天后|一两周后|两周后|几周后|数周后|几个星期后|几个礼拜后|一个月后|两个月后|数月后|几个月后|半年后|一年后|两年后|几年后|数年后|多年后|若干年后)/;

export function 时间跳跃(text: string): string | null {
    const match = String(text ?? '').match(TIME_JUMP_PATTERN);
    return match ? match[0] : null;
}

/** 名字有没有出现在正文里: 两个汉字以上按子串; 单字要求两侧不是字母(免得"林"命中"林林总总") */
export function 名字出现(text: string, name: string): boolean {
    const trimmed = String(name ?? '').trim();
    if (!trimmed)
        return false;
    if (trimmed.length >= 2)
        return String(text ?? '').includes(trimmed);
    return new RegExp(`(^|[^\\p{L}])${trimmed}([^\\p{L}]|$)`, 'u').test(String(text ?? ''));
}

/** 这一轮要追踪谁: 名单里的 + (可选)当前角色卡的角色名 */
export function 追踪NPC(host: Host, settings: any, data: any): string[] {
    const names = new Set<string>();
    for (const name of data?.名单 ?? []) {
        const trimmed = String(name ?? '').trim();
        if (trimmed)
            names.add(trimmed);
    }
    if (settings?.更新?.追踪当前角色) {
        const characterName = host.character.name();
        if (characterName)
            names.add(characterName);
    }
    return [...names];
}

/** 最近 N 条**可见** AI 回复(从近到远扩窗, 跳过隐藏楼层) */
export function 最近回复(host: Host, count: number) {
    try {
        const lastId = host.chat.lastMessageId();
        if (lastId < 0)
            return [];
        // 循环扩大窗口直到取够 N 条可见 AI 回复(或扫完整个聊天)。
        // 旧版固定 count*10 窗口, 隐藏楼层多时会取不够导致本轮更新被跳过。
        let window = Math.max(count * 4, 10);
        for (;;) {
            const start = Math.max(0, lastId - window);
            const messages = host.chat.messages(`${start}-${lastId}`, { role: 'assistant' });
            const visible = messages.filter(message => !message.is_hidden);
            if (visible.length >= count || start === 0)
                return visible.slice(-count);
            window *= 2;
        }
    }
    catch {
        return [];
    }
}

/** 最近剧情上下文(排除本轮的回复楼层与原楼层), 按"玩家 / AI 名"拼成一段文本 */
export function 上下文(host: Host, replyMessageId: number, filter: (text: string) => string, window: number, replyIds: Set<number>, minId = 0): string {
    try {
        // 上界用 **replyMessageId**(本轮分析到的那一层), 不用 lastId:
        // 平常两者相等, 看不出区别; 但「慢一步」开着时 recent 排除了最新层,
        // replyMessageId 落在 N−1 而 lastId 仍是 N —— 用 lastId 会把**最新那条正文**
        // 从"最近剧情"这一段带进请求, 慢一步就白做了(用户要求的正是"最新层不进分析")。
        // 下界同时兜住 lastId: 楼层被删/切 swipe 后 replyMessageId 可能大于实际末层。
        const lastId = host.chat.lastMessageId();
        const 上界 = Math.min(replyMessageId, lastId);
        const start = Math.max(0, 上界 - window * 2);
        const messages = host.chat.messages(`${start}-${上界}`)
            .filter(message => message.role !== 'system' && !message.is_hidden && message.message_id > minId && !replyIds.has(message.message_id))
            .slice(-window);
        return messages
            .map(message => `${message.role === 'user' ? '玩家' : message.name || 'AI'}: ${filter(message.message)}`)
            .join('\n\n');
    }
    catch {
        return '';
    }
}

/** 全部可见 AI 楼层(纯读: 每次从当前聊天现取, 不缓存)。
 *
 * 不缓存的理由: 唯一调用点是更新频率判定, 每来一条新消息才调一次, 那时 lastId 必变;
 * 而按 lastId 判新鲜会漏掉**内容变化**(编辑中间楼层、删中间楼层、切 swipe 都不改 lastId),
 * 缓存里于是留着编辑前的旧内容。换成按内容指纹判新鲜则每次都得把全部楼层读一遍再算指纹,
 * 省不下真实读取。缓存既然从未命中、命中也不省 I/O, 就不留这一层。 */
export function 全部AI楼层(host: Host) {
    try {
        const lastId = host.chat.lastMessageId();
        if (lastId <= 0)
            return [];
        return host.chat.messages(`0-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
    }
    catch {
        return [];
    }
}

/** 正文过滤器(标签过滤): 单处构造, 调用方按需传 settings.标签 */
export function 正文过滤(标签: unknown): (text: string) => string {
    return createTextFilter((标签 ?? {}) as any);
}

/**
 * 从正文/上下文里提取明确标注的"当前时间"(如 <time_format> 的 time 行、正文里的日期+时刻),
 * 作为剧情时间的参考提示。
 * **只从正文与上下文提取, 不读世界书** —— 世界书里的"当前时间"表是其他系统或彼方上次写入的
 * 推断值, 可能滞后或与正文不符, 作为"务必以此为准"的提示反而会把剧情时间带偏。
 */
/**
 * **时间提示的形状**（2026-11-20 C5，需求方 #482）。
 *
 * ── 为什么不是 `{ 日期?: string; 时: string }` ──
 *
 *  那只是把"缺日期"做成可选字段，**调用方照样会忘判** ——
 *  它和现在返回一个裸字符串没有本质区别。
 *
 *  判别式联合的价值在于：`形: '完整'` 那支**在类型上就有完整日期**，
 *  而 `形: '仅时分'` 那支**进不了只接受 `完整` 的函数**（编译期就挡住）。
 *
 * ── 底线 ──
 *
 *  `20:30` **永远不能出现在「务必以此为准」后面**。
 *  "务必以此为准"配一个残缺值，比没有时间更糟 ——
 *  模型会自己编个日期，而规则同时写着"严禁自创时间线"。
 */
export type 时间提示形状 =
    | { 形: '完整'; 文本: string }
    | { 形: '仅时分'; 文本: string }
    | { 形: '无' };

/**
 * 从正文里提取剧情时间提示。
 *
 * 六个分支（见 `extractFrom` 的注释），按返回值的**完整度**分两档：
 *  · ① 明确"当前时间"标签 ② 中文年月日 ③ 数字日期 → **完整**
 *  · ④ `time:` 行的时分 ⑤ `☆` 标注后的时分 → **仅时分**
 *  · ⑥ 都没匹配 → **无**
 *
 * ⚠ ④⑤ 是**有意设计**（特殊纪年/无标准日期），不是 bug：
 *   那类卡片用特殊纪年，缺日期是**数据事实**。
 *   所以本函数**不丢信息**（`文本` 里仍带着那个时分），只是标出它的完整度 ——
 *   由调用方决定它能进哪里。
 */
export function 时间提示(_worldbook: string, reply: string, context: string): 时间提示形状 {
    // 参数名带下划线: worldbook 是**刻意不用**的(见函数注释 —— 世界书里的"当前时间"可能滞后),
    // 但保留在签名里, 调用点(更新输入.ts)仍然照原样传三个实参。
    const pad = (n: string) => String(n).padStart(2, '0');
    // 正文时间**只从 reply(最近回复)里提取**——worldbook/context 含彼方自己写的
    // "当前时间"固定标签(会干扰), 且拼接在 reply 之后, 取"最后一次"会取到它们。
    // reply 拼接顺序是"较早回复在前、最新回复在后", 最新正文在末尾, 取 reply 内最后一次出现的时间。
    const extractFrom = (text: string): 时间提示形状 => {
        if (!text)
            return { 形: '无' };
        // 1. 明确的"当前时间"标签(时间表列), 取最后一次出现 —— **完整**
        for (const pattern of [/当前时间[^\d]*(\d{3,6}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g, /现在(?:是|为)?[^\d]*(\d{3,6}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g]) {
            const matches = [...text.matchAll(pattern)];
            if (matches.length > 0)
                return { 形: '完整', 文本: matches[matches.length - 1][1].replace(/[/.]/g, '-') };
        }
        // 2. 中文格式: 2025年11月15日 ... 19:20-19:25 (时间段取结束时刻), 取最后一次 —— **完整**
        const cnRe = /(\d{3,6})年(\d{1,2})月(\d{1,2})日[^\n]*?(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/g;
        const cnMatches = [...text.matchAll(cnRe)];
        if (cnMatches.length > 0) {
            const [, y, mo, d, h1, m1, h2, m2] = cnMatches[cnMatches.length - 1];
            const h = h2 ?? h1;
            const m = m2 ?? m1;
            return { 形: '完整', 文本: `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(m)}` };
        }
        // 3. 数字格式(日期+时间), 取最后一次 —— **完整**
        const numericRe = /(\d{3,6}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]?\d{1,2}:\d{1,2})?)/g;
        const numericMatches = [...text.matchAll(numericRe)];
        if (numericMatches.length > 0)
            return { 形: '完整', 文本: numericMatches[numericMatches.length - 1][1].replace(/[/.]/g, '-') };
        // 4. 特殊纪年/无标准日期的时间标注: "time:" 行取最后一行, 时间段取结束时刻 —— **仅时分**
        //
        //    ⚠ 这是**有意设计**：那类卡片用特殊纪年（如"天启三年"），没有标准日期。
        //      所以这里如实标成 `仅时分`，让调用方决定它不能进权威段、不能落持久字段。
        const timeLines = [...text.matchAll(/time:([^\n]*)/gi)].map(match => match[1]);
        const timeLine = timeLines[timeLines.length - 1];
        if (timeLine) {
            const hm = timeLine.match(/(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/);
            if (hm) {
                const [, h1, m1, h2, m2] = hm;
                const h = h2 ?? h1;
                const m = m2 ?? m1;
                return { 形: '仅时分', 文本: `${pad(h)}:${pad(m)}` };
            }
        }
        // 5. 备选: 任意 "☆" 标注后的时分(时间段取结束时刻), 取最后一次 —— **仅时分**
        const hm2Re = /☆[^\n]{0,80}?(\d{1,2}):(\d{1,2})(?:-(\d{1,2}):(\d{1,2}))?/g;
        const hm2Matches = [...text.matchAll(hm2Re)];
        if (hm2Matches.length > 0) {
            const [, h1, m1, h2, m2] = hm2Matches[hm2Matches.length - 1];
            const h = h2 ?? h1;
            const m = m2 ?? m1;
            return { 形: '仅时分', 文本: `${pad(h)}:${pad(m)}` };
        }
        return { 形: '无' };
    };
    // 优先 reply(最新正文), 其次 context(最近剧情上下文)——两者都是本聊天的
    // 实际剧情内容, 时间标注可信; 世界书不参与(见函数注释)
    const fromReply = extractFrom(reply);
    if (fromReply.形 !== '无')
        return fromReply;
    return extractFrom(context);
}
