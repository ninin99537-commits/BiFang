// 彼方 · 工具通道(K2) —— 纯逻辑层, 不碰任何平台符号, 所以能脱离酒馆单独测。
//
// 为什么单独一个文件: api.ts 里已经有"转发 / 直连"两条支路, 再把这些塞进去就变成第三个维度,
// 三条支路互相纠缠。这里只做"改造请求 / 解析回包 / 怎么说报错"。
// 归属文案与请求日志在 请求归属.ts(与功能一共用), 不在这里重复一份。
//
// 边界(方案 §12.1 的裁定, 别越界):
//   请求带一个强制调用的工具, 回包从 arguments 取。
//   **整份上下文不搬进 description** —— 那是 (b), 留第二轮独立开关。
//   理由: 只要带 tools + 强制 tool_choice, 请求形态就已经从"聊天补全"变成"工具调用"了,
//   上下文在哪不影响这一点; 而搬进 description 会让前缀缓存每轮全毁(彼方上下文每轮都变),
//   还会引入社区预设实测过的速度退化(往 description 塞超长文本 170→69 t/s)。
//
// 2026-11-18 用户裁定(方案 §18): **不做降级**。
//   工具通道开了而接口不认 → 那一轮就是失败, 不补发、不改设置、不悄悄退回老办法。
//   理由: 静默降级会让一个没用的功能看起来有用, 而用户整个实验只能靠输出质量判断 ——
//   悄悄退回老办法 = 实验被污染。**宁可响亮地失败, 不要安静地假装成功。**
//   代价(一次失败 + 既有 3 次重试, 见 §20 保留重试)由用户拍板接受;
//   我们欠他的是一条说死原因的报错。
import { CARD_FIELDS } from './卡字段';

/** 工具名: 一个请求只带这一个工具, 并且强制调用它 */
const 工具名 = 'update_npc_state';
/** description 只留一句话。**不要**把整份上下文塞进来(理由见文件头)。 */
const 工具描述 = '把本轮 NPC 幕后状态与剧情时间写入缓冲区';

/** NPC 状态卡的参数 schema。
 *
 *  **刻意只约束到"顶层有 NPC / 每张卡是对象"这一层**: 字段级类型不写死 ——
 *  `未完成事项` 是台账数组、`是否怀孕` 实际是 "true"/"false" 字符串, 把它们声明成 string
 *  反而会诱导模型输出错形状。字段是否齐全由既有的 `validateParsedFormat` 兜, 不在这里加严。
 *
 *  也**刻意不写 required**: 一轮"什么都没变"的合法输出就是 `{"NPC":{}}`,
 *  只报剧情时间的轮次也不该被 schema 拦下。
 *
 *  description 里只有字段名(来自 卡字段.ts), **不含任何请求级随机量** ——
 *  打散标记只能进 messages, 进了 tools 就会让前缀每轮都变(验收 P2-7 专门断言这条)。 */
export function 建工具定义() {
    return [
        {
            type: 'function' as const,
            function: {
                name: 工具名,
                description: 工具描述,
                parameters: {
                    type: 'object',
                    properties: {
                        剧情时间: {
                            type: 'object',
                            description: '本轮的剧情时间, 开始/结束都写成 "YYYY-MM-DD HH:mm"(年份 3~6 位)',
                            properties: {
                                开始: { type: 'string' },
                                结束: { type: 'string' },
                            },
                        },
                        NPC: {
                            type: 'object',
                            description: `键=NPC 名字(只写名字本身, 不要写"基准日期"这类元数据键), 值=该 NPC 的状态卡对象。可用字段见 properties; 本轮没有变化的 NPC 不要出现, 全都无变化时给空对象 {}`,
                            // W2(方案 §23): 卡里逐字段声明, 且 additionalProperties: false。
                            // 为什么必须收紧: 实测第 3 次工具通道把 "基准日期": "2039-09-17 19:10"
                            // 当成了 NPC 名字写进来(值还是字符串不是对象), 于是它进了名单、
                            // 之后每轮提示词都带着它 —— 与 W1 的自激回路叠加。
                            // 字段类型一律 string: `未完成事项` 是台账数组、`是否怀孕` 实际是
                            // "true"/"false" 字符串, 声明成 array/boolean 反而会诱导模型输出错形状;
                            // 真正的形状校验仍由 validateParsedFormat 兜。
                            // **仍然不写 required** —— 保留"只回变化的字段"这个既有能力。
                            additionalProperties: {
                                type: 'object',
                                description: '一张 NPC 状态卡; 只写本轮有变化的字段',
                                properties: Object.fromEntries(
                                    CARD_FIELDS.map(字段 => [字段, { type: 'string' }]),
                                ),
                                additionalProperties: false,
                            },
                        },
                        移除NPC: {
                            type: 'array',
                            description: '本轮要从追踪名单里移除的 NPC 名字',
                            items: { type: 'string' },
                        },
                    },
                    additionalProperties: true,
                },
            },
        },
    ];
}

/** 强制调用指定工具的对象形式。
 *
 *  为什么不用字符串 `'required'`: 对象形式在老网关上的支持面更宽, 且酒馆对 Gemini 原生源
 *  **只在对象形式**下才生成 `functionCallingConfig: { mode:'ANY', allowedFunctionNames:[名字] }`
 *  (字符串只映射到 `{mode:'ANY'}`, 不带名字)。彼方现在固定 source:'openai', 两条都能过,
 *  但对象形式零成本、将来切源不退化。 */
