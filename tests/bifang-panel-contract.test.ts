// 彼方 · 面板上下文契约：壳 provide 的键、页面声明的字段、页面脚本的解构、模板真正用到的名字
// —— 这四者必须对得上。
//
// 起因（真机 bug，2026-10-19）：`selectedNpcCard` 在壳里定义、在 `页面-NPC.vue` 的模板里用了 15 次，
// 但既没进 `页面字段.NPC`、也没进页面的解构、更没进 provide 载荷。于是模板里那个名字是 undefined，
// `v-if="selectedNpcCard"` 直接判假 —— **NPC 详情区永远显示"从左侧选择一个 NPC"**。
// 构建不报错（transpileOnly，且 .vue 模板不参与类型检查），用例当时也没覆盖到，只能靠人点开发现。
//
// `面板上下文.校验面板` 本来就是为了拦这类事，但它只核对"壳 provide 了没有"，核对不了
// "模板有没有用到一个没人给的名字"。这个用例把缺的那一半补上：
//   ① 模板里的每个标识符，都必须在页面脚本的作用域里（解构 + 其余声明 + v-for 局部变量）；
//   ② 页面脚本解构的名字集合，必须与 `页面字段[页面]` 逐字一致（那份清单的注释就是这么要求的）；
//   ③ `页面字段` 里出现的每个键，壳的 provide 载荷里都必须有。
// 现在只有一份实现（社区版已删除），所以只查它。
import 原版一致性面板源 from '../src/彼方_NPC幕后生命状态系统/一致性面板.ts?raw';
import 原版NPC面板源 from '../src/彼方_NPC幕后生命状态系统/NPC面板.ts?raw';
import 原版仪表盘面板源 from '../src/彼方_NPC幕后生命状态系统/仪表盘面板.ts?raw';
import 原版日志面板源 from '../src/彼方_NPC幕后生命状态系统/日志面板.ts?raw';
import 原版设置面板源 from '../src/彼方_NPC幕后生命状态系统/设置面板.ts?raw';
import 原版壳 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';
import 原版日志 from '../src/彼方_NPC幕后生命状态系统/页面-日志.vue?raw';
import 原版一致性 from '../src/彼方_NPC幕后生命状态系统/页面-一致性.vue?raw';
import 原版NPC from '../src/彼方_NPC幕后生命状态系统/页面-NPC.vue?raw';
import 原版仪表盘 from '../src/彼方_NPC幕后生命状态系统/页面-仪表盘.vue?raw';
import 原版设置 from '../src/彼方_NPC幕后生命状态系统/页面-设置.vue?raw';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 模板与脚本各切一块 */
function 取模板(text: string): string {
  const m = text.match(/<template>([\s\S]*)<\/template>/);
  return m ? m[1] : '';
}
function 取脚本(text: string): string {
  const m = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : '';
}

/** 页面脚本作用域里可用的名字：use面板 解构 + 其余声明 + 导入 */
function 脚本名字(script: string): Set<string> {
  const names = new Set<string>();
  const 解构 = script.match(/const\s*\{([\s\S]*?)\}\s*=\s*use[\w\u4e00-\u9fa5]*面板\s*\(/);
  if (解构) {
    for (const part of 解构[1].split(',')) {
      const s = part.replace(/^\s*type\s+/, '').trim();
      if (!s)
        continue;
      const as = s.split(/\s+as\s+/);
      const colon = as[0].split(':');
      names.add((colon[1] ?? colon[0]).trim());
    }
  }
  for (const m of script.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)/g))
    names.add(m[1]);
  for (const m of script.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const part of m[1].split(',')) {
      const s = part.replace(/^\s*type\s+/, '').trim();
      if (!s)
        continue;
      const as = s.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }
  for (const m of script.matchAll(/import\s+([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)\s+from/g))
    names.add(m[1]);
  return names;
}

/** 模板里所有表达式片段（插值 + 各类指令/绑定属性） */
function 表达式片段(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g))
    out.push(m[1]);
  for (const m of template.matchAll(/(?:^|\s)(?:v-if|v-else-if|v-show|v-for|v-model(?::[\w-]+)?|:[\w.-]+|@[\w.-]+)="([^"]*)"/g))
    out.push(m[1]);
  return out;
}

const 内置 = new Set([
  'true', 'false', 'null', 'undefined',
  'Math', 'Object', 'String', 'Number', 'Boolean', 'Array', 'JSON', 'Date',
  'if', 'else', 'return', 'typeof', 'in', 'of', 'new', 'this', 'void', 'instanceof',
  '$event', '$refs', '$slots', '$attrs',
]);

