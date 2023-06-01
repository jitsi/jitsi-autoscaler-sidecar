#!/bin/bash

set -x
set -e

# Make sure you have the following environment variables set, example:
# export DEBFULLNAME="Jitsi Team"
# export DEBEMAIL="dev@jitsi.org"
# You need package devscripts installed (command dch), dh-systemd.

echo "==================================================================="
echo "   Building DEB packages...   "
echo "==================================================================="

SCRIPT_FOLDER=$(dirname "$0")
cd "$SCRIPT_FOLDER/.."

MVNVER=$(jq -r '.version' package.json | cut -d '.' -f 1,2)
TAG_NAME="v${MVNVER}"

echo "Current tag name: $TAG_NAME"

if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1
then
  git tag -a "$TAG_NAME" -m "Tagged automatically by Jenkins"
  git push origin "$TAG_NAME"
else
  echo "Tag: $TAG_NAME already exists."
fi

VERSION_FULL=$(git describe --match "v[0-9\.]*" --long)
echo "Full version: ${VERSION_FULL}"

export VERSION=${VERSION_FULL:1}
echo "Package version: ${VERSION}"

REV=$(git log --pretty=format:'%h' -n 1)
dch -v "$VERSION-1" "Build from git. $REV"
dch -D unstable -r ""

# now build the deb
dpkg-buildpackage -tc -us -uc -A

# clean the current changes as dch had changed the change log
git checkout debian/changelog

echo "Here are the resulting files in $(pwd ..)"
echo "-----"
ls -l ../{*.changes,*.deb,*.buildinfo}
echo "-----"

cd ..
