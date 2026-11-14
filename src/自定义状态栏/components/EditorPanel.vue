<template>
  <div class="ep-drawer" :class="isDark ? 'ep-dark' : 'ep-light'" :style="drawerThemeStyle">
    <div class="ep-header">
      <span>状态栏编辑器</span>
      <div class="ep-header-actions">
        <button class="ep-layout-btn" @click="$emit('request-layout')">⊞ 可视化布局</button>
        <button class="ep-close" @click="$emit('close')">×</button>
      </div>
    </div>

    <div class="ep-tabs">
      <button :class="{ on: tab === 'widgets' }" @click="tab = 'widgets'">控件</button>
      <button :class="{ on: tab === 'global' }" @click="tab = 'global'">全局</button>
      <button :class="{ on: tab === 'defaults' }" @click="tab = 'defaults'">默认样式</button>
    </div>

    <div class="ep-body">
      <template v-if="tab === 'widgets'">
        <div class="ep-section-title">
          <span>控件列表</span>
          <button class="ep-add" @click="addWidget()">+ 新增</button>
          <button
            class="ep-add"
            :disabled="!store.widgetClipboard"
            :title="store.widgetClipboard ? `粘贴控件${store.widgetClipboard.type === 'group' || store.widgetClipboard.type === 'stack' ? '（含子树）' : ''}` : '剪贴板为空'"
            @click="pasteTop"
          >⎘ 粘贴</button>
        </div>
        <div class="ep-widget-list">
          <div
            v-for="(w, i) in visualWidgets"
            :key="w.id"
            :class="[
              'ep-widget-item',
              selectedId === w.id && 'selected',
              isNested(w.id) && 'nested',
              (w.type === 'group' || w.type === 'stack') && 'is-group',
            ]"
            @click="selectedId = w.id"
          >
            <button
              v-if="w.type === 'group' || w.type === 'stack'"
              type="button"
              class="ep-w-fold"
              :title="w.collapsed ? '展开子控件' : '折叠子控件'"
              @click.stop="store.toggleGroupCollapsed(w.id)"
            >
              {{ w.collapsed ? '▸' : '▾' }}
            </button>
            <span v-else class="ep-w-fold-spacer"></span>
            <span class="ep-w-type">[{{ typeLabel(w.type) }}]</span>
            <span class="ep-w-label">{{ nestPrefix(w.id) }}{{ widgetDisplayName(w) }}</span>
            <span v-if="(w.type === 'group' || w.type === 'stack') && w.collapsed && w.children?.length" class="ep-w-count">
              {{ w.children.length }}
            </span>
            <span class="ep-w-actions">
              <button @click.stop="store.copyWidget(w.id)" :title="`复制控件${w.type === 'group' || w.type === 'stack' ? '（含子控件）' : ''}`">⎘</button>
              <button @click.stop="moveVisual(i, -1)" :disabled="!canMoveVisual(i, -1)" title="上移">↑</button>
              <button @click.stop="moveVisual(i, 1)" :disabled="!canMoveVisual(i, 1)" title="下移">↓</button>
              <button @click.stop="del(w.id)" :title="'删除'">✕</button>
            </span>
          </div>
          <div v-if="store.config.widgets.length === 0" class="ep-empty">暂无控件，点击「+ 新增」</div>
        </div>

        <template v-if="selected">
          <div class="ep-section-title">控件属性</div>
          <div class="ep-form">
            <label>类型</label>
            <select class="ep-span2" :value="selected.type" @change="onTypeChange(($event.target as HTMLSelectElement).value)">
              <option v-for="t in ['label','bar','kv','list','divider','group','stack','image']" :key="t" :value="t">{{ typeLabel(t) }}</option>
            </select>

            <label>备注名</label>
            <input type="text" v-model="selected.name" class="ep-span2" placeholder="仅编辑器内显示，便于识别" />

            <label>标签/标题</label>
            <input type="text" v-model="selected.label" class="ep-span2" />

            <template v-if="selected.type === 'divider'">
              <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
                分割线上下间距：用样式里的「内边距」调节（0 最紧）；也可调本行上下边距 / 全局行间距
              </label>
            </template>

            <label>宽度</label>
            <select v-model="selected.style.width" class="ep-span2">
              <option value="auto">自动（铺满格）</option>
              <option value="100%">铺满</option>
              <option value="50%">一半</option>
              <option value="120px">120px</option>
              <option value="160px">160px</option>
            </select>
          </div>

          <div class="ep-section-title">数据绑定</div>
          <div class="ep-binding">
            <div class="ep-binding-summary">
              <span>源：{{ sourceLabel(selected.source) }}</span>
              <span v-if="selected.source === 'mvu'">
                {{ selected.binding.mvu_parent || '(根)' }}
                <template v-if="mvuFieldsOf(selected).length"> · {{ mvuFieldsOf(selected).join('、') }}</template>
              </span>
              <span v-else-if="selected.source === 'db'">
                {{ selected.binding.db_table }} · {{ dbColsOf(selected).join('、') }}
              </span>
              <span v-else>静态：{{ selected.binding.static_value }}</span>
            </div>
            <button @click="pickerOpen = true">选择数据…</button>
          </div>

          <div class="ep-section-title">
            <span>样式（本控件）</span>
            <span class="ep-style-ops">
              <button type="button" class="ep-link-btn" @click="store.copyWidgetStyle(selected.id)">复制样式</button>
              <button
                type="button"
                class="ep-link-btn"
                :disabled="!store.styleClipboard"
                @click="store.pasteWidgetStyle(selected.id)"
              >
                粘贴样式
              </button>
            </span>
          </div>
          <StyleForm :style-obj="selected.style" :type="selected.type" />

          <template v-if="selected.type === 'bar'">
            <div class="ep-section-title">进度条</div>
            <div class="ep-form">
              <label>最大值</label>
              <input type="number" v-model.number="selected.style.barMax" class="ep-span2" />

              <label>数值显示</label>
              <div class="ep-seg ep-span2">
                <button type="button" :class="{ on: selected.style.barValueMode === 'hidden' }" @click="selected.style.barValueMode = 'hidden'">隐藏</button>
                <button type="button" :class="{ on: selected.style.barValueMode === 'inside' }" @click="selected.style.barValueMode = 'inside'">条内</button>
                <button type="button" :class="{ on: selected.style.barValueMode === 'outside' }" @click="selected.style.barValueMode = 'outside'">条外</button>
              </div>

              <label>填充色</label>
              <ColorPicker v-model="selected.style.barColor" />
              <span class="ep-val muted">{{ selected.style.barColor }}</span>

              <label>渐变终点</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.barColorEnd || selected.style.barColor"
                  allow-empty
                  empty-label="纯色"
                  @update:model-value="selected.style.barColorEnd = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.barColorEnd = ''">纯色</button>
                <span class="ep-val muted">{{ selected.style.barColorEnd || '无' }}</span>
              </div>

              <label>轨道色</label>
              <ColorPicker v-model="selected.style.barTrack" />
              <span class="ep-val muted">{{ selected.style.barTrack }}</span>

              <label>轨道透明</label>
              <input type="range" min="0" max="1" step="0.05" v-model.number="selected.style.barTrackOpacity" />
              <span class="ep-val">{{ Math.round((selected.style.barTrackOpacity ?? 1) * 100) }}%</span>

              <label>数值颜色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.barValueColor || selected.style.color"
                  allow-empty
                  empty-label="跟随"
                  @update:model-value="selected.style.barValueColor = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.barValueColor = ''">跟随</button>
                <span class="ep-val muted">{{ selected.style.barValueColor || '跟随' }}</span>
              </div>

              <label>数值字号</label>
              <input type="range" min="0" max="28" v-model.number="selected.style.barValueFontSize" />
              <span class="ep-val">{{ selected.style.barValueFontSize > 0 ? selected.style.barValueFontSize + 'px' : '跟随' }}</span>

              <label>高度</label>
              <input type="range" min="4" max="32" v-model.number="selected.style.barHeight" />
              <span class="ep-val">{{ selected.style.barHeight }}px</span>
            </div>
          </template>

          <template v-if="selected.type === 'group'">
            <div class="ep-section-title">分组</div>
            <div class="ep-form">
              <label>显示边框</label>
              <input
                type="checkbox"
                :checked="selected.style.groupBorder !== false"
                @change="selected.style.groupBorder = ($event.target as HTMLInputElement).checked"
              />
              <span class="ep-val muted">{{ selected.style.groupBorder === false ? '隐藏' : '显示' }}</span>
            </div>
            <div class="ep-section-title">
              <span>子控件</span>
              <span class="ep-add-row">
                <button class="ep-add" @click="addWidget(selected.id)">+ 新建子控件</button>
                <button
                  class="ep-add"
                  :disabled="!store.widgetClipboard"
                  :title="store.widgetClipboard ? '粘贴当前剪贴板控件进此分组' : '剪贴板为空'"
                  @click="pasteIntoSelected"
                >⎘ 粘贴入</button>
              </span>
            </div>
            <div class="ep-children">
              <div v-for="cid in selected.children" :key="cid" class="ep-child-row">
                <button class="ep-child-name" @click="selectedId = cid">{{ shortLabel(cid) }}</button>
                <button class="ep-chip danger" @click="store.removeChildFromGroup(selected.id, cid)">移出</button>
              </div>
              <div v-if="!selected.children.length" class="ep-hint">暂无子控件</div>
              <div class="ep-add-existing">
                <span class="ep-add-existing-label">加入已有控件：</span>
                <div class="ep-candidate-tree">
                  <div
                    v-for="d in displayedCandidates"
                    :key="d.node.id"
                    class="ep-candidate-row"
                    :class="{ 'is-container': d.node.isContainer, on: addChildId === d.node.id, 'is-root': d.depth === 0 }"
                    :style="{ paddingLeft: 6 + d.depth * 14 + 'px' }"
                    :title="d.node.text"
                  >
                    <button
                      v-if="d.node.isContainer && d.node.childCount"
                      type="button"
                      class="ep-candidate-fold"
                      :title="candidateCollapsed[d.node.id] ? `展开（${d.node.childCount} 项）` : '折叠'"
                      @click.stop="toggleCandidateNode(d.node.id)"
                    >{{ candidateCollapsed[d.node.id] ? '▸' : '▾' }}</button>
                    <span v-else class="ep-candidate-fold-spacer"></span>
                    <button
                      type="button"
                      class="ep-candidate-name"
                      :class="{ on: addChildId === d.node.id }"
                      @click="addChildId = d.node.id"
                    >
                      <span class="ep-candidate-type">[{{ typeLabel(widgetById(d.node.id)?.type || '') }}]</span>
                      <span class="ep-candidate-label">{{ d.node.text }}</span>
                      <span v-if="d.node.isContainer && d.node.childCount" class="ep-candidate-count">
                        {{ candidateCollapsed[d.node.id] ? d.node.childCount + ' 项' : '' }}
                      </span>
                    </button>
                  </div>
                  <div v-if="!displayedCandidates.length" class="ep-hint">没有可加入的控件</div>
                </div>
                <button class="ep-chip" :disabled="!addChildId" @click="doAddChild">加入</button>
              </div>
            </div>
          </template>
          <template v-if="selected.type === 'stack'">
            <div class="ep-section-title">叠放组</div>
            <div class="ep-form">
              <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
                叠放组在同一格里放置多个子页（可含分组），渲染时只显示当前那页，用页签切换。当前页渲染与「直接放行里」一致，本身不占边距。
              </label>

              <label>强调色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackAccent || store.config.layout.accentColor || '#7ec9b8'"
                  :fallback="store.config.layout.accentColor || '#7ec9b8'"
                  @update:model-value="selected.style.stackAccent = $event"
                />
                <button
                  type="button"
                  class="ep-chip"
                  title="清空自定义，跟随全局强调色"
                  @click="selected.style.stackAccent = ''"
                >跟随主题</button>
                <span class="ep-val muted">{{ selected.style.stackAccent ? selected.style.stackAccent : '全局强调色' }}</span>
              </div>

              <label>字号</label>
              <input type="range" min="8" max="20" v-model.number="selected.style.stackFontSize" />
              <span class="ep-val">{{ selected.style.stackFontSize }}px</span>

              <label>页签间距</label>
              <input type="range" min="0" max="16" v-model.number="selected.style.stackGap" />
              <span class="ep-val">{{ selected.style.stackGap }}px</span>

              <label>上下边距</label>
              <input type="range" min="0" max="16" v-model.number="selected.style.stackTabPadY" />
              <span class="ep-val">{{ selected.style.stackTabPadY ? selected.style.stackTabPadY + 'px' : '0' }}</span>

              <label>圆角</label>
              <input type="range" min="0" max="24" v-model.number="selected.style.stackTabRadius" />
              <span class="ep-val">{{ Math.min(24, selected.style.stackTabRadius ?? 12) }}px</span>

              <label>组底色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackTabTrack || 'transparent'"
                  allow-empty
                  empty-label="自动"
                  :fallback="store.config.layout.accentColor || '#7ec9b8'"
                  @update:model-value="selected.style.stackTabTrack = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.stackTabTrack = ''">自动</button>
                <span class="ep-val muted">{{ selected.style.stackTabTrack || '强调浅底' }}</span>
              </div>

              <label>未选字色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackTabColor || store.config.layout.textColor || '#e4eef2'"
                  allow-empty
                  empty-label="继承"
                  :fallback="store.config.layout.textColor || '#e4eef2'"
                  @update:model-value="selected.style.stackTabColor = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.stackTabColor = ''">继承</button>
                <span class="ep-val muted">{{ selected.style.stackTabColor || '继承' }}</span>
              </div>

              <label>未选底色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackTabInactiveBg || 'transparent'"
                  allow-empty
                  empty-label="透明"
                  :fallback="store.config.layout.accentColor || '#7ec9b8'"
                  @update:model-value="selected.style.stackTabInactiveBg = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.stackTabInactiveBg = ''">透明</button>
                <span class="ep-val muted">{{ selected.style.stackTabInactiveBg || '透明' }}</span>
              </div>

              <label>选中字色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackTabActiveColor || selected.style.stackAccent || store.config.layout.accentColor || '#7ec9b8'"
                  allow-empty
                  empty-label="强调色"
                  :fallback="store.config.layout.accentColor || '#7ec9b8'"
                  @update:model-value="selected.style.stackTabActiveColor = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.stackTabActiveColor = ''">强调色</button>
                <span class="ep-val muted">{{ selected.style.stackTabActiveColor || '强调色' }}</span>
              </div>

              <label>选中底色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="selected.style.stackTabActiveBg || 'transparent'"
                  allow-empty
                  empty-label="自动"
                  :fallback="store.config.layout.accentColor || '#7ec9b8'"
                  @update:model-value="selected.style.stackTabActiveBg = $event"
                />
                <button type="button" class="ep-chip" @click="selected.style.stackTabActiveBg = ''">自动</button>
                <span class="ep-val muted">{{ selected.style.stackTabActiveBg || '强调浅底' }}</span>
              </div>

              <label>显示页签</label>
              <input
                type="checkbox"
                :checked="selected.style.stackShowTabs"
                @change="selected.style.stackShowTabs = ($event.target as HTMLInputElement).checked"
              />
              <span class="ep-val muted">{{ selected.style.stackShowTabs ? '显示' : '隐藏' }}</span>

              <label>页签文字</label>
              <select
                class="ep-span2"
                :value="selected.style.stackTabLabelMode || 'tab'"
                @change="selected.style.stackTabLabelMode = ($event.target as HTMLSelectElement).value as any"
              >
                <option value="tab">仅页签（隐藏内容区标题）</option>
                <option value="both">页签+内容标题都显示</option>
                <option value="page">仅内容标题（页签显示序号）</option>
              </select>

              <div class="ep-auto-rows" style="grid-column: 1 / -1">
                <div class="ep-section-title" style="padding: 4px 0 2px">同表多行自动翻页</div>
                <label class="ep-row-inline">
                  <input
                    type="checkbox"
                    :checked="selected.dbAutoRows"
                    @change="selected.dbAutoRows = ($event.target as HTMLInputElement).checked"
                  />
                  <span>开启（用首页作模板，按该表行数自动分页）</span>
                </label>
                <div v-if="selected.dbAutoRows" class="ep-auto-rows-body">
                  <label>页签标签列</label>
                  <select
                    :value="selected.dbTabColumn || ''"
                    @change="selected.dbTabColumn = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">（显示序号）</option>
                    <option v-for="c in autoRowsColumns" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <label title="只克隆指定数据行（留空=全部行）。支持逗号/顿号分隔与区间，如 1,3,5-7">只取行号</label>
                  <input
                    type="text"
                    class="ep-auto-rows-filter"
                    :value="selected.dbRowFilter || ''"
                    @change="selected.dbRowFilter = ($event.target as HTMLInputElement).value"
                    placeholder="如 1,3,5-7（留空=全部行）"
                  />
                  <div class="ep-hint">{{ autoRowsHint }}</div>
                </div>
              </div>
            </div>
            <div class="ep-section-title">
              <span>子页</span>
              <span class="ep-add-row">
                <button class="ep-add" @click="addWidget(selected.id)">+ 新建子页</button>
                <button
                  class="ep-add"
                  :disabled="!store.widgetClipboard"
                  :title="store.widgetClipboard ? '粘贴当前剪贴板控件作为新页' : '剪贴板为空'"
                  @click="pasteIntoSelected"
                >⎘ 粘贴入</button>
              </span>
            </div>
            <div class="ep-children">
              <div v-for="(cid, pi) in selected.children" :key="cid" class="ep-child-row">
                <span
                  v-if="(selected.activePageIndex || 0) === pi"
                  class="ep-page-mark"
                  title="当前显示的页"
                >●</span>
              <span v-else class="ep-page-mark off">○</span>
              <button class="ep-child-name" @click="selectedId = cid">{{ shortLabel(cid) }}</button>
              <button
                class="ep-chip"
                title="上移"
                :disabled="pi === 0"
                @click="store.moveStackPage(selected.id, pi, pi - 1)"
              >↑</button>
              <button
                class="ep-chip"
                title="下移"
                :disabled="pi === selected.children.length - 1"
                @click="store.moveStackPage(selected.id, pi, pi + 1)"
              >↓</button>
              <button class="ep-chip" title="设为当前显示页" @click="store.updateWidget(selected.id, { activePageIndex: pi })">显示</button>
              <button class="ep-chip danger" @click="store.removeChildFromGroup(selected.id, cid)">移出</button>
              </div>
              <div v-if="!selected.children.length" class="ep-hint">暂无子页</div>
              <div class="ep-add-existing">
                <span class="ep-add-existing-label">加入已有控件：</span>
                <div class="ep-candidate-tree">
                  <div
                    v-for="d in displayedCandidates"
                    :key="d.node.id"
                    class="ep-candidate-row"
                    :class="{ 'is-container': d.node.isContainer, on: addChildId === d.node.id, 'is-root': d.depth === 0 }"
                    :style="{ paddingLeft: 6 + d.depth * 14 + 'px' }"
                    :title="d.node.text"
                  >
                    <button
                      v-if="d.node.isContainer && d.node.childCount"
                      type="button"
                      class="ep-candidate-fold"
                      :title="candidateCollapsed[d.node.id] ? `展开（${d.node.childCount} 项）` : '折叠'"
                      @click.stop="toggleCandidateNode(d.node.id)"
                    >{{ candidateCollapsed[d.node.id] ? '▸' : '▾' }}</button>
                    <span v-else class="ep-candidate-fold-spacer"></span>
                    <button
                      type="button"
                      class="ep-candidate-name"
                      :class="{ on: addChildId === d.node.id }"
                      @click="addChildId = d.node.id"
                    >
                      <span class="ep-candidate-type">[{{ typeLabel(widgetById(d.node.id)?.type || '') }}]</span>
                      <span class="ep-candidate-label">{{ d.node.text }}</span>
                      <span v-if="d.node.isContainer && d.node.childCount" class="ep-candidate-count">
                        {{ candidateCollapsed[d.node.id] ? d.node.childCount + ' 项' : '' }}
                      </span>
                    </button>
                  </div>
                  <div v-if="!displayedCandidates.length" class="ep-hint">没有可加入的控件</div>
                </div>
                <button class="ep-chip" :disabled="!addChildId" @click="doAddChild">加入</button>
              </div>
            </div>
          </template>

          <template v-if="selected.type === 'image'">
            <input
              ref="imgUploadEl"
              type="file"
              accept="image/*"
              class="ep-io-file"
              @change="onImgUpload"
            />
            <div class="ep-section-title">图片</div>
            <div class="ep-form">
              <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
                图片地址 = 数据绑定值（静态值填 URL/base64，或绑 MVU/数据库字段取到 URL/base64）。下方「上传」会把本地图片转成 base64 存进配置。
              </label>

              <label>填充模式</label>
              <div class="ep-seg ep-span2">
                <button type="button" :class="{ on: selected.style.imgMode === 'cover' }" @click="selected.style.imgMode = 'cover'">裁切铺满</button>
                <button type="button" :class="{ on: selected.style.imgMode === 'contain' }" @click="selected.style.imgMode = 'contain'">完整显示</button>
                <button type="button" :class="{ on: selected.style.imgMode === 'fill' }" @click="selected.style.imgMode = 'fill'">拉伸⚠</button>
              </div>

              <label>宽度</label>
              <select v-model="selected.style.imgWidth" class="ep-span2">
                <option value="100%">跟随列宽</option>
                <option value="auto">原图大小</option>
                <option value="32px">32px</option>
                <option value="48px">48px</option>
                <option value="64px">64px</option>
                <option value="96px">96px</option>
                <option value="128px">128px</option>
              </select>

              <label>撑满行高</label>
              <div class="ep-span2 ep-img-stretch-row" style="grid-column: 2 / -1">
                <label class="ep-img-stretch-toggle" title="开启后图片高度自动填满所在行的整行高度，与同行其它控件等高（此时上方「高度」选项失效）">
                  <input type="checkbox" v-model="selected.style.imgStretch" />
                  与同行控件等高
                </label>
              </div>

              <label>高度</label>
              <select v-model="selected.style.imgHeight" class="ep-span2" :disabled="selected.style.imgStretch">
                <option value="auto">跟随比例</option>
                <option value="32px">32px</option>
                <option value="48px">48px</option>
                <option value="64px">64px</option>
                <option value="96px">96px</option>
                <option value="128px">128px</option>
                <option value="200px">200px</option>
              </select>

              <label>圆角</label>
              <input type="range" min="0" max="100" v-model.number="selected.style.imgRadius" />
              <span class="ep-val">{{ selected.style.imgRadius }}px{{ selected.style.imgRadius >= 50 ? '（圆形）' : '' }}</span>
            </div>

            <template v-if="!selected.imageMatchField">
              <div class="ep-section-title">
                <span>上传 / 地址</span>
                <span class="ep-style-ops">
                  <button type="button" class="ep-link-btn" @click="triggerImgUpload">上传本地</button>
                </span>
              </div>
              <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
                上传：存进本角色卡图库（删控件不丢，多控件可复用）。
              </label>
              <label>图库选</label>
              <select class="ep-span2" @change="onPickGallery(($event.target as HTMLSelectElement).value, -1)">
                <option value="">— 从图库选已上传的图片 —</option>
                <option v-for="g in store.config.layout.images" :key="g.id" :value="g.id">
                  {{ g.name || g.id }}{{ g.src.startsWith('data:') ? ` (base64 ${(g.src.length / 1024).toFixed(0)}KB)` : '' }}
                </option>
              </select>
              <label>或填 URL</label>
              <div class="ep-span2 ep-img-url-row" style="grid-column: 1 / -1">
                <input
                  type="text"
                  ref="urlInputNormal"
                  class="ep-img-url-input"
                  placeholder="https:// 或 /相对路径.png，回车确认"
                  :value="currentImgRaw.startsWith('img:') ? '' : currentImgRaw"
                  @keydown.enter.prevent="onUrlEnter(urlInputNormal as HTMLInputElement, -1)"
                />
                <button type="button" class="ep-link-btn" @click="onUrlEnter(urlInputNormal as HTMLInputElement, -1)">应用</button>
              </div>
              <div class="ep-img-status">
                <span v-if="imgUploading">处理中…</span>
                <span v-else-if="imgWarn" class="err">{{ imgWarn }}</span>
                <span v-else-if="currentImgSrc" class="ok break">当前：{{ currentImgPreview }}</span>
                <span v-else class="muted">未设置图片。上传 / 填 URL / 从图库选 都可。</span>
              </div>
              <img v-if="currentImgSrc" class="ep-img-preview" :src="currentImgSrc" alt="" />
            </template>

            <div class="ep-section-title">
              <span>字段值→图片 映射</span>
              <label class="ep-img-match-toggle" title="开启后按下方映射表匹配，关闭则绑定值本身当作图片地址">
                <input type="checkbox" v-model="selected.imageMatchField" />
                映射模式
              </label>
            </div>
            <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
              开启后：把一个字段（如「当前衣着」）的值拿来匹配下表关键词，命中哪条就显示哪张图。多个关键词用 / 或 顿号 分隔，命中其一即匹配。留空关键词的那条作「都没命中」时的默认图。
              <br />同一条映射可点「+ 附加条件」再叠加「字段+关键词」条件，需全部满足才命中。例如：主条件=姓名含「克洛伊」、附加条件=穿着打扮含「赤足 卫衣」，即可让同一角色按不同衣着显示不同立绘。各条件可在「匹配字段」里选不同字段。
            </label>
            <label v-if="selected.imageMatchField" class="ep-span2 ep-hint err" style="grid-column: 1 / -1">
              ⚠ 映射模式下，每张图片需点该条右侧的「上传」按钮单独配图；顶部的通用上传按钮已停用（它只会图存到绑定值，映射模式不读它）。
            </label>
            <div v-if="selected.imageMatchField" class="ep-img-map">
              <div
                v-for="(entry, mi) in selected.imageMap"
                :key="mi"
                class="ep-img-map-row"
              >
                <button
                  type="button"
                  class="ep-img-map-thumb-btn"
                  :title="resolveImgSrc(entry.src, store.config.layout.images) ? '点击查看大图' : '未设置图片'"
                  @click="onThumbClick(resolveImgSrc(entry.src, store.config.layout.images))"
                >
                  <img v-if="resolveImgSrc(entry.src, store.config.layout.images)" class="ep-img-map-thumb" :src="resolveImgSrc(entry.src, store.config.layout.images)" alt="" />
                  <span v-else class="ep-img-map-thumb empty">无图</span>
                </button>
                <div class="ep-img-map-body">
                <div class="ep-img-map-line ep-img-map-line1">
                  <span class="ep-img-map-idx">{{ mi + 1 }}</span>
                  <input
                    type="text"
                    class="ep-img-map-keys"
                    v-model="entry.keys"
                    :placeholder="mi === 0 ? '关键词，如 牛仔外套/帆布鞋' : '留空作默认兜底'"
                  />
                </div>
                <div class="ep-img-map-line ep-img-map-line-field">
                  <span class="ep-img-map-field-label" title="本条映射从哪个字段取值；留空取控件绑定字段">匹配字段</span>
                  <select
                    class="ep-img-map-field"
                    v-model="entry.field"
                    :disabled="!imgMatchFieldOptions.length"
                    :title="imgMatchFieldOptions.length ? '本条映射从此字段的值匹配' : '当前控件未绑定 db/mvu 数据源，只能用绑定字段值匹配'"
                  >
                    <option value="">(控件绑定字段)</option>
                    <option v-for="c in imgMatchFieldOptions" :key="c" :value="c">{{ c }}</option>
                  </select>
                </div>
                <div class="ep-img-map-line ep-img-map-line2">
                  <select
                    class="ep-img-map-gallery"
                    :value="entry.src.startsWith('img:') ? entry.src.slice(4) : ''"
                    @change="onPickGallery(($event.target as HTMLSelectElement).value, mi)"
                    title="从图库选"
                  >
                    <option value="">图库…</option>
                    <option v-for="g in store.config.layout.images" :key="g.id" :value="g.id">{{ g.name || g.id }}</option>
                  </select>
                  <button type="button" class="ep-chip" @click="uploadImageMapEntry(mi)" title="为这条上传图片">
                    {{ entry.src ? '换图' : '上传' }}
                  </button>
                  <button type="button" class="ep-chip danger" @click="removeImageMapEntry(mi)" title="删除这一条">✕</button>
                </div>
                <div class="ep-img-map-line ep-img-map-line3">
                  <input
                    type="text"
                    class="ep-img-map-url"
                    placeholder="或填 URL，回车"
                    :value="entry.src.startsWith('img:') ? '' : entry.src"
                    @keydown.enter.prevent="onUrlEnterImageMap(($event.target as HTMLInputElement).value, mi)"
                  />
                </div>
                <!-- 二级/附加条件：与主条件需同时满足，用于「同一角色按衣着切立绘」 -->
                <div v-if="entry.conds && entry.conds.length" class="ep-img-map-conds">
                  <div
                    v-for="(c, ci) in entry.conds"
                    :key="ci"
                    class="ep-img-map-cond"
                  >
                    <select
                      class="ep-img-map-cond-field"
                      v-model="c.field"
                      :disabled="!imgMatchFieldOptions.length"
                      title="附加条件从哪个字段取值"
                    >
                      <option value="">(控件绑定字段)</option>
                      <option v-for="cf in imgMatchFieldOptions" :key="cf" :value="cf">{{ cf }}</option>
                    </select>
                    <input
                      type="text"
                      class="ep-img-map-cond-keys"
                      v-model="c.keys"
                      placeholder="额外条件关键词"
                      title="该字段值含任一即满足"
                    />
                    <button type="button" class="ep-chip danger" @click="removeMapCond(mi, ci)" title="删除这个附加条件">✕</button>
                  </div>
                </div>
                <button type="button" class="ep-chip ep-img-map-cond-add" @click="addMapCond(mi)" title="再加一个「字段+关键词」条件，与本条主条件需同时满足">+ 附加条件</button>
                </div>
              </div>
              <button type="button" class="ep-add ep-img-map-add" @click="addImageMapEntry">+ 添加一条映射</button>
            </div>
          </template>
        </template>
        <div v-else class="ep-empty">请从上方选择一个控件进行编辑</div>
      </template>

      <template v-else-if="tab === 'global'">
        <div class="ep-section-title">预设主题</div>
        <div class="ep-presets">
          <button v-for="p in PRESETS" :key="p.id" @click="store.applyPreset(p.layout)">{{ p.name }}</button>
        </div>
        <div class="ep-hint-block">
          切换主题只改容器与「仍等于旧主题预设」的控件配色；你改过默认样式后新建的控件、或单独改过的颜色都会保留。若要整批套用新默认，请到「默认样式」点「应用到全部控件」。
        </div>

        <details class="ep-fold" open>
          <summary class="ep-fold-sum">间距与尺寸</summary>
          <div class="ep-form">
            <label>行间距</label>
            <input type="range" min="0" max="32" v-model.number="store.config.layout.gap" />
            <span class="ep-val" title="同时作用于顶层行与分组内行">{{ store.config.layout.gap }}px</span>

            <label>内边距</label>
            <input type="range" min="0" max="40" v-model.number="store.config.layout.padding" />
            <span class="ep-val">{{ store.config.layout.padding }}px</span>

            <label>圆角</label>
            <input type="range" min="0" max="32" v-model.number="store.config.layout.radius" />
            <span class="ep-val">{{ store.config.layout.radius }}px</span>
          </div>
        </details>

        <details class="ep-fold" open>
          <summary class="ep-fold-sum">颜色</summary>
          <div class="ep-form">
            <label>背景</label>
            <ColorPicker v-model="store.config.layout.bg" />
            <span class="ep-val muted">{{ store.config.layout.bg }}</span>

            <label>背景透明</label>
            <input type="range" min="0" max="1" step="0.05" v-model.number="store.config.layout.bgOpacity" />
            <span class="ep-val">{{ Math.round((store.config.layout.bgOpacity ?? 1) * 100) }}%</span>

            <label>文字色</label>
            <ColorPicker v-model="store.config.layout.textColor" />
            <span class="ep-val muted">{{ store.config.layout.textColor }}</span>

            <label>文字透明</label>
            <input type="range" min="0" max="1" step="0.05" v-model.number="store.config.layout.textOpacity" />
            <span class="ep-val">{{ Math.round((store.config.layout.textOpacity ?? 1) * 100) }}%</span>

            <label>强调色</label>
            <ColorPicker v-model="store.config.layout.accentColor" />
            <span class="ep-val muted">{{ store.config.layout.accentColor }}</span>

            <label>滚动条</label>
            <ColorPicker v-model="store.config.layout.scrollbarColor" />
            <span class="ep-val muted">滑块</span>

            <label>滚动悬停</label>
            <ColorPicker v-model="store.config.layout.scrollbarHoverColor" />
            <span class="ep-val muted">悬停</span>
          </div>
        </details>

        <details class="ep-fold" open>
          <summary class="ep-fold-sum">编辑器滑块</summary>
          <div class="ep-form">
            <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
              仅改状态栏编辑器里 range 滑条颜色（无边框），不影响预览区进度条。
            </label>
            <label>轨道色</label>
            <div class="ep-color-row ep-span2">
              <ColorPicker
                :model-value="store.config.layout.editorRangeTrack || store.config.layout.scrollbarColor || '#3a4d5c'"
                allow-empty
                empty-label="跟随滚动条"
                :fallback="store.config.layout.scrollbarColor || '#3a4d5c'"
                @update:model-value="store.config.layout.editorRangeTrack = $event"
              />
              <button type="button" class="ep-chip" @click="store.config.layout.editorRangeTrack = ''">跟随</button>
              <span class="ep-val muted">{{ store.config.layout.editorRangeTrack || '滚动条色' }}</span>
            </div>
            <label>拇指色</label>
            <div class="ep-color-row ep-span2">
              <ColorPicker
                :model-value="store.config.layout.editorRangeThumb || store.config.layout.accentColor || '#7ec9b8'"
                allow-empty
                empty-label="跟随强调色"
                :fallback="store.config.layout.accentColor || '#7ec9b8'"
                @update:model-value="store.config.layout.editorRangeThumb = $event"
              />
              <button type="button" class="ep-chip" @click="store.config.layout.editorRangeThumb = ''">跟随</button>
              <span class="ep-val muted">{{ store.config.layout.editorRangeThumb || '强调色' }}</span>
            </div>
            <label>拇指悬停</label>
            <div class="ep-color-row ep-span2">
              <ColorPicker
                :model-value="store.config.layout.editorRangeThumbHover || store.config.layout.scrollbarHoverColor || '#6ebfb0'"
                allow-empty
                empty-label="跟随滚动悬停"
                :fallback="store.config.layout.scrollbarHoverColor || '#6ebfb0'"
                @update:model-value="store.config.layout.editorRangeThumbHover = $event"
              />
              <button type="button" class="ep-chip" @click="store.config.layout.editorRangeThumbHover = ''">跟随</button>
              <span class="ep-val muted">{{ store.config.layout.editorRangeThumbHover || '滚动悬停' }}</span>
            </div>
            <label>预览</label>
            <input type="range" min="0" max="100" value="55" readonly tabindex="-1" />
            <span class="ep-val muted">仅预览</span>
          </div>
        </details>

        <details class="ep-fold">
          <summary class="ep-fold-sum">边框与字体</summary>
          <div class="ep-form">
            <label>边框样式</label>
            <select v-model="store.config.layout.borderStyle" @change="syncBorder">
              <option value="none">无</option>
              <option value="solid">实线</option>
              <option value="dashed">虚线</option>
              <option value="dotted">点线</option>
              <option value="double">双线</option>
            </select>
            <span></span>

            <label>边框粗细</label>
            <input type="range" min="0" max="8" v-model.number="store.config.layout.borderWidth" @input="syncBorder" />
            <span class="ep-val">{{ store.config.layout.borderWidth }}px</span>

            <label>边框颜色</label>
            <ColorPicker
              :model-value="store.config.layout.borderColor"
              @update:model-value="onBorderColorVal"
            />
            <span class="ep-val muted">{{ store.config.layout.borderColor }}</span>

            <label>字体</label>
            <select v-model="store.config.layout.fontFamily" class="ep-span2">
              <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </div>

          <div class="ep-fonts-sub">
            <div class="ep-fonts-sub-title">
              <span>导入字体</span>
              <button type="button" class="ep-link-btn" @click="triggerFontUpload" :disabled="fontUploading">
                {{ fontUploading ? '处理中…' : '+ 上传字体文件' }}
              </button>
            </div>
            <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
              支持 ttf / otf / woff / woff2。上传后转为 base64 写入角色卡配置，并自动注入为 @font-face，可在上方「字体」下拉选用。注意：大字体会让角色卡配置变大。
            </label>
            <input
              ref="fontUploadEl"
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,font/woff,application/x-font-ttf"
              class="ep-io-file"
              @change="onFontUpload"
            />
            <div v-if="(store.config.layout.fonts || []).length" class="ep-font-list">
              <div
                v-for="f in store.config.layout.fonts"
                :key="f.id"
                class="ep-font-row"
              >
                <input
                  type="text"
                  class="ep-font-name"
                  :value="f.name"
                  @change="onRenameFont(f.id, $event)"
                  title="显示名"/>
                <button
                  type="button"
                  class="ep-chip danger"
                  title="删除该字体（不会还原已选用它的控件）"
                  @click="onRemoveFont(f.id)">✕</button>
                <span class="ep-font-preview" :style="{ fontFamily: fontPreviewStyle(f.family) }">
                  字体预览 ABC 中文示例 123
                </span>
              </div>
            </div>
            <div v-else class="ep-hint">尚未导入字体</div>
          </div>
        </details>

        <details class="ep-fold">
          <summary class="ep-fold-sum">图片图库（{{ store.config.layout.images.length }} 张）</summary>
          <div class="ep-form">
            <label class="ep-span2 ep-hint" style="grid-column: 1 / -1">
              上传过的图片存在这里，删控件不丢，可被多个图片控件复用。删除某张图会把所有引用它的图片控件清空。
            </label>
            <div v-if="store.config.layout.images.length" class="ep-gallery-list">
              <div v-for="g in store.config.layout.images" :key="g.id" class="ep-gallery-row">
                <button
                  type="button"
                  class="ep-gallery-thumb-btn"
                  :title="g.name || '点击查看大图'"
                  @click="onThumbClick(resolveImgSrc(`img:${g.id}`, store.config.layout.images) || g.src)"
                >
                  <img
                    class="ep-gallery-thumb"
                    :src="resolveImgSrc(`img:${g.id}`, store.config.layout.images) || g.src"
                    alt=""
                  />
                </button>
                <input
                  type="text"
                  class="ep-gallery-name"
                  :value="g.name"
                  placeholder="(未命名)"
                  @change="store.renameImage(g.id, ($event.target as HTMLInputElement).value)"
                  title="备注名"
                />
                <span class="ep-gallery-id" :title="g.id">{{ g.id.slice(-8) }}</span>
                <button type="button" class="ep-chip danger" @click="onRemoveImage(g.id, g.name)" title="删除该图（引用它的控件将清空）">✕</button>
              </div>
            </div>
            <div v-else class="ep-hint">图库为空。在图片控件的「上传 / 地址」里上传后，图片会自动进图库。</div>
          </div>
        </details>

        <div class="ep-section-title">
          <span>行布局一览</span>
          <button class="ep-link-btn" @click="$emit('request-layout')">拖拽调整 →</button>
        </div>
        <div class="ep-rows-preview">
          <div v-for="(row, ri) in store.config.layout.rows" :key="row.id" class="ep-row-block">
            <div class="ep-row-line">
              <button
                type="button"
                class="ep-icon"
                :title="row.collapsed ? '展开' : '折叠'"
                @click="store.toggleRowCollapsed(ri)"
              >
                {{ row.collapsed ? '▸' : '▾' }}
              </button>
              <span>行{{ ri + 1 }}</span>
              <span class="ep-row-cols-readonly">{{ row.columns }} 列</span>
              <span class="ep-row-ids">{{ row.widgetIds.map(id => shortLabel(id)).join(' · ') || '(空)' }}</span>
              <button class="ep-icon" @click="store.reorderRow(ri, ri - 1)" :disabled="ri === 0">↑</button>
              <button class="ep-icon" @click="store.reorderRow(ri, ri + 1)" :disabled="ri === store.config.layout.rows.length - 1">↓</button>
            </div>
            <div v-if="row.widgetIds.length > 1" class="ep-row-align">
              <span class="ep-row-align-label">分布</span>
              <select
                :value="row.rowAlign === 'equal' ? 'equal' : (row.rowAlign || 'between')"
                @change="store.updateRowMeta(ri, { rowAlign: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="equal">等分满行</option>
                <option value="start">靠左</option>
                <option value="center">居中</option>
                <option value="end">靠右</option>
                <option value="between">两端</option>
                <option value="around">均分空隙</option>
              </select>
              <label class="ep-smart-eq" title="空间够时完整显示；不够则尽量多显示被缩略内容">
                <input
                  type="checkbox"
                  :checked="row.smartEqual !== false"
                  @change="store.updateRowMeta(ri, { smartEqual: ($event.target as HTMLInputElement).checked })"
                />
                智能平分
              </label>
            </div>
            <div class="ep-row-margin">
              <div class="ep-row-margin-line">
                <span class="ep-row-align-label">上距</span>
                <input
                  type="range"
                  min="-32"
                  max="64"
                  :value="row.marginTop ?? 0"
                  @input="store.updateRowMeta(ri, { marginTop: Number(($event.target as HTMLInputElement).value) })"
                />
                <span class="ep-val">{{ row.marginTop ?? 0 }}</span>
              </div>
              <div class="ep-row-margin-line">
                <span class="ep-row-align-label">下距</span>
                <input
                  type="range"
                  min="-32"
                  max="64"
                  :value="row.marginBottom ?? 0"
                  @input="store.updateRowMeta(ri, { marginBottom: Number(($event.target as HTMLInputElement).value) })"
                />
                <span class="ep-val">{{ row.marginBottom ?? 0 }}</span>
              </div>
            </div>
          </div>
          <button class="ep-add-row" @click="store.addRow(1)">+ 添加空行</button>
        </div>

        <div class="ep-section-title">导入 / 导出</div>
        <div class="ep-hint-block">
          导出当前状态栏完整配置（布局 + 全部控件样式与数据绑定）。别人玩同一张卡时，把 JSON 发给对方，对方点「导入」即可套用你的设置。
        </div>
        <div class="ep-io-actions">
          <button type="button" class="ep-io-btn" @click="exportConfig">导出配置</button>
          <button type="button" class="ep-io-btn" @click="triggerImport">导入配置</button>
          <input
            ref="importInputEl"
            type="file"
            accept="application/json,.json"
            class="ep-io-file"
            @change="onImportFile"
          />
        </div>
        <div v-if="ioMsg" class="ep-io-msg" :class="{ err: ioIsErr }">{{ ioMsg }}</div>

        <button class="ep-reset" @click="store.reset()">重置为默认</button>
      </template>

      <template v-else>
        <div class="ep-hint-block">
          默认样式会用于新建控件。左侧预览区可实时看到全局/控件改动。若要让已有控件也套用默认字号颜色等，点下方按钮。
        </div>
        <StyleForm :style-obj="store.config.layout.widgetDefaults" type="label" />
        <div class="ep-section-title">默认进度条</div>
        <div class="ep-form">
          <label>最大值</label>
          <input type="number" v-model.number="store.config.layout.widgetDefaults.barMax" class="ep-span2" />

          <label>数值显示</label>
          <div class="ep-seg ep-span2">
            <button type="button" :class="{ on: store.config.layout.widgetDefaults.barValueMode === 'hidden' }" @click="store.config.layout.widgetDefaults.barValueMode = 'hidden'">隐藏</button>
            <button type="button" :class="{ on: store.config.layout.widgetDefaults.barValueMode === 'inside' }" @click="store.config.layout.widgetDefaults.barValueMode = 'inside'">条内</button>
            <button type="button" :class="{ on: store.config.layout.widgetDefaults.barValueMode === 'outside' }" @click="store.config.layout.widgetDefaults.barValueMode = 'outside'">条外</button>
          </div>

          <label>填充色</label>
          <ColorPicker v-model="store.config.layout.widgetDefaults.barColor" />
          <span class="ep-val muted">{{ store.config.layout.widgetDefaults.barColor }}</span>

          <label>渐变终点</label>
          <div class="ep-color-row ep-span2">
            <ColorPicker
              :model-value="store.config.layout.widgetDefaults.barColorEnd || store.config.layout.widgetDefaults.barColor"
              allow-empty
              empty-label="纯色"
              @update:model-value="store.config.layout.widgetDefaults.barColorEnd = $event"
            />
            <button type="button" class="ep-chip" @click="store.config.layout.widgetDefaults.barColorEnd = ''">纯色</button>
          </div>

              <label>轨道色</label>
              <ColorPicker v-model="store.config.layout.widgetDefaults.barTrack" />
              <span class="ep-val muted">{{ store.config.layout.widgetDefaults.barTrack }}</span>

              <label>轨道透明</label>
              <input type="range" min="0" max="1" step="0.05" v-model.number="store.config.layout.widgetDefaults.barTrackOpacity" />
              <span class="ep-val">{{ Math.round((store.config.layout.widgetDefaults.barTrackOpacity ?? 1) * 100) }}%</span>

              <label>数值颜色</label>
              <div class="ep-color-row ep-span2">
                <ColorPicker
                  :model-value="store.config.layout.widgetDefaults.barValueColor || store.config.layout.widgetDefaults.color"
                  allow-empty
                  empty-label="跟随"
                  @update:model-value="store.config.layout.widgetDefaults.barValueColor = $event"
                />
                <button type="button" class="ep-chip" @click="store.config.layout.widgetDefaults.barValueColor = ''">跟随</button>
              </div>

              <label>数值字号</label>
              <input type="range" min="0" max="28" v-model.number="store.config.layout.widgetDefaults.barValueFontSize" />
              <span class="ep-val">{{ store.config.layout.widgetDefaults.barValueFontSize > 0 ? store.config.layout.widgetDefaults.barValueFontSize + 'px' : '跟随' }}</span>

              <label>高度</label>
              <input type="range" min="4" max="32" v-model.number="store.config.layout.widgetDefaults.barHeight" />
              <span class="ep-val">{{ store.config.layout.widgetDefaults.barHeight }}px</span>
            </div>
        <button class="ep-apply-defaults" @click="onApplyDefaults">将默认样式应用到全部控件</button>
      </template>
    </div>

    <DataPicker
      v-if="pickerOpen"
      :model-value="pickerOpen"
      :current="{ source: selected?.source ?? 'static', binding: selected?.binding ?? emptyBinding }"
      @update:model-value="pickerOpen = $event"
      @confirm="onPickerConfirm"
    />

    <div v-if="lightboxSrc" class="ep-lightbox" @click="lightboxSrc = ''">
      <img :src="lightboxSrc" alt="" class="ep-lightbox-img" @click.stop />
      <button type="button" class="ep-lightbox-close" @click="lightboxSrc = ''" title="关闭（Esc 或点空白）">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useConfigStore } from '../store';
