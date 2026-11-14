// 彼方 · 注入规模(批次 3-1): 把"这一轮到底发了多大"算成四个数 + 一个 token 估算。
//
// 为什么单独一个文件: 这几个数字必须与**真正发出去的那份请求**同源, 所以它们只在
// 组装请求的地方(更新输入.ts)用一次; 日志仓要存它们、日志页要渲染它们、面板要给警示线 ——
// 三处共用同一份类型与同一套口径, 不各自算一遍(各算一遍就迟早对不上)。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)

/** 本轮注入规模: 四个数字 + 估算 token */
interface 规模数据 {
    /** 本轮追踪的 NPC 数(卡片段里出现的卡数) */
    追踪: number;
    /** 状态卡合计字数: 发给 AI 的那份卡(JSON 序列化后)的字符数, 含"人设参考" */
    卡片字数: number;
    /** 世界书段条数: 真正拼进提示词的条目数(被排除的、渲染后空的不算) */
    世界书条数: number;
    /** 世界书段字数 */
    世界书字数: number;
    /** 整份请求体的估算 token */
    估算token: number;
}

/** 建议线: 超过任一条就该提醒精简名单(只是提醒, 不阻止发送、不截断) */
const 规模建议线 = { NPC: 20, 字数: 60000 };

/**
 * token 估算口径(**界面上要写出来**, 否则那个数字没法解释):
 *   · 中日韩字符按 1 字 = 1 token;
 *   · 其余(英文/数字/标点/空白)按 4 字符 = 1 token。
 * 这是"够用来判断规模"的粗估, 不是分词器的精确值 —— 界面上也这么写。
 */
function 估算token(文本: string): number {
    let cjk = 0;
    let 其他 = 0;
    for (const ch of String(文本 ?? '')) {
        // 常用 CJK 区段: 汉字 / 假名 / 谚文 / 全角标点
        if (/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch))
            cjk += 1;
        else
            其他 += 1;
    }
    return Math.max(1, cjk + Math.ceil(其他 / 4));
}

/** 是否超过建议线(NPC 数或字数任一条) */
function 超建议线(规模: 规模数据 | null | undefined): boolean {
    if (!规模)
        return false;
    return 规模.追踪 > 规模建议线.NPC || 规模.卡片字数 > 规模建议线.字数;
}

/** 从"这一轮真正发出去的材料"算出规模; 请求体就是最终拼好的那份 */
function 计算规模(材料: {
    追踪: number;
    卡片: Record<string, unknown>;
    世界书条数: number;
    世界书字数: number;
    请求体: string;
}): 规模数据 {
    return {
        追踪: 材料.追踪,
        卡片字数: JSON.stringify(材料.卡片 ?? {}).length,
        世界书条数: 材料.世界书条数,
        世界书字数: 材料.世界书字数,
        估算token: 估算token(材料.请求体),
    };
}

export { 估算token, 规模建议线, 超建议线, 计算规模 };
export type { 规模数据 };
