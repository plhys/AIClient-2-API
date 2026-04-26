#!/bin/bash

# ============================================
# A-Plan 完整包打包脚本
# 生成包含所有依赖的离线部署包
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="/tmp/a-plan-build"
OUTPUT_DIR="$SCRIPT_DIR/dist"

echo "========================================"
echo "  A-Plan 完整包打包工具"
echo "========================================"
echo ""

# 获取版本号
VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
echo "版本号: $VERSION"

# 清理并创建构建目录
rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
mkdir -p "$BUILD_DIR/a-plan" "$OUTPUT_DIR"

# ============================================
# 步骤 1: 复制项目文件
# ============================================
echo "[1/4] 复制项目文件..."
cp -r "$SCRIPT_DIR"/* "$BUILD_DIR/a-plan/" 2>/dev/null || true

# 清理不需要的文件
rm -rf "$BUILD_DIR/a-plan/node_modules"
rm -rf "$BUILD_DIR/a-plan/.git"
rm -rf "$BUILD_DIR/a-plan/dist"
rm -rf "$BUILD_DIR/a-plan/logs"/* 2>/dev/null || true
rm -f "$BUILD_DIR/a-plan/bin/mihomo" 2>/dev/null || true

echo "  ✓ 项目文件已复制"

# ============================================
# 步骤 2: 下载二进制文件
# ============================================
echo "[2/4] 下载二进制文件..."

mkdir -p "$BUILD_DIR/a-plan/bin"
cd "$BUILD_DIR/a-plan/bin"

# 使用代理（如果设置了）
if [ -n "$HTTP_PROXY" ]; then
    echo "  使用代理: $HTTP_PROXY"
fi

# 下载 EasyTier
echo "  下载 EasyTier..."
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    ET_ARCH="x86_64"
else
    ET_ARCH="aarch64"
fi

ET_URL="https://github.com/EasyTier/EasyTier/releases/download/v2.4.5/easytier-linux-${ET_ARCH}-v2.4.5.zip"

if curl -fsSL --connect-timeout 60 "$ET_URL" -o easytier.zip 2>/dev/null || \
   ( [ -n "$HTTP_PROXY" ] && curl -fsSL -x "$HTTP_PROXY" "$ET_URL" -o easytier.zip 2>/dev/null ); then
    unzip -q easytier.zip
    cp easytier-core . 2>/dev/null || true
    cp easytier-web . 2>/dev/null || true
    chmod +x easytier-core easytier-web 2>/dev/null || true
    rm -f easytier.zip
    echo "    ✓ EasyTier 下载完成"
else
    echo "    ⚠ EasyTier 下载失败，请手动下载"
fi

# 下载 TTYD
echo "  下载 TTYD..."
if [ "$ARCH" = "x86_64" ]; then
    TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64"
    if curl -fsSL --connect-timeout 60 "$TTYD_URL" -o ttyd 2>/dev/null || \
       ( [ -n "$HTTP_PROXY" ] && curl -fsSL -x "$HTTP_PROXY" "$TTYD_URL" -o ttyd 2>/dev/null ); then
        chmod +x ttyd
        echo "    ✓ TTYD 下载完成"
    else
        echo "    ⚠ TTYD 下载失败，请手动下载"
    fi
else
    echo "    ⚠ TTYD 请手动下载 (aarch64)"
fi

cd "$SCRIPT_DIR"

# ============================================
# 步骤 3: 安装 Node 依赖
# ============================================
echo "[3/4] 安装 Node.js 依赖..."
cd "$BUILD_DIR/a-plan"
if npm install --omit=dev --no-audit 2>/dev/null; then
    echo "  ✓ Node 依赖安装完成"
else
    echo "  ⚠ Node 依赖安装失败，将在目标机器上安装"
fi

cd "$SCRIPT_DIR"

# ============================================
# 步骤 4: 打包
# ============================================
echo "[4/4] 打包..."

cd "$BUILD_DIR"

# 完整包
PKG_NAME="a-plan-${VERSION}-full-linux-${ARCH}.tar.gz"
tar -czf "$OUTPUT_DIR/$PKG_NAME" a-plan

echo ""
echo "========================================"
echo "  打包完成！"
echo "========================================"
echo ""
echo "输出文件:"
ls -lh "$OUTPUT_DIR/"
echo ""
echo "文件位置: $OUTPUT_DIR/$PKG_NAME"
echo ""
echo "使用方法:"
echo "  1. 上传 $PKG_NAME 到 Gitee Release"
echo "  2. 用户下载后解压: tar -xzf $PKG_NAME"
echo "  3. 进入目录: cd a-plan"
echo "  4. 启动: ./start.sh"
echo ""

# 清理构建目录
rm -rf "$BUILD_DIR"
