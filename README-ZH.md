# 🚀 A计划 (A-Plan) v4.2.8 极速版 - 极致轻量，即装即用

**A计划 (A-Plan)** 是一款专为极客、深度用户和生产环境设计的 AI 接口中转网关。支持 Gemini、Claude、Grok、OpenAI 等多种模型。

---

## ✨ 核心特性

- **极速轻量**：仅 5 个核心依赖，安装几秒完成
- **Web UI 完整**：开箱即用，管理后台完整功能
- **后台运行**：服务后台启动，不占用终端
- **按需扩展**：需要更多 Provider 时再安装对应依赖

---

## 📅 更新日志

- **v4.2.8** (2026-04-22)
    - 精简核心依赖：仅 5 个（dotenv, ws, axios, uuid, lodash）
    - 安装仅需几秒，完全适配 Pod 环境
    - 默认端口 18781，默认密码 123456

---

## 🛠️ 部署方式（推荐）

### 一条命令后台部署
```bash
git clone https://github.com/plhys/a-plan.git && cd a-plan && npm install && PORT=18781 bash start.sh
```

**说明：**
- 自动克隆项目
- 安装 5 个核心依赖（只需几秒）
- 后台启动服务
- 日志查看：`tail -f /tmp/a-plan.log`

### 访问
- 管理后台：`http://你的IP:18781`
- 默认密码：`123456`

---

## ⚙️ 配置说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | 18781 | 服务端口 |
| `A_ADMIN_PASSWORD` | 123456 | 管理后台密码 |

---

## 🧩 需要更多 Provider 时

极速版只包含核心依赖。如果需要使用 Gemini、Claude 等其他 Provider，请在管理后台添加对应渠道，系统会提示安装所需依赖。

---

*Powered by A-Plan Team & OpenClaw Agent*