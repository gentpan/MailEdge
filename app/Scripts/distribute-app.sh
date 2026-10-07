#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_ROOT="${SCRIPT_DIR:h}"
APP_PATH="$APP_ROOT/.build/MailEdge.app"
DIST_DIR="$APP_ROOT/.build/distribution"
NOTARIZE=false

if [[ "${1:-}" == "--notarize" ]]; then
  NOTARIZE=true
elif [[ -n "${1:-}" ]]; then
  echo "用法：$0 [--notarize]" >&2
  exit 2
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  elif [[ -d /Applications/Xcode-beta.app/Contents/Developer ]]; then
    export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
  else
    echo "需要安装完整 Xcode。" >&2
    exit 1
  fi
fi

SIGN_IDENTITY="${MAILEDGE_SIGN_IDENTITY:-}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(
    security find-identity -v -p codesigning \
      | sed -n 's/.*"\(Developer ID Application:[^"]*\)"/\1/p' \
      | head -n 1
  )"
fi

if [[ -z "$SIGN_IDENTITY" ]]; then
  echo "钥匙串中没有可用的 Developer ID Application 证书。" >&2
  exit 1
fi

echo "使用签名：$SIGN_IDENTITY"
MAILEDGE_SIGN_IDENTITY="$SIGN_IDENTITY" "$SCRIPT_DIR/build-app.sh" release

if [[ "${MAILEDGE_UNIVERSAL:-1}" != "0" ]]; then
  echo "构建 Intel x86_64 版本并合并 Universal 2 可执行文件"
  X86_SCRATCH="$APP_ROOT/.build/x86_64"
  xcrun swift build \
    -c release \
    --triple x86_64-apple-macosx15.0 \
    --scratch-path "$X86_SCRATCH"
  X86_BIN_DIR="$(
    xcrun swift build \
      -c release \
      --triple x86_64-apple-macosx15.0 \
      --scratch-path "$X86_SCRATCH" \
      --show-bin-path
  )"
  UNIVERSAL_TEMP="$(mktemp -d /tmp/mailedge-universal.XXXXXX)"
  lipo -create \
    "$APP_PATH/Contents/MacOS/MailEdge" \
    "$X86_BIN_DIR/MailEdge" \
    -output "$UNIVERSAL_TEMP/MailEdge"
  install -m 755 "$UNIVERSAL_TEMP/MailEdge" "$APP_PATH/Contents/MacOS/MailEdge"
  unlink "$UNIVERSAL_TEMP/MailEdge"
  rmdir "$UNIVERSAL_TEMP"
  codesign \
    --force \
    --deep \
    --options runtime \
    --timestamp \
    --entitlements "$APP_ROOT/Resources/MailEdge.entitlements" \
    --sign "$SIGN_IDENTITY" \
    "$APP_PATH"
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -d --verbose=4 "$APP_PATH" 2>&1 \
  | grep -E '^(Identifier|Authority|TeamIdentifier|Runtime Version)='

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
ARCHS="$(lipo -archs "$APP_PATH/Contents/MacOS/MailEdge" | tr ' ' '-')"
BASE_NAME="MailEdge-${VERSION}-macOS-${ARCHS}"
DMG_PATH="$DIST_DIR/${BASE_NAME}.dmg"
ZIP_PATH="$DIST_DIR/${BASE_NAME}.zip"

mkdir -p "$DIST_DIR"
/bin/rm -f -- "$DMG_PATH" "$ZIP_PATH"

ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
hdiutil create \
  -volname "MailEdge" \
  -srcfolder "$APP_PATH" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null
codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"

if $NOTARIZE; then
  if [[ -n "${MAILEDGE_ASC_ISSUER:-}" ]]; then
    ASC_KEY_ID="${MAILEDGE_ASC_KEY_ID:-89QP5JW5JJ}"
    ASC_KEY_PATH="${MAILEDGE_ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8}"
    if [[ ! -f "$ASC_KEY_PATH" ]]; then
      echo "找不到 App Store Connect API 私钥：$ASC_KEY_PATH" >&2
      exit 1
    fi
    echo "提交 Apple Notary Service（App Store Connect API Key: $ASC_KEY_ID）"
    xcrun notarytool submit "$DMG_PATH" \
      --key "$ASC_KEY_PATH" \
      --key-id "$ASC_KEY_ID" \
      --issuer "$MAILEDGE_ASC_ISSUER" \
      --wait
  else
    NOTARY_PROFILE="${MAILEDGE_NOTARY_PROFILE:-GiantAccel}"
    echo "提交 Apple Notary Service（Keychain profile: $NOTARY_PROFILE）"
    xcrun notarytool submit "$DMG_PATH" \
      --keychain-profile "$NOTARY_PROFILE" \
      --wait
  fi
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
fi

echo "$DMG_PATH"
echo "$ZIP_PATH"