import { PRESETS, baseStyle, dividerStylePatch } from '../lib/preset';
import {
  Widget,
  Binding,
  SourceType,
  WidgetType,
  ImageMapEntry,
  getMvuFields,
  getDbColumns,
  buildBorder,
  isDarkColor,
  withOpacity,
  resolveImgSrc,
} from '../schema';
import { collectChildIds } from '../lib/layout';
import { fontFormatForFile, sanitizeFontName, familyCssValue } from '../lib/fonts';
import {
  typeLabel,
  widgetDisplayName as widgetDisplayNameOf,
  widgetTypedName,
  widgetNameById,
} from '../lib/widgetName';
import { getDbSheet, getDbRowCount, getMvuStatData } from '../lib/datasource';
import DataPicker from './DataPicker.vue';
import StyleForm from './StyleForm.vue';
import ColorPicker from './ColorPicker.vue';
// 2026-11-14: lodash 是 webpack externals 注入的全局（webpack.config.ts:4），不在 auto-imports 里 ——
// 一旦把 no-undef 开成 error 就会报悬空，所以显式写出来（default 形式，与 设置.ts 一致）。
import _ from 'lodash';

defineEmits<{ (e: 'close'): void; (e: 'request-layout'): void }>();

const store = useConfigStore();
const selectedId = ref<string>('');
const pickerOpen = ref(false);
const tab = ref<'widgets' | 'global' | 'defaults'>('widgets');
const addChildId = ref('');
const importInputEl = ref<HTMLInputElement | null>(null);
const ioMsg = ref('');
const ioIsErr = ref(false);
const imgUploadEl = ref<HTMLInputElement | null>(null);
const urlInputNormal = ref<HTMLInputElement | null>(null);
const imgUploading = ref(false);
const imgWarn = ref('');
const fontUploadEl = ref<HTMLInputElement | null>(null);
const fontUploading = ref(false);

