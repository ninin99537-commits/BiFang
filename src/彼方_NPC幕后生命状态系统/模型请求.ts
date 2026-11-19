// 从模型那里拿到"合要求的 JSON"这一步(候选2 拆出来的第一步)。
// 这一段以前塞在 updateNpcStates 里, 和"取料/应用/收尾"共用一个 try; 现在它自己一个模块:
// 发请求 → 解析 → 校验, 不合格就原样重发(最多 3 次)。两类失败分开对待:
//  - 接口出错(网络/网关/超时/政策拦): 只等更久(2 秒 × 第几次)后重试;
//  - 解析/校验失败: 原样重发同一份提示词再试(等 0.6 秒后重试, 最多 3 次)。
// 发请求、写日志、报进度都由调用方传进来, 所以这一整套重试协议不装酒馆也能单独跑。
// 依赖按实际用到的符号具名导入/默认导入(形态守卫见 tests/no-bundle-artifacts.test.ts)。
// json5 走默认导入: 原先是从命名空间取 ["default"], 默认导入编译出的取值路径与它完全一致。
import JSON5 from 'json5';
import { 建档必填字段, 每次必返字段, 值形态表 } from './卡字段';
import { PHYSIO_FIELDS } from './生理规则';
import { parseStoryTime } from './剧情时间';
import { 去信封 } from '../共用/去信封';
import { 请求并校验 as 共用请求并校验 } from '../共用/模型往返';

/** 模型可能把内部思考当成顶层字段输出的键名(非彼方数据): 解析兜底时剥离, 也作为保留键不参与 NPC 建档 */
const THINKING_FIELD_KEYS = ['静默思考流程', '思考流程', '思考过程', '思维链', '推理过程'];
/** 建档时必须返回的字段(性别相关的生理五项与可手编字段都不在这里) —— 从 卡字段.ts 的 建档必填 派生 */
const REQUIRED_CARD_FIELDS = 建档必填字段;
/** 增量更新下已有 NPC 每次必返的核心字段(其余字段未返回=沿用旧值) —— 从 卡字段.ts 的 每次必返 派生 */
const CORE_CARD_FIELDS = 每次必返字段;
/** 失败诊断: 三个计数就能把"真截断"和"字符串状态被打翻"分开 ——
 *  左括号比右括号多 → 接口真砍在半路; 引号是奇数 → 有未转义的 `"` 把后面的 `}` 吞进了字符串。 */
