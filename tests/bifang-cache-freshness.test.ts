// 彼方 · `全部AI楼层` 的行为契约 —— 批次 2 第 3 件(派活: #82; #99 裁定删缓存, 本用例改为纯行为钉)。
//
// 历史缺陷: 缓存只按 lastId 判新鲜 → 编辑中间楼层(lastId 不变)拿到的还是旧内容, "更新频率算错"。
// 钉的行为契约(**与实现解耦** —— 无论底下有没有缓存): 改中间楼层内容 → 下一次调用必须反映新内容。
// 机械修正(#100): 移除对已废弃导出 `重置聊天缓存` 的依赖(缓存与重置将整条删除), 断言只剩纯行为,
// 不保留任何"为了让它绿"的空壳断言。
import lodash from 'lodash';
import { 全部AI楼层 } from '../src/彼方_NPC幕后生命状态系统/聊天取料';
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

console.log('\n[行为契约] 改中间楼层内容(lastId 不变) → 下一次调用必须反映新内容');
{
  const { host, 楼层 } = 彼方假宿主({});
  const 第一次 = 全部AI楼层(host as any);
  ok('第一次调用拿到可见 AI 楼层 [1,3]', 第一次.length === 2 && 第一次.some(m => m.message_id === 1));

  // 编辑楼层 1 的内容(lastId 仍是 3 —— 这正是当年缓存漏掉的变化)
  楼层[0].message = '编辑后的新内容：集市因为暴雨散了。';
  const 第二次 = 全部AI楼层(host as any);
  ok('第二次调用反映编辑后的新内容(当年缓存实现在此红)', 第二次.some(m => String(m.message).includes('编辑后的新内容')));
  ok('两次调用的 lastId 相同(排除"楼层增删"的干扰)', host.chat.lastMessageId() === 3);
  ok('第二次返回的是楼层本体的新副本(编辑可见)', 第二次.find(m => m.message_id === 1)?.message?.includes('编辑后的新内容') === true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
