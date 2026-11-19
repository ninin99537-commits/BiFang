// 一次性探针: 查清测试里那三条"自证"为什么红（只读）
import { readFileSync } from 'node:fs';

const 源码 = readFileSync('src/彼方_NPC幕后生命状态系统/条目列表.ts', 'utf8');

console.log('=== ① 四个函数在源码里怎么写的 ===');
for (const 名 of ['迁移旧段', '条目转模板', '生成条目id', '去重条目id']) {
  const re = new RegExp(`export function ${名}\\b`);
  console.log('  ' + 名.padEnd(10), re.test(源码) ? '匹配' : '★ 不匹配');
  // 打印实际那一行
  const 行 = 源码.split('\n').find(l => l.includes(名));
  if (行) console.log('      实际行:', JSON.stringify(行.slice(0, 70)));
}

console.log('');
console.log('=== ② 假源码判据 ===');
const 假源码 = 'export function 解析位置(输入: any) { return {}; }';
console.log('  测试用正则:', '/export (function|const|type|interface) 解析位置\\b/');
console.log('  匹配吗?', /export (function|const|type|interface) 解析位置\b/.test(假源码));

console.log('');
console.log('=== ③ import 判据 ===');
const 假import = "import { 解析位置 } from './条目列表';";
console.log('  测试用正则:', '/import\\s+(?:type\\s+)?\\{[^}]*\\b解析位置\\b[^}]*\\}\\s*from/');
console.log('  匹配吗?', /import\s+(?:type\s+)?\{[^}]*\b解析位置\b[^}]*\}\s*from/.test(假import));

console.log('');
console.log('=== ④ 存量留痕: 去重条目id 里到底打不打 warn ===');
const 段 = 源码.slice(源码.indexOf('export function 去重条目id'), 源码.indexOf('export function 迁移旧段'));
console.log('  段里含 console.warn?', /console\.warn/.test(段));
console.log('  段里含 warn 字样?', /warn/.test(段));
