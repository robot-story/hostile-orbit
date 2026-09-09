#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch via a worktree outside Dropbox, verifying the file set first.
set -e
ROOT="/c/Users/studi/Dropbox/HOSTILE ORBIT"; P="/c/Users/studi/.hostile-orbit/pages"
cd "$ROOT"
if [ "$1" != "--no-build" ]; then npx vite build; fi
[ -f dist/index.html ] || { echo "dist/index.html missing"; exit 1; }
rm -rf "$P"; git worktree prune; git fetch -q origin gh-pages || true
git worktree add -q -f "$P" gh-pages
cd "$P" && git rm -rq . >/dev/null 2>&1 || true
cp -r "$ROOT/dist/." "$P/" && touch .nojekyll
git add -A && git -c user.name=robot-story -c user.email=jwhotton@gmail.com commit -qm "deploy $(date -u +%Y-%m-%dT%H:%MZ)" || true
N=$(git ls-files | wc -l); echo "files: $N"; [ "$N" -gt 100 ] || { echo "too few files, aborting push"; exit 1; }
git push -q origin gh-pages
echo "pushed gh-pages"
