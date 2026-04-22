#!/bin/bash

# 设置环境
export LC_ALL=C LANG=C
export PORT=${PORT:-18781}

echo "========================================"
echo "  A计划 极速启动"
echo "========================================"
echo "端口: $PORT"
echo "PID文件: /tmp/a-plan.pid"
echo "日志: /tmp/a-plan.log"
echo

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "[安装] 依赖..."
    pnpm install || npm install
fi

# 如果已经在运行，先杀掉
if [ -f "/tmp/a-plan.pid" ]; then
    OLD_PID=$(cat /tmp/a-plan.pid)
    if kill -0 $OLD_PID 2>/dev/null; then
        echo "[提示] 已有进程在运行 (PID: $OLD_PID)，先杀掉..."
        kill $OLD_PID 2>/dev/null
        sleep 1
    fi
fi

# 后台启动
echo "[启动] A计划服务 running on http://localhost:$PORT"
nohup node src/core/master.js > /tmp/a-plan.log 2>&1 &
echo $! > /tmp/a-plan.pid
echo "[OK] PID: $(cat /tmp/a-plan.pid)"
echo "[日志] /tmp/a-plan.log"