export function 建工具选择() {
    return { type: 'function' as const, function: { name: 工具名 } };
}

export type 回包正文 = { 文本: string; 来源: '工具参数' | '正文' | '无' };

/** 这段文本本身是不是一个完整 JSON(解析得动) */
function 能解析(文本: string): boolean {
    if (!文本)
        return false;
    try {
        JSON.parse(文本);
        return true;
    }
    catch {
        return false;
    }
}

/**
 * 从回包里取正文: **工具参数优先 → 正文兜底 → 两者都像载荷时取更长的**。
 *
 * 这条兜底是**必需项, 不是优化项**: 网关不认强制 `tool_choice` 时会退化成 auto,
 * 模型可能根本不调工具、只回一段 content; 酒馆还会在模型名匹配 o1/o3/o4 / gpt-5-chat-latest 时
 * **静默删掉 tools 再发**(openai.js:3000-3012)。这两条路都只能靠 content 兜底活下来。
 *
 * 但"取更长"有一个前提: **正文也必须是个能解析的 JSON**。否则散文更长时会把一份合法参数压掉,
 * 让解析层白失败一次(参数非法 + 正文合法时优先正文, 是验收 T5 的要求)。
 */
export function 取回包正文(输入: { 工具参数?: unknown; 正文?: unknown }): 回包正文 {
    const 参数 = String(输入.工具参数 ?? '').trim();
    const 正文 = String(输入.正文 ?? '').trim();
    const 参数可用 = 能解析(参数);
    if (参数可用) {
        if (正文 && 能解析(正文) && 正文.length > 参数.length)
            return { 文本: 正文, 来源: '正文' };
        return { 文本: 参数, 来源: '工具参数' };
    }
    if (正文)
        return { 文本: 正文, 来源: '正文' };
    if (参数)
        return { 文本: 参数, 来源: '工具参数' };
    return { 文本: '', 来源: '无' };
}

/** 工具/函数类关键词。用来区分"接口不认工具通道"与"接口本身出错" */
const 工具关键词 = /tool|function|signature/i;
/** 文本里出现的 4xx 状态码(转发路径拿不到 status, 只能从错误文本里认) */
const 四xx文本 = /(^|[^\d])4\d{2}([^\d]|$)/;

/**
 * 这个错误是不是"接口不认工具通道"(而不是接口本身坏了)。
 *
 * 判据是 **4xx 且 文本含工具类关键词**:
 *   - 5xx / 网络错 / 超时 → 不是(与开关无关, 查接口)
 *   - 401 密钥错、模型不存在 → 4xx 但不含关键词 → 不是(与开关无关)
 *   - 400 "tools is not supported" / "tool_choice invalid" / 签名要求 → 是
 *
 * 这个判据**只决定报错怎么说**, 不决定要不要重发(§18 取消了降级), 也不决定要不要重试(§20 保留重试)。
 * 方向取"宁可少判": 误判成"接口不认工具通道"会把用户引去关开关,
 * 而真因可能是密钥或地址 —— 那种误导比不提示更贵。
 */
export function 是工具通道拒绝(错误: unknown): boolean {
    const 状态 = Number((错误 as { status?: unknown })?.status);
    // 兼容两种形态: Error 实例(转发路径)与普通对象(直连 response.ok 分支自己拼的 {status,message})。
    // 只认 instanceof Error 会让后者退化成 "[object Object]", 判据永远不成立 —— 实测踩到过。
    const 原 = 错误 as { message?: unknown } | null;
    const 文本 = typeof 原?.message === 'string' && 原.message
        ? 原.message
        : 错误 instanceof Error ? 错误.message : String(错误 ?? '');
    if (Number.isFinite(状态))
        return 状态 >= 400 && 状态 < 500 && 工具关键词.test(文本);
    // 转发路径的错误是酒馆拼的字符串, 里面通常带 "HTTP 400" 之类的状态码
    return 四xx文本.test(文本) && 工具关键词.test(文本);
}

/**
 * 工具相关的失败: 报错必须**直接说出原因和动作**, 不能只丢状态码(§18.3 硬要求)。
 *
 * 这段只负责"怎么说"; 要不要用由调用方按 `是工具通道拒绝()` 二分决定 ——
 * 两条文案必须一眼能分开(验收 G4):
 *   · 这个函数: 接口不认工具通道 → 该关开关
 *   · 原来的报错: 接口本身出错 → 查密钥/地址/模型
 */
export function 工具通道失败提示(错误: unknown): string {
    const 原 = 错误 as { message?: unknown } | null;
    const 原因 = (typeof 原?.message === 'string' ? 原.message : String(错误 ?? ''))
        .split('\n')[0]
        .slice(0, 200);
    return `工具通道不被当前接口支持，请关闭「工具通道」开关后重试，或换一个支持工具调用(tools/tool_choice)的接口。\n注意: 这不是接口故障 —— 连接正常, 只是它不认这次请求带的工具参数。\n（接口返回：${原因}）`;
}

/** 空回包的诊断: 工具通道开着却什么都没拿到时, 要说清"是没调工具还是调了没给参数" */
export function 工具空回包提示(细节: string): string {
    return `工具通道没有拿到可用的状态 JSON。常见原因: 接口不认强制 tool_choice(模型于是不调工具, 只回文字)、或模型调用了工具但参数为空。\n可以关闭「工具通道」开关改用纯文本模式重试。\n${细节}`;
}

export { 工具名, 工具描述 };
