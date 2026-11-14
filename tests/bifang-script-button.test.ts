// 彼方 · 脚本按钮(酒馆助手脚本库里的「按钮」)(2026-10-23)。
//
// 真机痛点: 悬浮球可能被拖出视口、被收纳坞收走、或被别的插件盖住 —— 这时面板就再也打不开了。
// 做法: 用酒馆助手脚本自己的按钮机制(appendInexistentScriptButtons + getButtonEvent),
// 点按钮 → host 能力 → 挂载器派发 bf-open-panel → iframe 里的 Vue 打开面板。
//
// 这里钉四件事: ① 平台调用只在 host.ts(平台直连检查的同一口径);
// ② host 暴露了 script 能力; ③ 入口注册并监听了按钮、且只挂载一次;
// ④ 事件链真的通到 Vue 的 panelOpen。
import 请求源 from '../src/彼方_NPC幕后生命状态系统/host.ts?raw';
import 入口源 from '../src/彼方_NPC幕后生命状态系统/index.ts?raw';
import 挂载源 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.ts?raw';
import 界面源 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        实际 ${JSON.stringify(actual)}\n        期望 ${JSON.stringify(expected)}`);
  }
}
function ok(label: string, 条件: unknown) {
  check(label, !!条件, true);
}

/** 去掉注释, 免得注释里提到 API 名被算成调用(与 platform-usage.mjs 同口径) */
function 去注释(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

console.log('\n[1] 平台调用收在 host.ts: 其余三个文件一个都不许直接碰');
{
  const 平台名 = ['appendInexistentScriptButtons', 'getButtonEvent'];
  ok('host.ts 里有 appendInexistentScriptButtons', 去注释(请求源).includes('appendInexistentScriptButtons('));
  ok('host.ts 里有 getButtonEvent', 去注释(请求源).includes('getButtonEvent('));
  for (const [名, 源] of [['index.ts', 入口源], ['悬浮球界面.ts', 挂载源], ['悬浮球界面.vue', 界面源]] as const) {
    for (const api of 平台名) {
      ok(`${名} 不直接调 ${api}`, !去注释(源).includes(api));
    }
  }
}

console.log('\n[2] host 能力: script.注册按钮 / script.监听按钮');
{
  ok('定义了 HostScript 接口', 请求源.includes('interface HostScript'));
  ok('Host 上挂了 script 字段', /script:\s*HostScript;/.test(请求源));
  ok('注册按钮 = appendInexistentScriptButtons', /注册按钮:\s*name => appendInexistentScriptButtons\(\[\{ name, visible: true \}\]\)/.test(请求源));
  ok('监听按钮 = eventOn(getButtonEvent(...))', /监听按钮:[\s\S]{0,160}eventOn\(getButtonEvent\(name\)/.test(请求源));
  ok('HostScript 已导出', /export type \{[^}]*HostScript/.test(请求源));
}

console.log('\n[3] 入口: 注册 + 监听, 且只挂载一次');
{
  ok('挂载器只调用一次', (入口源.match(/mountFloatingOrb\(host\)/g) || []).length === 1);
  ok('拿到界面句柄', /const 界面 = mountFloatingOrb\(host\)/.test(入口源));
  ok('按钮名常量', /const 脚本按钮名 = '打开彼方'/.test(入口源));
  ok('注册了按钮', /host\.script\.注册按钮\(脚本按钮名\)/.test(入口源));
  ok('监听了点击并转给界面', /host\.script\.监听按钮\(脚本按钮名, \(\) => 界面\.打开面板\(\)\)/.test(入口源));
  ok('注册失败不拖垮脚本(try/catch)', /try \{[\s\S]{0,200}注册按钮[\s\S]{0,300}\} catch/.test(入口源));
}

console.log('\n[4] 挂载器: 返回打开面板句柄, 并真的派发事件');
{
  ok('返回 { 打开面板 }', /return \{ 打开面板: \(\) => 打开面板\(\) \};/.test(挂载源));
  ok('句柄里有 contentWindow', /const win = \(\$app\[0\] as HTMLIFrameElement\)\.contentWindow/.test(挂载源));
  ok('直接调用 iframe window 上的 __bfOpenPanel', /win\?\.__bfOpenPanel\?\.\(\)/.test(挂载源));
  ok('不再用 dispatchEvent 派发(JS 上下文与 DOM 上下文不是同一个 window)', !挂载源.includes("new win.CustomEvent('bf-open-panel')"));
  ok('iframe 未就绪时静默(try/catch)', /try \{[\s\S]{0,200}__bfOpenPanel[\s\S]{0,200}\}[\s\S]{0,20}catch/.test(挂载源));
}

console.log('\n[5] Vue 侧: 挂到正确的 window / 卸载时删除 / 真的打开面板');
{
  // 关键: 必须挂到 frameWin(组件所在 iframe 的 window), 不能用裸 window ——
  // 组件 JS 跑在脚本 iframe 的上下文里, 裸 window 与 contentWindow 不是同一个对象。
  ok('挂到 frameWin 而不是裸 window', /const win = frameWin\.value as any;[\s\S]{0,80}win\.__bfOpenPanel = 打开面板入口/.test(界面源));
  ok('onUnmounted 里删除 __bfOpenPanel', /delete win\.__bfOpenPanel/.test(界面源));
  ok('不再用裸 window 监听事件', !界面源.includes("window.addEventListener('bf-open-panel'"));
  // 打开动作统一收在 展开面板(): 球 / 脚本按钮 / 看门狗之后的重试都走它, 顺手记一行耗时
  ok('按钮入口转给 展开面板', /function 打开面板入口\(\) \{\s*\n\s*展开面板\('脚本按钮'\)/.test(界面源));
  // CRLF 检出时每行多一个 \r, 字符窗口会失真 —— 输入先归一为 LF, 窗口严格度不变、不被换行符骗
  const 界面源归一 = 界面源.replace(/\r\n/g, '\n');
  ok('展开面板把 panelOpen 置 true', /function 展开面板\(来源: string\): void \{[\s\S]{0,120}panelOpen\.value = true/.test(界面源归一));
  ok('展开面板立刻 applyFrame', /function 展开面板\(来源: string\): void \{[\s\S]{0,120}applyFrame\(\)/.test(界面源归一));
}

console.log(fail === 0 ? `\n彼方脚本按钮: 全部通过 (${pass} 断言)` : `\n彼方脚本按钮: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);