/* ---------- 图片大图预览（图库 / 映射缩略图点击） ---------- */
const lightboxSrc = ref('');
function onThumbClick(src: string | undefined) {
  if (!src) return;
  lightboxSrc.value = src;
}
function onLightboxKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxSrc.value) {
    lightboxSrc.value = '';
  }
}
onMounted(() => window.addEventListener('keydown', onLightboxKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onLightboxKeydown));

const emptyBinding: Binding = {
  mvu_parent: '',
  mvu_field: '',
  mvu_fields: [],
  db_table: '',
  db_row: 1,
  db_column: '',
  db_columns: [],
  static_value: '',
};

const BASE_FONT_OPTIONS = [
  { label: '默认', value: 'inherit' },
  { label: '微软雅黑', value: '"Microsoft YaHei",sans-serif' },
  { label: '宋体', value: '"SimSun",serif' },
  { label: '楷体', value: '"STKaiti","KaiTi",serif' },
  { label: '黑体', value: '"SimHei",sans-serif' },
  { label: '等宽', value: '"Consolas","Microsoft YaHei",monospace' },
];

/** 字体选项：内置 + 自定义导入的字体（用 @font-face 名作 value） */
const FONT_OPTIONS = computed(() => {
  const custom = store.config.layout.fonts || [];
  const customOpts = custom
    .filter(f => f.family && f.src)
    .map(f => ({ label: `${f.name}（自定义）`, value: familyCssValue(f.family) }));
  return [...BASE_FONT_OPTIONS, ...customOpts];
});

