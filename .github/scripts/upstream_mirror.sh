#!/usr/bin/env bash
set -uo pipefail

log() { printf '[upstream-mirror] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

UPSTREAM="${UPSTREAM_REPO:-voidcrew/Voidcrew}"
MIRROR_REPO="${GITHUB_REPOSITORY:-SOLARIUM-Collective/Solarium-Voidcrew}"
BASE_BRANCH="${BASE_BRANCH:-stream_update}"
CATCHUP_ALL="${CATCHUP_ALL:-false}"
WINDOW_HOURS="${WINDOW_HOURS:-2}"
MAX_PER_RUN="${MAX_PER_RUN:-10}"
REMOTE_BASE="origin/${BASE_BRANCH}"

TOKEN="${UPSTREAM_MIRROR_PAT:-${GITHUB_TOKEN:-}}"
[ -n "$TOKEN" ] || die "нет токена (UPSTREAM_MIRROR_PAT или GITHUB_TOKEN)"
export GH_TOKEN="$TOKEN"

case "$WINDOW_HOURS" in ''|*[!0-9]*) WINDOW_HOURS=2 ;; esac
case "$MAX_PER_RUN" in ''|*[!0-9]*) MAX_PER_RUN=10 ;; esac
[ "$MAX_PER_RUN" -ge 1 ] 2>/dev/null || MAX_PER_RUN=10

git config --global user.name  "github-actions[bot]"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "https://github.com/${UPSTREAM}.git"
else
  git remote set-url upstream "https://github.com/${UPSTREAM}.git"
fi
git fetch --no-tags upstream master --quiet || die "не удалось загрузить upstream/master"

git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*' --quiet \
  || die "не удалось загрузить origin"
git rev-parse --verify "${REMOTE_BASE}" >/dev/null 2>&1 \
  || die "ветка '${BASE_BRANCH}' не найдена на origin"

merged_tsv="$(git log upstream/master --merges --grep='^Merge pull request #' \
    --format='%H%x09%ct%x09%cI%x09%s' \
  | awk -F '\t' '{ split($4, a, "#"); split(a[2], b, " "); print $2 "\t" b[1] "\t" $3 "\t" $1 }' \
  | sort -n -k1,1 \
  | awk '{ print $2 "\t" $3 "\t" $4 }'
)"
[ -n "$merged_tsv" ] || { log "в апстриме нет принятых ПРов"; exit 0; }

pr_tsv="$(gh pr list --repo "${MIRROR_REPO}" --state all --limit 2000 --json number,title,headRefName \
  | jq -r '.[] | [.number,.title,.headRefName] | @tsv'
)"
pr_tsv="${pr_tsv:-}"

max_m="$(printf '%s\n' "$pr_tsv" | grep -oP '\(mirror №\K[0-9]+' | sort -n | tail -n1)"
max_m="${max_m:-0}"
log "текущий максимальный mirror номер: ${max_m}"

is_mirrored() {
  local n="$1" pnum ptitle phead
  git rev-parse --verify "refs/tags/mirror/${n}" >/dev/null 2>&1 && return 0
  [ -z "$pr_tsv" ] && return 1
  while IFS=$'\t' read -r pnum ptitle phead; do
    case "$ptitle" in "Upstream #${n} ("*) return 0 ;; esac
    case "$phead"  in "mirror/upstream-${n}") return 0 ;; esac
  done <<< "$pr_tsv"
  return 1
}

merge_or_create_issue() {
  if git merge --no-edit "$2" >/tmp/mirror_merge.log 2>&1; then
    return 0
  fi
  git merge --abort 2>/dev/null || true
  log "КОНФЛИКТ при слиянии upstream #$1"
  gh issue create --repo "$MIRROR_REPO" \
      --title "Конфликт при зеркалировании upstream #$1" \
      --body "Автоматическое слияние принятого ПРа апстрима [voidcrew/Voidcrew#$1]($3) (mirror №$4) упёрлось в конфликт. Нужно разобраться вручную." \
      >/dev/null 2>&1 || true
  return 1
}

ordinal="$max_m"
processed=0
processed_ns=""
now_epoch="$(date +%s)"

is_mirrored_once() {
  case " ${processed_ns} " in *" $1 "*) return 0 ;; esac
  return 1
}

while IFS=$'\t' read -r n merged_at msha; do
  [ -n "$n" ] || continue
  url="https://github.com/${UPSTREAM}/pull/${n}"

  if [ "$CATCHUP_ALL" != "true" ]; then
    merged_epoch="$(date -d "$merged_at" +%s 2>/dev/null || echo 0)"
    if [ "$merged_epoch" -lt $(( now_epoch - WINDOW_HOURS * 3600 )) ]; then
      continue
    fi
  fi

  is_mirrored_once "$n" && { log "ПР #${n} уже зеркалирован в этом прогоне, пропускаю"; continue; }
  is_mirrored "$n" && { log "ПР #${n} уже зеркалирован, пропускаю"; continue; }

  [ -n "$msha" ] || { log "ПР #${n} без merge_commit_sha (rebased?). Требуется ручное зеркалирование, пропускаю"; continue; }

  ordinal=$((ordinal + 1))
  branch="mirror/upstream-${n}"

  if git rev-parse --verify "refs/remotes/origin/${branch}" >/dev/null 2>&1; then
    log "ветка ${branch} уже существует"
  else
    git checkout -B "$branch" "$REMOTE_BASE" --quiet || die "не могу создать ветку ${branch}"
    if ! merge_or_create_issue "$n" "$msha" "$url" "$ordinal"; then
      git checkout -q "${BASE_BRANCH}" 2>/dev/null || git checkout -q master
      continue
    fi
    git push -u origin "refs/heads/${branch}" --quiet || die "не могу запушить ${branch}"
  fi

  existing_pr="$(printf '%s\n' "$pr_tsv" | awk -F '\t' -v b="$branch" '$3==b {print $1; exit}')"
  if [ -z "$existing_pr" ]; then
    body="Автоматическое зеркало ПРа апстрима **voidcrew/Voidcrew#$n** — mirror №$ordinal.

- Источник: $url
- Принят в апстриме: $merged_at
- Порядковый номер присвоен по порядку принятия в апстриме.

ПР содержит только слияние коммитов апстрим-ПРа. Модуляризация и финальная интеграция выполняются отдельно (как в существующих коммитах \`Modularize PR #N\`)."
    gh pr create --repo "$MIRROR_REPO" --base "$BASE_BRANCH" --head "$branch" \
        --title "Upstream #${n} (mirror №${ordinal})" --body "$body" \
      || log "не удалось открыть ПР для #${n}"
  else
    log "ПР для веки ${branch} уже существует (#${existing_pr})"
  fi

  processed_ns="${processed_ns} ${n}"
  git tag "mirror/${n}"
  git push origin "refs/tags/mirror/${n}" --quiet || log "не удалось запушить тег mirror/${n}"

  processed=$((processed + 1))
  log "готово: upstream #${n} -> mirror №${ordinal} (${branch})"
  [ "$processed" -ge "$MAX_PER_RUN" ] && { log "достигнут лимит ${MAX_PER_RUN}, остановка"; break; }
done <<< "$merged_tsv"

git checkout -q "${BASE_BRANCH}" 2>/dev/null || git checkout -q master
git reset --hard -q "$REMOTE_BASE" 2>/dev/null || true

{
  echo "## Итог зеркалирования"
  echo "- Обработано: ${processed} из лимита ${MAX_PER_RUN}"
  echo "- Следующий mirror номер: $((ordinal + 1))"
  echo "- База: ${BASE_BRANCH}"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"