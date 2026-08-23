<template>
  <div ref="rootEl" class="bf-root" :data-theme="theme">
    <!-- 悬浮球 (可拖动) -->
    <div
      class="bf-orb"
      :class="{ dragging: isDragging }"
      :style="panelOpen ? { left: anchorX + 'px', top: anchorY + 'px' } : undefined"
      :title="panelOpen ? '收起彼方' : '打开彼方'"
      @pointerdown="onOrbPointerDown"
      @click="onOrbClick"
    >
      <svg class="bf-orb-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="bf-orb-star-grad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="var(--bf-accent-text)" />
            <stop offset="1" stop-color="var(--bf-accent-strong)" />
          </linearGradient>
        </defs>
        <path
          d="M24 7 C25.6 17.2 30.8 22.4 41 24 C30.8 25.6 25.6 30.8 24 41 C22.4 30.8 17.2 25.6 7 24 C17.2 22.4 22.4 17.2 24 7 Z"
          stroke="url(#bf-orb-star-grad)"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
      </svg>
      <svg class="bf-orb-comp" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2.5 C8.9 7 9 7.1 13.5 8 C9 8.9 8.9 9 8 13.5 C7.1 9 7 8.9 2.5 8 C7 7.1 7.1 7 8 2.5 Z"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
      <span v-if="panelOpen" class="bf-orb-close-badge"><PhX :size="10" weight="bold" /></span>
      <span v-if="updatingActive" class="bf-orb-spinner"></span>
    </div>

    <!-- 居中弹窗面板 -->
    <Transition name="bf-fade">
      <div v-if="panelOpen" class="bf-backdrop" @click="closePanel"></div>
    </Transition>

    <Transition name="bf-pop">
      <div v-if="panelOpen" class="bf-panel" @click.stop>
        <!-- Header -->
        <header class="bf-header">
          <div class="bf-brand">
            <div class="bf-logo">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="bf-logo-star-grad" x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="#fdf6e7" />
                    <stop offset="1" stop-color="var(--bf-accent)" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 3.5 C13.1 8.6 15.4 10.9 20.5 12 C15.4 13.1 13.1 15.4 12 20.5 C10.9 15.4 8.6 13.1 3.5 12 C8.6 10.9 10.9 8.6 12 3.5 Z"
                  stroke="url(#bf-logo-star-grad)"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="bf-brand-text">
              <div class="bf-title">
                彼方
                <span class="bf-title-en">Elsewhere</span>
              </div>
              <div class="bf-subtitle">NPC 幕后生命状态系统</div>
            </div>
          </div>

          <!-- 顶部导航栏 -->
          <nav class="bf-navbar">
            <button
              v-for="item in tabs"
              :key="item.key"
              class="bf-nav"
              :class="{ active: tab === item.key }"
              @click="tab = item.key"
            >
              <component :is="item.icon" class="bf-nav-icon" :size="16" :weight="tab === item.key ? 'fill' : 'regular'" />
              <span class="bf-nav-label">{{ item.label }}</span>
            </button>
          </nav>

          <div class="bf-header-right">
            <div class="bf-ready" :class="{ ok: ready }" :title="statusTitle">
              <span class="bf-dot"></span>
              {{ ready ? '已就绪' : '未配置' }}
            </div>
            <div class="bf-clock">{{ nowText }}</div>
            <button class="bf-btn bf-btn-sm bf-btn-primary" :disabled="updating" @click="manualUpdate">
              <span v-if="updating" class="bf-spinner"></span>
              <PhArrowsClockwise v-else :size="14" weight="bold" />
              <span>{{ updating ? '更新中…' : '更新' }}</span>
            </button>
            <button
              class="bf-icon-btn bf-theme-btn"
              :title="theme === 'light' ? '切换到深色模式' : '切换到白天模式'"
              @click="toggleTheme"
            >
              <PhSun v-if="theme === 'light'" :size="17" weight="duotone" />
              <PhMoon v-else :size="17" weight="duotone" />
            </button>
            <button class="bf-icon-btn" title="收起" @click="closePanel"><PhX :size="16" weight="bold" /></button>
          </div>
        </header>

        <!-- 主内容 -->
        <div class="bf-body">
          <main class="bf-main">
            <Transition name="bf-pagefade" mode="out-in">
              <!-- 仪表盘 -->
              <div v-if="tab === 'dashboard'" key="dashboard" class="bf-page">
                <div class="bf-page-title"><PhGauge :size="18" weight="duotone" /> 仪表盘</div>

                <div class="bf-dash-layout">
                  <!-- 左栏：追踪 NPC 生活网格 -->
                  <div class="bf-dash-main">
                    <div class="bf-panel-card">
                      <div class="bf-panel-card-title">
                        <PhUsers :size="14" weight="duotone" /> 追踪的 NPC
                        <span class="bf-panel-card-count">{{ npcList.length }}</span>
                      </div>
                      <div class="bf-row">
                        <input v-model="newNpcName" class="bf-input" placeholder="输入NPC名字后回车或点添加" @keyup.enter="openAddDialog" />
                        <button class="bf-btn" @click="openAddDialog"><PhUserPlus :size="15" weight="bold" />添加</button>
                      </div>
                      <div v-if="npcList.length === 0" class="bf-empty">
                        <div class="bf-empty-text">还没有追踪任何 NPC</div>
                        <div class="bf-empty-hint">添加名字，或留空让 AI 自动识别重要NPC后点「手动更新」</div>
                      </div>
                      <div v-else class="bf-dash-npcs">
                        <div v-for="name in npcList" :key="name" class="bf-dash-npc" @click="openNpc(name)">
                          <span class="bf-avatar">{{ name.trim().slice(0, 1) || '?' }}</span>
                          <div class="bf-dash-npc-main">
                            <div class="bf-dash-npc-name">{{ name }}</div>
                            <div class="bf-dash-npc-loc">{{ data.NPC?.[name]?.['位置'] || '未知位置' }}</div>
                          </div>
                          <button class="bf-icon-btn bf-npc-del" title="从追踪名单删除" @click.stop="removeNpc(name)"><PhX :size="13" weight="bold" /></button>
                        </div>
                      </div>
                    </div>

                    <div class="bf-dash-actions">
                      <button class="bf-btn bf-btn-primary" :disabled="updating" @click="manualUpdate">
                        <span v-if="updating" class="bf-spinner"></span>
                        <PhArrowsClockwise v-else :size="15" weight="bold" />{{ updating ? '更新中…' : '手动更新' }}
                      </button>
                      <button class="bf-btn" :disabled="updating" @click="reload"><PhArrowsClockwise :size="15" weight="bold" />刷新</button>
                      <button class="bf-btn" :disabled="updating" @click="reload"><PhArrowsClockwise :size="15" weight="bold" />刷新</button>
                      <button class="bf-btn bf-btn-danger" :disabled="updating" @click="clearAll">
                        <PhTrash :size="15" weight="bold" />{{ clearing ? '再点一次确认清空' : '清空' }}
                      </button>
                    </div>
                  </div>

                  <!-- 右栏：生活统计概览 -->
                  <div class="bf-dash-side">
                    <div class="bf-side-card">
                      <div class="bf-side-num">{{ stats.更新次数 }}</div>
                      <div class="bf-side-label"><PhArrowsClockwise :size="13" weight="duotone" /> 更新次数</div>
                    </div>
                    <div class="bf-side-card">
                      <div class="bf-side-num">{{ npcEntries.length }}</div>
                      <div class="bf-side-label"><PhUsersThree :size="13" weight="duotone" /> 追踪 NPC</div>
                    </div>
                    <div class="bf-side-card">
                      <div class="bf-side-num">{{ interactions.length }}</div>
                      <div class="bf-side-label"><PhChatCircle :size="13" weight="duotone" /> 后台互动</div>
                    </div>
                    <div class="bf-side-card">
                      <div class="bf-side-num bf-side-clock">{{ nowClock }}</div>
                      <div class="bf-side-label"><PhClock :size="13" weight="duotone" /> 当前时间</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- NPC Master-Detail -->
              <div v-else-if="tab === 'npc'" key="npc" class="bf-page bf-npc-layout">
                <div class="bf-npc-list">
                  <div v-if="npcEntries.length === 0" class="bf-empty">
                    <div class="bf-empty-text">还没有 NPC</div>
                    <div class="bf-empty-hint">在仪表盘「追踪 NPC 管理」添加，或留空让 AI 自动识别后点「手动更新」</div>
                  </div>
                  <div
                    v-for="[name, card] in npcEntries"
                    :key="name"
                    class="bf-npc-item"
                    :class="{ active: selectedNpc === name }"
                    @click="selectedNpc = name"
                  >
                    <span class="bf-avatar">{{ name.trim().slice(0, 1) || '?' }}</span>
                    <div class="bf-npc-item-main">
                      <div class="bf-npc-item-top">
                        <span class="bf-npc-name">{{ name }}</span>
                        <span class="bf-online-dot" title="追踪中"></span>
                      </div>
                      <div class="bf-npc-sub">
                        <span class="bf-npc-loc"><PhMapPin :size="11" weight="duotone" /><span class="bf-npc-loc-text">{{ card['位置'] || '未知位置' }}</span></span>
                        <span class="bf-npc-sep">·</span>
                        <span class="bf-npc-status">{{ npcStatusText(card) }}</span>
                      </div>
                      <div class="bf-npc-tags">
                        <span v-for="t in npcTags(card, (data.在场NPC ?? []).includes(name))" :key="t.label" class="bf-tag" :class="'bf-tag-' + t.color">{{ t.label }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="bf-npc-detail">
                  <template v-if="selectedNpcCard">
                    <div class="bf-detail-head">
                      <span class="bf-avatar bf-avatar-lg">{{ selectedNpc!.trim().slice(0, 1) || '?' }}</span>
                      <div class="bf-detail-head-text">
                        <div class="bf-detail-name">{{ selectedNpc }}</div>
                        <div class="bf-npc-tags">
                          <span v-for="t in npcTags(selectedNpcCard, (data.在场NPC ?? []).includes(selectedNpc))" :key="t.label" class="bf-tag" :class="'bf-tag-' + t.color">{{ t.label }}</span>
                        </div>
                      </div>
                      <div v-if="data.剧情时间 || selectedNpcCard['最后更新']" class="bf-detail-updated">
                        <template v-if="data.剧情时间">剧情时间: {{ data.剧情时间 }}</template>
                        <template v-else>更新于 {{ fmtTime(selectedNpcCard['最后更新']) }}</template>
                      </div>
                      <div class="bf-detail-actions">
                        <button v-if="!editingNpc" class="bf-btn bf-btn-mini" @click="startEditNpc"><PhPencilSimple :size="13" weight="bold" />编辑</button>
                        <template v-else>
                          <button class="bf-btn bf-btn-mini bf-btn-primary" @click="saveEditNpc"><PhCheck :size="13" weight="bold" />保存</button>
                          <button class="bf-btn bf-btn-mini" @click="cancelEditNpc"><PhX :size="13" weight="bold" />取消</button>
                        </template>
                      </div>
                    </div>

                    <!-- 核心状态区：当前在做 / 当前状态 / 位置 -->
                    <div class="bf-detail-spotlight">
                      <div v-if="selectedNpcCard['当前在做'] || editingNpc" class="bf-spot">
                        <div class="bf-spot-icon"><PhFootprints :size="15" weight="duotone" /></div>
                        <div class="bf-spot-main">
                          <span class="bf-spot-label">当前在做</span>
                          <textarea
                            v-if="editingNpc"
                            v-model="editDraft['当前在做']"
                            class="bf-textarea bf-textarea-short"
                            rows="2"
                          ></textarea>
                          <div v-else class="bf-spot-value">{{ cleanText(selectedNpcCard['当前在做']) }}</div>
                        </div>
                      </div>
                      <div v-if="selectedNpcCard['当前状态'] || editingNpc" class="bf-spot">
                        <div class="bf-spot-icon"><PhPulse :size="15" weight="duotone" /></div>
                        <div class="bf-spot-main">
                          <span class="bf-spot-label">当前状态</span>
                          <textarea
                            v-if="editingNpc"
                            v-model="editDraft['当前状态']"
                            class="bf-textarea bf-textarea-short"
                            rows="2"
                          ></textarea>
                          <div v-else class="bf-spot-value">{{ cleanText(selectedNpcCard['当前状态']) }}</div>
                        </div>
                      </div>
                      <div v-if="selectedNpcCard['位置'] || editingNpc" class="bf-spot bf-spot-loc">
                        <div class="bf-spot-icon"><PhMapPin :size="15" weight="duotone" /></div>
                        <div class="bf-spot-main">
                          <span class="bf-spot-label">位置</span>
                          <textarea
                            v-if="editingNpc"
                            v-model="editDraft['位置']"
                            class="bf-textarea bf-textarea-short"
                            rows="1"
                          ></textarea>
                          <div v-else class="bf-spot-value bf-spot-value-loc">{{ cleanText(selectedNpcCard['位置']) }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- 分组字段 -->
                    <div class="bf-detail-groups">
                      <div v-if="detailFields['生活']" class="bf-field-group">
                        <div class="bf-field-group-title"><PhSuitcaseSimple :size="13" weight="duotone" /> 生活动态</div>
                        <div class="bf-field-grid">
                          <div class="bf-field">
                            <span class="bf-field-label">可能偶遇</span>
                            <label v-if="editingNpc" class="bf-toggle">
                              <input v-model="editDraft['可能偶遇']" type="checkbox" />
                              <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                            </label>
                            <span v-else class="bf-field-value bf-field-value-bool">{{ selectedNpcCard['可能偶遇'] ? '是' : '否' }}</span>
                          </div>
                          <div v-for="field in detailFields['生活']" :key="field" v-show="selectedNpcCard[field] || editingNpc" class="bf-field">
                            <span class="bf-field-label">{{ field }}</span>
                            <textarea
                              v-if="editingNpc"
                              v-model="editDraft[field]"
                              class="bf-textarea bf-textarea-short"
                              rows="2"
                            ></textarea>
                            <span v-else class="bf-field-value">{{ cleanText(selectedNpcCard[field]) }}</span>
                          </div>
                        </div>
                      </div>
                      <div v-if="detailFields['内心']" class="bf-field-group">
                        <div class="bf-field-group-title"><PhBrain :size="13" weight="duotone" /> 内心世界</div>
                        <div class="bf-field-grid">
                          <div v-for="field in detailFields['内心']" :key="field" v-show="selectedNpcCard[field] || editingNpc" class="bf-field">
                            <span class="bf-field-label">{{ field }}</span>
                            <textarea
                              v-if="editingNpc"
                              v-model="editDraft[field]"
                              class="bf-textarea bf-textarea-short"
                              rows="2"
                            ></textarea>
                            <span v-else class="bf-field-value">{{ cleanText(selectedNpcCard[field]) }}</span>
                          </div>
                        </div>
                      </div>
                      <div v-if="detailFields['生理']" class="bf-field-group">
                        <div class="bf-field-group-title"><PhHeartStraight :size="13" weight="duotone" /> 生理状态</div>
                        <div class="bf-field-grid">
                          <div v-for="field in detailFields['生理']" :key="field" v-show="selectedNpcCard[field] || editingNpc" class="bf-field">
                            <span class="bf-field-label">{{ field }}</span>
                            <textarea
                              v-if="editingNpc"
                              v-model="editDraft[field]"
                              class="bf-textarea bf-textarea-short"
                              rows="2"
                            ></textarea>
                            <span v-else class="bf-field-value">{{ cleanText(selectedNpcCard[field]) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                  <div v-else class="bf-empty">
                    <div class="bf-empty-text">从左侧选择一个 NPC 查看详情</div>
                  </div>
                </div>
              </div>

              <!-- 互动 (聊天流) -->
              <div v-else-if="tab === 'interaction'" key="interaction" class="bf-page">
                <div class="bf-page-title"><PhChatsCircle :size="18" weight="duotone" /> 后台互动</div>
                <div v-if="interactions.length === 0" class="bf-empty">
                  <div class="bf-empty-text">还没有后台互动记录</div>
                  <div class="bf-empty-hint">在「设置」开启「生成 NPC 间后台互动」后再更新</div>
                </div>
                <div v-else class="bf-flow">
                  <div v-for="(item, index) in interactions" :key="index" class="bf-flow-item">
                    <div class="bf-flow-time">{{ item.时间 }}</div>
                    <div class="bf-flow-body">
                      <div class="bf-flow-head">
                        <div class="bf-flow-participants">
                          <span
                            v-for="(n, i) in item.NPC.slice(0, 3)"
                            :key="n + i"
                            class="bf-flow-avatar"
                            :style="{ zIndex: item.NPC.length - i }"
                          >{{ n.slice(0, 1) }}</span>
                          <span class="bf-flow-name">{{ item.NPC.join(' × ') }}</span>
                        </div>
                      </div>
                      <div class="bf-flow-content">{{ cleanText(item.事件) }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 时间轴 -->
              <div v-else-if="tab === 'timeline'" key="timeline" class="bf-page">
                <div class="bf-page-title"><PhClockCounterClockwise :size="18" weight="duotone" /> 时间轴</div>
                <div v-if="timeline.length === 0" class="bf-empty">
                  <div class="bf-empty-text">暂无时间轴记录</div>
                  <div class="bf-empty-hint">更新并开启后台互动后会自动生成</div>
                </div>
                <div v-else class="bf-timeline">
                  <div v-for="(entry, index) in timeline" :key="index" class="bf-tl-item">
                    <div class="bf-tl-icon"><component :is="entry.icon" :size="13" weight="fill" /></div>
                    <div class="bf-tl-content">
                      <div class="bf-tl-head">
                        <span class="bf-tl-title">{{ entry.title }}</span>
                        <span class="bf-tl-time">{{ entry.timeText || fmtTime(entry.time) }}</span>
                        <span class="bf-tag" :class="'bf-tag-' + entry.color">{{ entry.tag }}</span>
                      </div>
                      <div v-if="entry.desc" class="bf-tl-desc">{{ cleanText(entry.desc) }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 日志 -->
              <div v-else-if="tab === 'logs'" key="logs" class="bf-page">
                <div class="bf-page-title"><PhScroll :size="18" weight="duotone" /> 日志</div>

                <div class="bf-logs-layout">
                  <!-- 左栏：本轮更新记录 -->
                  <div class="bf-logs-main">
                    <template v-if="debugLog">
                      <div class="bf-panel-card">
                        <div class="bf-debug-head bf-debug-head-section">
                          <span class="bf-debug-head-label"><PhClipboardText :size="15" weight="duotone" /> 彼方更新记录</span>
                        </div>
                        <div class="bf-debug-meta">
                          <div class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">更新楼层</span>
                            <span>#{{ debugLog.replyIds.length > 0 ? debugLog.replyIds.join('、#') : '—' }}</span>
                          </div>
                          <div class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">模型</span>
                            <span>{{ debugLog.model || '—' }}</span>
                          </div>
                          <div class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">更新时间</span>
                            <span>{{ fmtTime(debugLog.time) }}</span>
                          </div>
                          <div class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">更新NPC</span>
                            <span>{{ debugLog.updatedNpcs.join('、') || '—' }}</span>
                          </div>
                          <div v-if="debugLog.removedNpcs.length > 0" class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">移除NPC</span>
                            <span>{{ debugLog.removedNpcs.join('、') }}</span>
                          </div>
                          <div v-if="debugLog.replyPreview" class="bf-debug-meta-row">
                            <span class="bf-debug-meta-label">回复开头</span>
                            <span class="bf-debug-preview">{{ debugLog.replyPreview }}</span>
                          </div>
                        </div>
                      </div>

                      <div class="bf-panel-card">
                        <div class="bf-debug-head">
                          <span class="bf-debug-head-label"><PhPaperPlaneRight :size="14" weight="duotone" /> 发送给 AI 的内容</span>
                          <button class="bf-btn bf-btn-mini" @click="copyText(debugLog.request)"><PhCopy :size="12" weight="bold" />复制</button>
                        </div>
                        <details>
                          <summary class="bf-debug-summary">展开查看（{{ debugLog.request.length }} 字）</summary>
                          <pre class="bf-debug-pre">{{ debugLog.request }}</pre>
                        </details>
                      </div>

                      <div class="bf-panel-card">
                        <div class="bf-debug-head">
                          <span class="bf-debug-head-label"><PhChatText :size="14" weight="duotone" /> AI 输出内容</span>
                          <button class="bf-btn bf-btn-mini" @click="copyText(debugLog.response)"><PhCopy :size="12" weight="bold" />复制</button>
                        </div>
                        <details>
                          <summary class="bf-debug-summary">展开查看（{{ debugLog.response.length }} 字）</summary>
                          <pre class="bf-debug-pre">{{ debugLog.response }}</pre>
                        </details>
                      </div>

                      <div v-if="debugLog.error" class="bf-panel-card bf-debug-error">
                        <div class="bf-debug-head">
                          <span class="bf-debug-head-label"><PhWarning :size="14" weight="duotone" /> 报错内容</span>
                          <button class="bf-btn bf-btn-mini" @click="copyText(debugLog.error)"><PhCopy :size="12" weight="bold" />复制</button>
                        </div>
                        <pre class="bf-debug-pre">{{ debugLog.error }}</pre>
                      </div>

                      <div class="bf-dash-actions">
                        <button class="bf-btn bf-btn-primary" @click="copyErrorReport"><PhClipboardText :size="14" weight="bold" />复制报错内容发给助手</button>
                        <button class="bf-btn" @click="debugStore.clear()">清空更新记录</button>
                      </div>
                    </template>
                    <div v-else class="bf-panel-card">
                      <div class="bf-empty">
                        <div class="bf-empty-text">还没有更新日志</div>
                        <div class="bf-empty-hint">手动更新或自动更新后会记录本轮发送与输出内容</div>
                      </div>
                    </div>
                  </div>

                  <!-- 右栏：注入内容 + 控制台 -->
                  <div class="bf-logs-side">
                    <div class="bf-panel-card">
                      <div class="bf-debug-head">
                        <span class="bf-debug-head-label"><PhBrain :size="14" weight="duotone" /> 彼方注入给主AI的内容</span>
                        <template v-if="mainPrompt">
                          <button class="bf-btn bf-btn-mini" @click="copyText(mainPrompt)"><PhCopy :size="12" weight="bold" />复制</button>
                        </template>
                      </div>
                      <div v-if="mainPrompt" class="bf-hint">记录时间: {{ fmtTime(mainPromptTime) }} · 已记录 {{ mainPromptCount }} 次（仅彼方自己注入的幕后状态，不含主AI其他内容）</div>
                      <template v-if="mainPrompt">
                        <details>
                          <summary class="bf-debug-summary">展开查看（{{ mainPrompt.length }} 字）</summary>
                          <pre class="bf-debug-pre">{{ mainPrompt }}</pre>
                        </details>
                      </template>
                      <div v-else class="bf-empty">
                        <div class="bf-empty-text">还没有彼方注入给主AI的内容</div>
                        <div class="bf-empty-hint">开启「注入幕后状态到主AI」并在更新后，这里显示彼方注入的幕后状态内容</div>
                      </div>
                    </div>

                    <div class="bf-panel-card">
                      <div class="bf-debug-head">
                        <span class="bf-debug-head-label"><PhTerminalWindow :size="14" weight="duotone" /> 控制台输出（彼方脚本自身）</span>
                        <button class="bf-btn bf-btn-mini" @click="consoleStore.clear()">清空控制台</button>
                      </div>
                      <div v-if="consoleLines.length === 0" class="bf-empty">
                        <div class="bf-empty-text">暂无控制台输出</div>
                      </div>
                      <div v-else class="bf-console">
                        <div v-for="(line, index) in consoleLinesReversed" :key="index" class="bf-console-line" :class="'bf-console-' + line.type">
                          <span class="bf-console-time">{{ fmtTime(line.time) }}</span>
                          <span class="bf-console-text">{{ line.text }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 设置 -->
              <div v-else key="settings" class="bf-page">
                <div class="bf-page-title"><PhGearSix :size="18" weight="duotone" /> 设置
                  <button class="bf-btn bf-btn-mini" @click="openPromptEditor">编辑提示词</button>
                </div>

                <div class="bf-settings-layout">
                  <!-- 左栏：接口配置 -->
                  <div class="bf-settings-main">
                    <div class="bf-group">
                      <div class="bf-group-title"><PhPlug :size="14" weight="duotone" /> 接口配置（OpenAI 兼容）</div>
                      <label class="bf-row">
                        <span class="bf-label">接口地址</span>
                        <input v-model="settings.接口.地址" class="bf-input" placeholder="https://api.example.com/v1" />
                      </label>
                      <div class="bf-row">
                        <span class="bf-label">API密钥</span>
                        <input
                          v-model="settings.接口.密钥"
                          class="bf-input"
                          :type="showKey ? 'text' : 'password'"
                          placeholder="sk-..."
                        />
                        <button class="bf-btn bf-btn-mini" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
                      </div>
                      <div class="bf-row">
                        <span class="bf-label">模型</span>
                        <select v-model="settings.接口.模型" class="bf-input">
                          <option v-if="!modelList.includes(settings.接口.模型)" value="">（请选择模型）</option>
                          <option v-for="model in modelList" :key="model" :value="model">{{ model }}</option>
                        </select>
                      </div>
                      <div class="bf-row bf-actions">
                        <button class="bf-btn" :disabled="fetchingModels" @click="loadModels">
                          {{ fetchingModels ? '获取中…' : '获取模型列表' }}
                        </button>
                        <button class="bf-btn" :disabled="testing" @click="testConnection">
                          {{ testing ? '测试中…' : '测试连接' }}
                        </button>
                      </div>
                      <div class="bf-row-pair">
                        <div class="bf-pair">
                          <span class="bf-label">温度</span>
                          <input v-model.number="settings.接口.温度" class="bf-input bf-input-num" type="number" min="0" max="2" step="0.1" />
                        </div>
                        <div class="bf-pair">
                          <span class="bf-label">最大输出Token</span>
                          <input v-model.number="settings.接口.最大token" class="bf-input bf-input-num" type="number" min="1" max="131072" step="1024" />
                        </div>
                      </div>
                      <label class="bf-toggle">
                        <input v-model="settings.接口.关闭思维链" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">关闭模型思维链（推理/思考）</span>
                      </label>
                      <label class="bf-toggle">
                        <input v-model="settings.接口.服务端转发" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">走酒馆服务器转发请求</span>
                      </label>
                      <label class="bf-toggle">
                        <input v-model="settings.接口.流式" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">流式输出（逐 token 接收）</span>
                      </label>
                      <div class="bf-hint">跨域(CORS)不支持的接口开启(如 tokenrhythm.studio)；「关闭思维链」仅 Responses API 原生模型可用(如 deepseek-v4-flash-0731)，其余遇 Bad Request 请关；「最大输出Token」参考模型页上限(deepseek-v4-flash 384K)</div>
                      <div class="bf-hint">逐 token 接收(可实时看进度, 部分模型更稳)；关闭则一次性返回；接口不支持流式报错就关</div>
                      <div class="bf-hint">支持任意 /v1/models 与 /v1/chat/completions 服务；最大输出Token 是状态卡最大长度，NPC 多时调大</div>
                      <div class="bf-row">
                        <span class="bf-label">配置预设</span>
                        <input v-model="presetName" class="bf-input" placeholder="预设名，如 DeepSeek" @keyup.enter="saveApiPreset" />
                        <button class="bf-btn bf-btn-mini" @click="saveApiPreset">保存当前</button>
                      </div>
                      <div v-if="presetNames.length > 0" class="bf-row">
                        <select v-model="selectedPreset" class="bf-input">
                          <option value="">（选择预设加载）</option>
                          <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
                        </select>
                        <button class="bf-btn bf-btn-mini" @click="loadApiPreset">加载</button>
                        <button class="bf-btn bf-btn-mini" @click="deleteApiPreset">删除</button>
                      </div>
                      <div class="bf-hint">保存当前接口配置为预设，可一键切换</div>
                    </div>
                  </div>

                  <!-- 右栏：更新设置 + 标签过滤 -->
                  <div class="bf-settings-side">
                    <div class="bf-group">
                      <div class="bf-group-title"><PhGearSix :size="14" weight="duotone" /> 更新设置</div>
                      <label class="bf-toggle">
                        <input v-model="settings.启用幕后" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">启用幕后系统</span>
                      </label>
                      <div class="bf-hint">关闭后不再调用 AI 更新 NPC 状态/注入(已有状态数据保留, 重开恢复)</div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.自动更新" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">AI 回复后自动更新</span>
                      </label>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.追踪当前角色" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">追踪当前角色卡角色</span>
                      </label>
                      <div class="bf-hint">仅群聊时角色卡名才是角色；角色写在世界书里则保持关闭</div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.后台互动" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">生成 NPC 间后台互动</span>
                      </label>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.注入到AI" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">注入幕后状态到主AI</span>
                      </label>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.注入世界书条目" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">写入世界书条目（蓝灯常开）</span>
                      </label>
                      <div class="bf-hint">写入角色卡主世界书常驻条目(蓝灯常开)；切换聊天自动重写</div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.生理监测" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">女性NPC生理监测</span>
                      </label>
                      <div class="bf-hint">为女性NPC维护生理字段(周期/受孕/结算)，并随状态注入主AI</div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.gemini37f破限" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">gemini3.7f破限</span>
                      </label>
                      <div class="bf-hint">注入 Dramatron 破限(陨落的天才/牢大)，适合 Gemini 3.7 Flash；3.6F 起不支持预填充，可关「预填充」配合</div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.注入世界书" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">给彼方接口注入世界书内容</span>
                      </label>
                      <div class="bf-hint">按主AI方式激活世界书条目，让更新AI理解世界设定；不读全局世界书</div>
                      <div class="bf-row">
                        <span class="bf-label">世界书内容上限</span>
                        <input v-model.number="settings.更新.注入世界书上限" class="bf-input bf-input-num" type="number" min="500" max="200000" step="500" />
                      </div>
                      <div class="bf-row">
                        <span class="bf-label">世界书条数上限</span>
                        <input v-model.number="settings.更新.注入世界书条数" class="bf-input bf-input-num" type="number" min="1" max="200" step="1" />
                      </div>
                      <label class="bf-toggle">
                        <input v-model="settings.更新.预填充" type="checkbox" />
                        <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
                        <span class="bf-toggle-text">预填充(prefill)</span>
                      </label>
                      <div class="bf-hint">追加 assistant 消息引导直接从 JSON 输出，减少格式失败；DeepSeek/GLM/Qwen/Claude 大多支持，报错就关</div>
                      <div class="bf-row-pair">
                        <div class="bf-pair">
                          <span class="bf-label">更新频率</span>
                          <input v-model.number="settings.更新.更新频率" class="bf-input bf-input-num" type="number" min="1" />
                        </div>
                        <div class="bf-pair">
                          <span class="bf-label">读取回复数</span>
                          <input v-model.number="settings.更新.读取最近回复数" class="bf-input bf-input-num" type="number" min="1" max="20" />
                        </div>
                      </div>
                      <div class="bf-hint">每 N 条回复更新一次 · 更新时读取最近 N 条AI回复</div>
                    </div>

                    <div class="bf-group">
                      <div class="bf-group-title"><PhTag :size="14" weight="duotone" /> 标签过滤</div>
                      <div class="bf-row">
                        <span class="bf-label">标签模式</span>
                        <div class="bf-seg">
                          <button
                            class="bf-btn"
                            :class="{ active: settings.标签.模式 === '排除' }"
                            @click="settings.标签.模式 = '排除'"
                          >
                            排除
                          </button>
                          <button
                            class="bf-btn"
                            :class="{ active: settings.标签.模式 === '只读' }"
                            @click="settings.标签.模式 = '只读'"
                          >
                            只读
                          </button>
                        </div>
                      </div>
                      <textarea v-model="tagDraft" class="bf-textarea bf-textarea-short" placeholder="aftertalk&#10;thinking&#10;branches"></textarea>
                      <div class="bf-hint">
                        <template v-if="settings.标签.模式 === '排除'">排除这些标签内的内容，直接写标签名(如 thinking，不用尖括号)；只出现 &lt;/标签&gt; 的孤立闭合会从楼层开头删到该标签</template>
                        <template v-else>只读取这些标签内的内容；没有这些标签的楼层保留原文</template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </main>
        </div>

        <!-- Footer -->
        <footer class="bf-footer">
          <span>模型: {{ settings.接口.模型 || '—' }}</span>
          <span v-if="stats.最后更新">更新时间: {{ fmtTime(stats.最后更新) }}</span>
          <span class="bf-footer-spacer"></span>
          <span>v4.1 · 彼方</span>
        </footer>
      </div>
    </Transition>

    <!-- 添加NPC弹窗 -->
    <Transition name="bf-fade">
      <div v-if="addDialogOpen" class="bf-modal-backdrop" @click="addDialogOpen = false"></div>
    </Transition>
    <Transition name="bf-pop">
      <div v-if="addDialogOpen" class="bf-modal" @click.stop>
        <div class="bf-modal-title"><PhUserPlus :size="15" weight="duotone" /> 添加 NPC</div>
        <label class="bf-row">
          <span class="bf-label">名字</span>
          <input v-model="addDraft['名字']" class="bf-input" placeholder="NPC名字" />
        </label>
        <label class="bf-row">
          <span class="bf-label">当前在做</span>
          <textarea v-model="addDraft['当前在做']" class="bf-textarea bf-textarea-short" rows="2"></textarea>
        </label>
        <label class="bf-row">
          <span class="bf-label">当前状态</span>
          <textarea v-model="addDraft['当前状态']" class="bf-textarea bf-textarea-short" rows="2"></textarea>
        </label>
        <label class="bf-row">
          <span class="bf-label">位置</span>
          <input v-model="addDraft['位置']" class="bf-input" placeholder="当前位置" />
        </label>
        <label class="bf-row">
          <span class="bf-label">接下来想做</span>
          <textarea v-model="addDraft['接下来想做']" class="bf-textarea bf-textarea-short" rows="2"></textarea>
        </label>
        <label class="bf-toggle">
          <input v-model="addDraft['可能偶遇']" type="checkbox" />
          <span class="bf-toggle-track"><span class="bf-toggle-thumb"></span></span>
          <span class="bf-toggle-text">可能偶遇</span>
        </label>
        <div class="bf-hint">初始状态可后续在 NPC 详情中补充或编辑（不含生理监测字段）</div>
        <div class="bf-row bf-actions">
          <button class="bf-btn bf-btn-primary" @click="confirmAddNpc"><PhCheck :size="14" weight="bold" />添加</button>
          <button class="bf-btn" @click="addDialogOpen = false">取消</button>
        </div>
      </div>
    </Transition>

    <!-- 编辑提示词弹层: 幕后更新自定义提示词, 非空时替换内置 -->
    <Transition name="bf-fade">
      <div v-if="showPromptEditor" class="bf-prompt-overlay" @click.self="showPromptEditor = false">
        <div class="bf-prompt-modal">
          <div class="bf-prompt-head">
            <span>编辑提示词</span>
            <button class="bf-btn bf-btn-mini" @click="showPromptEditor = false">关闭（不保存）</button>
          </div>
          <div class="bf-hint">自定义幕后更新提示词（留空则使用内置提示词）</div>
          <div class="bf-hint bf-prompt-ph">占位符：&#123;&#123;正文&#125;&#125; &#123;&#123;上下文&#125;&#125; &#123;&#123;追踪名单&#125;&#125; &#123;&#123;现有状态卡&#125;&#125; &#123;&#123;互动记录&#125;&#125; &#123;&#123;当前剧情时间&#125;&#125; &#123;&#123;主角名&#125;&#125; &#123;&#123;当前时间&#125;&#125;</div>
          <div class="bf-prompt-list">
            <div v-for="(seg, i) in promptDraftUpdate" :key="i" class="bf-prompt-seg">
              <div class="bf-prompt-seg-head">
                <select v-model="seg.role" class="bf-input bf-input-role">
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
                <span class="bf-hint">第 {{ i + 1 }} 段</span>
                <div class="bf-prompt-move">
                  <button class="bf-btn bf-btn-mini" :disabled="i === 0" title="上移" @click="movePromptSegment(i, -1)">↑</button>
                  <button class="bf-btn bf-btn-mini" :disabled="i === promptDraftUpdate.length - 1" title="下移" @click="movePromptSegment(i, 1)">↓</button>
                </div>
                <button class="bf-btn bf-btn-mini" @click="removePromptSegment(i)">删除</button>
              </div>
              <textarea v-model="seg.content" class="bf-input bf-textarea" rows="4" spellcheck="false" placeholder="提示词内容（可含占位符）…"></textarea>
            </div>
            <div v-if="!promptDraftUpdate.length" class="bf-empty-hint">未配置自定义提示词，当前使用内置提示词</div>
          </div>
          <div class="bf-prompt-actions">
            <button class="bf-btn bf-btn-mini" @click="addPromptSegment">＋ 添加提示词段</button>
            <button class="bf-btn bf-btn-mini" @click="clearPromptSegments">清空自定义</button>
            <span class="bf-prompt-spacer"></span>
            <button class="bf-btn bf-btn-primary" @click="savePromptDraft">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { storeToRefs } from 'pinia';
import {
  PhArrowsClockwise,
  PhBrain,
  PhChatCircle,
  PhChatText,
  PhChatsCircle,
  PhCheck,
  PhClipboardText,
  PhClock,
  PhClockCounterClockwise,
  PhCopy,
  PhFootprints,
  PhGauge,
  PhGearSix,
  PhHeartStraight,
  PhMapPin,
  PhMoon,
  PhPaperPlaneRight,
  PhPencilSimple,
  PhPlug,
  PhPulse,
  PhScroll,
  PhStarFour,
  PhSuitcaseSimple,
  PhSun,
  PhTag,
  PhTerminalWindow,
  PhTrash,
  PhUserPlus,
  PhUsers,
  PhUsersThree,
  PhWarning,
  PhX,
} from '@phosphor-icons/vue';
import { chatCompletion, fetchModelList } from './api';
import { useSettingsStore } from './settings';
import { CARD_FIELDS, freshClearData, loadData, useConsoleStore, useDebugStore, useMainPromptStore, useStateStore, useUpdatingStore } from './state';
import type { NpcStateCard } from './state';
import { updateNpcStates } from './update';
import { syncNpcStatesWorldbook } from './worldbook-inject';
import { getUpdatePromptSeed } from './prompts';

const ORB_KEY = '彼方_悬浮球';
const THEME_KEY = '彼方_主题';
const CLOSED_SIZE = 56;

const theme = ref<'dark' | 'light'>('dark');
try {
  const saved = getVariables({ type: 'global' })?.[THEME_KEY];
  if (saved === 'light' || saved === 'dark') theme.value = saved;
} catch {
  // 读取失败保持默认深色
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}

watch(theme, value => {
  try {
    insertOrAssignVariables({ [THEME_KEY]: value }, { type: 'global' });
  } catch {
    // 忽略保存失败
  }
  if (updatingPopEl && updatingPopEl.isConnected) updatingPopEl.dataset.theme = value;
});

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

const stateStore = useStateStore();
const { data } = storeToRefs(stateStore);

const debugStore = useDebugStore();
const { log: debugLog } = storeToRefs(debugStore);

const updatingStore = useUpdatingStore();
const { active: updatingActive, message: updatingMessage } = storeToRefs(updatingStore);

const mainPromptStore = useMainPromptStore();
const { prompt: mainPrompt, time: mainPromptTime, count: mainPromptCount } = storeToRefs(mainPromptStore);

const consoleStore = useConsoleStore();
const { lines: consoleLines } = storeToRefs(consoleStore);
const consoleLinesReversed = computed(() => [...consoleLines.value].reverse());

const rootEl = ref<HTMLElement | null>(null);
const frameWin = computed<Window | null>(() => rootEl.value?.ownerDocument?.defaultView ?? null);
const frame = computed<HTMLIFrameElement | null>(() => frameWin.value?.frameElement as HTMLIFrameElement | null);
const parentWin = computed<Window | null>(() => frameWin.value?.parent ?? null);

const panelOpen = ref(false);
const tab = ref<'dashboard' | 'npc' | 'interaction' | 'timeline' | 'logs' | 'settings'>('dashboard');
const showKey = ref(false);
const fetchingModels = ref(false);
const testing = ref(false);
const updating = ref(false);
const isDragging = ref(false);

// API 配置预设: 保存/加载/删除多套接口配置
const presetName = ref('');
const selectedPreset = ref('');
const presetNames = computed(() => Object.keys(settings.value.接口预设 ?? {}));
function saveApiPreset() {
  const name = String(presetName.value).trim();
  if (!name) {
    toastr.warning('请填写预设名', '彼方');
    return;
  }
  if (!settings.value.接口预设) settings.value.接口预设 = {};
  settings.value.接口预设[name] = klona(settings.value.接口);
  presetName.value = '';
  selectedPreset.value = name;
  toastr.success(`已保存接口配置预设「${name}」`, '彼方');
}
function loadApiPreset() {
  const name = String(selectedPreset.value).trim();
  if (!name || !settings.value.接口预设?.[name]) {
    toastr.warning('请选择要加载的预设', '彼方');
    return;
  }
  settings.value.接口 = klona(settings.value.接口预设[name]);
  toastr.success(`已加载接口配置预设「${name}」`, '彼方');
}
function deleteApiPreset() {
  const name = String(selectedPreset.value).trim();
  if (!name || !settings.value.接口预设?.[name]) {
    toastr.warning('请选择要删除的预设', '彼方');
    return;
  }
  delete settings.value.接口预设[name];
  selectedPreset.value = '';
  toastr.success(`已删除接口配置预设「${name}」`, '彼方');
}

const cardFields = CARD_FIELDS;
const tabs = [
  { key: 'dashboard', icon: PhGauge, label: '仪表盘' },
  { key: 'npc', icon: PhUsers, label: 'NPC' },
  { key: 'interaction', icon: PhChatsCircle, label: '互动' },
  { key: 'timeline', icon: PhClockCounterClockwise, label: '时间轴' },
  { key: 'logs', icon: PhScroll, label: '日志' },
  { key: 'settings', icon: PhGearSix, label: '设置' },
] as const;

const npcEntries = computed(() => {
  const entries = Object.entries(data.value.NPC ?? {});
  const inScene = new Set(data.value.在场NPC ?? []);
  // 在场的 NPC 排在上面, 其余保持原顺序
  return entries.sort((a, b) => (inScene.has(b[0]) ? 1 : 0) - (inScene.has(a[0]) ? 1 : 0));
});
const npcList = computed(() => data.value.名单 ?? []);
const newNpcName = ref('');

const addDialogOpen = ref(false);
const addDraft = ref<Record<string, any>>({});

function openAddDialog() {
  addDraft.value = {
    '名字': newNpcName.value.trim(),
    '当前在做': '',
    '当前状态': '',
    '位置': '',
    '接下来想做': '',
    '可能偶遇': false,
  };
  addDialogOpen.value = true;
}

function confirmAddNpc() {
  const name = String(addDraft.value['名字'] || '').trim();
  if (!name) {
    toastr.warning('请填写NPC名字', '彼方');
    return;
  }
  if (!data.value.名单.includes(name)) data.value.名单.push(name);
  data.value.NPC = data.value.NPC || {};
  const card: Record<string, any> = { ...(data.value.NPC[name] || {}) };
  for (const field of cardFields) {
    const v = addDraft.value[field];
    if (typeof v === 'string' && v.trim()) card[field] = v.trim();
  }
  if ('可能偶遇' in addDraft.value) card['可能偶遇'] = Boolean(addDraft.value['可能偶遇']);
  card['最后更新'] = Date.now();
  data.value.NPC[name] = card;
  selectedNpc.value = name;
  newNpcName.value = '';
  addDialogOpen.value = false;
  stateStore.save();
  syncWorldbookAfterEdit();
  toastr.success(`已添加 NPC: ${name}`, '彼方');
}

function removeNpc(name: string) {
  data.value.名单 = data.value.名单.filter(n => n !== name);
  if (data.value.NPC) delete data.value.NPC[name];
  if (selectedNpc.value === name) selectedNpc.value = null;
  stateStore.save();
  syncWorldbookAfterEdit();
}
const interactions = computed(() => data.value.后台互动 ?? []);
const stats = computed(() => data.value.统计 ?? { 更新次数: 0, 最后更新: 0 });
const modelList = computed(() => settings.value.接口.模型列表);
const ready = computed(() => Boolean(settings.value.接口.地址 && settings.value.接口.模型));
const statusTitle = computed(() =>
  ready.value ? `接口: ${settings.value.接口.地址} · 模型: ${settings.value.接口.模型}` : '请在「设置」中配置接口地址与模型',
);

const now = ref(Date.now());
let clockTimer: number | null = null;
const nowText = computed(() => new Date(now.value).toLocaleString());
const nowClock = computed(() => new Date(now.value).toLocaleTimeString());

const selectedNpc = ref<string | null>(null);
const selectedNpcCard = computed<NpcStateCard | null>(() => {
  if (selectedNpc.value && data.value.NPC?.[selectedNpc.value]) return data.value.NPC[selectedNpc.value];
  return null;
});

watch(
  () => data.value.NPC,
  npcMap => {
    if (!selectedNpc.value || !npcMap?.[selectedNpc.value]) {
      const first = Object.keys(npcMap ?? {})[0];
      selectedNpc.value = first ?? null;
    }
  },
  { immediate: true, deep: true },
);

function openNpc(name: string) {
  selectedNpc.value = name;
  tab.value = 'npc';
}

const editingNpc = ref(false);
const editDraft = ref<Record<string, any>>({});

function startEditNpc() {
  if (!selectedNpcCard.value) return;
  editDraft.value = { ...selectedNpcCard.value };
  editingNpc.value = true;
}

function saveEditNpc() {
  if (!selectedNpc.value || !data.value.NPC?.[selectedNpc.value]) return;
  const card = data.value.NPC[selectedNpc.value];
  for (const field of cardFields) {
    const v = editDraft.value[field];
    if (typeof v === 'string') {
      if (v.trim()) card[field] = v.trim();
      else delete card[field];
    }
  }
  // 额外可编辑字段(不在 CARD_FIELDS 中, 由彼方/AI 维护, 但允许玩家手动调整):
  // 受孕日期——修改它即可调整孕周时间线, 彼方会按 (当前剧情日期-受孕日期) 重算孕周
  for (const field of ['受孕日期']) {
    const v = editDraft.value[field];
    if (typeof v === 'string') {
      if (v.trim()) card[field] = v.trim();
      else delete card[field];
    }
  }
  if ('可能偶遇' in editDraft.value) {
    const raw = editDraft.value['可能偶遇'];
    card['可能偶遇'] = typeof raw === 'boolean' ? raw : raw === 'true' || raw === '是' || raw === '会';
  }
  card['最后更新'] = Date.now();
  editingNpc.value = false;
  stateStore.save();
  syncWorldbookAfterEdit();
  toastr.success(`已保存 ${selectedNpc.value} 的状态`, '彼方');
}

/** 界面里编辑 NPC 数据后, 同步刷新世界书里的幕后状态条目 */
async function syncWorldbookAfterEdit() {
  if (!settings.value.更新.注入世界书条目) return;
  try {
    await syncNpcStatesWorldbook(data.value, true);
  } catch (error) {
    console.error('[彼方] 同步世界书条目失败:', error);
  }
}

// 开世界书注入时关闭"注入到主AI"(避免重复); 关闭时删除世界书条目
watch(
  () => settings.value.更新.注入世界书条目,
  enabled => {
    if (enabled) {
      settings.value.更新.注入到AI = false;
      syncWorldbookAfterEdit();
    } else {
      syncNpcStatesWorldbook(data.value, false).catch(error => {
        console.error('[彼方] 删除世界书条目失败:', error);
      });
    }
  },
);

function cancelEditNpc() {
  editingNpc.value = false;
}

function npcStatusText(card: NpcStateCard): string {
  return card['当前状态'] || card['当前在做'] || '状态未知';
}

/** NPC 详情字段分组：生活动态 / 内心世界 / 生理状态（'可能偶遇'与核心状态字段单独处理） */
const DETAIL_GROUPS: Record<string, string[]> = {
  生活: ['生活状态', '接下来想做', '当前目标', '最近变化', '未完成事项'],
  内心: ['心里惦记', '秘密想法', '隐藏目标'],
  生理: ['生理周期', '生理周期日期', '受孕日期', '是否怀孕', '怀孕知晓', '周期影响', '当前防护', '近期性行为'],
};

const detailFields = computed(() =>
  Object.fromEntries(
    Object.entries(DETAIL_GROUPS)
      .map(([group, fields]) => [group, fields.filter(f => (selectedNpcCard.value as NpcStateCard)?.[f] || editingNpc.value)])
      .filter(([, fields]) => (fields as string[]).length > 0),
  ),
);

/** 折叠连续空行并去掉首尾空白，避免字段值里的多行换行造成大片空行 */
function cleanText(text: string): string {
  return (text || '').replace(/\n{3,}/g, '\n\n').trim();
}

type NpcTag = { label: string; color: string };

/** 生理周期阶段 → 标签颜色，避免所有生理标签同一个颜色太单调 */
const PHYSIOLOGY_COLORS: Record<string, string> = {
  月经期: 'red',
  卵泡期: 'blue',
  排卵期: 'orange',
  黄体期: 'yellow',
  经前期: 'pink',
  孕期: 'purple',
  哺乳期: 'teal',
};

function npcTags(card: NpcStateCard, isInScene = false): NpcTag[] {
  const tags: NpcTag[] = [];
  // 在场 NPC 直接标记"在场", 不再显示"偶遇可能"
  if (isInScene) {
    tags.push({ label: '在场', color: 'green' });
  } else if (card['可能偶遇']) {
    tags.push({ label: '偶遇可能', color: 'yellow' });
  }
  const status = `${card['当前状态'] || ''} ${card['当前在做'] || ''}`;
  if (/睡|休息|就寝|午休|打盹/.test(status)) tags.push({ label: '睡眠', color: 'purple' });
  if (/工作|巡逻|食堂|任务|执勤|值班|搬运|修理|劳作|耕种|狩猎|采集|打猎|锻炼|训练|站岗/.test(status)) tags.push({ label: '工作', color: 'blue' });
  if (/吃|饭|餐|喝|用餐|就餐/.test(status)) tags.push({ label: '进食', color: 'teal' });
  if (/学习|上课|读书|复习|备考/.test(status)) tags.push({ label: '学习', color: 'teal' });
  if (/前往|走向|回家|返回|移动|离开|赶往|散步|赶路/.test(status)) tags.push({ label: '移动', color: 'orange' });
  if (/受伤|危险|流血|危机|追捕|袭击|遇袭|战斗|打斗|昏迷/.test(status)) tags.push({ label: '危险', color: 'red' });
  const ph = card['生理周期'] || '';
  if (ph) {
    const stage = ph.match(/(月经期|卵泡期|排卵期|黄体期|经前期|孕期|哺乳期)/);
    const label = stage ? stage[1] : '生理';
    tags.push({ label, color: PHYSIOLOGY_COLORS[label] ?? 'purple' });
    // 防全知: 孕期但 NPC 本人尚未确认时, 标注其认知程度(玩家上帝视角能看到幕后, 但要明白她本人不知道)
    if (stage && stage[1] === '孕期') {
      const known = String(card['怀孕知晓'] || '').trim();
      if (known === '疑似') tags.push({ label: '本人疑似', color: 'yellow' });
      else if (!known || known === '未知') tags.push({ label: '本人未察觉', color: 'gray' });
    }
  }
  return tags;
}

const timeline = computed(() => {
  const entries: { time: number; timeText: string; title: string; desc: string; tag: string; color: string; icon: Component }[] = [];
  for (const entry of data.value.时间轴 ?? []) {
    entries.push({
      time: entry.时间,
      timeText: entry.剧情时间 || '',
      title: entry.标题,
      desc: entry.描述,
      tag: entry.类型 === '互动' ? '互动' : '状态',
      color: entry.类型 === '互动' ? 'blue' : 'green',
      icon: entry.类型 === '互动' ? PhChatsCircle : PhStarFour,
    });
  }
  // 按剧情时间倒序(最新/在场角色在最上面), 剧情时间无法解析的条目回退用现实时间
  return entries
    .sort((a, b) => {
      const ats = storyTimeTs(a.timeText) ?? a.time;
      const bts = storyTimeTs(b.timeText) ?? b.time;
      return bts - ats;
    })
    .slice(0, 40);
});

/** 解析 "YYYY-MM-DD HH:mm" 剧情时间为时间戳, 失败返回 null */
function storyTimeTs(text: string): number | null {
  const t = text.trim().replace(/[./]/g, '-');
  const match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const ts = new Date(+year, +month - 1, +day, +hour, +minute).getTime();
  return Number.isNaN(ts) ? null : ts;
}

// 标签过滤草稿: 输入时原样保留(不中途拆分), watch 才把换行/分隔符解析成列表写入设置
// ——避免用 computed setter 拆分导致"一打字(换行/标点)就消失"
const tagDraft = ref(settings.value.标签.列表.join('\n'));
watch(tagDraft, value => {
  settings.value.标签.列表 = String(value ?? '')
    .split(/[\n,，;；、]+/)
    .map(item => item.trim().replace(/^<|>$/g, ''))
    .filter(Boolean);
});

// ---- 编辑提示词: 幕后更新自定义提示词段(非空时替换内置) ----
type PromptSeg = { role: 'system' | 'user' | 'assistant'; content: string };
const showPromptEditor = ref(false);
// 编辑草稿: 打开时从设置载入(为空则用内置种子), 点"保存"才写回设置; 关闭未保存则丢弃
const promptDraftUpdate = ref<PromptSeg[]>([]);
function openPromptEditor() {
  const updateSaved = settings.value.更新.自定义提示词;
  promptDraftUpdate.value = updateSaved.length ? klona(updateSaved) : (getUpdatePromptSeed() as PromptSeg[]);
  showPromptEditor.value = true;
}
function savePromptDraft() {
  const target = settings.value.更新.自定义提示词;
  target.splice(0, target.length, ...klona(promptDraftUpdate.value));
  toastr.success('已保存幕后更新提示词', '彼方');
}
function addPromptSegment() {
  promptDraftUpdate.value.push({ role: 'system', content: '' });
}
function removePromptSegment(i: number) {
  promptDraftUpdate.value.splice(i, 1);
}
function movePromptSegment(i: number, dir: -1 | 1) {
  const list = promptDraftUpdate.value;
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const [seg] = list.splice(i, 1);
  list.splice(j, 0, seg);
}
function clearPromptSegments() {
  promptDraftUpdate.value.splice(0);
}

const savedOrb = (() => {
  try {
    return getVariables({ type: 'global' })?.[ORB_KEY] ?? null;
  } catch {
    return null;
  }
})();

const viewportW = (): number => parentWin.value?.innerWidth ?? window.innerWidth;
const viewportH = (): number => parentWin.value?.innerHeight ?? window.innerHeight;

const anchorX = ref<number | null>(null);
const anchorY = ref<number | null>(null);

function currentX(): number {
  return anchorX.value ?? viewportW() - 40;
}

function currentY(): number {
  return anchorY.value ?? viewportH() - 110;
}

function applyFrame() {
  const target = frame.value;
  if (!target) return;
  const x = currentX();
  const y = currentY();
  if (panelOpen.value) {
    target.style.width = `${viewportW()}px`;
    target.style.height = `${viewportH()}px`;
    target.style.left = '0px';
    target.style.top = '0px';
  } else {
    target.style.width = `${CLOSED_SIZE}px`;
    target.style.height = `${CLOSED_SIZE}px`;
    target.style.left = `${clamp(x - CLOSED_SIZE / 2, 8, viewportW() - CLOSED_SIZE - 8)}px`;
    target.style.top = `${clamp(y - CLOSED_SIZE / 2, 8, viewportH() - CLOSED_SIZE - 8)}px`;
  }
}

onMounted(() => {
  anchorX.value =
    typeof savedOrb?.x === 'number' && savedOrb.x >= CLOSED_SIZE / 2 && savedOrb.x <= viewportW() - CLOSED_SIZE / 2
      ? savedOrb.x
      : viewportW() - 40;
  anchorY.value =
    typeof savedOrb?.y === 'number' && savedOrb.y >= CLOSED_SIZE / 2 && savedOrb.y <= viewportH() - CLOSED_SIZE / 2
      ? savedOrb.y
      : viewportH() - 110;
  applyFrame();
  parentWin.value?.addEventListener('resize', onViewportResize);
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (clockTimer !== null) window.clearInterval(clockTimer);
});

function onViewportResize() {
  if (anchorX.value !== null) anchorX.value = clamp(anchorX.value, CLOSED_SIZE / 2, viewportW() - CLOSED_SIZE / 2);
  if (anchorY.value !== null) anchorY.value = clamp(anchorY.value, CLOSED_SIZE / 2, viewportH() - CLOSED_SIZE / 2);
  applyFrame();
}

watch([panelOpen, anchorX, anchorY], applyFrame);

watch([anchorX, anchorY], () => {
  try {
    insertOrAssignVariables({ [ORB_KEY]: { x: anchorX.value, y: anchorY.value } }, { type: 'global' });
  } catch {
    // 忽略保存失败
  }
});

const UPDATING_POP_ID = '彼方_更新弹窗';
let updatingPopEl: HTMLElement | null = null;

function ensureUpdatingPop(doc: Document): HTMLElement {
  let el = doc.getElementById(UPDATING_POP_ID);
  if (el) return el;
  el = doc.createElement('div');
  el.id = UPDATING_POP_ID;
  el.dataset.theme = theme.value;
  el.style.cssText =
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:12px;background:var(--bf-pop-bg);color:var(--bf-pop-text);font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);user-select:none;';
  el.innerHTML = `
    <span class="bf-pop-spin" style="width:14px;height:14px;border:2px solid var(--bf-pop-border);border-top-color:var(--bf-pop-accent);border-radius:50%;display:inline-block;animation:bf-pop-spin .8s linear infinite;flex:none;"></span>
    <span class="bf-pop-msg"></span>
    <button type="button" class="bf-pop-cancel" style="margin-left:2px;padding:4px 10px;border:none;border-radius:8px;background:var(--bf-pop-accent);color:#fff;font:inherit;cursor:pointer;">中断</button>`;
  if (!doc.querySelector('style[data-bf-pop]')) {
    const style = doc.createElement('style');
    style.setAttribute('data-bf-pop', '1');
    style.textContent = `
      #彼方_更新弹窗 { --bf-pop-bg: rgba(16, 23, 19, 0.96); --bf-pop-text: #eae5da; --bf-pop-border: rgba(234, 229, 218, 0.3); --bf-pop-accent: #b07a33; }
      #彼方_更新弹窗[data-theme="light"] { --bf-pop-bg: rgba(255, 253, 248, 0.97); --bf-pop-text: #2e2a22; --bf-pop-border: rgba(46, 42, 34, 0.25); --bf-pop-accent: #8a551f; }
      @keyframes bf-pop-spin{to{transform:rotate(360deg)}}`;
    doc.head.appendChild(style);
  }
  doc.body.appendChild(el);
  return el;
}

watch([updatingActive, updatingMessage], ([active, message]) => {
  const parentDoc = parentWin.value?.document;
  if (!parentDoc) return;
  if (active) {
    updatingPopEl = ensureUpdatingPop(parentDoc);
    const msgEl = updatingPopEl.querySelector('.bf-pop-msg');
    if (msgEl) msgEl.textContent = message || '彼方更新中…';
    const cancelBtn = updatingPopEl.querySelector('.bf-pop-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => updatingStore.cancel());
    updatingPopEl.style.display = 'flex';
  } else if (updatingPopEl && updatingPopEl.isConnected) {
    updatingPopEl.style.display = 'none';
  }
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let startX = 0;
let startY = 0;
let startAnchorX = 0;
let startAnchorY = 0;
let moved = false;

function parentClient(e: PointerEvent): { x: number; y: number } {
  const rect = frame.value?.getBoundingClientRect();
  if (e.view === frameWin.value && rect) {
    return { x: rect.left + e.clientX, y: rect.top + e.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function onOrbPointerDown(e: PointerEvent) {
  e.preventDefault();
  isDragging.value = true;
  moved = false;
  const rect = frame.value?.getBoundingClientRect();
  startX = (rect?.left ?? 0) + e.clientX;
  startY = (rect?.top ?? 0) + e.clientY;
  startAnchorX = currentX();
  startAnchorY = currentY();
  frameWin.value?.addEventListener('pointermove', onMove);
  frameWin.value?.addEventListener('pointerup', onUp);
  parentWin.value?.addEventListener('pointermove', onMove);
  parentWin.value?.addEventListener('pointerup', onUp);
}

function onMove(e: PointerEvent) {
  const point = parentClient(e);
  if (Math.abs(point.x - startX) + Math.abs(point.y - startY) > 4) moved = true;
  anchorX.value = clamp(startAnchorX + (point.x - startX), CLOSED_SIZE / 2, viewportW() - CLOSED_SIZE / 2);
  anchorY.value = clamp(startAnchorY + (point.y - startY), CLOSED_SIZE / 2, viewportH() - CLOSED_SIZE / 2);
}

function onUp() {
  isDragging.value = false;
  frameWin.value?.removeEventListener('pointermove', onMove);
  frameWin.value?.removeEventListener('pointerup', onUp);
  parentWin.value?.removeEventListener('pointermove', onMove);
  parentWin.value?.removeEventListener('pointerup', onUp);
  window.setTimeout(() => {
    moved = false;
  }, 200);
}

function onOrbClick() {
  if (moved) {
    moved = false;
    return;
  }
  panelOpen.value = !panelOpen.value;
}

function closePanel() {
  panelOpen.value = false;
}

function fmtTime(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : '';
}

async function copyText(text: string) {
  // iframe 内 navigator.clipboard 常被权限策略禁用，优先用父窗口的剪贴板
  const clipboard = parentWin.value?.navigator.clipboard ?? navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      toastr.success('已复制到剪贴板', '彼方');
      return;
    } catch {
      // 继续走兜底
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    if (ok) {
      toastr.success('已复制到剪贴板', '彼方');
      return;
    }
  } catch {
    // 忽略
  }
  toastr.error('复制失败，请手动选中复制', '彼方');
}

function buildErrorReport(): string {
  const log = debugLog.value;
  if (!log) return '';
  return [
    '【彼方 · 报错报告】',
    `时间: ${fmtTime(log.time)}`,
    `模型: ${log.model || '—'}`,
    `使用的楼层: #${log.replyIds.length > 0 ? log.replyIds.join('、#') : '—'}`,
    `本轮更新NPC: ${log.updatedNpcs.join('、') || '—'}`,
    log.error ? `错误: ${log.error}` : '',
    '',
    '--- 发送给 AI 的内容 ---',
    log.request,
    '',
    '--- AI 输出内容 ---',
    log.response || '(无输出)',
  ]
    .filter(line => line !== '')
    .join('\n');
}

async function copyErrorReport() {
  await copyText(buildErrorReport());
}

async function loadModels() {
  if (!settings.value.接口.地址) {
    toastr.warning('请先填写接口地址', '彼方');
    return;
  }
  fetchingModels.value = true;
  try {
    const list = await fetchModelList();
    settings.value.接口.模型列表 = list;
    if (!list.includes(settings.value.接口.模型)) {
      settings.value.接口.模型 = list[0] ?? '';
    }
    toastr.success(`获取到 ${list.length} 个模型`, '彼方');
  } catch (error) {
    console.error('[彼方] 获取模型列表失败:', error);
    toastr.error(error instanceof Error ? error.message : String(error), '彼方');
  } finally {
    fetchingModels.value = false;
  }
}

async function testConnection() {
  if (!settings.value.接口.地址 || !settings.value.接口.模型) {
    toastr.warning('请先填写接口地址并选择模型', '彼方');
    return;
  }
  testing.value = true;
  try {
    const reply = await chatCompletion([{ role: 'user', content: '请只回复两个字: 正常' }], { max_tokens: 16 });
    toastr.success(`连接正常, 模型回复: ${reply.trim().slice(0, 50)}`, '彼方');
  } catch (error) {
    console.error('[彼方] 测试连接失败:', error);
    toastr.error(error instanceof Error ? error.message : String(error), '彼方');
  } finally {
    testing.value = false;
  }
}

async function manualUpdate() {
  if (!settings.value.启用幕后) {
    toastr.warning('幕后系统已关闭(设置→启用幕后), 如需更新请先开启', '彼方');
    return;
  }
  updating.value = true;
  try {
    await updateNpcStates(true);
  } finally {
    updating.value = false;
  }
}

function reload() {
  stateStore.reload();
}

const clearing = ref(false);

function clearAll() {
  if (!clearing.value) {
    clearing.value = true;
    window.setTimeout(() => {
      clearing.value = false;
    }, 3000);
    return;
  }
  clearing.value = false;
  const empty = freshClearData();
  data.value = empty;
  stateStore.save();
  // 清空后无 NPC, 删除世界书里的幕后状态条目
  syncNpcStatesWorldbook(data.value, false).catch(error => {
    console.error('[彼方] 同步世界书条目失败:', error);
  });
  const reloaded = loadData();
  if (Object.keys(reloaded.NPC).length === 0 && reloaded.名单.length === 0) {
    toastr.success('彼方: 数据已清空，清空后只分析清空之后的新楼层', '彼方');
  } else {
    toastr.error('彼方: 清空后检测到仍有数据残留，请查看浏览器控制台并重新加载脚本', '彼方');
  }
}
</script>

<style scoped>
.bf-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  user-select: none;
  /* 深色主题 (默认) —— 夜幕暖灯：深蓝黑夜幕底 + 暖黄灯光点缀 + 月白文字 */
  color-scheme: dark;
  --bf-bg: #0c1120;
  --bf-bg2: #121a2e;
  --bf-card: #172039;
  --bf-hover: #1f2a4a;
  --bf-accent: #f0b45a;
  --bf-accent-strong: #c98a2e;
  --bf-accent-soft: rgba(240, 180, 90, 0.14);
  --bf-accent-text: #f7cf8a;
  --bf-success: #7fb08a;
  --bf-warning: #d4a94e;
  --bf-danger: #cc7a5e;
  --bf-text: #e8edf5;
  --bf-dim: #9aa8c0;
  --bf-faint: #5c6a85;
  --bf-border: rgba(232, 237, 245, 0.1);
  --bf-border-strong: rgba(232, 237, 245, 0.2);
  --bf-shadow: 0 24px 80px rgba(4, 8, 20, 0.75);
  --bf-orb-bg: rgba(18, 26, 46, 0.92);
  --bf-orb-ring: rgba(247, 207, 138, 0.32);
  --bf-orb-ring-strong: rgba(247, 207, 138, 0.55);
  --bf-orb-comp: rgba(240, 180, 90, 0.55);
  --bf-code: #0a0e1a;
  --bf-radius-sm: 8px;
  --bf-radius: 12px;
  --bf-radius-lg: 16px;
  color: var(--bf-text);
}

/* 白天模式 —— 冷白月光基底，琥珀灯光点缀 */
.bf-root[data-theme='light'] {
  color-scheme: light;
  --bf-bg: #f4f6fa;
  --bf-bg2: #e9edf4;
  --bf-card: #ffffff;
  --bf-hover: #dfe5ee;
  --bf-accent: #b0762a;
  --bf-accent-strong: #92591a;
  --bf-accent-soft: rgba(176, 118, 42, 0.12);
  --bf-accent-text: #8a5518;
  --bf-success: #4d7a56;
  --bf-warning: #9c7a1e;
  --bf-danger: #b25f43;
  --bf-text: #2b3340;
  --bf-dim: #67738a;
  --bf-faint: #a0abc0;
  --bf-border: rgba(43, 51, 64, 0.1);
  --bf-border-strong: rgba(43, 51, 64, 0.18);
  --bf-shadow: 0 24px 80px rgba(43, 51, 64, 0.18);
  --bf-orb-bg: rgba(255, 255, 255, 0.94);
  --bf-orb-ring: rgba(146, 89, 26, 0.35);
  --bf-orb-ring-strong: rgba(146, 89, 26, 0.6);
  --bf-orb-comp: rgba(146, 89, 26, 0.5);
  --bf-code: #f8fafc;
}

/* ---------- 悬浮球 (深色星盘 + 细环 + 渐变描边星) ---------- */
.bf-orb {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  border: none;
  background:
    radial-gradient(circle at 50% 40%, var(--bf-accent-soft), transparent 62%),
    var(--bf-orb-bg);
  box-shadow:
    0 0 0 1px var(--bf-orb-ring),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 1px 4px rgba(4, 8, 5, 0.3);
  color: var(--bf-accent);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  touch-action: none;
}
.bf-orb:hover {
  transform: translate(-50%, -50%) scale(1.06);
  box-shadow:
    0 0 0 1px var(--bf-orb-ring-strong),
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 2px 6px rgba(4, 8, 5, 0.35);
}
.bf-orb.dragging {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.09);
}
.bf-orb-icon {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 2px rgba(4, 8, 5, 0.45));
}
.bf-orb-comp {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 9px;
  height: 9px;
  color: var(--bf-orb-comp);
  transition: color 0.18s ease;
}
.bf-orb:hover .bf-orb-comp {
  color: var(--bf-accent);
}
.bf-orb-close-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bf-bg);
  border: 1px solid var(--bf-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bf-dim);
}
.bf-orb-spinner {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 13px;
  height: 13px;
  border: 2px solid var(--bf-border-strong);
  border-top-color: var(--bf-accent);
  border-radius: 50%;
  animation: bf-spin 0.8s linear infinite;
}

.bf-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 12, 8, 0.5);
  backdrop-filter: blur(3px);
  z-index: 1;
}
.bf-root[data-theme='light'] .bf-backdrop {
  background: rgba(46, 42, 34, 0.28);
}

/* ---------- 面板 (居中固定大小窗口) ---------- */
.bf-panel {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(1080px, 95vw);
  height: min(760px, 92vh);
  z-index: 2;
  display: flex;
  flex-direction: column;
  background: var(--bf-bg);
  border-radius: var(--bf-radius-lg);
  overflow: hidden;
  border: 1px solid var(--bf-border-strong);
  box-shadow: var(--bf-shadow);
}

/* ---------- Header ---------- */
.bf-header {
  position: relative;
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px;
  background: linear-gradient(180deg, var(--bf-bg2), var(--bf-bg));
  border-bottom: 1px solid var(--bf-border);
}
/* 顶部暖光氛围带 —— 深夜房间里那盏灯 */
.bf-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--bf-accent-soft), var(--bf-accent), var(--bf-accent-soft), transparent);
  opacity: 0.7;
}
.bf-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.bf-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 30%, var(--bf-accent-soft), transparent 72%),
    var(--bf-bg2);
  border: 1px solid var(--bf-border-strong);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: var(--bf-accent);
}
.bf-logo svg {
  width: 22px;
  height: 22px;
}
.bf-brand-text {
  line-height: 1.2;
}
.bf-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--bf-text);
}
.bf-title-en {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--bf-dim);
  letter-spacing: 0.06em;
}
.bf-subtitle {
  font-size: 11px;
  color: var(--bf-dim);
}

