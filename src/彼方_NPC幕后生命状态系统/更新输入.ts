// 本轮"取料 + 组装提示词"(候选2 第四块)。
// 从最近几条 AI 回复里取出正文/上下文/当前卡/人设, 汇成发给模型的消息数组。
// 读聊天记录的小工具在 聊天取料.ts, 这里直接用。
// 前置条件不满足时(如没有可用的 AI 回复)返回 null: 提示已经发过, 调用方直接收工。

// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { buildUpdateMessages } from './prompts';
import { 名字出现, 上下文, 最近回复, 正文过滤, 时间提示, 时间跳跃, 追踪NPC } from './聊天取料';
import { 剧情跨度 } from './剧情时间';
import { getPersonaTextForNpc, 读取世界书段 } from './worldbook';
import { 压缩记忆回溯 } from './记忆回溯';
import { 生活状态待更新 } from './生活状态';
import { loadData, updateClearLayer, 读取快照序列, 读取基线 } from './快照';
import { 生成近期轨迹, 轨迹上限 } from './轨迹';
import { toastWarning } from './toast';
import { 确保周期长度 } from './生理规则';
import { 读取台账 } from './事务台账';
import { 字段分组表 } from './卡字段';
import { 计算规模 } from './规模';

type 取料参数 = { host: any; settings: any; force: any; timing: any; debugStore: any };
export async function 收集本轮输入(参数: 取料参数) {
    const { host, settings, force, timing, debugStore } = 参数;

    let data = loadData(host);
    // 获取玩家/主角名, 避免给主角建档; 顺带清理历史误建的主角卡
    const playerName = host.persona.name();
    // 主角信息(persona 描述): 主 AI 能看到 persona, 彼方此前没有读取通道——
    // 主角设定不写在世界书里时, 更新 AI 完全不知道主角是谁, 这里补齐。
    // 零截断原则: 全量发送, 不在发送时砍内容(规模控制只做在源头的读取范围/账本容量)。
    const playerDescription = host.persona.description().trim();
    const recentCount = Math.max(1, settings.更新.读取最近回复数 ?? 3);
    let clearLayer = data.清空层 ?? 0;
    // 清空层自适应: 清空后楼层被删到清空层以下时, 现有楼层号永远追不上清空层,
    // 自动更新会被静默卡死。此时把清空层自动挪到最新楼层(等价于"从没更新过",
    // 之后的新楼层照常分析), 与 v1.10 的行为一致。
    if (!force && clearLayer > 0) {
        let lastId = -1;
        try {
            lastId = host.chat.lastMessageId();
        }
        catch {
            // 取不到楼层就保持上面的 -1(不参与清空层下移)
        }
        if (lastId >= 0 && clearLayer > lastId) {
            const oldClearLayer = clearLayer;
            clearLayer = lastId;
            data.清空层 = clearLayer;
            try {
                updateClearLayer(host, clearLayer);
                console.warn(`[彼方] 清空层 #${oldClearLayer} 高于当前最新楼层 #${lastId}, 已自动下移到 #${lastId}(之后的新楼层照常分析)`);
            }
            catch (error) {
                console.warn('[彼方] 清空层下移失败(不影响本次更新):', error);
            }
        }
    }
    // 自动更新只分析清空之后的楼层；手动更新(force)强制分析最近 N 条
    let recent = 最近回复(host, recentCount);
    if (!force)
        recent = recent.filter((message: any) => message.message_id > clearLayer);
    // 慢一步: 自动更新只分析到**倒数第二层** —— 最新那条 AI 回复不进分析。
    // 放在清空层过滤之后: 先确定"这一轮本来要分析哪几条", 再去掉最后一条。
    // 手动更新(force)不受影响: 用户点了「更新」就是"现在要", 最新层必须算进去。
    // recent 去掉末位后, update.ts 里"锚点 = recent 末位的 message_id"自动落到 N−1,
    // 所以锚点写法一个字都不用改(这是选这个方案的原因)。
    if (!force && settings.更新.慢一步)
        recent = recent.slice(0, -1);
    // 同层重跑 = 像没填过(方案 §23 W3): 锚点这一层上已经有一份状态(上一次在同一层算的),
    // 读到的正是它 —— 它的错名字、它的幻觉会原样回到提示词里。所以这里回退到更早的基线。
    // 判据与顺序都依赖上面算好的 recent, 所以只能放在这里(不能在开头 loadData 处)。
    // 手动保存的快照也一起回退(用户裁定「既然重跑, 那这一层手动改的作废就作废呗」)。
    if (recent.length > 0) {
        const 本轮锚点 = recent[recent.length - 1].message_id;
        if (data.锚点楼层 >= 本轮锚点) {
            data = 读取基线(host, 本轮锚点);
            clearLayer = data.清空层 ?? clearLayer;
        }
    }
    if (playerName && data.NPC[playerName]) {
        delete data.NPC[playerName];
        data.名单 = data.名单.filter(name => name !== playerName);
    }
    // 手动更新不再撤销当前快照(旧行为"先回退再重填"会把本轮自动更新积累的其他 NPC
    // 一起退回旧快照, 频繁手动更新时表现为角色/更新次数反复消失)——直接以现有状态为基底
    // 增量重填, 更新次数照常累加。
    const tracked = 追踪NPC(host, settings, data);
    if (recent.length === 0) {
        if (force) {
            toastWarning('彼方: 没有可分析的AI回复（请确认已生成至少一条AI回复）', '彼方');
        }
        else if (settings.更新.慢一步) {
            // 慢一步排除后为空 = 当前只有 1 条 AI 回复。这是开关的必然代价(首轮一定遇到),
            // 必须给可见提示 —— 只 console.warn 的话用户会以为"更新坏了"。
            // 两个渠道都给: toast 给用户看, console.warn 给"日志页/控制台"这条排查路
            // (提示条画在 DOM 上, 某些环境(无 document / 被抑制)会静默失败, 那时至少还有这一行)。
            const 文案 = '彼方：已开启「慢一步」，但当前只有 1 条 AI 回复，跳过本轮更新（至少需要两条）。';
            toastWarning(文案, '彼方');
            console.warn(文案);
        }
        else {
            console.warn('[彼方] 未找到新的AI回复(清空后或仅剩旧楼层), 跳过本次更新');
        }
        return null;
    }
    const filter = 正文过滤(settings.标签);
    // 标注每条回复的顺序，最后一条为【最新回复】，让 AI 明确当前场景以最新一条为准
    const reply = recent
        .map((message: any, index: number) => `【${index === recent.length - 1 ? '最新回复' : `较早回复 ${index + 1}`}】\n${filter(message.message)}`)
        .join('\n\n');
    const timeJump = 时间跳跃(reply);
    // 名字提示用**过滤后**的正文判断(思维链/隐藏标签里提到的名字不算"出现过")
    const inSceneHint = tracked.filter((name: string) => 名字出现(reply, name));
    const replyIds = new Set(recent.map(message => message.message_id));
    // 手动更新(force)连上下文一起完整分析（含清空前的用户输入）；自动更新才受清空层约束
    // 「最近剧情」上下文只取最新 1 层用户输入（正文仍按「读取最近 N 条」）
    const rawContext = 上下文(host, recent[recent.length - 1].message_id, filter, 1, replyIds, force ? 0 : clearLayer);
    // 记忆插件把 <recall> 编码块追加在用户输入后面: 世界书扫描要用原文(AM 编码靠它激活纪要),
    // 但发给更新 AI 的"本轮用户输入"里只留一行"编码(距今)", 免得把旧记忆当成本轮发生的事
    const context = 压缩记忆回溯(rawContext);
    timing.前置 = Date.now() - timing.start;
    const worldbookStart = Date.now();
    // 世界书段与条数出自**同一次组装**: 条数不能靠事后按分隔符数(条目正文里本来就有空行)。
    const { 文本: worldbook, 条数: worldbook条数 } = settings.更新.注入世界书
        ? await 读取世界书段(host, [rawContext, reply].filter(Boolean).join('\n\n'), settings.更新.注入世界书排除 ?? [], settings.更新.常驻世界书条目 ?? [])
        : { 文本: '', 条数: 0 };
    timing.世界书 = Date.now() - worldbookStart;
    const storyTimeHint = 时间提示(worldbook, reply, context);
    // 批1·A2: 跨度由**代码算**, 不让模型自己回忆 —— 模型只看得到最近 N 条回复,
    // 它没有"上次更新是什么时候"的可靠记忆, 让它自己判断"过了三天还是一小时"只能靠猜。
    // 唯一可算的口径: 本轮从正文提取的时刻(storyTimeHint) − 上轮快照里的 `剧情时间` 结束端。
    // 算不出来时**显式标注跳过**, 绝不当成 0 —— 当成 0 会让模型以为"刚刚才过", 比不算更糟。
    // 空值分支也保留同一个前缀句式("距上次更新已过"), 只是内容写"跳过（无时间）"——
    // 三个分支句式一致, 验收在注入里一眼能看出"这一步走了, 只是没算出时间", 而不是"这行没了"。
    const spanResult = 剧情跨度(data.剧情时间, storyTimeHint);
    const storySpan = spanResult ? spanResult.文本 : '跳过（无时间）';
    // 批1.5·方案0: 从最近几份楼层快照 diff 出"近期轨迹"。
    // 轨迹是**独立注入段**(不是注入表的一列), 用来告诉模型"过去几层谁变了什么方向" ——
    // 旧卡只说"现在是什么样", 没有这层信息模型就容易写回原地或前后矛盾。
    // 四个口子(无更早快照/中间缺/跨清空层/形状不一致)全部由 轨迹.ts 内部挡, 这里只负责取料。
    const 轨迹结果 = 生成近期轨迹(读取快照序列(host, 轨迹上限.K层), data.清空层 ?? 0);
    const recentTrace = 轨迹结果.文本;
    if (recentTrace)
        console.info(`[彼方] 近期轨迹: 用 ${轨迹结果.用了快照数} 份快照, 写出 ${轨迹结果.写出条数} 条变化${轨迹结果.跳过形状不一致 ? `, 跳过 ${轨迹结果.跳过形状不一致} 个形状不一致字段` : ''}${轨迹结果.截掉清空层前 ? `, 清空层截掉 ${轨迹结果.截掉清空层前} 份` : ''}`);
    const currentCards: Record<string, any> = {};
    // 批2·B2: 逐 NPC 的「最后剧情时刻」—— 与批1 的**全局**跨度是两回事, 别混用。
    // 全局跨度回答"这次更新离上次更新过了多久"; 这里回答"这个 NPC 自己多久没被更新过"。
    // 卡上没这个键(存量卡)就**用本轮时刻补写** —— 照 `确保周期长度` 的范式:
    // 改的是发给模型/写回数据的**副本**, 但同步回写 data, 让后续合并直接沿用, 不每轮重算。
    const 本轮剧情时刻 = storyTimeHint;
    for (const name of tracked) {
        const oldCard = data.NPC[name];
        if (!oldCard)
            continue;
        const card = { ...oldCard };
        // B2: 新建卡/存量卡补写。只在本轮拿到了剧情时刻时才写 —— 拿不到就留空,
        // 下一轮有基准了再补(写个错误时刻比没有更糟: 它会算出一个假的"多久没更新")。
        if (本轮剧情时刻 && !String(card['最后剧情时刻'] ?? '').trim()) {
            card['最后剧情时刻'] = 本轮剧情时刻;
            oldCard['最后剧情时刻'] = 本轮剧情时刻;
        }
        // 关键: 周期长度只在合并后才生成, 而发给 AI 的是合并前的旧卡——
        // 若缺周期长度, AI 看不到锁定值就只能写死 28。这里先补上(与 一致化生理 共用同一条规则),
        // 并回写 data, 让后续合并直接沿用, 不重复随机。
        // 生理关着就不播种周期长度: 关着的功能不该偷偷改数据
        if (settings.更新.生理监测 && 确保周期长度(card))
            oldCard['周期长度'] = card['周期长度'];
        // 清理旧版生理字段残留, 避免 AI 继续沿用旧台账逻辑
        delete card['累计受孕率'];
        delete card['受孕率记录'];
        delete card['生理结算'];
        // 「未完成事项变动」是给面板看的逐轮标记, 不是状态字段: 发给模型只会让它照抄或误当事实
        delete card['未完成事项变动'];
        // 事务台账: 旧卡里可能还是旧格式字符串, 发给模型前先规范化成数组——模型只认台账形态
        // (带编号才能只报"状态/结果变了"), 否则它看到一整句字符串, 只能把内容整句重抄一遍。
        // 这里改的是发给模型的**副本**, 不写回旧卡; 真正的入库迁移在 mergeCard 里由 合并台账 完成。
        if (card['未完成事项'] !== undefined)
            card['未完成事项'] = 读取台账(card['未完成事项']);
        // 只给更新 AI 的副本加催更标记, 不写回旧卡, 也不进入主 AI 注入
        const 生活催更 = 生活状态待更新(card['生活状态'], data.剧情时间);
        if (生活催更.length > 0)
            card['生活状态待更新'] = 生活催更.join('、');
        // 恋爱没标记: 卡上的恋爱数据留着(取消标记只是暂停), 但不再发给更新 AI——
        // 它这轮根本没有恋爱规则, 带着只会被顺手改写或照抄, 白占 token
        if (String(card['恋爱对象'] ?? '').trim() !== '是') {
            for (const 键 of 字段分组表['恋爱'] ?? [])
                delete card[键];
        }
        currentCards[name] = card;
    }
    // 人设注入: 对每个已追踪 NPC, 收集**该 NPC 名字能触发的绿灯(关键词)条目**作为"人设参考"附在卡旁。
    // 与整包 worldbook 注入的区别: 这里**跳过蓝灯常驻条目**——蓝灯无条件下发, 给所有 NPC 的都是同一份
    // "基础世界观", 失去按 NPC 区分人设的意义; 只保留"keys 数组里显式包含 NPC 名字(或曾用名)"的条目,
    // 保证每张卡附的人设参考真的是它自己的人设, 而不是基础世界观。
    // 去重: 同一条目可能既被"世界书"段激活过、又被多个 NPC 的名字同时命中(如一条条目 keys 里写了
    // 乔尔/汤米/艾莉), 所以这里累积"已经发出去的文本", 后面的人设条目只要已在里面就跳过。
    if (settings.更新.注入世界书 && tracked.length > 0) {
        let 已发文本 = worldbook;
        for (const name of tracked) {
            const card = currentCards[name];
            if (!card)
                continue;
            const alias = String(card['曾用名'] ?? '').trim();
            try {
                const personaText = await getPersonaTextForNpc(host, name, alias, settings.更新.注入世界书排除 ?? [], 已发文本);
                if (personaText && personaText.trim()) {
                    // 零截断原则: 全量发送, 不再截断到 1500 字(规模控制只做在源头的读取范围/条目排除)。
                    card['人设参考'] = personaText.trim();
                    已发文本 += `\n\n${personaText.trim()}`;
                }
            }
            catch (error) {
                console.warn(`[彼方] 获取 NPC「${name}」人设条目失败(不影响本次更新):`, error);
            }
        }
    }
    const { messages, 工具说明 } = buildUpdateMessages({
        reply,
        replyCount: recent.length,
        context,
        timeJump,
        tracked,
        inSceneHint,
        currentCards,
        autoTrackEnabled: settings.更新.自动建档 !== false,
        physioEnabled: settings.更新.生理监测,
        // 恋爱子系统: 标记即开关——只有被玩家标记为恋爱对象的 NPC 才进恋爱说明段。
        // 没有任何标记时是空数组, 恋爱段输出空串, 提示词与改动前逐字节相同(零成本、零回归)。
        恋爱对象名单: tracked.filter((name: string) => String(currentCards[name]?.['恋爱对象'] ?? '').trim() === '是'),
        自定义段: settings.提示词?.自定义段 ?? [], // 用户自定义段: 只插锚点, 不改内置提示词
        预填充: !!settings.更新.预填充,
        // 消息伪装(§33): **常驻**, 没有开关。与工具通道**正交** ——
        // 规则进表了, messages 照样是有来有回的短问答(伪装的对象是对话形状, 不是规则段落)。
        消息伪装: true,
        // 规则进工具(§33): 工具通道开着时, 规则/设定/字段说明整块搬进工具说明,
        // 剧情与状态仍留在 messages。两件事各管一边, 不抢位置。
        规则进工具: !!settings.接口.工具通道,
        worldbook,
        currentStoryTime: data.剧情时间,
        storyTimeHint,
        storySpan,
        recentTrace,
        playerName,
        playerDescription,
        // 宏展开由调用方注入: prompts.ts 因此不依赖宿主(与 模型请求.ts 的 发请求/记日志 同一路子)
        展开宏: (text: string) => {
            try {
                return host.macros?.expand?.(text) ?? text;
            }
            catch {
                return text;
            }
        },
    });
    const 请求体 = messages
        .map(message => `【${message.role === 'system' ? '系统指令' : message.role === 'user' ? '用户' : '助手'}】\n${message.content}`)
        .join('\n\n────────\n\n');
    // 规模四数与请求体同源: 都取自**这一轮真正要发出去的那份**(messages / currentCards / worldbook)
    const 规模 = 计算规模({
        追踪: tracked.length,
        卡片: currentCards,
        世界书条数: worldbook条数,
        世界书字数: worldbook.length,
        请求体,
    });
    debugStore.record({
        time: Date.now(),
        model: settings.接口.模型,
        replyIds: recent.map(message => message.message_id),
        replyPreview: reply.slice(0, 150),
        request: 请求体,
        规模,
    });
    console.info(`[彼方] 开始更新幕后NPC状态 (使用最近 ${recent.length} 条回复: #${recent.map(message => message.message_id).join(', #')})`);

    return { data, messages, 工具说明, playerName, recent, timeJump };
}



