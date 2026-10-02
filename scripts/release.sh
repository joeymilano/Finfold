#!/usr/bin/env bash
set -euo pipefail
# 用法: ./scripts/release.sh [patch|minor|prerelease|<版本>]  默认 prerelease
#
# 流程：校验 CHANGELOG 已填写 → bump 版本 → 把 CHANGELOG 的 [Unreleased] 归档到
# 新版本号下 → 提交 + 打 tag → push → 创建 GitHub Release（prerelease 版本号
# 带 "-" 时自动标记为 pre-release）。不会自动 npm run deploy——部署前应先看一眼
# 构建结果。
#
# GitHub CLI (gh) 默认按 git remote 判断仓库；这个项目的历史遗留问题是本地还
# 关联着另一个不相关的 "origin" remote，所以这里显式写死推送目标，避免推错仓库。
REMOTE="${RELEASE_REMOTE:-finfold-app}"
GH_REPO="${RELEASE_GH_REPO:-joeymilano/finfold-app}"
BUMP="${1:-prerelease}"

[ -z "$(git status --porcelain)" ] || { echo "工作区不干净，先提交"; exit 1; }

# Release gate: never version/tag/push a build that has not passed the same
# checks used during development. These run before package.json or CHANGELOG
# is mutated, so a failure leaves the repository untouched.
npm run lint
npm run typecheck
npm test
npm run build:cf
npm run worker:size
npm run audit:prod
npm run security:check

# The release path is intentionally blocked unless an isolated staging Worker,
# two dedicated test accounts, and Chromium are configured. This suite mutates
# data and refuses to target finfold.app or any of its subdomains.
npm run e2e:staging

# Release gate: 迁移文件声明的表/列必须已在生产库应用。
# 2026-07-21 事故：迁移 035 从未在生产执行导致 7 天内容计划全挂、
# kit_outputs 缺 updated_at 导致编辑保存 100% 失败——typecheck/测试都拦不住，
# 只有对生产库做探针能拦住。失败即 exit，此时仓库尚未被 bump/提交修改。
npm run db:check

if ! grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  echo "CHANGELOG.md 缺少 [Unreleased] 段落"; exit 1
fi

UNRELEASED_BODY="$(awk '/^## \[Unreleased\]/{flag=1;next}/^## \[/{flag=0}flag' CHANGELOG.md | sed '/^[[:space:]]*$/d')"
if [ -z "$UNRELEASED_BODY" ]; then
  echo "CHANGELOG.md 的 [Unreleased] 段落是空的，先写好本次改动再发布"; exit 1
fi

npm version "$BUMP" --preid=beta --no-git-tag-version --silent
NEW_VERSION="$(node -p "require('./package.json').version")"
TODAY="$(date +%Y-%m-%d)"

awk -v ver="$NEW_VERSION" -v date="$TODAY" '
  /^## \[Unreleased\]/ { print; print ""; print "## [" ver "] - " date; next }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

git add package.json package-lock.json CHANGELOG.md
git commit -m "release: v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push "$REMOTE" HEAD
git push "$REMOTE" "v$NEW_VERSION"

NOTES="$(awk -v ver="$NEW_VERSION" '
  $0 ~ "^## \\[" ver "\\]" { flag=1; next }
  /^## \[/ { flag=0 }
  flag
' CHANGELOG.md)"

RELEASE_FLAGS=(--repo "$GH_REPO" --title "v$NEW_VERSION" --notes "$NOTES")
if [[ "$NEW_VERSION" == *-* ]]; then
  RELEASE_FLAGS+=(--prerelease)
fi

gh release create "v$NEW_VERSION" "${RELEASE_FLAGS[@]}"

echo "已发布 v$NEW_VERSION：提交 + tag + push + GitHub Release 均已完成。"
echo "部署请运行: npm run deploy"
