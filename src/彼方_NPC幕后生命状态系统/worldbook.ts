// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import { isBifangEntry } from './彼方条目';
import * as vue__WEBPACK_IMPORTED_MODULE_1__ from 'vue';
import { useHost } from './host';

/* harmony export */ 


/** 移除世界书条目里彼方无法求值的模板语法：{[...]} 表达式、<random/> 等标签、$v: 变量引用（不处理 <if>，<if> 由 evaluateTemplate 求值） */
function stripOtherSyntax(content) {
    if (!/\{\[|<(?:random|calc|max|min)\b|\$(?:v|random|calc|max|min):|<%/i.test(content))
        return content;
    let result = content;
    // {[ ... ]} 表达式块
    let out = '';
    let i = 0;
    while (i < result.length) {
        if (result[i] === '{' && result[i + 1] === '[') {
            let depth = 1;
            let inQuote = null;
            let j = i + 2;
            for (; j < result.length; j++) {
                const ch = result[j];
                if (inQuote) {
                    if (ch === inQuote)
                        inQuote = null;
                    continue;
                }
                if (ch === "'" || ch === '"') {
                    inQuote = ch;
                    continue;
                }
                if (ch === '[')
                    depth++;
                else if (ch === ']') {
                    depth--;
                    if (depth === 0)
                        break;
                }
            }
            j++;
            if (result[j] === '}')
                j++;
            i = j;
            continue;
        }
        out += result[i];
        i++;
    }
    result = out;
    // 自闭合值标签与变量引用
    result = result.replace(/<(?:random|calc|max|min)\b[^>]*\/?>/gi, '');
    result = result.replace(/\$(?:v|random|calc|max|min):[a-zA-Z_][a-zA-Z0-9_]*/g, '');
    // EJS 未渲染时的兜底：移除残留的 <% ... %> 模板块
    result = result.replace(/<%[\s\S]*?%>/g, '');
    // 兜底：移除残留的 elseif/else 标签（防不完整结构）
    result = result.replace(/<\/?(?:elseif|else)\b[^>]*>/gi, '');
    return result;
}
function getAcuApi() {
    try {
        return window.parent?.AutoCardUpdaterAPI ?? window.AutoCardUpdaterAPI;
    }
    catch {
        return undefined;
    }
}
/** ACU 表格快照缓存（按表名集合缓存，30 秒内复用） */
let sheetsCache = null;
const SHEETS_TTL = 30_000;
/** 切聊天时重置缓存(表数据/模板环境随聊天不同, 两个聊天楼层号可能相同导致误用) */
function resetWorldbookCaches() {
    sheetsCache = null;
    ejsContextCache = null;
}
/** 从世界书内容里收集 <if cell:表名/...> 用到的表名（只用到的表才查） */
function collectCellTables(contents) {
    const tables = new Set();
    for (const content of contents) {
        const re = /cell:\s*([^/\s]+)\s*\//gi;
        let m;
        while ((m = re.exec(content)) !== null) {
            if (m[1])
                tables.add(m[1]);
        }
    }
    return [...tables];
}
async function buildEvalContext(scanText, tableNames) {
    const key = [...tableNames].sort().join('|');
    if (sheetsCache && sheetsCache.key === key && Date.now() - sheetsCache.time < SHEETS_TTL) {
        return { scanText, sheets: sheetsCache.sheets };
    }
    const sheets = [];
    const api = getAcuApi();
    if (tableNames.length > 0) {
        // 用 exportTableAsJson（原生/SQLite 模式都可用、结构稳定），只保留用到的表
        let allNames = [];
        try {
            const all = api?.exportTableAsJson?.();
            if (all && typeof all === 'object') {
                const list = Object.values(all);
                allNames = list.filter((s) => s && typeof s.name === 'string').map((s) => s.name);
                for (const s of list) {
                    if (s && typeof s.name === 'string' && Array.isArray(s.content) && tableNames.includes(s.name)) {
                        sheets.push({ name: s.name, content: s.content });
                    }
                }
            }
        }
        catch {
            // ACU 未就绪或无表格时按空数据处理
        }
        if (sheets.length < tableNames.length) {
            const missing = tableNames.filter(n => !sheets.some(s => s.name === n));
            console.warn(`[彼方] 世界书 <if cell:> 引用的表未找到: ${missing.join('、')}（可用表: ${allNames.join('、') || '(无)'}）`);
        }
        sheetsCache = { key, time: Date.now(), sheets };
    }
    return { scanText, sheets };
}
function getCellValue(ctx, tableName, rowName, colName) {
    const sheet = ctx.sheets.find(s => s.name === tableName);
    if (!sheet || sheet.content.length === 0)
        return undefined;
    const headers = sheet.content[0];
    // 列：先精确匹配表头，再模糊匹配（表头包含列名，如"性别/年龄" 匹配 "年龄"）
    // 空表头/空列名不参与模糊匹配——否则 `''.includes(x)` 或 `x.includes('')` 恒为 true 导致误命中
    let colIdx = -1;
    if (colName) {
        colIdx = headers.indexOf(colName);
        if (colIdx === -1)
            colIdx = headers.findIndex(h => h && (h.includes(colName) || colName.includes(h)));
    }
    // 行：先精确（任意单元格等于行名），再模糊（任意单元格包含行名）
    let rowIdx = -1;
    for (let r = 1; r < sheet.content.length; r++) {
        const row = sheet.content[r];
        if (row && row.some(cell => cell !== null && cell !== undefined && String(cell) === String(rowName))) {
            rowIdx = r;
            break;
        }
    }
    if (rowIdx === -1) {
        for (let r = 1; r < sheet.content.length; r++) {
            const row = sheet.content[r];
            if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).includes(String(rowName)))) {
                rowIdx = r;
                break;
            }
        }
    }
    if (rowIdx === -1 && colName) {
        const swappedCol = headers.indexOf(rowName);
        const swappedRow = sheet.content.findIndex((row, r) => r > 0 && row && row.some(cell => String(cell) === String(colName)));
        if (swappedCol !== -1 && swappedRow !== -1) {
            rowIdx = swappedRow;
            colIdx = swappedCol;
        }
    }
    if (rowIdx === -1 || colIdx === -1) {
        logCellLookupFailure(sheet.name, headers, rowName, colName, rowIdx === -1, colIdx === -1);
        return undefined;
    }
    return sheet.content[rowIdx][colIdx];
}
/** 查值失败诊断：只对每个 表/行/列 组合记录一次，避免刷屏 */
const cellDebugSeen = new Set();
function logCellLookupFailure(sheetName, headers, rowName, colName, rowMissing, colMissing) {
    const key = `${sheetName}/${rowName}/${colName ?? ''}`;
    if (cellDebugSeen.has(key))
        return;
    cellDebugSeen.add(key);
    const reason = rowMissing && colMissing ? '行和列都没找到' : rowMissing ? '行未找到' : '列未找到';
    console.warn(`[彼方] <if cell:> 查值失败(${reason}): ${sheetName}/${rowName}/${colName ?? '(两段式)'}\n  该表实际表头: ${headers.join('、')} | 数据行数: 略`);
}
function compareValue(value, op, rawValue) {
    const aStr = String(value);
    // 数值比较：单元格值可能是 "女/19" 这种复合串，先尝试整体转数字，失败则提取第一个数字
    let aNum = typeof value === 'number' ? value : parseFloat(aStr);
    if (!Number.isFinite(aNum)) {
        const m = aStr.match(/-?\d+(\.\d+)?/);
        if (m)
            aNum = parseFloat(m[0]);
    }
    const bNum = parseFloat(rawValue);
    const numeric = Number.isFinite(aNum) && Number.isFinite(bNum);
    const x = numeric ? aNum : aStr;
    const y = numeric ? bNum : rawValue;
    switch (op) {
        case '>=': return x >= y;
        case '<=': return x <= y;
        case '>': return x > y;
        case '<': return x < y;
        case '!=': return x !== y;
        case '=':
        case '==': return x === y;
        default: return false;
    }
}
function evaluateCellExpr(expr, ctx) {
    const norm = expr
        .replace(/＞/g, '>')
        .replace(/＜/g, '<')
        .replace(/＝/g, '==')
        .replace(/≥/g, '>=')
        .replace(/≤/g, '<=')
        .replace(/≦/g, '<=')
        .replace(/≠/g, '!=');
    const m = norm.match(/^(.+?)\s*(>=|<=|==|!=|=|>|<)\s*(.+)$/);
    if (!m)
        return null;
    const cellRef = m[1].trim();
    const parts = cellRef.split('/').map(s => s.trim());
    if (parts.length < 2)
        return null;
    const value = getCellValue(ctx, parts[0], parts[1], parts.length >= 3 ? parts[2] : undefined);
    if (value === undefined || value === null)
        return null;
    return compareValue(value, m[2], m[3].trim());
}
/** seed 关键词匹配（支持 A,B=OR / A&B=AND / !k 取反 / 括号分组） */
function evaluateSeedExpr(expr, ctx) {
    const text = (ctx.scanText || '').toLowerCase();
    const groups = expr.split(',').map(g => g.trim()).filter(Boolean);
    if (groups.length === 0)
        return null;
    return groups.some(group => {
        const parts = group.split('&').map(p => p.trim()).filter(Boolean);
        return parts.every(p => {
            const neg = p.startsWith('!');
            const kw = (neg ? p.slice(1) : p).replace(/^\(|\)$/g, '').toLowerCase();
            const hit = kw.length > 0 && text.includes(kw);
            return neg ? !hit : hit;
        });
    });
}
function evaluateLeaf(leaf, ctx) {
    const m = leaf.match(/^(cell|seed|db|sql|v):([\s\S]*)$/i);
    if (!m)
        return null;
    const type = m[1].toLowerCase();
    const arg = m[2].trim();
    if (type === 'cell')
        return evaluateCellExpr(arg, ctx);
    if (type === 'seed')
        return evaluateSeedExpr(arg, ctx);
    return null; // db/sql/v 依赖 SQLite 运行时，彼方不模拟
}
/** cond 表达式递归下降求值：OR(,) -> AND(&) -> NOT(!) -> primary(() | 叶子) */
function evalCond(expr, ctx) {
    let pos = 0;
    const skipWs = () => {
        while (pos < expr.length && /\s/.test(expr[pos]))
            pos++;
    };
    function parseOr() {
        let value = parseAnd();
        for (;;) {
            skipWs();
            if (expr[pos] === ',') {
                pos++;
                const v = parseAnd();
                value = value === null || v === null ? null : value || v;
            }
            else
                break;
        }
        return value;
    }
    function parseAnd() {
        let value = parseNot();
        for (;;) {
            skipWs();
            if (expr[pos] === '&') {
                pos++;
                const v = parseNot();
                value = value === null || v === null ? null : value && v;
            }
            else
                break;
        }
        return value;
    }
    function parseNot() {
        skipWs();
        if (expr[pos] === '!') {
            pos++;
            const v = parseNot();
            return v === null ? null : !v;
        }
        return parsePrimary();
    }
    function parsePrimary() {
        skipWs();
        if (pos >= expr.length)
            return null;
        if (expr[pos] === '(') {
            pos++;
            const v = parseOr();
            skipWs();
            if (expr[pos] === ')')
                pos++;
            return v;
        }
        const rest = expr.slice(pos);
        const pm = rest.match(/^(cell|seed|db|sql|v):/i);
        if (pm) {
            const type = pm[0].slice(0, -1).toLowerCase();
            const afterPrefix = rest.slice(pm[0].length);
            if (type === 'sql') {
                const qm = afterPrefix.match(/^"([\s\S]*?)"/);
                if (!qm)
                    return null;
                pos += pm[0].length + qm[0].length;
                return evaluateLeaf('sql:' + qm[1], ctx);
            }
            const lm = afterPrefix.match(/^[^&!,()]+/);
            if (!lm)
                return null;
            pos += pm[0].length + lm[0].length;
            return evaluateLeaf(pm[0] + lm[0], ctx);
        }
        const lm = rest.match(/^[^&!,()]+/);
        if (!lm)
            return null;
        pos += lm[0].length;
        return evaluateLeaf('seed:' + lm[0], ctx);
    }
    const result = parseOr();
    skipWs();
    return pos >= expr.length ? result : null;
}
function evaluateCondition(type, expr, ctx) {
    const t = (type || '').toLowerCase();
    if (t === 'cond')
        return evalCond(expr, ctx);
    if (t === 'cell')
        return evaluateCellExpr(expr, ctx);
    if (t === 'seed')
        return evaluateSeedExpr(expr, ctx);
    return null; // db/sql 无法求值
}
/** 递归求值 <if>...</if>（含 <else>、支持嵌套），返回选中的分支内容 */
function evaluateTemplate(content, ctx) {
    let result = '';
    let i = 0;
    while (i < content.length) {
        const openIdx = content.indexOf('<if', i);
        if (openIdx === -1) {
            result += content.slice(i);
            break;
        }
        result += content.slice(i, openIdx);
        const tagMatch = content.slice(openIdx).match(/^<if\s+([a-zA-Z]+)\s*=\s*"([^"]*)"\s*>/i);
        if (!tagMatch) {
            result += '<if';
            i = openIdx + 3;
            continue;
        }
        const type = tagMatch[1];
        const expr = tagMatch[2];
        const tagEnd = openIdx + tagMatch[0].length - 1;
        const close = findMatchingClose(content, tagEnd + 1);
        if (!close) {
            result += content.slice(openIdx);
            break;
        }
        const block = content.slice(tagEnd + 1, close);
        const elseIdx = findTopLevelElse(block);
        const ifContent = elseIdx === -1 ? block : block.slice(0, elseIdx);
        const elseContent = elseIdx === -1 ? '' : block.slice(elseIdx).replace(/^<else\b[^>]*>/i, '');
        const cond = evaluateCondition(type, expr, ctx);
        const branch = cond === false ? elseContent : ifContent; // 无法求值时保守保留主分支
        result += evaluateTemplate(branch, ctx);
        i = close + '</if>'.length;
    }
    return result;
}
function findMatchingClose(content, start) {
    const re = /<\/?if\b/g;
    re.lastIndex = start;
    let depth = 1; // 已计入外层 <if>
    let m;
    while ((m = re.exec(content)) !== null) {
        if (m[0][1] === '/') {
            depth--;
            if (depth === 0)
                return m.index;
        }
        else {
            depth++;
        }
    }
    return null;
}
function findTopLevelElse(block) {
    const re = /<\/?if\b|<else\b/g;
    let depth = 0;
    let m;
    while ((m = re.exec(block)) !== null) {
        if (m[0].startsWith('</')) {
            depth--;
        }
        else if (m[0].startsWith('<if')) {
            depth++;
        }
        else if (m[0].startsWith('<else') && depth === 0) {
            return m.index;
        }
    }
    return -1;
}
/** EJS 模板环境缓存（prepareContext 会合并全部消息楼层变量，成本不低；30 秒内复用） */
let ejsContextCache = null;
const EJS_CONTEXT_TTL = 30_000;
async function getEjsContext() {
    if (ejsContextCache && Date.now() - ejsContextCache.time < EJS_CONTEXT_TTL)
        return ejsContextCache.env;
    let env = null;
    try {
        env = await useHost().ejs.prepareContext();
    }
    catch (error) {
        console.warn(`[彼方] EjsTemplate(提示词模板语法插件)环境初始化失败, 世界书注入与 EJS 渲染将不可用: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (env !== null)
        ejsContextCache = { time: Date.now(), env };
    return env;
}
/**
 * 收集当前聊天激活的世界书条目内容，**直接使用酒馆主 AI 的激活机制**（EjsTemplate 环境里的
 * getWorldInfoActivatedData，与主 AI 完全一致：蓝灯常驻、绿灯关键词匹配、概率等）。
 *
 * 只读取角色卡绑定的世界书（主 + 附加）与聊天世界书，**不含全局世界书**。
 * 条目内的 ACU 模板语法会求值：<if> 条件按主 AI 规则用 ACU 表格数据求值，只保留命中分支；其余表达式/标签移除。
 *
 * @param scanText 扫描文本（最近回复等）
 * @param excludeNames 排除注入的条目名/关键词列表
 * @param alwaysIncludeNames 常驻注入的条目名/关键词列表(绕过关键词激活)
 */
async function getActiveWorldbookText(scanText, excludeNames = [], alwaysIncludeNames = []) {
    // 排除名单: 条目名/comment 与排除项相等或包含即不注入(如填 "【彼方】NPC幕后生活" 排除该条目);
    // 名字在激活数据里可能不可靠(可能只在 comment), 故内容开头(如 "[彼方 · 幕后NPC状态]")也参与匹配
    const excludes = (excludeNames || []).map(s => String(s).trim()).filter(Boolean);
    const isExcluded = (entry) => {
        if (excludes.length === 0 || !entry)
            return false;
        const name = String(entry.name ?? '').trim();
        const comment = String(entry.comment ?? '').trim();
        const content = String(entry.content ?? '').trim();
        return excludes.some(item => {
            if (!item)
                return false;
            return name === item || comment === item
                || (name && name.includes(item)) || (comment && comment.includes(item))
                || (content && content.startsWith(item));
        });
    };
    // 常驻名单: 条目名/comment/key 相等或包含即命中, 每次都强制注入(绕过关键词激活)。
    // 角色人设条目一般按关键词触发——最新正文没提到该角色时就不会激活, 更新AI便读不到人设;
    // 常驻名单让这些人设条目始终可见。换角色卡后匹配不到则静默跳过(不报错、不警告)。
    const alwaysNames = (alwaysIncludeNames || []).map(s => String(s).trim()).filter(Boolean);
    // 注意条目字段有两种形状:
    // - getWorldbook() 返回: { name, enabled, strategy: { keys }, content }
    // - 主AI激活数据(getWorldInfoActivatedData)返回: { name/comment, disable, key, content }
    // 匹配时两种形状都要认, 否则按关键词匹配会失效。
    const isAlwaysIncluded = (entry) => {
        if (alwaysNames.length === 0 || !entry)
            return false;
        const candidates = [];
        for (const value of [entry.name, entry.comment, entry.key, entry.strategy?.keys]) {
            if (Array.isArray(value))
                candidates.push(...value.map(item => String(item)));
            else if (value !== undefined && value !== null)
                candidates.push(String(value));
        }
        return alwaysNames.some(item => item
            && candidates.some(text => text.trim() === item || (text && text.includes(item))));
    };
    /** 内容指纹: 用于激活条目与常驻条目去重(同一内容只注入一次); 用完整内容, 避免"开头120字相同"的两条被误合并 */
    const contentFingerprint = (entry) => String(entry?.content ?? '').trim();
    const names = [];
    // 没打开角色卡 / 没有聊天世界书时都是空(宿主折成空, 见 host.ts)
    const charWorldbooks = useHost().worldbook.boundNames();
    if (charWorldbooks.primary)
        names.push(charWorldbooks.primary);
    charWorldbooks.additional.forEach(name => names.push(name));
    const chatWorldbook = useHost().worldbook.chatName();
    if (chatWorldbook)
        names.push(chatWorldbook);
    // persona 绑定的世界书: 主 AI 会加载它(主角设定等常写在这里), 彼方同样需要读取
    const personaLorebook = useHost().persona.lorebook().trim();
    if (personaLorebook)
        names.push(personaLorebook);
    if (names.length === 0)
        return '';
    // EJS 模板环境提供 getWorldInfoActivatedData（主 AI 的世界书激活逻辑），同时复用于 EJS 渲染；带 30 秒缓存
    const env = await getEjsContext();
    if (!env || typeof env.getWorldInfoActivatedData !== 'function') {
        console.warn('[彼方] 模板环境不可用，跳过世界书注入');
        return '';
    }
    /** 彼方自己写入的常驻条目: 不把自身输出当设定(判定见 彼方条目.ts —— 名字、备注、正文开头、标记四样都认) */
    // 兼容两种条目形状的启用字段: 激活数据用 disable, getWorldbook 用 enabled(不显式启用=false 的排除)
    const acceptsEntry = (entry) => Boolean(entry && entry.disable !== true && entry.enabled !== false && entry.content && !isBifangEntry(entry) && !isExcluded(entry));
    // 1. 收集各世界书的激活条目（用酒馆主 AI 的激活机制）
    const activatedAll = [];
    {
        const seen = new Set();
        for (const name of names) {
            if (seen.has(name))
                continue;
            seen.add(name);
            let activated;
            try {
                activated = (await env.getWorldInfoActivatedData(name, scanText)) || [];
            }
            catch {
                continue;
            }
            for (const entry of activated) {
                if (acceptsEntry(entry))
                    activatedAll.push({ entry });
            }
        }
    }
    // 1.5 常驻条目: 直接按 条目名/comment/key 从绑定世界书里抓取(绕过关键词激活), 优先占用注入额度。
    // 角色人设条目通常按关键词触发——最新正文没提到该角色时就不会激活, 更新AI读不到人设;
    // 常驻名单保证这些人设条目每次都注入。换角色卡后匹配不到则静默跳过(不报错、不警告)。
    if (alwaysNames.length > 0) {
        const alwaysEntries = [];
        const seenWorldbook = new Set();
        for (const name of names) {
            if (seenWorldbook.has(name))
                continue;
            seenWorldbook.add(name);
            let entries;
            try {
                entries = (await useHost().worldbook.entries(name)) || [];
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                if (isAlwaysIncluded(entry) && acceptsEntry(entry))
                    alwaysEntries.push(entry);
            }
        }
        if (alwaysEntries.length > 0) {
            const prioritized = [];
            const seenContent = new Set();
            for (const entry of alwaysEntries) {
                const fingerprint = contentFingerprint(entry);
                if (fingerprint && seenContent.has(fingerprint))
                    continue;
                if (fingerprint)
                    seenContent.add(fingerprint);
                prioritized.push({ entry });
            }
            // 激活条目里与常驻内容重复的去重, 其余保持在常驻条目之后
            const rest = activatedAll.filter(item => !seenContent.has(contentFingerprint(item.entry)));
            activatedAll.length = 0;
            activatedAll.push(...prioritized, ...rest);
        }
    }
    // 2. 只查 <if cell:> 用到的表，供条件求值
    const ctx = await buildEvalContext(scanText, collectCellTables(activatedAll.map(a => a.entry.content)));
    // 3. 处理并组装条目内容（顺带提示哪些条目引用了不存在的表，方便去世界书里改错别字）
    // 不设内容/条数上限: 截断会让发给 AI 的世界书内容不完整(宁多勿缺)
    const loggedMissingTables = new Set();
    const lines = [];
    for (const { entry } of activatedAll) {
        // 条目名兼容两种形状: 激活数据在 comment/key, getWorldbook 在 name(strategy.keys)
        const label = (typeof entry.comment === 'string' && entry.comment)
            || (typeof entry.name === 'string' && entry.name)
            || (entry.key ? (Array.isArray(entry.key) ? entry.key.join('、') : String(entry.key)) : '')
            || '(未命名条目)';
        for (const table of collectCellTables([entry.content])) {
            if (!ctx.sheets.some(s => s.name === table) && !loggedMissingTables.has(table)) {
                loggedMissingTables.add(table);
                console.warn(`[彼方] 世界书条目「${label}」引用了不存在的表: ${table}，请在世界书里改成正确的表名`);
            }
        }
        const needsEjs = entry.content.includes('<%');
        const text = await processEntryContent(entry.content, ctx, needsEjs ? env : null, label);
        if (!text.trim())
            continue;
        lines.push(text);
    }
    return lines.join('\n\n');
}
/**
 * 展开酒馆助手扩展变量宏({{get_message_variable::路径}} / {{get_chat_variable::路径}} /
 * {{get_global_variable::路径}} / {{get_preset_variable::路径}} / {{get_character_variable::路径}} /
 * {{format_message_variable::路径}}):
 * `substitudeMacros` 只是酒馆本体 substituteParamsExtended 的包装, 不认识这些助手宏,
 * 不展开的话会原样发给更新 AI(主 AI 侧由酒馆助手的生成管线展开, 彼方需自行处理)。
 */
function expandHelperMacros(text, label = '(未命名条目)') {
    const macroRe = /\{\{(get_message_variable|format_message_variable|get_chat_variable|get_global_variable|get_preset_variable|get_character_variable)::([^{}]+)\}\}/gi;
    if (!macroRe.test(text))
        return text;
    const kindOf = {
        get_message_variable: { type: 'message', message_id: 'latest' },
        format_message_variable: { type: 'message', message_id: 'latest' },
        get_chat_variable: { type: 'chat' },
        get_global_variable: { type: 'global' },
        get_preset_variable: { type: 'preset' },
        get_character_variable: { type: 'character' },
    };
    const sources = {};
    const missing = [];
    const result = text.replace(macroRe, (match, macroName, rawPath) => {
        const path = String(rawPath).trim();
        const key = macroName.toLowerCase();
        if (!(key in sources)) {
            try {
                sources[key] = useHost().vars.get(kindOf[key]) ?? {};
            }
            catch (error) {
                console.warn(`[彼方] 世界书条目「${label}」读取${macroName}的变量失败: ${error instanceof Error ? error.message : String(error)}`);
                sources[key] = {};
            }
        }
        const value = _.get(sources[key], path);
        if (value === undefined || value === null) {
            missing.push(`${macroName}::${path}`);
            return '';
        }
        if (typeof value === 'string')
            return value;
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    });
    if (missing.length > 0)
        console.warn(`[彼方] 世界书条目「${label}」以下助手变量宏没有取到值(已替换为空): ${[...new Set(missing)].join('、')}`);
    return result;
}
/**
 * 处理一条世界书内容，按主 AI 的顺序：
 * 1. <if> 条件求值（选命中分支）
 * 2. EJS 模板渲染（<% %>，环境与主 AI 相同，MVU 变量等可直接使用）
 * 3. 酒馆宏替换 + 酒馆助手扩展变量宏展开
 * 4. 移除其余无法求值的模板语法
 * 所有失败都会输出日志(不再静默吞掉), 方便从日志页排查条目模板问题。
 */
async function processEntryContent(content, ctx, ejsEnv, label = '(未命名条目)') {
    let text = evaluateTemplate(content, ctx);
    if (ejsEnv && text.includes('<%')) {
        try {
            // 插件两种方法拼写的兼容处理收在宿主里(见 host.ts 的 HostEjs)
            const rendered = await useHost().ejs.evaluate(text, ejsEnv);
            if (rendered === null) {
                console.warn(`[彼方] 世界书条目「${label}」含 EJS 模板, 但 EjsTemplate.evalTemplate 不可用(请检查提示词模板语法插件版本), 模板块将被移除`);
            }
            else {
                text = rendered;
            }
        }
        catch (error) {
            // 不再静默: 附带语法诊断, 方便排查条目里的模板错误
            let syntax = '';
            try {
                syntax = await useHost().ejs.syntaxError(text);
            }
            catch {
                // 诊断失败不影响主日志
            }
            console.warn(`[彼方] 世界书条目「${label}」EJS 渲染失败(模板块将被移除): ${error instanceof Error ? error.message : String(error)}${syntax ? `\n语法诊断: ${syntax}` : ''}`);
        }
    }
    if (text.includes('{{')) {
        try {
            text = useHost().macros.expand(text);
        }
        catch (error) {
            console.warn(`[彼方] 世界书条目「${label}」酒馆宏替换失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    text = expandHelperMacros(text, label);
    if (/<%[\s\S]*?%>/.test(text))
        console.warn(`[彼方] 世界书条目「${label}」仍残留未渲染的 EJS 模板块(通常为渲染失败或语法错误, 见上方日志), 已移除`);
    return stripOtherSyntax(text);
}

/**
 * 按 NPC 名字收集其专属的绿灯(关键词触发)条目, 用于"人设参考"注入。
 *
 * 与 getActiveWorldbookText 的区别:
 * - 后者走主 AI 激活机制, **蓝灯常驻条目无条件下发**——给所有 NPC 的都是同一份"基础世界观+蓝灯集合",
 *   人设条目(绿灯)只有正文提到该 NPC 时才激活, 失去"按 NPC 区分人设"的意义;
 * - 本函数**跳过蓝灯(vectorized/constant)**, 只收集绿灯条目中 `keys` 数组里**显式包含该 NPC 名字(或曾用名)** 的条目,
 *   保证每张 NPC 卡附的"人设参考"真的是它自己的人设, 不是基础世界观。
 *
 * @param npcName  NPC 当前名字(状态卡的键名)
 * @param alias    NPC 曾用名(可选, 改名前的旧名, 同样会参与匹配)
 * @param excludeNames 用户配置的"注入世界书排除"名单
 * @returns 渲染后的条目内容(已做 EJS/宏/<if> 求值), 多条目用 \n\n 拼接; 无命中返回空串
 */
async function getPersonaTextForNpc(npcName, alias = '', excludeNames = []) {
    const name = String(npcName ?? '').trim();
    if (!name)
        return '';
    const aliases = [name];
    const trimmedAlias = String(alias ?? '').trim();
    if (trimmedAlias && trimmedAlias !== name)
        aliases.push(trimmedAlias);
    // 复用与 getActiveWorldbookText 一致的世界书收集范围: 角色主+附加+聊天+persona 绑定
    const names = [];
    // 没打开角色卡 / 没有聊天世界书时都是空(宿主折成空, 见 host.ts)
    const charWorldbooks = useHost().worldbook.boundNames();
    if (charWorldbooks.primary)
        names.push(charWorldbooks.primary);
    charWorldbooks.additional.forEach(n => names.push(n));
    const chatWorldbook = useHost().worldbook.chatName();
    if (chatWorldbook)
        names.push(chatWorldbook);
    const personaLorebook = useHost().persona.lorebook().trim();
    if (personaLorebook)
        names.push(personaLorebook);
    if (names.length === 0)
        return '';
    // 排除名单: 与 getActiveWorldbookText 同口径(条目名/comment/内容开头)
    const excludes = (excludeNames || []).map(s => String(s).trim()).filter(Boolean);
    const isExcluded = (entry) => {
        if (excludes.length === 0 || !entry)
            return false;
        const entryName = String(entry.name ?? '').trim();
        const comment = String(entry.comment ?? '').trim();
        const content = String(entry.content ?? '').trim();
        return excludes.some(item => item
            && (entryName === item || comment === item
                || (entryName && entryName.includes(item)) || (comment && comment.includes(item))
                || (content && content.startsWith(item))));
    };
    /** 彼方自己写入的常驻条目: 排除(否则人设参考会包含上一轮的 NPC 状态卡, 造成自我反馈); 判定见 彼方条目.ts */
    /** 关键词匹配: 条目 keys 数组里是否有任意一个 key 等于/包含 NPC 名字(或曾用名)。
     *  只对字符串 key 做匹配; RegExp key 用 .test() 测试 NPC 名。 */
    const entryMatchesNpc = (entry) => {
        if (!entry)
            return false;
        // 只认绿灯(selective)条目——蓝灯(constant)/向量化(vectorized)条目与 NPC 名字无关, 跳过
        // 注意: 兼容旧数据没有 strategy 字段的情况——按"有 keys 数组"兜底视作绿灯
        const strategyType = entry.strategy?.type;
        if (strategyType === 'constant' || strategyType === 'vectorized')
            return false;
        const keys = entry.strategy?.keys;
        if (!Array.isArray(keys) || keys.length === 0)
            return false;
        for (const key of keys) {
            for (const aliasName of aliases) {
                if (typeof key === 'string') {
                    const trimmedKey = key.trim();
                    if (trimmedKey && (trimmedKey === aliasName || trimmedKey.includes(aliasName) || aliasName.includes(trimmedKey)))
                        return true;
                }
                else if (key instanceof RegExp) {
                    try {
                        if (key.test(aliasName))
                            return true;
                    }
                    catch {
                        // 正则坏掉时跳过
                    }
                }
            }
        }
        return false;
    };
    // 收集所有命中条目
    const matched = [];
    const seenWorldbook = new Set();
    const seenContent = new Set();
    for (const wbName of names) {
        if (seenWorldbook.has(wbName))
            continue;
        seenWorldbook.add(wbName);
        let entries;
        try {
            entries = (await useHost().worldbook.entries(wbName)) || [];
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry || entry.enabled === false || !entry.content)
                continue;
            if (isBifangEntry(entry) || isExcluded(entry))
                continue;
            if (!entryMatchesNpc(entry))
                continue;
            const fingerprint = String(entry.content ?? '').trim();
            if (fingerprint && seenContent.has(fingerprint))
                continue;
            if (fingerprint)
                seenContent.add(fingerprint);
            matched.push(entry);
        }
    }
    if (matched.length === 0)
        return '';
    // EJS 环境: 与主激活一致(失败时仍能渲染基础内容)
    const env = await getEjsContext();
    const ctx = await buildEvalContext('', collectCellTables(matched.map(e => e.content)));
    const lines = [];
    for (const entry of matched) {
        const label = entry.name || entry.comment || '(未命名条目)';
        const needsEjs = String(entry.content).includes('<%');
        const text = await processEntryContent(String(entry.content), ctx, needsEjs ? env : null, label);
        if (text.trim())
            lines.push(text);
    }
    return lines.join('\n\n');
}

export { getActiveWorldbookText, getPersonaTextForNpc, resetWorldbookCaches };
