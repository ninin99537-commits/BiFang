// 共用 · 提示条: 面板开着的时候把提示条压住, 关掉再补发(2026-11-07 用户要求)。
//
// 为什么要这样: 面板一开就盖住球和弹窗的位置, 此刻弹条既看不清、又挡操作;
// 但"失败提示"不能因此消失 —— 压住 ≠ 丢掉, 攒着的按原顺序在关面板时补发。
//
// 三个插件(剧情导演 / 彼方 / 烟火)共用 共用/提示条.ts 与 共用/面板机制.ts,
// 所以这一份行为用例覆盖三家; 末尾再钉各家的接线(别有人把线剪了)。
import { JSDOM } from 'jsdom';
import { 建提示条 } from '../src/共用/提示条';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

// 提示条画在**酒馆页面**(父文档)上, 而脚本跑在 iframe 里 —— 这里照这个形状搭一个假父文档
const 父文档 = new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document;
(globalThis as any).window = { parent: { document: 父文档 } } as any;
(globalThis as any).document = 父文档;

const 配色键们 = ['bg', 'border', 'text', 'accent', 'errorBg', 'errorBorder', 'errorText'] as const;
const 造 = (放行?: (type: any) => boolean) =>
  建提示条({
    前缀: 'tt',
    配色变量: Object.fromEntries(配色键们.map(键 => [键, `--tt-${键}`])) as any,
    配色兜底: Object.fromEntries(配色键们.map(键 => [键, '#000'])) as any,
    严重度色: { success: '#0f0', info: '#00f', warning: '#fa0', error: '#f00' },
    球半径: 22,
    兜底锚点: () => ({ x: 100, y: 100 }),
    放行,
  });

const 堆栈 = () => 父文档.getElementById('tt-toast-stack');
const 条们 = () => [...(堆栈()?.children ?? [])] as HTMLElement[];
const 文字 = () => 条们().map(el => el.textContent ?? '');

console.log('\n[1] 面板没开: 照旧立刻出现');
{
  const 条 = 造();
  条.toastSuccess('第一轮完成');
  check('立刻有一条', 条们().length, 1);
  ok('内容对', 文字()[0].includes('第一轮完成'));
}

console.log('\n[2] 面板开着: 压住, 但一条都不丢');
{
  父文档.body.innerHTML = '';
  const 条 = 造();
  条.setToastSuppressed(true);
  条.toastError('推进失败: 401');
  check('压住期间不弹', 条们().length, 0);
  条.toastSuccess('这一轮编排出结果了');
  check('继续压住', 条们().length, 0);
  条.setToastSuppressed(false);
  check('放开后两条都补发', 条们().length, 2);
  ok('先攒的先出(顺序没乱)', 文字()[0].includes('401') && 文字()[1].includes('编排出结果'));
}

console.log('\n[3] 攒太多只留最近几条(别把一整局的条一次糊上去)');
{
  父文档.body.innerHTML = '';
  const 条 = 造();
  条.setToastSuppressed(true);
  for (let i = 1; i <= 10; i++) 条.toastInfo(`第 ${i} 条`);
  条.setToastSuppressed(false);
  check('上限 6 条', 条们().length, 6);
  ok('留下的是最近的(第 5~10 条)', 文字()[0].includes('第 5 条') && 文字()[5].includes('第 10 条'));
}

console.log('\n[4] 补发时仍过档位闸门(这中间可能被调成「关闭」)');
{
  父文档.body.innerHTML = '';
  const 条 = 造(type => type !== 'error');
  条.setToastSuppressed(true);
  条.toastError('不该出的错');
  条.toastSuccess('该出的成功');
  条.setToastSuppressed(false);
  check('只有放行的那条出来', 条们().length, 1);
  ok('出来的是成功那条', 文字()[0].includes('该出的成功'));
}

console.log('\n[5] 重复设置同一个状态不会重复补发');
{
  父文档.body.innerHTML = '';
  const 条 = 造();
  条.setToastSuppressed(true);
  条.toastInfo('只该出现一次');
  条.setToastSuppressed(true);
  条.setToastSuppressed(false);
  check('只有一条', 条们().length, 1);
  条.setToastSuppressed(false);
  check('再放开一次也不重复', 条们().length, 1);
}