const selected = computed<Widget | undefined>(() => store.config.widgets.find(w => w.id === selectedId.value));
const nestedIds = computed(() => collectChildIds(store.config.widgets));
const isDark = computed(() => isDarkColor(store.config.layout.bg));

/** 当前选中 image 控件可用的「每条映射独立选字段」候选字段：
 *  - db 源：其绑定表的全部列名
 *  - mvu 源：当前 mvu_parent 下的叶子子项名（含同时含控件自身已绑字段）
 *  - static / 无绑定：空（每条映射回退到控件自身静态值，字段选项无意义） */
const imgMatchFieldOptions = computed<string[]>(() => {
  const sel = selected.value;
  if (!sel) return [];
  if (sel.source === 'db') {
    const table = sel.binding?.db_table || '';
    if (!table) return [];
    return (getDbSheet(table)?.content?.[0] as string[] | undefined) || [];
  }
  if (sel.source === 'mvu') {
    const parent = sel.binding?.mvu_parent || '';
    const stat = getMvuStatData();
    let node: any = stat;
    if (parent) node = _.get(stat, parent);
    if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
    return Object.keys(node);
  }
  return [];
});

/** 递归在 group 子树中找第一个 source==='db' 且绑定了表名的控件，返回其表名。
 *  与 WidgetStack 的 cloneWithRow 取表逻辑保持一致，支持首页模板为 group 且其子控件再嵌 group。 */
function findFirstDbTable(tpl: Widget, lookup: Map<string, Widget>): string {
  if (tpl.source === 'db' && tpl.binding?.db_table) return tpl.binding.db_table;
  if (tpl.type === 'group') {
    for (const id of tpl.children || []) {
      const child = lookup.get(id);
      if (!child) continue;
      const t = findFirstDbTable(child, lookup);
      if (t) return t;
    }
  }
  return '';
}

