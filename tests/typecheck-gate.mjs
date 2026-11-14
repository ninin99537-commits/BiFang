// 批次 1 的类型门(派活单 2026-11-14: 门脚本归验收位)。跑法: node tests/typecheck-gate.mjs, 退出码 0=绿 / 1=红 / 2=门自己坏了。
//
// 为什么是门: 构建走 transpileOnly, 类型错永远不红; tsc --noEmit 有存量错误, 所以"全绿"不可达,
// 只能退而求其次钉住"不再变多"。只判 src/彼方_* 与 src/共用/ —— 烟火/导演/人设工坊/自定义状态栏
// 不在本轮范围, 它们的错误只打印不判。package.json 的 "typecheck" 脚本由实现位加(避免撞车), 本文件不碰它。
//
// 基线怎么读: 键 = 文件 + TS 代码 + 去掉行列的消息文本。不含行号 —— 行号随编辑漂移, 参与比对会把
// "挪了几行"误报成"一进一出"。基线 166(彼方 165 + 共用 1)按需求位裁定; 名单测于批0.5 基线
// sha 3ad6b19(2026-11-14, tsc --noEmit --pretty false -p tsconfig.json), 与该 sha 的错误集自洽
// (批0 基线 3a133c6 上同为 166, 批0.5 未增未减)。
// 换基线 = 重测 + 换名单 + 改数量, 三样一起动, 并在注释里写明新 sha。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TSC路径 = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TS配置 = path.join(ROOT, 'tsconfig.json');

/** 基线数量(需求位裁定 166 = 彼方 165 + 共用 1)。名单见下, 数量是硬门。 */
const 基线数量 = 166;

