// 彼方 · 卡合并: 把「这一轮新返回的值」与「卡上已有的值」合成一张新卡。
//
// 以前这段挤在 应用更新.ts 的 mergeCard 里: 一个 150 行的循环 + 十来段按字段名写的 if 分支,
// 而同一个字段的规则在玩家手改路径(数据变更.ts 的 合并草稿)上又写了一遍。现在:
//   - **怎么合**由 卡字段.ts 的 `合并方式` 决定(覆盖 / 追加 / 台账 / 词表 / 按类目), 这里只执行;
//   - **按什么顺序**只写在下面 合并() 里 —— 有几条顺序是语义要求, 不是习惯(见每段注释);
//   - **「空」由写入方给**: 模型漏写 = 跳过(沿用旧值), 玩家清空 = 删掉该字段(见 空值语义);
//   - **钩子分两档**: '全部' = 判定型钩子也跑(AI 路径); '仅清理' = 只把不该留在卡上的东西拿掉(玩家手改)。
//
// 不进表的东西不在这里硬塞: 受孕事件 / 恋爱事件 是"一张卡"级的事件载荷, 曾用名是改名的桥,
// 种族时间尺度是带校验的窄字段 —— 它们是下面 合并() 的固定尾部, 不是某个字段的合并方式。

import { CARD_FIELDS, 字段分组表, 废弃键, 合并方式表 } from './卡字段';
import type { NpcStateCard } from './卡字段';
import { RACE_SCALE_FIELDS, normalizeRaceScale, 一致化生理 } from './生理规则';
import { withStoryDate } from './剧情时间';
import { 应用恋爱回合, 校验标签, 情感倾向表 } from './恋爱规则';
import { 合并台账, 读取台账 } from './事务台账';
import type { 台账诊断 } from './事务台账';
import { 合并生活状态, 规范化生活状态 } from './生活状态';
// 2026-11-14: lodash 是 webpack externals 注入的全局（webpack.config.ts:4），不在 auto-imports 里 ——
// 一旦把 no-undef 开成 error 就会报悬空，所以显式写出来（default 形式，与 设置.ts 一致）。
import _ from 'lodash';

/** 「空」的语义由**写入方**给：模型漏写一个字段 ≠ 玩家清空一个字段。 */
export type 空值语义 = '跳过' | '删除';
/** 钩子档位：判定型钩子(受孕掷骰 / 生理自洽 / 恋爱结算)只服务 AI 路径 —— 玩家手改本来就是在说"这次我裁决"。 */
export type 钩子档位 = '全部' | '仅清理';
/** 送进来的是**增量**还是**整份**：模型每轮只写有变化的字段(增量), 玩家表单把整格内容传回来(整份)。
 *  同一个"追加/台账/按类目"字段, 两种来源的处理完全不同 —— 增量要并进去, 整份是替换。 */
export type 写入语义 = '增量' | '整份';

export type 合并语境 = {
    /** 本轮剧情时间(生理推进 / 台账紧迫度 / 相对时刻补全的基准) */
    剧情时间: string;
    /** 送进来的是增量还是整份 */
    写入: 写入语义;
    /** 给了但内容是空的(空串 / 空数组)时: 删掉这一格, 还是当没给 */
    空值: 空值语义;
    /** 判定型钩子跑不跑 */
    钩子: 钩子档位;
    /** 生理监测关着: AI 路径下不推进生理、也不接受模型返回的生理字段(数据留着, 只是停) */
    生理关闭?: boolean;
};

/** 列表型字段(近期关键事件)的条目分隔符: 沿用旧行为(；;、换行)
 *  ——逗号在事件正文里很常见, 不当条目分隔符。 */
const EVENT_SEPARATORS = '；;、\n';
/** 括号字符(都算括号, 按深度计数): 括号内的分隔符是描述的一部分, 不能当条目分隔符 */
const OPEN_BRACKETS = '([{（【';
const CLOSE_BRACKETS = ')]}）】';

/**
 * 把 AI 照抄提示词写进数据的「顿号/逗号/分号」三个**词**还原成对应符号。
 * 提示词里写"用顿号分隔"时, 模型会把"顿号"两个字直接写进字段
 * (真机数据: "发旧长条小枕头(睡觉贴身抱着用)顿号软底室内鞋(…)"), 不还原就整串切不开。
 */
