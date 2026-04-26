#!/bin/bash
# A-Plan 5.2.1 启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  A-Plan 5.2.1 轻量化部署包"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "错误: Node.js 版本过低 (需要 18+)"
    exit 1
fi

echo "Node.js 版本: $(node -v)"
echo "启动 A-Plan..."
exec node src/core/master.js "$@"
