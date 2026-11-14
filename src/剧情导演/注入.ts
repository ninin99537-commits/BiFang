// 剧情导演 · 双层注入:
//   事实层 → 世界书常驻条目「编剧备忘」(蓝灯常开、防递归、切聊天重写、空则删, 同族范式);
//   指令层 → injectPrompts + GENERATION_AFTER_COMMANDS(in_chat depth 0, 幂等重注, 绝不 await 慢 API)。
import { useHost } from './host';
import { buildInjectionPrompt, build本幕指令 } from './prompts';
import type { Settings, 导演账本 } from './schema';
import { WORLDBOOK_ENTRY_NAME } from './state';
import { 读离线状态 } from './运行状态';
import { 判定台上, type 台上结论 } from './台上';
import { toastWarning } from './toast';
import { is导演条目, 有账本事实, 错误文本, 解析事实层落点, 清理别处的副本, 列出疑似旧条目 } from './世界书落点';

// 世界书落点策略(探测 primary → 副书 → 聊天书 → 新建; 以及"确保只有一份"的清理)已独立成
// 世界书落点.ts —— 它是 E1 真机缺陷的修复所在, 一整套分支值得单独测。
// 这里原样再导出一次, 既有调用方(面板 / index / 用例)不用改 import。
export { is导演条目, 有账本事实, 错误文本, 解析事实层落点 } from './世界书落点';
export type { 事实层落点 } from './世界书落点';

/** ACU 剧情推进的条目屏蔽词: 命中则条目不进剧情推进上下文 */
const ACU_BLOCKED_KEYWORDS = ['规则', '思维链', 'cot', 'MVU', 'mvu', '变量', '状态', 'Status', 'Rule', 'rule', '检定', '判断', '叙事', '文风', 'InitVar', '格式'];

function sanitizeEntryName(currentName: string): string {
  const name = String(currentName || '').trim();
  return ACU_BLOCKED_KEYWORDS.some(keyword => name.includes(keyword)) ? WORLDBOOK_ENTRY_NAME : name;
}

let warnedNoWorldbook = false;
/** 2026-11-13 A 案: "同一本书里有疑似旧条目"只警告一次（每次注入都刷等于噪音） */
let warned疑似旧条目 = false;





/** 事实层: 把编剧备忘写入可用世界书的常驻条目 */
export async function sync编剧备忘(data: 导演账本, enabled: boolean, settings: Settings): Promise<void> {
  const 要写 = !!enabled && 有账本事实(data) && !data?.已剧终;
  try {
    const 解析 = await 解析事实层落点({ 允许新建: 要写 });
    if (解析.悬空) {
      console.warn(
        `[剧情导演] 角色卡主世界书「${解析.悬空}」不可读(链接悬空/未安装)` +
          (解析.落点 ? `, 已回退到「${解析.落点.名}」(${解析.落点.来源})` : ', 且没有可用回退目标'),
      );
    }
    if (!解析.落点) {
      // 只有"该注入却没落点"才算问题; 无事可做(关闭/剧终/无事实)时保持安静
      if (要写) {
        console.error(`[剧情导演] 编剧备忘未送达: ${解析.失败原因}`);
        if (!warnedNoWorldbook) {
          warnedNoWorldbook = true;
          toastWarning(`「编剧备忘」未送达(主 AI 拿不到账本事实): ${解析.失败原因}`, '剧情导演');
        }
      }
      return;
    }
    const 名 = 解析.落点.名;
    // F 剧终停引擎: 剧终后事实层也撤条目(不注入); 关闭/无事实同理。
    // 撤的时候**所有候选都撤**(传空串): 只撤落点那一本的话, 别处可能有上一次回退留下的陈旧副本。
    if (!要写) {
      await 清理别处的副本('');
      warnedNoWorldbook = false;
      return;
    }
    const content = buildInjectionPrompt(data, { 平静: !!settings?.导演?.平静模式 });
    const existing = (await useHost().worldbook.entries(名)).find(is导演条目);
    if (existing) {
      await useHost().worldbook.update(名, wb =>
        wb.map(entry =>
          is导演条目(entry)
            ? {
                ...entry,
                name: sanitizeEntryName(entry.name || WORLDBOOK_ENTRY_NAME),
                content,
                recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
              }
            : entry,
        ),
      );
    } else {
      /**
       * 2026-11-13 A 案: 新建之前先看一眼**同一本目标书**里有没有"疑似旧版命名"的条目。
       * 只警告一次，**绝不在这里删** —— 宽松判定会误删用户自建条目，那正是本条要修的缺陷。
       * 提醒的意义: 旧条目会和新条目**同时注入**，主 AI 会读到两份。
       */
      try {
        const 疑似 = (await 列出疑似旧条目()).filter(项 => 项.书 === 名);
        if (疑似.length > 0 && !warned疑似旧条目) {
          warned疑似旧条目 = true;
          console.warn(
            `[剧情导演] 「${名}」里还有 ${疑似.length} 条疑似旧版命名的条目(如 ${疑似[0].条目}) —— 插件不再自动删, 会与新条目同时注入, 建议手动清理`,
          );
        }
      } catch {
        // 忽略: 探测失败不该挡住写入
      }
      await useHost().worldbook.create(名, [
        {
          name: WORLDBOOK_ENTRY_NAME,
          content,
          enabled: true,
          probability: 100,
          strategy: {
            type: 'constant',
            keys: [],
            keys_secondary: { logic: 'not_any', keys: [] },
            scan_depth: 'same_as_global',
          },
          position: { type: 'after_character_definition', role: 'system', depth: 0, order: 100 },
          recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
          extra: { daoyan: true },
        },
      ]);
    }
    // E1 补充①: 落点可能变过(悬空 → 聊天书 → 主世界书恢复可读), 写完后把别处的旧副本撤掉,
    // 保证主 AI 只读到**一份**(否则其中一份永远是陈旧的)。
    await 清理别处的副本(名);
    warnedNoWorldbook = false;
  } catch (error) {
    const 原因 = 错误文本(error);
    console.error(`[剧情导演] 同步编剧备忘到世界书失败: ${原因}`);
    if (要写 && !warnedNoWorldbook) {
      warnedNoWorldbook = true;
      toastWarning(`「编剧备忘」未送达: ${原因}`, '剧情导演');
    }
  }
}

