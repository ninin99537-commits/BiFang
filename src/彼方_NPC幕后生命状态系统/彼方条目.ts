// 彼方写进角色卡主世界书的那一条常驻条目: 叫什么名、怎么认出它、名字撞上别的脚本屏蔽词时改叫什么。
//
// 这三件事以前散在三个地方, 而且三份判定不一致:
// - worldbook.ts 里两份一模一样的(读世界书时"把自己排除", 免得把上一轮状态卡当设定);
// - worldbook-inject.ts 一份(注入时寻找/更新/删除自己那条), 少了"备注命中"与"内容开头"两样信号。
// 后果: 条目名被改到 comment 上(酒馆插件/用户改名都可能), 或只剩 extra 标记时, 读取那侧认得出来,
// 注入那侧认不出来 → 找不到既有条目 → 又建一条重复的。
//
// 现在四样信号合成一处判定: 正文开头 / 名字 / 备注 / 标记, 命中任意一样就算我们自己写的。
import { BIFANG_ENTRY_CONTENT_PREFIX } from './prompts';

/**
 * 世界书条目在彼方眼里只有**这几个字段**是可信的, 而且字段名随来源不同(酒馆给两套形状):
 * - `getWorldbook()` 那一套: `name` / `enabled` / `strategy.{type,keys}` / `content`;
 * - 主 AI 激活数据(`getWorldInfoActivatedData`)那一套: `name|comment` / `disable` / `key` / `content`。
 * 两套都只读到这些键, 其余(uid/position/probability/recursion…)彼方从不使用, 所以这里不列。
 *
 * 为什么不用 `Record<string, unknown>`: 那样每个字段读出来都是 `unknown`, 下游就得写一堆断言;
 * 而这里字段的**名字**是确定的(只有两种来源), 不确定的只是"这一条带了哪几个"。所以写成可选字段,
 * 让 `entry.name` 直接得到 `string | undefined` —— 调用方一眼看出"可能没这个字段", 这正是要表达的意思。
 */
interface 世界书条目形状 {
    name?: string;
    /** 酒馆原生条目的"备注"; 改过名的条目会把名字放在这里 */
    comment?: string;
    /** 激活数据里的关键词: 单个或数组 */
    key?: string | string[];
    enabled?: boolean;
    /** 激活数据用 disable 表示"未启用"(与 getWorldbook 的 enabled 相反) */
    disable?: boolean;
    content?: string;
    strategy?: { type?: string; keys?: Array<string | RegExp> };
    extra?: Record<string, unknown>;
}

/** 彼方写入角色卡主世界书的常驻条目名（用于识别、更新与排除）。
 * 注意: 数据库脚本(ACU)剧情推进会屏蔽名字含"状态/规则/变量/检定/叙事"等关键词的条目,
 * 因此条目名必须避开这些词, 否则剧情推进读不到。 */
const BIFANG_WORLDBOOK_ENTRY_NAME = '【彼方】NPC幕后生活';
/** 数据库脚本(ACU)剧情推进的"条目屏蔽"关键词：命中则条目不进剧情推进上下文 */
const ACU_BLOCKED_KEYWORDS = ['规则', '思维链', 'cot', 'MVU', 'mvu', '变量', '状态', 'Status', 'Rule', 'rule', '检定', '判断', '叙事', '文风', 'InitVar', '格式'];

/** 这条世界书条目是不是彼方自己写的（**读取端用**：宽松，宁可多排除）。
 *
 *  四样信号任一命中就算：正文开头 / 名字 / 备注 / 标记。
 *  为什么这里可以宽松：它只决定"读世界书时要不要跳过自己上一轮的输出" ——
 *  误判的后果是**少读一段**，可逆、不影响用户数据。
 *
 *  ⚠ **不要把它用在删除上**（见 `isBifangEntryDeletable`）：正文前缀是文本启发式，
 *  用户自己写一条正文以 `[彼方 · 幕后NPC状态]` 开头的条目就会被误删。 */
function isBifangEntry(entry: 世界书条目形状 | null | undefined): boolean {
    if (!entry)
        return false;
    const 正文 = String(entry.content || '').trim();
    return 正文.startsWith(BIFANG_ENTRY_CONTENT_PREFIX)
        || entry.name === BIFANG_WORLDBOOK_ENTRY_NAME
        || entry.comment === BIFANG_WORLDBOOK_ENTRY_NAME
        || entry.extra?.bifang === true;
}

/** 这条条目**可以被删掉**吗（**删除端专用**：严格，宁可少删）。
 *
 *  ── 为什么必须与 `isBifangEntry` 分开（2026-11-19 #325）──
 *  `isBifangEntry` 认「正文以 `[彼方 · 幕后NPC状态]` 开头」——
 *  那是**文本启发式，有误伤面**：用户自己写一条笔记，正文第一个字就是那个字符串，
 *  删条目时会被当成彼方的删掉。实测（`bifang-probe-prefix-hurt.mjs`）：
 *
 *      用户：正文以真实前缀开头  → isBifangEntry = true   ★ 会被误删
 *
 *  **删除是不可逆的，所以这里只认"用户改不掉的结构化标记" + 精确名称匹配。**
 *
 *  ── 三条判据，都不含"正文前缀" ──
 *  ① `extra.bifang === true` —— 结构化标记，名字和正文改了它也不变（**主判据**）
 *  ② 名字**精确等于** `【彼方】NPC幕后生活` —— 过渡用（早期版本可能没带标记；
 *     精确等于不会误伤，用户不会恰好把自己的条目起成这个名字）
 *  ③ 备注**精确等于**同名 —— 同上（酒馆把改名的条目把原名放 comment）
 *
 *  ⚠ 已知代价：一条**只有正文前缀、既没标记也没原名**的条目会删不掉。
 *    实测这个代价几乎不存在 —— `extra: { bifang: true }` 从最初提交（`c9c84cc`）
 *    就写在 `create` 分支上，而 `update` 分支用 `...entry` 展开会保留它。
 *    所以"存量老条目没标记"这件事没有发生过。 */
function isBifangEntryDeletable(entry: 世界书条目形状 | null | undefined): boolean {
    if (!entry)
        return false;
    return entry.extra?.bifang === true
        || entry.name === BIFANG_WORLDBOOK_ENTRY_NAME
        || entry.comment === BIFANG_WORLDBOOK_ENTRY_NAME;
}
/** 若条目名命中 ACU 屏蔽词(如旧名"…幕后NPC状态"含"状态"), 改回安全条目名, 否则保留用户自定义名 */
function sanitizeBifangEntryName(currentName: unknown): string {
    const name = String(currentName || '').trim();
    return ACU_BLOCKED_KEYWORDS.some(keyword => name.includes(keyword)) ? BIFANG_WORLDBOOK_ENTRY_NAME : name;
}

export { ACU_BLOCKED_KEYWORDS, BIFANG_WORLDBOOK_ENTRY_NAME, isBifangEntry, isBifangEntryDeletable, sanitizeBifangEntryName };
export type { 世界书条目形状 };