function 括号诊断(text: string): string {
    const 左 = (text.match(/\{/g) ?? []).length;
    const 右 = (text.match(/\}/g) ?? []).length;
    const 引号 = (text.match(/"/g) ?? []).length;
    const 判 = 引号 % 2 ? '(奇数←字符串状态被打翻)' : 左 > 右 ? '(左多←截断)' : '';
    return `诊断: '{' ${左} / '}' ${右} / '"' ${引号}${判}`;
}

/** 候选是否像"彼方载荷": 有元数据键(剧情时间/移除NPC), 或者有 NPC 容器键。
 *  为什么必须认 NPC: 一轮"什么都没变"的合法输出就是 `{"NPC":{}}` —— 既没有剧情时间也没有移除名单。
 *  只认前两个键时它被判成"不是 JSON", 白白重发两次再整轮失败(用户白等三份请求)。
 *  伪示例的风险不比现状大: 那种块通常也带剧情时间, 早就在同一个判据里了。 */
function 像彼方载荷(text: string) {
    return text.includes('"剧情时间"') || text.includes("'剧情时间'")
        || text.includes('"移除NPC"') || text.includes("'移除NPC'")
        || text.includes('"NPC"') || text.includes("'NPC'");
}
function parseModelResponse(content: string) {
    let text = content.trim();
    const fence = text.match(/^```(?:json|yaml)?\s*([\s\S]*?)\s*```$/);
    if (fence)
        text = fence[1].trim();
    // 上游注入的工具调用信封(emit_complete_response_<nonce>{content:…}): 剥掉它, text 才是原本的载荷
    text = 去信封(text);
    // 括号配平+候选轮验截取 JSON——不能用"第一个{到最后一个}"的粗切:
    // 模型受世界书格式影响时, 彼方的 JSON 前后可能跟着自带 { } 的其他格式块(UpdateVariable/思维链里的伪示例),
    // 粗切会拼出坏串, 固定取第一个 { 又可能抓到前文的示例小对象。
    // 候选轮验: 逐个 { 起配平切出候选串, 含彼方核心字段且能通过解析的第一个完整对象胜出
    const sliceBalancedJson = (text: string) => {
        let start = text.indexOf('{');
        while (start !== -1) {
            let depth = 0;
            let inString = false;
            let escaped = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (inString) {
                    if (escaped)
                        escaped = false;
                    else if (ch === '\\')
                        escaped = true;
                    else if (ch === '"')
                        inString = false;
                    continue;
                }
                if (ch === '"')
                    inString = true;
                else if (ch === '{')
                    depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        const candidate = text.slice(start, i + 1);
                        // 候选必须含彼方的核心字段才算目标对象(排除前文伪 JSON 示例/其他格式块的小对象)
                        if (像彼方载荷(candidate)) return candidate;
                        start = text.indexOf('{', i + 1); // 不是目标, 从这个候选之后继续找
                        break;
                    }
                }
            }
            if (depth !== 0)
                break; // 扫到文本末尾括号都没配平(截断), 无更多候选
        }
        return null;
    };
    const sliced = sliceBalancedJson(text);
    if (!sliced) {
        throw Error(`AI 没有返回 JSON 对象（只输出了文字/推理内容, 或大括号不配平可能被截断）。\n原始内容: ${content.slice(0, 400)}\n${括号诊断(content)}`);
    }
    text = sliced;
    // 思考内容不是数据, 直接无视: 模型偶尔把内部思考当顶层字段输出(如 "静默思考流程": "Step1 ..."),
    // 其中的裸换行/未转义引号会让 JSON 与 JSON5 全部解析失败。优先剥离该字段再解析。
    const stripped = stripThinkingFields(text);
    // 字符串内的裸控制字符(换行/制表符)转义: 模型把多行文本写进数据字段时(思考之外的字段也可能出现)
    const candidates: string[] = [];
    if (stripped !== text) {
        candidates.push(escapeRawControlCharsInStrings(stripped), stripped);
    }
    candidates.push(escapeRawControlCharsInStrings(text), text);
    // 逐个候选尝试: JSON 严格解析 → JSON5 宽松解析; 全部失败时用最后一次的错误报错
    let lastError: unknown;
    for (const candidate of candidates) {
        // 剥离/修复后必须仍是彼方 JSON(含数据键), 否则说明切坏了, 换下一候选
        if (!像彼方载荷(candidate))
            continue;
        for (const parse of [(t: string) => JSON.parse(t) as unknown, (t: string) => JSON5.parse(t) as unknown]) {
            try {
                return parse(candidate);
            }
            catch (e) {
                lastError = e;
            }
        }
    }
    if (stripped !== text)
        console.warn('[彼方] JSON 解析失败后已剥离"思考流程"字段重试(提示词已要求不要把思考写进 JSON)');
    const jsonError = lastError;
    throw Error(`AI 返回的 JSON 不完整或格式错误（已自动重试，多次失败请调大「最大输出Token」或检查模型）。解析错误: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}\n原始内容: ${content.slice(0, 600)}`, { cause: jsonError ?? undefined });
}
/** 字符串内的裸控制字符(换行/回车/制表符等)转义为合法 JSON 转义序列。
 *  模型把多行文本直接写进 JSON 字符串时会产生裸换行, JSON.parse 与 json5 都会拒绝。
 *  只在字符串内部做转义, 不改动结构字符。 */
function escapeRawControlCharsInStrings(text: string) {
    const src = String(text ?? '');
    let out = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inString) {
            if (escaped) {
                out += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                out += ch;
                escaped = true;
                continue;
            }
            if (ch === '"') {
                out += ch;
                inString = false;
                continue;
            }
            const code = ch.charCodeAt(0);
            if (code === 0x0A)
                out += '\\n';
            else if (code === 0x0D)
                out += '\\r';
            else if (code === 0x09)
                out += '\\t';
            else if (code < 0x20)
                out += `\\u${code.toString(16).padStart(4, '0')}`;
            else
                out += ch;
            continue;
        }
        if (ch === '"')
            inString = true;
        out += ch;
    }
    return out;
}
/** 剥离顶层"静默思考流程"等思考字段(非彼方数据, 直接无视)。
 *  优先按"下一个顶层键"定位值结尾(`,` + 换行 + `"键名"`), 找不到再退回对象结尾 `}`;
 *  切完立即由调用方用真实解析验证, 切坏则自动降级到原始文本。找不到思考键时原样返回。 */