/* ---------- 顶部导航栏 ---------- */
.bf-navbar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  justify-content: center;
  min-width: 0;
  overflow-x: auto;
  padding: 0 8px;
}
.bf-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border: none;
  border-radius: var(--bf-radius-sm);
  background: transparent;
  color: var(--bf-dim);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
  white-space: nowrap;
}
.bf-nav:hover {
  background: var(--bf-hover);
  color: var(--bf-text);
}
.bf-nav.active {
  background: var(--bf-accent-soft);
  color: var(--bf-accent-text);
}
.bf-nav.active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 2px;
  height: 2px;
  border-radius: 2px;
  background: var(--bf-accent);
}
.bf-nav-icon {
  width: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.bf-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.bf-ready {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--bf-dim);
}
.bf-ready .bf-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bf-danger);
}
.bf-ready.ok .bf-dot {
  background: var(--bf-success);
  box-shadow: 0 0 6px var(--bf-success);
}
.bf-clock {
  font-size: 12px;
  color: var(--bf-dim);
  font-variant-numeric: tabular-nums;
}
.bf-icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--bf-radius-sm);
  background: transparent;
  color: var(--bf-dim);
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease;
}
.bf-icon-btn:hover {
  background: var(--bf-hover);
  color: var(--bf-text);
}
.bf-theme-btn:hover {
  background: var(--bf-accent-soft);
  color: var(--bf-accent-text);
}

