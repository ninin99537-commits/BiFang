// 剧情导演 · 平台边界(host)
// ---------------------------------------------------------------------------
// 本文件是**唯一**直接命名酒馆助手全局的地方(getVariables / getChatMessages / getWorldbook …)。
// 约定(与彼方/烟火那份相同):
// - 只在**边界**构造真实宿主: index.ts / 悬浮球界面.ts;
// - 纯逻辑不要在内部自己 new 宿主, 否则等于把全局换个名字继续用;
// - 优先传**值**, 能不传宿主就不传。
// ---------------------------------------------------------------------------

/** 变量表读写: 全局 / 聊天 / 楼层 / 脚本变量 */
interface HostVars {
  get(option: VariableOption): Record<string, any>;
  update(updater: (vars: Record<string, any>) => Record<string, any>, option: VariableOption): Record<string, any>;
  del(path: string, option: VariableOption): { variables: Record<string, any>; delete_occurred: boolean };
  insertOrAssign(variables: Record<string, any>, option: VariableOption): Record<string, any>;
  scriptId(): string;
}

/** 聊天楼层读取 */
interface HostChat {
  messages(range: number | string, options?: Omit<GetChatMessagesOption, 'include_swipes'> & { include_swipes?: false }): ChatMessage[];
  lastMessageId(): number;
  currentChatId(): string | null;
  /** 是否群聊(群聊首版不支持: 检测到即暂停并提示) */
  isGroupChat(): boolean;
  /**
   * 记忆插件存在楼层对象上的召回原文(第二轮方案 2.3): `chat[i].qrf_plot`。
   * 字段属于记忆插件, 不是我们的契约: 读不到/不是字符串 → 返回 ''(调用方退回"全部附原文")。
   */
  recallPlot(messageId: number): string;
}

/**
 * 生成前监听器。**宿主会 await 它的返回值**(见下方 onGenerationAfterCommands 的说明)。
 * 参数与酒馆 `GENERATION_AFTER_COMMANDS` 一致: (type, options, dryRun)。
 */
type GenerationAfterListener = (type: unknown, options: any, dryRun: unknown) => void | Promise<void>;

/** 事件订阅 */
interface HostEvents {
  onMessageReceived(listener: (messageId: number) => void): EventOnReturn;
  onMessageDeleted(listener: () => void): EventOnReturn;
  onMessageSwiped(listener: () => void): EventOnReturn;
  onChatChanged(listener: (chatId: string) => void): EventOnReturn;
  /**
   * 生成前触发。**这是真正的"可等待拦截点"** —— 已实测(2026-10-28, SillyTavern release):
   *   `public/script.js` 里是 `await eventSource.emit(GENERATION_AFTER_COMMANDS, type, options, dryRun)`,
   *   而 `public/lib/eventemitter.js` 的 `emit` 是 async 且 `for (...) await listeners[i].apply(...)`。
   * 所以监听器返回 Promise 时, 正文生成会等它完成再拼 prompt。
   *
   * 两个必须知道的边界(都来自同一处源码):
   *   - 监听器抛错会被 emit 内部 try/catch 吞掉(只 console.error) → **抛错不能取消生成**;
   *   - 返回值无人检查 → 也没有 `return false` 取消契约。
   * 因此本插件只在这里做**同步的幂等重注**, 不等任何慢 API。
   */
  onGenerationAfterCommands(listener: GenerationAfterListener): EventOnReturn;
}

/** 当前用户人设(persona): 主角设定 */
interface HostPersona {
  name(): string | null;
  description(): string;
}

/** 模型调用 */
interface HostModel {
  list(api: { apiurl: string; key?: string }): Promise<string[]>;
  raw(config: GenerateRawConfig): Promise<string | GenerateToolCallResult>;
  stop(generationId: string): boolean;
}

/** 宏展开 */
interface HostMacros {
  expand(text: string): string;
}

/** EJS 模板环境(世界书条目里的 <% %> 靠它求值) */
interface HostEjs {
  prepareContext(): Promise<Record<string, any>>;
  evaluate(text: string, env: Record<string, any>): Promise<string | null>;
  syntaxError(text: string): Promise<string>;
}

/** 世界书读写 */
interface HostWorldbook {
  boundNames(): { primary: string | null; additional: string[] };
  chatName(): string | null;
  globalNames(): string[];
  entries(name: string): Promise<WorldbookEntry[]>;
  update(name: string, updater: (entries: WorldbookEntry[]) => TypeFest.PartialDeep<WorldbookEntry>[]): Promise<void>;
  create(name: string, entries: TypeFest.PartialDeep<WorldbookEntry>[]): Promise<void>;
  remove(name: string, predicate: (entry: WorldbookEntry) => boolean): Promise<void>;
  /**
   * 取/新建**聊天文件**世界书(E1 修法用): 聊天级世界书自动对当前聊天生效,
   * **不碰用户角色卡**(角色卡的 `extensions.world` 可能指向未安装的书, 见 注入.解析事实层落点)。
   * 不填名字则由酒馆按当前时间命名。
   */
  getOrCreateChat(name?: string): Promise<string>;
}

/** ACU(自动卡片更新器)的表格数据: 世界书条目里 <if cell:...> 条件靠它取数 */
interface HostAcu {
  tables(): any;
}

