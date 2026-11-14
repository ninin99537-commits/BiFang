<template>
  <div class="dp-overlay" :class="isDark ? 'dp-dark' : 'dp-light'" :style="themeStyle" @click.self="close">
    <div class="dp-modal">
      <div class="dp-header">
        <div class="dp-header-left">
          <button v-if="canGoBack" class="dp-back" @click="goBack">← 返回</button>
          <span class="dp-title">{{ stepTitle }}</span>
        </div>
        <button class="dp-close" @click="close">×</button>
      </div>

      <div class="dp-body">
        <!-- 选数据源 -->
        <div v-if="step === 'source'" class="dp-section">
          <div class="dp-source-list">
            <button class="dp-source-card" :disabled="!mvuReady" @click="pickSource('mvu')">
              <span class="dp-source-name">MVU 变量</span>
              <span class="dp-source-desc">{{ mvuReady ? '从当前楼层 stat_data 取值' : 'MVU 未就绪' }}</span>
            </button>
            <button class="dp-source-card" :disabled="!dbReady" @click="pickSource('db')">
              <span class="dp-source-name">数据库</span>
              <span class="dp-source-desc">{{ dbReady ? '从表格插件取值' : '未检测到数据库插件' }}</span>
            </button>
            <button class="dp-source-card" @click="pickSource('static')">
              <span class="dp-source-name">静态值</span>
              <span class="dp-source-desc">固定显示一段文本</span>
            </button>
          </div>
        </div>

        <!-- MVU -->
        <div v-else-if="step === 'mvu'" class="dp-section dp-section-fill">
          <div class="dp-section-title stacked">
            <div class="dp-section-heading">MVU 字段（点文件夹进入，可多选叶子）</div>
            <input v-model="mvuSearch" class="dp-search full" placeholder="搜索路径…" />
          </div>
          <div v-if="mvuParent" class="dp-breadcrumb">
            当前父级：<strong>{{ mvuParent }}</strong>
            <button class="dp-link" @click="clearMvuParent">回到根</button>
          </div>
          <div class="dp-tree">
            <div v-if="mvuVisible.length === 0" class="dp-empty">暂无 MVU 数据</div>
            <div
              v-for="item in mvuVisible"
              :key="item.path"
              :class="['dp-tree-item', isMvuSelected(item) && 'selected']"
              :style="{ paddingLeft: 8 + item.depth * 16 + 'px' }"
              @click="selectMvu(item)"
            >
              <span v-if="item.isLeaf" class="dp-check">{{ isMvuSelected(item) ? '☑' : '☐' }}</span>
              <span class="dp-tree-icon">{{ item.isLeaf ? '🏷' : '📁' }}</span>
              <span class="dp-tree-label">{{ item.name }}</span>
              <span v-if="item.valuePreview" class="dp-tree-value">{{ item.valuePreview }}</span>
              <span v-if="!item.isLeaf" class="dp-enter">进入 ›</span>
            </div>
          </div>
          <div v-if="selectedFields.length" class="dp-selected-bar">
            <div class="dp-selected-text">已选 {{ selectedFields.length }} 项：{{ selectedFields.join('、') }}</div>
            <div v-if="selectedFields.length > 1" class="dp-multi-mode">
              <label class="dp-mode-opt" :class="{ on: multiMode === 'merge' }">
                <input type="radio" v-model="multiMode" value="merge" />
                合并到一个控件
              </label>
              <label class="dp-mode-opt" :class="{ on: multiMode === 'split' }">
                <input type="radio" v-model="multiMode" value="split" />
                每个字段单独建控件
              </label>
            </div>
          </div>
        </div>

        <!-- DB 表 -->
        <div v-else-if="step === 'db-table'" class="dp-section dp-section-fill">
          <div class="dp-section-title">选择表</div>
          <div class="dp-list">
            <div v-if="dbTables.length === 0" class="dp-empty">数据库为空</div>
            <div v-for="t in dbTables" :key="t.name" class="dp-list-item" @click="selectDbSheet(t.name)">
              📄 {{ t.name }}
              <span class="dp-list-meta">{{ Math.max(0, (t.content?.length ?? 1) - 1) }} 行</span>
            </div>
          </div>
        </div>

        <!-- DB 列（可多选） -->
        <div v-else-if="step === 'db-column'" class="dp-section dp-section-fill">
          <div class="dp-section-title stacked">
            <div class="dp-section-heading">表：{{ dbTable }} → 选择列（可多选）</div>
          </div>
          <div class="dp-list">
            <div v-if="dbColumns.length === 0" class="dp-empty">该表没有列</div>
            <div
              v-for="c in dbColumns"
              :key="c"
              :class="['dp-list-item', selectedDbCols.includes(c) && 'selected']"
              @click="toggleDbColumn(c)"
            >
              <span class="dp-check">{{ selectedDbCols.includes(c) ? '☑' : '☐' }}</span>
              🏷 {{ c }}
            </div>
          </div>
          <div v-if="selectedDbCols.length" class="dp-selected-bar">
            <div class="dp-selected-text">已选 {{ selectedDbCols.length }} 列：{{ selectedDbCols.join('、') }}</div>
            <div v-if="selectedDbCols.length > 1" class="dp-multi-mode">
              <label class="dp-mode-opt" :class="{ on: multiMode === 'merge' }">
                <input type="radio" v-model="multiMode" value="merge" />
                合并到一个控件
              </label>
              <label class="dp-mode-opt" :class="{ on: multiMode === 'split' }">
                <input type="radio" v-model="multiMode" value="split" />
                每列单独建控件
              </label>
            </div>
          </div>
          <button v-if="selectedDbCols.length && dbIsMultiRow" class="dp-next" @click="step = 'db-row'">
            下一步：选择行 →
          </button>
        </div>

        <!-- DB 行 -->
        <div v-else-if="step === 'db-row'" class="dp-section">
          <div class="dp-section-title">表：{{ dbTable }} · 列：{{ selectedDbCols.join('、') }}</div>
          <div class="dp-section-title">行定位方式</div>
          <div class="dp-row-mode">
            <label><input type="radio" v-model="dbRowMode" value="latest" /> 最新行（最后一行）</label>
            <label><input type="radio" v-model="dbRowMode" value="id" /> 按 row_id</label>
            <label><input type="radio" v-model="dbRowMode" value="match" /> 按某列值匹配</label>
          </div>
          <div v-if="dbRowMode === 'id'" class="dp-row-controls">
            <label>row_id：</label>
            <input type="number" v-model.number="dbRowId" min="1" class="dp-input" />
          </div>
          <div v-else-if="dbRowMode === 'match'" class="dp-row-controls">
            <label>匹配列：</label>
            <select v-model="dbMatchCol" class="dp-input">
              <option v-for="c in dbColumns" :key="c" :value="c">{{ c }}</option>
            </select>
            <label>匹配值：</label>
            <select v-if="dbMatchValues.length > 0" v-model="dbMatchVal" class="dp-input">
              <option v-for="v in dbMatchValues" :key="v" :value="v">{{ v }}</option>
            </select>
            <input v-else v-model="dbMatchVal" class="dp-input" placeholder="输入匹配值" />
          </div>
        </div>

        <!-- 静态 -->
        <div v-else-if="step === 'static'" class="dp-section">
          <div class="dp-section-title">静态值</div>
          <input v-model="staticValue" class="dp-input dp-static-input" placeholder="输入要显示的固定文本" />
        </div>
      </div>

      <div class="dp-footer">
        <div class="dp-preview">
          预览：<strong>{{ previewText }}</strong>
        </div>
        <button class="dp-btn-cancel" @click="close">取消</button>
        <button class="dp-btn-ok" @click="confirm" :disabled="!canConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Binding, SourceType, getMvuFields, getDbColumns, isDarkColor, withOpacity } from '../schema';