/** 自动行模式：模板首页（选中 stack 的 children[0]）绑定表的列名 */
const autoRowsColumns = computed<string[]>(() => {
  const sel = selected.value;
  if (!sel || sel.type !== 'stack' || !sel.dbAutoRows) return [];
  const tplId = sel.children?.[0];
  const tpl = store.config.widgets.find(w => w.id === tplId);
  if (!tpl) return [];
  const lookup = new Map(store.config.widgets.map(cw => [cw.id, cw]));
  const table = findFirstDbTable(tpl, lookup);
  if (!table) return [];
  return getDbSheet(table)?.content?.[0] ? (getDbSheet(table)!.content[0] as string[]) : [];
});

const autoRowsHint = computed(() => {
  const sel = selected.value;
  if (!sel || sel.type !== 'stack' || !sel.dbAutoRows) return '';
  const tplId = sel.children?.[0];
  if (!tplId) return '需要至少 1 个子页作模板：给首页绑定数据库表的列';
  const tpl = store.config.widgets.find(w => w.id === tplId);
  if (!tpl) return '找不到模板页';
  const lookup = new Map(store.config.widgets.map(cw => [cw.id, cw]));
  const table = findFirstDbTable(tpl, lookup);
  if (!table) return '模板页需绑定数据库源（group 模板需其子树内含绑同一张表的 db 控件）';
  const n = getDbRowCount(table);
  const filter = (sel.dbRowFilter || '').trim();
  if (!filter) return `表《${table}》共 ${n} 行 → 自动 ${n} 页`;
  // 解析「只取行号」筛选，统计落在表内的合法行数
  const ok: Set<number> = new Set();
  for (const part of filter.split(/[,，、\s]+/)) {
    const t = part.trim();
    if (!t) continue;
    const range = t.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let r = a; r <= b; r++) if (r >= 1 && r <= n) ok.add(r);
    } else {
      const r = Number(t);
      if (Number.isFinite(r) && r >= 1 && r <= n) ok.add(Math.floor(r));
    }
  }
  const warn = ok.size > 0 ? '' : '（⚠ 没有任何行落在表内，将不显示子页）';
  return `表《${table}》共 ${n} 行，已筛出 ${ok.size} 页${warn}`;
});

/** 编辑器跟随全局主题（强调色/滚动条可自定义） */
const drawerThemeStyle = computed(() => {
  const l = store.config.layout;
  const dark = isDark.value;
  const accent = l.accentColor || (dark ? '#7ec9b8' : '#5fad9c');
  const surface = dark ? '#1a222c' : '#fbfdfc';
  const surface2 = dark ? '#222b36' : '#eef5f2';
  const border = l.borderColor || (dark ? '#3a4d5c' : '#c5ddd4');
  const text = l.textColor || (dark ? '#e4eef2' : '#2c4a42');
  const muted = dark ? '#94aab4' : '#6b8f86';
  const sb = l.scrollbarColor || withOpacity(accent, 0.42);
  const sbH = l.scrollbarHoverColor || withOpacity(accent, 0.7);
  const inputBg = dark ? '#1f2833' : '#ffffff';
  const rangeTrack = (l.editorRangeTrack || '').trim() || sb;
  const rangeThumb = (l.editorRangeThumb || '').trim() || accent;
  const rangeThumbH = (l.editorRangeThumbHover || '').trim() || sbH;
  return {
    '--ep-bg': surface,
    '--ep-bg2': surface2,
    '--ep-border': border,
    '--ep-text': text,
    '--ep-range-track': rangeTrack,
    '--ep-range-thumb': rangeThumb,
    '--ep-range-thumb-hover': rangeThumbH,
    '--ep-muted': muted,
    '--ep-accent': accent,
    '--ep-accent-soft': withOpacity(accent, 0.16),
    '--ep-input-bg': inputBg,
    '--ep-danger': dark ? '#f5a8a8' : '#c45c5c',
    '--ep-danger-bg': dark ? '#3a2428' : '#fdf4f2',
    '--ep-scrollbar': sb,
    '--ep-scrollbar-hover': sbH,
    color: text,
    background: surface,
    borderLeftColor: border,
    boxShadow: dark ? '-4px 0 18px rgba(0,0,0,0.4)' : '-4px 0 20px rgba(95, 173, 156, 0.14)',
  } as Record<string, string>;
});

const visualWidgets = computed<Widget[]>(() => {
  const ids = store.config.layout.rows.flatMap(r => r.widgetIds);
  const seen = new Set<string>();
  const list: Widget[] = [];
  /** 折叠时仍要把子孙记入 seen，避免末尾“游离控件”循环把它们再塞回列表 */
  function markDescendantsSeen(w: Widget) {
    const isContainer = w.type === 'group' || w.type === 'stack';
    if (!isContainer || !w.children?.length) return;
    for (const cid of w.children) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      const child = store.config.widgets.find(x => x.id === cid);
      if (child) markDescendantsSeen(child);
    }
  }
  function pushWithChildren(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const w = store.config.widgets.find(x => x.id === id);
    if (!w) return;
    list.push(w);
    // 编辑器列表：分组/叠放折叠时不展开子项（仅列表 UI，不影响预览渲染）
    const isContainer = w.type === 'group' || w.type === 'stack';
    if (isContainer && w.children?.length) {
      if (w.collapsed) {
        markDescendantsSeen(w);
      } else {
        for (const cid of w.children) pushWithChildren(cid);
      }
    }
  }
  for (const id of ids) pushWithChildren(id);
  for (const w of store.config.widgets) {
    if (!seen.has(w.id)) list.push(w);
  }
  return list;
});

/** 顶层控件在 visual 列表中的索引（跳过嵌套子控件） */
function findSwapTarget(fromIndex: number, delta: number): number {
  const list = visualWidgets.value;
  let j = fromIndex + delta;
  while (j >= 0 && j < list.length) {
    // 只能与非嵌套（顶层布局）控件交换；group 自身可移动
    if (!nestedIds.value.has(list[j].id)) return j;
    j += delta;
  }
  return -1;
}
function canMoveVisual(i: number, delta: number): boolean {
  const list = visualWidgets.value;
  const w = list[i];
  if (!w || nestedIds.value.has(w.id)) return false;
  return findSwapTarget(i, delta) >= 0;
}

/** 「加入已有控件」候选树节点：可展开的容器（group/stack）或叶子。 */
interface CandidateNode {
  id: string;
  text: string;
  isContainer: boolean;
  childCount: number;
  depth: number;
  children: CandidateNode[];
}

/** 把候选控件构造成递归树：
 *  - 根（depth=0）：parent 不在候选集合的位置（顶层或属于非候选父）
 *  - 容器型候选（group/stack）：递归挂其候选子
 *  - 叶子：普通控件，或其父是非候选容器的子（也作为根挂到顶层） */
const candidateTree = computed<CandidateNode[]>(() => {
  const sel = selected.value;
  if (!sel || (sel.type !== 'group' && sel.type !== 'stack')) return [];
  const all = store.config.widgets;
  const byId = new Map(all.map(w => [w.id, w]));
  // 候选集合：非自身、未在本组内、非自身祖先、非自身后代
  const candIdSet = new Set<string>();
  for (const w of all) {
    if (w.id === sel.id) continue;
    if ((sel.children || []).includes(w.id)) continue;
    if (store.isDescendant(w.id, sel.id)) continue;
    if (store.isDescendant(sel.id, w.id)) continue;
    candIdSet.add(w.id);
  }

  const widgetName = (id: string) => {
    const w = byId.get(id);
    return w ? widgetTypedName(w, all) : id.slice(0, 6);
  };

  function buildNode(id: string, depth: number): CandidateNode {
    const w = byId.get(id)!;
    const isContainer = w.type === 'group' || w.type === 'stack';
    const children = isContainer
      ? (w.children || []).filter(c => candIdSet.has(c)).map(c => buildNode(c, depth + 1))
      : [];
    return {
      id,
      text: widgetName(id),
      isContainer,
      childCount: children.length,
      depth,
      children,
    };
  }

  // 根：候选里 parent 不在候选集合（含顶层 / 父是非候选容器 / 父是被排除的自身等）
  const roots: CandidateNode[] = [];
  for (const id of candIdSet) {
    const parent = store.getParentGroupId(id);
    if (!parent || !candIdSet.has(parent)) {
      roots.push(buildNode(id, 0));
    }
  }
  return roots;
});

/** 展开后的扁平显示节点（按 depth 缩进渲染，容器折叠时跳过其子树）。 */
interface DisplayNode { node: CandidateNode; depth: number; }
const displayedCandidates = computed<DisplayNode[]>(() => {
  const out: DisplayNode[] = [];
  const walk = (nodes: CandidateNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.isContainer && n.childCount && !candidateCollapsed.value[n.id]) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(candidateTree.value, 0);
  return out;
});

/** 容器节点折叠状态（按节点 id 记忆；默认展开）。 */
const candidateCollapsed = ref<Record<string, boolean>>({});
function toggleCandidateNode(id: string) {
  candidateCollapsed.value = { ...candidateCollapsed.value, [id]: !candidateCollapsed.value[id] };
}

const groupCandidates = computed(() => {
  // 兼容旧引用：扁平化全部候选 id（树形展开后的所有节点）
  return displayedCandidates.value.map(d => d.node.id);
});

function isNested(id: string) {
  return nestedIds.value.has(id);
}
function nestPrefix(id: string) {
  return isNested(id) ? '↳ ' : '';
}
function widgetDisplayName(w: Widget): string {
  return widgetDisplayNameOf(w, store.config.widgets);
}
/** 按 id 取控件（候选树渲染类型前缀用） */
function widgetById(id: string): Widget | undefined {
  return store.config.widgets.find(w => w.id === id);
}
/** 切换控件类型：切到分割线时默认收紧上下间距（内边距=0，可再调） */
function onTypeChange(next: string) {
  if (!selected.value) return;
  const t = next as WidgetType;
  const patch: Partial<Widget> = { type: t };
  if (t === 'divider') {
    patch.style = {
      ...selected.value.style,
      ...dividerStylePatch,
    };
  }
  if (t === 'image') {
    patch.style = {
      ...selected.value.style,
      bg: 'transparent',
      padding: 0,
      imgMode: selected.value.style.imgMode || 'cover',
      imgWidth: selected.value.style.imgWidth || '100%',
      imgHeight: selected.value.style.imgHeight || 'auto',
      imgRadius: selected.value.style.imgRadius ?? 8,
    };
    if (selected.value.source === 'static' && !selected.value.binding.static_value) {
      patch.binding = { ...selected.value.binding, static_value: '' };
      patch.source = 'static';
    }
  }
  if ((t === 'group' || t === 'stack') && selected.value.style.groupBorder !== false) {
    patch.style = { ...selected.value.style, groupBorder: false };
  }
  store.updateWidget(selected.value.id, patch);
}
function sourceLabel(s: SourceType) {
  return { mvu: 'MVU', db: '数据库', static: '静态' }[s];
}
function mvuFieldsOf(w: Widget) {
  return getMvuFields(w.binding);
}
function dbColsOf(w: Widget) {
  return getDbColumns(w.binding);
}
function shortLabel(id: string) {
  return widgetNameById(id, store.config.widgets, id.slice(0, 6));
}
function syncBorder() {
  const l = store.config.layout;
  l.border = buildBorder(l.borderWidth, l.borderStyle, l.borderColor);
}
function onBorderColorVal(v: string) {
  store.config.layout.borderColor = v;
  syncBorder();
}
function onApplyDefaults() {
  if (confirm('用当前默认样式覆盖全部控件的字号/颜色等？（保留各控件宽度与方向）')) {
    store.applyDefaultsToAllWidgets();
  }
}

/* ---------- image 控件：上传 + 当前地址预览 ---------- */
// raw: 控件字段里写的原始值（可能是 base64 / URL / `img:<id>` 引用）
const currentImgRaw = computed<string>(() => {
  if (!selected.value || selected.value.type !== 'image') return '';
  void store.dataTick;
  const v = store.widgetValue(selected.value);
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && 'value' in v && typeof (v as any).value === 'string') {
    return String((v as any).value).trim();
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object' && 'value' in item) {
        const s = String((item as any).value ?? '').trim();
        if (s) return s;
      }
    }
  }
  return '';
});
// resolved：过 resolveImgSrc，把 `img:<id>` 换成图库里的真实 src，预览才能显示
const currentImgSrc = computed<string>(() =>
  resolveImgSrc(currentImgRaw.value, store.config.layout.images),
);
const currentImgPreview = computed(() => {
  const s = currentImgRaw.value;
  if (!s) return '';
  if (s.startsWith('img:')) {
    const entry = (store.config.layout.images || []).find(g => g.id === s.slice(4));
    return entry?.name ? `图库：${entry.name}` : `图库引用 ${s}`;
  }
  if (s.startsWith('data:')) return `base64（${(s.length / 1024).toFixed(1)} KB）`;
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
});

function triggerImgUpload() {
  const el = imgUploadEl.value;
  if (el) { el.value = ''; el.click(); }
}

/** 从已上传图库选一张图片绑定到当前控件的某 imageMap 条目（idx<0 表示普通模式静态值）。 */
function onPickGallery(imageId: string, idx: number) {
  if (!imageId || !selected.value) return;
  const refToken = `img:${imageId}`;
  if (idx >= 0) {
    const map = [...(selected.value.imageMap || [])];
    if (idx < map.length) map[idx] = { ...map[idx], src: refToken };
    else map.push({ keys: '', src: refToken });
    selected.value.imageMap = map;
  } else {
    store.updateWidget(selected.value.id, {
      source: 'static',
      binding: { ...(selected.value.binding || {}), static_value: refToken },
    });
  }
  setIoMsg('已选用图库图片', false);
}

