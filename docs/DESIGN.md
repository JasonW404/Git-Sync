# Git-Sync Tool 设计文档

## 目录

1. [项目概述](#1-项目概述)
2. [功能需求](#2-功能需求)
3. [技术架构](#3-技术架构)
4. [技术选型决策](#4-技术选型决策)
5. [配置文件设计](#5-配置文件设计)
6. [认证方案](#6-认证方案)
7. [部署方案](#7-部署方案)
8. [CLI/TUI 设计](#8-clitui-设计)
9. [核心流程设计](#9-核心流程设计)
10. [项目结构](#10-项目结构)
11. [数据模型设计](#11-数据模型设计)
12. [安全措施](#12-安全措施)
13. [风险与规避措施](#13-风险与规避措施)

---

## 1. 项目概述

### 1.1 背景

团队在 GitHub 上（公司外）有代码仓库，在公司内也有对应的代码仓库。受公司政策限制，GitHub 上的 commit 只能使用 GitHub 用户名和邮箱，不能使用公司内的用户名和邮箱。需要定期将代码同步到公司内，并替换提交历史中的作者信息，以便在公司内平台统计代码量。

### 1.2 目标

开发一个 Git 同步工具，实现：
- 定时同步 GitHub 仓库到内部仓库
- 自动替换 commit 作者信息（user.name & user.email）
- 支持多仓库、多分支同步
- 提供 CLI 和 TUI 界面

### 1.3 核心挑战

| 挑战 | 解决方案 |
|------|---------|
| Commit Hash 变化 | 双向映射表追踪旧/新 hash |
| 增量同步 | 增量追加模式，只处理新 commits |
| 分支一致性 | Worktree 原子更新模式 |
| 认证安全 | SSH 密钥挂载 + HTTPS Token 环境变量 |

---

## 2. 功能需求

### 2.1 同步任务管理

| 功能 | 描述 |
|------|------|
| 配置源仓库地址 | GitHub 仓库 URL |
| 配置目标仓库地址 | 内部仓库 URL |
| 作者信息映射规则 | Git commit email → 内部 name/email |
| 定时同步 | 默认每 7 天，可自定义 |
| 多分支同步 | 指定分支或通配符匹配 |
| Tags 同步 | 可选同步所有 tags |

### 2.2 作者映射规则

| 特性 | 描述 |
|------|------|
| 全局映射 | 所有仓库共享的映射规则 |
| 局部覆写 | 单个仓库可覆盖全局规则 |
| 匹配依据 | Git commit 中的 `author.email` |
| 覆写优先级 | 局部规则优先于全局规则 |

### 2.3 定时任务

| 特性 | 描述 |
|------|------|
| 默认周期 | 每 7 天 |
| 自定义周期 | Cron 表达式支持 |
| 手动触发 | CLI 命令或 TUI 操作 |
| 并发控制 | 最大并行同步数限制 |

### 2.4 界面支持

| 类型 | 功能 |
|------|------|
| CLI | 完整命令行操作支持 |
| TUI | 交互式仪表盘（Ink） |
| 日志 | 同步历史、错误日志查看 |

---

## 3. 技术架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Git-Sync Tool                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Scheduler   │───▶│ Coordinator  │───▶│  State DB    │       │
│  │ (node-cron)  │    │ (多任务调度)  │    │  (SQLite)    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Sync Engine                             │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌──────────────────────┐  │   │
│  │  │  Git    │─▶│ Author      │─▶│  Push to Internal    │  │   │
│  │  │  Fetch  │  │ Rewrite     │  │  (force-with-lease)  │  │   │
│  │  │(simple- │  │(git-filter- │  └──────────────────────┘  │   │
│  │  │  git)   │  │repo+execa)  │                             │   │
│  │  └─────────┘  └─────────────┘                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Mapping Registry (Author Rules)                  │   │
│  │   Git commit email → Internal name/email                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 组件职责

| 组件 | 职责 | 技术实现 |
|------|------|---------|
| **Scheduler** | 定时触发同步任务 | node-cron |
| **Coordinator** | 多任务调度、并发控制 | 自实现队列 |
| **State DB** | 状态持久化、hash 映射 | better-sqlite3 |
| **Sync Engine** | Git 操作、历史重写 | simple-git + execa |
| **Mapping Registry** | 作者映射规则管理 | YAML 配置 |
| **TUI** | 交互式界面 | Ink + @inkjs/ui |
| **CLI** | 命令行入口 | Commander |

---

## 4. 技术选型决策

### 4.1 技术栈总览

| 类别 | 选择 | 原因 |
|------|------|------|
| **语言** | TypeScript | 类型安全，Ink 原生支持 |
| **TUI** | Ink + @inkjs/ui | React 组件模型，活跃维护 (v7.0.1) |
| **Git 操作** | simple-git | CLI 包装，TypeScript 支持，3.8k stars |
| **历史重写** | git-filter-repo (CLI) | 官方推荐，通过 execa 调用 |
| **进程调用** | execa | Promise API，优于 child_process |
| **状态存储** | better-sqlite3 | 同步 API，11x 更快，事务支持 |
| **定时调度** | node-cron | 简单 cron 语法，轻量级 |
| **CLI 参数** | Commander | 简洁 API，适合中等复杂度 |
| **配置解析** | js-yaml | YAML 配置文件支持 |
| **运行时** | Node.js 20+ | LTS 版本，稳定可靠 |

### 4.2 为什么选择纯 Node.js 方案

| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| **纯 Node.js** | 统一技术栈，调试简单 | 需通过 CLI 调用 git-filter-repo | ✅ 采用 |
| **Node.js + Python 混合** | 可使用 Python 库 | IPC 复杂，多语言维护成本高 | ❌ 不采用 |

### 4.3 Ink vs 其他 TUI 库

| 库 | Stars | 维护状态 | Paradigm | 推荐度 |
|----|-------|---------|----------|--------|
| **Ink** | 35.6k | Active (2026) | React/声明式 | ✅ 推荐 |
| Blessed | 11.8k | Dead (2017) | 命令式/widgets | ❌ |
| terminal-kit | 3.3k | Active | 命令式 | ⚠️ |

**选择 Ink 的原因**：
- React 组件模型，熟悉度高
- Flexbox 布局（CSS-like）
- TypeScript 原生支持
- 丰富的 UI 组件库（@inkjs/ui）
- 生产验证（Claude Code、GitHub Copilot CLI 使用）

### 4.4 Git 历史重写工具对比

| 工具 | 性能 | 维护状态 | 推荐度 |
|------|------|---------|--------|
| **git-filter-repo** | 10-50x faster | 官方推荐 | ✅ 推荐 |
| git filter-branch | 极慢 | 已废弃 | ❌ |
| BFG Repo-Cleaner | 快 | 不支持作者重写 | ❌ |

---

## 5. 配置文件设计

### 5.1 配置文件格式 (YAML)

```yaml
# git-sync.yaml
version: 1

# 全局设置
settings:
  state_dir: /app/state              # 状态数据库目录
  repo_dir: /app/repos               # 仓库工作目录
  log_level: INFO                    # 日志级别
  max_concurrent: 5                  # 最大并行同步数
  default_schedule: "0 0 */7 * *"    # 默认每7天凌晨执行
  timezone: "Asia/Shanghai"          # 时区
  retry:
    max_attempts: 5                  # 最大重试次数
    initial_delay: 1s                # 初始延迟
    max_delay: 30s                   # 最大延迟
    factor: 2.0                      # 退避因子

# 全局作者映射（所有仓库共享）
author_mappings:
  - match_email: "alice@personal.com"
    internal_name: "Alice Wang"
    internal_email: "alice.wang@internal.corp"
  
  - match_email: "bob@gmail.com"
    internal_name: "Bob Zhang"
    internal_email: "bob.zhang@internal.corp"
  
  - match_email: "contractor@agency.com"
    internal_name: "Contractor Dev"
    internal_email: "contractor.dev@internal.corp"

# 同步任务组
sync_tasks:
  - name: production-services
    description: "核心服务仓库"
    schedule: "0 0 */7 * *"          # 可覆盖全局设置
    repos:
      - id: api-service
        github_url: git@github.com:org/api-service.git
        internal_url: git@git.internal.corp:mirrors/api-service.git
        branches:                    # 要同步的分支
          - main
          - release/*
        tags: true                    # 同步所有 tags
        auth:
          type: ssh
        
      - id: auth-service
        github_url: git@github.com:org/auth-service.git
        internal_url: git@git.internal.corp:mirrors/auth-service.git
        branches: ["main", "develop"]
        auth:
          type: ssh
        # 局部覆写：此仓库特有的映射规则（优先于全局）
        author_mappings:
          - match_email: "alice@personal.com"
            internal_name: "Alice Wang (Auth Team)"
            internal_email: "alice.auth@internal.corp"
          
          - match_email: "temp@outsourcing.com"
            internal_name: "Temp Developer"
            internal_email: "temp.dev@internal.corp"

  - name: backup-repos
    description: "备份仓库，每日同步"
    schedule: "0 2 * * *"            # 每天凌晨2点
    repos:
      - id: legacy-system
        github_url: git@github.com:org/legacy.git
        internal_url: git@git.internal.corp:mirrors/legacy.git
        branches: ["*"]              # 所有分支
        depth: 0                     # 完整历史（非浅克隆）
        auth:
          type: ssh
```

### 5.2 配置合并规则

作者映射合并逻辑：

```
最终映射 = 全局映射 + 局部映射（冲突时局部优先）
```

示例：
```typescript
// 全局: alice@personal.com → Alice Wang / alice.wang@internal.corp
// 局部: alice@personal.com → Alice Wang (Auth Team) / alice.auth@internal.corp
// 结果: 局部优先 → Alice Wang (Auth Team) / alice.auth@internal.corp

// 全局: bob@gmail.com → Bob Zhang / bob.zhang@internal.corp
// 局部: 无 bob 的映射
// 结果: 全局生效 → Bob Zhang / bob.zhang@internal.corp

// 局部: temp@outsourcing.com → Temp Developer / temp.dev@internal.corp
// 全局: 无 temp 的映射
// 结果: 仅局部生效 → Temp Developer / temp.dev@internal.corp
```

---

## 6. 认证方案

### 6.1 支持的认证方式

| 认证方式 | 适用平台 | 配置字段 |
|---------|---------|---------|
| **SSH** | 所有平台 | `type: ssh`，密钥挂载 |
| **HTTPS + Token** | GitHub、GitLab 等 | `token: ${GITHUB_TOKEN}` |
| **HTTPS + 用户名密码** | 传统内部平台 | `username/password` |
| **混合认证** | GitHub SSH + 内部 HTTPS | 分开配置 github/internal |

### 6.2 SSH 认证配置

**Docker Compose**：
```yaml
services:
  git-sync:
    volumes:
      # SSH 密钥挂载（只读）
      - ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro
      - ~/.ssh/id_rsa.pub:/app/.ssh/id_rsa.pub:ro
      - ~/.ssh/known_hosts:/app/.ssh/known_hosts:ro
    environment:
      - GIT_SSH_COMMAND=ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new
```

**配置文件**：
```yaml
repos:
  - id: api-service
    github_url: git@github.com:org/api-service.git
    internal_url: git@git.internal.corp:mirrors/api-service.git
    auth:
      type: ssh
```

### 6.3 HTTPS 认证配置

**Token 认证（GitHub 等）**：
```yaml
repos:
  - id: web-app
    github_url: https://github.com/org/web-app.git
    internal_url: https://git.internal.corp/mirrors/web-app.git
    auth:
      type: https
      github:
        token: ${GITHUB_TOKEN}
      internal:
        token: ${INTERNAL_TOKEN}
```

**用户名密码认证（传统平台）**：
```yaml
repos:
  - id: legacy-service
    github_url: git@github.com:org/legacy.git
    internal_url: https://git.internal.corp/legacy.git
    auth:
      type: mixed
      github:
        method: ssh
      internal:
        method: https
        username: ${INTERNAL_USER}
        password: ${INTERNAL_PASSWORD}
```

### 6.4 认证信息注入实现

```typescript
/**
 * 将认证信息注入 HTTPS URL
 * 
 * Token 认证: https://git:TOKEN@github.com/org/repo.git
 * 用户名密码: https://USER:PASS@git.internal.corp/repo.git
 */
export function buildAuthUrl(
  baseUrl: string,
  auth?: { 
    username?: string; 
    password?: string; 
    token?: string;
  }
): string {
  if (!auth) return baseUrl;
  
  const urlObj = new URL(baseUrl);
  
  // Token 认证
  if (auth.token) {
    urlObj.username = auth.username || 'git';
    urlObj.password = auth.token;
  }
  // 用户名密码认证
  else if (auth.username && auth.password) {
    urlObj.username = auth.username;
    urlObj.password = auth.password;
  }
  
  return urlObj.toString();
}
```

---

## 7. 部署方案

### 7.1 Docker 部署

**Dockerfile**：
```dockerfile
FROM node:20-slim

# 安装 git 和 git-filter-repo
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    && pip3 install git-filter-repo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# 复制编译后的代码
COPY dist/ ./dist/
COPY config/ ./config/

# 数据卷
VOLUME ["/app/config", "/app/state", "/app/repos"]

# 环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 入口
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["daemon"]
```

**docker-compose.yaml**：
```yaml
version: '3.8'

services:
  git-sync:
    build: .
    container_name: git-sync
    volumes:
      - ./config:/app/config
      - ./state:/app/state
      - ./repos:/app/repos
      # SSH 密钥（只读）
      - ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro
      - ~/.ssh/id_rsa.pub:/app/.ssh/id_rsa.pub:ro
      - ~/.ssh/known_hosts:/app/.ssh/known_hosts:ro
    environment:
      - TZ=Asia/Shanghai
      - GIT_SSH_COMMAND=ssh -i /app/.ssh/id_rsa -o StrictHostKeyChecking=accept-new
      # HTTPS 认证（可选）
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}
      - INTERNAL_GIT_TOKEN=${INTERNAL_GIT_TOKEN:-}
      - INTERNAL_USER=${INTERNAL_USER:-}
      - INTERNAL_PASSWORD=${INTERNAL_PASSWORD:-}
    restart: unless-stopped
```

### 7.2 启动命令

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 手动触发同步
docker-compose exec git-sync node dist/cli.js sync --repo api-service
```

---

## 8. CLI/TUI 设计

### 8.1 CLI 命令设计

```bash
# 查看状态
git-sync status                          # 查看所有仓库状态
git-sync status --repo api-service       # 查看指定仓库状态
git-sync status --json                   # JSON 格式输出

# 手动同步
git-sync sync                            # 同步所有仓库
git-sync sync --repo api-service         # 同步指定仓库
git-sync sync --force                    # 强制全量同步（跳过增量）
git-sync sync --dry-run                  # 预演模式（不实际执行）

# 配置管理
git-sync config show                     # 显示当前配置
git-sync config validate                 # 验证配置文件
git-sync config add-repo                 # 添加新仓库配置（交互式）
git-sync config edit-mapping             # 编辑作者映射（交互式）

# 历史查看
git-sync logs                            # 查看同步日志
git-sync logs --repo api-service         # 指定仓库日志
git-sync logs --tail 100                 # 最近 100 条
git-sync history                         # 查看同步历史记录

# TUI 模式
git-sync tui                             # 启动交互式界面
git-sync dashboard                       # 同上（别名）

# 服务管理
git-sync daemon                          # 启动守护进程模式
git-sync daemon --stop                   # 停止守护进程
git-sync daemon --status                 # 守护进程状态

# 工具命令
git-sync check-auth                      # 检查认证是否正常
git-sync check-filter-repo               # 检查 git-filter-repo 是否安装
git-sync version                         # 显示版本信息
```

### 8.2 TUI 界面设计

```
┌─────────────────────────────────────────────────────────────────┐
│  Git-Sync Dashboard                                    v1.0.0    │
├─────────────────────────────────────────────────────────────────┤
│  Status: 5 repos │ 3 synced today │ 2 pending │ Next: 6h 32m   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Repository Status:                                              │
│  ┌─────────────┬──────────┬───────────┬──────────┬────────────┐ │
│  │ Repo ID     │ Status   │ Last Sync │ Commits  │ Branches   │ │
│  ├─────────────┼──────────┼───────────┼──────────┼────────────┤ │
│  │ api-service │ ✓ Synced │ 2h ago    │ +23      │ main, r/*  │ │
│  │ auth-service│ ✓ Synced │ 2h ago    │ +5       │ main, dev  │ │
│  │ web-app     │ ◐ Syncing│ 45%       │ --       │ main       │ │
│  │ data-pipe   │ ⏳ Pending│ never     │ ~500     │ main       │ │
│  │ archive     │ ⏳ Pending│ never     │ ~2000    │ *          │ │
│  └─────────────┴──────────┴───────────┴──────────┴────────────┘ │
│                                                                  │
│  Current Task: web-app                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [████████████████░░░░░░░░░░░░░░░░░░░░] 45%                  ││
│  │ Fetching: 89/200 commits                                    ││
│  │ Rewriting author: bob@gmail.com → Bob Zhang                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Recent Logs:                                                    │
│  ✓ api-service: Synced 23 commits to internal                   │
│  ✓ auth-service: Synced 5 commits, 2 authors rewritten          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Keys: [s] Sync all │ [r] Sync selected │ [l] Logs │ [q] Quit   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 TUI 组件架构

```typescript
// src/tui/App.tsx
function GitSyncApp() {
  return (
    <Box flexDirection="column" height="100%">
      <Header />
      <RepoList />
      <SyncStatus />
      <TaskLog />
      <Footer />
    </Box>
  );
}

// 组件职责
| 组件 | 职责 | Ink 组件 |
|------|------|---------|
| Header | 顶部统计信息 | Box, Text |
| RepoList | 仓库列表（可选中） | Box, Text, useInput |
| SyncStatus | 当前同步状态 | Box, ProgressBar (@inkjs/ui) |
| TaskLog | 完成的任务日志 | Static（持久输出） |
| Footer | 进度条、快捷键提示 | Box, Text |
```

---

## 9. 核心流程设计

### 9.1 单仓库同步流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     Single Repo Sync Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: INIT                                                   │
│  ├─▶ Load repo config & merged author mappings                  │
│  ├─▶ Verify git-filter-repo installed                           │
│  ├─▶ Check/create local worktree                                │
│  ├─▶ Initialize state record if new repo                        │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  Phase 2: FETCH                                                  │
│  ├─▶ Fetch all configured branches from GitHub                  │
│  ├─▶ Identify new commits (since last sync hash)                │
│  ├─▶ Query mapping table for already-synced commits             │
│  ├─▶ Filter commits needing author rewrite                      │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  Phase 3: REWRITE                                                │
│  ├─▶ Generate .mailmap file from author mappings                │
│  ├─▶ Execute git-filter-repo --mailmap via execa                │
│  ├─▶ Capture new commit hashes                                  │
│  ├─▶ Store old→new hash mappings in state DB                    │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  Phase 4: PUSH                                                   │
│  ├─▶ Create backup tag on internal repo                         │
│  ├─▶ Push all branches to internal (force-with-lease)           │
│  ├─▶ Push tags if configured                                    │
│  ├─▶ Verify push success                                        │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  Phase 5: CLEANUP                                                │
│  ├─▶ Update sync state timestamp                                │
│  ├─▶ Garbage collect old worktrees                              │
│  ├─▶ Prune stale backup tags (older than N days)                │
│  ├─▶ Write sync log                                             │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 .mailmap 文件生成

Git 的 `.mailmap` 文件格式用于作者重写：

```bash
# .mailmap 格式
# 正确名称 <正确邮箱> 错误名称 <错误邮箱>
# 或简写：
# 正确名称 <正确邮箱> <错误邮箱>

Alice Wang <alice.wang@internal.corp> <alice@personal.com>
Bob Zhang <bob.zhang@internal.corp> <bob@gmail.com>
Contractor Dev <contractor.dev@internal.corp> <contractor@agency.com>
```

**生成代码**：
```typescript
// src/utils/mailmap-generator.ts
export function generateMailmap(mappings: AuthorMapping[]): string {
  return mappings
    .map(m => `${m.internal_name} <${m.internal_email}> <${m.match_email}>`)
    .join('\n');
}
```

### 9.3 git-filter-repo 调用

```typescript
// src/core/author-rewrite.ts
import { execa } from 'execa';
import fs from 'fs/promises';

export async function rewriteAuthors(
  repoPath: string,
  mailmapPath: string
): Promise<void> {
  // 检查 git-filter-repo 是否安装
  await checkFilterRepoInstalled();
  
  // 执行重写
  const result = await execa('git-filter-repo', [
    '--mailmap', mailmapPath,
    '--force',
  ], {
    cwd: repoPath,
    reject: false,
  });
  
  if (result.failed) {
    throw new Error(`Author rewrite failed: ${result.stderr}`);
  }
}

async function checkFilterRepoInstalled(): Promise<void> {
  try {
    await execa('git-filter-repo', ['--version']);
  } catch {
    throw new Error('git-filter-repo not installed. Run: pip install git-filter-repo');
  }
}
```

---

## 10. 项目结构

```
git-sync/
├── docs/
│   ├── DESIGN.md              # 本设计文档
│   └── README.md              # 用户文档
├── config/
│   ├── git-sync.yaml          # 默认配置示例
│   └── schema.json            # 配置验证 schema
├── src/
│   ├── cli.ts                 # CLI 入口，Commander 参数解析
│   ├── tui/
│   │   ├── App.tsx            # Ink 主应用
│   │   ├── components/
│   │   │   ├── Dashboard.tsx  # 主仪表盘
│   │   │   ├── RepoList.tsx   # 仓库列表面板
│   │   │   ├── SyncStatus.tsx # 同步状态面板
│   │   │   ├── TaskLog.tsx    # 任务日志（Static 组件）
│   │   │   ├── Header.tsx     # 顶部统计
│   │   │   ├── Footer.tsx     # 底部进度条+快捷键
│   │   │   └── ProgressBar.tsx
│   │   └── hooks/
│   │       ├── useGitSync.ts  # Git 同步逻辑
│   │       ├── useKeyboard.ts # 键盘导航
│   │       ├── useConfig.ts   # 配置加载
│   │       └── useAppState.ts # 全局状态管理
│   ├── core/
│   │   ├── git-operations.ts  # Git 操作封装 (simple-git)
│   │   ├── author-rewrite.ts  # 作者重写逻辑 (execa + git-filter-repo)
│   │   ├── state-manager.ts   # SQLite 状态管理
│   │   ├── scheduler.ts       # 定时调度 (node-cron)
│   │   ├── config-loader.ts   # YAML 配置解析
│   │   ├── sync-engine.ts     # 同步引擎核心
│   │   └── coordinator.ts     # 多任务协调器
│   ├── types/
│   │   ├── config.ts          # 配置类型定义
│   │   ├── state.ts           # 状态类型定义
│   │   └ sync.ts              # 同步任务类型
│   │   └ auth.ts              # 认证类型
│   │   └ mapping.ts           # 作者映射类型
│   │   └── log.ts             # 日志类型
│   └ utils/
│   │   ├── logger.ts          # 日志工具
│   │   ├── mailmap-generator.ts # .mailmap 文件生成
│   │   ├── auth-url-builder.ts # 认证 URL 构建
│   │   ├── config-merger.ts   # 配置合并工具
│   │   └ error-handler.ts     # 错误处理
│   │   └ retry.ts             # 重试逻辑
│   │   └ progress.ts          # 进度计算
│   └── daemon.ts              # 守护进程入口
├── dist/                      # 编译输出
├── tests/
│   ├── unit/
│   └ integration/
├── Dockerfile
├── docker-compose.yaml
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .gitignore
└── README.md
```

---

## 11. 数据模型设计

### 11.1 SQLite 数据库 Schema

```sql
-- 同步状态表
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT UNIQUE NOT NULL,
    last_sync_hash TEXT,           -- 上次同步后的最新 commit hash
    last_sync_time DATETIME,
    sync_phase TEXT DEFAULT 'idle', -- idle, fetching, rewriting, pushing, complete
    failure_count INTEGER DEFAULT 0,
    last_error TEXT,
    config_json TEXT,              -- JSON 编码的仓库配置
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Commit hash 映射表
CREATE TABLE commit_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    github_hash TEXT NOT NULL,     -- 原始 GitHub commit SHA
    internal_hash TEXT NOT NULL,   -- 重写后的内部 commit SHA
    author_email TEXT,             -- 原作者邮箱
    rewritten_email TEXT,          -- 重写后邮箱
    sync_time DATETIME,
    UNIQUE(repo_id, github_hash)
);

CREATE INDEX idx_github_hash ON commit_mapping(github_hash);
CREATE INDEX idx_internal_hash ON commit_mapping(internal_hash);
CREATE INDEX idx_repo_mapping ON commit_mapping(repo_id);

-- 同步日志表
CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    sync_time DATETIME NOT NULL,
    status TEXT NOT NULL,          -- success, failed, partial
    commits_synced INTEGER,
    commits_rewritten INTEGER,
    branches_synced TEXT,          -- JSON 数组
    duration_ms INTEGER,
    error_message TEXT,
    details_json TEXT
);

CREATE INDEX idx_sync_time ON sync_log(sync_time);
CREATE INDEX idx_repo_log ON sync_log(repo_id);

-- 备份记录表
CREATE TABLE backup_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    backup_tag TEXT NOT NULL,      -- backup-YYYYMMDD-HHMM
    created_at DATETIME,
    expires_at DATETIME,           -- 过期时间，用于清理
    UNIQUE(repo_id, backup_tag)
);
```

### 11.2 TypeScript 类型定义

```typescript
// src/types/config.ts
export interface GitSyncConfig {
  version: number;
  settings: Settings;
  author_mappings: AuthorMapping[];
  sync_tasks: SyncTaskGroup[];
}

export interface Settings {
  state_dir: string;
  repo_dir: string;
  log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  max_concurrent: number;
  default_schedule: string;        // cron 表达式
  timezone: string;
  retry: RetryConfig;
}

export interface AuthorMapping {
  match_email: string;
  internal_name: string;
  internal_email: string;
}

export interface SyncTaskGroup {
  name: string;
  description?: string;
  schedule?: string;               // 覆盖全局
  repos: RepoConfig[];
}

export interface RepoConfig {
  id: string;
  github_url: string;
  internal_url: string;
  branches: string[];              // ['main', 'release/*', '*']
  tags?: boolean;
  depth?: number;                  // 0 = 完整历史
  auth: AuthConfig;
  author_mappings?: AuthorMapping[]; // 局部覆写
}

export interface AuthConfig {
  type: 'ssh' | 'https' | 'mixed';
  github?: {
    method: 'ssh' | 'https';
    token?: string;
    username?: string;
  };
  internal?: {
    method: 'ssh' | 'https';
    token?: string;
    username?: string;
    password?: string;
  };
}

// src/types/state.ts
export interface SyncState {
  repo_id: string;
  last_sync_hash: string | null;
  last_sync_time: Date | null;
  sync_phase: 'idle' | 'fetching' | 'rewriting' | 'pushing' | 'complete';
  failure_count: number;
  last_error: string | null;
}

export interface CommitMapping {
  repo_id: string;
  github_hash: string;
  internal_hash: string;
  author_email: string;
  rewritten_email: string;
  sync_time: Date;
}

// src/types/sync.ts
export interface SyncTask {
  id: string;
  repo: RepoConfig;
  mergedMappings: AuthorMapping[]; // 合并后的映射
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;                // 0-100
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface SyncResult {
  repo_id: string;
  status: 'success' | 'failed' | 'partial';
  commits_synced: number;
  commits_rewritten: number;
  branches_synced: string[];
  duration_ms: number;
  error?: string;
}
```

---

## 12. 安全措施

### 12.1 认证安全

| 措施 | 描述 |
|------|------|
| SSH 密钥只读挂载 | 防止容器内修改密钥 |
| HTTPS Token 环境变量 | 不硬编码在配置文件中 |
| StrictHostKeyChecking | `accept-new` 防止 MITM，但允许新主机 |
| 密码不在日志中显示 | 日志输出时过滤敏感信息 |

### 12.2 操作安全

| 措施 | 描述 |
|------|------|
| 备份 tag | 每次同步前创建 backup tag |
| force-with-lease | 检测远程变化，防止覆盖他人提交 |
| 内部仓库限制 | 只接收同步推送，禁止其他用户 push |
| 配置验证 | 启动前验证配置完整性 |

### 12.3 错误处理

| 场景 | 处理 |
|------|------|
| 认证失败 | 记录日志，通知用户，不重试（需人工修复） |
| 网络超时 | 自动重试（指数退避） |
| git-filter-repo 未安装 | 启动时检查，提示安装 |
| 未映射作者 | 可配置：警告继续 或 拒绝同步 |

---

## 13. 风险与规避措施

### 13.1 技术风险

| 风险 | 影响 | 规避措施 |
|------|------|---------|
| GitHub force push | 历史冲突，映射失效 | 检测历史变化，触发全量重新同步 |
| 大仓库性能 | 同步耗时过长 | 增量同步，进度显示，超时配置 |
| Commit hash 全变 | 状态追踪困难 | 双向映射表，增量追加策略 |
| 分支未同步完整 | 内部仓库不完整 | 分支列表检查，同步验证 |

### 13.2 运维风险

| 风险 | 影响 | 规避措施 |
|------|------|---------|
| 认证过期 | 无法 fetch/push | Token 过期检测，提前告警 |
| 配置错误 | 同步失败 | 配置验证，dry-run 模式 |
| 容器崩溃 | 状态丢失 | SQLite 持久化，容器重启恢复 |

### 13.3 未映射作者处理策略

```yaml
settings:
  unmapped_author_policy: "warn"  # warn（警告继续）或 reject（拒绝同步）
```

**实现**：
```typescript
// 同步前检测未映射作者
const unmappedAuthors = await detectUnmappedAuthors(repoPath, mergedMappings);

if (unmappedAuthors.length > 0) {
  if (settings.unmapped_author_policy === 'reject') {
    throw new Error(`Unmapped authors found: ${unmappedAuthors.join(', ')}`);
  } else {
    logger.warn(`Unmapped authors (will not be rewritten): ${unmappedAuthors.join(', ')}`);
  }
}
```

---

## 附录

### A. Cron 表达式参考

| 表达式 | 含义 |
|--------|------|
| `0 0 */7 * *` | 每 7 天凌晨执行 |
| `0 2 * * *` | 每天凌晨 2 点 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 0 1 * *` | 每月 1 日凌晨 |
| `0 9-17 * * 1-5` | 工作日 9-17 点每小时 |

### B. Git Filter-Repo 常用命令

```bash
# 查看版本
git-filter-repo --version

# 使用 mailmap 重写作者
git-filter-repo --mailmap .mailmap --force

# 只重写特定邮箱
git-filter-repo --email-callback '
  return email.replace(b"old@example.com", b"new@example.com")
'

# 分析仓库历史
git-filter-repo --analyze
```

### C. 相关文档链接

- [git-filter-repo 官方文档](https://github.com/newren/git-filter-repo)
- [Ink 官方文档](https://github.com/vadimdemedes/ink)
- [simple-git 文档](https://github.com/steveukx/git-js)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [node-cron 文档](https://github.com/kelektiv/node-cron)

---

**文档版本**: v1.0  
**创建日期**: 2026-04-28  
**状态**: 设计完成，待实现