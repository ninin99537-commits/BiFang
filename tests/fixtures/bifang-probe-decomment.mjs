// 一次性探针: 检查 `去注释` 对 export 行的影响（只读）
import { readFileSync } from 'node:fs';

function 去注释(源码) {
  return 源码
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const 样例 = [
  'export function 生成条目id(已用?: Set<string>): string {',
  'export function 解析位置(输入: any) { return {}; }',
  'export const 用户条目键 = [1];',
];
for (const s of 样例) {
  const 后 = 去注释(s);
  console.log('原:', JSON.stringify(s));
  console.log('后:', JSON.stringify(后));
  console.log('还含 export?', /^export (?:function|const|type|interface) /m.test(后));
  console.log('');
}

// 用真文件试
const 真 = readFileSync('src/彼方_NPC幕后生命状态系统/条目列表.ts', 'utf8');
const 真后 = 去注释(真);
const 导出 = [...真后.matchAll(/^export (?:function|const|type|interface) (\S+)/gm)].map(m => m[1]);
console.log('去注释后找到的导出:', JSON.stringify(导出));
console.log('原文找到的导出:', JSON.stringify([...真.matchAll(/^export (?:function|const|type|interface) (\S+)/gm)].map(m => m[1])));
