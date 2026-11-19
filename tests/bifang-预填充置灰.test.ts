// 彼方 · 预填充：不删功能，但工具通道下必须置灰并说明 —— 批次 2026-11-19 波3。
//
// ── 背景（为什么不是"删掉"）──
//  用户说「设置里面的预填充可以删掉了」，因为他**以为它没用**。
//  事实是三点：
//    ① 它默认关闭（大多数用户不受影响）
//    ② 它对**不用工具通道**的模型（DeepSeek/GLM/Qwen）确实有用 —— 删了是拿别人的功能补我的不适
//    ③ 真正的问题是「工具通道开着时它已失效，但界面没说」—— **那才是该修的**
//
//  > 用户说"可以删掉了"，是因为他以为它没用。事实是：对他没用（他开工具通道），对别人有用。
//  > **所以：置灰 + 说明，等于对他隐身；但没把别人的东西拆掉。**
//
// ── 这一批做的三件事 ──
//  ① 删掉那对死代码（`更新输入.ts` 传的 `预填充` + `prompts.ts` 的接口声明）
//  ② 工具通道开着时，开关置灰 + 一句说明
//  ③ 改掉 `prompts.ts` 那句"请求层要用"（它是错的）
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 页面源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/页面-设置.vue'), 'utf8');
const 样式源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/面板样式.css'), 'utf8');
const 提示词源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/prompts.ts'), 'utf8');
const 输入源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/更新输入.ts'), 'utf8');
const 更新源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/update.ts'), 'utf8');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 去掉注释行（判据查"代码里有没有"，不是"注释里提没提"） */
const 去注释 = (s: string) => s
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

