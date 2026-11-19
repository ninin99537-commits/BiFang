// 条目内容本身的求值(ACU 模板 <if>、EJS、酒馆宏、助手变量宏、其余语法清理)不在这里 ——
// 那约 400 行与烟火同源, 已收进 共用/条目求值.ts(候选8)。本文件只剩**读哪几本世界书、
// 排除谁、常驻名单怎么并进来**这份彼方自己的策略, 以及彼方那份诊断措辞与"空表头不算命中"。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)。
// 原先这里还有一行从导出脚本还原出来的 vue 命名空间导入, 但本文件从头到尾没用过 vue
// (世界书求值都在 共用/条目求值.ts 里, 与 Vue 无关), 属于还原时多带的依赖, 已删掉。
import { isBifangEntry } from './彼方条目';
import type { 世界书条目形状 } from './彼方条目';
import type { Host } from './host';
import { 取EJS模板环境, 组装求值上下文, 收集表格名, 求值条目文本, 重置求值缓存, type 求值环境 } from '../共用/条目求值';
// 排除名单的判定与日志措辞: 与剧情导演/烟火同一份(共用/世界书排除.ts), 别再各写一份
import { 命中排除, 条目标签, 排除说明 } from '../共用/世界书排除';

/** 世界书读取需要的平台能力(宿主由调用方传入, 见 host.ts 顶部约定) */
type 世界书宿主 = Pick<Host, 'vars' | 'worldbook' | 'persona' | 'macros' | 'ejs' | 'acu'>;

/** 已确认"有正文"的条目: 过滤条件保证过 content 非空, 于是类型上把 content 收成 `string`,
 *  下游(拼文本、找 EJS、收集表名)不用再判空一次 —— 让类型跟着过滤条件走, 而不是靠人记。 */
type 有正文条目 = 世界书条目形状 & { content: string };

/** 判据就是各处本来就在写的那句 `entry && entry.enabled !== false && entry.content`,
 *  收成谓词后类型跟着条件走, 条目对象仍是原来那个(不复制、不改身份)。 */
function 有正文(entry: 世界书条目形状 | null | undefined): entry is 有正文条目 {
    return Boolean(entry && entry.enabled !== false && entry.content);
}

/** 「提示词模板语法」插件返回的 EJS 环境里, 彼方**只用这一个方法**。所以只声明它,
 *  不去描述整份环境 —— 那是插件的私有实现, 钉死类型会在插件升级时假报错。
 *  旧版插件根本没有这个方法, 所以返回值可空。 */
type 主AI激活函数 = (name: string, text: string) => Promise<世界书条目形状[] | null | undefined>;

/** 从插件给的 `unknown` 里取出那个方法; 拿不到就 null。
 *  判定就是原先各处都在写的那句 `typeof env.getWorldInfoActivatedData === 'function'`,
 *  提前到这一处之后, "有没有这个方法"与"调用它"就分开了 —— 判定过的分支里不必再写 `!`。 */
function 取主AI激活(env: unknown): 主AI激活函数 | null {
    // 只判"env 是真值"就取属性 —— 与原代码 `env && typeof env.getWorldInfoActivatedData === 'function'`
    // 的短路条件逐字一致(不额外要求 typeof env === 'object', 免得把"环境本身是函数"这种情形挡掉)。
    const 候选 = env ? (env as Record<string, unknown>).getWorldInfoActivatedData : undefined;
    return typeof 候选 === 'function' ? 候选 as 主AI激活函数 : null;
}

/** 共用求值器要的平台能力与文案: 能力全部从 host 接缝接上(那个 module 自己不碰平台)。
 * 彼方现行实现与烟火有两处措辞/判定不同, 照抄彼方现状:
 *   - 表未找到用全角括号、查值失败多一句"| 数据行数: 略";
 *   - EJS 环境初始化失败要记日志(烟火静默);
 *   - 空表头不参与表头模糊匹配(烟火会命中空表头那一列)。 */