function normalizeSeparatorWords(text: string): string {
    return String(text ?? '')
        .replace(/顿号/g, '、')
        .replace(/逗号/g, ',')
        .replace(/分号/g, '；');
}

/**
 * 按分隔符切条目, 但**只在括号外切**。
 * 括号里的顿号/逗号是描述的一部分(如 "旧运动外套(2025-09-18 身上套着、袖子挽到手肘)"),
 * 当成分隔符会把它劈成 "…身上套着" 与 "袖子挽到手肘)" 两条碎片, 碎片再被逐轮追加, 字段就越滚越长。
 * ()（）[]【】{} 都算括号(深度计数); 括号没闭合时宁可整条留着, 也不在"看起来像括号内"的位置切。
 */
function splitListItems(text: string, separators: string): string[] {
    const items: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of normalizeSeparatorWords(text)) {
        if (OPEN_BRACKETS.includes(char)) {
            depth++;
        }
        else if (CLOSE_BRACKETS.includes(char)) {
            if (depth > 0)
                depth--;
        }
        else if (depth === 0 && separators.includes(char)) {
            items.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    items.push(current);
    return items.map(item => item.trim()).filter(Boolean);
}

/**
 * 近期关键事件的语义近似去重。
 *
 * AI 常把同一件事换一种说法再次返回，例如：
 * - 2026-05-20 因诊所宣传日需提早出门，临走前叮嘱家中孩子们
 * - 2026-05-20 因诊所宣传日提早出门上班
 *
 * 精确字符串去重认不出这种重复。这里用“同日期 + 最长公共连续文本占较短事件正文 >= 60%”
 * 判断为同一事件，并保留信息更完整（正文更长）的一条。不同日期永不合并。
 */
function dedupeRecentEvents(text: unknown): string {
    const items = splitListItems(String(text ?? ''), EVENT_SEPARATORS);
    const parse = (item: string) => {
        const match = item.match(/^(\d{3,6}-\d{1,2}-\d{1,2})\s*(.*)$/);
        return {
            date: match?.[1] ?? '',
            body: String(match?.[2] ?? item).replace(/[\s，。！？、；;,.!?：:的了需]/g, ''),
        };
    };
    const longestCommonSubstringLength = (a: string, b: string) => {
        if (!a || !b)
            return 0;
        const previous = new Array(b.length + 1).fill(0);
        let longest = 0;
        for (let i = 1; i <= a.length; i++) {
            const current = new Array(b.length + 1).fill(0);
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) {
                    current[j] = previous[j - 1] + 1;
                    longest = Math.max(longest, current[j]);
                }
            }
            for (let j = 0; j <= b.length; j++)
                previous[j] = current[j];
        }
        return longest;
    };
    const result: string[] = [];
    for (const item of items) {
        const candidate = parse(item);
        // 显式标注: 回调里的 `existing` 来自 `result`(此时还没定类型), TS 会绕成自引用推断(TS7022)
        const duplicateIndex = result.findIndex((existing: string) => {
            const prior = parse(existing);
            if (!candidate.date || candidate.date !== prior.date)
                return false;
            const shorter = Math.min(candidate.body.length, prior.body.length);
            return shorter > 0 && longestCommonSubstringLength(candidate.body, prior.body) / shorter >= 0.6;
        });
        if (duplicateIndex === -1) {
            result.push(item);
        }
        else if (item.length > result[duplicateIndex].length) {
            result[duplicateIndex] = item;
        }
    }
    return result.slice(-3).join('；');
}

/** 给了这一格、但内容是空的：空串，或台账的空数组。
 *  注意这和"没给"是两件事 —— 没给(undefined)两条路径都不动它, 空的才由 空值 决定删不删。 */
function 是显式空(名: string, 值: unknown): boolean {
    if (合并方式表[名] === '台账')
        return Array.isArray(值) && 值.length === 0;
    return typeof 值 === 'string' && !值.trim();
}

/** 追加式合并：新条目追加到末尾，去重后 FIFO 最多 3 条 */
function 合并追加(旧值: unknown, 新值: string): string {
    const 旧文 = String(旧值 ?? '').trim();
    const 新文 = 新值.trim();
    if (!旧文)
        return dedupeRecentEvents(新文);
    const 旧条 = splitListItems(旧文, EVENT_SEPARATORS);
    const 新条 = splitListItems(新文, EVENT_SEPARATORS);
    const 合并 = [...旧条];
    for (const 条 of 新条) {
        if (!合并.includes(条))
            合并.push(条);
    }
    return dedupeRecentEvents(合并.join('；'));
}