import {
  isMvuReady,
  isDbReady,
  getDbTables,
  getMvuStatData,
  getDbValue,
  formatValue,
  onDataSourceReady,
  ensureDbApi,
  DbSheet,
} from '../lib/datasource';
import { useConfigStore } from '../store';
// 2026-11-14: lodash 是 webpack externals 注入的全局（webpack.config.ts:4），不在 auto-imports 里 ——
// 一旦把 no-undef 开成 error 就会报悬空，所以显式写出来（default 形式，与 设置.ts 一致）。
import _ from 'lodash';

type Step = 'source' | 'mvu' | 'db-table' | 'db-column' | 'db-row' | 'static';
/** merge=多字段放同一控件；split=每个字段建独立控件 */
export type MultiApplyMode = 'merge' | 'split';

const props = defineProps<{ modelValue: boolean; current: { source: SourceType; binding: Binding } }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'confirm', v: { source: SourceType; binding: Binding; label?: string; name?: string; multiMode?: MultiApplyMode }): void;
}>();

const store = useConfigStore();
const isDark = computed(() => isDarkColor(store.config.layout.bg));
const themeStyle = computed(() => {
  const l = store.config.layout;
  const dark = isDark.value;
  const accent = l.accentColor || (dark ? '#7ec9b8' : '#5fad9c');
  return {
    '--dp-bg': dark ? '#1a222c' : '#fbfdfc',
    '--dp-bg2': dark ? '#222b36' : '#eef5f2',
    '--dp-bg3': dark ? '#1f2833' : '#ffffff',
    '--dp-border': l.borderColor || (dark ? '#3a4d5c' : '#c5ddd4'),
    '--dp-text': l.textColor || (dark ? '#e4eef2' : '#2c4a42'),
    '--dp-muted': dark ? '#94aab4' : '#6b8f86',
    '--dp-accent': accent,
    '--dp-accent-soft': withOpacity(accent, 0.18),
    '--dp-hover': withOpacity(accent, 0.12),
    '--dp-selected': withOpacity(accent, 0.22),
    '--dp-scrollbar': l.scrollbarColor || withOpacity(accent, 0.42),
    '--dp-scrollbar-hover': l.scrollbarHoverColor || withOpacity(accent, 0.7),
    '--dp-overlay': dark ? 'rgba(8, 12, 18, 0.62)' : 'rgba(44, 74, 66, 0.26)',
  } as Record<string, string>;
});

