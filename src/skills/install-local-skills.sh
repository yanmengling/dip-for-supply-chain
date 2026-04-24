#!/usr/bin/env bash
# 将 src/skills 下的技能挂到 Cursor / Codex / Claude（项目与用户）/ OpenClaw（项目与托管目录）。
# 用法：在仓库根目录执行：bash src/skills/install-local-skills.sh
#
# 环境变量：
#   SKILLS_REPO_ONLY=1   仅写入本仓库内目录，不修改 ~/.claude/skills、~/.openclaw/skills、~/.agents/skills
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
readonly SKILL_NAMES=(demand-fulfillment-capacity-analysis demand-fulfillment-requirement-coverage-analysis)

# 仅移除这两个技能名对应的旧符号链接、目录或文件，避免残留旧版副本。
remove_old_skill_slots() {
  local base="$1"
  [[ -d "$base" ]] || return 0
  for name in "${SKILL_NAMES[@]}"; do
    [[ -e "$base/$name" || -L "$base/$name" ]] || continue
    rm -rf "$base/$name"
  done
}

mkdir -p "$ROOT/.cursor/skills" "$ROOT/.codex/skills" "$ROOT/.claude/skills" "$ROOT/.agents/skills" "$ROOT/.openclaw/skills"

remove_old_skill_slots "$ROOT/.cursor/skills"
remove_old_skill_slots "$ROOT/.codex/skills"
remove_old_skill_slots "$ROOT/.claude/skills"
remove_old_skill_slots "$ROOT/.agents/skills"
remove_old_skill_slots "$ROOT/.openclaw/skills"

for name in "${SKILL_NAMES[@]}"; do
  if [[ ! -d "$ROOT/src/skills/$name" ]]; then
    echo "跳过（目录不存在）: $ROOT/src/skills/$name" >&2
    continue
  fi
  ln -sfn "../../src/skills/$name" "$ROOT/.cursor/skills/$name"
  ln -sfn "../src/skills/$name" "$ROOT/.codex/skills/$name"
  ln -sfn "../../src/skills/$name" "$ROOT/.claude/skills/$name"
  ln -sfn "../../src/skills/$name" "$ROOT/.agents/skills/$name"
  ln -sfn "../../src/skills/$name" "$ROOT/.openclaw/skills/$name"
done

echo "OK 仓库内:"
echo "  Cursor    -> $ROOT/.cursor/skills/{${SKILL_NAMES[0]},${SKILL_NAMES[1]}}"
echo "  Codex     -> $ROOT/.codex/skills/{${SKILL_NAMES[0]},${SKILL_NAMES[1]}}"
echo "  Claude    -> $ROOT/.claude/skills/{${SKILL_NAMES[0]},${SKILL_NAMES[1]}} (本项目)"
echo "  OpenClaw  -> $ROOT/.agents/skills + $ROOT/.openclaw/skills (本项目)"

if [[ "${SKILLS_REPO_ONLY:-}" != "1" ]]; then
  mkdir -p "$HOME/.claude/skills" "$HOME/.openclaw/skills" "$HOME/.agents/skills"
  remove_old_skill_slots "$HOME/.claude/skills"
  remove_old_skill_slots "$HOME/.openclaw/skills"
  remove_old_skill_slots "$HOME/.agents/skills"
  for name in "${SKILL_NAMES[@]}"; do
    if [[ ! -d "$ROOT/src/skills/$name" ]]; then
      continue
    fi
    ln -sfn "$ROOT/src/skills/$name" "$HOME/.claude/skills/$name"
    ln -sfn "$ROOT/src/skills/$name" "$HOME/.openclaw/skills/$name"
    ln -sfn "$ROOT/src/skills/$name" "$HOME/.agents/skills/$name"
  done
  echo "OK 用户目录（符号链接指向本仓库 src/skills）:"
  echo "  Claude Code / Claude  CLI 常用 -> ~/.claude/skills/"
  echo "  OpenClaw 托管技能              -> ~/.openclaw/skills/"
  echo "  OpenClaw / Agent 个人技能     -> ~/.agents/skills/"
  echo "（若只希望本仓库生效，请使用 SKILLS_REPO_ONLY=1 bash src/skills/install-local-skills.sh）"
else
  echo "已跳过用户目录（SKILLS_REPO_ONLY=1）"
fi
