# OpenClaw 安装与使用指南

本文档面向在 **OpenClaw** 中安装并使用本 Skill 的用户，涵盖构建部署、代理配置、Skill 注册及日常使用。

---

## 必读：部署前提

**仅提供静态页面不够，Skill 无法可用。** 必须同时满足：

1. **静态资源**：能访问到 `.../kn-visualization-skill/index.html`（返回 200）。
2. **API 反向代理**：同一站点必须把以下三条路径反向代理到 DIP（如 `https://dip.aishu.cn`），否则列表与数据请求会失败：
   - `/api/ontology-manager` → DIP
   - `/api/ontology-query` → DIP
   - `/api/bkn-backend` → DIP

**接口状态快速判定**：

| 状态码 | 含义 | 处理方向 |
|--------|------|----------|
| **200** | 正常返回数据 | 无需处理 |
| **401** | 鉴权问题 | 检查 Token、Authorization 头是否透传 |
| **404** | 代理未配置或路径错误 | 按本文档第二节配置 `/api/*` 反代 |
| **501** | 当前服务不支持 POST（多为纯静态） | 同上，必须上反代，不能只用静态服务 |

---

## 一、构建与部署前端

1. **同步源码（若主项目有变更）**
   ```bash
   cd packages/kn-visualization-skill
   npm run sync
   ```

2. **构建**
   ```bash
   npm run build
   ```
   产物在 `dist/`（`index.html` + `assets/*`）。

3. **部署到静态服务**
   - 将 `dist/` 下全部文件部署到任意静态服务器或 CDN。
   - 必须使用 **base 路径** `/kn-visualization-skill/`（与 `vite.config.ts` 中 `base` 一致）。
   - 得到入口 URL，例如：`https://your-domain.com/kn-visualization-skill/index.html`

4. **首次加载时的配置（服务器地址、Token、知识网络 ID）**
   - **方式一**：宿主在 iframe 加载前设置 `window.__SKILL_CONFIG__`（见 [SKILL.md](./SKILL.md)），可包含 `businessDomain`（默认 `bd_public`），请求会带 `X-Business-Domain` 头。
   - **方式二**：打开时带 URL 参数，例如  
     `index.html?ontologyManagerBaseUrl=https://...&defaultKnId=supplychain_hd0202&token=xxx`。
   - **方式三**：若未注入且无 URL 参数，页面会显示「首次使用：配置连接」表单，填写**服务器地址**（如 `https://dip.aishu.cn`，仅填根地址即可，程序会自动拼接 `/api/ontology-manager/v1` 与 `/api/ontology-query/v1`）、Token，再选择默认知识网络后保存到本地，下次同源访问自动使用。列表会从同主机 `/api/bkn-backend/v1/knowledge-networks` 拉取，并自动带 `X-Business-Domain: bd_public`。
   - 前端请求会发往配置中的 ontology / bkn-backend 地址，需在部署域或网关上配置反向代理与鉴权（或使用上述 Token）。

## 二、配置 API 代理（嵌入 OpenClaw 时必做）

当 Skill 在 OpenClaw 中打开时，页面来源（如 `http://127.0.0.1:39123`）与 DIP（如 `https://dip.aishu.cn`）不同源，浏览器会因 **CORS** 禁止直接请求 DIP。本 Skill 已做**同源改写**：检测到配置的 API 与当前页不同源时，会自动改为向当前页同源路径发请求。因此 **OpenClaw 或提供页面的服务必须** 将以下路径代理到 DIP，否则会出现 CORS 报错或 404：

| 本地路径 | 代理目标 |
|----------|----------|
| `/api/ontology-manager` | `https://dip.aishu.cn/api/ontology-manager` |
| `/api/ontology-query` | `https://dip.aishu.cn/api/ontology-query` |
| `/api/bkn-backend` | `https://dip.aishu.cn/api/bkn-backend` |

- 代理层需**透传以下请求头**：`Authorization`、`X-Business-Domain`（如 `bd_public`）；若保留 POST 降级策略，还需透传 `X-HTTP-Method-Override`。
- 配置好代理后，用户照常填写「服务器地址」为 `https://dip.aishu.cn` 并保存，Skill 会在运行时自动使用同源路径，由代理转发到 DIP。

### 反代配置示例（Nginx / Caddy）

以下为可直接粘贴的配置片段，适用于提供页面来源（如 `http://127.0.0.1:39123`）的同一台服务。将 `/api/*` 代理到 `https://dip.aishu.cn` 并透传鉴权与业务域头。

