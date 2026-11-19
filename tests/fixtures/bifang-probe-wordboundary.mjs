// 一次性探针: 确认 `\b` 对中文不生效（只读）
const 假源码 = 'export function 解析位置(输入: any) { return {}; }';
console.log('含 解析位置?', 假源码.includes('解析位置'));
console.log('/export function 解析位置\\b/ 匹配?', /export function 解析位置\b/.test(假源码));
console.log('/export function 解析位置/  匹配?', /export function 解析位置/.test(假源码));
console.log('/export (function) 解析位置\\b/ 匹配?', /export (function) 解析位置\b/.test(假源码));
console.log('');
console.log('→ \\b 是"ASCII 词边界"，中文不是 ASCII 词字符，所以 位置\\b 永远不成立');
console.log('  正确写法：用 (?![A-Za-z0-9_]) 或干脆不写边界（名字足够独特时）');
