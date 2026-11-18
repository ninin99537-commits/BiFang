// 彼方 · 请求打散(K1) —— 纯逻辑, 不碰任何平台符号, 所以能脱离酒馆单独测。
//
// 做什么: 每次请求在 system **末尾**插一段固定长度的随机标记, 让同一份提示词不再逐字节相同。
// 动机: 用户观察到"官方 key 请求某些模型时输出异常快而质量差", 怀疑服务端按提示词字节判定是否
// 降级到更低档的模型。逐字节相同的提示词是这类判定的最好素材, 打散就是把它抹掉。
//
// 为什么放 system **末尾**而不是开头: 放开头会让整个 system 段每轮都变, 正好打掉
// "system 稳定、至少那一段能命中前缀缓存"的收益。末尾追加只让最后几个 token 变。

/** 打散标记: 固定 12 位 base36, 包在明确标记里(便于在抓包里一眼认出, 也便于断言) */
export function 生成打散标记(): string {
    let 串 = '';
    while (串.length < 12)
        串 += Math.random().toString(36).slice(2);
    return `[请求标识 ${串.slice(0, 12)}]`;
}

/**
 * 把打散标记追加到最后一条 system 消息的**末尾**; 没有 system 消息时在最前面插一条。
 *
 * 返回新数组、新消息对象 —— **不改入参**。重试时每次都拿同一份 messages 重新打散,
 * 所以每次请求的字节都不同(这正是 K1 要的效果), 而基线消息本身不会被越改越长。
 */
export function 加打散标记(messages: any[], 标记: string): any[] {
    const 副本 = messages.map(消息 => ({ ...消息 }));
    let 目标 = -1;
    for (let i = 副本.length - 1; i >= 0; i--) {
        if (副本[i]?.role === 'system') {
            目标 = i;
            break;
        }
    }
    if (目标 >= 0) {
        副本[目标].content = `${String(副本[目标].content ?? '')}\n\n${标记}`;
        return 副本;
    }
    副本.unshift({ role: 'system', content: 标记 });
    return 副本;
}