/** 用输入框里的 URL 绑定为图片地址（不入图库，URL 直接保留）。idx<0 表示普通模式静态值。 */
function onUrlEnter(input: HTMLInputElement | null, idx: number) {
  if (!input || !selected.value) return;
  const url = (input.value || '').trim();
  if (!url) return;
  if (idx >= 0) {
    const map = [...(selected.value.imageMap || [])];
    if (idx < map.length) map[idx] = { ...map[idx], src: url };
    else map.push({ keys: '', src: url });
    selected.value.imageMap = map;
  } else {
    store.updateWidget(selected.value.id, {
      source: 'static',
      binding: { ...(selected.value.binding || {}), static_value: url },
    });
  }
  setIoMsg('已应用 URL（不入图库，链接保留原值）', false);
}

/** 映射模式：把 URL 绑到指定 imageMap 条目。 */
function onUrlEnterImageMap(url: string, mi: number) {
  if (!selected.value) return;
  const u = (url || '').trim();
  if (!u) return;
  const map = [...(selected.value.imageMap || [])];
  if (mi < map.length) map[mi] = { ...map[mi], src: u };
  selected.value.imageMap = map;
  setIoMsg('已应用 URL', false);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

/* ---------- 全局：导入字体（ttf/otf/woff/woff2 → base64 @font-face） ---------- */
function triggerFontUpload() {
  const el = fontUploadEl.value;
  if (el) { el.value = ''; el.click(); }
}

function fontBase64ToMime(format: string): string {
  switch (format) {
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'truetype':
      return 'font/ttf';
    case 'opentype':
      return 'font/otf';
    default:
      return 'font/woff2';
  }
}

async function onFontUpload(e: Event) {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file) return;
  const format = fontFormatForFile(file.name);
  if (!format) {
    setIoMsg(`不支持的字体格式：${file.name}（支持 ttf/otf/woff/woff2）`, true);
    return;
  }
  // 大文件提醒：base64 撑大 ~33%，存在聊天变量里；>2MB 的给个确认
  const kb = file.size / 1024;
  if (kb > 2048 && !confirm(`该字体 ${kb.toFixed(0)} KB，转 base64 后约 ${(kb * 1.34).toFixed(0)} KB 将写入角色卡配置，确定导入？`)) {
    return;
  }
  fontUploading.value = true;
  try {
    let dataUrl = await readFileAsDataURL(file);
    // 修正 MIME（部分浏览器 FileReader 给的 mime 可能不规范）
    const desiredMime = fontBase64ToMime(format);
    dataUrl = dataUrl.replace(/^data:[^;]*;/, `data:${desiredMime};`);
    const name = sanitizeFontName(file.name) || '自定义字体';
    const family = name;
    store.addFont({ name, family, src: dataUrl, format });
    setIoMsg(`字体「${name}」已导入`);
  } catch (err) {
    setIoMsg('字体读取失败', true);
    console.error('[自定义状态栏] onFontUpload', err);
  } finally {
    fontUploading.value = false;
  }
}

function onRenameFont(id: string, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  store.updateFont(id, { name: v });
}

function onRenameFontFamily(id: string, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  store.updateFont(id, { family: v });
}

function onRemoveFont(id: string) {
  if (!confirm('删除该自定义字体？（已选中的控件不会自动改回默认字体）')) return;
  store.removeFont(id);
}

function onRemoveImage(id: string, name: string) {
  const label = name ? `「${name}」` : '该图片';
  if (!confirm(`删除图库${label}？所有正在引用它的图片控件都会被清空（图片本身不再可显示）。`)) return;
  store.removeImage(id);
  setIoMsg('已删除图库图片，引用已清空', false);
}

function fontPreviewStyle(family: string): string {
  return familyCssValue(family) || 'inherit';
}

/* ---------- image 控件：映射表 ---------- */
let mapEntryIdCounter = 0;
const pendingMapIdx = ref(-1);
function addImageMapEntry() {
  if (!selected.value) return;
  const entry: ImageMapEntry = { keys: '', src: '', field: '', conds: [] };
  selected.value.imageMap = [...(selected.value.imageMap || []), entry];
}
function removeImageMapEntry(idx: number) {
  if (!selected.value) return;
  const arr = [...(selected.value.imageMap || [])];
  arr.splice(idx, 1);
  selected.value.imageMap = arr;
}
/** 给第 idx 条映射追加一个「附加条件」（field+keys，与主条件 AND） */
function addMapCond(idx: number) {
  if (!selected.value) return;
  const map = [...(selected.value.imageMap || [])];
  const entry = map[idx];
  if (!entry) return;
  const next = { ...entry, conds: [...(entry.conds || []), { field: '', keys: '' }] };
  map[idx] = next;
  selected.value.imageMap = map;
}
/** 删除第 idx 条映射的第 ci 个附加条件 */
function removeMapCond(idx: number, ci: number) {
  if (!selected.value) return;
  const map = [...(selected.value.imageMap || [])];
  const entry = map[idx];
  if (!entry) return;
  const conds = [...(entry.conds || [])];
  conds.splice(ci, 1);
  map[idx] = { ...entry, conds };
  selected.value.imageMap = map;
}
async function uploadImageMapEntry(idx: number) {
  const el = imgUploadEl.value;
  if (!el || !selected.value) return;
  el.value = '';
  pendingMapIdx.value = idx;
  el.click();
}

async function onImgUpload(e: Event) {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  const idx = pendingMapIdx.value;
  pendingMapIdx.value = -1;
  if (input) input.value = '';
  if (!file || !selected.value || selected.value.type !== 'image') return;
  try {
    const dataUrl = await readFileAsDataURL(file);
    // 入图库，得到 imageId；同 src 复用不重复入
    const imageId = store.addImage({ name: file.name || '', src: dataUrl });
    const refToken = `img:${imageId}`;
    if (idx >= 0) {
      // 映射模式：写入对应条目
      const map = [...(selected.value.imageMap || [])];
      if (idx < map.length) {
        map[idx] = { ...map[idx], src: refToken };
      } else {
        map.push({ keys: '', src: refToken });
      }
      selected.value.imageMap = map;
    } else {
      // 非 映射：写入静态绑定值
      store.updateWidget(selected.value.id, {
        source: 'static',
        binding: { ...(selected.value.binding || {}), static_value: refToken },
      });
    }
    setIoMsg('图片已存入图库并引用（删控件不丢图）', false);
  } catch (err) {
    setIoMsg('图片读取失败', true);
    console.error('[自定义状态栏] onImgUpload', err);
  }
}

function setIoMsg(msg: string, err = false) {
  ioMsg.value = msg;
  ioIsErr.value = err;
  if (msg) {
    window.setTimeout(() => {
      if (ioMsg.value === msg) ioMsg.value = '';
    }, 4000);
  }
}