/* ---------- Body ---------- */
.bf-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* ---------- 主内容 ---------- */
.bf-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 22px 26px;
}
.bf-page {
  max-width: 980px;
  margin: 0 auto;
}
.bf-page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--bf-text);
  margin-bottom: 18px;
  letter-spacing: 0.01em;
}
.bf-page-title svg {
  color: var(--bf-accent-text);
}
.bf-page-title .bf-btn {
  margin-left: auto;
  flex: none;
}

/* ---------- 仪表盘双栏布局 ---------- */
.bf-dash-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  gap: 14px;
  align-items: start;
}
.bf-dash-main {
  min-width: 0;
}
.bf-dash-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 0;
}
.bf-side-card {
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
}
.bf-side-card:hover {
  background: var(--bf-hover);
  border-color: var(--bf-border-strong);
  transform: translateY(-1px);
}
.bf-side-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--bf-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.bf-side-num.bf-side-clock {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.1;
}
.bf-side-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--bf-dim);
}
.bf-side-label svg {
  color: var(--bf-accent-text);
}
.bf-panel-card-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--bf-accent-text);
  background: var(--bf-accent-soft);
  border-radius: 999px;
  padding: 2px 9px;
}

/* ---------- 日志双栏布局 ---------- */
.bf-logs-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.bf-logs-main,
.bf-logs-side {
  min-width: 0;
}