function 彼方求值环境(host: 世界书宿主): 求值环境 {
    return {
        文案: {
            名字: '彼方',
            缺表: (缺失, 可用) => `[彼方] 世界书 <if cell:> 引用的表未找到: ${缺失}（可用表: ${可用 || '(无)'}）`,
            查值失败: (原因, 表名, 行名, 列名, 表头) => `[彼方] <if cell:> 查值失败(${原因}): ${表名}/${行名}/${列名}\n  该表实际表头: ${表头} | 数据行数: 略`,
            环境初始化失败: error => `[彼方] EjsTemplate(提示词模板语法插件)环境初始化失败, 世界书注入与 EJS 渲染将不可用: ${error instanceof Error ? error.message : String(error)}`,
        },
        取ACU表格: () => host.acu.tables(),
        准备EJS模板环境: () => host.ejs.prepareContext(),
        求值EJS: (text, env) => host.ejs.evaluate(text, env),
        EJS语法错误: text => host.ejs.syntaxError(text),
        展开酒馆宏: text => host.macros.expand(text),
        取助手变量: option => host.vars.get(option),
        空表头也算命中: false,
        // 批次 3-5: 不读也不写共用层的 30 秒缓存(ACU 表格 / EJS 环境)。
        // 彼方每一轮都必须看到"这一轮"的表: 切聊天/切分支/改表之后, 上轮缓存会让同一张表名
        // 读到另一份数据(两个聊天的楼层号还常常相同)。烟火的 reader 一直是这个口径。
        禁用缓存: true,
    };
}

/** 切聊天时重置缓存(表数据/模板环境随聊天不同, 两个聊天楼层号可能相同导致误用)。
 * 缓存本体在 共用/条目求值.ts 里, 这里保留原来的导出名 —— index.ts 还按这个名字调。 */
/** "一条世界书都没用上"只提醒一次(换聊天/重载后重置): 它通常不是每轮都会发生, 但放任不管会每次都刷屏 */
let 已提示过空世界书 = false;
function resetWorldbookCaches() {
    重置求值缓存();
    已提示过空世界书 = false;
}
/** 关键词命中(兜底激活用): 正则 key 直接 test; 字符串 key 按"包含"匹配(与主 AI 默认的大小写不敏感同口径) */
function 关键词命中(text: string, key: unknown) {
    if (key instanceof RegExp) {
        try {
            return key.test(text);
        }
        catch {
            return false;
        }
    }
    const 词 = String(key ?? '').trim();
    if (!词)
        return false;
    return text.toLowerCase().includes(词.toLowerCase());
}
/**
 * 内置激活(兜底): 「提示词模板语法」插件没装、或版本过旧没有 getWorldInfoActivatedData 时用。
 *
 * 只做"不静默全空"必需的那部分: 蓝灯(constant)全收 + 绿灯按关键词在扫描文本里匹配;
 * 向量化条目跳过(模拟不了向量检索); 概率/黏性/递归/预算/inclusion group 都不模拟 ——
 * 它们的效果只是"少给几条", 而兜底要解决的是"一条都给不出来"。
 * 条目形状是酒馆助手 getWorldbook 的那一套(strategy.type / strategy.keys)。
 */
async function 内置激活(host: 世界书宿主, name: string, scanText: string): Promise<世界书条目形状[]> {
    let entries: 世界书条目形状[];
    try {
        entries = (await host.worldbook.entries(name)) || [];
    }
    catch {
        // 这本书不存在 / 读失败: 当作没命中
        return [];
    }
    return entries.filter((entry) => {
        if (!entry || entry.enabled === false || !entry.content)
            return false;
        const 类型 = entry.strategy?.type;
        if (类型 === 'vectorized')
            return false;
        if (类型 === 'constant')
            return true;
        const keys = Array.isArray(entry.strategy?.keys) ? entry.strategy.keys : [];
        return keys.some(key => 关键词命中(scanText, key));
    });
}
/**
 * 本轮要读哪几本世界书(去重后的顺序): **角色卡绑定的** → 聊天世界书 → persona 绑定。
 *
 * 单聊的"角色卡绑定"就是当前卡(主 + 附加)。群聊不一样: 群聊里没有"当前角色卡"——
 * `this_chid` 在生成结束就被清空, 而 `getCharWorldbookNames('current')` 正是靠它找卡,
 * 于是返回空; 只问它的话, 群聊一本卡绑世界书都读不到(症状: 更新 AI 的提示词里没有世界书段,
 * 人设全靠瞎编)。所以群聊改成**按成员逐个取**(名单由宿主给, 见 host.groupMemberNames)。
 * 成员间重复绑同一本书时按书名去重, 不会重复激活。
 */
