# Git-Sync Tool Dockerfile
# 
# 构建阶段：编译 TypeScript
FROM node:20-slim AS builder

WORKDIR /build

# 安装构建依赖
COPY package.json package-lock.json* ./
RUN npm ci

# 复制源码并编译
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 运行阶段：最小化镜像
FROM node:20-slim

# 安装运行时依赖
# - git: Git 操作
# - python3 + pip: git-filter-repo
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages git-filter-repo \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# 复制编译产物
COPY --from=builder /build/dist ./dist

# 复制 package.json 和依赖
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# 复制默认配置
COPY config/git-sync.yaml.example ./config/git-sync.yaml.example

# 创建必要目录
RUN mkdir -p /app/config /app/state /app/repos /app/.ssh /app/logs

# 设置权限
RUN chmod 700 /app/.ssh

# 数据卷
VOLUME ["/app/config", "/app/state", "/app/repos", "/app/.ssh"]

# 环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 入口点
ENTRYPOINT ["node", "dist/cli.js"]

# 默认命令：启动守护进程
CMD ["daemon"]