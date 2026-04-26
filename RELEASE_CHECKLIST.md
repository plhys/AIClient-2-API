# A-Plan v5.1.0 发布检查清单

## ✅ 第二步已完成：Docker 安装方案

| 组件 | 状态 | 说明 |
|------|------|------|
| Dockerfile | ✅ | 基于 Ubuntu 22.04，内置所有依赖 |
| docker-compose.yml | ✅ | 一键启动，数据持久化 |
| supervisord.conf | ✅ | 进程管理，崩溃自动重启 |
| 健康检查 | ✅ | HTTP 健康检查端点 |
| 端口映射 | ✅ | 18781, 7681, 15888 |

## ✅ 相关配置模板

| 文件 | 用途 |
|------|------|
| `configs/config.example.json` | A-Plan 主配置示例 |
| `configs/easytier.example.json` | EasyTier VPN 配置示例 |
| `a-plan.service` | systemd 服务文件模板 |

## 📋 发布前待办清单

### 版本标记
- [ ] 更新 package.json 版本号为 5.1.0
- [ ] 创建 git tag: v5.1.0
- [ ] 创建 GitHub/Gitee Release

### 测试验证
- [ ] 源码安装测试（Linux x64）
- [ ] 源码安装测试（Linux ARM64）
- [ ] Docker 部署测试
- [ ] EasyTier VPN 启动停止测试
- [ ] TTYD WebSSH 访问测试
- [ ] --no-tun 模式测试

### 文档完善
- [ ] README 中英文同步更新
- [ ] 添加架构说明图
- [ ] 添加快速入门视频/截图
- [ ] 添加常见问题 FAQ

### 二进制分发（可选）
- [ ] 创建 release 包（含二进制）
- [ ] 上传到 GitHub/Gitee Release
- [ ] 提供离线安装包

### 营销准备
- [ ] 编写发布说明
- [ ] 准备演示环境
- [ ] 分享到社区/论坛

## 🎯 第三步建议

### 选项 A：版本标记 + 发布（30分钟）
- 打版本标签
- 创建 Release 页面
- 发布 v5.1.0

### 选项 B：全面测试（2-4小时）
- 测试两种安装方式
- 验证所有功能
- 修复潜在问题

### 选项 C：文档完善（1-2小时）
- 补充架构图
- 编写用户指南
- 添加 FAQ

## 🚀 推荐

建议先完成 **选项 A（版本标记）**，再 **选项 B（测试）**，最后发布。

这样安排合理吗？还是你想调整优先级？