function 收集世界书来源(host: 世界书宿主): string[] {
    const names: string[] = [];
    const 加入 = (name?: string | null) => {
        const 书名 = String(name ?? '').trim();
        if (书名 && !names.includes(书名))
            names.push(书名);
    };
    const 成员 = host.worldbook.groupMemberNames();
    // 群聊: 每个成员各一本(或多本); 单聊: 当前卡那一份
    const 卡们 = 成员.length > 0 ? 成员.map((成员名: string) => host.worldbook.boundNamesOf(成员名)) : [];
    // 当前卡也补一次: 单聊时就是主角; 群聊里通常为空, 去重后不影响结果
    卡们.push(host.worldbook.boundNames());
    for (const 一本 of 卡们) {
        加入(一本.primary);
        (一本.additional ?? []).forEach(加入);
    }
    加入(host.worldbook.chatName());
    // persona 绑定的世界书: 主 AI 会加载它(主角设定等常写在这里), 彼方同样需要读取。
    // ⚠ 2026-11-19 P1：`persona.lorebook()` 在"没选人设"时可能抛错。
    //    这里是**收集来源**，不是必须项 —— 读不到就少一本，不该让整轮世界书读取失败。
    try {
        加入(host.persona.lorebook());
    }
    catch (error) {
        console.warn('[彼方] 读不到 persona 绑定的世界书(可能没选人设), 本轮跳过:', error);
    }
    return names;
}
/**
 * 收集当前聊天激活的世界书条目内容，**直接使用酒馆主 AI 的激活机制**（EjsTemplate 环境里的
 * getWorldInfoActivatedData，与主 AI 完全一致：蓝灯常驻、绿灯关键词匹配、概率等）。
 *
 * 只读取角色卡绑定的世界书（主 + 附加）与聊天世界书，**不含全局世界书**。
 * 群聊里"角色卡绑定的"指**全部成员的卡**（群聊没有当前角色卡, 见 收集世界书来源）。
 * 条目内的 ACU 模板语法会求值：<if> 条件按主 AI 规则用 ACU 表格数据求值，只保留命中分支；其余表达式/标签移除。
 *
 * @param scanText 扫描文本（最近回复等）
 * @param excludeNames 排除注入的条目名/关键词列表
 * @param alwaysIncludeNames 常驻注入的条目名/关键词列表(绕过关键词激活)
 */
async function getActiveWorldbookText(host: 世界书宿主, scanText: string, excludeNames: string[] = [], alwaysIncludeNames: string[] = []) {
    return (await 读取世界书段(host, scanText, excludeNames, alwaysIncludeNames)).文本;
}
/**
 * 与 `getActiveWorldbookText` 同一份实现, 但**把条数一起交出来**(批次 3-1 的规模行要用)。
 *
 * 为什么不在调用方数 `文本.split('\n\n')`: 条目正文里本来就可能有空行, 数出来的条数是错的;
 * "这一轮到底注入了几条"只有组装这一层知道。文本与条数因此必须出自同一次组装。
 */