function stripThinkingFields(text: unknown) {
    let result = String(text ?? '');
    for (const key of THINKING_FIELD_KEYS) {
        const keyRe = new RegExp(`"${key}"\\s*:`, 'g');
        let match = keyRe.exec(result);
        while (match) {
            const valueStart = keyRe.lastIndex;
            let end = -1;
            let endWithComma = false;
            // ① 优先: 顶层键分隔符 `,` + 换行 + `"键名"`
            for (let i = valueStart; i < result.length; i++) {
                if (result[i] === ',') {
                    const rest = result.slice(i + 1);
                    if (/^\s*\n\s*"/.test(rest)) {
                        end = i;
                        break;
                    }
                }
            }
            // ② 退回: 顶层对象结尾 `}`(此时候选框会缺数据键, 由调用方判定作废)
            if (end === -1) {
                const closeIdx = result.lastIndexOf('}');
                if (closeIdx > valueStart) {
                    end = closeIdx;
                    endWithComma = true;
                }
            }
            if (end === -1)
                break;
            const before = result.slice(0, match.index);
            const after = result.slice(end + (endWithComma ? 0 : 1));
            result = before + after.replace(/^\s*/, '');
            // 重建后必须重置 lastIndex: 全局正则否则会从旧位置继续, 漏掉重复出现的思考字段
            keyRe.lastIndex = 0;
            match = keyRe.exec(result);
        }
    }
    return result;
}
/** 顶层保留键(非 NPC 名字): 元数据/思考字段/旧格式分组键, 不参与状态卡合并与校验 */
function isReservedTopLevelKey(name: string) {
    return name === '在场NPC' || name === '后台互动' || name === '移除NPC'
        || name === '剧情时间' || name === '受孕事件' || name === '恋爱事件' || name === '人设参考'
        || THINKING_FIELD_KEYS.includes(name);
}
/** 校验 AI 输出的 JSON 结构是否符合预期; 结构错误、"新增 NPC 字段不全"抛错重试, 已有 NPC 缺普通字段只警告(沿用旧值) */
/**
 * 模型给出的这个名字**能不能当 NPC 名**（2026-11-19 #340）。
 *
 * ── 为什么需要它 ──
 *  `__proto__` 这类名字是**对象原型的特殊键**：
 *
 *      const o = {};
 *      o['__proto__'] = { 当前在做: 'x' };
 *      Object.keys(o)   // []          ← 走 setter，**不产生自身属性**
 *      Object.getPrototypeOf(o)  // { 当前在做: 'x' }   ← 原型被改了
 *
 *  于是 `newData.NPC['__proto__'] = 卡` 之后：
 *  **名单里有它，NPC 里没有它** —— 每轮复现，永不自愈。
 *  那位 NPC 在面板/世界书里消失，而下一轮 AI 被要求更新一张不存在的卡 → 可能触发格式失败循环。
 *
 * ── 为什么是"拦住"而不是"安全地存下来" ──
 *  这种名字**本来就不该是 NPC 名**。就算用 `Object.defineProperty` 存进去了，
 *  之后面板/世界书/日志里到处都要拿这个名字做键、做查找 —— 每一处都得防一次。
 *  而且用户永远不可能给一个角色起名叫 `__proto__`。
 *
 *  **拦在入口，比在每个使用点防守便宜得多。**
 *
 * ── 为什么只拦 `__proto__` 一个（实测过其余不受影响）──
 *      constructor    → Object.keys = ["constructor"]      ✅ 正常
 *      prototype      → Object.keys = ["prototype"]        ✅ 正常
 *      toString       → Object.keys = ["toString"]         ✅ 正常
 *      hasOwnProperty → Object.keys = ["hasOwnProperty"]   ✅ 正常
 *
 *  只有 `__proto__` 是**访问器属性**（`Object.prototype.__proto__` 的 setter）。
 *  其余都是普通数据属性，赋值会正常产生自身属性。
 *
 *  ⚠ **别写成"所有名字都要转义"** —— 那会把本来正常的路径改坏
 *  （验收实测：换行/引号/500 字/空格开头/constructor 全部正常）。
 */
const 非法NPC名 = new Set(['__proto__']);
function 是合法NPC名(名: unknown): boolean {
    const s = String(名 ?? '').trim();
    if (!s)
        return false;
    return !非法NPC名.has(s);
}