/** 提示词注入(injectPrompts): 指令层在生成前幂等重注用 */
interface HostInject {
  inject(prompts: InjectionPrompt[]): void;
  uninject(ids: string[]): void;
}

interface Host {
  vars: HostVars;
  chat: HostChat;
  events: HostEvents;
  worldbook: HostWorldbook;
  persona: HostPersona;
  model: HostModel;
  macros: HostMacros;
  ejs: HostEjs;
  acu: HostAcu;
  inject: HostInject;
}

/** 真实宿主: 酒馆助手全局在这里被包一层, 别处不再直接碰它们 */
function createTavernHost(): Host {
  return {
    vars: {
      get: option => getVariables(option),
      update: (updater, option) => updateVariablesWith(updater, option),
      del: (path, option) => deleteVariable(path, option),
      insertOrAssign: (variables, option) => insertOrAssignVariables(variables, option),
      scriptId: () => getScriptId(),
    },
    chat: {
      messages: (range, options) => getChatMessages(range, options),
      lastMessageId: () => getLastMessageId(),
      currentChatId: () => {
        try {
          return SillyTavern.getCurrentChatId();
        } catch {
          return null;
        }
      },
      isGroupChat: () => {
        try {
          const context = (SillyTavern as any)?.getContext?.();
          return !!context?.groupId;
        } catch {
          return false;
        }
      },
      recallPlot: messageId => {
        try {
          const 楼 = (SillyTavern as any)?.getContext?.()?.chat?.[messageId];
          // 记忆插件把本轮召回存在用户楼上: qrf_plot 是合并后的原文; 任务表里的字段名随版本变过
          const 原文 = 楼?.qrf_plot ?? 楼?.qrf_plot_tasks?.plotTask_merged_recall ?? 楼?.qrf_plot_tasks?.plot_task_recall;
          return typeof 原文 === 'string' ? 原文 : '';
        } catch {
          return '';
        }
      },
    },
    events: {
      onMessageReceived: listener => eventOn(tavern_events.MESSAGE_RECEIVED, listener),
      onMessageDeleted: listener => eventOn(tavern_events.MESSAGE_DELETED, listener),
      onMessageSwiped: listener => eventOn(tavern_events.MESSAGE_SWIPED, listener),
      onChatChanged: listener => eventOn(tavern_events.CHAT_CHANGED, listener),
      onGenerationAfterCommands: listener => eventOn(tavern_events.GENERATION_AFTER_COMMANDS, listener),
    },
    persona: {
      name: () => {
        try {
          return getCurrentPersonaName() ?? null;
        } catch {
          return null;
        }
      },
      description: () => {
        try {
          return String(getPersona('current')?.description ?? '');
        } catch {
          return '';
        }
      },
    },
    model: {
      list: api => getModelList(api),
      raw: config => generateRaw(config),
      stop: generationId => stopGenerationById(generationId),
    },
    macros: {
      expand: text => substitudeMacros(text),
    },
    ejs: {
      prepareContext: () => EjsTemplate.prepareContext(),
      evaluate: async (text, env) => {
        const 插件 = EjsTemplate as unknown as { evalTemplate?: (code: string, context?: Record<string, any>) => Promise<string> };
        const evalFn = typeof 插件.evalTemplate === 'function' ? 插件.evalTemplate
          : typeof EjsTemplate.evaltemplate === 'function' ? EjsTemplate.evaltemplate
            : null;
        if (!evalFn) return null;
        return await evalFn.call(EjsTemplate, text, env);
      },
      syntaxError: text => EjsTemplate.getSyntaxErrorInfo(text),
    },
    acu: {
      tables: () => {
        try {
          const api = (window.parent as any)?.AutoCardUpdaterAPI ?? (window as any).AutoCardUpdaterAPI;
          return api?.exportTableAsJson?.();
        } catch {
          return undefined;
        }
      },
    },
    inject: {
      inject: prompts => injectPrompts(prompts),
      uninject: ids => uninjectPrompts(ids),
    },
    worldbook: {
      boundNames: () => {
        try {
          const 绑定 = getCharWorldbookNames('current');
          return { primary: 绑定?.primary ?? null, additional: [...(绑定?.additional ?? [])] };
        } catch {
          return { primary: null, additional: [] };
        }
      },
      chatName: () => {
        try {
          return getChatWorldbookName('current') ?? null;
        } catch {
          return null;
        }
      },
      globalNames: () => {
        try {
          return [...(getGlobalWorldbookNames() ?? [])];
        } catch {
          return [];
        }
      },
      entries: name => getWorldbook(name),
      update: async (name, updater) => {
        await updateWorldbookWith(name, updater);
      },
      create: async (name, entries) => {
        await createWorldbookEntries(name, entries);
      },
      remove: async (name, predicate) => {
        await deleteWorldbookEntries(name, predicate);
      },
      getOrCreateChat: name => getOrCreateChatWorldbook('current', name),
    },
  };
}

/** 当前宿主(被签名改不动的模块默认用它访问平台) */
let current: Host = createTavernHost();
function useHost(): Host {
  return current;
}
/** 仅供用例: 替换平台来源 */
function injectHostForTest(next: Partial<Host>) {
  current = { ...current, ...next };
}

export { createTavernHost, injectHostForTest, useHost };
export type { Host, HostAcu, HostChat, HostEjs, HostEvents, HostInject, HostMacros, HostModel, HostPersona, HostVars, HostWorldbook };