// 就绪态会异步变化（尤其无 MVU 卡时 DB 探测不能被卡住），需响应式
const mvuReady = ref(isMvuReady());
const dbReady = ref(isDbReady());

function refreshReady() {
  ensureDbApi();
  mvuReady.value = isMvuReady();
  dbReady.value = isDbReady();
  dbTables.value = getDbTables();
}

let offReady: (() => void) | undefined;
onMounted(() => {
  refreshReady();
  offReady = onDataSourceReady(refreshReady);
});
onUnmounted(() => offReady?.());

const source = ref<SourceType>(props.current.source);
const step = ref<Step>('source');
const multiMode = ref<MultiApplyMode>('merge');
const mvuSearch = ref('');
const mvuParent = ref(props.current.binding.mvu_parent);
const selectedFields = ref<string[]>([...getMvuFields(props.current.binding)]);

const dbTables = ref<DbSheet[]>(getDbTables());
const dbTable = ref(props.current.binding.db_table);
const selectedDbCols = ref<string[]>([...getDbColumns(props.current.binding)]);
const dbRowId = ref(typeof props.current.binding.db_row === 'number' ? props.current.binding.db_row : 1);
const dbRowMode = ref<'id' | 'match' | 'latest'>(props.current.binding.db_row === 'latest' ? 'latest' : typeof props.current.binding.db_row === 'object' ? 'match' : 'id');
const dbMatchCol = ref(typeof props.current.binding.db_row === 'object' ? props.current.binding.db_row.col : '');
const dbMatchVal = ref(typeof props.current.binding.db_row === 'object' ? props.current.binding.db_row.value : '');
const staticValue = ref(props.current.binding.static_value);

