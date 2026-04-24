# Skills In Repository

可供下载安装部署的技能目录（仓库内维护）。

## 一键安装（推荐）

在**仓库根目录**执行：

```bash
bash src/skills/install-local-skills.sh
```

会为以下路径创建**指向 `src/skills/...` 的符号链接**（随仓库更新而始终最新）：

| 工具 | 路径 | 说明 |
|------|------|------|
| **Cursor** | `.cursor/skills/demand-fulfillment-*` | 项目级 Agent Skills |
| **Codex** | `.codex/skills/demand-fulfillment-*` | 仓库内 `.codex/skills` |
| **Claude** | `.claude/skills/demand-fulfillment-*` | 打开本仓库时 Claude Code 可加载 |
| **OpenClaw** | `.agents/skills/` 与 `.openclaw/skills/` 下同名链接 | 项目内 Agent / OpenClaw 技能目录 |

同时默认写入**用户目录**（便于不打开本仓库时使用同一套技能；链接目标仍为本仓库 `src/skills`，请勿删除或移动仓库路径或需重装）：

| 工具 | 路径 |
|------|------|
| Claude（全局常用） | `~/.claude/skills/demand-fulfillment-*` |
| OpenClaw 托管 | `~/.openclaw/skills/demand-fulfillment-*` |
| OpenClaw / 个人 Agent | `~/.agents/skills/demand-fulfillment-*` |

**仅本仓库、不碰家目录**时：

```bash
SKILLS_REPO_ONLY=1 bash src/skills/install-local-skills.sh
```

### 验证

- **Cursor**：重载窗口后，对话中提到「可售能力」「新需求满足」「需求承接」等应能匹配技能 `description`。
- **Codex**：确认已加载本仓库及技能扫描路径。
- **Claude Code**：在本项目下新开会话，或确认 `~/.claude/skills` 已指向本仓库技能。
- **OpenClaw**：新开会话或等待技能监视刷新；可用 `openclaw doctor` / `openclaw skills list`（若已安装 CLI）查看技能状态。项目内以 `<本仓库>/.agents/skills` 与 `<本仓库>/.openclaw/skills` 为准（脚本会同时维护两处）。

### 运行脚本自检（可选）

进入任一 skill 目录后：

```bash
cd src/skills/demand-fulfillment-capacity-analysis && bash scripts/test_skill.sh
cd ../demand-fulfillment-requirement-coverage-analysis && bash scripts/test_skill.sh
```

## 手动符号链接（与脚本等价片段）

```bash
# 仓库根目录下
for name in demand-fulfillment-capacity-analysis demand-fulfillment-requirement-coverage-analysis; do
  mkdir -p .cursor/skills; ln -sfn "../../src/skills/$name" ".cursor/skills/$name"
  mkdir -p .codex/skills;  ln -sfn "../src/skills/$name" ".codex/skills/$name"
  mkdir -p .claude/skills; ln -sfn "../../src/skills/$name" ".claude/skills/$name"
  mkdir -p .agents/skills; ln -sfn "../../src/skills/$name" ".agents/skills/$name"
  mkdir -p .openclaw/skills; ln -sfn "../../src/skills/$name" ".openclaw/skills/$name"
done
```

## 当前技能

1. `demand-fulfillment-capacity-analysis`
   - 需求承接之产品可售能力分析
   - 输入：单产品 + BOM 物料明细
   - 输出：可售能力结果 JSON + Markdown/PDF 报告

2. `demand-fulfillment-requirement-coverage-analysis`
   - 需求承接之新需求满足分析
   - 输入：多需求 + 分层物料明细
   - 输出：需求满足结果 JSON + Markdown/PDF 报告
