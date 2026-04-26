#!/bin/bash
# A-Plan SSH服务部署脚本
# 在822端口启动SSH服务，避免与默认22端口冲突

set -e

echo "🚀 开始部署SSH服务到822端口..."

# 检查root权限
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用root权限运行: sudo bash setup-ssh.sh"
    exit 1
fi

# 设置root密码为root
echo "🔑 设置root密码..."
echo "root:root" | chpasswd

# 检测并安装SSH服务
if command -v dropbear &> /dev/null; then
    echo "✓ Dropbear 已安装"
    SSH_TYPE="dropbear"
elif command -v sshd &> /dev/null; then
    echo "✓ OpenSSH 已安装"
    SSH_TYPE="openssh"
else
    echo "📦 安装轻量级SSH服务器 (dropbear)..."
    if command -v apt &> /dev/null; then
        apt update && apt install -y dropbear
    elif command -v yum &> /dev/null; then
        yum install -y dropbear
    elif command -v apk &> /dev/null; then
        apk add dropbear
    else
        echo "⚠️ 无法自动安装，请手动安装SSH服务"
        exit 1
    fi
    SSH_TYPE="dropbear"
fi

# 配置并启动SSH服务
if [ "$SSH_TYPE" = "dropbear" ]; then
    echo "🔧 配置 Dropbear..."
    
    # 创建Dropbear配置目录
    mkdir -p /etc/dropbear
    
    # 生成主机密钥（如果不存在）
    if [ ! -f /etc/dropbear/dropbear_rsa_host_key ]; then
        echo "🔐 生成RSA主机密钥..."
        dropbearkey -t rsa -f /etc/dropbear/dropbear_rsa_host_key -s 2048
    fi
    
    if [ ! -f /etc/dropbear/dropbear_ecdsa_host_key ]; then
        echo "🔐 生成ECDSA主机密钥..."
        dropbearkey -t ecdsa -f /etc/dropbear/dropbear_ecdsa_host_key -s 256
    fi
    
    # 杀掉现有的dropbear进程
    pkill dropbear 2>/dev/null || true
    
    # 在822端口启动dropbear
    echo "🚀 在822端口启动Dropbear..."
    dropbear -p 822 -F -E -B &
    
    # 添加到开机启动
    if [ -f /etc/rc.local ]; then
        if ! grep -q "dropbear.*822" /etc/rc.local 2>/dev/null; then
            sed -i '$i\dropbear -p 822 -B || true' /etc/rc.local
        fi
    fi
    
    # 创建systemd服务（如果可用）
    if command -v systemctl &> /dev/null; then
        cat > /etc/systemd/system/dropbear-822.service << 'EOF'
[Unit]
Description=Dropbear SSH Server on port 822
After=network.target

[Service]
Type=forking
ExecStart=/usr/sbin/dropbear -p 822 -B
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable dropbear-822 2>/dev/null || true
        systemctl start dropbear-822 2>/dev/null || true
    fi
    
else
    echo "🔧 配置 OpenSSH..."
    
    # 备份原配置
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d) 2>/dev/null || true
    
    # 创建专用的sshd配置
    cat > /etc/ssh/sshd_config.d/822.conf << EOF
Port 822
PermitRootLogin yes
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
EOF
    
    # 重启sshd
    if command -v systemctl &> /dev/null; then
        systemctl restart sshd
    else
        /etc/init.d/ssh restart 2>/dev/null || service ssh restart || true
    fi
fi

# 验证SSH服务
sleep 1
if netstat -tlnp 2>/dev/null | grep -q ":822"; then
    echo ""
    echo "✅ SSH服务部署成功！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 端口: 822"
    echo "👤 用户: root"
    echo "🔑 密码: root"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "测试连接: ssh -p 822 root@localhost"
    echo ""
elif ss -tlnp 2>/dev/null | grep -q ":822"; then
    echo ""
    echo "✅ SSH服务部署成功！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 端口: 822"
    echo "👤 用户: root"
    echo "🔑 密码: root"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
else
    echo "⚠️ 无法验证SSH服务状态，请手动检查"
    exit 1
fi

# 在A-Plan目录下标记SSH已配置
CONFIG_DIR="${HOME}/.config/a-plan"
mkdir -p "$CONFIG_DIR"
echo '{"ssh_enabled": true, "ssh_port": 822}' > "$CONFIG_DIR/ssh-status.json"

echo "📝 配置已保存到: $CONFIG_DIR/ssh-status.json"
echo ""
echo "现在可以在A-Plan网络终端中点击'连接'按钮了！"
