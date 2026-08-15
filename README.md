# 灵眸中转站用量报表 (LingMu Usage Report for DeepSeek Harness)

一个用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件：在浏览器里显示**灵眸中转站 (lmuai.com)** 的 token 用量、当前余额、缓存命中与总费用，并按模型拆分，支持近 1 天 / 近 7 天 / 近 30 天切换。

所有逻辑移植自 `lingmu_report.py`，并把凭据从写死改为**用户自行配置**。

## 功能

- 🪟 **可拖拽悬浮窗**：拖标题栏移动；松手时**靠近页面边缘（64px 内）自动吸附贴边**，否则自由悬挂在任意位置
- 🔵 **「灵」字悬浮球**：点 `-` 最小化；拖拽悬浮球松手后吸附到最近一侧边缘；点击悬浮球展开回窗口
- 📊 **报表内容**：当前余额 / 请求次数 / 输入 Token / 输出 Token / 缓存命中 / 总费用 / 按模型拆分表（按费用排序）
- ⏱ **时间范围**：近 1 天 / 近 7 天 / 近 30 天
- 🔑 **账号自配置**：窗口内 ⚙ 输入自己的灵眸账号密码（存本机浏览器），或使用环境变量 `LM_EMAIL` / `LM_PASSWORD`

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

## 安装

### 方式 1：动态插件（推荐，最快）

DSH 动态插件是**进程级**的：服务重启后会丢失，需要重新加载（凭据不受影响，已存浏览器）。

将 `src/host.js` 与 `src/client.js` 的完整内容分别交给 DSH 的 cordis 动态插件工具（`cordis_define` 的 `code.host` / `code.client`），然后用 `cordis_run` 激活。首次运行需在界面批准。

### 方式 2：作为客户端插件包安装（实验性）

本仓库按 DSH 客户端插件包格式声明（`package.json` 中的 `dsh.client` + `exports["./client"]`）。将本包安装到 DSH 部署的 `node_modules` 并在主机组合（cordis）中登记后，`dsh.client` 扫描器可拾取浏览器端 bundle。此路径仍在验证中，正式使用前请以方式 1 为准。

## 项目结构

```
lingmu-dsh-plugin/
├── src/
│   ├── host.js          # Host 半区：调用 lmuai.com API 聚合数据（凭据经环境变量传入）
│   └── client.js        # Client 半区：悬浮窗 UI + 账号配置 + 拖拽/吸附逻辑
├── lingmu_fetch.js      # 独立聚合脚本（调试/无 DSH 场景）
├── package.json         # 客户端插件包声明（dsh.client）
├── README.md
└── LICENSE
```

## 工作原理（简述）

- Host 沙箱没有 `fetch`/`require`，且本部署禁止管道 → 通过 `ctx.shell`（pwsh 执行器）运行 `node -e "<内嵌脚本>"`，天数走环境变量 `LM_DAYS`（PowerShell 5.1 会丢弃多行 `-e` 参数后的位置参数，所以不用 argv）
- 聚合脚本：登录 → 分页拉取（page_size=200）→ 汇总输入/输出/缓存 token 与费用，按模型聚合（与 `lingmu_report.py` 语义一致）
- 日期按 Asia/Shanghai 计算：近 1 天 = 今天，近 7 天 = 含今天的前 7 个自然日

## 免责声明

本插件为社区开源项目，与灵眸中转站官方无关。使用时请遵守 lmuai.com 的服务条款；因使用本插件产生的任何费用、数据或法律问题由使用者自行承担。

## License

[MIT](./LICENSE)
