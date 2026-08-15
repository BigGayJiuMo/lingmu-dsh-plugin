# 在 DSH 上安装 lingmu-dsh-plugin（客户端插件包方式，推荐）

> 安装方式：**方式 2 — 客户端插件包（静态包）**
> 持久化安装：包装进 DSH profile 的 hoisted `node_modules`，host 半区在 webServer
> 注册 `/lingmu` HTTP 路由，client 半区作为 `dsh.client` bundle 被扫描器拾取。
> 相比动态插件，**DSH 重启后依然存在**，不需要重新加载。

## 包结构（本仓库 v0.1.1）

- `package.json`：`dsh.client.platform: "web"`（DSH 扫描器只认 `"web"`）；
  `exports["./client"]` → `./lib/client.js`；`main` → `./lib/index.js`。
- `lib/index.js`（host 半区）：真实 node 模块（非动态沙箱），用 node 原生 `fetch`
  直连 lmuai.com，通过 `ctx.inject(['webServer'])` 在 webServer 注册 `/lingmu/report` 路由。
- `lib/client.js`（client 半区）：标准 `window.__ModuleLoader__.load({ id, factory })`
  bundle，`ctx.slots.inject('shell.overlay', ...)` 注入悬浮窗，同源 `fetch('/lingmu/report')`
  调用 host；凭据存浏览器 localStorage（`lingmu.creds.v1`）。
- `src/host.js` / `src/client.js`：保留，仍可用于动态插件方式（方式 1）。

## 安装步骤（一次性）

### 第 1 步：把包装进 DSH profile 的 node_modules

把本仓库（或打包产物）复制到你的 DSH profile 的 hoisted `node_modules`：

```powershell
$src  = "D:\path\to\lingmu-dsh-plugin"   # 改成你的仓库路径
$dest = "$env:USERPROFILE\.dsh\profiles\node_modules\lingmu-dsh-plugin"

Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item $src\package.json, $src\lib, $src\src, $src\README.md, $src\LICENSE `
          -Destination $dest -Recurse -Force
```

装完应看到：

```
%USERPROFILE%\.dsh\profiles\node_modules\lingmu-dsh-plugin\
├── package.json      (platform: web)
├── lib/index.js      (host 半区)
└── lib/client.js     (client bundle)
```

> 注意：如果 DSH 是其它安装方式（非默认 profile），把 `%USERPROFILE%\.dsh\profiles\node_modules`
> 换成对应部署的 hoisted node_modules 目录，且包必须能从 profile 上下文被 `require.resolve` 命中。

### 第 2 步：注册 loader entry

在 profile 的补丁层 `cordis.patch.yml`（默认 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`）
中登记（新增行必须包在 `insert:` 里，与其它行并列）：

```yaml
- insert:
    - id: lingmu-dsh-plugin
      name: lingmu-dsh-plugin
      config: {}
```

### 第 3 步：重启 DSH

**必须重启**（loader entries 与 client-modules 扫描器缓存都在启动时构建）。
重启后浏览器刷新页面，右下角出现「灵」字悬浮球。

### 第 4 步：配置账号

点悬浮球 ⚙ 输入灵眸邮箱/密码 → 保存并刷新。凭据保存在浏览器 localStorage，
DSH 重启后依然有效；也可改用运行 DSH 进程的环境变量 `LM_EMAIL` / `LM_PASSWORD`。

## 验证

- 浏览器开发者工具 → Network：`/lingmu/report` 应返回 JSON 报表（200）。
- 若悬浮球未出现：检查 host 侧 `ctx.webServer` 是否注册了 `/lingmu` 前缀路由
  （404 = 未注册；200 但 `ok:false` = 凭据问题）。

## 卸载

1. 删除 `cordis.patch.yml` 中 lingmu 的 `insert` 块；
2. 删除 `%USERPROFILE%\.dsh\profiles\node_modules\lingmu-dsh-plugin`；
3. 重启 DSH。
