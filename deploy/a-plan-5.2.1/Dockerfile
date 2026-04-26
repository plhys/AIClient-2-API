# A-Plan 轻量化 Dockerfile
# 使用 node:alpine-slim 作为基础镜像，体积小、启动快

FROM node:22-alpine AS builder

# 安装 pkg 用于打包
RUN npm install -g pkg

WORKDIR /app

# 复制源码
COPY package.json pnpm-lock.yaml* ./
COPY . .

# 构建二进制（可选，如果需要单文件部署）
# RUN pkg a-plan.js --targets node22-linux-x64 --output dist/a-plan --public

FROM node:22-alpine-slim

# 创建一个非 root 用户
RUN addgroup -g 1000 ap lan && \
    adduser -u 1000 -G aplan -D aplan

WORKDIR /app

# 复制 package 文件
COPY package.json pnpm-lock.yaml* ./

# 安装生产依赖
RUN npm ci --omit=dev && \
    npm cache clean --force

# 复制源码和配置
COPY --chown=aplan:aplan . .

# 切换到非 root 用户
USER aplan

# 暴露端口
EXPOSE 18781 822 7890 15888

# 启动命令
CMD ["node", "src/core/master.js"]
