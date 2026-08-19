#!/usr/bin/env bash
# Clone (or update) every application under test into apps/. Safe to re-run.
set -u
cd "$(dirname "$0")/.."
mkdir -p apps

clone() { # repo dir [branch]
  local repo="$1" dir="apps/$2" branch="${3:-}"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" config core.autocrlf false
    git -C "$dir" submodule update --init --recursive --depth 1 >/dev/null 2>&1
    echo "update $2"
    git -C "$dir" fetch --depth 1 origin ${branch:+"$branch"} >/dev/null 2>&1 \
      && git -C "$dir" reset --hard FETCH_HEAD >/dev/null 2>&1 \
      && echo "  ok" || echo "  FAILED"
  else
    echo "clone  $2"
    if [ -n "$branch" ]; then
      git clone --depth 1 --branch "$branch" "https://github.com/$repo.git" "$dir" >/dev/null 2>&1 \
        && echo "  ok" || echo "  FAILED"
    else
      git clone --depth 1 "https://github.com/$repo.git" "$dir" >/dev/null 2>&1 \
        && echo "  ok" || echo "  FAILED"
    fi
  fi
}

clone javi11/altmount        altmount
clone nzbdav-dev/nzbdav      nzbdav
clone qooode/nzbdavex        nzbdavex
clone infinidysk/infinidysk  infinidysk
clone Gaisberg/streamnzb     streamnzb
clone MunifTanjim/stremthru  stremthru
clone sirrobot01/decypharr   decypharr
clone g0ldyy/comet           comet       feat/usenet
clone Viren070/AIOStreams    aiostreams
