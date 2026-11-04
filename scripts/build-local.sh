#!/usr/bin/env bash
# 本地构建脚本：临时禁用字体，构建完后恢复
set -e
FONT_CONFIG="src/config/fontConfig.ts"

# 禁用字体
sed -i 's/enable: true,/enable: false,/' "$FONT_CONFIG"

# 构建
pnpm build

# 恢复字体
sed -i 's/enable: false,/enable: true,/' "$FONT_CONFIG"

echo "Done. Fonts re-enabled."
