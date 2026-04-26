# 更新日志 CHANGELOG

## v5.1.0 (2026-04-26)

### 🚀 新功能

- **EasyTier VPN 集成**
  - 🌐 内置 VPN 功能，支持 P2P 组网
  - 🛡️ 支持 TUN 模式和 SOCKS5 模式
  - ⚡ 支持 --no-tun 无特权模式（适合容器）
  - 📊 Web 界面管理 VPN 启动/停止/配置

- **WebSSH (TTYD) 集成**
  - 💻 内置 Web 终端，通过浏览器访问 SSH
  - 🔒 TTYD 走 VPN 隧道，安全隔离
  - 📡 支持通过 VPN 虚拟 IP 访问终端

- **双部署方案**
  - 🚀 源码安装：`./install.sh` 一键部署（轻量快速）
  - 🐳 Docker 部署：`docker-compose up -d`（稳定生产）

- **安装自动化**
  - 新增 `install.sh` 自动下载 EasyTier + TTYD 二进制
  - 自动检测系统架构（x86_64 / aarch64）
  - 生成 `start.sh` 一键启动脚本
  - 提供 `a-plan.service` systemd 服务文件

### 🔧 改进

- 🧹 清理所有硬编码配置（VIP、relay 服务器等）
- 💾 配置持久化，支持自动启动
- 📝 配置文件示例（configs/*.example.json）
- 🔄 优化 VPN 启动/停止流程

### 📚 文档

- 📖 更新 README.md，详细说明两种部署方式
- 🐳 新增 Docker 支持（Dockerfile + docker-compose.yml）
- 📋 新增系统服务配置（systemd）

### 🐛 Bug 修复

- 修复 TUN 开关按钮失效问题
- 修复 EasyTier 参数兼容性问题
- 修复 VIP 为空时的处理逻辑

## v5.0.2 (2026-04-23)

### 🚀 新功能

- **Cloudflare Workers AI 完整集成**
  - ✨ 支持 Cloudflare AI Gateway，每天 10,000 次免费调用
  - 🎯 支持 8 个 Workers AI 模型（Llama 3.x 系列、Mistral、BAAI 向量嵌入）
  - 🔄 自动响应格式转换（Workers AI → OpenAI 格式）
  - ⚡ 自定义模型别名支持（如 `llama-8b` 代替 `@cf/meta/llama-3.1-8b-instruct`）

- **Workers AI 核心服务**
  - 新增 `src/providers/workersai/workersai-core.js` - Workers AI API 核心服务
  - 新增 `src/providers/workersai/workersai-adapter.js` - Workers AI 适配器
  - 实现响应格式转换：`{result: {response}}` → `{choices: [{message: {content}}]}`

- **协议转换系统扩展**
  - 新增 `CLOUDFLARE` 协议前缀支持
  - 复用 OpenAI 转换器处理 Cloudflare 请求
  - Provider Strategy 支持 Cloudflare 协议

### 🔧 改进

- 设置默认 provider 为 `cloudflare-gateway-free`（**已弃用**），无需冗长前缀
- 优化模型路由逻辑，支持 `@cf/` 前缀自动识别
- 改进健康检查，支持 Workers AI 模型检测

**注**: v5.1.0 起 `cloudflare-gateway-free` 已移除，统一使用 `openai-custom` 透明代理

### 📚 文档

- 更新 README.md 添加 Workers AI 模型列表和调用示例
- 新增 DEVELOPMENT_NOTES.md 详细开发心得和踩坑指南
- 更新 CLOUDFLARE-AI-GATEWAY-TUTORIAL.md 集成教程

### 🐛 Bug 修复

- 修复 `Conversion error: No converter registered for protocol: cloudflare`
- 修复 `Unsupported target protocol: cloudflare`
- 修复模型路由错误（`@cf/` 前缀模型被路由到错误 provider）

---

## v5.0.0 (2026-04-23)

### 🚀 新功能

- **OpenAI 兼容模式用量查询支持**
  - 添加 `openai-custom` 到用量查询支持列表
  - 实现本地用量统计（请求次数、错误次数）
  - 新增 `formatOpenAICustomUsage` 格式化函数

- **NLB 压缩问题修复**
  - 修复 GLM5 等模型调用失败问题（500 错误）
  - 原因：NLB 不支持 Brotli 压缩
  - 解决：针对 NLB 禁用压缩，使用 `Accept-Encoding: identity`

- **健康检查逻辑优化**
  - 健康检查模型改为从 `supportedModels[0]` 自动获取
  - 不再硬编码默认模型，避免 NLB 健康检查失败

### 🔧 改进

- 优化 provider pool 管理器逻辑
- 统一用量查询接口

---

## v4.2.x (历史版本)

### v4.2.9
- 极速版：精简核心依赖

### v4.2.8
- 精简核心依赖，仅5个（dotenv, ws, axios, uuid, lodash）

### v4.2.6
- Geek Overhaul: 移除硬编码配置，统一端口 18781
- 新增原生 Nvidia NIM 支持
- 集成 Groq, SambaNova, Github Models

### v4.2.5
- 环境兼容性优化，POSIX 合规

### v4.2.4
- 生存能力提升：JIT token 刷新，60s 静默启动

### v4.1.0
- Geek Refactor: 插件化，热点路由