/* ---------- 设置页双栏布局 ---------- */
.bf-settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.bf-settings-main,
.bf-settings-side {
  min-width: 0;
}
@media (max-width: 880px) {
  .bf-settings-layout {
    grid-template-columns: 1fr;
  }
}

/* ---------- 操作按钮行 ---------- */
.bf-dash-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.bf-panel-card {
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 16px;
  margin-bottom: 14px;
}
.bf-panel-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--bf-text);
  margin-bottom: 12px;
}
.bf-panel-card-title svg {
  color: var(--bf-accent-text);
}
.bf-dash-npcs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
.bf-dash-npc {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--bf-radius-sm);
  background: var(--bf-bg2);
  border: 1px solid var(--bf-border);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
  min-width: 0;
}
.bf-dash-npc:hover {
  background: var(--bf-hover);
  border-color: var(--bf-border-strong);
}
.bf-dash-npc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.bf-dash-npc-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--bf-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bf-dash-npc-loc {
  font-size: 10.5px;
  color: var(--bf-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bf-npc-del {
  margin-left: 2px;
  width: 22px;
  height: 22px;
  font-size: 11px;
  border-radius: 6px;
  flex: none;
}
.bf-npc-del:hover {
  background: rgba(212, 132, 111, 0.2);
  color: var(--bf-danger);
}

/* ---------- 通用组件 ---------- */
.bf-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-sm);
  background: var(--bf-card);
  color: var(--bf-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}
.bf-btn:hover:not(:disabled) {
  background: var(--bf-hover);
  border-color: var(--bf-border-strong);
}
.bf-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bf-btn-primary {
  background: var(--bf-accent-strong);
  border-color: transparent;
  color: #ffffff;
}
.bf-btn-primary:hover:not(:disabled) {
  background: var(--bf-accent);
  color: #ffffff;
}
.bf-btn-danger {
  background: rgba(212, 132, 111, 0.12);
  border-color: rgba(212, 132, 111, 0.4);
  color: var(--bf-danger);
}
.bf-btn-danger:hover:not(:disabled) {
  background: rgba(212, 132, 111, 0.22);
}
.bf-btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.bf-btn-mini {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 6px;
}
.bf-btn.active {
  background: var(--bf-accent-strong);
  border-color: transparent;
  color: #ffffff;
}
.bf-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--bf-border-strong);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: bf-spin 0.8s linear infinite;
  display: inline-block;
  flex: none;
}