// 新增控件后点「选择数据」：始终先进入数据源；已有绑定时才跳到对应步骤
const hasExisting =
  !!(props.current.binding.mvu_parent || props.current.binding.mvu_field || props.current.binding.mvu_fields?.length) ||
  !!(props.current.binding.db_table && (props.current.binding.db_column || props.current.binding.db_columns?.length)) ||
  !!(props.current.source === 'static' && props.current.binding.static_value && props.current.binding.static_value !== '新控件');

if (hasExisting) {
  if (source.value === 'mvu') {
    step.value = 'mvu';
  } else if (source.value === 'db' && dbTable.value) {
    step.value = dbIsMultiRowInit() ? 'db-row' : 'db-column';
  } else if (source.value === 'static') {
    step.value = 'static';
  } else {
    step.value = 'source';
  }
} else {
  step.value = 'source';
}

function dbIsMultiRowInit() {
  const t = dbTables.value.find(x => x.name === dbTable.value);
  return (t?.content?.length ?? 0) > 2;
}

interface MvuFlatItem {
  path: string;
  name: string;
  depth: number;
  isLeaf: boolean;
  valuePreview: string;
}

const mvuAll = computed<MvuFlatItem[]>(() => {
  const stat = getMvuStatData();
  const result: MvuFlatItem[] = [];
  const walk = (obj: any, prefix: string, depth: number) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const isLeaf = v === null || typeof v !== 'object';
      result.push({
        path,
        name: k,
        depth,
        isLeaf,
        valuePreview: isLeaf ? formatValue(v) : '',
      });
      if (!isLeaf) walk(v, path, depth + 1);
    }
  };
  walk(stat, '', 0);
  return result;
});

/** 当前父级下可见节点；搜索时展示全树过滤结果 */
const mvuVisible = computed<MvuFlatItem[]>(() => {
  let list = mvuAll.value;
  if (mvuSearch.value) {
    const q = mvuSearch.value.toLowerCase();
    return list.filter(r => r.path.toLowerCase().includes(q));
  }
  if (!mvuParent.value) {
    return list.filter(r => r.depth === 0);
  }
  const parentDepth = mvuParent.value.split('.').length - 1;
  const prefix = mvuParent.value + '.';
  return list.filter(r => r.path.startsWith(prefix) && r.depth === parentDepth + 1);
});

const stepTitle = computed(() => {
  switch (step.value) {
    case 'source':
      return '选择数据源';
    case 'mvu':
      return '选择 MVU 字段';
    case 'db-table':
      return '选择数据表';
    case 'db-column':
      return '选择列';
    case 'db-row':
      return '选择行';
    case 'static':
      return '输入静态值';
    default:
      return '选择数据';
  }
});

const canGoBack = computed(() => step.value !== 'source');

function pickSource(s: SourceType) {
  source.value = s;
  if (s === 'mvu') step.value = 'mvu';
  else if (s === 'db') step.value = 'db-table';
  else step.value = 'static';
}

function goBack() {
  if (step.value === 'mvu') {
    if (mvuParent.value && !mvuSearch.value) {
      const parts = mvuParent.value.split('.');
      parts.pop();
      mvuParent.value = parts.join('.');
      selectedFields.value = [];
    } else {
      step.value = 'source';
    }
  } else if (step.value === 'db-table' || step.value === 'static') {
    step.value = 'source';
  } else if (step.value === 'db-column') {
    step.value = 'db-table';
    selectedDbCols.value = [];
  } else if (step.value === 'db-row') {
    step.value = 'db-column';
  }
}

function clearMvuParent() {
  mvuParent.value = '';
  selectedFields.value = [];
}

function isMvuSelected(item: MvuFlatItem) {
  if (!item.isLeaf) return false;
  if (mvuParent.value) {
    return selectedFields.value.includes(item.name) && item.path === `${mvuParent.value}.${item.name}`;
  }
  return selectedFields.value.includes(item.name) && item.path === item.name;
}

