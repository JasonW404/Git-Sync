# Git-Sync 使用说明

## 目录

- [快速开始](#快速开始)
- [部署方式](#部署方式)
- [配置说明](#配置说明)
- [运行方式](#运行方式)
- [常用命令](#常用命令)
- [常见问题](#常见问题)

---

## 快速开始

### 前置条件

- Docker 或 Podman
- SSH 密钥（用于 GitHub 认证）

### 5 分钟部署

```bash
# 1. 克隆项目（或下载 release）
git clone https://github.com/JasonW404-HW/git-sync.git
cd git-sync

# 2. 准备配置文件
cp config/git-sync.yaml.example config/git-sync.yaml
vim config/git-sync.yaml  # 编辑你的仓库和作者映射

# 3. 创建必要目录
mkdir -p state repos

# 4. 启动容器
docker-compose up -d

# 5. 查看状态
docker exec -it git-sync node dist/cli.cjs status --json
```

### 使用预构建镜像（推荐）

```bash
# 拉取最新镜像
docker pull ghcr.io/jasonw404-hw/git-sync:latest

# 或指定版本
docker pull ghcr.io/jasonw404-hw/git-sync:v1.0.0

# 使用预构建镜像运行
docker run -d \
  --name git-sync \
  -v ./config:/app/config:ro \
  -v ./state:/app/state \
  -v ./repos:/app/repos \
  -v ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro \
  -e GIT_SSH_COMMAND="ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new" \
  ghcr.io/jasonw404-hw/git-sync:latest
```

---

## 部署方式

### 方式一：Docker Compose（推荐）

**完整部署流程：**

```bash
# 1. 克隆项目
git clone https://github.com/JasonW404-hw/git-sync.git
cd git-sync

# 2. 创建目录结构
mkdir -p config state repos logs

# 3. 复制并编辑配置
cp config/git-sync.yaml.example config/git-sync.yaml
vim config/git-sync.yaml

# 4. 配置 SSH 密钥
# 确保 ~/.ssh/id_rsa 存在并已添加到 GitHub
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""  # 如没有密钥
cat ~/.ssh/id_rsa.pub  # 添加到 GitHub Settings → SSH Keys

# 5. 创建内部仓库（如使用本地路径）
mkdir -p internal-repos
cd internal-repos
git init --bare my-repo.git  # 创建 bare 仓库

# 6. 启动服务
docker-compose up -d

# 7. 查看日志确认启动成功
docker logs -f git-sync

# 8. 验证同步
docker exec -it git-sync node dist/cli.cjs sync
```

**启动服务：**
```bash
# 启动服务
docker-compose up -d

# 查看日志
docker logs -f git-sync

# 停止服务
docker-compose down
```

**目录挂载说明：**

| 容器路径 | 说明 | 建议 |
|---------|------|------|
| `/app/config` | 配置文件目录 | 挂载本地 `config/` |
| `/app/state` | 状态数据库 | 持久化挂载 |
| `/app/repos` | 仓库工作目录 | 持久化挂载 |
| `/app/.ssh` | SSH 密钥 | 挂载 `~/.ssh`（只读） |

**docker-compose.yaml 配置详解：**

```yaml
version: '3.8'

services:
  git-sync:
    build:
      context: .          # 使用本地源码构建
      dockerfile: Dockerfile
    # 或使用预构建镜像：
    # image: ghcr.io/jasonw404-hw/git-sync:latest
    
    container_name: git-sync
    volumes:
      - ./config:/app/config:ro           # 配置文件（只读）
      - ./state:/app/state                 # 状态数据库
      - ./repos:/app/repos                 # 仓库工作目录
      - ${HOME}/.ssh/id_rsa:/app/.ssh/id_rsa:ro       # SSH 私钥
      - ${HOME}/.ssh/id_rsa.pub:/app/.ssh/id_rsa.pub:ro  # SSH 公钥
      - ${HOME}/.ssh/known_hosts:/app/.ssh/known_hosts:ro  # known_hosts
    
    environment:
      - TZ=Asia/Shanghai                   # 时区
      - GIT_SSH_COMMAND=ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}     # 可选：GitHub Token
      - INTERNAL_GIT_TOKEN=${INTERNAL_GIT_TOKEN:-}  # 可选：内部仓库 Token
    
    restart: unless-stopped                # 自动重启
    
    healthcheck:
      test: ["CMD", "node", "dist/cli.cjs", "check-filter-repo"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 方式二：直接运行（Ubuntu/WSL2）

详见 [Ubuntu/WSL2 安装指南](docs/UBUNTU_INSTALL.md)

```bash
# 安装依赖
npm install
pip install git-filter-repo

# 构建
npm run build

# 运行 Daemon
node dist/cli.cjs daemon -c config/git-sync.yaml

# 或运行单次同步
node dist/cli.cjs sync -c config/git-sync.yaml
```

### 方式三：使用预构建 Docker 镜像

```bash
# 拉取镜像
docker pull ghcr.io/jasonw404-hw/git-sync:latest

# 运行容器
docker run -d \
  --name git-sync \
  --restart unless-stopped \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/state:/app/state \
  -v $(pwd)/repos:/app/repos \
  -v ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro \
  -e GIT_SSH_COMMAND="ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new" \
  -e TZ=Asia/Shanghai \
  ghcr.io/jasonw404-hw/git-sync:latest

# 查看日志
docker logs -f git-sync

# 执行手动同步
docker exec -it git-sync node dist/cli.cjs sync
```

---

## 配置说明

### 配置文件结构

```yaml
version: 1

settings:
  repo_dir: /app/repos              # 仓库工作目录
  default_schedule: "0 0 */7 * *"   # 默认调度周期（每7天）
  timezone: "Asia/Shanghai"          # 时区
  max_concurrent: 5                  # 最大并发数
  unmapped_author_policy: warn       # 未映射作者处理策略

author_mappings:
  - match_email: "alice@gmail.com"  # GitHub 上的邮箱
    internal_name: "Alice Wang"      # 内部显示名
    internal_email: "alice@corp.com" # 内部邮箱

sync_tasks:
  - name: production-services
    schedule: "0 0 */7 * *"          # 可覆盖默认调度
    repos:
      - id: api-service
        github_url: git@github.com:org/api-service.git
        internal_url: git@git.internal.corp:mirrors/api-service.git
        branches: ["main", "release/*"]
        tags: true                   # 是否同步 tags
        auth:
          type: ssh                  # ssh | https | mixed
```

### 调度周期语法（Cron）

```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日 (1 - 31)
│ │ │ ┌───────────── 月 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 6, 0=周日)
│ │ │ │ │
* * * * *

常用示例：
  "0 0 * * *"     # 每天凌晨
  "0 0 */7 * *"   # 每7天凌晨
  "0 6 * * 1-5"   # 工作日早上6点
  "0 */4 * * *"   # 每4小时
```

### 作者映射规则

**映射逻辑：**
- 匹配 Git commit 的 `author.email` 字段
- 无论 `author.name` 是什么，只要邮箱匹配就生效
- 重写后：`author.name` 和 `author.email` 都被替换

**配置优先级：**
- 全局 `author_mappings`：所有仓库共享
- 仓库级 `author_mappings`：覆盖全局（如有）

**未映射作者处理：**
```yaml
unmapped_author_policy: warn   # 警告但继续同步（推荐）
unmapped_author_policy: reject # 拒绝同步，报错退出
```

### 认证方式

| 类型 | 说明 | 配置示例 |
|------|------|---------|
| SSH | 通过 SSH 密钥认证 | `auth: { type: ssh }` |
| HTTPS + Token | GitHub Token 认证 | `auth: { type: https, github: { token: "ghp_xxx" } }` |
| HTTPS + 用户密码 | 用户名密码认证 | `auth: { type: https, internal: { username: "user", password: "pass" } }` |
| Mixed | GitHub SSH + 内部 HTTPS | `auth: { type: mixed, ... }` |

**SSH 密钥挂载（推荐）：**

```yaml
# docker-compose.yaml
volumes:
  - ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro
environment:
  - GIT_SSH_COMMAND=ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=no
```

---

## 运行方式

### Daemon 模式（后台调度）

```bash
# 启动 Daemon
docker exec -it git-sync node dist/cli.cjs daemon -c /app/config/git-sync.yaml

# 或本地运行
node dist/cli.cjs daemon -c config/git-sync.yaml

# 查看日志
docker logs -f git-sync
```

**Daemon 工作流程：**
1. 启动时加载配置
2. 为每个仓库注册 Cron 任务
3. 到达调度时间 → 自动执行 sync
4. 同步完成后更新 state.db
5. 接收 SIGTERM → 优雅停止

### 手动同步

```bash
# 同步所有仓库
docker exec -it git-sync node dist/cli.cjs sync -c /app/config/git-sync.yaml

# 同步指定仓库
docker exec -it git-sync node dist/cli.cjs sync -c /app/config/git-sync.yaml -r api-service

# 强制完整同步（忽略增量）
docker exec -it git-sync node dist/cli.cjs sync -c /app/config/git-sync.yaml --force
```

### TUI 模式（交互式仪表盘）

```bash
# 进入 TUI
docker exec -it git-sync npm run tui /app/config/git-sync.yaml

# 或本地运行
npm run tui config/git-sync.yaml
```

**TUI 键盘操作：**

| 键盘 | 功能 |
|------|------|
| `j` / `↓` | 向下选择仓库 |
| `k` / `↑` | 向上选择仓库 |
| `s` | 同步选中仓库 |
| `a` | 同步所有仓库 |
| `r` | 刷新状态 |
| `q` / `ESC` | 退出 TUI |

**TUI 显示内容：**
- 仓库列表及同步状态
- 每个仓库的详细信息（分支、调度周期、最后同步时间）
- 最近同步日志
- 实时同步进度

---

## 常用命令

### CLI 命令一览

```bash
# 查看帮助
node dist/cli.cjs --help

# 查看状态（JSON 格式）
node dist/cli.cjs status -c config/git-sync.yaml --json

# 验证配置
node dist/cli.cjs config validate -c config/git-sync.yaml

# 显示配置内容
node dist/cli.cjs config show -c config/git-sync.yaml

# 检查 git-filter-repo 是否安装
node dist/cli.cjs check-filter-repo

# 查看版本
node dist/cli.cjs --version
```

### Docker 常用命令

```bash
# 启动服务
docker-compose up -d

# 查看运行状态
docker-compose ps

# 查看日志
docker logs -f git-sync

# 进入容器
docker exec -it git-sync bash

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新镜像
docker-compose pull && docker-compose up -d
```

---

## 常见问题

### Q1: git-filter-repo 未安装

**错误信息：**
```
[ERROR] git-filter-repo is NOT installed
```

**解决方案：**
```bash
# 容器内已预装，如本地运行需要手动安装
pip install git-filter-repo

# 验证安装
git-filter-repo --version
```

### Q2: SSH 认证失败

**错误信息：**
```
Permission denied (publickey)
```

**解决方案：**
```bash
# 1. 检查密钥挂载
docker exec -it git-sync ls -la /app/.ssh/

# 2. 检查密钥权限
chmod 600 ~/.ssh/id_rsa

# 3. 测试 SSH 连接
docker exec -it git-sync ssh -T git@github.com
```

### Q3: 同步失败 - 分支不存在

**错误信息：**
```
fatal: couldn't find remote ref main
```

**解决方案：**
```bash
# 检查配置中的 branches 是否正确
node dist/cli.cjs config show -c config/git-sync.yaml

# 确认 GitHub 仓库确实有这些分支
git ls-remote git@github.com:org/repo.git
```

### Q4: 内部仓库推送失败

**错误信息：**
```
fatal: unable to access 'git@git.internal.corp:...': Connection refused
```

**解决方案：**
```bash
# 1. 检查内部仓库是否存在
# 内部仓库需要预先创建（可以是空仓库）

# 2. 检查网络连通性
docker exec -it git-sync ping git.internal.corp

# 3. 检查 SSH 认证
docker exec -it git-sync ssh -T git@git.internal.corp
```

### Q5: 作者重写后部分作者未变化

**原因：** 配置中没有映射该作者的邮箱

**解决方案：**
```bash
# 查看未映射作者（TUI 中会显示警告）
# 或查看日志
docker logs git-sync | grep "Unmapped authors"

# 添加映射
vim config/git-sync.yaml
# 在 author_mappings 中添加：
#   - match_email: "new@email.com"
#     internal_name: "New User"
#     internal_email: "new@corp.com"
```

### Q6: 如何查看同步历史

```bash
# 方式一：TUI 查看
docker exec -it git-sync npm run tui /app/config/git-sync.yaml

# 方式二：直接查询 SQLite
docker exec -it git-sync sqlite3 /app/state/state.db
sqlite> SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 10;

# 方式三：查看日志文件
docker logs git-sync | grep "synced successfully"
```

### Q7: 如何重新完整同步

```bash
# 清理工作目录
docker exec -it git-sync rm -rf /app/repos/*

# 强制同步
docker exec -it git-sync node dist/cli.cjs sync --force
```

---

## 附录

### 文件位置说明

```
/app/
├── config/
│   └── git-sync.yaml     # 配置文件
├── state/
│   └── state.db          # SQLite 状态数据库
├── repos/
│   └── <repo-id>/        # 各仓库工作目录
│       └── .git/
│       └── .mailmap      # 作者映射文件
├── .ssh/
│   └── id_rsa            # SSH 密钥
└── dist/
    └── cli.cjs           # CLI 程序
```

### 同步流程说明

```
┌──────────────────────────────────────────────────────┐
│                    Sync 流程                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  1. Clone/Fetch   ← 从 GitHub 拉取代码                │
│     ↓                                                 │
│  2. Generate      ← 生成 .mailmap 文件                │
│     ↓                                                 │
│  3. Rewrite       ← git-filter-repo 重写作者信息       │
│     ↓                                                 │
│  4. Push          ← 推送到内部仓库                     │
│     ↓                                                 │
│  5. Update State  ← 更新 SQLite 状态                  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 状态字段说明

| 字段 | 说明 |
|------|------|
| `last_sync_hash` | 最后同步的 commit hash |
| `last_sync_time` | 最后同步时间 |
| `sync_phase` | 当前阶段：idle / cloning / fetching / rewriting / pushing / complete |
| `failure_count` | 连续失败次数 |
| `last_error` | 最后错误信息 |

### Q8: 如何使用预构建镜像

```bash
# 查看可用版本
# GitHub: https://github.com/JasonW404-HW/git-sync/pkgs/container/git-sync

# 拉取镜像
docker pull ghcr.io/jasonw404-hw/git-sync:latest
docker pull ghcr.io/jasonw404-hw/git-sync:v1.0.0

# 运行
docker run -d --name git-sync \
  -v ./config:/app/config:ro \
  -v ./state:/app/state \
  -v ./repos:/app/repos \
  -v ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro \
  -e GIT_SSH_COMMAND="ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new" \
  ghcr.io/jasonw404-hw/git-sync:latest
```

---

## 支持

如有问题，请查看：
- [设计文档](docs/DESIGN.md)
- [配置示例](config/git-sync.yaml.example)
- [Ubuntu/WSL2 安装指南](docs/UBUNTU_INSTALL.md)
- 项目 README

或通过日志排查：
```bash
docker logs -f git-sync
```