async function 读取世界书段(host: 世界书宿主, scanText: string, excludeNames: string[] = [], alwaysIncludeNames: string[] = []): Promise<{ 文本: string; 条数: number }> {
    const 环境 = 彼方求值环境(host);
    // 排除名单: 条目名/comment 与排除项相等或包含即不注入(如填 "【彼方】NPC幕后生活" 排除该条目);
    // 名字在激活数据里可能不可靠(可能只在 comment), 故内容开头(如 "[彼方 · 幕后NPC状态]")也参与匹配
    const excludes = (excludeNames || []).map(s => String(s).trim()).filter(Boolean);
    const isExcluded = (entry: 世界书条目形状) => 命中排除(entry, excludes);
    // 常驻名单: 条目名/comment/key 相等或包含即命中, 每次都强制注入(绕过关键词激活)。
    // 角色人设条目一般按关键词触发——最新正文没提到该角色时就不会激活, 更新AI便读不到人设;
    // 常驻名单让这些人设条目始终可见。换角色卡后匹配不到则静默跳过(不报错、不警告)。
    const alwaysNames = (alwaysIncludeNames || []).map(s => String(s).trim()).filter(Boolean);
    // 注意条目字段有两种形状:
    // - getWorldbook() 返回: { name, enabled, strategy: { keys }, content }
    // - 主AI激活数据(getWorldInfoActivatedData)返回: { name/comment, disable, key, content }
    // 匹配时两种形状都要认, 否则按关键词匹配会失效。
    const isAlwaysIncluded = (entry: 世界书条目形状) => {
        if (alwaysNames.length === 0 || !entry)
            return false;
        const candidates: string[] = [];
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
    const contentFingerprint = (entry: 世界书条目形状 | null | undefined) => String(entry?.content ?? '').trim();
    const names = 收集世界书来源(host);
    if (names.length === 0) {
        console.info('[彼方] 本轮没有可读的世界书: 角色卡没绑定主/附加世界书, 也没有聊天世界书或 persona 世界书');
        return { 文本: '', 条数: 0 };
    }
    // 主 AI 的激活逻辑由「提示词模板语法」插件提供(getWorldInfoActivatedData), 同一个环境也用来渲染 EJS; 带 30 秒缓存。
    // 插件没装 / 版本过旧时这里拿不到那个函数 —— 以前是直接 return '' 跳过整个世界书, 用户只看到一句
    // "模板环境不可用"，然后就什么都没有了(Discord 上"群聊读不到世界书"的第二层原因就是它)。
    // 现在退回内置激活: 蓝灯常驻 + 绿灯关键词, 保证设定还读得到, 只是规则比主 AI 简化。
    const env = await 取EJS模板环境(环境);
    const 主AI激活 = 取主AI激活(env);
    if (!主AI激活) {
        console.warn('[彼方] 拿不到「提示词模板语法」插件的主 AI 激活逻辑(插件没装或版本过旧) —— '
            + '世界书改用内置激活(蓝灯常驻 + 关键词匹配); 把该插件更新到最新版即可恢复与主 AI 一致的激活规则');
    }
    /** 彼方自己写入的常驻条目: 不把自身输出当设定(判定见 彼方条目.ts —— 名字、备注、正文开头、标记四样都认) */
    // 兼容两种条目形状的启用字段: 激活数据用 disable, getWorldbook 用 enabled(不显式启用=false 的排除)
    // 用类型谓词而不是 `as`: 谓词就是过滤条件本身, 条件改了类型跟着改, 不会漂。
    const acceptsEntry = (entry: 世界书条目形状): entry is 有正文条目 => Boolean(entry && entry.disable !== true && entry.enabled !== false && entry.content && !isBifangEntry(entry) && !isExcluded(entry));
    // 1. 收集各世界书的激活条目（用酒馆主 AI 的激活机制）
    const activatedAll: Array<{ entry: 有正文条目 }> = [];
    /** 被「排除条目」名单挡掉的条目(静默排除是排查黑洞: 日志里得看得见它到底有没有生效) */
    const 排除挡掉: string[] = [];
    {
        const seen = new Set();
        for (const name of names) {
            if (seen.has(name))
                continue;
            seen.add(name);
            let activated: 世界书条目形状[];
            try {
                activated = 主AI激活
                    ? ((await 主AI激活(name, scanText)) || [])
                    : await 内置激活(host, name, scanText);
            }
            catch {
                continue;
            }
            for (const entry of activated) {
                if (isExcluded(entry)) {
                    排除挡掉.push(条目标签(entry));
                    continue;
                }
                if (acceptsEntry(entry))
                    activatedAll.push({ entry });
            }
        }
    }
    // 1.5 常驻条目: 直接按 条目名/comment/key 从绑定世界书里抓取(绕过关键词激活), 优先占用注入额度。
    // 角色人设条目通常按关键词触发——最新正文没提到该角色时就不会激活, 更新AI读不到人设;
    // 常驻名单保证这些人设条目每次都注入。换角色卡后匹配不到则静默跳过(不报错、不警告)。
    if (alwaysNames.length > 0) {
        const alwaysEntries: 有正文条目[] = [];
        const seenWorldbook = new Set<string>();
        for (const name of names) {
            if (seenWorldbook.has(name))
                continue;
            seenWorldbook.add(name);
            let entries: 世界书条目形状[];
            try {
                entries = (await host.worldbook.entries(name)) || [];
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
            const prioritized: Array<{ entry: 有正文条目 }> = [];
            const seenContent = new Set<string>();
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
    // 读过哪几本、最后能用几条 —— 群聊读不到世界书曾经就是"静默空串", 排查只能靠猜;
    // 现在每次更新打一行, "哪本没问到 / 哪本一条都没命中"直接看得见。
    const 来源 = `查询 ${names.length} 本(${names.join('、')})`;
    const 排除尾巴 = 排除挡掉.length > 0 ? `; ${排除说明(排除挡掉)}` : '';
    if (activatedAll.length === 0) {
        if (!已提示过空世界书) {
            已提示过空世界书 = true;
            console.warn(`[彼方] 世界书一条都没用上 —— ${来源}${排除尾巴}; `
                + '检查: 条目是否启用/关键词是否出现在最近正文里/是否被"注入世界书排除"或自身条目判定挡掉');
        }
    }
    else {
        console.info(`[彼方] 世界书用上 ${activatedAll.length} 条 —— ${来源}${排除尾巴}`);
    }
    // 2. 只查 <if cond="cell:..."> 用到的表，供条件求值
    const ctx = await 组装求值上下文(scanText, 收集表格名(activatedAll.map(a => a.entry.content)), 环境);
    // 3. 处理并组装条目内容（顺带提示哪些条目引用了不存在的表，方便去世界书里改错别字）
    // 不设内容/条数上限: 截断会让发给 AI 的世界书内容不完整(宁多勿缺)
    const loggedMissingTables = new Set<string>();
    const lines: string[] = [];
    for (const { entry } of activatedAll) {
        // 条目名兼容两种形状: 激活数据在 comment/key, getWorldbook 在 name(strategy.keys)
        const label = 条目标签(entry);
        for (const table of 收集表格名([entry.content])) {
            if (!ctx.sheets.some(s => s.name === table) && !loggedMissingTables.has(table)) {
                loggedMissingTables.add(table);
                console.warn(`[彼方] 世界书条目「${label}」引用了不存在的表: ${table}，请在世界书里改成正确的表名`);
            }
        }
        const needsEjs = entry.content.includes('<%');
        const text = await 求值条目文本(entry.content, ctx, needsEjs ? env : null, label);
        if (!text.trim())
            continue;
        lines.push(text);
    }
    return { 文本: lines.join('\n\n'), 条数: lines.length };
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
 * @param 已注入文本  本轮"世界书"段已经发出去的内容(可选): 同一条目若已在里面, 不再重复附到人设参考
 * @returns 渲染后的条目内容(已做 EJS/宏/<if> 求值), 多条目用 \n\n 拼接; 无命中返回空串
 */
async function getPersonaTextForNpc(host: 世界书宿主, npcName: unknown, alias: unknown = '', excludeNames: string[] = [], 已注入文本 = '') {
    const 环境 = 彼方求值环境(host);
    const name = String(npcName ?? '').trim();
    if (!name)
        return '';
    const aliases = [name];
    const trimmedAlias = String(alias ?? '').trim();
    if (trimmedAlias && trimmedAlias !== name)
        aliases.push(trimmedAlias);
    // 复用与 getActiveWorldbookText 一致的世界书收集范围: 角色卡绑定(群聊=全部成员)+聊天+persona
    const names = 收集世界书来源(host);
    if (names.length === 0)
        return '';
    // 排除名单: 与 getActiveWorldbookText 同口径(标题/备注含这些字, 或内容以它开头)
    const excludes = (excludeNames || []).map(s => String(s).trim()).filter(Boolean);
    const isExcluded = (entry: 世界书条目形状) => 命中排除(entry, excludes);
    /** 彼方自己写入的常驻条目: 排除(否则人设参考会包含上一轮的 NPC 状态卡, 造成自我反馈); 判定见 彼方条目.ts */
    /** 关键词匹配: 条目 keys 数组里是否有任意一个 key 等于/包含 NPC 名字(或曾用名)。
     *  只对字符串 key 做匹配; RegExp key 用 .test() 测试 NPC 名。 */
    const entryMatchesNpc = (entry: 世界书条目形状) => {
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
    const matched: 有正文条目[] = [];
    const seenWorldbook = new Set<string>();
    const seenContent = new Set<string>();
    for (const wbName of names) {
        if (seenWorldbook.has(wbName))
            continue;
        seenWorldbook.add(wbName);
        let entries: 世界书条目形状[];
        try {
            entries = (await host.worldbook.entries(wbName)) || [];
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!有正文(entry))
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
    const env = await 取EJS模板环境(环境);
    const ctx = await 组装求值上下文('', 收集表格名(matched.map(e => e.content)), 环境);
    const lines: string[] = [];
    for (const entry of matched) {
        const label = entry.name || entry.comment || '(未命名条目)';
        const needsEjs = entry.content.includes('<%');
        const text = await 求值条目文本(entry.content, ctx, needsEjs ? env : null, label);
        if (!text.trim())
            continue;
        // 同一条目往往已经被"世界书"段发过一次: 那条条目的关键词就是 NPC 名字, 而名字出现在最近正文里时
        // 主 AI 的激活规则本来就会命中它。再附一份到人设参考 = 同一段设定发两遍, 白占 token,
        // 还容易让模型当成两条独立信息(甚至以为有两个版本)。这里按渲染结果去重。
        if (已注入文本 && 已注入文本.includes(text.trim()))
            continue;
        lines.push(text);
    }
    return lines.join('\n\n');
}

export { getActiveWorldbookText, getPersonaTextForNpc, resetWorldbookCaches, 读取世界书段 };
