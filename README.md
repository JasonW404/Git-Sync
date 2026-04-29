# Git-Sync Tool

将 GitHub 仓库同步到内部代码仓库，并自动替换 commit 作者信息。

## 功能特性

- ✅ 定时同步 GitHub 仓库到内部仓库
- ✅ 自动替换 commit 作者信息（user.name & user.email）
- ✅ 支持多仓库、多分支同步
- ✅ 全局作者映射 + 仓库局部覆写
- ✅ CLI 完整命令支持
- ✅ TUI 交互式仪表盘（Ink）
- ✅ Docker/Podman 容器化部署
- ✅ SSH / HTTPS（Token / 用户名密码）多种认证方式

## 快速开始

### 1. 准备配置文件

```bash
# 复制示例配置
cp config/git-sync.yaml.example config/git-sync.yaml

# 编辑配置
vim config/git-sync.yaml
```

### 2. 配置作者映射

```yaml
author_mappings:
  - match_email: "alice@personal.com"
    internal_name: "Alice Wang"
    internal_email: "alice.wang@internal.corp"
```

### 3. 启动容器

```bash
# 使用 Docker
docker-compose up -d

# 或使用 Podman
podman-compose up -d
```

### 4. 查看状态

```bash
# CLI 模式
docker-compose exec git-sync git-sync status

# TUI 模式
docker-compose exec git-sync git-sync tui
```

## 文档

- [设计文档](docs/DESIGN.md) - 完整的技术架构和实现细节
- [配置说明](docs/CONFIG.md) - 配置文件详细说明

## 安装要求

### 容器部署

- Docker 或 Podman
- git-filter-repo（已在容器中预装）

### 本地开发

- Node.js 20+
- Python 3 + pip
- git-filter-repo

```bash
# 安装 git-filter-repo
pip install git-filter-repo

# 安装 Node.js 依赖
npm install
```

## CLI 命令

```bash
# 查看状态
git-sync status [--repo <id>] [--json]

# 手动同步
git-sync sync [--repo <id>] [--force] [--dry-run]

# 配置管理
git-sync config show
git-sync config validate

# TUI 模式
git-sync tui

# 服务管理
git-sync daemon [--stop] [--status]

# 工具命令
git-sync check-auth
git-sync check-filter-repo
git-sync version
```

## 配置示例

```yaml
version: 1

settings:
  state_dir: /app/state
  repo_dir: /app/repos
  default_schedule: "0 0 */7 * *"    # 每 7 天
  timezone: "Asia/Shanghai"
  max_concurrent: 5

author_mappings:
  - match_email: "alice@personal.com"
    internal_name: "Alice Wang"
    internal_email: "alice.wang@internal.corp"

sync_tasks:
  - name: production-services
    repos:
      - id: api-service
        github_url: git@github.com:org/api-service.git
        internal_url: git@git.internal.corp:mirrors/api-service.git
        branches: ["main", "release/*"]
        tags: true
        auth:
          type: ssh
```

## 认证方式

### SSH（推荐）

```yaml
# docker-compose.yaml
volumes:
  - ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro
environment:
  - GIT_SSH_COMMAND=ssh -i /app/.ssh/id_rsa
```

### HTTPS + Token

```yaml
environment:
  - GITHUB_TOKEN=${GITHUB_TOKEN}
```

### HTTPS + 用户名密码

```yaml
environment:
  - INTERNAL_USER=${INTERNAL_USER}
  - INTERNAL_PASSWORD=${INTERNAL_PASSWORD}
```

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 开发模式
npm run dev

# 测试
npm test

# 代码检查
npm run lint
```

## 许可证

MIT License