**Nginx**（放在 `server { ... }` 内，与静态根 location 同级）：

```nginx
location /api/ontology-manager/ {
  proxy_pass https://dip.aishu.cn/api/ontology-manager/;
  proxy_http_version 1.1;
  proxy_set_header Host dip.aishu.cn;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
  proxy_set_header X-Business-Domain $http_x_business_domain;
  proxy_set_header X-HTTP-Method-Override $http_x_http_method_override;
  proxy_ssl_server_name on;
}
location /api/ontology-query/ {
  proxy_pass https://dip.aishu.cn/api/ontology-query/;
  proxy_http_version 1.1;
  proxy_set_header Host dip.aishu.cn;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
  proxy_set_header X-Business-Domain $http_x_business_domain;
  proxy_set_header X-HTTP-Method-Override $http_x_http_method_override;
  proxy_ssl_server_name on;
}
location /api/bkn-backend/ {
  proxy_pass https://dip.aishu.cn/api/bkn-backend/;
  proxy_http_version 1.1;
  proxy_set_header Host dip.aishu.cn;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
  proxy_set_header X-Business-Domain $http_x_business_domain;
  proxy_set_header X-HTTP-Method-Override $http_x_http_method_override;
  proxy_ssl_server_name on;
}
```

**Caddy**（Caddyfile，与提供静态的 `handle` 同级或放在同一 `server` 下）：

```caddy
handle /api/ontology-manager* {
  reverse_proxy https://dip.aishu.cn {
    header_up Host dip.aishu.cn
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
    header_up Authorization {http.request.header.Authorization}
    header_up X-Business-Domain {http.request.header.X-Business-Domain}
    header_up X-HTTP-Method-Override {http.request.header.X-HTTP-Method-Override}
  }
}
handle /api/ontology-query* {
  reverse_proxy https://dip.aishu.cn {
    header_up Host dip.aishu.cn
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
    header_up Authorization {http.request.header.Authorization}
    header_up X-Business-Domain {http.request.header.X-Business-Domain}
    header_up X-HTTP-Method-Override {http.request.header.X-HTTP-Method-Override}
  }
}
handle /api/bkn-backend* {
  reverse_proxy https://dip.aishu.cn {
    header_up Host dip.aishu.cn
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
    header_up Authorization {http.request.header.Authorization}
    header_up X-Business-Domain {http.request.header.X-Business-Domain}
    header_up X-HTTP-Method-Override {http.request.header.X-HTTP-Method-Override}
  }
}
```

配置生效后，`http://127.0.0.1:39123/api/bkn-backend/v1/knowledge-networks?limit=1` 等请求会由代理转发到 DIP，Skill 内「加载知识网络列表」即可正常返回数据。

### 部署后一键自检（可复制命令）

部署完成后，在终端执行以下命令（将 `<host>` 换成实际地址，如 `127.0.0.1` 或本机域名）：

**1）静态页是否可达（应 200）**
```bash
curl -s -o /dev/null -w "%{http_code}" http://<host>:39123/kn-visualization-skill/index.html
```
期望输出：`200`

**2）API 代理是否打通（未带 Token 时应 401，说明请求已到 DIP）**
```bash
curl -s -o /dev/null -w "%{http_code}" "http://<host>:39123/api/bkn-backend/v1/knowledge-networks?limit=1"
```
期望输出：`401`（表示代理通、DIP 返回鉴权错误；若为 404 则代理未配好）

**3）带 Token 验证能否返回数据**
```bash
curl -s -w "\n%{http_code}" -H "Authorization: Bearer YOUR_TOKEN" -H "X-Business-Domain: bd_public" "http://<host>:39123/api/bkn-backend/v1/knowledge-networks?limit=1"
```
将 `YOUR_TOKEN` 替换为有效 Token。期望：HTTP 200，且响应体为 JSON（含 `entries` 等）。

---

## 三、在 OpenClaw 中“安装”本 Skill

OpenClaw 通过**扫描含 `SKILL.md` 的文件夹**发现 Skill。本包已包含符合规范的 `SKILL.md`（含 name、description 等 frontmatter），只需让 OpenClaw 能读到该文件夹即可。

### 方式 A：拷贝到 OpenClaw 托管目录（推荐）

