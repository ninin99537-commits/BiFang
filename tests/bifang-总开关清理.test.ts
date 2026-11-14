// 彼方 · 总开关关闭后的世界书清理钉子 —— 复查候选1(已判真缺陷, dsh #152 裁定方案 a: 函数挪入 worldbook-inject 并导出)。
//
// 病根: index.ts 的 onGenerationAfterCommands 调用方写了 if (启用幕后) 闸门 —— 关总开关后该触发器不清旧条目
// (另三个触发器都不闸), 主 AI 每轮仍读上一轮蓝灯常驻条目, 直到切聊天。
// 行为钉(方案 a: maybeInjectNpcStates 挪入 worldbook-inject 并导出, index.ts 只改引用):
//   启用幕后=false + 世界书写入=角色卡主世界书 + 预置一条 extra.bifang 条目 → 调用后该条目**被删**、同本其它条目原样。
// 对照: 启用幕后=true → 条目不删(防"把清理做成无差别删")。
// 变异(#152 指定): 删掉 maybeInjectNpcStates 里 `目标 = 启用幕后 ? 世界书写入 : '关闭'` 那行 → [1] 必红。
// 结构辅助钉(文本, **非行为证据**): index.ts 的 onGenerationAfterCommands 回调不再含 启用幕后 闸门 —— 防的是"有人把闸门加回来"。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { maybeInjectNpcStates } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

/** 假宿主 + 两本书各按名管理(remove 按判定过滤, 与真平台同语义); 启用幕后与写入目标按场景注入设置 */
function 清理假宿主(启用幕后: boolean) {
  const { host, 存 } = 彼方假宿主({});
  存.global['彼方_settings'] = {
    接口: { 地址: 'https://fake.local', 模型: 'fake-model' },
    启用幕后,
    更新: { 世界书写入: '角色卡主世界书', 注入世界书: false, 生理监测: false },
  };
  const 书: Record<string, any[]> = {
    主书: [
      { name: '【彼方】NPC幕后生活', content: '【NPC幕后生活】\n甲 | 位置: 家', comment: '', enabled: true, extra: { bifang: true } },
      { name: '艾莉人设', content: '艾莉, 19岁。', comment: '艾莉', enabled: true },
    ],
    聊天书: [],
  };
  (host as any).worldbook.boundNames = () => ({ primary: '主书', additional: [] });
  (host as any).worldbook.chatName = () => '聊天书';
  (host as any).worldbook.entries = async (name: string) => [...(书[name] ?? [])];
  (host as any).worldbook.remove = async (name: string, predicate?: (e: any) => boolean) => {
    书[name] = (书[name] ?? []).filter(e => !predicate?.(e)); // 只删命中判定的, 与真平台同语义
  };
  return { host, 存, 书 };
}

console.log('\n[1] 总开关关(启用幕后=false) → **有数据也清**: 调用后彼方条目被删、同本人设条目原样');
{
  setActivePinia(createPinia());
  const { host, 存 } = 清理假宿主(false);
  // 种一份有数据的状态: 钉的是"关总开关 → 即使有数据也清"(空数据下写路径与关闭档都会删, 变异咬不住)
  存.message[1] = {};
  const 种子: any = { 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } }, 统计: { 更新次数: 1 }, 剧情时间: '2026-01-01 20:00' };
  const { writeStateSnapshot } = await import('../src/彼方_NPC幕后生命状态系统/快照');
  writeStateSnapshot(host, 种子, 1, 1, false);
  maybeInjectNpcStates(host as any);
  await new Promise(resolve => setTimeout(resolve, 20)); // 同步链是 async fire-and-forget, 让一拍落地
  const 主书现在 = await (host as any).worldbook.entries('主书');
  ok('彼方条目被删', !主书现在.some((e: any) => e.extra?.bifang === true));
  ok('同本人设条目原样保留', 主书现在.some((e: any) => e.name === '艾莉人设'));
}

console.log('\n[2] 对照: 启用幕后=true → 条目不删(有数据时走正常写入路径)');
{
  // getSettings 有 500ms 模块级读缓存([1] 把 启用幕后=false 缓存了); invalidateReadCache 未导出,
  // 跨场景只能真等窗口过去 —— 否则 [2] 拿到的是 [1] 的设置, 走的会是关闭档
  await new Promise(resolve => setTimeout(resolve, 550));
  setActivePinia(createPinia());
  const { host, 存 } = 清理假宿主(true);
  // 有数据(名单非空)时, 写路径是"更新条目"而非"删条目" —— 空数据才会删
  存.message[1] = {};
  const 种子: any = { 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } }, 统计: { 更新次数: 1 }, 剧情时间: '2026-01-01 20:00' };
  const { writeStateSnapshot } = await import('../src/彼方_NPC幕后生命状态系统/快照');
  writeStateSnapshot(host, 种子, 1, 1, false);
  maybeInjectNpcStates(host as any);
  await new Promise(resolve => setTimeout(resolve, 30));
  const 主书现在 = await (host as any).worldbook.entries('主书');
  ok('启用状态下彼方条目不被删(走正常写入/更新路径)', 主书现在.some((e: any) => e.extra?.bifang === true));
}

console.log('\n[3] 结构辅助钉(文本, 非行为证据): onGenerationAfterCommands 回调不再含 启用幕后 闸门 —— 防"有人把闸门加回来"');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源码 = readFileSync(path.join('src', '彼方_NPC幕后生命状态系统', 'index.ts'), 'utf8');
  const 回调段 = (源码.match(/onGenerationAfterCommands\(\(\) => \{[\s\S]{0,400}?\}\);/) ?? [''])[0];
  ok('回调段存在(正则咬得住)', 回调段.length > 0);
  // 钉"闸门语句"而不是"启用幕后"字样 —— 回调里允许有解释为什么删闸门的注释(它也提这个词)
  ok('回调里没有 if(启用幕后) 形态的闸门语句', !/if\s*\([^)]*启用幕后/.test(回调段));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
