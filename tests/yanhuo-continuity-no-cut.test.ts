import assert from 'node:assert/strict';
import lodash from 'lodash';
import { emptyData } from '../src/烟火_世界运转/保存世界状态';
import { validateAndNormalize, normalizeEvent } from '../src/烟火_世界运转/世界数据';
import { 规范化事件字段 } from '../src/烟火_世界运转/世界字段表';
import { 保存事件, 移除事件 } from '../src/烟火_世界运转/世界数据变更';
(globalThis as any)._ = lodash;
const marker = '这句话的最后结论是明确拒绝，并非同意。';
const long = '前情和条件仍然有效，'.repeat(300) + marker;
const fields = { 标题: long, 描述: long, 地点: long, 时间: long, 规模: '大事', 传播: '天下', 渠道: long, 势力: long, 阶段: '尾声', 隐秘: '隐秘', 代表人物: long, 前情: long };
for (const mode of ['AI','手改','快照'] as const) {
  const normalized = 规范化事件字段(fields, mode)!;
  for(const key of ['标题','描述','地点','时间','渠道','势力','代表人物','前情']) assert.equal(normalized[key], (fields as any)[key]);
}
// ── 通过计数（2026-11-19 改：从字面量改成运行时计数）──
// 为什么：上一批写的是 `结果: ${6} 通过` —— 6 是字面量。加了断言忘更新 → 数字偏小，
// 而 run.mjs 的自检**只验句式、不验条数**，所以发现不了。
// **一个编出来的数字，比没有数字更危险 —— 它看起来是统计结果。**
let 通过 = 0;
function pass(说明: string) {
  通过++;
  console.log('PASS ' + 说明);
}

pass('三个来源的所有文本字段完整保留');
const time='2039-07-13 11:35';
const { 变化: _temporary, ...persistent } = normalizeEvent(fields, time)!;
const old = { ...persistent, id: 'e1', 演变: [{时间:time,变化:long}] };
const data={...emptyData(),世界:{时间:time,氛围:'原氛围',总览:'原总览'},事件:[old]};
const sparse=validateAndNormalize({世界:{时间:time},事件:[{id:'e1',标题:old.标题,变化:'无变化'}]},data);
assert.deepEqual(sparse.事件,[old]);
assert.deepEqual(validateAndNormalize({世界:{时间:time},事件:[]},data).事件,[old]);
pass('旧字段、枚举、秘密、演变不会因漏输出丢失');
const duplicate=validateAndNormalize({世界:{时间:time},事件:[{...old},{...old,id:''}]},data);
assert.equal(duplicate.事件.length,1);
pass('相同旧事件不会因第二个空id而重签');
const many={...emptyData(),世界:data.世界,事件:Array.from({length:13},(_,i)=>({...old,id:`e${i}`,标题:`仍有效的事${i}`,隐秘:'公开' as const}))};
const excess=validateAndNormalize({世界:{时间:time},事件:[{标题:'超额候选',描述:long}]},many,undefined,{密度:'正常'});
assert.equal(excess.事件.length,13);
assert.ok(excess.事件.every(e=>e.标题!=='超额候选'));
assert.ok(excess.维护备注?.some(x=>x.includes('超额候选')));
const huge=validateAndNormalize({世界:{时间:time},事件:[]},{...many,事件:Array.from({length:35},(_,i)=>({...old,id:`e${i}`,标题:`旧档事${i}`}))});
assert.equal(huge.事件.length,35,'旧档超额不静默删除');
pass('正常准入限制只拒新候选，不裁旧存量');
const regionName=long;
const region={概况:long,局势:long,当权者:long,对外关系:long,前情:long};
const regionWorld={...data,事件:[],地域:Object.fromEntries(Array.from({length:8},(_,i)=>[`旧地域${i}`,region]))};
const replaced=validateAndNormalize({世界:{时间:time},事件:[],地域:{[regionName]:region}},regionWorld);
assert.deepEqual(replaced.地域,regionWorld.地域);
pass('满额地域先保旧条目，长名称不裁成新键');
const seed={标题:long,埋设:long,指向:long,成熟度:'将熟' as const,前情:long};
const seedWorld={...data,事件:[],伏笔:[seed]};
const seedSparse=validateAndNormalize({世界:{时间:time},事件:[],伏笔:[{标题:long}]},seedWorld);
assert.deepEqual(seedSparse.伏笔,[seed]);
const done=validateAndNormalize({世界:{时间:time},事件:[],伏笔:[{...seed,成熟度:'已爆发',结束原因:long}]},seedWorld);
assert.equal(done.伏笔.length,0);assert.equal(done.已失效伏笔?.[0]?.前情,long);
pass('伏笔合法終态归档，缺成熟度不倒退');
const env={注入世界书条目:false,保存:()=>true,清空:()=>{},同步世界书:()=>{}};
const ended=Array.from({length:6},(_,i)=>({...old,id:`done${i}`,标题:`已结${i}`,阶段:'已结束' as const}));
const manual=保存事件({...data,已了结:ended},{...old,阶段:'已结束'},env);
assert.equal(manual.拒绝,undefined);assert.equal(manual.数据.已了结.length,7);
assert.ok(manual.数据.已了结.every(x=>x.前情===long));
assert.ok(移除事件({...data,事件:[{...old,id:''},{...old,id:'',标题:'另一个'}]},'',env).拒绝);
pass('手工结案不被历史容量卡住，空id不批量误删');
const occ={名称:long,周期:'每年',时间:'2039-07-14',概况:long};
const occWorld={...data,事件:[],节令:[occ]};
assert.deepEqual(validateAndNormalize({世界:{时间:time},事件:[],节令:[{名称:long}]},occWorld).节令,[occ]);
assert.deepEqual(validateAndNormalize({世界:{时间:'元和三年三月初七'},事件:[],节令:[]},occWorld).节令,[occ]);
pass('节令缺字段/未知日期不丢失');
const metric={值:'103.8',趋势:'下降' as const,说明:long};
const metrics=validateAndNormalize({世界:{时间:time},事件:[],指标:{物价:{值:'103.8',趋势:'平稳'}}},{...data,事件:[],指标:{物价:metric}});
assert.equal(metrics.指标.物价.趋势,'下降');
pass('同值指标不凭空改趋势');

// ── 汇总行（运行时计数，2026-11-19）──
// 失败靠 node:assert 抛错（进程非零退出 → run.mjs 的 code!==0 能抓到），所以这里只报通过数。
console.log(`结果: ${通过} 通过, 0 失败`);
