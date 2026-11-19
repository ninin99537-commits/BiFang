// 一次性探针: #233 那个问题 —— 用界面现有能力，能不能拼出
//
//   #1 system     规则
//   #2 assistant  {{彼方:最近正文回复}}
//   #3 user       请按上面规则输出状态 JSON
//
// 三步要各自有入口：
//   ① 新增段并选 role（能加一个 assistant 段）
//   ② 调顺序（把某段挪到某段之前）
//   ③ 改 role（把 user 段改成 assistant）
//
// 判据不是"我觉得可以"，而是**在源码里找到每一个入口**，并**跑一遍拼装**验证产物。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(此处, '..', '..');
const 页面 = readFileSync(path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', '页面-拼装.vue'), 'utf8');
const 模板区 = 页面.slice(页面.indexOf('<template>'), 页面.indexOf('<style'));

console.log('=== ① 新增段 ===');
console.log('  有「＋ 在最上方插入」按钮:', /在最上方插入/.test(模板区));
console.log('  插入函数:', /function 插入段/.test(页面));
console.log('  新段默认 role:', /role: 'system'/.test(页面.slice(页面.indexOf('function 插入段'), 页面.indexOf('function 插入段') + 200)));

console.log('');
console.log('=== ② 调顺序 ===');
console.log('  有上移/下移按钮:', /上移|下移|↑|↓/.test(模板区));
console.log('  有拖拽:', /draggable|@dragstart/.test(模板区));
const 排序函数 = /function (上移|下移|移动段|交换段)/.test(页面);
console.log('  有排序函数:', 排序函数);

console.log('');
console.log('=== ③ 改 role ===');
console.log('  有 role 下拉:', /改段\(段\.id, 'role'/.test(模板区));
console.log('  下拉选项:', /v-for="r in role表"/.test(模板区));
console.log('  role 表:', (() => {
  const m = readFileSync(path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', '提示词模板.ts'), 'utf8');
  const i = m.indexOf('export const role表');
  return m.slice(i, i + 120).split('\n')[0];
})());

console.log('');
console.log('=== 结论 ===');
const 缺 = [];
if (!/在最上方插入/.test(模板区)) 缺.push('新增段');
if (!/上移|下移|↑|↓/.test(模板区) && !/draggable/.test(模板区)) 缺.push('调顺序');
if (!/改段\(段\.id, 'role'/.test(模板区)) 缺.push('改 role');
console.log(缺.length ? `❌ 缺：${缺.join('、')}` : '✅ 三步都有入口');