const 基线原始 = /*__TSV__*/`src/共用/界面偏好.ts	TS2345	Argument of type '{ [x: string]: any; } | { x: number; y: number; 主题: 偏好主题; 面板x?: number | null | undefined; 面板y?: number | null | undefined; }' is not assignable to parameter of type '界面偏好'.
src/彼方_NPC幕后生命状态系统/host.ts	TS2552	Cannot find name 'GenerateToolCallResult'. Did you mean 'GenerateToolCall'?
src/彼方_NPC幕后生命状态系统/host.ts	TS7006	Parameter 'item' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/index.ts	TS7006	Parameter 'message_id' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/index.ts	TS7034	Variable 'refreshTimer' implicitly has type 'any' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/index.ts	TS7005	Variable 'refreshTimer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/prompts.ts	TS7006	Parameter 'input' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/prompts.ts	TS6133	'预填充' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/prompts.ts	TS2322	Type '{ role: string; content: string; }[]' is not assignable to type '提示词段[]'.
src/彼方_NPC幕后生命状态系统/prompts.ts	TS7006	Parameter 'npcEntries' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7006	Parameter 'raw' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7034	Variable 'saveTimer' implicitly has type 'any' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7005	Variable 'saveTimer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7005	Variable 'saveTimer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7005	Variable 'saveTimer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7005	Variable 'saveTimer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7034	Variable 'globalReadCache' implicitly has type 'any' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/settings.ts	TS7005	Variable 'globalReadCache' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/update.ts	TS6192	All imports in import declaration are unused.
src/彼方_NPC幕后生命状态系统/update.ts	TS2345	Argument of type 'string | null' is not assignable to parameter of type 'null | undefined'.
src/彼方_NPC幕后生命状态系统/update.ts	TS7006	Parameter 'ms' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/update.ts	TS6133	'resetChatCaches' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/update.ts	TS2304	Cannot find name 'allAssistantCache'.
src/彼方_NPC幕后生命状态系统/worldbook-inject.ts	TS7006	Parameter 'data' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'key' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'scanText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7034	Variable 'candidates' implicitly has type 'any[]' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7005	Variable 'candidates' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS2339	Property 'getWorldInfoActivatedData' does not exist on type '{}'.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS2339	Property 'getWorldInfoActivatedData' does not exist on type '{}'.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'npcName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/worldbook.ts	TS2339	Property 'comment' does not exist on type 'WorldbookEntry'.
src/彼方_NPC幕后生命状态系统/任务中断.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/任务中断.ts	TS7006	Parameter 'taskName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/任务中断.ts	TS7006	Parameter 'taskName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/任务中断.ts	TS7006	Parameter 'taskName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/任务中断.ts	TS7006	Parameter 'taskName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'storyTimeText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'ts' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'n' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/剧情时间.ts	TS7006	Parameter 'raw' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS6133	'扩展编辑字段' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS7006	Parameter 'item' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS7006	Parameter 'a' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS7006	Parameter 'b' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/卡合并.ts	TS7022	'duplicateIndex' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'url' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'newData' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'name' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'card' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'playerName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'n' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS2304	Cannot find name '彼方数据'.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'data' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'parsed' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS6133	'timeJump' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'name' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7034	Variable 'updatedNames' implicitly has type 'any[]' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'n' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7034	Variable 'removedNpcs' implicitly has type 'any[]' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'name' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7005	Variable 'removedNpcs' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7006	Parameter 'name' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7005	Variable 'updatedNames' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/应用更新.ts	TS7005	Variable 'removedNpcs' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/彼方条目.ts	TS7006	Parameter 'entry' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/彼方条目.ts	TS7006	Parameter 'currentName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'meta' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'raw' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'count' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS2345	Argument of type 'any' is not assignable to parameter of type 'never'.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7034	Variable 'missingFloors' implicitly has type 'any[]' in some locations where its type cannot be determined.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7005	Variable 'missingFloors' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7005	Variable 'missingFloors' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7005	Variable 'missingFloors' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'data' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'anchorFloor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'processedFloor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{}'.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'payload' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'data' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'anchorFloor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'processedFloor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'consumeClearLayer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'a' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'b' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'data' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'clearLayer' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floorId' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/快照.ts	TS7006	Parameter 'floor' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/数据变更.ts	TS7053	Element implicitly has an 'any' type because expression of type '"最后更新"' can't be used to index type '{ 未完成事项: 幕后事务[]; }'.
src/彼方_NPC幕后生命状态系统/数据变更.ts	TS7053	Element implicitly has an 'any' type because expression of type '"最后更新"' can't be used to index type '{ 未完成事项: 幕后事务[]; }'.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7006	Parameter 'partial' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7006	Parameter 'type' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7019	Rest parameter 'args' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS2345	Argument of type '{ time: number; type: any; text: string; }' is not assignable to parameter of type 'never'.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Console'.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Console'.
src/彼方_NPC幕后生命状态系统/日志仓.ts	TS7019	Rest parameter 'args' implicitly has an 'any[]' type.
src/彼方_NPC幕后生命状态系统/日志面板.ts	TS6196	'useMainPromptStore' is declared but never used.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'content' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 't' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 't' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'text' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'name' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'parsed' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'npcName' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7006	Parameter 'card' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS2339	Property 'has' does not exist on type 'never'.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{}'.
src/彼方_NPC幕后生命状态系统/模型请求.ts	TS2345	Argument of type 'Set<string> | null' is not assignable to parameter of type 'null | undefined'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS6133	'写当日值' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'physioText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'cycleLen' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'day' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'protection' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'value' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 一: number; 两: number; 二: number; 三: number; 四: number; 五: number; 六: number; 七: number; 八: number; 九: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 一: number; 两: number; 二: number; 三: number; 四: number; 五: number; 六: number; 七: number; 八: number; 九: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 一: number; 两: number; 二: number; 三: number; 四: number; 五: number; 六: number; 七: number; 八: number; 九: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 一: number; 两: number; 二: number; 三: number; 四: number; 五: number; 六: number; 七: number; 八: number; 九: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 一: number; 两: number; 二: number; 三: number; 四: number; 五: number; 六: number; 七: number; 八: number; 九: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'count' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'card' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'dateKey' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'merged' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'oldCard' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'v' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'timeText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'storyTimeText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'physioText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'day' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'cycleLen' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'merged' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'oldCard' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'storyTimeText' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7006	Parameter 'merged' implicitly has an 'any' type.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 未知: number; 疑似: number; 已确认: number; }'.
src/彼方_NPC幕后生命状态系统/生理规则.ts	TS7053	Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ 未知: number; 疑似: number; 已确认: number; }'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS6133	'worldbook' is declared but its value is never read.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.
src/彼方_NPC幕后生命状态系统/聊天取料.ts	TS2345	Argument of type 'string' is not assignable to parameter of type 'number'.`;
const 基线 = new Set(基线原始.split('\n').map(行 => 行.trim()).filter(Boolean));

