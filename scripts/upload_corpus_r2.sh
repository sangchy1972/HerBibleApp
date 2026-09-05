#!/usr/bin/env bash
# Mirror the pinned pd-text-corpus commit (bibles/ + commentary/) into our own
# R2 bucket, so scripture text is served from verses.everlandapps.com instead
# of jsDelivr.
#
# WHY (owner incident 2026-09-06, build 36 on a mainland-China network): the
# Bible reader and Gospel & Psalm sat empty for minutes — book lists showed
# 0/0, chapters failed with "Aborted" — while plans (Cloudflare-served) loaded
# instantly. cdn.jsdelivr.net is intermittently unreachable in mainland China;
# our own R2 custom domain is not. The client now reads
#   https://verses.everlandapps.com/corpus/<SHORT_COMMIT>/{bibles,commentary}/…
# first and falls back to jsDelivr (constants/corpus.ts + bibleService).
#
# Usage:
#   1. curl -sL -o corpus.tar.gz \
#        https://codeload.github.com/sangchy1972/pd-text-corpus/tar.gz/<FULL_COMMIT>
#      mkdir corpus && tar -xzf corpus.tar.gz -C corpus --strip-components=1
#   2. bash scripts/upload_corpus_r2.sh ./corpus <SHORT_COMMIT e.g. e9df0306>
#
# ~18k files: runs 12-way parallel with a done-list, so re-running RESUMES
# instead of restarting. Path is commit-versioned → immutable, no purges ever
# (CLAUDE.md R2 rule). When CORPUS_COMMIT bumps: extract the new commit, run
# this with the new short hash, then update constants/corpus.ts in the same
# change (the old tree stays for un-updated builds).
#
# ⚠️ wrangler auth: a CLOUDFLARE_API_TOKEN-style env var overrides `wrangler
# login` — unset stale ones. Proxy: export HTTPS_PROXY if api.cloudflare.com
# is unreachable directly.
set -uo pipefail

SRC_DIR="${1:?usage: upload_corpus_r2.sh <extracted-corpus-dir> <short-commit>}"
SHORT="${2:?usage: upload_corpus_r2.sh <extracted-corpus-dir> <short-commit>}"
BUCKET="herbible-verses-7languages"
PREFIX="corpus/${SHORT}"
DONE_LIST="${SRC_DIR}/.upload-done-${SHORT}"

# WRANGLER_BIN env overrides everything — point it at a DIRECT binary
# (node_modules/.bin/wrangler). npx-per-file costs ~8s of startup each; the
# direct binary ~1s, which on 18k files is 3.5 hours versus ~25 minutes.
WRANGLER="${WRANGLER_BIN:-}"
if [ -z "$WRANGLER" ]; then WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"; fi
if [ ! -x "${WRANGLER%% *}" ]; then WRANGLER="$(command -v wrangler || true)"; fi
if [ -z "$WRANGLER" ]; then WRANGLER="npx --yes wrangler"; fi

touch "$DONE_LIST"
cd "$SRC_DIR"
ALL=$(find bibles commentary -type f -name '*.json' | sort)
TODO=$(comm -23 <(echo "$ALL") <(sort "$DONE_LIST"))
TOTAL=$(echo "$ALL" | grep -c . || true)
LEFT=$(echo "$TODO" | grep -c . || true)
echo "corpus files: $TOTAL total, $LEFT to upload → r2://${BUCKET}/${PREFIX}/"
[ "$LEFT" = 0 ] && { echo "nothing to do"; exit 0; }

export BUCKET PREFIX WRANGLER DONE_LIST
echo "$TODO" | xargs -P 12 -n 1 bash -c '
  f="$1"
  if $WRANGLER r2 object put "${BUCKET}/${PREFIX}/${f}" --file "$f" --content-type application/json --remote >/dev/null 2>&1; then
    echo "$f" >> "$DONE_LIST"
    echo "OK   $f"
  else
    echo "FAIL $f"
  fi
' _

FAILS=$(comm -23 <(echo "$ALL") <(sort "$DONE_LIST") | grep -c . || true)
echo "remaining after pass: $FAILS (re-run the same command to retry failures)"
[ "$FAILS" = 0 ] || exit 1
echo "Done. Spot-check:"
echo "  curl -s https://verses.everlandapps.com/${PREFIX}/bibles/en/index.json | head -c 120"