1. 将**整个** `packages/kn-visualization-skill` 文件夹复制到 OpenClaw 的托管 Skills 目录：
   ```bash
   cp -r packages/kn-visualization-skill ~/.openclaw/skills/kn-visualization-skill
   ```
   或复制到工作区 Skills 目录（仅当前工作区生效）：
   ```bash
   cp -r packages/kn-visualization-skill /path/to/your/openclaw-workspace/skills/kn-visualization-skill
   ```

2. （可选）在 `~/.openclaw/openclaw.json` 中启用并注入配置（**推荐统一模板**）：
   ```json5
   {
     skills: {
       entries: {
         "kn-visualization-skill": {
           enabled: true,
           config: {
             entryUrl: "http://YOUR_HOST:39123/kn-visualization-skill/index.html",
           },
         },
       },
     },
   }
   ```
   - `entryUrl` 填**本机可访问的完整入口地址**，供 iframe/新窗口打开。建议使用**域名或机器名**（如 `http://myhost.local:39123/...`），避免写死 `192.168.x.x`，以便多终端、多环境共用同一配置。
   - 将 `YOUR_HOST` 替换为实际主机名或域名（如 `127.0.0.1` 仅本机，或 `openclaw.example.com` 供局域网访问）。

3. 若已开启 Skills 监视器（默认开启），新 Skill 会在下一轮会话被识别；也可重启 OpenClaw 使配置生效。

### 方式 B：通过 extraDirs 直接引用仓库内包

不拷贝，让 OpenClaw 直接扫描本仓库下的包目录：

1. 在 `~/.openclaw/openclaw.json` 中配置额外 Skills 目录：
   ```json5
   {
     skills: {
       load: {
         extraDirs: ["/absolute/path/to/SupplyChainBrain/packages/kn-visualization-skill"],
         watch: true,
         watchDebounceMs: 250,
       },
     },
   }
   ```
   将 `/absolute/path/to/SupplyChainBrain` 替换为你的仓库实际路径。

2. OpenClaw 会扫描该目录下的 `SKILL.md` 并注册为 Skill。若需指定前端入口 URL，同样可在 `skills.entries["kn-visualization-skill"]` 中设置 `config.entryUrl`。

### 方式 C：通过 ClawHub 安装（若已发布到 ClawHub）

