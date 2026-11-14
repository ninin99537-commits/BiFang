# 彼方 · NPC 幕后生命状态

酒馆助手脚本。NPC 幕后生活、日志、关系与身体状态面板。

本仓库自包含：`src/共用` 是本项目依赖的共享模块副本，克隆即可构建。

## 命令

    pnpm install
    pnpm build     # 生产构建 -> dist/
    pnpm watch     # 开发监听 + 酒馆热重载
    pnpm test      # 用例

## 结构

    src/彼方_NPC幕后生命状态系统   主项目
    src/共用     共享模块（副本）
    tests/       用例
    util/ @types/ tools/ .cursor/rules