function selectMvu(item: MvuFlatItem) {
  if (!item.isLeaf) {
    mvuParent.value = item.path;
    selectedFields.value = [];
    mvuSearch.value = '';
    return;
  }
  // 叶子：若切换到其他父级，清空已选
  const parts = item.path.split('.');
  const field = parts.pop()!;
  const parent = parts.join('.');
  if (parent !== mvuParent.value) {
    mvuParent.value = parent;
    selectedFields.value = [field];
    return;
  }
  const idx = selectedFields.value.indexOf(field);
  if (idx >= 0) selectedFields.value.splice(idx, 1);
  else selectedFields.value.push(field);
}

const dbColumns = computed<string[]>(() => {
  const t = dbTables.value.find(x => x.name === dbTable.value);
  return t?.content?.[0] ? (t.content[0] as string[]) : [];
});

const dbIsMultiRow = computed(() => {
  const t = dbTables.value.find(x => x.name === dbTable.value);
  return (t?.content?.length ?? 0) > 2;
});

const dbMatchValues = computed<string[]>(() => {
  if (!dbMatchCol.value) return [];
  const t = dbTables.value.find(x => x.name === dbTable.value);
  if (!t?.content) return [];
  const idx = (t.content[0] as string[]).indexOf(dbMatchCol.value);
  if (idx < 0) return [];
  return t.content
    .slice(1)
    .map(r => String(r[idx]))
    .filter(v => v !== '');
});

function selectDbSheet(name: string) {
  dbTable.value = name;
  selectedDbCols.value = [];
  dbMatchCol.value = '';
  dbMatchVal.value = '';
  step.value = 'db-column';
}

function toggleDbColumn(c: string) {
  const idx = selectedDbCols.value.indexOf(c);
  if (idx >= 0) selectedDbCols.value.splice(idx, 1);
  else selectedDbCols.value.push(c);
}

const previewText = computed(() => {
  if (source.value === 'static') return staticValue.value || '(空)';
  if (source.value === 'mvu') {
    if (!selectedFields.value.length && mvuParent.value) return `(父级) ${mvuParent.value}`;
    if (!selectedFields.value.length) return '(未选字段)';
    const v = getMvuStatData();
    return selectedFields.value
      .map(f => {
        const path = mvuParent.value ? `${mvuParent.value}.${f}` : f;
        return `${f}=${formatValue(_.get(v, path)) || '空'}`;
      })
      .join(' · ');
  }
  if (source.value === 'db') {
    if (!dbTable.value || !selectedDbCols.value.length) return '(未选完)';
    const row =
      dbRowMode.value === 'latest'
        ? 'latest'
        : dbRowMode.value === 'id'
        ? dbRowId.value
        : { col: dbMatchCol.value, value: dbMatchVal.value };
    return selectedDbCols.value
      .map(c => `${c}=${formatValue(getDbValue(dbTable.value, row, c)) || '空'}`)
      .join(' · ');
  }
  return '';
});

const canConfirm = computed(() => {
  if (source.value === 'static') return step.value === 'static';
  if (source.value === 'mvu') return selectedFields.value.length > 0 || !!mvuParent.value;
  if (source.value === 'db') {
    if (!dbTable.value || !selectedDbCols.value.length) return false;
    return true;
  }
  return false;
});

function close() {
  emit('update:modelValue', false);
}

function confirm() {
  const fields = [...selectedFields.value];
  const cols = [...selectedDbCols.value];
  const binding: Binding = {
    mvu_parent: mvuParent.value,
    mvu_field: fields[0] || '',
    mvu_fields: fields,
    db_table: dbTable.value,
    db_row: dbRowMode.value === 'latest' ? 'latest' : dbRowMode.value === 'id' ? dbRowId.value : { col: dbMatchCol.value, value: dbMatchVal.value },
    db_column: cols[0] || '',
    db_columns: cols,
    static_value: staticValue.value,
  };

  // 备注名优先用「字段名」而非父级名（仅编辑器内识别用，不影响前端显示）
  // 例：绑定「角色.白娅.认知好感度 = 80」时备注名应为「认知好感度」
  let name: string | undefined;
  if (source.value === 'mvu') {
    if (fields.length === 1) {
      name = fields[0];
    } else if (fields.length > 1) {
      // 多字段：用第一个字段名作为兜底备注名（合并模式下用户可自行修改）
      name = fields[0];
    } else if (mvuParent.value) {
      // 仅选了父级、未选叶子：用父级最后一段
      name = mvuParent.value.split('.').pop() || mvuParent.value;
    }
  } else if (source.value === 'db') {
    if (cols.length === 1) {
      name = cols[0];
    } else if (cols.length > 1) {
      name = cols[0];
    } else {
      name = dbTable.value || undefined;
    }
  }

  const multi =
    (source.value === 'mvu' && fields.length > 1) || (source.value === 'db' && cols.length > 1)
      ? multiMode.value
      : undefined;
  emit('confirm', { source: source.value, binding, name, multiMode: multi });
  emit('update:modelValue', false);
}
</script>