.bf-avatar {
  width: 34px;
  height: 34px;
  border-radius: var(--bf-radius-sm);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(145deg, var(--bf-accent), var(--bf-accent-strong));
}
.bf-avatar-lg {
  width: 44px;
  height: 44px;
  font-size: 18px;
  border-radius: var(--bf-radius);
}

.bf-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.5;
}
.bf-tag-green {
  background: rgba(143, 191, 127, 0.16);
  color: var(--bf-success);
}
.bf-tag-yellow {
  background: rgba(251, 191, 36, 0.16);
  color: var(--bf-warning);
}
.bf-tag-blue {
  background: rgba(96, 165, 250, 0.16);
  color: #60a5fa;
}
.bf-tag-purple {
  background: rgba(192, 132, 252, 0.16);
  color: #c084fc;
}
.bf-tag-pink {
  background: rgba(244, 114, 182, 0.16);
  color: #f472b6;
}
.bf-tag-teal {
  background: rgba(110, 192, 178, 0.16);
  color: #5fb4a2;
}
.bf-tag-orange {
  background: rgba(251, 146, 60, 0.16);
  color: #fb923c;
}
.bf-tag-red {
  background: rgba(248, 113, 113, 0.16);
  color: #f87171;
}
/* 白天模式下标签文字加深以通过对比度 */
.bf-root[data-theme='light'] .bf-tag-green {
  color: #059669;
}
.bf-root[data-theme='light'] .bf-tag-yellow {
  color: #b45309;
}
.bf-root[data-theme='light'] .bf-tag-blue {
  color: #2563eb;
}
.bf-root[data-theme='light'] .bf-tag-purple {
  color: #9333ea;
}
.bf-root[data-theme='light'] .bf-tag-pink {
  color: #db2777;
}
.bf-root[data-theme='light'] .bf-tag-teal {
  color: #2c8a78;
}
.bf-root[data-theme='light'] .bf-tag-orange {
  color: #ea580c;
}
.bf-root[data-theme='light'] .bf-tag-red {
  color: #dc2626;
}