/** 闭合词表字段：一个合法词都没有时**保留旧值**（旧值也过一遍归一，全非法才算空） */
function 归一标签(旧值: unknown, 新值: string): string | undefined {
    const 归一 = 校验标签(新值);
    if (归一)
        return 归一;
    return 校验标签(String(旧值 ?? '')) || undefined;
}

/** 非空新值按字段声明的 合并方式 算出落库值；返回 undefined = 这一格不动（保留旧值） */
function 按方式合(名: string, 旧值: unknown, 新值: unknown, 语境: 合并语境, 诊断?: 台账诊断): unknown {
    switch (合并方式表[名]) {
        case '追加':
            // 整份(玩家表单) = 这串就是新的全部; 增量(模型) = 往后追加
            return 语境.写入 === '整份' ? dedupeRecentEvents(String(新值)) : 合并追加(旧值, String(新值));
        case '台账': {
            // 整份(玩家表单) = 传回来的就是整本账 → 直接换; 增量(模型) = 只报变动的条目 → 并进去
            const 台账 = 语境.写入 === '整份'
                ? 读取台账(新值)
                : 合并台账(读取台账(旧值), 新值, 语境.剧情时间, 诊断);
            return 台账.length > 0 ? 台账 : undefined;
        }
        case '词表':
            return 归一标签(旧值, String(新值));
        case '按类目':
            // 生活状态: AI 写的"今天/昨天 HH:mm"先补成剧情日期, 再按类目合并(模型只回一条时另外两类的时刻不能丢),
            // 最后剥掉「已用/已洗/没吃」这类状态词 —— 判断依据只该是时刻 + 注入时算的"约 N 小时前"(见 生活状态.ts)
            // 整份(玩家手改)不按类目合并: 玩家写的这一格就是他想要的全部。
            return 规范化生活状态(语境.写入 === '整份'
                ? withStoryDate(String(新值).trim(), 语境.剧情时间)
                : 合并生活状态(旧值, withStoryDate(String(新值).trim(), 语境.剧情时间)));
        case '覆盖':
        default:
            return String(新值).trim();
    }
}

/**
 * 合并一张卡。
 *
 * 顺序里带 **必须** 的几条（改顺序会真的坏）：
 *   ① 受孕事件 必须在 一致化生理 之前复制进卡 —— 掷骰要读 merged['受孕事件']，一致化生理会消费掉它；
 *   ② 恋爱闸 必须在"复制恋爱事件入卡"之前 —— 恋爱事件不在 CARD_FIELDS 里，进了卡就没有任何路径会删它；
 *   ③ 一致化生理 在字段合并之后 —— 它要看到合完的字段才谈得上"自洽"。
 *
 * 判定型钩子（受孕事件 / 种族尺度 / 曾用名 / 一致化生理 / 恋爱结算）只在 钩子='全部' 时跑；
 * 清理型（废弃键 / 不该落卡的键 / 生活状态与近期关键事件的自愈归一）两档都跑。
 *
 * **两个写入方走同一个入口**，差别全在交给它的东西上：
 *   AI 路径: 写入='增量'(模型只报有变化的)、空值='跳过'、钩子='全部'、字段们=CARD_FIELDS
 *   玩家手改: 写入='整份'(表单传整格)、空值='删除'、钩子='仅清理'、字段们=CARD_FIELDS + 可手编
 */
