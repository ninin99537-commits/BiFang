// 彼方 · 记忆回溯块: 发给更新 AI 的用户输入里只留"编码(距今)"一行, 说明段与原始块去掉
import { 压缩记忆回溯 } from '../src/彼方_NPC幕后生命状态系统/记忆回溯';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`); }
}

const 输入 = `玩家: 拉起艾莉和蒂娜，借着火力掩护全力冲向拒马防线(果断)



以上是用户的本轮输入，以下是<记忆回溯>的编码，每条附带「与今天的关系」字段。注意，请参考这些过去记忆保持剧情连续性，不在正文里直接引用编码，并自然融入对应的与「今天的关系」：
<recall>
now =
AM0256 | 0m
AM0255 | 15m
today =
AM0248 | 2h5m
years =
AM0229 | 185d17h15m
</recall>`;

console.log('\n[1] 压缩');
const 出 = 压缩记忆回溯(输入);
check('保留本轮输入', 出.startsWith('玩家: 拉起艾莉和蒂娜'), true);
check('去掉写给主 AI 的说明段', 出.includes('以上是用户的本轮输入'), false);
check('去掉原始 recall 标签', 出.includes('<recall>'), false);
check('编码压成一行带距今时长', 出.includes('AM0256(0m) AM0255(15m) AM0248(2h5m) AM0229(185d17h15m)'), true);
check('标注是历史', 出.includes('不是本轮发生的事'), true);

console.log('\n[2] 无 recall 原样返回');
check('原样', 压缩记忆回溯('玩家: 你好'), '玩家: 你好');
check('空块整块删除', 压缩记忆回溯('玩家: 嗯\n<recall>\n</recall>'), '玩家: 嗯');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