.bf-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--bf-dim);
}
.bf-empty-text {
  font-size: 14px;
  color: var(--bf-text);
  margin-bottom: 6px;
}
.bf-empty-hint {
  font-size: 12px;
  color: var(--bf-dim);
}

/* ---------- NPC Master-Detail ---------- */
.bf-npc-layout {
  display: flex;
  gap: 14px;
  max-width: 1000px;
  height: calc(min(760px, 92vh) - 128px);
  min-height: 360px;
}
.bf-npc-list {
  width: 260px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}
.bf-npc-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--bf-radius);
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}
.bf-npc-item:hover {
  background: var(--bf-hover);
}
.bf-npc-item.active {
  border-color: var(--bf-accent);
  background: var(--bf-accent-soft);
}
.bf-npc-item-main {
  min-width: 0;
  flex: 1;
}
.bf-npc-item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bf-npc-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--bf-text);
}
.bf-online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bf-success);
  box-shadow: 0 0 5px var(--bf-success);
  flex: none;
}
.bf-npc-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--bf-dim);
  margin-top: 2px;
  overflow: hidden;
}
.bf-npc-sub .bf-npc-loc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
}
.bf-npc-sub .bf-npc-loc svg {
  color: var(--bf-accent-text);
}
.bf-npc-sub .bf-npc-loc-text {
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bf-npc-sub .bf-npc-sep {
  flex: none;
  opacity: 0.5;
}
.bf-npc-sub .bf-npc-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bf-npc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.bf-npc-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 18px;
}
.bf-detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--bf-border);
  margin-bottom: 14px;
}
.bf-detail-actions {
  display: flex;
  gap: 6px;
  margin-left: 8px;
}

