#!/bin/bash

# ============================================
# A-Plan 安装脚本 v2.0
# 默认使用本地二进制，无需外部下载
# ============================================

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# 配置
# ============================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
OFFLINE_PACKAGE="a-plan-full.tar.gz"

# 国内镜像配置
USE_CHINA_MIRROR="${USE_CHINA_MIRROR:-true}"
MIRROR_URL="https://gitee.com/JunFengLiangZi/a-plan/releases/download"

# 代理设置（可选）
PROXY_URL="${HTTP_PROXY:-}"

# ============================================
# 获取系统架构
# ============================================
get_arch() {
    local arch=$(uname -m)
    case $arch in
        x86_64|amd64) echo "x86_64" ;;
        arm64|aarch64) echo "aarch64" ;;
        *) echo "unsupported" ;;
    esac
}

# ============================================
# 检查本地二进制是否存在
# ============================================
check_local_binaries() {
    if [ -f "$BIN_DIR/easytier-core" ] && [ -f "$BIN_DIR/ttyd" ]; then
        return 0
    fi
    return 1
}

# ============================================
# 从离线包安装
# ============================================
install_from_offline() {
    local pkg="$SCRIPT_DIR/$OFFLINE_PACKAGE"
    if [ ! -f "$pkg" ]; then
        return 1
    fi
    
    log_info "检测到离线包，正在解压..."
    if tar -xzf "$pkg" -C "$SCRIPT_DIR" 2>/dev/null; then
        if check_local_binaries; then
            log_ok "离线包安装完成"
            return 0
        fi
    fi
    return 1
}

# ============================================
# 下载二进制（带代理支持）
# ============================================
download_binary() {
    local url=$1
    local output=$2
    local max_retry=3
    local retry=0
    
    while [ $retry -lt $max_retry ]; do
        if [ -n "$PROXY_URL" ]; then
            log_info "使用代理下载: $url"
            if curl -fsSL -x "$PROXY_URL" --connect-timeout 30 "$url" -o "$output" 2>/dev/null; then
                return 0
            fi
        else
            if curl -fsSL --connect-timeout 30 "$url" -o "$output" 2>/dev/null; then
                return 0
            fi
        fi
        retry=$((retry + 1))
        log_warn "下载失败，重试 $retry/$max_retry..."
        sleep 2
    done
    return 1
}

# ============================================
# 下载并安装 EasyTier
# ============================================
install_easytier() {
    log_info "安装 EasyTier..."
    
    # 检查是否已存在
    if [ -f "$BIN_DIR/easytier-core" ]; then
        log_ok "EasyTier 已存在，跳过"
        return 0
    fi
    
    mkdir -p "$BIN_DIR"
    local arch=$(get_arch)
    local version="v2.4.5"
    local tmp_zip="/tmp/easytier_$$.zip"
    local url=""
    
    # 优先从国内镜像下载
    if [ "$USE_CHINA_MIRROR" = "true" ]; then
        url="${MIRROR_URL}/${version}/easytier-linux-${arch}-${version}.zip"
        log_info "从国内镜像下载 EasyTier..."
        if download_binary "$url" "$tmp_zip"; then
            log_ok "国内镜像下载成功"
        else
            log_warn "国内镜像失败，尝试 GitHub..."
            url="https://github.com/EasyTier/EasyTier/releases/download/${version}/easytier-linux-${arch}-${version}.zip"
        fi
    else
        url="https://github.com/EasyTier/EasyTier/releases/download/${version}/easytier-linux-${arch}-${version}.zip"
    fi
    
    if [ ! -f "$tmp_zip" ] || [ ! -s "$tmp_zip" ]; then
        log_info "正在下载 EasyTier..."
        if ! download_binary "$url" "$tmp_zip"; then
            rm -f "$tmp_zip"
            log_error "EasyTier 下载失败"
            return 1
        fi
    fi
    
    log_info "解压 EasyTier..."
    if unzip -q "$tmp_zip" -d "/tmp/easytier_$$"; then
        cp "/tmp/easytier_$$/easytier-core" "$BIN_DIR/"
        cp "/tmp/easytier_$$/easytier-web" "$BIN_DIR/" 2>/dev/null || true
        cp "/tmp/easytier_$$/easytier-cli" "$BIN_DIR/" 2>/dev/null || true
        chmod +x "$BIN_DIR"/easytier-*
        rm -rf "$tmp_zip" "/tmp/easytier_$$"
        log_ok "EasyTier 安装完成"
        return 0
    fi
    
    rm -f "$tmp_zip"
    log_error "EasyTier 解压失败"
    return 1
}