/**
 * 模型输出 → NPC 清单: 顶层每个非保留键就是一个 NPC(卡); 兼容旧格式的「在场NPC」数组。
 *
 * 在这之前"谁是 NPC、叫什么、卡在哪"有三份实现: applyUpdate 一遍、validateParsedFormat 一遍、
 * 「自动建档关闭时哪些名字会被跳过」再一遍(其中 在场NPC 的姓名回退写了两遍)。模型输出形状一变就要改
 * 三处, 迟早漂。现在只有这一份, 三处都遍历它, 各自的策略(是否追踪/算不算新角色)留在调用方。
 *
 * **这里是 `__proto__` 型名字的**唯一拦截点**（2026-11-19 #340）**：
 * 三条路径（applyUpdate / validateParsedFormat / 自动建档跳过名单）都遍历它，
 * 所以拦在这里 = 三条都拦住。**不要在下游再各写一份。**
 */
export function 认出NPC(parsed: unknown): Array<{ 名: string; 卡: Record<string, any> }> {
    const 结果: Array<{ 名: string; 卡: Record<string, any> }> = [];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return 结果;
    const 顶层 = parsed as Record<string, any>;
    // 新格式: NPC 容器里一个个名字; 旧/扁平格式: 顶层键就是名字(排除元数据键)
    const 新格式 = typeof 顶层['NPC'] === 'object' && 顶层['NPC'] !== null && !Array.isArray(顶层['NPC']);
    const 逐个 = 新格式 ? 顶层['NPC'] as Record<string, any> : 顶层;
    /** 被拦下的名字只喊一次（同一轮里可能重复出现，喊多了是噪音） */
    const 拦下 = new Set<string>();
    const 查合法 = (名: string): boolean => {
        if (是合法NPC名(名))
            return true;
        if (!拦下.has(名)) {
            拦下.add(名);
            console.warn(`[彼方] 模型给出了一个非法名字「${名}」(${非法NPC名.has(名) ? '对象原型的特殊键，赋值不会产生自身属性' : '名字为空'})，已忽略：不会进名单、不建卡`);
        }
        return false;
    };
    for (const [名, 卡] of Object.entries(逐个)) {
        if (!新格式 && (isReservedTopLevelKey(名) || 名 === '在场NPC'))
            continue;
        if (!卡 || typeof 卡 !== 'object' || Array.isArray(卡))
            continue;
        if (!查合法(名))
            continue;
        结果.push({ 名, 卡: 卡 as Record<string, any> });
    }
    // 兼容旧版输出格式: 「在场NPC」数组里每项是完整状态卡(对象=卡, 或 姓名/名字 + 卡)
    if (Array.isArray(顶层['在场NPC'])) {
        for (const item of 顶层['在场NPC']) {
            if (!item || typeof item !== 'object' || Array.isArray(item))
                continue;
            let 名 = String(item['姓名'] ?? item['名字'] ?? '').trim();
            let 卡: Record<string, any> = item;
            if (!名) {
                const 首个 = Object.entries(item).find(([键, 值]) => 键 !== '姓名' && 键 !== '名字' && 值 && typeof 值 === 'object');
                if (首个) {
                    名 = String(首个[0]).trim();
                    卡 = 首个[1] as Record<string, any>;
                }
            }
            if (名 && 查合法(名))
                结果.push({ 名, 卡 });
        }
    }
    return 结果;
}
function validateParsedFormat(parsed: unknown, existingCards: Record<string, any> = {}, skipCheckNames: Set<string> | null = null) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Error('AI 返回的 JSON 结构不符合预期(顶层不是对象)');
    }
    // 上面已判过"是非数组对象"; 顶层是模型给的动态字段(键=NPC 名), 形状只能到"任意键"这一层
    const 顶层 = parsed as Record<string, any>;
    // 剧情时间: 能解析就按标准格式用; **解析不出来只警告, 不判整轮失败**。
    // 天启三年 / 第三纪元这类纪年根本写不成 "YYYY-MM-DD HH:mm", 为此重试三次再丢掉一整轮状态更新
    // (用户实测白等 68 秒、一个 NPC 都没写) 完全不划算。下游对"没有可用剧情时间"本来就有兜底:
    // 生理推进用旧基准、生活状态不补相对时间、台账不催紧迫度 —— 其余状态照常写入。
    const storyTime = 顶层['剧情时间'];
    let storyEndTs = null;
    if (storyTime && typeof storyTime === 'object' && !Array.isArray(storyTime)) {
        const bad = [];
        for (const key of ['开始', '结束']) {
            const value = String(storyTime[key] ?? '').trim();
            if (value && parseStoryTime(value) === null)
                bad.push(`${key}="${value}"`);
        }
        if (bad.length > 0) {
            console.warn(`[彼方] 剧情时间无法解析(${bad.join('、')}): 本轮按"没有可用剧情时间"处理 —— `
                + '生理周期推进沿用旧基准, 生活状态/紧迫度这类按时间推算的部分会跳过; 其余状态照常更新。'
                + '想恢复这些功能, 请把剧情时间写成 "YYYY-MM-DD HH:mm"(年份 3~6 位, 如 0137、12640)');
        }
        const endStr = String(storyTime['结束'] ?? '').trim();
        storyEndTs = endStr ? parseStoryTime(endStr) : null;
    }
    const checkCard = (npcName: string, card: Record<string, any>, isNew = false) => {
        // 增量更新: 新建 NPC 要求全字段(建档补全); 已有 NPC 只要求核心三字段——
        // 其余字段未返回=沿用旧值, 属于合法行为, 不警告
        const requiredFields = isNew ? REQUIRED_CARD_FIELDS : CORE_CARD_FIELDS;
        // 普通字符串字段按"非空字符串"判; 台账数组字段(值形态='台账数组')按"数组或旧格式非空字符串"判——
        // 空数组也合法, 不按非空字符串口径判缺字段, 否则合法的新卡会被误警告。
        const missingNormal = requiredFields.filter(field => 值形态表[field] !== '台账数组'
            && (typeof card?.[field] !== 'string' || !String(card?.[field] ?? '').trim()));
        for (const field of requiredFields) {
            if (值形态表[field] !== '台账数组')
                continue;
            const 值 = card?.[field];
            if (!Array.isArray(值) && !(typeof 值 === 'string' && 值.trim()))
                missingNormal.push(field);
        }
        if (missingNormal.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失字段: ${missingNormal.join('、')}(保留旧值)`);
        }
        // 睡眠时间合理性告警: 剧情结束时刻已到白天(约07:00~21:00),
        // 但"当前在做/当前状态"仍停留在过夜睡眠(睡觉/入睡/就寝/赖床), 提示 AI 按时间推进
        if (storyEndTs !== null) {
            const hour = new Date(storyEndTs).getHours();
            if (hour >= 7 && hour <= 21) {
                const sleepText = `${String(card?.['当前在做'] ?? '')} ${String(card?.['当前状态'] ?? '')}`;
                if (/睡觉|就寝|入睡|睡着|赖床|睡觉中|仍在睡/.test(sleepText) && !/午休|打盹|小憩|补觉|夜班|熬夜|守夜|病床|卧床/.test(sleepText)) {
                    console.warn(`[彼方] NPC「${npcName}」剧情已到 ${String(hour).padStart(2, '0')}:00 仍在过夜睡眠状态, 应按时间推进(起床/洗漱/做事等), 除非剧情明确其在补觉/值夜班/卧床`);
                }
            }
        }
        // 生理字段齐全性: 只对**本卡实际返回了任一生理字段**的卡要求齐全(增量更新下,
        // 未返回生理字段=沿用旧值+代码按剧情时间兜底推进, 属于合法行为, 不警告)
        const cardHasPhysio = PHYSIO_FIELDS.some(field => card?.[field] !== undefined && card?.[field] !== null && String(card?.[field] ?? '').trim() !== '');
        const missingPhysio = PHYSIO_FIELDS.filter(field => card?.[field] === undefined || card?.[field] === null || (typeof card?.[field] === 'string' && !card[field].trim()));
        if (cardHasPhysio && missingPhysio.length > 0) {
            console.warn(`[彼方] NPC「${npcName}」缺失生理字段: ${missingPhysio.join('、')}(保留旧值)`);
        }
        // 防全知字段: 孕期角色必须有「怀孕知晓」(NPC 本人是否知晓怀孕); 缺失时警告(mergeCard 会按孕周兜底补全)
        const isPregnantOut = String(card?.['是否怀孕'] ?? '') === 'true' || String(card?.['是否怀孕']) === '是' || String(card?.['生理周期'] ?? '').includes('孕期');
        if (isPregnantOut && (card?.['怀孕知晓'] === undefined || card?.['怀孕知晓'] === null || !String(card?.['怀孕知晓'] ?? '').trim())) {
            console.warn(`[彼方] NPC「${npcName}」孕期但缺「怀孕知晓」字段(将按孕周兜底补全)`);
        }
    };
    for (const { 名, 卡 } of 认出NPC(parsed)) {
        // 自动建档关闭: 即将被跳过(不建档)的新角色不按"新建 NPC 全字段"口径校验, 避免误警告
        if (skipCheckNames && skipCheckNames.has(名))
            continue;
        checkCard(名, 卡, !(existingCards ?? {})[名]);
    }
}
/**
 * 发请求并拿到"合要求的 JSON"; 不合格就原样重发, 最多 3 次都失败则抛最后一次的错。
 * 调用方负责: 把请求/响应写进日志页(记日志)、把"正在重试"显示给用户(报进度)。
 * 返回请求耗时与次数, 由调用方累加进它自己的计时(便于"本次更新总耗时"的拆分统计)。
 */
/** 依赖全部由调用方给: 发请求、写日志、报进度 —— 所以这一整套重试协议能脱离酒馆单独跑 */
type 请求参数 = {
    /** 基础消息(重试时原样重发这一份) */
    messages: any[];
    // 「预填充」已从彼方删除（2026-11-19 用户裁定）—— 用户改用段列表自己加 assistant 段。
    // 共用层的参数现在是可选的，彼方不传。
    /** 校验用: 已有的 NPC 卡(用来判断哪些名字算新角色) */
    现有卡: Record<string, any>;
    /** 校验用: 当前追踪的名单 */
    名单: string[];
    /** 校验用: 玩家自己的名字(不算新角色) */
    玩家名: string;
    /** 设置里的"自动建档"; 关掉时即将被跳过的新角色不按全字段校验 */
    自动建档: boolean;
    signal: AbortSignal;
    /** 真正发请求(线上是 api.ts 的 chatCompletion) */
    发请求: (messages: any[], options: { signal: AbortSignal }) => Promise<string>;
    /** 写日志页(线上是 debugStore.record) */
    记日志: (partial: any) => void;
    /** 报进度(线上是 updatingStore.message = 文字) */
    报进度: (文字: string) => void;
    /** 已发生的请求统计(成功/失败/中断都会通知): 失败日志靠它才不会写成 0 次 0 秒 */
    记录请求统计?: (统计: { 请求耗时: number; 请求次数: number }) => void;
};
/** 彼方这一侧要告诉共用模块的只有"怎么解析、怎么校验、文案叫什么";
 *  重试节奏这些三边一样的部分都在 共用/模型往返.ts 里。
 *
 *  ⚠ **彼方不传 `预填充`**（2026-11-19 用户裁定）：那个开关已从彼方删除。
 *    共用层的参数是可选，不传 = 不启用 —— 所以这里连字段都不用出现。 */
async function 请求并校验(params: 请求参数): Promise<{ parsed: any; 请求耗时: number; 请求次数: number }> {
    const { 现有卡, 名单, 玩家名, 自动建档 } = params;
    return await 共用请求并校验({
        messages: params.messages,
        signal: params.signal,
        发请求: params.发请求,
        记日志: params.记日志,
        报进度: params.报进度,
        记录请求统计: params.记录请求统计,
        解析: content => parseModelResponse(content),
        校验: (parsed) => {
            // 自动建档关闭: 构造将被跳过的新角色名单(未追踪且不在已有卡中), 校验时不按新建口径要求全字段
            let skipCheckNames: Set<string> | null = null;
            if (自动建档 === false) {
                skipCheckNames = new Set();
                for (const { 名 } of 认出NPC(parsed)) {
                    if (名 && 名 !== 玩家名 && !(名单.includes(名) || 现有卡[名]))
                        skipCheckNames.add(名);
                }
            }
            validateParsedFormat(parsed, 现有卡 ?? {}, skipCheckNames);
            return parsed;
        },
        名字: '彼方',
        结构失败标签: '更新失败',
        中断文案: '用户已中断本次更新',
        取重试理由: (error) => {
            const errMsg = error.message ?? '';
            return errMsg.includes('JSON') || errMsg.includes('解析')
                ? 'AI 返回的 JSON 不完整'
                : 'AI 返回格式不符合要求';
        },
    });
}
export { isReservedTopLevelKey, THINKING_FIELD_KEYS, 请求并校验 };
