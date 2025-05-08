# GMM - 模组管理器

![角色列表](https://github.com/user-attachments/assets/c45b7d4d-6a2a-45a9-8f44-ded6ef450b1d)

**基于 Tauri 和 React 构建的现代化跨平台《原神》&《Zenless Zone Zero》模组管理器**

[![最新版本](https://img.shields.io/github/v/release/Eidenz/gmm-updates?label=最新版本&style=for-the-badge)](https://github.com/Eidenz/gmm/releases/latest)
[![下载量](https://img.shields.io/github/downloads/Eidenz/gmm-updates/total?style=for-the-badge)](https://github.com/Eidenz/gmm/releases)

GMM 致力于简化模组的安装、管理和切换流程，提供清爽的界面和实用功能（如预设配置和快捷键查看）。

---

## ✨ 核心功能

*   **🎮 多游戏支持:** 管理不同游戏的模组（当前支持《原神》和《Zenless Zone Zero》），各游戏拥有独立配置和数据库，可快速切换支持的游戏。
*   **🗂️ 模组库分类管理:** 自动扫描模组文件夹，按游戏将模组分类整理（角色、武器、UI等）。
*   **🖱️ 一键启用/禁用:** 通过开关快速切换模组状态，自动处理 `DISABLED_` 前缀重命名。
*   **🖱️ 拖拽导入:** 直接将压缩文件（.zip/.7z/.rar）拖拽至应用窗口进行导入。
*   **📦 增强压缩包导入:** 支持从压缩包直接导入模组，自动分析内容（含INI提示），智能建议模组信息，可选根目录或解压全部文件。
*   **🤖 智能信息提取:** 在扫描/导入时通过文件夹结构、内部文件名和INI文件自动推断模组名称、作者和目标实体。
*   **✨ 预设系统:** 将当前模组配置保存为预设方案，快速切换不同模组组合。可将常用预设标记为收藏并显示在侧边栏。
*   **📊 强化仪表盘:** 实时查看当前游戏模组库统计，包括模组总数、启用/禁用状态和分类饼状图。
*   **🚀 快速启动集成:** 配置游戏主程序路径或模组启动器实现一键启动，支持Windows系统管理员权限启动。
*   **⌨️ 快捷键查看器:** 快速查看模组INI文件中定义的快捷键（自动识别 `[Key.*]` 章节中 `; Constants` 标记后的 `key = ...` 行）。
*   **🖼️ 图片预览与灯箱:** 自动检测常见预览图（preview.png等），支持通过文件选择或粘贴更换预览图，点击预览可放大查看。
*   **🖱️ 右键菜单操作:** 在列表视图右键点击模组可快速执行操作（打开文件夹/添加至预设/编辑/删除）。
*   **🔄 内置更新器:** 通过集成更新器保持最新版本（基于Tauri实现）。
*   **🦀 Tauri驱动:** 采用Rust（后端）+ React（前端）的Tauri框架，打造高效跨平台体验。

---

## 📸 界面截图

![仪表盘](https://github.com/user-attachments/assets/6e9f6d59-45bc-4a2c-97d2-35849f77186a)

![角色页面](https://github.com/user-attachments/assets/1e387440-f39f-43c6-a2e1-83b389017e5e)

![角色模组](https://github.com/user-attachments/assets/17d812a6-0b66-4fc9-abcd-1353291ea807)

---

## 💾 安装指南

1.  **下载:** 访问[最新版本](https://github.com/Eidenz/gmm-updates/releases/latest)页面。
2.  **安装程序:** 下载 `.msi` 安装文件（例如 `GenshinModManager_X.Y.Z_x64_en-US.msi`）。
3.  **运行:** 执行下载的 `.msi` 文件并按照提示完成安装。
4.  **更新:** 应用内置更新器会在新版本发布时通知您。

---

## 🚀 使用教程

1.  **初始设置:**
    *   首次启动时需选择要配置的游戏（例如《原神》）
    *   必须选择该游戏模组的主存储目录（例如 `...\GIMI\Mods`）
    *   可选配置游戏主程序路径以实现快速启动
2.  **切换游戏:** 通过仪表盘或初始设置界面切换游戏，切换需要重启应用（GMM会自动处理）。各游戏的设置和模组相互独立。
3.  **扫描模组:** 设置模组目录后，前往 **设置 -> 扫描模组文件夹 -> 立即扫描** 来构建当前游戏的模组库。
4.  **导入模组:**
    *   **方法1（按钮）:** 点击侧边栏 **导入模组** 按钮，选择支持的压缩文件。
    *   **方法2（拖拽）:** 直接将压缩文件拖拽至GMM窗口。
    *   **处理流程:** 检查压缩包内容，GMM会自动建议根目录。选择正确的 **模组根目录**（包含INI文件的文件夹）或勾选 **解压全部文件**。填写/修正模组名称、目标实体等信息后点击 **确认导入**。
5.  **浏览模组:** 通过侧边栏导航查看当前游戏的模组库。点击实体卡片（如雷电将军）查看相关模组。
6.  **管理模组:**
    *   在卡片视图或列表视图中通过开关启用/禁用模组
    *   使用铅笔图标编辑模组详情（名称/描述/作者/标签/预览图/目标实体）
    *   使用垃圾桶图标删除模组（同时删除本地文件和数据库记录）
    *   使用键盘图标查看检测到的快捷键
    *   在列表视图右键点击模组执行快捷操作
    *   点击预览图可通过灯箱放大查看
7.  **批量操作（列表视图）:**
    *   勾选列表视图中的模组复选框
    *   使用顶部出现的 "启用选中"/"禁用选中" 按钮
8.  **预设管理:**
    *   预设方案与当前游戏绑定
    *   前往 **预设** 页面
    *   输入名称点击 **创建预设** 保存当前模组配置
    *   点击播放图标应用预设
    *   使用其他图标进行覆盖/收藏（显示在侧边栏）/删除操作
9.  **快速启动:** 点击侧边栏 **快速启动** 按钮，GMM会尝试普通启动。若Windows系统提示权限不足，将请求管理员权限进行提权启动。

---

## 🛠️ 开发指南

**环境要求:**

*   [Node.js](https://nodejs.org/)（推荐LTS版本）及npm/yarn
*   [Rust工具链](https://www.rust-lang.org/tools/install)
*   [Tauri前置条件](https://tauri.app/v1/guides/getting-started/prerequisites)

**配置步骤:**

1.  **克隆仓库:**
    ```bash
    git clone https://github.com/Eidenz/gmm.git
    cd gmm
    ```
2.  **安装前端依赖:**
    ```bash
    npm install
    # 或
    yarn install
    ```
3.  **开发模式运行:**
    ```bash
    npm run tauri dev
    ```
    这将同时启动Vite前端开发服务器和Tauri后端

**构建命令:**

```bash
npm run tauri build
```
根据tauri.conf.json配置生成最终应用程序

## 💻 技术栈

- **框架:** Tauri
- **后端:** Rust
- **前端:** React + Vite + Framer Motion
- **数据库:** SQLite（通过rusqlite驱动）
- **图标库:** Font Awesome + Lucide React