# ============================================
# 下载并安装 TTYD
# ============================================
install_ttyd() {
    log_info "安装 TTYD..."
    
    if [ -f "$BIN_DIR/ttyd" ]; then
        log_ok "TTYD 已存在，跳过"
        return 0
    fi
    
    mkdir -p "$BIN_DIR"
    local arch=$(get_arch)
    local version="1.7.7"
    local tmp_file="/tmp/ttyd_$$"
    local url=""
    
    # 优先从国内镜像下载
    if [ "$USE_CHINA_MIRROR" = "true" ]; then
        url="${MIRROR_URL}/v5.1.0/ttyd-${arch}"
        log_info "从国内镜像下载 TTYD..."
        if download_binary "$url" "$tmp_file"; then
            mv "$tmp_file" "$BIN_DIR/ttyd"
            chmod +x "$BIN_DIR/ttyd"
            log_ok "TTYD 从国内镜像安装完成"
            return 0
        else
            log_warn "国内镜像失败，尝试 GitHub..."
        fi
    fi
    
    # 尝试从 GitHub 下载
    if [ "$arch" = "x86_64" ]; then
        url="https://github.com/tsl0922/ttyd/releases/download/$version/ttyd.x86_64"
        log_info "正在下载 TTYD..."
        if download_binary "$url" "$tmp_file"; then
            mv "$tmp_file" "$BIN_DIR/ttyd"
            chmod +x "$BIN_DIR/ttyd"
            log_ok "TTYD 安装完成"
            return 0
        fi
    fi
    
    # 尝试包管理器
    log_info "尝试使用包管理器安装 TTYD..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq ttyd 2>/dev/null && \
        cp "$(which ttyd)" "$BIN_DIR/" && chmod +x "$BIN_DIR/ttyd" && \
        log_ok "TTYD 通过 apt 安装完成" && return 0
    elif command -v yum >/dev/null 2>&1; then
        yum install -y ttyd 2>/dev/null && \
        cp "$(which ttyd)" "$BIN_DIR/" && chmod +x "$BIN_DIR/ttyd" && \
        log_ok "TTYD 通过 yum 安装完成" && return 0
    fi
    
    rm -f "$tmp_file"
    log_error "TTYD 安装失败"
    return 1
}

# ============================================
# 安装 Node.js 依赖
# ============================================
install_deps() {
    log_info "安装 Node.js 依赖..."
    
    if ! command -v node >/dev/null 2>&1; then
        log_error "未检测到 Node.js，请先安装 (https://nodejs.org/)"
        return 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    log_ok "Node.js 版本: $(node --version)"
    
    if [ "$node_version" -lt 18 ]; then
        log_warn "Node.js 版本过低 ($node_version)，建议升级到 v18+"
    fi
    
    if [ -d "node_modules" ]; then
        log_info "依赖已存在，跳过安装"
    else
        npm install --omit=dev --no-audit
    fi
    
    log_ok "依赖安装完成"
}

# ============================================
# 创建启动脚本
# ============================================
create_start_script() {
    log_info "创建启动脚本..."
    
    cat > start.sh << 'EOF'
#!/bin/bash
# A-Plan 启动脚本

cd "$(dirname "$0")"

# 设置环境变量
export PATH="$PWD/bin:$PATH"
export EASYTIER_PATH="$PWD/bin/easytier-core"
export TTYD_PATH="$PWD/bin/ttyd"
export ET_CONFIG_FILE="$PWD/configs/easytier.json"

# 检查必要文件
if [ ! -f "$EASYTIER_PATH" ]; then
    echo "错误: EasyTier 未安装，请先运行 ./install.sh"
    exit 1
fi

if [ ! -f "$TTYD_PATH" ]; then
    echo "错误: TTYD 未安装，请先运行 ./install.sh"
    exit 1
fi

# 检查端口
check_port() {
    if lsof -i:$1 >/dev/null 2>&1; then
        echo "错误: 端口 $1 已被占用"
        exit 1
    fi
}

check_port 18781

echo "======================================"
echo "  A-Plan 启动中..."
echo "======================================"
echo "服务地址: http://localhost:18781"
echo "======================================"
echo "按 Ctrl+C 停止"
echo

trap 'echo "正在停止服务..."; exit 0' INT TERM

node src/core/master.js
EOF

    chmod +x start.sh
    log_ok "启动脚本创建完成: ./start.sh"
}

# ============================================
# 主流程
# ============================================
main() {
    echo "========================================"
    echo "  A-Plan 安装脚本 v2.0"
    echo "========================================"
    echo ""
    
    local arch=$(get_arch)
    if [ "$arch" = "unsupported" ]; then
        log_error "不支持的架构: $(uname -m)"
        exit 1
    fi
    
    log_info "系统架构: $arch"
    log_info "安装目录: $SCRIPT_DIR"
    
    # 检查是否有代理
    if [ -n "$PROXY_URL" ]; then
        log_info "检测到代理: $PROXY_URL"
    fi
    
    echo ""
    
    # 步骤 1: 检查本地二进制
    if check_local_binaries; then
        log_ok "发现本地二进制文件，跳过下载"
    else
        # 步骤 2: 尝试离线包
        if install_from_offline; then
            log_ok "离线包安装成功"
        else
            # 步骤 3: 逐个下载
            log_warn "未找到本地二进制，尝试下载..."
            install_easytier || {
                log_error "EasyTier 安装失败，请手动下载后放入 bin/ 目录"
                log_info "下载地址: https://github.com/EasyTier/EasyTier/releases"
            }
            install_ttyd || {
                log_error "TTYD 安装失败"
            }
        fi
    fi
    
    # 步骤 4: 安装 Node.js 依赖
    install_deps
    
    # 步骤 5: 创建启动脚本
    create_start_script
    
    # 最终检查
    echo ""
    echo "========================================"
    if check_local_binaries; then
        log_ok "安装完成！"
        echo ""
        echo "使用方法:"
        echo "  启动: ./start.sh"
        echo "  访问: http://localhost:18781"
        echo ""
        echo "EasyTier 配置信息:"
        echo "  虚拟IP: 10.11.11.144"
        echo "  网络名: NASP2P-v3"
        echo "  在 Web 界面"网络管理"中配置即可"
    else
        log_warn "安装部分完成，但缺少二进制文件"
        echo "请手动下载以下文件放入 bin/ 目录:"
        echo "  - easytier-core (https://github.com/EasyTier/EasyTier/releases)"
        echo "  - ttyd (https://github.com/tsl0922/ttyd/releases 或 apt install ttyd)"
    fi
    echo "========================================"
}

main "$@"
