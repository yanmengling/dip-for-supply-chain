# 如何测试验证

## 初始化步骤（简要）

无配置时首次打开会走「首次配置」流程，可按下列顺序自检：

1. **出现表单**：清除 localStorage 后打开入口页，应出现「首次使用：配置连接」。
2. **第一步**：填写服务器地址（如 `https://dip.aishu.cn`）、Token → 点击「加载知识网络列表」→ 请求会带 `X-Business-Domain: bd_public`，列表从 bkn-backend 拉取。
3. **第二步**：有列表则下拉选一个知识网络，无列表则手动输入知识网络 ID（如 `supplychain_hd0202`）→ 点击「保存并进入」→ 页面刷新。
4. **进入主界面**：刷新后应直接进入主界面（顶部知识网络选择器 + 图谱/业务数据视图），不再出现配置表单；本地会保存 `kn_visualization_skill_config` 与 `api_auth_token`，下次同源打开自动使用。

**如何再次进入初始化页面**：在主界面顶部右侧点击「**重新配置**」按钮，会清除上述本地配置并刷新页面，即可重新进入「首次使用：配置连接」表单。

---

## 一、本地开发态（npm run dev）

1. **进入子项目并启动开发服务**
   ```bash
   cd packages/kn-visualization-skill
   npm run dev
   ```
   默认会在 **http://localhost:5174/kn-visualization-skill/** 启动（与主项目 5173 错开）；浏览器会自动打开该地址。若端口被占用，终端会提示实际端口。

2. **触发「首次配置」流程**
   - 在浏览器打开终端里打印的地址（一般为 **http://localhost:5174/kn-visualization-skill/**）。
   - 当**无宿主注入**（未设置 `window.__SKILL_CONFIG__`）、**无本地已存配置**、且 **URL 无** `ontologyManagerBaseUrl` 参数时，会先出现「首次使用：配置连接」表单。
   - 若之前已保存过配置，可先清空本地存储再刷新以重新触发表单：
     - 打开开发者工具 → Application → Local Storage / Session Storage → 选中当前域名 → 删除 `kn_visualization_skill_config`、`api_auth_token`（以及 OAuth2 相关键 `kn_skill_oauth2_*` 如有），或直接「Clear all」后刷新。

3. **验证两步配置**
   - **第一步**：填写「服务器地址」（如 `https://dip.aishu.cn`，仅填域名/根地址即可）、「Token」，点击「加载知识网络列表」。
   - **业务域**：请求会自动带 `X-Business-Domain: bd_public`，满足 DIP/网关对业务域的要求；若服务端要求其它值，需通过宿主注入 `businessDomain`。
   - **开发环境**：本地 `vite.config.ts` 已配置到 `dip.aishu.cn` 的代理。当服务器地址为 `dip.aishu.cn` 时，程序会自动改为请求当前域名下的 `/api/ontology-manager/v1`、`/api/ontology-query/v1`、`/api/bkn-backend/v1`，由 Vite 转发到目标环境，从而避免 CORS。保存的仍是原始地址，生产环境不受影响。
   - **列表调试**：开发环境下控制台会输出 `[KN列表]` 日志：每次尝试的接口（bkn-backend GET、ontology-manager GET、POST）、失败时的服务端错误信息、以及「三次均未拿到列表」时的降级提示，便于排查 400 等原因。
   - **第二步**：若接口返回了列表，应出现下拉框；选一个知识网络后点击「保存并进入」。若接口未提供列表，会提示并出现手动输入框，输入知识网络 ID 后「保存并进入」。

4. **验证主界面**
   - 保存并刷新后应进入主界面：顶部有知识网络选择器，下方为图谱 / 业务数据视图。切换「图谱」与「业务数据」、切换不同对象类型 Tab，确认请求与展示正常。

---

## 二、构建后预览（npm run build + preview）

1. **构建**
   ```bash
   cd packages/kn-visualization-skill
   npm run build
   ```
   构建会产出 `dist/`，并包含已打包的 Tailwind 样式（入口为 `src/index.css`）。

2. **预览**
   ```bash
   npm run preview
   ```
   会启动静态预览（通常为 http://localhost:4173），访问路径需带 base：**http://localhost:4173/kn-visualization-skill/**。

3. **验证项**
   - 打开上述 URL，同样可通过清除 localStorage 验证首次配置流程。
   - 确认与 dev 行为一致：配置保存后刷新能直接进入主界面并加载所选知识网络。

---

## 三、带宿主注入的验证（可选）

在主项目或任意宿主页中：

1. 设置 `window.__SKILL_CONFIG__`（服务器地址、getToken、knowledgeNetworks、defaultKnId）。
2. 通过 iframe 或新窗口打开 Skill 的入口 URL（dev 为 http://localhost:5174/kn-visualization-skill/，preview 为 http://localhost:4173/kn-visualization-skill/）。
3. 此时应**不再**出现首次配置表单，直接使用注入的配置进入主界面。

---

## 四、URL 参数验证（可选）

在入口页地址后追加参数后打开（**路径需带 base**），例如：

```
http://localhost:5174/kn-visualization-skill/?ontologyManagerBaseUrl=/api/ontology-manager/v1&ontologyQueryBaseUrl=/api/ontology-query/v1&defaultKnId=supplychain_hd0202&token=YOUR_TOKEN
```

应直接使用参数中的配置进入主界面（不再出现首次配置表单）；若 token 有效，应能正常拉取图谱与数据。

