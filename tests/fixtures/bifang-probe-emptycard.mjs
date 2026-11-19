// 一次性探针（只读）: 确认"状态卡为空时仍发 {}"是**既有行为**，不是本次改动引入的。
//
// 为什么必须查（§十二 #23：防护/行为要先分清"是不是我改出来的"）:
//   我的上一条探针断言"状态卡为空时那一行应该整行消失"，结果红。
//   若这是**本次改动引入**的，那是缺陷；若是**既有行为**，那我的预期写错了。
//
// 判据: 直接算 `JSON.stringify({}, null, 2)`，看它是不是空串。
//   不是空串 → 占位符非空 → 整行当然不消失。与搬不搬无关。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-emptycard.ts');
const 产物 = path.join(此处, '_probe-emptycard.mjs');

const 源码 = [
  "console.log('=== ① 纯语言事实：JSON.stringify 空对象 ===');",
  "console.log('  JSON.stringify({}, null, 2) = ' + JSON.stringify(JSON.stringify({}, null, 2)));",
  "console.log('  是空串? ' + (JSON.stringify({}, null, 2) === ''));",
  "console.log('  → 不是空串，所以\"状态卡为空\"时占位符**非空**，整行不会消失');",
  "",
  "console.log('');",
  "console.log('=== ② 这是既有行为还是本次引入的？ ===');",
  "console.log('  看旧代码的形状（git show 259bc1c:...）:');",
  "console.log('    const 状态卡段 = `\\\\n\\\\n这些NPC现有的幕后状态卡(…):\\\\n${JSON.stringify(input.currentCards, null, 2)}`');",
  "console.log('  → 空对象时输出 `\\\\n\\\\n这些NPC…:\\\\n{}`，**非空**');",
  "console.log('  → 搬之前也一样会发说明 + {}');",
  "console.log('  → **所以这是既有行为，不是本次改动引入的**');",
  "",
  "console.log('');",
  "console.log('=== ③ 那\"第一轮没有状态卡\"实际是什么样 ===');",
  "console.log('  第一轮时 currentCards 不是 {}，而是 loadData 后的 data.NPC（可能为空对象）');",
  "console.log('  所以模型会看到：');",
  "console.log('    这些NPC现有的幕后状态卡(均为上次更新时的状态, …):');",
  "console.log('    {}');",
  "console.log('  这说明\"现在没有任何卡\" —— **是有意义的信息**，不是噪音。');",
  "",
  "console.log('');",
  "console.log('=== ④ 那真正的\"空\"是什么时候 ===');",
  "console.log('  只有当 状态卡段 整个是空串时，整行才消失。');",
  "console.log('  而它现在是 `\\\\n\\\\n` + JSON，JSON 永远至少是 \"{}\" → **永远不会空**。');",
  "console.log('  → 所以 D10 那一行**永远会显示**（含说明）。');",
  "console.log('  → 这不是缺陷：说明跟着数据一起出现，而数据（哪怕是 {}）总是有。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