/* ---------- 弹窗 ---------- */
.bf-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 12, 8, 0.5);
  backdrop-filter: blur(2px);
  z-index: 20;
}
.bf-root[data-theme='light'] .bf-modal-backdrop {
  background: rgba(43, 51, 64, 0.28);
}
.bf-modal {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, 90vw);
  max-height: 86vh;
  overflow-y: auto;
  background: var(--bf-bg2);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-lg);
  padding: 18px;
  z-index: 21;
  box-shadow: var(--bf-shadow);
}
.bf-modal-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  color: var(--bf-text);
  margin-bottom: 14px;
}
.bf-modal-title svg {
  color: var(--bf-accent-text);
}
.bf-detail-head-text {
  flex: 1;
}
.bf-detail-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--bf-text);
}
.bf-detail-updated {
  font-size: 11px;
  color: var(--bf-dim);
}
.bf-detail-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}
.bf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* ---------- NPC 详情：核心状态区 ---------- */
.bf-detail-spotlight {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.bf-spot {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  background: var(--bf-bg2);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
}
.bf-spot:hover {
  background: var(--bf-hover);
}
.bf-spot-icon {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: var(--bf-radius-sm);
  background: var(--bf-accent-soft);
  color: var(--bf-accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
.bf-spot-main {
  flex: 1;
  min-width: 0;
}
.bf-spot-label {
  display: block;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--bf-dim);
  margin-bottom: 3px;
  text-transform: uppercase;
}
.bf-spot-value {
  font-size: 14px;
  color: var(--bf-text);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.bf-spot-value-loc {
  font-size: 13px;
}
.bf-spot .bf-textarea {
  min-height: 40px;
}

/* ---------- NPC 详情：分组字段 ---------- */
.bf-detail-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bf-field-group {
  background: var(--bf-bg2);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 12px 14px;
}
.bf-field-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--bf-accent-text);
  margin-bottom: 10px;
}
.bf-field-group-title svg {
  color: var(--bf-accent-text);
}
.bf-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.bf-field-value-bool {
  font-size: 13px;
}
.bf-field-label {
  font-size: 11px;
  color: var(--bf-dim);
  font-weight: 500;
}
.bf-field-value {
  font-size: 13px;
  color: var(--bf-text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------- 互动聊天流 ---------- */
.bf-flow {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bf-flow-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.bf-flow-time {
  width: 64px;
  flex: none;
  padding-top: 14px;
  font-size: 11px;
  color: var(--bf-dim);
  text-align: right;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.bf-flow-participants {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bf-flow-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  border: 2px solid var(--bf-card);
  margin-left: -8px;
  background: linear-gradient(145deg, var(--bf-accent), var(--bf-accent-strong));
}
.bf-flow-participants .bf-flow-avatar:first-child {
  margin-left: 0;
}
.bf-flow-body {
  flex: 1;
  min-width: 0;
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 12px 14px;
}
.bf-flow-head {
  margin-bottom: 6px;
}
.bf-flow-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--bf-accent-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bf-flow-content {
  font-size: 13.5px;
  color: var(--bf-text);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------- 时间轴 ---------- */
.bf-timeline {
  position: relative;
  padding-left: 28px;
}
.bf-timeline::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: linear-gradient(180deg, var(--bf-accent), var(--bf-accent-soft));
}
.bf-tl-item {
  position: relative;
  display: flex;
  gap: 14px;
  padding-bottom: 18px;
}
.bf-tl-icon {
  position: absolute;
  left: -28px;
  top: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bf-card);
  border: 2px solid var(--bf-accent);
  box-shadow: 0 0 0 3px var(--bf-accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--bf-accent-text);
}
.bf-tl-content {
  flex: 1;
  min-width: 0;
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 10px 14px;
  transition: background 0.16s ease, border-color 0.16s ease;
}
.bf-tl-item:hover .bf-tl-content {
  background: var(--bf-hover);
  border-color: var(--bf-border-strong);
}
.bf-tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.bf-tl-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--bf-text);
}
.bf-tl-time {
  font-size: 11px;
  color: var(--bf-dim);
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.bf-tl-desc {
  font-size: 12.5px;
  color: var(--bf-text);
  opacity: 0.85;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------- 日志 ---------- */
.bf-debug-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bf-debug-meta-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  color: var(--bf-text);
}
.bf-debug-meta-label {
  width: 76px;
  flex: none;
  font-size: 11.5px;
  color: var(--bf-dim);
}
.bf-debug-preview {
  color: var(--bf-text);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bf-debug-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--bf-text);
}
.bf-debug-head-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bf-debug-head-section {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 10px;
  color: var(--bf-text);
}
.bf-debug-summary {
  font-size: 12px;
  color: var(--bf-dim);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: var(--bf-radius-sm);
  background: var(--bf-bg2);
  transition: background 0.16s ease;
}
.bf-debug-summary:hover {
  background: var(--bf-hover);
}
.bf-debug-pre {
  margin-top: 8px;
  padding: 12px;
  border-radius: var(--bf-radius-sm);
  background: var(--bf-code);
  border: 1px solid var(--bf-border);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--bf-text);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 420px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
}
.bf-debug-error .bf-debug-pre {
  border-color: rgba(212, 132, 111, 0.4);
  color: var(--bf-danger);
}

/* ---------- 控制台输出 ---------- */
.bf-console {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bf-code);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-sm);
  padding: 8px;
}
.bf-console-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  word-break: break-word;
}
.bf-console-time {
  flex: none;
  color: var(--bf-dim);
  font-size: 10.5px;
}
.bf-console-log .bf-console-text {
  color: var(--bf-text);
}
.bf-console-info .bf-console-text {
  color: var(--bf-accent-text);
}
.bf-console-warn .bf-console-text {
  color: var(--bf-warning);
}
.bf-console-error .bf-console-text {
  color: var(--bf-danger);
}

