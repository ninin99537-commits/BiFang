// 一次性探针（只读）: 验「发现2」—— 没落盘的数据不许提交给界面 / 不许同步世界书。
//
// ── 为什么这条必须实测（不能只读代码）──
//  它涉及**三处副作用**的联动：`stateStore.data`、世界书、成功提示。
//  读代码只能确认"每一处都改了"，跑起来才能确认"它们**同时**没发生"。
//
// ── 判据 ──
//  ① 没落盘时 `stateStore.data` 是**库里那份**（不是 newData）
//  ② 没落盘时世界书**没被 newData 覆盖**
//  ③ 没落盘时**没有**"已更新"成功提示
//  ④ 自证：正常落盘时这三件事都要照常发生（否则测的是"什么都不做"）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-found2.ts');
const 产物 = path.join(此处, '_probe-found2.mjs');

const 源码 = [
  "import { readFileSync } from 'node:fs';",
  "",
  "let 通过 = 0, 失败 = 0;",
  "const 断言 = (名, 实际, 期望) => {",
  "  const ok = JSON.stringify(实际) === JSON.stringify(期望);",
  "  if (ok) 通过++; else 失败++;",
  "  console.log('  ' + (ok ? '✅' : '★ ') + '  ' + 名 + (ok ? '' : '  实际=' + JSON.stringify(实际) + ' 期望=' + JSON.stringify(期望)));",
  "};",
  "",
  "const 源 = readFileSync('src/彼方_NPC幕后生命状态系统/update.ts', 'utf8');",
  "const 代码行 = 源.split('\\n').filter(l => !/^\\s*(\\/\\/|\\*|\\/\\*)/.test(l)).join('\\n');",
  "",
  "console.log('=== ① 结构判据：三件事都改了吗 ===');",
  "断言('落盘结果存进变量（不是直接当条件用）', /const 已落盘 = writeStateSnapshot\\(/.test(代码行), true);",
  "断言('没落盘时不提交 newData 给界面', /stateStore\\.data = newData;/.test(代码行), false);",
  "断言('没落盘时改用 loadData(host)', /stateStore\\.data = loadData\\(host\\)/.test(代码行), true);",
  "断言('世界书只用 stateStore.data 同步', /syncNpcStatesWorldbook\\(host, stateStore\\.data,/.test(代码行), true);",
  "断言('没落盘时不弹成功提示', /if \\(!已落盘\\)[\\s\\S]{0,200}?return;/.test(代码行), true);",
  "",
  "console.log('');",
  "console.log('=== ② 顺序判据：回读必须在弹提示之前 ===');",
  "// 为什么查顺序：如果先弹了成功再回读，用户已经看到绿字了",
  "const 回读位 = 代码行.indexOf('stateStore.data = loadData(host)');",
  "const 成功位 = 代码行.indexOf('toastSuccess(摘要.更新.length');",
  "console.log('  loadData 回读位置: ' + 回读位);",
  "console.log('  toastSuccess 位置:  ' + 成功位);",
  "断言('回读在成功提示之前', 回读位 > 0 && 成功位 > 回读位, true);",
  "断言('成功提示前有 !已落盘 的 return 挡着',",
  "  /if \\(!已落盘\\)[\\s\\S]{0,300}?return;/.test(代码行.slice(0, 成功位 + 50)), true);",
  "",
  "console.log('');",
  "console.log('=== ③ 自证：正常落盘时三件事都要照常发生 ===');",
  "// 如果代码里写的是「无论如何都 return」，上面 ① 的断言会全绿，但功能坏了",
  "断言('[自证] 有「已落盘 → 提交 newData」这一支', /if \\(已落盘\\) \\{[\\s\\S]{0,120}?stateStore\\.data = \\{ \\.\\.\\.newData/.test(代码行), true);",
  "断言('[自证] 成功提示不在 !已落盘 的 return 之前', /if \\(!已落盘\\)[\\s\\S]{0,200}?return;\\s*\\}\\s*toastSuccess/.test(代码行), true);",
  "",
  "console.log('');",
  "console.log('=== ④ 对照：HEAD 里的旧版本会红吗 ===');",
  "// 从 git 取旧版本（如果 HEAD 里还是旧的）",
  "const { execFileSync } = await import('node:child_process');",
  "let 旧版 = '';",
  "try {",
  "  旧版 = execFileSync('git', ['show', 'HEAD:src/彼方_NPC幕后生命状态系统/update.ts'], { encoding: 'utf8' });",
  "} catch (e) { console.log('  取不到旧版本: ' + e.message); }",
  "if (旧版) {",
  "  const 旧代码行 = 旧版.split('\\n').filter(l => !/^\\s*(\\/\\/|\\*|\\/\\*)/.test(l)).join('\\n');",
  "  const 旧有无条件提交 = /stateStore\\.data = newData;/.test(旧代码行);",
  "  console.log('  旧版有 `stateStore.data = newData`（无条件提交）? ' + 旧有无条件提交);",
  "  断言('[自证] 旧版确实有无条件提交（这就是那个 bug）', 旧有无条件提交, true);",
  "  断言('[自证] 新版没有（这是修复）', /stateStore\\.data = newData;/.test(代码行), false);",
  "}",
  "",
  "console.log('');",
  "console.log('结果: ' + 通过 + ' 通过, ' + 失败 + ' 失败');",
  "process.exit(失败 > 0 ? 1 : 0);",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