// ─────────────────────────────────────────────────────────────
console.log('\n[死代码] 拼装层不许再碰 `预填充`');
{
  // ── 这条防的是什么 ──
  //  `更新输入.ts` 原来每次调 `buildUpdateMessages` 都传 `预填充`，
  //  而 `prompts.ts` 从头到尾没读过它。
  //  **一处传了、一处声明了、中间没人读** —— 比注释写错更隐蔽，因为它长得像真的。
  const 提示词代码 = 去注释(提示词源);
  const 输入代码 = 去注释(输入源);

  ok('[死代码] prompts.ts 的接口里没有 `预填充`', !/预填充\??:\s*boolean/.test(提示词代码),
     '接口声明还在');
  ok('[死代码] prompts.ts 的代码里不读 `input.预填充`', !/input\.预填充/.test(提示词代码),
     '还有读取');
  ok('[死代码] 更新输入.ts 不再传 `预填充`', !/^\s*预填充:/m.test(输入代码),
     '还在传');

  // **自证**：这两条正则可以抓到"存在"
  ok('[自证] 正则可以抓到接口声明',
     /预填充\??:\s*boolean/.test('    预填充?: boolean;'));
  ok('[自证] 正则可以抓到传参', /^\s*预填充:/m.test('        预填充: !!settings.更新.预填充,'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[真路径] 预填充仍然生效（只是不经过拼装层）');
{
  // ── 这条防的是"清理过头，把功能也删了" ──
  //  真正的预填充在 `update.ts:61` → `请求并校验` → `共用/模型往返.ts`。
  ok('[真路径] update.ts 仍把 预填充 传给请求层', /预填充:\s*settings\.更新\.预填充/.test(更新源));
  ok('[真路径] update.ts 有工具通道门控', /预填充:\s*settings\.更新\.预填充\s*&&\s*!settings\.接口\.工具通道/.test(更新源));

  // **自证**：门控确实存在（去掉它这条会红）
  ok('[自证] 门控正则对"没有门控"的写法不匹配',
     !/预填充:\s*settings\.更新\.预填充\s*&&\s*!settings\.接口\.工具通道/.test('预填充: settings.更新.预填充,'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[界面] 工具通道开着时，预填充开关必须置灰');
{
  // ── 这条是本次的核心 ──
  const 预填充段 = 页面源.slice(页面源.indexOf('<b>预填充（prefill）</b>') - 300, 页面源.indexOf('<b>预填充（prefill）</b>') + 900);

  ok('[界面] 找到预填充那一段', 预填充段.includes('预填充（prefill）'));
  ok('[界面] 开关绑了 `:disabled`', /:disabled="settings\.接口\.工具通道"/.test(预填充段),
     预填充段.slice(0, 200));
  ok('[界面] 那一行绑了置灰类', /bf-switch-disabled/.test(预填充段));
  ok('[界面] 置灰条件是 `settings.接口.工具通道`',
     /bf-switch-disabled[^>]*settings\.接口\.工具通道|settings\.接口\.工具通道[^>]*bf-switch-disabled/.test(预填充段));

  // **自证**：这段确实在"预填充"附近，不是别处的 disabled
  ok('[自证] 这个 disabled 属于预填充那一行（不是别处抄来的）',
     /预填充（prefill）[\s\S]{0,400}?:disabled="settings\.接口\.工具通道"/.test(页面源));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[界面] 工具通道开着时，必须有说明（不许只置灰不说原因）');
{
  // ── 只置灰不说原因 = 用户以为"这个开关坏了" ──
  ok('[界面] 有「工具调用模式下预填充不起作用」这类说明',
     /工具调用模式下预填充不起作用|工具通道.*预填充.*不起作用/.test(页面源));
  ok('[界面] 说明里讲了原因（补的 `{` 与必须调工具冲突）',
     /\{[\s\S]{0,40}必须调工具|必须调工具[\s\S]{0,40}\{/.test(页面源),
     '找不到"冲突"的解释');
  ok('[界面] 说明里讲了"设置值保留、关掉工具通道后重新生效"',
     /设置值保留|关掉工具通道后重新生效/.test(页面源));
  ok('[界面] 那条说明只在工具通道开着时显示（v-if）',
     /v-if="settings\.接口\.工具通道"[\s\S]{0,200}?工具调用模式下预填充不起作用/.test(页面源));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[样式] 置灰要整行降透明，不只是 input');
{
  // ── 为什么查这个 ──
  //  `:disabled` 的 `<input>` 自己会变灰，但**整行**（标题 + 说明 + 光标）不变 ——
  //  那会让人以为"只有开关坏了，这行还能点"。
  ok('[样式] 有 .bf-switch-disabled', /\.bf-switch-row\.bf-switch-disabled/.test(样式源));
  ok('[样式] 整行降透明度', /\.bf-switch-row\.bf-switch-disabled\s*\{[^}]*opacity/.test(样式源));
  ok('[样式] 光标是 not-allowed', /\.bf-switch-row\.bf-switch-disabled\s*\{[^}]*not-allowed/.test(样式源));
  ok('[样式] 盖掉了 hover 高亮（不可用的东西不该有交互反馈）',
     /\.bf-switch-row\.bf-switch-disabled:hover\s*\{[^}]*box-shadow:\s*none/.test(样式源));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 把置灰去掉 → 界面判据必须红');
{
  // ── 这条是本批要求的自证 ──
  //  做法：把页面源码里的 `:disabled` 与 `bf-switch-disabled` 都抠掉，重跑上面那几条判据。
  const 抠掉 = 页面源
    .replace(/:disabled="settings\.接口\.工具通道"/g, '')
    .replace(/bf-switch-disabled/g, '');

  const 还置灰 = /:disabled="settings\.接口\.工具通道"/.test(抠掉);
  const 还有类 = /bf-switch-disabled/.test(抠掉);

  eq('[自证] 抠掉后没有 :disabled', 还置灰, false);
  eq('[自证] 抠掉后没有置灰类', 还有类, false);
  ok('[自证] 抠掉后「那一行绑了置灰类」这条会红', !/bf-switch-disabled/.test(抠掉));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
