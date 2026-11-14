import { buildTickMessages } from '../../src/烟火_世界运转/prompts';
import 卡 from './yanhuo-freeze-world.json';
import { writeFileSync } from 'node:fs';

const messages = buildTickMessages({ world: 卡.世界数据 as any, ...卡.输入 });
const text = messages.map(message => `【${message.role === 'system' ? '系统指令' : message.role === 'user' ? '用户' : '助手'}】\n${message.content}`).join('\n\n────────\n\n');
writeFileSync(new URL('../fixtures/yanhuo-tick-增量-v1.txt', import.meta.url), text, 'utf8');
console.log('已生成 烟火增量-v1 的完整请求基线。');