/* ---------- 设置 ---------- */
.bf-group {
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  padding: 18px;
  margin-bottom: 18px;
}
.bf-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--bf-text);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--bf-border);
}
.bf-group-title svg {
  color: var(--bf-accent-text);
}
.bf-group-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0 14px;
  padding-top: 16px;
  border-top: 1px solid var(--bf-border);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--bf-dim);
  white-space: nowrap;
}
.bf-group-subtitle::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--bf-border);
}
.bf-group-subtitle:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

/* 表单行: 标签左固定、控件弹性, 统一 12px 行距 */
.bf-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.bf-row > .bf-label:first-child {
  min-width: 96px;
}
.bf-label {
  font-size: 12.5px;
  color: var(--bf-dim);
  flex: none;
  min-width: 84px;
}
/* 一行两个字段(如 温度/最大Token) */
.bf-row-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 12px;
}
.bf-row-pair .bf-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bf-row-pair .bf-pair .bf-label {
  min-width: 0;
  flex: none;
}
.bf-input {
  flex: 1;
  min-width: 130px;
  height: 34px;
  padding: 0 11px;
  border-radius: var(--bf-radius-sm);
  border: 1px solid var(--bf-border);
  background: var(--bf-bg2);
  color: var(--bf-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.bf-input:focus {
  border-color: var(--bf-accent);
  box-shadow: 0 0 0 3px var(--bf-accent-soft);
}
.bf-input::placeholder {
  color: var(--bf-faint);
}
.bf-input-num {
  flex: none;
  width: 92px;
  min-width: 0;
  text-align: center;
}
.bf-actions {
  gap: 8px;
}
.bf-textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--bf-radius-sm);
  border: 1px solid var(--bf-border);
  background: var(--bf-bg2);
  color: var(--bf-text);
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.bf-textarea:focus {
  border-color: var(--bf-accent);
  box-shadow: 0 0 0 3px var(--bf-accent-soft);
}
.bf-textarea::placeholder {
  color: var(--bf-faint);
}
.bf-textarea-short {
  height: 64px;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  font-size: 12px;
}
.bf-hint {
  font-size: 11.5px;
  color: var(--bf-faint);
  line-height: 1.55;
  margin: 0 0 12px;
  width: 100%;
  box-sizing: border-box;
}
.bf-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  cursor: pointer;
}
.bf-toggle input {
  display: none;
}
.bf-toggle-track {
  width: 34px;
  height: 19px;
  border-radius: 999px;
  background: var(--bf-bg2);
  border: 1px solid var(--bf-border);
  position: relative;
  transition: background 0.18s ease, border-color 0.18s ease;
  flex: none;
}
.bf-toggle input:checked + .bf-toggle-track {
  background: var(--bf-accent);
  border-color: transparent;
}
.bf-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--bf-text);
  transition: transform 0.18s ease;
}
.bf-toggle input:checked + .bf-toggle-track .bf-toggle-thumb {
  transform: translateX(15px);
  background: #ffffff;
}
.bf-toggle-text {
  font-size: 13px;
  color: var(--bf-text);
}
.bf-toggle-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px;
}
.bf-toggle-inline .bf-toggle-text {
  font-size: 12px;
  white-space: nowrap;
}
.bf-input-shape {
  max-width: 92px;
}
/* 分段控件: 互斥按钮组(排除/只读/无 等) */
.bf-seg {
  display: inline-flex;
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-sm);
  overflow: hidden;
  background: var(--bf-bg2);
}
.bf-seg .bf-btn {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--bf-dim);
}
.bf-seg .bf-btn:hover:not(:disabled) {
  background: var(--bf-hover);
  color: var(--bf-text);
}
.bf-seg .bf-btn.active {
  background: var(--bf-accent-strong);
  color: #ffffff;
}
.bf-seg .bf-btn + .bf-btn {
  border-left: 1px solid var(--bf-border);
}
/* 颜色选择器统一 */
.bf-color-pick {
  width: 30px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-sm);
  background: var(--bf-bg2);
  cursor: pointer;
  flex: none;
}

/* ---------- Footer ---------- */
.bf-footer {
  position: relative;
  height: 34px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  font-size: 11.5px;
  color: var(--bf-dim);
  background: var(--bf-bg2);
  border-top: 1px solid var(--bf-border);
}
.bf-footer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--bf-accent-soft), var(--bf-accent), var(--bf-accent-soft), transparent);
  opacity: 0.5;
}
.bf-footer-spacer {
  flex: 1;
}

/* ---------- 动画 ---------- */
@keyframes bf-spin {
  to {
    transform: rotate(360deg);
  }
}
.bf-fade-enter-active {
  transition: opacity 0.18s ease;
}
.bf-fade-enter-from {
  opacity: 0;
}
.bf-fade-leave-active,
.bf-fade-leave-to {
  transition: none;
  opacity: 0;
}
.bf-pop-enter-active {
  transition: opacity 0.18s ease;
}
.bf-pop-enter-from {
  opacity: 0;
}
.bf-pop-leave-active,
.bf-pop-leave-to {
  transition: none;
  opacity: 0;
}
.bf-pagefade-enter-active,
.bf-pagefade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.bf-pagefade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.bf-pagefade-leave-to {
  opacity: 0;
}

/* ---------- 滚动条 ---------- */
.bf-main::-webkit-scrollbar,
.bf-npc-list::-webkit-scrollbar,
.bf-npc-detail::-webkit-scrollbar,
.bf-debug-pre::-webkit-scrollbar,
.bf-console::-webkit-scrollbar,
.bf-navbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.bf-main::-webkit-scrollbar-thumb,
.bf-npc-list::-webkit-scrollbar-thumb,
.bf-npc-detail::-webkit-scrollbar-thumb,
.bf-debug-pre::-webkit-scrollbar-thumb,
.bf-console::-webkit-scrollbar-thumb,
.bf-navbar::-webkit-scrollbar-thumb {
  background: var(--bf-faint);
  border-radius: 4px;
}
.bf-main::-webkit-scrollbar-thumb:hover,
.bf-npc-list::-webkit-scrollbar-thumb:hover,
.bf-npc-detail::-webkit-scrollbar-thumb:hover,
.bf-debug-pre::-webkit-scrollbar-thumb:hover,
.bf-console::-webkit-scrollbar-thumb:hover,
.bf-navbar::-webkit-scrollbar-thumb:hover {
  background: var(--bf-dim);
}

/* ---------- 手机端适配 (<=700px) ---------- */
@media (max-width: 700px) {
  /* 面板全屏 */
  .bf-panel {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
    border: none;
  }

  /* Header: 第一行品牌+操作, 第二行导航栏等分 */
  .bf-header {
    height: auto;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 8px 12px;
  }
  .bf-brand {
    gap: 8px;
  }
  .bf-logo {
    width: 32px;
    height: 32px;
    border-radius: 9px;
  }
  .bf-logo svg {
    width: 20px;
    height: 20px;
  }
  .bf-title {
    font-size: 13px;
  }
  .bf-title-en,
  .bf-subtitle {
    display: none;
  }
  .bf-navbar {
    order: 3;
    flex-basis: 100%;
    justify-content: space-between;
    padding: 2px 0 0;
    overflow-x: hidden;
  }
  .bf-nav {
    flex: 1;
    min-width: 0;
    justify-content: center;
    gap: 4px;
    padding: 7px 2px;
    font-size: 12px;
    border-radius: 6px;
  }
  .bf-nav-icon {
    width: 15px;
    height: 15px;
  }
  .bf-ready,
  .bf-clock,
  .bf-header-right .bf-btn-sm {
    display: none;
  }
  .bf-header-right {
    gap: 4px;
  }

  /* 主内容与页脚 */
  .bf-main {
    padding: 14px 14px 22px;
  }
  .bf-page-title {
    font-size: 16px;
    margin-bottom: 14px;
  }
  .bf-footer {
    height: auto;
    min-height: 30px;
    padding: 5px 12px;
    gap: 8px;
    font-size: 10.5px;
  }
  .bf-footer > span:nth-child(-n + 2) {
    display: none;
  }

  /* 双栏转单列 */
  .bf-dash-layout,
  .bf-logs-layout,
  .bf-settings-layout {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .bf-dash-side {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    position: static;
  }
  .bf-side-card {
    padding: 10px 12px;
  }
  .bf-side-num {
    font-size: 22px;
  }
  .bf-logs-side {
    min-width: 0;
  }

  /* NPC 页: 列表横向滚动在上, 详情在下方整页滚动 */
  .bf-npc-layout {
    flex-direction: column;
    height: auto;
    min-height: 0;
    gap: 10px;
  }
  .bf-npc-list {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    padding-right: 0;
    gap: 6px;
  }
  .bf-npc-item {
    flex: none;
    width: 148px;
  }
  .bf-npc-detail {
    flex: none;
    height: auto;
    overflow: visible;
    padding: 14px;
  }
  .bf-detail-fields,
  .bf-field-grid {
    grid-template-columns: 1fr;
    gap: 10px 0;
  }

  /* 输入控件 16px 防 iOS 聚焦自动放大 */
  .bf-input,
  .bf-textarea {
    font-size: 16px;
  }
  .bf-input-num {
    width: 76px;
  }

  /* 卡片与弹窗 */
  .bf-panel-card {
    padding: 12px;
    margin-bottom: 10px;
  }
  .bf-modal {
    width: 92vw;
    max-height: 82vh;
    padding: 14px;
  }
  .bf-debug-pre {
    max-height: 300px;
  }
}


/* ---------- 编辑提示词弹层 ---------- */
.bf-prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.bf-prompt-modal {
  width: min(680px, 96vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--bf-panel);
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.bf-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--bf-border);
}
.bf-prompt-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 16px 0;
}
.bf-prompt-ph {
  margin-top: 4px;
  color: var(--bf-text-3, #8a8680);
  font-size: 11.5px;
  font-family: ui-monospace, Consolas, monospace;
}
.bf-prompt-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bf-prompt-seg {
  border: 1px solid var(--bf-border);
  border-radius: var(--bf-radius-sm);
  background: color-mix(in srgb, var(--bf-panel, #1e1e22) 60%, #000);
  padding: 10px;
}
.bf-prompt-seg-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.bf-prompt-move {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.bf-prompt-move .bf-btn {
  padding: 2px 8px;
  min-width: 26px;
}
.bf-input-role {
  width: 130px;
  flex: none;
}
.bf-prompt-seg textarea {
  width: 100%;
  min-height: 84px;
  resize: vertical;
}
.bf-prompt-actions {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--bf-border);
}
.bf-prompt-spacer {
  flex: 1;
}
</style>
