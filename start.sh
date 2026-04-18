#!/bin/bash
# A计划 - 自动同步与启动脚本 (A-Plan Sync & Boot Script)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "   A计划 (A-Plan) - 自动同步启动中"
echo "=========================================="

# 1. 检查配置更新 (如果有远程提交的配置，先拉取)
if [ -d ".git" ]; then
    echo "[*] 正在检查远程配置更新..."
    git pull origin main
fi

# 2. 检查并启动服务
if pgrep -f "src/services/api-server.js" > /dev/null
then
    echo "[!] A计划已经在运行中。"
else
    echo "[+] 正在后台启动 A计划..."
    nohup node src/services/api-server.js > a-plan_runtime.log 2>&1 &
    echo "✅ 启动成功! PID: $!"
fi

# 3. 自动同步逻辑 (每 10 分钟检查一次配置变化并推送)
# 这部分可以在后台跑，确保你在 Web UI 改的配置能回传到 GitHub
echo "[*] 配置自动同步守护进程已开启..."
while true; do
    sleep 600
    # 检查 configs 目录下的 json 文件是否有变化
    if [[ -n $(git status --porcelain configs/) ]]; then
        echo "[Sync] 检测到配置变化，正在同步到 GitHub..."
        git add configs/*.json pwd
        git commit -m "Auto-sync: Updated configurations from Web UI"
        git push origin main
        echo "[Sync] 同步完成。"
    fi
done &
