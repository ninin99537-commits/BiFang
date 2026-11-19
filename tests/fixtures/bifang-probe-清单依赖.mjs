// 一次性探针: 删掉列表路径后, 清单还能不能算?
//
// 关键依赖: `生成清单` 用 `解析.被引用`（列表侧）+ `引用.被引用`（锚点侧）
// + `找位置(内容)`（在 messages 里找零件内容落在第几条）。
// 若列表路径删了, `解析` 就没了 —— 清单要靠什么判断"被引用"?
//
// 而模板路径下,"被引用"这个概念本身变了：占位符不是"引用"，它就是模板的一部分。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const 彼方 = path.join(process.cwd(), 'src', '彼方_NPC幕后生命状态系统');
const s = readFileSync(path.join(彼方, 'prompts.ts'), 'utf8');

const i = s.indexOf('const 生成清单 =');
const j = s.indexOf('const 打清单 =');
const 段 = s.slice(i, j);
console.log('=== 生成清单 的完整实现（' + 段.split('\n').length + ' 行）===');
console.log(段.slice(0, 3000));