// ---------------------------------------------------------------------------
// 指令层: 本幕导演指令(生成前幂等重注, 绝不 await 慢 API)
// ---------------------------------------------------------------------------

const 指令注入ID = (() => {
  try {
    return `daoyan-act-${useHost().vars.scriptId()}`;
  } catch {
    return 'daoyan-act';
  }
})();

const ACT_INJECTION: InjectionPrompt = {
  id: 指令注入ID,
  position: 'in_chat',
  depth: 0,
  role: 'system',
  content: '',
  should_scan: false,
};

let lastContent = '';
let injected = false;

/** 读不到宿主时不拦(宁可照旧, 也不因为读失败而把注入丢掉) */
function 在群聊(): boolean {
  try {
    return !!useHost().chat.isGroupChat();
  } catch {
    return false;
  }
}

/**
 * 「平静期刚结束，手上那道指令已经作废」(2026-11-11)。
 *
 * 平静期**不构造**指令, 所以 `账本.当前指令` 一直是**平静前**那一道(可能隔着几十场、几十层正文,
 * 章号还冻着不往前)。它一场都没下发过 —— 引擎那边已经把它记成「上一道未下发」(不核验、必演不记债),
 * 注入层必须跟同一个口径: 关掉开关就把它当"本幕剧本"注回去, 正文会去演几十场之前的那一幕。
 *
 * 窗口期 = 关掉平静之后、下一次成功推进之前(`update.ts` 在那里把 平静场数 清零并换上 new 指令)。
 * 导入口与面板(指令预览/必演点/空态文案)共用这一个判断, 否则会出现"面板说还有指令、正文拿不到"。
 */
export function 平静前指令作废(data: 导演账本 | null | undefined): boolean {
  return (Number(data?.平静场数) || 0) > 0;
}

/**
 * 此刻台上是什么(2026-11-12 架构深化 ④)。
 *
 * 这是**唯一**一份"下不下令"的判定: 注入层用它拿文本, 面板用它拿预览与原因, 球用它决定灯亮不亮。
 * 以前这份判断有五份抄本, 面板那份只查了「平静/平静刚结束」两道闸 ——
 * 于是熔断期面板摊开一整段本幕指令, 正文却一个字节都拿不到(见 台上.ts 头部)。
 *
 * 适配器只做一件事: 把"账本 + 设置 + 暂停标志"读成 `台上输入`。
 * 群聊与熔断这类宿主/运行时状态在这里读一次, 纯模块里不碰任何全局。
 */
export function 此刻台上(
  data: 导演账本 | null | undefined,
  settings: Settings,
  暂停注入: boolean,
): 台上结论 {
  return 判定台上({
    启用导演: !!settings.启用导演,
    已剧终: !!data?.已剧终,
    群聊: 在群聊(),
    自动接管: !!settings.导演.自动接管,
    暂停注入,
    待决死亡: !!data?.待决死亡,
    平静模式: !!settings.导演.平静模式,
    引擎暂停: !!读离线状态().自动暂停,
    有指令: !!data?.当前指令,
    指令已跳过: !!data?.当前指令?.已跳过,
    平静前作废: 平静前指令作废(data),
    平静场数: Number(data?.平静场数) || 0,
  });
}

