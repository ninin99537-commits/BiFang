/**
 * 收集当前聊天激活的世界书条目内容, **直接使用酒馆主 AI 的激活机制**(EjsTemplate 环境里的
 * getWorldInfoActivatedData, 与主 AI 完全一致: 蓝灯常驻、绿灯关键词匹配、概率等)。
 * 默认只读角色卡绑定世界书(主 + 附加)与聊天世界书; 全局世界书由设置开关控制(默认关)。
 * 导演自己写入的条目自动排除; 彼方/烟火等条目照常读取(它们是世界的一部分)。
 * 条目求值(ACU <if>、EJS、宏)复用 共用/条目求值.ts。
 */
import { useHost } from './host';
import { 取EJS模板环境, 组装求值上下文, 收集表格名, 求值条目文本, type 求值环境 } from '../共用/条目求值';
// 排除名单的判定与日志措辞: 与彼方/烟火同一份(共用/世界书排除.ts)
import { 命中排除, 条目标签, 排除说明 } from '../共用/世界书排除';

const SELF_EXCLUDE_MARKS = ['【剧情导演】编剧备忘', '[剧情导演 · 编剧备忘]'];

function 导演求值环境(): 求值环境 {
  return {
    文案: {
      名字: '剧情导演',
      缺表: (缺失, 可用) => `[剧情导演] 世界书 <if cell:> 引用的表未找到: ${缺失}(可用表: ${可用 || '(无)'})`,
      查值失败: (原因, 表名, 行名, 列名, 表头) => `[剧情导演] <if cell:> 查值失败(${原因}): ${表名}/${行名}/${列名}\n  该表实际表头: ${表头}`,
      // 2026-11-11: 以前这里返回 null = "不说"。但 EJS 环境就是**世界书条目激活**的入口
      // (下面的 getWorldInfoActivatedData 也挂在它身上): 它一挂, 这一轮世界书整个读不到
      // (见下面 `if (!env ...) return ''`), 导演只剩账本和最近正文 —— 用户只看到"导演变笨了",
      // 日志里却一个字都没有。静默失败是这个项目最贵的一类 bug, 所以把原因明说出来(措辞跟彼方一致)。
      环境初始化失败: error =>
        `[剧情导演] EjsTemplate(提示词模板语法插件)环境初始化失败, 本轮读不到世界书(条目激活也靠它): ${
          error instanceof Error ? error.message : String(error)
        }`,
    },
    取ACU表格: () => useHost().acu.tables(),
    准备EJS模板环境: () => useHost().ejs.prepareContext(),
    求值EJS: (text, env) => useHost().ejs.evaluate(text, env),
    EJS语法错误: text => useHost().ejs.syntaxError(text),
    展开酒馆宏: text => useHost().macros.expand(text),
    取助手变量: option => useHost().vars.get(option),
    空表头也算命中: true,
  };
}

export interface WorldbookReadOptions {
  excludeNames?: string[];
  includeGlobal?: boolean;
}

export async function getActiveWorldbookText(scanText: string, options: WorldbookReadOptions = {}): Promise<string> {
  const 环境 = 导演求值环境();
  const excludes = [...(options.excludeNames ?? []), ...SELF_EXCLUDE_MARKS].map(s => String(s).trim()).filter(Boolean);
  const isExcluded = (entry: any) => Boolean(entry && (entry?.extra?.daoyan === true || 命中排除(entry, excludes)));
  /** 被排除名单挡掉的条目(静默排除是排查黑洞: 挡没挡住要能看见) */
  const 排除挡掉: string[] = [];
  const names: string[] = [];
  try {
    const charWorldbooks = useHost().worldbook.boundNames();
    if (charWorldbooks?.primary) names.push(charWorldbooks.primary);
    (charWorldbooks?.additional ?? []).forEach(name => names.push(name));
  } catch {
    // 未打开角色卡时忽略
  }
  try {
    const chatWorldbook = useHost().worldbook.chatName();
    if (chatWorldbook) names.push(chatWorldbook);
  } catch {
    // 忽略
  }
  if (options.includeGlobal) {
    try {
      useHost().worldbook.globalNames().forEach(name => names.push(name));
    } catch {
      // 忽略
    }
  }
  if (names.length === 0) return '';
  const env: any = await 取EJS模板环境(环境);
  if (!env || typeof env.getWorldInfoActivatedData !== 'function') {
    console.warn('[剧情导演] 模板环境不可用, 跳过世界书读取');
    return '';
  }
  const activatedAll: any[] = [];
  {
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      let activated: any[];
      try {
        activated = (await env.getWorldInfoActivatedData(name, scanText)) || [];
      } catch {
        continue;
      }
      for (const entry of activated) {
        if (!entry || entry.disable || !entry.content)
          continue;
        if (isExcluded(entry)) {
          排除挡掉.push(条目标签(entry));
          continue;
        }
        activatedAll.push(entry);
      }
    }
  }
  if (排除挡掉.length > 0)
    console.info(`[剧情导演] ${排除说明(排除挡掉)}`);
  const ctx = await 组装求值上下文(scanText, 收集表格名(activatedAll.map(entry => entry.content)), 环境);
  const loggedMissingTables = new Set<string>();
  const lines: string[] = [];
  for (const entry of activatedAll) {
    const label = 条目标签(entry);
    for (const table of 收集表格名([entry.content])) {
      if (!ctx.sheets.some(s => s.name === table) && !loggedMissingTables.has(table)) {
        loggedMissingTables.add(table);
        console.warn(`[剧情导演] 世界书条目「${label}」引用了不存在的表: ${table}, 请在世界书里改成正确的表名`);
      }
    }
    const needsEjs = entry.content.includes('<%');
    const text = await 求值条目文本(entry.content, ctx, needsEjs ? env : null, label);
    if (!text.trim()) continue;
    lines.push(text);
  }
  return lines.join('\n\n');
}
