# A-Plan 开发文档

> 本文档面向开发者，介绍项目架构、开发规范和核心实现。

---

## 📋 项目概述

A-Plan 是一个轻量级的 AI 接口网关，核心功能：
1. **AI API 中转** - 多提供商统一包装成 OpenAI 格式
2. **EasyTier VPN** - 内置轻量级 VPN 解决方案
3. **WebSSH** - 浏览器终端访问

### 技术栈

| 技术 | 用途 |
|------|------|
| Node.js 18+ | 运行时 |
| ES Modules | 模块系统 |
| pnpm | 包管理 |
| 原生 HTTP | Web 服务器 |

---

## 🏗️ 架构设计

### 多进程模型

```
┌────────────────┐
│   Master       │  主进程
│  (进程管理)     │
│  - 启动/停止    │
│  - 故障恢复     │
│  - 管理 API    │
└───────┬────────┘
        │ fork()
        ▼
┌────────────────┐
│   Worker       │  工作进程
│  (业务逻辑)     │
│  - HTTP 服务   │
│  - API 处理    │
│  - 插件加载    │
└────────────────┘
```

**设计理由**:
- Master 进程负责管理，不处理业务，保证稳定性
- Worker 进程处理请求，可独立重启不影响服务
- 支持多 Worker 并发，提高吞吐量

### 幽灵模式 (Ghost Mode)

A-Plan 采用"端口秒开"策略：

1. **立即监听端口**: HTTP 服务器先启动并监听端口
2. **异步加载核心**: 核心逻辑在后台异步初始化
3. **服务降级**: 核心未就绪时返回 503，客户端自动重试

```javascript
// api-server.js 核心逻辑
serverInstance.listen(PORT, HOST, () => {
    // 端口已就绪，立即响应
    logger.info(`🚀 Listening on port ${PORT}`);
    
    // 异步加载核心逻辑
    bootstrapCore().catch(err => {
        global.BOOTSTRAP_ERROR = err;
    });
});
```

---

## 📁 目录结构

```
src/
├── core/                  # 核心进程
│   ├── master.js          # 主进程入口
│   ├── config-manager.js  # 配置管理
│   └── plugin-manager.js  # 插件管理
├── services/              # 服务层
│   ├── api-server.js      # 主 API 服务
│   ├── api-server-lite.js # 精简版服务
│   ├── service-manager.js # 服务管理
│   ├── api-manager.js     # API 管理
│   └── ui-manager.js      # UI 管理
├── providers/             # AI 提供商
│   ├── adapter.js         # 适配器基类
│   ├── provider-models.js # 模型定义
│   ├── provider-pool-manager.js # 池管理
│   └── openai/            # OpenAI 兼容实现
├── modules/
│   ├── network/           # 网络模块
│   │   └── easytier-manager.js
│   ├── ssh/               # SSH 模块
│   │   ├── webssh.js
│   │   └── network-api.js
│   └── proxy-shadow/      # 代理模块
├── plugins/               # 插件
│   ├── default-auth/      # 默认认证
│   ├── model-usage-stats/ # 用量统计
│   ├── api-potluck/       # API 分享
│   └── ai-monitor/        # AI 监控
├── ui-modules/            # UI API
├── handlers/              # 请求处理
├── converters/            # 格式转换
├── routes/                # 路由
└── utils/                 # 工具函数
```

---

## 🔧 开发指南

### 环境准备

```bash
# 1. 克隆项目
git clone https://gitee.com/JunFengLiangZi/a-plan.git
cd a-plan

# 2. 安装依赖
pnpm install

# 3. 启动开发模式
pnpm start

# 4. 访问管理后台
# http://localhost:18781
```

### 代码规范

1. **模块系统**: 使用 ES Modules (`import`/`export`)
2. **日志**: 使用统一的 logger (`import logger from '../utils/logger.js'`)
3. **错误处理**: 区分可恢复错误和致命错误
4. **配置**: 所有配置通过 config-manager 加载

### 核心模块说明

#### 1. Provider 适配器

```javascript
// src/providers/adapter.js
export class ProviderAdapter {
    async chat(messages, options) {
        // 实现具体的 API 调用
    }
    
    async models() {
        // 获取可用模型列表
    }
}
```

#### 2. 插件系统

```javascript
// 插件结构
export default {
    name: 'plugin-name',
    version: '1.0.0',
    
    // 初始化
    async init(config) {},
    
    // 加载完成
    async load() {},
    
    // 卸载
    async unload() {}
};
```

#### 3. EasyTier 管理

```javascript
// 网络模块提供：
// - 启动/停止 EasyTier
// - 获取网络状态
// - 节点管理
```

#### 4. WebSSH

```javascript
// WebSSH 提供：
// - 浏览器终端
// - SSH 连接管理
// - 终端 resize 处理
```

---

## 🧪 测试

### 本地测试

```bash
# 启动服务
pnpm start

# 测试 API
curl http://localhost:18781/v1/models

# 测试登录
curl -X POST http://localhost:18781/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

---

## 📦 打包发布

### 二进制打包 (pkg)

```bash
# 安装 pkg
pnpm add -g pkg

# 打包
pkg package.json

# 输出: dist/a-plan
```

### 部署包

```bash
# 创建部署目录
mkdir -p deploy/a-plan-x.x.x

# 复制必要文件
rsync --exclude='node_modules' ... deploy/a-plan-x.x.x/
cp -r node_modules deploy/a-plan-x.x.x/

# 打包
tar -czvf deploy/a-plan-x.x.x.tar.gz deploy/a-plan-x.x.x/
```

---

## 🔄 版本管理

1. 修改 `VERSION` 文件
2. 创建 Git Tag: `git tag -a vx.x.x -m "版本说明"`
3. 推送到仓库: `git push origin main --tags`

---

## ⚠️ 开发注意事项

1. **端口占用**: 默认 18781，确保未被占用
2. **配置优先级**: 环境变量 > 配置文件 > 默认值
3. **生产环境**: 务必修改默认密码
4. **网络**: 部分模型需要代理才能访问

---

## 📖 相关文档

- [README-ZH.md](../README-ZH.md) - 项目说明
- [CHANGELOG.md](../CHANGELOG.md) - 更新日志
- [configs/config.json.example](../configs/config.json.example) - 配置示例