console.log('\n[6] 面板打开的那一刻, 屏幕上已经挂着的条要立刻撤掉');
{
  // 用户报的就是这一种: 刚编排完弹了一条, 随后点开面板 → 条还挂在球的左侧(=面板左边)
  父文档.body.innerHTML = '';
  const 条 = 造();
  条.toastSuccess('这一轮编排出结果了');
  check('先有一条在屏幕上', 条们().length, 1);
  条.setToastSuppressed(true);
  check('面板一开就撤掉', 条们().length, 0);
  条.toastInfo('面板开着期间来的');
  check('这期间来的一条也不弹', 条们().length, 0);
  条.setToastSuppressed(false);
  check('关面板只补发压住的那条(已撤掉的不重放)', 条们().length, 1);
  ok('补发的是后来那条', 文字()[0].includes('面板开着期间来的'));
}

console.log('\n[7] 只压自己那一家(别越界: 三家是独立脚本, 各有各的提示条)');
{
  const fs = await import('node:fs');
  const 提示条源 = fs.readFileSync('src/共用/提示条.ts', 'utf8');
  ok('不看别的插件的面板', !提示条源.includes('有面板开着') && !提示条源.includes('面板开合事件'));
  ok('也不写父页面标记', !提示条源.includes('data-面板开着'));
}

console.log('\n[8] 剧情导演的球气泡: 面板一开就别再挂(用户看到的就是它)');
{
  const fs = await import('node:fs');
  const 面板 = fs.readFileSync('src/剧情导演/悬浮球界面.vue', 'utf8');
  ok('面板开着时不显示气泡', /function 显示球气泡\(\) \{[\s\S]{0,160}if \(panelOpen\.value\) return;/.test(面板));
  ok('面板一开就把已有气泡收掉', /watch\(panelOpen, 开 => \{[\s\S]{0,80}if \(开\) 藏起球气泡\(\);/.test(面板));
}

console.log('\n[9] 三个插件的接线(共用一份, 别剪线)');
{
  const fs = await import('node:fs');
  // 用例从仓库根跑(与 pnpm test 一致); 打包产物在 tests/.build/, 所以不能按 import.meta.url 找源码
  const 读 = (p: string) => fs.readFileSync(p, 'utf8');
  const 提示条源 = 读('src/共用/提示条.ts');
  const 面板源 = 读('src/共用/面板机制.ts');
  ok('出口里有 setToastSuppressed', /setToastSuppressed:\s*\(suppressed: boolean\)/.test(提示条源));
  ok('showToast 先看抑制标记', /if \(抑制\) \{[\s\S]{0,120}暂存\.push/.test(提示条源));
  ok('面板一开就撤掉屏幕上的条', /if \(抑制\) \{[\s\S]{0,200}撤掉屏幕上的条\(\)/.test(提示条源));
  ok('关面板时补发压住的', /if \(!之前\) return;[\s\S]{0,160}showToast/.test(提示条源));
  ok('面板机制给了一个可选钩子', /设抑制\?\(抑制: boolean\): void/.test(面板源));
  ok('面板机制在 panelOpen 变化时调它', /watch\(panelOpen, 开 => 配置\.提示条\.设抑制\?\.\(开\)\)/.test(面板源));

  for (const 包 of ['剧情导演', '彼方_NPC幕后生命状态系统', '烟火_世界运转']) {
    ok(`${包} 的 toast 导出它`, /setToastSuppressed = 提示条\.setToastSuppressed/.test(读(`src/${包}/toast.ts`)));
  }
  for (const 面 of ['剧情导演', '烟火_世界运转']) {
    ok(`${面} 把抑制接进面板机制`, /设抑制: setToastSuppressed/.test(读(`src/${面}/悬浮球界面.vue`)));
  }
  for (const 面 of ['彼方_NPC幕后生命状态系统']) {
    ok(`${面} 自己盯 panelOpen`, /watch\(panelOpen, 开 => setToastSuppressed\(开\)\)/.test(读(`src/${面}/悬浮球界面.vue`)));
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);

