# 酒馆助手 · 项目集

酒馆助手（Tavern Helper）前端界面与脚本的构建工程。由旧工程 `实时编写-前端界面或脚本` 重整而来。

## 项目

| 目录 | 形态 | 产出 |
| --- | --- | --- |
| `src/彼方_NPC幕后生命状态系统` | 脚本 | `dist/彼方_NPC幕后生命状态系统/index.js` |
| `src/剧情导演` | 脚本 | `dist/剧情导演/index.js` |
| `src/烟火_世界运转` | 脚本 | `dist/烟火_世界运转/index.js` |
| `src/人设工坊` | 前端界面 | `dist/人设工坊/index.html` |
| `src/自定义状态栏` | 前端界面 | `dist/自定义状态栏/index.html` |
| `src/共用` | 共享模块 | 不产出，被彼方/导演/烟火以 `../共用` 引用 |

## 命令

```bash
pnpm install     # 安装依赖
pnpm build       # 生产构建（全部项目）
pnpm watch       # 开发监听 + 酒馆热重载
pnpm test        # 用例（tests/）
pnpm lint        # eslint
```

`pnpm watch` 会同时启动酒馆助手的实时监听（端口 6621）与 `tavern_sync` 监听；只要酒馆网页里
`酒馆助手 - 实时监听 - 允许监听` 是开着的，改完代码就会自动热重载，不必手动 build 或刷新页面。

## 目录

```
src/          5 个项目 + 共用模块
tests/        用例（bifang / daoyan / yanhuo / 人设工坊 / 共用）
util/         通用工具（script.ts 有本地改动）
tools/        本地开发脚本（dev.mjs / static-server.mjs / 酒馆调试.mjs）
@types/       酒馆、酒馆助手、MVU 的类型声明
.cursor/rules 项目知识与编写规范（AGENTS.md 引用）
```

`dist/` 与 `node_modules/` 不入库。`tavern_sync.yaml` 默认不绑定任何角色卡/世界书/预设，需要同步时再填「配置」。