export function 合并(
    旧卡: NpcStateCard | null | undefined,
    新卡: Record<string, any>,
    语境: 合并语境,
    诊断?: 台账诊断,
    字段们: readonly string[] = CARD_FIELDS,
): NpcStateCard {
    const merged: NpcStateCard = { ...(旧卡 ?? {}) };

    // ==== 清理型: 卡上不该有的键 ====
    // 废弃键(见 卡字段.ts): 退休字段 + 当年就地 delete 的那几个, 一次清干净
    for (const 废弃 of 废弃键)
        delete merged[废弃];
    // 人设参考是发给 AI 的只读参考(每张卡附在末尾的世界书条目), AI 不应把它当字段返回——
    // 若 AI 误把它写进 JSON, 直接丢弃不合并, 防止它进入快照无限累积。
    delete merged['人设参考'];

    // ==== 开关闸: 关掉的功能不推进、也不吃模型返回的字段(数据留着, 重开再接着走) ====
    const AI路径 = 语境.钩子 === '全部';
    const 生理字段 = new Set(字段分组表['生理'] ?? []);
    const 恋爱字段 = new Set(字段分组表['恋爱'] ?? []);
    const 生理关 = AI路径 && !!语境.生理关闭;
    const 恋爱关 = AI路径 && String(merged['恋爱对象'] ?? '').trim() !== '是';
    const 丢弃: string[] = [];

    // ==== 逐字段: 怎么合由 合并方式 决定 ====
    for (const 名 of 字段们) {
        if (生理关 && 生理字段.has(名)) {
            丢弃.push(名);
            continue;
        }
        if (恋爱关 && 恋爱字段.has(名)) {
            丢弃.push(名);
            continue;
        }
        const 新值 = 新卡?.[名];
        const 方式 = 合并方式表[名];
        // 这一格"没给": 两条路径都不动它(模型没写 = 沿用旧值; 玩家表单没带这一格 = 不改)
        if (新值 === undefined || 新值 === null) {
            // 例外: 台账是**自愈型**字段 —— 旧卡里可能还是旧格式字符串(读取台账 负责迁移成 T1,
            // 整句"无"会落成空账), 每次合并都过一遍, 否则那一串会一直以字符串形态躺在卡上,
            // 而注入侧读的是台账数组。旧值也没有时不写空数组(不给每张卡新增一个恒空的字段)。
            if (方式 === '台账' && merged[名] !== undefined)
                merged[名] = 合并台账(读取台账(merged[名]), undefined, 语境.剧情时间, 诊断);
            continue;
        }
        // 这一格"给了但是空的": 按 空值 语义删掉或当没给
        if (是显式空(名, 新值)) {
            if (语境.空值 === '删除')
                delete merged[名];
            continue;
        }
        const 值 = 按方式合(名, merged[名], 新值, 语境, 诊断);
        if (值 !== undefined)
            merged[名] = 值;
    }

    // ==== 清理型: 沿用下来的值也自愈一遍（AI 这轮没返回也照样跑） ====
    // 旧卡里可能还带着"已洗/没吃"这类状态词、或同一天两条近义事件 —— 每次合并都清一次。
    if (typeof merged['生活状态'] === 'string' && merged['生活状态'].trim())
        merged['生活状态'] = 规范化生活状态(withStoryDate(merged['生活状态'], 语境.剧情时间));
    if (merged['近期关键事件'])
        merged['近期关键事件'] = dedupeRecentEvents(merged['近期关键事件']);

    if (语境.钩子 !== '全部')
        return merged;

    // ==== 判定型钩子: 只有 AI 路径跑 ====
    // 受孕事件: AI 报告的结构化对象(时间/对象/方式/防护/次数)或事件数组, 整块覆盖; 未报告则保留旧值
    let 本次有新受孕事件 = false;
    const 事件更新 = 新卡?.['受孕事件'];
    const 事件合法 = !!事件更新 && typeof 事件更新 === 'object'
        && (!Array.isArray(事件更新) || 事件更新.some(item => item && typeof item === 'object' && !Array.isArray(item)));
    // 生理关着时既不判定也不留载荷: 受孕事件只由 一致化生理 消费删除, 跳过它就会把这个临时键
    // 一路带进快照(快照只防御性清理 恋爱事件)。所以关闭时直接丢掉, 不复制进卡。
    if (事件合法 && !生理关) {
        merged['受孕事件'] = _.cloneDeep(事件更新);
        本次有新受孕事件 = true;
    }
    if (生理关)
        delete merged['受孕事件'];
    // 种族时间尺度(「孕程周数」「哺乳期月数」): AI 按 NPC 种族/世界书设定填写, 只接受范围内的正整数。
    // 非法/缺失一律**保留原值**并告警——缺数字时彼方没有依据, 下游按"不推断、不改写"处理, 绝不默认人类。
    for (const scaleField of RACE_SCALE_FIELDS) {
        const rawScale = 新卡?.[scaleField];
        if (rawScale === undefined)
            continue;
        const normalized = normalizeRaceScale(scaleField, rawScale);
        if (normalized === null) {
            console.warn(`[彼方] ${merged['曾用名'] || ''} 「${scaleField}」取值不合法(${rawScale}), 已忽略并保留原值`);
            continue;
        }
        merged[scaleField] = normalized;
    }
    // 曾用名: AI 在改名时标注的旧名(如"林姐"其实是"林淑仪"), 保留供彼方识别与合并
    if (typeof 新卡?.['曾用名'] === 'string' && 新卡['曾用名'].trim())
        merged['曾用名'] = 新卡['曾用名'].trim();
    // 生理一致性(周期长度/受孕判定/孕期-周期互校/怀孕知晓/阶段名/生理周期日期)全部收进 生理规则.ts:
    // 这里只负责"字段怎么合", 不负责"合完是否自洽"。
    if (生理关) {
        if (丢弃.length > 0)
            console.info(`[彼方] ${merged['曾用名'] || ''} 生理监测已关闭: 本轮丢弃 ${丢弃.length} 个生理字段(数据仍在卡上, 重开开关继续)`);
    }
    else {
        一致化生理({ 卡: merged, 旧卡, 剧情时间: 语境.剧情时间, 本轮更新: 新卡, 本次有新受孕事件 });
    }
    // ==== 恋爱子系统(标记即开关: 没有 恋爱对象="是" 的卡一个字段都不碰) ====
    // 一整块自包含代码: 只读写恋爱字段, 与上面的生理块零字段交集, 所以放末尾没有任何顺序顾虑。
    // **闸必须在"复制恋爱事件入卡"之前**: 恋爱事件不在 CARD_FIELDS 里, 上面的字段循环不管它——
    // 一旦进了卡就没有任何路径会删它, 会随每份快照一路膨胀。未标记时连复制都不做。
    if (String(merged['恋爱对象'] ?? '').trim() === '是') {
        const 恋爱事件 = 新卡?.['恋爱事件'];
        const 事件数组 = Array.isArray(恋爱事件)
            ? 恋爱事件.filter(item => item && typeof item === 'object' && !Array.isArray(item))
            : (恋爱事件 && typeof 恋爱事件 === 'object' ? [恋爱事件] : []);
        if (事件数组.length > 0)
            merged['恋爱事件'] = _.cloneDeep(事件数组);
        else if (恋爱事件 !== undefined && 恋爱事件 !== null)
            console.warn(`[彼方] ${merged['曾用名'] || ''} 「恋爱事件」形态不合法(应为事件数组), 已忽略`);
        // 情感倾向: 只在开局窗口还开着、卡上还没有倾向(或只是惰性补齐的"常规")时接受 AI 按人设报的值;
        // 玩家在开局对话框里选过的不会被覆盖(对话框选了就不是空, 且选"手动"会关窗)
        const AI倾向 = String(新卡?.['情感倾向'] ?? '').trim();
        const 卡倾向 = String(merged['情感倾向'] ?? '').trim();
        if (AI倾向 && 情感倾向表[AI倾向] && String(merged['恋爱开局'] ?? '').trim() !== '是' && (!卡倾向 || 卡倾向 === '常规'))
            merged['情感倾向'] = AI倾向;
        // 结算(纯函数返回补丁): 逐条折算 → 单轮上限只夹涨 → 时间回落 → 夹0-100 → 情欲地板 → 阶段重算 → 恋爱动向
        Object.assign(merged, 应用恋爱回合(merged, merged['恋爱事件'] ?? [], 语境.剧情时间));
        // 「恋爱标签」的**新值**由字段循环按 合并方式='词表' 归一; 这里只管"本轮没报"的那一半:
        // 沿用下来的旧值也过一遍归一(见 §3.7 v7: 归一化后为空不当清空, 但旧值本身全非法就不该留着)
        const 标签本轮 = typeof 新卡?.['恋爱标签'] === 'string' ? 新卡['恋爱标签'].trim() : '';
        if (!标签本轮 && merged['恋爱标签'] !== undefined) {
            const 归一 = 校验标签(String(merged['恋爱标签'] ?? ''));
            if (归一)
                merged['恋爱标签'] = 归一;
            else
                delete merged['恋爱标签'];
        }
        delete merged['恋爱事件']; // 消费后删除, 永不落盘(照 受孕事件)
    }
    else if (新卡?.['恋爱事件'] !== undefined && 新卡['恋爱事件'] !== null) {
        console.warn(`[彼方] ${merged['曾用名'] || ''} 未标记为恋爱对象却返回了「恋爱事件」, 已忽略`);
    }

    merged['最后更新'] = Date.now();
    return merged;
}