<style lang="scss" scoped>
.dp-overlay {
  position: absolute;
  inset: 0;
  background: var(--dp-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 8px;
  box-sizing: border-box;
  color: var(--dp-text, #2f4a43);
}
.dp-modal {
  width: 100%;
  max-width: 560px;
  height: fit-content;
  max-height: 100%;
  background: var(--dp-bg, #fff);
  color: var(--dp-text, #2f4a43);
  border: 1px solid var(--dp-border, #c5d9d2);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
  box-sizing: border-box;
}
.dp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dp-border, #eee);
  background: var(--dp-bg2, #f8f9fa);
  flex-shrink: 0;
}
.dp-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dp-back {
  border: 1px solid var(--dp-border, #d0d7de);
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}
.dp-title {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dp-text, #2f4a43);
}
.dp-close {
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--dp-muted, #666);
  line-height: 1;
}
.dp-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: var(--dp-bg, #fff);
}
.dp-section {
  padding: 0;
}
.dp-section-fill {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 360px;
  padding: 0;
}

.dp-section-title {
  font-size: 13px;
  color: var(--dp-muted, #555);
  margin: 0;
  padding: 10px 14px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}
.dp-section-title.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.dp-section-heading {
  line-height: 1.35;
  display: block;
  width: 100%;
  color: var(--dp-text, #2f4a43);
}
.dp-breadcrumb {
  font-size: 12px;
  color: var(--dp-muted, #4b5563);
  margin: 0;
  padding: 0 14px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dp-link {
  border: none;
  background: none;
  color: var(--dp-accent, #3b82f6);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.dp-source-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.dp-source-card {
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--dp-border, #eee);
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
  border-radius: 0;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  &:hover:not(:disabled) {
    background: var(--dp-hover, #eff6ff);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.dp-source-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--dp-text, #111);
}
.dp-source-desc {
  font-size: 12px;
  color: var(--dp-muted, #6b7280);
}
.dp-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--dp-border, #d0d7de);
  border-radius: 6px;
  font-size: 12px;
  box-sizing: border-box;
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
}
.dp-search.full {
  width: 100%;
  display: block;
}
.dp-tree,
.dp-list {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 280px;
  overflow-y: auto;
  border: none;
  border-top: 1px solid var(--dp-border, #eee);
  border-radius: 0;
  background: var(--dp-bg2, #fafbfc);
}

.dp-tree-item,
.dp-list-item {
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--dp-border, #f0f0f0);
  color: var(--dp-text, #2f4a43);
  &:hover {
    background: var(--dp-hover, #eef2ff);
  }
  &.selected {
    background: var(--dp-selected, #dbeafe);
    color: var(--dp-accent, #1e40af);
  }
}
.dp-check {
  font-size: 14px;
  width: 18px;
  flex-shrink: 0;
}
.dp-tree-icon {
  font-size: 12px;
}
.dp-tree-value {
  margin-left: auto;
  color: var(--dp-muted, #888);
  font-size: 11px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dp-enter {
  margin-left: auto;
  font-size: 11px;
  color: var(--dp-accent, #3b82f6);
}
.dp-list-meta {
  margin-left: auto;
  color: var(--dp-muted, #888);
  font-size: 11px;
}
.dp-empty {
  padding: 24px;
  text-align: center;
  color: var(--dp-muted, #999);
  font-size: 12px;
}
.dp-selected-bar {
  margin: 0;
  font-size: 12px;
  color: var(--dp-accent, #1e40af);
  background: var(--dp-accent-soft, #eff6ff);
  padding: 8px 14px;
  border-radius: 0;
  flex-shrink: 0;
  border-top: 1px solid var(--dp-border, #dbeafe);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dp-selected-text {
  line-height: 1.4;
  color: var(--dp-text, #2f4a43);
}
.dp-multi-mode {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dp-mode-opt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--dp-border, #c5d9d2);
  background: var(--dp-bg3, #fff);
  color: var(--dp-muted, #5f7f76);
  cursor: pointer;
  font-size: 11px;
  input {
    margin: 0;
  }
  &.on {
    border-color: var(--dp-accent, #5a9e90);
    background: var(--dp-selected, rgba(90, 158, 144, 0.18));
    color: var(--dp-text, #2f4a43);
    font-weight: 600;
  }
}
.dp-next {
  margin: 0;
  border: none;
  border-top: 1px solid var(--dp-border, #dbeafe);
  background: var(--dp-accent-soft, #eff6ff);
  color: var(--dp-accent, #1e40af);
  padding: 8px 14px;
  border-radius: 0;
  cursor: pointer;
  font-size: 12px;
  align-self: stretch;
  text-align: left;
}
.dp-row-mode {
  display: flex;
  gap: 16px;
  margin: 0;
  padding: 0 14px 10px;
  font-size: 13px;
  color: var(--dp-text, #2f4a43);
}
.dp-row-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  padding: 0 14px 12px;
  color: var(--dp-text, #2f4a43);
}
.dp-input {
  padding: 6px 8px;
  border: 1px solid var(--dp-border, #d0d7de);
  border-radius: 4px;
  font-size: 13px;
  min-width: 80px;
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
}
.dp-static-input {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 14px;
  border: none;
  border-radius: 0;
  border-top: 1px solid var(--dp-border, #eee);
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
}
.dp-footer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--dp-border, #eee);
  background: var(--dp-bg2, #f8f9fa);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.dp-preview {
  flex: 1;
  font-size: 12px;
  color: var(--dp-muted, #555);
  min-width: 0;
  word-break: break-all;
  max-height: 60px;
  overflow-y: auto;
}
.dp-btn-cancel,
.dp-btn-ok {
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  border: 1px solid var(--dp-border, #d0d7de);
  background: var(--dp-bg3, #fff);
  color: var(--dp-text, #2f4a43);
  flex-shrink: 0;
}
.dp-btn-ok {
  background: var(--dp-accent, #3b82f6);
  color: #fff;
  border-color: var(--dp-accent, #3b82f6);
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.dp-dark .dp-btn-ok {
  color: #0f1a18;
}
/* 滚动条跟随主题 */
.dp-body,
.dp-tree,
.dp-list {
  scrollbar-width: thin;
  scrollbar-color: var(--dp-scrollbar, rgba(90, 158, 144, 0.4)) transparent;
}
.dp-body::-webkit-scrollbar,
.dp-tree::-webkit-scrollbar,
.dp-list::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dp-body::-webkit-scrollbar-track,
.dp-tree::-webkit-scrollbar-track,
.dp-list::-webkit-scrollbar-track {
  background: transparent;
}
.dp-body::-webkit-scrollbar-thumb,
.dp-tree::-webkit-scrollbar-thumb,
.dp-list::-webkit-scrollbar-thumb {
  background: var(--dp-scrollbar, rgba(90, 158, 144, 0.4));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.dp-body::-webkit-scrollbar-thumb:hover,
.dp-tree::-webkit-scrollbar-thumb:hover,
.dp-list::-webkit-scrollbar-thumb:hover {
  background: var(--dp-scrollbar-hover, rgba(90, 158, 144, 0.65));
  background-clip: padding-box;
}
</style>
