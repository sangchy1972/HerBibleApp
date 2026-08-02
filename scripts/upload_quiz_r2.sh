#!/usr/bin/env bash
# Upload the quiz question banks to R2 (covers.everlandapps.com/v1/quiz).
#
# The app ships WITHOUT questions: QuizContext fetches the bank for the user's
# language on first open and caches it. Until these 7 files are live the home
# card hides itself entirely — that is the designed behaviour, so a failed
# upload looks like "the feature isn't there", not like an error.
#
# Filenames MUST be quiz-<lang>.json for every lang in QUIZ_LANGS
# (src/constants/bibleQuiz.ts) — that constant builds the URL, so a mismatch is
# a silent 404 in exactly one language.
#
# Prerequisites (one-time, in any terminal):
#   npx --yes wrangler login
#
# Usage:
#   scripts/upload_quiz_r2.sh [SRC_DIR]
#   (SRC_DIR defaults to docs/quiz-bank in this repo)
#
# Idempotent: re-running overwrites the same keys. Bump the /v1/ segment (here
# AND in QUIZ_CDN_BASE) on a re-cut of the bank to cache-bust.
#
# ⚠️ Content edits also need QUIZ_BANK_VERSION bumped in src/constants/bibleQuiz.ts,
# or an in-flight session grades answers against questions the user never saw.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="herbible-plans-7languages"          # custom domain: covers.everlandapps.com
PREFIX="v1/quiz"
SRC="${1:-${REPO}/docs/quiz-bank}"

# Resolve a usable wrangler: $WRANGLER env override → on PATH → npx fallback.
if [ -n "${WRANGLER:-}" ] && [ -x "${WRANGLER}" ]; then WR=( "$WRANGLER" )
elif command -v wrangler >/dev/null 2>&1; then WR=( wrangler )
else WR=( npx --yes wrangler ); fi
echo "Using wrangler: ${WR[*]}"

[ -d "$SRC" ] || { echo "source dir not found: $SRC"; exit 1; }

# Languages come from the app constant, not a list typed twice.
LANGS="$(node -e '
  const s=require("fs").readFileSync("'"$REPO"'/src/constants/bibleQuiz.ts","utf8");
  const m=s.match(/QUIZ_LANGS[^=]*=\s*\[([^\]]+)\]/);
  if(!m){process.stderr.write("could not read QUIZ_LANGS\n");process.exit(1);}
  const out=[...m[1].matchAll(/'"'"'([^'"'"']+)'"'"'/g)].map(x=>x[1]);
  process.stdout.write(out.join("\n"));
')"

missing=0; uploaded=0
while IFS= read -r lang; do
  f="quiz-${lang}.json"
  p="${SRC}/${f}"
  if [ ! -f "$p" ]; then
    echo "!!! MISSING: ${f}  (not found in ${SRC})"
    missing=$((missing+1)); continue
  fi
  # Validate BEFORE upload. A malformed bank parses to null in the app and the
  # card silently disappears for that language only — the hardest failure to
  # notice, so it gets caught here instead.
  node -e '
    const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const qs=Array.isArray(b)?b:b.questions;
    if(!Array.isArray(qs)||qs.length<5) throw new Error("not a question array");
    for(const q of qs){
      if(!q||typeof q.question!=="string"||!q.question) throw new Error("bad question "+q?.id);
      if(!Array.isArray(q.options)||q.options.length<2) throw new Error("bad options "+q?.id);
      if(!Number.isInteger(q.answerIndex)||q.answerIndex<0||q.answerIndex>=q.options.length)
        throw new Error("answerIndex out of range "+q?.id);
    }
    process.stdout.write(String(qs.length));
  ' "$p" > /tmp/quizcount || { echo "!!! INVALID: ${f}"; exit 1; }
  echo ">>> ${f}  ($(cat /tmp/quizcount) questions)"

  "${WR[@]}" r2 object put "${BUCKET}/${PREFIX}/${f}" \
    --file "$p" --content-type "application/json" --remote
  uploaded=$((uploaded+1))
done <<< "$LANGS"

echo
echo "Uploaded ${uploaded} banks. Missing: ${missing}."
echo "Verify:"
echo "  curl -sI https://covers.everlandapps.com/v1/quiz/quiz-en.json"
echo "  curl -s  https://covers.everlandapps.com/v1/quiz/quiz-es.json | head -c 200"
