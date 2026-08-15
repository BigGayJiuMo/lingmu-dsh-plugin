# 灵眸中转站用量报表 (LingMu Usage Report for DeepSeek Harness)

一个用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件：在浏览器里显示**灵眸中转站 (lmuai.com)** 的 token 用量、当前余额、缓存命中与总费用，并按模型拆分，支持近 1 天 / 近 7 天 / 近 30 天切换。

插件同时支持两种形态：

- **客户端插件包（静态包）**：装进 DSH profile 后**持久存在**，DSH 重启不丢——推荐方式
- **动态插件**：通过 cordis 工具加载，进程级，重启后需重新加载

所有逻辑移植自 `lingmu_report.py`，并把凭据从写死改为**用户自行配置**，仓库里没有任何写死的凭据。

## 功能

- 🪟 **可拖拽悬浮窗**：拖标题栏移动；松手时**靠近页面边缘（64px 内）自动吸附贴边**，否则自由悬挂在任意位置
- 🔵 **「灵」字悬浮球**：点 `-` 最小化；拖拽悬浮球松手后吸附到最近一侧边缘；点击悬浮球展开回窗口
- 📊 **报表内容**：当前余额 / 请求次数 / 输入 Token / 输出 Token / 缓存命中 / 总费用 / 按模型拆分表（按费用排序）
- ⏱ **时间范围**：近 1 天 / 近 7 天 / 近 30 天
- 🔑 **账号自配置**：窗口内 ⚙ 输入自己的灵眸账号密码（存本机浏览器 localStorage），或使用环境变量 `LM_EMAIL` / `LM_PASSWORD`

## 架构

```
┌────────────── 浏览器 (client) ──────────────┐   ┌────────── DSH host ──────────┐
│ lib/client.js (dsh.client bundle)           │   │ lib/index.js (loader entry)  │
│  悬浮窗 UI (React)                          │   │  ctx.inject(['webServer'])   │
│  localStorage 存凭据                         │   │  /lingmu/report HTTP 路由    │
│  fetch('/lingmu/report', POST) ────────────►│──►│  node fetch → lmuai.com API  │
└─────────────────────────────────────────────┘   └─────────────────────────────┘
```

- **host 半区**（`lib/index.js`）是真实 node 模块：用 node 原生 `fetch` 直连 lmuai.com（登录 → 分页拉取 → 聚合），通过 `ctx.webServer` 注册 `/lingmu/report` 路由
- **client 半区**（`lib/client.js`）是标准客户端 bundle（`window.__ModuleLoader__.load`），注入 `shell.overlay` 座位渲染悬浮窗，同源 `fetch` 调用 host
- 凭据不落地到任何代码/配置文件：浏览器侧存 `localStorage`，host 侧回退进程环境变量

## 安装

### 方式 1：客户端插件包（推荐，持久）

完整步骤见 [INSTALL-dsh.md](./INSTALL-dsh.md)，摘要：

1. 将本包复制到 DSH profile 的 hoisted `node_modules`（如 `%USERPROFILE%\.dsh\profiles\node_modules\lingmu-dsh-plugin`）
2. 在 profile 的 `cordis.patch.yml` 登记 loader entry：

   ```yaml
   - insert:
       - id: lingmu-dsh-plugin
         name: lingmu-dsh-plugin
         config: {}
   ```

3. **重启 DSH**，刷新浏览器，右下角出现「灵」字悬浮球
4. 点 ⚙ 输入灵眸邮箱/密码 → 保存并刷新

> 要求：DSH 客户端扫描器只拾取 `dsh.client.platform: "web"` 的包（本包已声明）。

### 方式 2：动态插件（进程级，重启后需重新加载）

将 `src/host.js` 与 `src/client.js` 的完整内容分别交给 DSH 的 cordis 动态插件工具（`cordis_define` 的 `code.host` / `code.client`），然后用 `cordis_run` 激活。首次运行需在界面批准。

## 配置账号（二选一）

### 方式 A：悬浮窗内配置（推荐，零环境依赖）

1. 悬浮窗标题栏点 **⚙**
2. 输入灵眸的**邮箱 / 账号**和**密码**，点 **保存并刷新**
3. 凭据保存在浏览器 `localStorage`（key: `lingmu.creds.v1`），每次拉取自动带上；DSH 服务重启后依然有效

### 方式 B：环境变量（适合无界面/脚本场景）

为运行 DSH 的进程设置环境变量后重启 DSH：

```
LM_EMAIL=you@example.com
LM_PASSWORD=your-password
```

也可以在浏览器外单独调试聚合脚本：

```
set LM_EMAIL=you@example.com
set LM_PASSWORD=your-password
node lingmu_fetch.js            # 近 1 天
set LM_DAYS=7
node lingmu_fetch.js            # 近 7 天
```

> ⚠️ **安全提示**
> - 凭据不写入任何代码或配置文件（方式 A 存浏览器 localStorage，方式 B 存进程环境）。
> - 插件源码对运行它的 DSH 模型（Agent）是可见的，请使用**余额较低或专用**的账号/密钥，避免泄露高权限凭据。
> - 请勿把真实账号密码提交到 GitHub（仓库里没有任何写死的凭据）。

## 项目结构

```
lingmu-dsh-plugin/
├── lib/
│   ├── index.js          # Host 半区（静态包）：webServer 注册 /lingmu/report，node fetch 直连 lmuai.com
│   └── client.js         # Client 半区（静态包）：__ModuleLoader__.load bundle，悬浮窗 UI + 账号配置 + 拖拽/吸附
├── src/
│   ├── host.js           # Host 半区（动态插件版）：经 ctx.shell 运行内嵌 node 脚本聚合
│   └── client.js         # Client 半区（动态插件版）：同上 UI，走 host.call 桥
├── lingmu_fetch.js       # 独立聚合脚本（调试/无 DSH 场景）
├── package.json          # 客户端插件包声明（dsh.client.platform: web）
├── INSTALL-dsh.md        # DSH 静态包安装指南（含验证/卸载）
├── README.md
└── LICENSE
```

## 工作原理（简述）

- **静态包 host 半区**：真实 node 模块，直接 `fetch` lmuai.com（登录 → 分页拉取 page_size=200 → 汇总输入/输出/缓存 token 与费用，按模型聚合），无需 shell 子进程
- **动态插件 host 半区**：host 沙箱没有 `fetch`/`require` → 经 `ctx.shell`（pwsh）运行 `node -e "<内嵌脚本>"`，天数走环境变量 `LM_DAYS`（PowerShell 5.1 会丢弃多行 `-e` 参数后的位置参数，所以不用 argv）
- 日期按 Asia/Shanghai 计算：近 1 天 = 今天，近 7 天 = 含今天的前 7 个自然日

## 免责声明

本插件为社区开源项目，与灵眸中转站官方无关。使用时请遵守 lmuai.com 的服务条款；因使用本插件产生的任何费用、数据或法律问题由使用者自行承担。

## License

[MIT](./LICENSE)
