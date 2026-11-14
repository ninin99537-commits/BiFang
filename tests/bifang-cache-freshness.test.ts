// 彼方 · `全部AI楼层` 缓存新鲜度 —— 批次 2 第 3 件(派活: #82)。
//
// 缺陷: 该缓存只按 `lastId` 判新鲜(聊天取料.ts 的 allAssistantCache) —— 编辑/删中间楼层、
// 切 swipe 都**不改变 lastId**, 于是缓存常青: 更新频率判定等消费方拿到的是编辑前的旧内容,
// "更新频率算错"就是这么来的。修复后: 改了中间楼层内容 → 下一次调用必须反映新内容。
// 本用例当前必须红; 修复落地后绿。同文件先调 重置聊天缓存() 保证从干净缓存起步。
import lodash from 'lodash';
import { 全部AI楼层, 重置聊天缓存 } from '../src/彼方_NPC幕后生命状态系统/聊天取料';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

console.log('\n[缓存新鲜度] 改中间楼层内容(lastId 不变) → 下一次调用必须反映新内容');
{
  重置聊天缓存();
  const { host, 楼层 } = 彼方假宿主({});
  const 第一次 = 全部AI楼层(host as any);
  ok('第一次调用拿到可见 AI 楼层 [1,3]', 第一次.length === 2 && 第一次.some(m => m.message_id === 1));

  // 编辑楼层 1 的内容(lastId 仍是 3 —— 这正是缓存漏掉的变化)
  楼层[0].message = '编辑后的新内容：集市因为暴雨散了。';
  const 第二次 = 全部AI楼层(host as any);
  ok('第二次调用反映编辑后的新内容(现状: 返回旧缓存 → 红)', 第二次.some(m => String(m.message).includes('编辑后的新内容')));
  ok('两次调用的 lastId 相同(排除"楼层增删"的干扰)', host.chat.lastMessageId() === 3);
  ok('第二次返回的是楼层本体的新副本(编辑可见)', 第二次.find(m => m.message_id === 1)?.message?.includes('编辑后的新内容') === true);
}

console.log('\n[对照] 重置聊天缓存() 后必须真重读(这条现在就该绿, 钉住重置这个出口)');
{
  重置聊天缓存();
  const { host, 楼层 } = 彼方假宿主({});
  全部AI楼层(host as any);
  楼层[0].message = '对照: 重置后再改。';
  重置聊天缓存();
  const 再读 = 全部AI楼层(host as any);
  ok('重置后重读拿到新内容', 再读.some(m => String(m.message).includes('重置后再改')));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
