#!/bin/bash
cd "$(dirname "${BASH_SOURCE[0]}")"  # 切到脚本所在目录

export LC_ALL=C LANG=C
echo "========================================"
echo "  A计划 快速安装启动脚本"
echo "========================================"
echo

node --version > /dev/null 2>&1 || { echo "[错误] 未安装Node.js"; exit 1; }
echo "[成功] Node.js已安装"

npm --version > /dev/null 2>&1 || { echo "[错误] npm不可用"; exit 1; }
echo "[成功] npm已就绪"

# 检测是否已安装依赖，避免重复安装
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" -o -f "pnpm-lock.yaml" ]; then
    echo "[跳过] 依赖已安装，无需重复安装"
else
    echo "[安装] 依赖..."
    (pnpm install || npm install) 2>&1 | head -10
fi

export PORT=${PORT:-3000}
echo "启动服务器 on http://localhost:$PORT"
node src/core/master.js