---

## 五、自检清单

| 项 | 说明 |
|----|------|
| 首次无配置 | 清除 localStorage 后刷新，应出现「配置连接」表单。 |
| 第一步提交 | 填写服务器地址 + Token，点击「加载知识网络列表」，应请求接口（带 X-Business-Domain）并进入第二步或提示未获取到列表。 |
| 第二步选择 | 有列表时下拉选择；无列表时手动输入 ID，点击「保存并进入」应刷新并进入主界面。 |
| 保存后刷新 | 再次打开同源入口 URL 应直接进入主界面，不再出现配置表单（已存 localStorage）。 |
| 主界面 | 知识网络选择器、图谱视图、业务数据 Tab 与对象类型 Tab 正常切换与展示。 |
| 宿主注入 | 设置 `window.__SKILL_CONFIG__` 后打开入口 URL，应跳过配置表单直接进入主界面。 |
| URL 参数 | 带完整参数打开（路径含 base，如 …/kn-visualization-skill/?...），应跳过配置表单并使用参数配置。 |

---

## 六、OAuth2（方案二）测试验证

流程与 [kweaver-caller](https://github.com/sh00tg0a1/kweaver-caller) 一致：**点击后自动跳转 DIP 授权页 → 用户在 DIP 登录/授权 → DIP 自动重定向回 Skill 并带上 code**，Skill 再用 code 换 token 完成登录。kweaver-caller 在 CLI 侧通过 `/oauth2/clients` 注册客户端并在本机监听回调；本 Skill 在浏览器侧使用**当前页 URL** 作为 `redirect_uri`，由 DIP 登录后自动跳回该页。

### 前置条件

- DIP 提供 OAuth2 端点：`/oauth2/auth`、`/oauth2/token`，且支持 **PKCE**（`code_challenge_method=S256`）。
- DIP 已将 **Skill 当前页完整 URL** 登记为合法 `redirect_uri`（如 `http://localhost:5174/kn-visualization-skill/` 或部署后的入口 URL）。
- 已有一个可用的 **OAuth2 客户端 ID**（在 DIP 侧注册得到；kweaver-caller 通过 `/oauth2/clients` 动态注册，Web Skill 通常使用预先登记好的 client_id）。

### 验证步骤（自动跳转流程）

1. **进入首次配置页**
   - 打开 **http://localhost:5174/kn-visualization-skill/**；若已有配置则点击主界面「重新配置」，或于 DevTools → Application → Local Storage / Session Storage 中删除 `kn_visualization_skill_config`、`api_auth_token` 后刷新，应出现「首次使用：配置连接」表单。

2. **填写并点击「使用 DIP 账号登录」**
   - 填写「服务器地址」：`https://dip.aishu.cn`。
   - 填写「OAuth2 客户端 ID」（或由宿主注入 `window.__SKILL_CONFIG__.oauth2ClientId`），此时应出现按钮「**使用 DIP 账号登录（OAuth2）**」。
   - 点击该按钮后，**浏览器会自动跳转**到 DIP 授权页，地址形如：  
     `https://dip.aishu.cn/oauth2/auth?client_id=...&redirect_uri=...&response_type=code&state=...&code_challenge=...&code_challenge_method=S256`。

3. **在 DIP 登录后自动跳回**
   - 在 DIP 页完成登录与授权后，DIP 会**自动重定向回** Skill 当前页，地址栏带 `?code=xxx&state=yyy`，无需用户再点返回。

4. **Skill 处理回调并换 Token**
   - 页面会先显示「正在完成登录…」；若 DIP 的 `/oauth2/token` 可访问（开发环境已代理 `/oauth2` 到 DIP），会用 code 换 token，并**自动跳转到干净 URL**（无 `code`/`state`），并保存服务器地址；Token 以「仅本次会话有效」写入 sessionStorage。
   - 若换 token 失败，会显示错误信息及「返回配置页」链接。

5. **进入主界面或第二步**
   - 回调成功后，若尚未选择知识网络，会进入首次配置的**第二步**（选择知识网络），选好后「保存并进入」即进入主界面。

### 开发环境说明

- `npm run dev` 时，`vite.config.ts` 已配置 `/oauth2` → `https://dip.aishu.cn`，前端对 `/oauth2/token` 的请求会走同源代理，避免 CORS。
- 若 DIP 尚未配置 OAuth2 或未将当前 URL 登记为 redirect_uri，可仅验证：**填写 OAuth2 客户端 ID 后出现「使用 DIP 账号登录」按钮、点击后跳转的授权 URL 格式正确**（含 `client_id`、`redirect_uri`、`state`、`code_challenge`、`code_challenge_method=S256`）。

### 可选：模拟回调验证

在浏览器中**手动**打开形如以下地址（将 `CODE`、`STATE` 替换为任意非空字符串，且 `STATE` 需与 sessionStorage 中事先保存的 state 一致，通常需先点一次「使用 DIP 账号登录」再复制地址栏的 state）：

```
http://localhost:5174/kn-visualization-skill/?code=CODE&state=STATE
```

- 若 state 与 sessionStorage 中一致，会尝试用 `code` 请求 `/oauth2/token`，此时多半会因 code 无效而失败，但可确认回调页「正在完成登录…」与错误处理是否正常。
- 若 state 不一致或已过期，应提示「state 无效或已过期，请重新发起登录」。