const 行正则 = /^([^(]+\.ts)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const 判定范围内 = 文件 => 文件.startsWith('src/彼方_') || 文件.startsWith('src/共用/');
const 键 = e => `${e.文件}\t${e.码}\t${e.文}`;

// 探针模式(--probe): 证明"门会红并指名文件"用的。红样本固定放在 tests/fixtures/typecheck-gate/,
// 编译选项继承主 tsconfig —— 2026-11-14 起的规矩: src/ 是实现的领地, 红实验只许在 fixtures 里做。
// 探针要求样本至少报一条错: 一条都没有 = 样本被修好或配置漂了, 证明不了"门会红", 以 exit 2 失败(不是绿)。
if (process.argv.includes('--probe')) {
  const 探针配置 = path.join(ROOT, 'tests', 'fixtures', 'typecheck-gate', 'tsconfig.json');
  if (!existsSync(探针配置)) {
    console.error(`探针跑不起来: 找不到 ${path.relative(ROOT, 探针配置)}`);
    process.exit(2);
  }
  const 探针进程 = spawnSync(process.execPath, [TSC路径, '--noEmit', '--pretty', 'false', '-p', 探针配置], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (探针进程.error) {
    console.error('探针跑不起来: tsc 进程没起来。', 探针进程.error);
    process.exit(2);
  }
  const 探到的 = [];
  for (const 行 of String(探针进程.stdout ?? '').split(/\r?\n/)) {
    const m = 行正则.exec(行.trim());
    if (m)
      探到的.push(`  ${m[1].replace(/\\/g, '/')}(${m[2]},${m[3]}): ${m[4]} ${m[5]}`);
  }
  console.log('===== 类型门 · 探针模式 (tests/fixtures/typecheck-gate/) =====');
  if (探到的.length === 0) {
    console.log('结论: 探针失败 —— 红样本一条错都没报(样本被修好了? 编译选项漂了?), 证明不了"门会红"。');
    process.exit(2);
  }
  console.log(`红样本报了 ${探到的.length} 处, 门会红并逐条指名:`);
  for (const 行 of 探到的)
    console.log(行);
  console.log('结论: 红(探针, 与预期一致) —— 这不是真实回归, 主门不受影响。');
  process.exit(1);
}

if (!existsSync(TSC路径) || !existsSync(TS配置)) {
  console.error('类型门跑不起来: 找不到 tsc 或 tsconfig.json —— 先 pnpm install, 或看仓库结构是不是变了。');
  process.exit(2);
}

const 进程 = spawnSync(process.execPath, [TSC路径, '--noEmit', '--pretty', 'false', '-p', TS配置], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (进程.error) {
  console.error('类型门跑不起来: tsc 进程没起来。', 进程.error);
  process.exit(2);
}

const 错误们 = [];
for (const 行 of String(进程.stdout ?? '').split(/\r?\n/)) {
  const m = 行正则.exec(行.trim());
  if (m)
    错误们.push({ 文件: m[1].replace(/\\/g, '/'), 行: Number(m[2]), 列: Number(m[3]), 码: m[4], 文: m[5] });
}
if (错误们.length === 0 && 进程.status !== 0) {
  console.error(`tsc 退出码 ${进程.status} 但一行错误都没解析出来 —— 输出形状变了, 门脚本的解析要跟着改。尾部输出:`);
  console.error(String(进程.stdout ?? '').split(/\r?\n/).slice(-20).join('\n'));
  process.exit(2);
}

const 判定内 = 错误们.filter(e => 判定范围内(e.文件));
const 判定外 = 错误们.filter(e => !判定范围内(e.文件));

console.log('===== 类型门 (node tests/typecheck-gate.mjs) =====');
console.log(`tsc --noEmit: 全仓 ${错误们.length} 处错误`);
console.log(`判定范围 (src/彼方_* + src/共用/): ${判定内.length} 处 / 基线 ${基线数量}`);
if (判定外.length > 0) {
  console.log(`其它目录 ${判定外.length} 处 (只打印不判):`);
  for (const e of 判定外)
    console.log(`  [不判] ${e.文件}(${e.行},${e.列}): ${e.码} ${e.文}`);
}

// 有进有出但总数没超: 数量门仍是绿, 但要让"换了错"这件事看得见
const 新进 = 判定内.filter(e => !基线.has(键(e)));
const 消失 = [...基线].filter(k => !判定内.some(e => 键(e) === k));
if (新进.length > 0 && 判定内.length <= 基线数量)
  console.log(`注意: 有进有出但总数未超(新进 ${新进.length} / 消失 ${消失.length}) —— 数量门仍绿, 新进的自己看下面名单`);

if (判定内.length > 基线数量) {
  console.log(`结论: 红 —— 判定范围 ${判定内.length} > 基线 ${基线数量} (超 ${判定内.length - 基线数量})`);
  const 名单 = 新进.length > 0 ? 新进 : 判定内;
  console.log(新进.length > 0 ? '新增错误 (不在基线里):' : '判定范围全量(没认出哪条是新的, 人工比对):');
  for (const e of 名单)
    console.log(`  ${e.文件}(${e.行},${e.列}): ${e.码} ${e.文}`);
  process.exit(1);
}
console.log('结论: 绿 —— 判定范围未超基线');
