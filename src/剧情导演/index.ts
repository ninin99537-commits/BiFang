import { setActivePinia } from 'pinia';
import { pinia } from './pinia';
import { getSettings, 旧版残留键, 清掉旧版残留键, 迁移故事类型名 } from './settings';
import { 清空导演条目 } from './世界书落点';
import { captureConsole, useDeathStore, useDebugStore, useStateStore, 读离线状态 } from './state';
import { 熔断可放行, 熔断冷却毫秒 } from './运行状态';
import { updateDirector } from './update';
import { remove本幕指令, renew本幕指令, sync编剧备忘, sync本幕指令 } from './注入';
import { toastWarning, 设提示档位 } from './toast';
/** 2026-11-13 A 案: "疑似旧条目"只提示一次 —— 每次启动都弹等于噪音 */
let 已提示过疑似旧条目 = false;
import { useHost } from './host';
import { createTextFilter } from '../共用/楼层标签过滤';
import './悬浮球界面';

/**
 * 构建标记(每次改完构建换一次)。
 *
 * 为什么要有: "发一条消息被调用多次"这类问题, 第一件事是确认**酒馆里跑的是哪一版**。
 * 控制台第一行的 `载入构建 xxx` 就是答案; 如果它和 dist 目录里的不一样, 说明导入的是旧文件。
 */
export const 构建标记 = 'daoyan-2026-11-14-cd833935-…+收拢已演场数v48';

setActivePinia(pinia);
captureConsole();
// 可观测性: 读到设置的那一刻就把提示条档位钉上(面板没打开也要管住"开始推进"这类事件);
// 此刻酒馆 API 可能还没就绪 → 读不到就保持默认档「完成与异常」, 推进流程里还会再同步一次。
try {
  设提示档位(getSettings().导演.提示条);
} catch {
  // 忽略
}

/** 群聊提示只弹一次, 避免每条消息刷屏 */
let 已提示群聊 = false;
/** 熔断提示也只在"刚进入暂停"时弹一次(每轮弹会训练人忽略提示条); 页面刷新后允许再弹一次 */
let 已提示熔断 = false;

/** 暂停注入: 群聊(首版不支持) 或 死亡抉择待定 */
function 暂停注入(): boolean {
  try {
    return useHost().chat.isGroupChat() || useDeathStore().pending;
  } catch {
    return false;
  }
}

function handleChatChanged() {
  useStateStore().reload();
  useDebugStore().clear();
  const settings = getSettings();
  if (settings.启用导演) {
    sync编剧备忘(useStateStore().data, settings.导演.注入世界书条目, settings).catch(error => {
      console.error('[剧情导演] 切聊天同步编剧备忘失败:', error);
    });
    renew本幕指令(useStateStore().data, settings, 暂停注入());
  }
}