function exportConfig() {
  try {
    const json = store.exportConfigJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `自定义状态栏配置_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // 同时尝试写入剪贴板，方便直接粘贴分享
    try {
      void navigator.clipboard?.writeText?.(json);
      setIoMsg('已导出文件，并复制到剪贴板');
    } catch {
      setIoMsg('已导出配置文件');
    }
  } catch (e: any) {
    setIoMsg(`导出失败：${e?.message || e}`, true);
  }
}

function triggerImport() {
  const el = importInputEl.value;
  if (el) {
    el.value = '';
    el.click();
  }
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    if (!confirm('导入将覆盖当前聊天中的状态栏配置，确定？')) return;
    const err = store.importConfigJson(text);
    if (err) setIoMsg(err, true);
    else {
      selectedId.value = '';
      setIoMsg('导入成功');
    }
  };
  reader.onerror = () => setIoMsg('读取文件失败', true);
  reader.readAsText(file, 'utf-8');
}

let idCounter = 0;
function addWidget(parentId?: string) {
  const id = `w_${Date.now()}_${idCounter++}`;
  const defaults = store.config.layout.widgetDefaults || baseStyle;
  const w: Widget = {
    id,
    type: 'label',
    source: 'static',
    binding: { ...emptyBinding, static_value: '新控件' },
    label: '新控件',
    children: [],
    rows: [],
    collapsed: false,
    style: { ...defaults },
  };
  store.addWidget(w, parentId ? { parentId } : undefined);
  selectedId.value = id;
  tab.value = 'widgets';
  if (!parentId) pickerOpen.value = true;
}
function del(id: string) {
  if (confirm('删除该控件？')) {
    store.removeWidget(id);
    if (selectedId.value === id) selectedId.value = '';
  }
}

/** 粘贴剪贴板控件到顶层，并选中新控件。剪贴板为空时静默忽略。 */
function pasteTop() {
  if (!store.widgetClipboard) return;
  const newId = store.pasteWidgetTop();
  if (newId) {
    selectedId.value = newId;
    tab.value = 'widgets';
    pickerOpen.value = true;
  }
}

/** 粘贴剪贴板控件进当前选中的 group / stack 作子控件，并选中新控件。 */
function pasteIntoSelected() {
  const pid = selectedId.value;
  if (!pid || !store.widgetClipboard) return;
  const newId = store.pasteWidgetInto(pid);
  if (newId) {
    selectedId.value = newId;
    tab.value = 'widgets';
  }
}
function moveVisual(i: number, delta: number) {
  const list = visualWidgets.value;
  const a = list[i];
  if (!a || nestedIds.value.has(a.id)) return;
  const j = findSwapTarget(i, delta);
  if (j < 0) return;
  const b = list[j];
  if (!b || nestedIds.value.has(b.id)) return;

  // 在布局 rows 中交换两个顶层控件位置（含 group，子控件随 group 一起走）
  const rows = store.config.layout.rows.map(r => ({ ...r, widgetIds: [...r.widgetIds] }));
  let posA: { ri: number; ci: number } | null = null;
  let posB: { ri: number; ci: number } | null = null;
  for (let ri = 0; ri < rows.length; ri++) {
    const ciA = rows[ri].widgetIds.indexOf(a.id);
    const ciB = rows[ri].widgetIds.indexOf(b.id);
    if (ciA >= 0) posA = { ri, ci: ciA };
    if (ciB >= 0) posB = { ri, ci: ciB };
  }
  if (posA && posB) {
    rows[posA.ri].widgetIds[posA.ci] = b.id;
    rows[posB.ri].widgetIds[posB.ci] = a.id;
    store.setRows(rows);
    return;
  }
  // 一方不在 rows（游离控件）：把 a 插到 b 所在行附近
  if (posB && !posA) {
    rows[posB.ri].widgetIds.splice(posB.ci + (delta > 0 ? 1 : 0), 0, a.id);
    // 从其它行去掉 a（若有）
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri === posB.ri) continue;
      rows[ri].widgetIds = rows[ri].widgetIds.filter(id => id !== a.id);
    }
    store.setRows(rows);
  }
}
function doAddChild() {
  if (!selected.value || !addChildId.value) return;
  store.addChildToGroup(selected.value.id, addChildId.value);
  addChildId.value = '';
}
function onPickerConfirm(v: {
  source: SourceType;
  binding: Binding;
  name?: string;
  multiMode?: 'merge' | 'split';
}) {
  if (!selected.value) return;

  const multiFields =
    v.source === 'mvu' && (v.binding.mvu_fields?.length || 0) > 1
      ? [...(v.binding.mvu_fields || [])]
      : v.source === 'db' && (v.binding.db_columns?.length || 0) > 1
        ? [...(v.binding.db_columns || [])]
        : null;

  // 默认合并到一个控件；仅 split 时拆成多个
  if (multiFields && multiFields.length > 1 && v.multiMode === 'split') {
    const defaults = { ...(store.config.layout.widgetDefaults || baseStyle) };
    const curType =
      selected.value.type === 'group' ||
      selected.value.type === 'divider' ||
      selected.value.type === 'stack'
        ? 'label'
        : selected.value.type;
    const parentId = nestedIds.value.has(selected.value.id)
      ? store.config.widgets.find(
          w => (w.type === 'group' || w.type === 'stack') && w.children?.includes(selected.value!.id),
        )?.id
      : undefined;

    const stamp = Date.now();
    multiFields.forEach((field, idx) => {
      const binding: Binding =
        v.source === 'mvu'
          ? {
              ...emptyBinding,
              mvu_parent: v.binding.mvu_parent,
              mvu_field: field,
              mvu_fields: [field],
            }
          : {
              ...emptyBinding,
              db_table: v.binding.db_table,
              db_row: v.binding.db_row,
              db_column: field,
              db_columns: [field],
            };
      if (idx === 0) {
        store.updateWidget(selected.value!.id, {
          source: v.source,
          binding,
          type: curType,
          name:
            !selected.value!.name || selected.value!.name === '新控件'
              ? field
              : selected.value!.name,
        });
      } else {
        const id = `w_${stamp}_${idCounter++}_${idx}`;
        const w: Widget = {
          id,
          type: curType,
          source: v.source,
          binding,
          name: field,
          children: [],
          rows: [],
          collapsed: false,
          style: { ...defaults },
        };
        store.addWidget(w, parentId ? { parentId } : undefined);
      }
    });
    return;
  }

  // merge（默认）：多字段保留在同一 binding，控件内 stack/inline 展示
  const patch: Partial<Widget> = { source: v.source, binding: v.binding };
  if (v.name && (!selected.value.name || selected.value.name === '新控件')) {
    patch.name = v.name;
  }
  store.updateWidget(selected.value.id, patch);
}
</script>

<style scoped>
.ep-drawer {
  position: relative;
  flex: 0 0 min(380px, 42%);
  width: min(380px, 42%);
  max-width: 420px;
  align-self: stretch;
  background: var(--ep-bg, #fff);
  border-left: 1px solid var(--ep-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  z-index: 20;
  color: var(--ep-text, #111827);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  min-height: 240px;
  height: auto;
  max-height: none;
  overflow: visible;
  box-sizing: border-box;
}

.ep-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  background: var(--ep-bg2, #f3f4f6);
  border-bottom: 1px solid var(--ep-border, #e5e7eb);
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
  color: var(--ep-text, #111827);
}
.ep-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.ep-layout-btn {
  border: 1px solid var(--ep-accent, #3b82f6);
  background: var(--ep-accent-soft, #eff6ff);
  color: var(--ep-accent, #1e40af);
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
}
.ep-close {
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--ep-muted, #666);
  line-height: 1;
}
.ep-tabs {
  display: flex;
  border-bottom: 1px solid var(--ep-border, #e5e7eb);
  flex-shrink: 0;
}
.ep-tabs button {
  flex: 1;
  border: none;
  background: var(--ep-bg2, #f9fafb);
  padding: 8px 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--ep-muted, #6b7280);
  border-bottom: 2px solid transparent;
}
.ep-tabs button.on {
  color: var(--ep-accent, #1e40af);
  background: var(--ep-bg, #fff);
  border-bottom-color: var(--ep-accent, #3b82f6);
  font-weight: 600;
}
.ep-body {
  flex: 1 1 auto;
  min-height: 0;
  /* 不用 vh（iframe 宿主高度会撑歪）；固定上限，内容多再内部滚 */
  max-height: 520px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 12px 20px;
  -webkit-overflow-scrolling: touch;
  background: var(--ep-bg, #fff);
  color: var(--ep-text, #111827);
  scrollbar-width: thin;
  scrollbar-color: var(--ep-scrollbar, rgba(90, 158, 144, 0.4)) transparent;
}
.ep-binding {
  flex-wrap: wrap;
}
.ep-w-actions button {
  min-width: 28px;
  min-height: 28px;
}
.ep-body::-webkit-scrollbar,
.ep-widget-list::-webkit-scrollbar,
.ep-rows-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.ep-body::-webkit-scrollbar-track,
.ep-widget-list::-webkit-scrollbar-track,
.ep-rows-preview::-webkit-scrollbar-track {
  background: transparent;
}
.ep-body::-webkit-scrollbar-thumb,
.ep-widget-list::-webkit-scrollbar-thumb,
.ep-rows-preview::-webkit-scrollbar-thumb {
  background: var(--ep-scrollbar, rgba(90, 158, 144, 0.4));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.ep-body::-webkit-scrollbar-thumb:hover,
.ep-widget-list::-webkit-scrollbar-thumb:hover,
.ep-rows-preview::-webkit-scrollbar-thumb:hover {
  background: var(--ep-scrollbar-hover, rgba(90, 158, 144, 0.65));
  background-clip: padding-box;
}
.ep-widget-list,
.ep-rows-preview {
  scrollbar-width: thin;
  scrollbar-color: var(--ep-scrollbar, rgba(90, 158, 144, 0.4)) transparent;
}
.ep-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ep-text, #374151);
  margin: 12px 0 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ep-fold {
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 8px;
  background: var(--ep-bg2, rgba(0, 0, 0, 0.02));
  margin: 8px 0;
  overflow: hidden;
}
.ep-fold-sum {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ep-text, inherit);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ep-fold-sum::-webkit-details-marker {
  display: none;
}
.ep-fold-sum::before {
  content: '▸';
  font-size: 11px;
  opacity: 0.7;
  width: 12px;
  flex-shrink: 0;
}
.ep-fold[open] > .ep-fold-sum::before {
  content: '▾';
}
.ep-fold[open] > .ep-fold-sum {
  border-bottom: 1px solid var(--ep-border, #e5e7eb);
  background: var(--ep-input-bg, transparent);
}
.ep-fold > .ep-form {
  padding: 8px;
}
.ep-add {
  border: none;
  background: var(--ep-accent, #3b82f6);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.ep-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ep-add-row {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.ep-dark .ep-add {
  color: #0f1a18;
}
.ep-style-ops {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.ep-style-ops .ep-link-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ep-link-btn {
  border: none;
  background: none;
  color: var(--ep-accent, #3b82f6);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.ep-widget-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}
.ep-widget-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid var(--ep-border, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
}
.ep-widget-item.selected {
  background: var(--ep-accent-soft, #dbeafe);
  border-color: var(--ep-accent, #3b82f6);
}
.ep-widget-item.nested {
  margin-left: 12px;
  background: var(--ep-bg2, #fafafa);
}
.ep-w-fold {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: var(--ep-accent-soft, rgba(109, 181, 163, 0.18));
  color: var(--ep-accent, #5fad9c);
  font-size: 11px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ep-w-fold:hover {
  background: var(--ep-accent, #5fad9c);
  color: #fff;
}
.ep-dark .ep-w-fold:hover {
  color: #0f1a18;
}
.ep-w-fold-spacer {
  flex-shrink: 0;
  width: 18px;
}
.ep-w-count {
  flex-shrink: 0;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ep-accent-soft, rgba(109, 181, 163, 0.2));
  color: var(--ep-muted, #6b8f86);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ep-w-type {
  color: var(--ep-muted, #6b7280);
  font-size: 10px;
}
.ep-w-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-w-actions button {
  border: none;
  background: var(--ep-bg2, #f3f4f6);
  color: var(--ep-text, #111);
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  margin-left: 1px;
}
.ep-w-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ep-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ep-presets button {
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
}
.ep-form {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 6px 6px;
  align-items: center;
  font-size: 12px;
}
.ep-form label {
  color: var(--ep-muted, #6b7280);
}
.ep-form input[type='text'],
.ep-form input[type='number'],
.ep-form select {
  padding: 4px 6px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 4px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
}
/* range 细节见下方非 scoped：需压过酒馆全局 input 边框 */
.ep-form input[type='color'] {
  width: 32px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 4px;
  background: var(--ep-input-bg, #fff);
}
.ep-val {
  font-size: 11px;
  color: var(--ep-text, #374151);
  min-width: 32px;
  text-align: right;
}
.ep-val.muted {
  color: var(--ep-muted, #9ca3af);
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-span2 {
  grid-column: 2 / -1;
}
.ep-seg {
  display: flex;
  gap: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 6px;
  overflow: hidden;
}
.ep-seg button {
  flex: 1;
  border: none;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  padding: 4px 4px;
  cursor: pointer;
  font-size: 11px;
  border-right: 1px solid var(--ep-border, #e5e7eb);
}
.ep-seg button:last-child {
  border-right: none;
}
.ep-seg button.on {
  background: var(--ep-accent, #3b82f6);
  color: #fff;
}
.ep-dark .ep-seg button.on {
  color: #0f1a18;
}
.ep-color-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ep-chip {
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-bg2, #f9fafb);
  color: var(--ep-text, #111);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
}
.ep-chip.danger {
  border-color: var(--ep-danger, #fca5a5);
  color: var(--ep-danger, #b91c1c);
  background: var(--ep-danger-bg, #fef2f2);
}
.ep-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ep-binding {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ep-binding-summary {
  font-size: 11px;
  color: var(--ep-muted, #6b7280);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ep-binding button {
  border: 1px solid var(--ep-accent, #3b82f6);
  background: var(--ep-accent-soft, #eff6ff);
  color: var(--ep-accent, #1e40af);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
}
.ep-rows-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 2px;
}
.ep-row-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: var(--ep-bg2, #f9fafb);
  border-radius: 6px;
}
.ep-row-line {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 0;
  color: var(--ep-text, #111);
}
.ep-row-align {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
}
.ep-row-margin {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
}
.ep-row-margin-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ep-row-margin input[type='range'] {
  width: 0;
  flex: 1 1 auto;
  min-width: 48px;
}
.ep-row-align-label {
  opacity: 0.75;
  flex-shrink: 0;
}
.ep-row-align select {
  padding: 1px 4px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 4px;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  font-size: 11px;
}
.ep-smart-eq {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  opacity: 0.92;
}
.ep-smart-eq input {
  margin: 0;
  accent-color: #5fad9c;
  cursor: pointer;
}

.ep-row-weights label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ep-row-weights input[type='number'] {
  width: 44px;
  padding: 1px 3px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 4px;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  font-size: 11px;
}
.ep-mini-select {
  font-size: 11px;
  padding: 1px 2px;
  border-radius: 4px;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
}
.ep-row-cols-readonly {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--ep-input-bg, #f3f4f6);
  color: var(--ep-muted, #6b7280);
  flex-shrink: 0;
}
.ep-row-ids {
  color: var(--ep-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ep-icon {
  border: none;
  background: var(--ep-bg2, #f3f4f6);
  color: var(--ep-text, #111);
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.ep-icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ep-add-row {
  border: 1px dashed var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--ep-muted, #6b7280);
}
.ep-reset {
  margin-top: 12px;
  border: 1px solid var(--ep-danger, #ef4444);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-danger, #b91c1c);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.ep-apply-defaults {
  margin-top: 12px;
  width: 100%;
  border: 1px solid var(--ep-accent, #3b82f6);
  background: var(--ep-accent-soft, #eff6ff);
  color: var(--ep-accent, #1e40af);
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.ep-empty {
  color: var(--ep-muted, #9ca3af);
  font-size: 12px;
  padding: 16px;
  text-align: center;
}
.ep-hint {
  font-size: 11px;
  color: var(--ep-muted, #9ca3af);
  padding: 4px 0;
}
.ep-row-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ep-text, #374151);
  cursor: pointer;
}
.ep-auto-rows {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--ep-border, #2c3a48);
}
.ep-auto-rows-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 10px;
  align-items: center;
  padding: 6px 0 2px;
  font-size: 12px;
}
.ep-auto-rows-body select {
  min-width: 0;
}
.ep-auto-rows-filter {
  min-width: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.4;
  outline: none;
  box-sizing: border-box;
  width: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-auto-rows-filter::placeholder {
  color: var(--ep-muted, #9ca3af);
}
.ep-auto-rows-filter:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-hint-block {
  font-size: 11px;
  color: var(--ep-muted, #6b7280);
  background: var(--ep-bg2, #f3f4f6);
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 8px;
  line-height: 1.45;
}
.ep-io-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}
.ep-io-btn {
  border: 1px solid var(--ep-accent, #3b82f6);
  background: var(--ep-accent-soft, #eff6ff);
  color: var(--ep-accent, #1e40af);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.ep-io-btn:hover {
  filter: brightness(1.05);
}
.ep-io-file {
  display: none;
}
.ep-io-msg {
  font-size: 11px;
  color: var(--ep-accent, #059669);
  margin-bottom: 8px;
  line-height: 1.4;
}
.ep-io-msg.err {
  color: var(--ep-danger, #b91c1c);
}
.ep-img-status {
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 6px;
  word-break: break-all;
}
.ep-img-status .ok { color: var(--ep-accent, #059669); }
.ep-img-status .err { color: var(--ep-danger, #b91c1c); }
.ep-img-status .muted { color: var(--ep-muted, #6b7280); }
.ep-img-status .break { word-break: break-all; }
.ep-img-preview {
  display: block;
  max-width: 100%;
  max-height: 120px;
  border-radius: 6px;
  border: 1px solid var(--ep-border, #e5e7eb);
  object-fit: contain;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.06);
}
.ep-img-url-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.ep-img-url-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-url-input::placeholder {
  color: var(--ep-muted, #9ca3af);
}
.ep-img-url-input:hover {
  border-color: var(--ep-accent, #5fad9c);
}
.ep-img-url-input:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-gallery-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  grid-column: 1 / -1;
  min-width: 0;
}
.ep-gallery-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ep-gallery-thumb-btn {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
}
.ep-gallery-thumb-btn:hover .ep-gallery-thumb {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.25));
}
.ep-gallery-thumb {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--ep-border, #e5e7eb);
  background: rgba(0, 0, 0, 0.06);
  display: block;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-gallery-name {
  flex: 1 1 auto;
  min-width: 0;
  width: auto !important;
}
.ep-gallery-id {
  font-size: 10px;
  color: var(--ep-muted, #6b7280);
  font-family: monospace;
  flex: 0 0 auto;
}
.ep-img-match-toggle {
  font-size: 11px;
  font-weight: normal;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--ep-muted, #6b7280);
}
.ep-img-stretch-row {
  display: flex;
  align-items: center;
}
.ep-img-stretch-toggle {
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--ep-text, #374151);
}
.ep-img-stretch-row + select:disabled {
  opacity: 0.5;
}
.ep-img-map {
  margin-bottom: 8px;
}
.ep-img-map-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid var(--ep-border, #e5e7eb);
  border-radius: 6px;
  padding: 6px;
  margin-bottom: 6px;
  background: var(--ep-bg-soft, transparent);
}
.ep-img-map-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.ep-img-map-thumb-btn {
  flex: 0 0 auto;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: 6px;
}
.ep-img-map-thumb-btn:hover .ep-img-map-thumb {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.25));
}
.ep-img-map-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ep-img-map-line2 {
  flex-wrap: nowrap;
  gap: 4px;
}
.ep-img-map-idx {
  font-size: 11px;
  color: var(--ep-muted, #6b7280);
  text-align: right;
  width: 16px;
  flex: 0 0 16px;
}
.ep-img-map-keys {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.4;
  outline: none;
  box-sizing: border-box;
  width: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-map-keys::placeholder {
  color: var(--ep-muted, #9ca3af);
}
.ep-img-map-keys:hover {
  border-color: var(--ep-accent, #5fad9c);
}
.ep-img-map-keys:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-img-map-line-field {
  padding-left: 22px;
}
.ep-img-map-field-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--ep-muted, #6b7280);
  white-space: nowrap;
}
.ep-img-map-field {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.4;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-map-field:hover {
  border-color: var(--ep-accent, #5fad9c);
}
.ep-img-map-field:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-img-map-field:disabled {
  opacity: 0.4;
  cursor: default;
}
/* ---- 附加条件（字段+关键词，与主条件同时满足） ---- */
.ep-img-map-conds {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 22px;
  min-width: 0;
}
.ep-img-map-cond {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.ep-img-map-cond-field,
.ep-img-map-cond-keys {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  line-height: 1.4;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-map-cond-field {
  cursor: pointer;
  flex: 0 1 38%;
}
.ep-img-map-cond-keys:focus,
.ep-img-map-cond-field:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-img-map-cond-keys::placeholder,
.ep-img-map-cond-field:disabled {
  color: var(--ep-muted, #9ca3af);
  opacity: 1;
}
.ep-img-map-cond .ep-chip {
  flex: 0 0 auto;
  padding: 3px 8px;
  white-space: nowrap;
}
.ep-img-map-cond-add {
  align-self: flex-start;
  margin-left: 22px;
  margin-top: 2px;
}
.ep-img-map-thumb {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--ep-border, #e5e7eb);
  background: var(--ep-input-bg, rgba(0, 0, 0, 0.06));
  display: block;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-map-thumb.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ep-bg2, rgba(0, 0, 0, 0.06));
  color: var(--ep-muted, #6b7280);
  font-size: 11px;
}
.ep-img-map-gallery,
.ep-img-map-url {
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111827);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-img-map-gallery:hover,
.ep-img-map-url:hover {
  border-color: var(--ep-accent, #5fad9c);
}
.ep-img-map-gallery:focus,
.ep-img-map-url:focus {
  border-color: var(--ep-accent, #5fad9c);
  box-shadow: 0 0 0 2px var(--ep-accent-soft, rgba(95, 173, 156, 0.2));
}
.ep-img-map-url::placeholder {
  color: var(--ep-muted, #9ca3af);
}
.ep-img-map-gallery {
  flex: 1 1 auto;
  min-width: 60px;
}
.ep-img-map-url {
  flex: 1 1 auto;
  min-width: 60px;
}
.ep-img-map-line2 .ep-chip {
  flex: 0 0 auto;
  padding: 3px 8px;
  white-space: nowrap;
}
.ep-img-map-add {
  margin-top: 4px;
}
.ep-children {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ep-child-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ep-page-mark {
  width: 14px;
  text-align: center;
  font-size: 11px;
  color: var(--ep-accent, #5fad9c);
  flex-shrink: 0;
}
.ep-page-mark.off {
  opacity: 0.35;
}
.ep-child-name {
  flex: 1;
  text-align: left;
  border: 1px solid var(--ep-border, #e5e7eb);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  cursor: pointer;
}
.ep-add-existing {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 6px;
}
.ep-add-existing-label {
  font-size: 11px;
  color: var(--ep-muted, #6b7280);
}
.ep-candidate-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 6px;
  background: var(--ep-input-bg, #fff);
}
.ep-candidate-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 4px;
  min-width: 0;
}
.ep-candidate-row.is-container.is-root {
  margin-top: 3px;
  padding-top: 1px;
  border-top: 1px dashed var(--ep-border, #e0e0e0);
}
.ep-candidate-row.is-container.is-root:first-child {
  margin-top: 0;
  border-top: none;
}
.ep-candidate-fold {
  flex-shrink: 0;
  width: 16px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--ep-muted, #6b7280);
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
}
.ep-candidate-fold:hover {
  background: var(--ep-accent-soft, rgba(95, 173, 156, 0.18));
  color: var(--ep-accent, #5fad9c);
}
.ep-candidate-fold-spacer {
  flex-shrink: 0;
  width: 16px;
}
.ep-candidate-name {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ep-text, #111);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  line-height: 1.3;
  cursor: pointer;
  box-sizing: border-box;
  overflow: hidden;
}
.ep-candidate-row.is-container > .ep-candidate-name {
  font-weight: 600;
  background: var(--ep-bg2, #f3f4f6);
}
.ep-candidate-type {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ep-muted, #9ca3af);
  font-weight: 400;
}
.ep-candidate-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-candidate-count {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 400;
  color: var(--ep-muted, #9ca3af);
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ep-accent-soft, rgba(95, 173, 156, 0.18));
}
.ep-candidate-name:hover {
  background: var(--ep-accent-soft, rgba(95, 173, 156, 0.14));
}
.ep-candidate-name.on {
  background: var(--ep-accent, #5fad9c) !important;
  color: #fff;
  border-color: var(--ep-accent, #5fad9c);
}
.ep-candidate-name.on .ep-candidate-type,
.ep-candidate-name.on .ep-candidate-count {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.18);
}
.ep-dark .ep-candidate-name.on {
  color: #0f1a18;
}
.ep-dark .ep-candidate-name.on .ep-candidate-type,
.ep-dark .ep-candidate-name.on .ep-candidate-count {
  color: rgba(15, 26, 24, 0.85);
}
/* StyleForm 继承主题变量 */
.ep-drawer :deep(.sf-form label) {
  color: var(--ep-muted, #6b7280);
}
.ep-drawer :deep(.sf-form select),
.ep-drawer :deep(.sf-form input[type='color']) {
  border-color: var(--ep-border, #d1d5db);
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
}
.ep-drawer :deep(.sf-val) {
  color: var(--ep-text, #374151);
}
.ep-drawer :deep(.sf-val.muted) {
  color: var(--ep-muted, #9ca3af);
}
.ep-drawer :deep(.sf-seg) {
  border-color: var(--ep-border, #d1d5db);
}
.ep-drawer :deep(.sf-seg button) {
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, #111);
  border-right-color: var(--ep-border, #e5e7eb);
}
.ep-drawer :deep(.sf-seg button.on) {
  background: var(--ep-accent, #3b82f6);
  color: #fff;
}
.ep-dark :deep(.sf-seg button.on) {
  color: #0f1a18;
}
.ep-drawer :deep(.sf-chip) {
  border-color: var(--ep-border, #d1d5db);
  background: var(--ep-bg2, #f9fafb);
  color: var(--ep-text, #111);
}

/* 导入字体子区（边框与字体折叠内） */
.ep-fonts-sub {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--ep-border, #d1d5db);
}
.ep-fonts-sub-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--ep-text, #374151);
  margin-bottom: 4px;
}
.ep-fonts-sub .ep-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ep-font-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.ep-font-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 4px 6px;
  align-items: center;
  padding: 4px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 6px;
  background: var(--ep-input-bg, #fff);
}
.ep-font-name {
  min-width: 0;
  border: 1px solid var(--ep-border, #e5e7eb);
  background: var(--ep-bg2, #f9fafb);
  color: var(--ep-text, #111);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
.ep-font-preview {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--ep-text, #374151);
  background: var(--ep-bg2, #f3f4f6);
  border-radius: 4px;
  padding: 4px 6px;
  line-height: 1.4;
  overflow: hidden;
  word-break: break-all;
}
</style>

<style>
/*
 * 编辑器 range：彻底无边框。
 * 策略：整条控件做成 4px 圆角胶囊（背景=轨道色），不依赖 track 伪元素画边，
 * 拇指单独覆盖。用于压过酒馆全局 input 边框。
 */
#custom-status-bar-host .ep-drawer input[type='range'],
.ep-drawer input[type='range'],
.ep-drawer .ep-form input[type='range'],
.ep-drawer .sf-form input[type='range'],
.ep-drawer .ep-rows-preview input[type='range'],
.ep-drawer .ep-row-margin input[type='range'] {
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  appearance: none !important;
  width: 100% !important;
  height: 4px !important;
  min-height: 4px !important;
  max-height: 4px !important;
  margin: 7px 0 !important;
  padding: 0 !important;
  box-sizing: content-box !important;
  background: var(--ep-range-track, var(--ep-scrollbar, rgba(125, 182, 170, 0.35))) !important;
  background-color: var(--ep-range-track, var(--ep-scrollbar, rgba(125, 182, 170, 0.35))) !important;
  background-image: none !important;
  border: 0 none transparent !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;
  border-image: none !important;
  outline: 0 none transparent !important;
  outline-width: 0 !important;
  outline-style: none !important;
  outline-color: transparent !important;
  box-shadow: none !important;
  filter: none !important;
  border-radius: 999px !important;
  overflow: visible !important;
  color: transparent !important;
  accent-color: var(--ep-range-thumb, var(--ep-accent, #7ec9b8)) !important;
  cursor: pointer !important;
}
#custom-status-bar-host .ep-drawer input[type='range']:focus,
#custom-status-bar-host .ep-drawer input[type='range']:focus-visible,
#custom-status-bar-host .ep-drawer input[type='range']:active,
#custom-status-bar-host .ep-drawer input[type='range']:hover,
.ep-drawer input[type='range']:focus,
.ep-drawer input[type='range']:focus-visible,
.ep-drawer input[type='range']:active,
.ep-drawer input[type='range']:hover {
  border: 0 none transparent !important;
  outline: 0 none transparent !important;
  box-shadow: none !important;
  background: var(--ep-range-track, var(--ep-scrollbar, rgba(125, 182, 170, 0.35))) !important;
}
/* WebKit：轨道透明，背景由 input 本体提供，避免出现第二层矩形框 */
#custom-status-bar-host .ep-drawer input[type='range']::-webkit-slider-runnable-track,
.ep-drawer input[type='range']::-webkit-slider-runnable-track {
  -webkit-appearance: none !important;
  height: 4px !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
}
#custom-status-bar-host .ep-drawer input[type='range']::-webkit-slider-thumb,
.ep-drawer input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 14px !important;
  height: 14px !important;
  margin-top: -5px !important;
  border: 0 none transparent !important;
  border-radius: 50% !important;
  background: var(--ep-range-thumb, var(--ep-accent, #7ec9b8)) !important;
  box-shadow: none !important;
  cursor: pointer !important;
}
#custom-status-bar-host .ep-drawer input[type='range']:hover::-webkit-slider-thumb,
.ep-drawer input[type='range']:hover::-webkit-slider-thumb {
  background: var(--ep-range-thumb-hover, var(--ep-scrollbar-hover, #6ebfb0)) !important;
}
/* Firefox */
#custom-status-bar-host .ep-drawer input[type='range']::-moz-range-track,
.ep-drawer input[type='range']::-moz-range-track {
  height: 4px !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
}
#custom-status-bar-host .ep-drawer input[type='range']::-moz-range-progress,
.ep-drawer input[type='range']::-moz-range-progress {
  height: 4px !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
}
#custom-status-bar-host .ep-drawer input[type='range']::-moz-range-thumb,
.ep-drawer input[type='range']::-moz-range-thumb {
  width: 14px !important;
  height: 14px !important;
  border: 0 none transparent !important;
  border-radius: 50% !important;
  background: var(--ep-range-thumb, var(--ep-accent, #7ec9b8)) !important;
  box-shadow: none !important;
  cursor: pointer !important;
}
#custom-status-bar-host .ep-drawer input[type='range']:hover::-moz-range-thumb,
.ep-drawer input[type='range']:hover::-moz-range-thumb {
  background: var(--ep-range-thumb-hover, var(--ep-scrollbar-hover, #6ebfb0)) !important;
}
#custom-status-bar-host .ep-drawer input[type='range']::-moz-focus-outer,
.ep-drawer input[type='range']::-moz-focus-outer {
  border: 0 !important;
}
#custom-status-bar-host .ep-drawer .ep-row-margin input[type='range'],
.ep-drawer .ep-row-margin input[type='range'] {
  width: 0 !important;
  flex: 1 1 auto !important;
  min-width: 48px !important;
}

/* ---------- 图片大图预览（lightbox） ---------- */
.ep-lightbox {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  width: 100dvw;
  height: 100vh;
  height: 100dvh;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.78);
  cursor: zoom-out;
  animation: ep-lightbox-fade 0.12s ease-out;
}
.ep-lightbox-img {
  display: block;
  max-width: calc(100vw - 48px);
  max-width: calc(100dvw - 48px);
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  cursor: default;
  background: #fff;
}
.ep-lightbox-close {
  position: fixed;
  top: 18px;
  right: 24px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.ep-lightbox-close:hover {
  background: rgba(255, 255, 255, 0.3);
}
@keyframes ep-lightbox-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>