/**
 * 台上此刻的文本 + 结论(一次算好, 两个消费者共用)。
 * 面板要"预览什么"和"为什么没有", 走这一个出口就够了 —— 不许自己再判一遍闸。
 */
export function 台上文本(
  data: 导演账本 | null | undefined,
  settings: Settings,
  暂停注入: boolean,
): { 结论: 台上结论; 文本: string } {
  const 结论 = 此刻台上(data, settings, 暂停注入);
  if (结论.种类 === '只红线') return { 结论, 文本: 红线块(settings, 结论.短原因) };
  if (结论.种类 === '下令' && data) return { 结论, 文本: build本幕指令(data as 导演账本, settings) };
  return { 结论, 文本: '' };
}

/**
 * 当前该注入的指令文本(空串=不注入)。已剧终/跳过本幕/死亡抉择未定/关闭 → 空
 *
 * 判定全部交给 `台上文本` —— 这里只留"取文本"这一个动作, 闸一道都不许在这层重写。
 */
export function 应注入的指令文本(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): string {
  return 台上文本(data, settings, 暂停注入).文本;
}

/**
 * 只含红线的注入块(2026-11-08)。
 *
 * 两种场合共用: **平静模式**(不下令)与**熔断**(引擎暂停)。
 * 被撤掉的是"这一场要演什么"——节拍、剧情参考、本幕已确定、伏笔现场、本幕揭示, 那些是**编排**。
 * 红线不是编排: 它是用户钉死的「不许写什么」, 与"引擎此刻能不能跑"无关。
 * 把它一起撤掉, 等于"引擎出问题时就可以写性暴力"—— 那是把用户的硬约束当成了剧情装置。
 * (保护名单不受影响: 它是代码闸门, 不靠注入。)
 */
function 红线块(settings: Settings, 原因: string): string {
  const 红线 = (settings.导演.红线 ?? []).map(x => String(x ?? '').trim()).filter(Boolean);
  if (红线.length === 0) return '';
  return [
    '[剧情导演 · 红线]',
    `以下是用户钉死的红线，**优先于一切**（${原因}，只有这些约束仍然有效）：`,
    ...红线.map(项 => `- ${项}`),
  ].join('\n');
}

/**
 * 幂等地把已就绪的指令注入主AI(在 GENERATION_AFTER_COMMANDS 里调用)。
 * 只读内存里已算好的 账本.当前指令——**绝不在这里调用慢 API**。
 */
export function sync本幕指令(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): void {
  const content = 应注入的指令文本(data, settings, 暂停注入);
  const active = content.length > 0;
  if (content === lastContent) {
    // 幂等早退, 但**不能因为内容没变就跳过"重新注入"**:
    // 同一条指令可能被注入多次(生成前一次, 正文后重写备忘时又一次), 中间可能被
    // remove本幕指令/停止生成 撤掉过。若这里直接 return, 正文就**拿不到指令**了。
    // 所以: 内容没变但当前没注入 → 补注一次; 内容变空且有注入 → 撤掉。
    if (!active) {
      if (injected) {
        injected = false;
        try {
          useHost().inject.uninject([指令注入ID]);
        } catch {
          // 忽略
        }
      }
      return;
    }
    if (!injected) {
      ACT_INJECTION.content = content;
      try {
        useHost().inject.inject([ACT_INJECTION]);
        injected = true;
      } catch (error) {
        console.warn('[剧情导演] 补注入本幕指令失败:', error);
      }
    }
    return;
  }
  lastContent = content;
  if (injected) {
    injected = false;
    try {
      useHost().inject.uninject([指令注入ID]);
    } catch {
      // 忽略
    }
  }
  if (active) {
    ACT_INJECTION.content = content;
    try {
      useHost().inject.inject([ACT_INJECTION]);
      injected = true;
    } catch (error) {
      console.warn('[剧情导演] 注入本幕指令失败:', error);
    }
  }
}

/** 移除注入(卸载/关闭时) */
export function remove本幕指令(): void {
  lastContent = '';
  injected = false;
  try {
    useHost().inject.uninject([指令注入ID]);
  } catch {
    // 忽略
  }
}

/** 切聊天/切分支后强制重注(注入绑定当前聊天) */
export function renew本幕指令(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): void {
  lastContent = '';
  injected = false;
  sync本幕指令(data, settings, 暂停注入);
}