若本 Skill 已发布到 [ClawHub](https://clawhub.com)，可在工作区执行：

```bash
 npx clawhub@latest install kn-visualization-skill
```

安装后仍需将**前端入口 URL** 配置到实际部署地址（若 ClawHub 上的包未包含你的部署域名）。

## 四、验证

- 在 OpenClaw 中列出已安装 Skills，确认出现 `kn-visualization-skill`（例如通过 OpenClaw 文档中提供的 list 命令或 UI）。
- 当用户询问「打开知识网络」「查看某对象数据」等时，Agent 应能根据 `SKILL.md` 的 name/description 选择本 Skill，并按你配置的 `entryUrl` 在 iframe 或新窗口中打开前端。
- 若使用首次配置表单：填写服务器地址与 Token 后点击「加载知识网络列表」，应能拉取到列表（请求会带 `X-Business-Domain: bd_public`）；若服务端要求其它业务域，宿主注入时需设置 `businessDomain`。

## 五、使用说明（最终用户）

- **首次打开**：若未通过宿主注入或 URL 参数提供配置，会显示「首次使用：配置连接」表单。填写服务器地址（如 `https://dip.aishu.cn`）、Token，点击「加载知识网络列表」后选择默认知识网络，再点击「保存并进入」。
- **未获取到列表时**：若后端未提供列表接口或网络异常，可点击「重新加载列表」重试，或直接输入知识网络 ID（如 `supplychain_hd0202`）后「保存并进入」。
- **重新配置**：进入 Skill 后，在顶部点击「重新配置」可清除本地配置并刷新，再次进入首次配置表单以更换服务器地址、Token 或知识网络。
- **暂无知识网络 / 加载失败**：若主界面显示「暂无知识网络」或「加载失败」，页面会提供「重新配置」链接，点击即可回到首次配置状态。

## 六、平台级启动说明

很多人会卡在“服务没起来”。以下为常见环境的启动方式示例，便于开机自启或统一部署。

### macOS：LaunchAgent 示例

将静态目录与（可选）Nginx/Caddy 通过 LaunchAgent 拉起。示例仅启动静态服务（若 API 反代由同一 Nginx 提供，需在 Nginx 配置中写好反代并令 Nginx 由 LaunchAgent 启动）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>openclaw-skill-static</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>-m</string>
    <string>http.server</string>
    <string>39123</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/你/openclaw/skill-static</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
```
保存为 `~/Library/LaunchAgents/openclaw-skill-static.plist`，执行 `launchctl load ~/Library/LaunchAgents/openclaw-skill-static.plist`。**注意**：仅 Python 静态服务时 `/api/*` 会 404，必须配合 Nginx/Caddy 反代（见第二节）或使用下面 Docker 方式。

### Linux：systemd service 示例

```ini
[Unit]
Description=OpenClaw Skill 静态+反代
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/openclaw/skill-static
ExecStart=/usr/bin/python3 -m http.server 39123
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
保存为 `/etc/systemd/system/openclaw-skill-static.service`。若反代由 Nginx 提供，则改为启动 Nginx 或使用下方 Docker 一体方式。

### Docker：最小 compose（静态 + 反代一体）

使用 Nginx 同时提供静态与反代，一次启动即可：

```yaml
version: "3"
services:
  skill:
    image: nginx:alpine
    ports:
      - "39123:80"
    volumes:
      - ./skill-static:/usr/share/nginx/html:ro
      - ./nginx-skill.conf:/etc/nginx/conf.d/skill.conf:ro
```

`nginx-skill.conf` 示例（放在同一目录，仅保留与 Skill 相关部分）：

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location /kn-visualization-skill/ {
    try_files $uri $uri/ /kn-visualization-skill/index.html;
  }
  location /api/ontology-manager/ {
    proxy_pass https://dip.aishu.cn/api/ontology-manager/;
    proxy_http_version 1.1;
    proxy_set_header Host dip.aishu.cn;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Business-Domain $http_x_business_domain;
    proxy_ssl_server_name on;
  }
  location /api/ontology-query/ {
    proxy_pass https://dip.aishu.cn/api/ontology-query/;
    proxy_http_version 1.1;
    proxy_set_header Host dip.aishu.cn;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Business-Domain $http_x_business_domain;
    proxy_ssl_server_name on;
  }
  location /api/bkn-backend/ {
    proxy_pass https://dip.aishu.cn/api/bkn-backend/;
    proxy_http_version 1.1;
    proxy_set_header Host dip.aishu.cn;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Business-Domain $http_x_business_domain;
    proxy_ssl_server_name on;
  }
}
```

将构建好的 `dist/` 内容放到 `./skill-static/kn-visualization-skill/` 下，执行 `docker compose up -d`。

## 七、排障与后续优化建议

- **404/501 时**：前端会提示「检测到未配置 API 代理，请参考 DEPLOY-OPENCLAW.md 第二节」并展示三条需代理路径（可复制），便于部署方对照本文档配置代理。
- **501 Unsupported method**：若代理或网关不支持 POST，会提示「代理/网关不支持此方法（POST）…」；列表接口优先使用 GET，仅在后端要求时使用 POST 降级。
- **可选体验优化**：可增加「连接诊断」按钮，依次探测三条 API 路径与鉴权，结果可复制给运维排障。

## 八、安全说明

- **Token 存储方式**：首次配置时可选「仅本次会话有效，不记住 Token」（**默认勾选**）。勾选时 Token 仅存于 sessionStorage，关闭页面或标签页后即失效，适合公用设备。取消勾选则写入 localStorage，同源下次免填，**仅建议在受信设备使用**；公用设备用毕可点击「重新配置」清除。
- **建议**：使用**短时 Token** 或**定期失效**的鉴权方式，降低泄露影响范围。
- **推荐**：若宿主（如 OpenClaw）支持，优先通过 **宿主注入 Token**（`window.__SKILL_CONFIG__.getToken`），由宿主统一管理鉴权与刷新，Token 不落前端。
- **方案二 OAuth2**：首次配置页可填写 **OAuth2 客户端 ID** 后使用「使用 DIP 账号登录（OAuth2）」；或由宿主注入 `oauth2ClientId`、可选 `oauth2BackendCodeExchangeUrl`（同源后端接收 code 换 token，Token 不落前端）。详见 [docs/鉴权与Token存储方案.md](./docs/鉴权与Token存储方案.md)。

## 九、参考

- OpenClaw Skills 说明：[https://docs.openclaw.ai/zh-CN/tools/skills](https://docs.openclaw.ai/zh-CN/tools/skills)
- OpenClaw Skills 配置：[https://docs.openclaw.ai/zh-CN/tools/skills-config](https://docs.openclaw.ai/zh-CN/tools/skills-config)
- 本 Skill 能力与配置项详见 [SKILL.md](./SKILL.md)。