/** 模板里用到、但页面作用域里没有的名字 */
function 无法解析的名字(text: string): string[] {
  const template = 取模板(text);
  const 可用 = 脚本名字(取脚本(text));

  // v-for 引入的局部名：`x in xs` / `(a, b) in xs` / `[a, b] in xs`
  for (const m of template.matchAll(/v-for="\s*(?:\(([^)]*)\)|\[([^\]]*)\]|([^)\]]*?))\s+in\s+/g)) {
    const 段 = m[1] ?? m[2] ?? m[3] ?? '';
    for (const part of 段.split(',')) {
      const name = part.trim().split(/[\s:{}]/)[0];
      if (name)
        可用.add(name);
    }
  }

  const 可疑 = new Set<string>();
  for (const expr of 表达式片段(template)) {
    // 去掉字符串字面量，免得文案里的词被当成标识符
    const clean = expr
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
      // ── 剥掉 TS 类型断言 `as XXX`（2026-11-20，需求方 #421 ③）──
      //
      //  `($event.target as HTMLInputElement).value` 是 **Vue 3 + TS 的合法模板语法**。
      //  原来这里会把 `as` 和 `HTMLInputElement` 当成"未解析的名字"报出来 ——
      //  **是判据的错，不是代码的错。**
      //
      //  ⚠ **不许改成白名单**（把那三个词列进去就完事）——
      //    那下次 `as HTMLTextAreaElement` 又会红，再下次 `as HTMLSelectElement` 还是红。
      //    要剥的是**这个语法形态**，不是某几个词。
      //
      //  形态：`as` + 可选的泛型/命名空间 + 类型名（可能带 `[]`、`<...>`、`|` 联合）
      .replace(/\bas\s+(?:[\w$]+\.)*[\w$]+(?:\s*<[^>]*>)?(?:\s*\[\s*\])?(?:\s*\|\s*(?:[\w$]+\.)*[\w$]+)*/g, '');
    for (const m of clean.matchAll(/(?<![.\w$\u4e00-\u9fa5])([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)/g)) {
      const id = m[1];
      if (内置.has(id) || 可用.has(id))
        continue;
      // 对象字面量的键（`{ active: cond }`）
      if (/^\s*:/.test(clean.slice((m.index ?? 0) + id.length)))
        continue;
      可疑.add(id);
    }
  }
  return [...可疑].sort();
}

/** 页面脚本里 use面板 解构出来的名字 */
function 解构名字(text: string): string[] {
  const script = 取脚本(text);
  const m = script.match(/const\s*\{([\s\S]*?)\}\s*=\s*use[\w\u4e00-\u9fa5]*面板\s*\(/);
  if (!m)
    return [];
  return m[1]
    .split(',')
    .map(part => part.replace(/^\s*type\s+/, '').trim())
    .filter(Boolean)
    .map((s) => {
      const as = s.split(/\s+as\s+/);
      const colon = as[0].split(':');
      return (colon[1] ?? colon[0]).trim();
    })
    .sort();
}

/** 壳的 provide 载荷里的键（去掉注释行） */
function 载荷键(shell: string): string[] {
  const m = shell.match(/provide\(面板键,\s*\{([\s\S]*?)\n\}\);/);
  if (!m)
    return [];
  const body = m[1]
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...new Set(
    body
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean),
  )].sort();
}

/** 某份面板 module 里 `export type X面板 = {...}` 的键 */
function 类型键(源: string): string[] {
  const m = 源.match(/export type [\w\u4e00-\u9fa5]*面板 = \{([\s\S]*?)\n\};/);
  if (!m)
    return [];
  return [...m[1].matchAll(/^\s{2}([\w\u4e00-\u9fa5]+)\??:/gm)].map(x => x[1]).sort();
}

const 原版页面 = { 日志: 原版日志, 一致性: 原版一致性, NPC: 原版NPC, 仪表盘: 原版仪表盘, 设置: 原版设置 };

console.log('\n[1] 模板里用到的每个名字，页面脚本里都拿得到（selectedNpcCard 那个 bug 的正面判据）');
{
  for (const [名, 文本] of Object.entries(原版页面)) {
    const 缺 = 无法解析的名字(文本);
    check(`原版 ${名}：模板名字都能解析`, 缺, []);
  }

  // 判据能失败：把 selectedNpcCard 从解构里抠掉，必须报出来
  const 挖掉 = 原版NPC.replace('selectedNpc, selectedNpcCard,', 'selectedNpc,');
  ok('反面对照：抠掉 selectedNpcCard 后判据会报错', 无法解析的名字(挖掉).includes('selectedNpcCard'));

  // ── 类型断言不许被当成"未解析的名字"（2026-11-20 #421 ③）──
  //
  //  `($event.target as HTMLInputElement).value` 是 Vue 3 + TS 的合法模板语法。
  //  判据原来把 `as` 和 `HTMLInputElement` 都报出来了 —— 是判据的错。
  //
  //  自证两头都要有：
  //    ① 喂类型断言 → **不许报**（否则下次换个类型名又红）
  //    ② 喂真没解构的变量 → **必须报**（否则等于把判据删了）
  const 造模板 = (expr: string) => `<template><input @input="${expr}" /></template>\n<script setup lang="ts">\nconst a = 1;\n</script>\n`;
  check('[自证] 类型断言 as HTMLInputElement 不报错',
    无法解析的名字(造模板('a = ($event.target as HTMLInputElement).value')), []);
  check('[自证] 类型断言 as HTMLDivElement 也不报错（换个类型名同样过）',
    无法解析的名字(造模板('a = ($event.target as HTMLDivElement).id')), []);
  check('[自证] 类型断言 as HTMLTextAreaElement 同样过',
    无法解析的名字(造模板('a = ($event.target as HTMLTextAreaElement).value')), []);
  ok('[自证] 真没解构的变量必须报',
    无法解析的名字(造模板('a = 某个真没解构的变量')).length > 0);
}

console.log('\n[2] 五个页面：解构的名字 == 它自己那份面板的类型键');
{
  // 页面 → [页面源码, 面板源码]
  const 页面到面板: Record<string, [string, string]> = {
    一致性: [原版一致性, 原版一致性面板源],
    NPC: [原版NPC, 原版NPC面板源],
    仪表盘: [原版仪表盘, 原版仪表盘面板源],
    日志: [原版日志, 原版日志面板源],
    设置: [原版设置, 原版设置面板源],
  };
  check('五个页面都有对应的面板 module', Object.keys(页面到面板).length, 5);
  for (const [名, 两份] of Object.entries(页面到面板)) {
    const [原版页面源, 原版面板源] = 两份;
    check(`原版 ${名}：解构 == 面板类型键`, 解构名字(原版页面源), 类型键(原版面板源));
    ok(`${名}面板：是具名类型(不是 Record<string, any>)`, 原版面板源.includes(`export type ${名}面板 = {`));
    ok(`${名}面板：导出 use${名}面板()`, 原版面板源.includes(`export function use${名}面板`));
    ok(`${名}面板：自带 InjectionKey`, 原版面板源.includes(`export const ${名}面板键`));
  }
}

console.log('\n[2b] 返回语句里若用 `...源` 摊开，必须有注释说明为什么可以摊');
{
  // ── 这条防的是"接口自动膨胀"的机制（2026-11-20 需求方 #476）──
  //
  //  `...源` 会把**入参里的每一个键**自动漏进返回。于是：
  //    · 加一个入参 → 返回自动多一个键
  //    · 而页面可能根本不用它 → 面板契约判据（上面那条）会红
  //
  //  日志面板就是这么红的：`...源` 把 `copyText` 摊进了返回，而页面不用。
  //
  //  **但摊开本身不是错** —— 设置面板的摊开就是安全的：
  //  入参是 `Omit<设置面板, 三个派生键>`，摊开补上那三个正好等于完整类型，
  //  而且 23 个键页面全在用。
  //
  //  所以判据不是"禁止摊开"，而是：**摊开必须有注释说明为什么可以摊**。
  //  没有说明的摊开 = 下一个人不知道它是不是刚好的。
  const 面板文件们 = ['NPC面板.ts', '仪表盘面板.ts', '日志面板.ts', '设置面板.ts'];
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');

  for (const 文件 of 面板文件们) {
    const 源 = readFileSync(path.join(process.cwd(), 'src', '彼方_NPC幕后生命状态系统', 文件), 'utf8');
    // 只看代码行（去掉注释），找 return { ...源
    const 有摊开 = /return\s*\{\s*\.\.\.源/.test(源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'));
    if (!有摊开) {
      ok(`  ${文件}：没有摊开（显式列出键）`, true);
      continue;
    }
    // 有摊开 → 必须在附近有说明
    const 有说明 = /摊开是\*\*安全的\*\*|不能用 `\.\.\.源`|为什么可以摊|摊开之后补上/.test(源);
    ok(`  ${文件}：用了摊开，且有注释说明为什么可以摊`, 有说明,
      '加了 `...源` 却没写理由 —— 下一个人不知道它是不是刚好的');
  }

  // **自证**：正则可以区分"有说明"和"没说明"
  const 无说明 = 'export function f(源: X): Y { return { ...源, a }; }';
  const 有说明样本 = '// 这里的摊开是**安全的**：入参是 Omit<…>\nexport function f(源: X): Y { return { ...源, a }; }';
  ok('[自证] 无注释的摊开会被抓出来', !/摊开是\*\*安全的\*\*|为什么可以摊|摊开之后补上/.test(无说明));
  ok('[自证] 有注释的摊开能通过', /摊开是\*\*安全的\*\*|为什么可以摊|摊开之后补上/.test(有说明样本));
}

console.log('\n[3] 机制统一：旧的大对象已退场，五个面板各 provide 一次');
{
  for (const [名, 文本] of Object.entries(原版页面))
    ok(`原版 ${名}：不再用 use面板`, !取脚本(文本).includes('use面板'));
  for (const 名 of ['一致性', 'NPC', '仪表盘', '日志', '设置']) {
    ok(`原版壳 provide 了 ${名}面板键`, 原版壳.includes(`provide(${名}面板键`));
  }
  ok('壳不再引用 面板上下文', !原版壳.includes('面板上下文'));
  ok('壳不再有那个 68 键的大对象载荷', !原版壳.includes('provide(面板键'));
}
console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);