async function handleMessageReceived(message_id: number) {
  const settings = getSettings();
  if (!settings.启用导演) return; // 总开关
  if (!settings.导演.自动接管) return;
  // F 剧终停引擎: 剧终后自动路径整体跳过(不调引擎、不注入)
  if (useStateStore().data.已剧终) {
    console.info('[剧情导演] 已剧终, 自动路径整体跳过');
    return;
  }
  // I 熔断: 连败达阈值后暂停自动推进(不是改你的「自动接管」开关 —— 那一直是 true, 这里只是多一道闸)。
  // 2026-11-08 三条修正:
  //   ① 冷却已过就放行**一次**试探(否则"不跑→不成功→不复位"死锁, 只能靠用户找到面板按钮);
  //   ② 首次暂停弹一次提示条(以前只 console.warn, 用户除了翻控制台根本不知道);
  //   ③ 熔断期间注入也撤(见 注入.ts), 别让正文继续拿一道越来越过期的指令演。
  const 离线 = 读离线状态();
  // 恢复(或本来就没停)时把提示标记清掉 —— 否则"修好之后又坏一次"不会再弹, 用户永久失明
  if (!离线.自动暂停) 已提示熔断 = false;
  if (!熔断可放行(离线)) {
    if (!已提示熔断) {
      已提示熔断 = true;
      toastWarning(
        `剧情导演: 引擎连败 ${离线.连败次数} 次，已暂停自动推进（原因：${离线.最后失败原因 || '未知'}）。` +
          `面板「本幕」页可点「恢复自动接管」；${Math.round(熔断冷却毫秒 / 60000)} 分钟后也会自动再试一次。`,
        '剧情导演',
      );
    }
    console.warn('[剧情导演] 引擎已暂停（熔断），自动路径跳过');
    return;
  }
  if (离线.自动暂停) console.info('[剧情导演] 熔断冷却已过，放行一次试探（成功即恢复）');
  if (useHost().chat.isGroupChat()) {
    console.warn('[剧情导演] 群聊首版不支持, 已暂停推进');
    if (!已提示群聊) {
      已提示群聊 = true;
      toastWarning('剧情导演: 首版不支持群聊, 已暂停(请在单聊中使用)', '剧情导演');
    }
    return;
  }
  let latest;
  try {
    const messages = useHost().chat.messages(message_id);
    latest = messages[messages.length - 1];
  } catch {
    return;
  }
  if (!latest || latest.role !== 'assistant' || latest.is_hidden) {
    // 诊断(2026-10-29): 这条日志专门用来抓"玩家一发消息就被推进"。
    // 正常情况下看到的应该是 role=user → 跳过; 若看到 role=assistant 而楼层是玩家楼, 才是真 bug。
    console.info(
      `[剧情导演] 消息事件 #${message_id} role=${String(latest?.role ?? '未知')} hidden=${latest?.is_hidden ? '是' : '否'} → 跳过(不是AI正文)`,
    );
    return;
  }
  // 正文过短(疑似被截断/内容太少、没有足够剧情)时跳过自动推进, 避免白烧一次引擎请求。
  // **与彼方/烟火同口径**: 用标签过滤**之后**的文本判断 —— 思维链占比高的回复用原文判断
  // 会误以为很长, 过滤后才是真正的剧情正文; 只剔换行/制表, 保留普通空格(英文文本不被低估)。
  const replyText = createTextFilter(settings.标签)(String(latest.message ?? '')).replace(/[\r\n\t]+/g, '').trim();
  if (replyText.length < 500) {
    console.warn(`[剧情导演] 最新正文回复过短(过滤后 ${replyText.length}字), 疑似被截断, 已跳过本次自动推进`);
    return;
  }
  const frequency = Math.max(1, settings.导演.更新频率);
  if (frequency > 1) {
    const 账本 = useStateStore().data;
    const lastId = useHost().chat.lastMessageId();
    const from = Math.max(0, (账本.处理到楼层 ?? 0) + 1);
    if (lastId >= from) {
      const fresh = useHost().chat.messages(`${from}-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
      if (fresh.length % frequency !== 0) return;
    }
  }
  await updateDirector(false, `消息事件 #${message_id}`);
}

function refreshAfterFloorChange() {
  useStateStore().reload();
  const settings = getSettings();
  if (!settings.启用导演) return;
  sync编剧备忘(useStateStore().data, settings.导演.注入世界书条目, settings).catch(() => {
    // 忽略
  });
  renew本幕指令(useStateStore().data, settings, 暂停注入());
}

$(() => {
  // 推进防抖: 流式收尾/重roll 短时间连发 MESSAGE_RECEIVED 时只推进最后一条
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  function clearPendingTick() {
    if (tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  }
  useHost().events.onMessageReceived((message_id: number) => {
    clearPendingTick();
    tickTimer = setTimeout(() => {
      tickTimer = null;
      handleMessageReceived(message_id).catch(error => console.error('[剧情导演] 消息处理失败:', error));
    }, 800);
  });
  useHost().events.onMessageDeleted(() => {
    setTimeout(refreshAfterFloorChange, 2000);
  });
  useHost().events.onMessageSwiped(() => {
    refreshAfterFloorChange();
  });
  let lastChatId: string | null = null;
  try {
    lastChatId = useHost().chat.currentChatId();
  } catch {
    // 读取失败则首次 CHAT_CHANGED 直接刷新
  }
  useHost().events.onChatChanged((new_chat_id: string) => {
    if (lastChatId !== new_chat_id) {
      lastChatId = new_chat_id;
      handleChatChanged();
    }
  });
  // -------------------------------------------------------------------------
  // 生成前: **只做幂等重注**, 绝不在这里 await 慢 API。
  // 慢的编排只在 MESSAGE_RECEIVED 之后(updateDirector)进行, 下一轮生效。
  // -------------------------------------------------------------------------
  const 生成前处理 = async () => {
    try {
      const settings = getSettings();
      if (!settings.启用导演) {
        remove本幕指令();
        // 总开关 OFF = 零影响：世界书常驻条目也一并撤掉（否则主 AI 照样看得见账本事实）
        sync编剧备忘(useStateStore().data, false, settings).catch(error =>
          console.warn('[剧情导演] 停用时清理编剧备忘失败:', error),
        );
        return;
      }
      // 生成前先按楼层重载一次账本(只读本地变量, 很便宜):
      // 重新生成会先删掉最后一楼, 但删楼后的刷新要等 2 秒 —— 这期间开始的生成会拿到被删那一楼算出的指令。
      useStateStore().reload();
      sync本幕指令(useStateStore().data, settings, 暂停注入());
    } catch (error) {
      // 这里是宿主 await 的回调: 抛出去会变成 "Error in event listener"(被吞), 但生成会继续。
      // 仍然兜住, 保证"绝不因为导演出错而挡住玩家"。
      console.error('[剧情导演] 生成前处理失败(本次生成照常放行):', error);
    }
  };
  useHost().events.onGenerationAfterCommands(生成前处理);
  // 脚本可能在聊天尚未加载完时启动: 延迟补读一次账本
  setTimeout(() => {
    try {
      const store = useStateStore();
      const meta = useHost().vars.get({ type: 'chat' })?.['剧情导演'];
      const hasSnapshots = Array.isArray(meta?.快照楼层) && meta.快照楼层.length > 0;
      if (hasSnapshots && !store.data.章回 && (store.data.伏笔?.length ?? 0) === 0) {
        store.reload();
        console.info('[剧情导演] 聊天就绪后补读账本快照');
      }
    } catch {
      // 忽略
    }
  }, 3000);
  // 启动自检(2026-10-30): 总开关是关的, 就不该在世界书里留着导演条目(旧版本可能留了一条"暂无特别指令")。
  // 这里补一次清理 —— 用户关掉插件后不该还有条目在影响主 AI。
  setTimeout(() => {
    try {
      if (!getSettings().启用导演) {
        void 清空导演条目()
          .then(({ 删掉, 疑似 }) => {
            if (删掉.length > 0) console.info(`[剧情导演] 总开关关闭中, 已清掉世界书里的导演条目: ${删掉.join('、')}`);
            // 2026-11-13 A 案: 旧版命名的条目**不再自动删**（会误删用户自建条目）→ 只提示一次，
            // 让用户自己去世界书面板清理。静默不管等于"关了插件还有条目在生效"。
            if (疑似.length > 0 && !已提示过疑似旧条目) {
              已提示过疑似旧条目 = true;
              const 前几条 = 疑似.filter((_, i) => i < 3).map(项 => `${项.书}#${项.条目}`);
              console.warn(`[剧情导演] 世界书里还有 ${疑似.length} 条疑似旧版命名的条目: ${前几条.join('、')}`);
              toastWarning(
                `剧情导演: 世界书里有 ${疑似.length} 条疑似旧版命名的条目 —— 插件不再自动删除, 请在酒馆世界书里手动清理`,
                '剧情导演',
              );
            }
          })
          .catch(error => console.warn('[剧情导演] 启动清理世界书条目失败:', error));
      }
    } catch {
      // 忽略
    }
  }, 4000);
  // 载入横幅(2026-10-29): 排查"发一条消息被调用多次"时, 这行是唯一可信的自报家门 ——
  // 它同时告诉我们"酒馆里跑的是哪一版"和"挂了哪些事件"。
  console.info(
    `[剧情导演] 载入构建 ${构建标记} | 事件: MESSAGE_RECEIVED, MESSAGE_DELETED, MESSAGE_SWIPED, CHAT_CHANGED, GENERATION_AFTER_COMMANDS`,
  );
  // 旧版本残留探测(取证用): 只要存储里还有这几把键, 就说明"生成前规划"那一版曾经存过设置。
  // 若脚本也是旧文件, 症状就是**玩家一发消息就立刻发出请求** —— 那正是不该发生的事。
  try {
    // 故事类型改名(2026-11-12): 必须在读设置之前换掉老值, 否则老值会被 schema 静默回落成「不限」
    迁移故事类型名();
    const 原始 = useHost().vars.get({ type: 'global' })?.['剧情导演_settings'] as Record<string, unknown> | undefined;
    const 旧键 = 旧版残留键.filter(
      key => 原始 && Object.prototype.hasOwnProperty.call(原始, key),
    );
    if (旧键.length > 0) {
      const 已清 = 清掉旧版残留键();
      console.info(`[剧情导演] 已清理旧版设置残留键: ${已清.join('、')}（不影响运行, 只是消除误导）`);
    }
    // 只有"生成前规划"那几把键才说明可能跑着旧脚本; 真实命运模式只是被并进档位, 不值得报警
    if (旧键.some(key => key !== '真实命运模式')) {
      console.warn(
        `[剧情导演] 检测到旧版本设置残留(${旧键.join(', ')}) —— 说明"生成前规划"那一版曾在这个浏览器里保存过设置;` +
          ` 若脚本仍是旧文件, 玩家一发消息就会立刻发请求。请删掉旧脚本条目后导入最新 dist 并刷新。`,
      );
    }
  } catch {
    // 忽略: 取证失败不影响运行
  }
});
