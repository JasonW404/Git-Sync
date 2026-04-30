# Ubuntu/WSL2 直接安装指南

本文档介绍如何在不使用 Docker 的情况下，直接在 Ubuntu 或 WSL2 环境中安装和使用 Git-Sync。

## 前置要求

- Ubuntu 20.04+ 或 WSL2 (Ubuntu)
- Node.js 20+
- Python 3 + pip
- Git

---

## 安装步骤

### 1. 安装 Node.js 20

```bash
# 使用 NodeSource 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version  # 应显示 v20.x.x
npm --version
```

### 2. 安装 Python 和 git-filter-repo

```bash
# 安装 Python 和 pip（如未安装）
sudo apt install -y python3 python3-pip

# 安装 git-filter-repo
pip3 install git-filter-repo

# 验证安装
git-filter-repo --version
```

### 3. 克隆项目

```bash
# 克隆到本地
git clone https://github.com/JasonW404-HW/git-sync.git
cd git-sync
```

### 4. 安装 Node.js 依赖

```bash
npm install
```

### 5. 构建项目

```bash
npm run build
```

### 6. 配置 SSH 密钥

```bash
# 确保 SSH 密钥存在
ls ~/.ssh/id_rsa

# 如果没有，生成新密钥
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa

# 将公钥添加到 GitHub
cat ~/.ssh/id_rsa.pub
# 复制内容到 GitHub → Settings → SSH and GPG keys → New SSH key

# 测试连接
ssh -T git@github.com
```

### 7. 创建配置文件

```bash
# 复制示例配置
cp config/git-sync.yaml.example config/git-sync.yaml

# 编辑配置
vim config/git-sync.yaml
```

**配置示例：**

```yaml
version: 1

settings:
  repo_dir: ~/git-sync/repos           # 使用本地目录
  default_schedule: "0 0 */7 * *"
  timezone: "Asia/Shanghai"
  max_concurrent: 1
  unmapped_author_policy: warn

author_mappings:
  - match_email: "your-email@gmail.com"
    internal_name: "Your Name"
    internal_email: "your-name@company.com"

sync_tasks:
  - name: my-sync
    repos:
      - id: my-repo
        github_url: git@github.com:your-org/your-repo.git
        internal_url: ~/git-sync/internal-repos/your-repo  # 本地路径
        branches: ["main"]
        auth:
          type: ssh
```

### 8. 创建内部仓库目录

```bash
# 创建工作目录
mkdir -p ~/git-sync/repos
mkdir -p ~/git-sync/internal-repos

# 如果内部仓库是本地 Git 服务器，创建 bare 仓库
cd ~/git-sync/internal-repos
git init --bare your-repo.git
```

---

## 使用方法

### 方式一：手动同步

```bash
# 同步所有仓库
node dist/cli.cjs sync -c config/git-sync.yaml

# 同步指定仓库
node dist/cli.cjs sync -c config/git-sync.yaml -r my-repo

# 查看状态
node dist/cli.cjs status -c config/git-sync.yaml --json
```

### 方式二：Daemon 模式（后台服务）

#### 使用 systemd（推荐）

```bash
# 创建 systemd 服务文件
sudo tee /etc/systemd/system/git-sync.service << 'EOF'
[Unit]
Description=Git-Sync Daemon
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/git-sync
ExecStart=/usr/bin/node dist/cli.cjs daemon -c config/git-sync.yaml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 替换 your-username 为你的用户名
sudo sed -i "s/your-username/$USER/g" /etc/systemd/system/git-sync.service

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable git-sync
sudo systemctl start git-sync

# 查看状态
sudo systemctl status git-sync

# 查看日志
journalctl -u git-sync -f
```

#### 使用 cron（简单方式）

```bash
# 添加 cron 任务
crontab -e

# 添加以下行（每天凌晨同步）
0 0 * * * cd ~/git-sync && node dist/cli.cjs sync -c config/git-sync.yaml >> ~/git-sync/logs/sync.log 2>&1

# 或每7天
0 0 */7 * * cd ~/git-sync && node dist/cli.cjs sync -c config/git-sync.yaml >> ~/git-sync/logs/sync.log 2>&1
```

### 方式三：TUI 模式（交互式）

```bash
# 启动 TUI
npm run tui config/git-sync.yaml

# 或直接用 tsx
npx tsx src/run-tui.ts config/git-sync.yaml
```

---

## 常用命令

```bash
# 验证配置
node dist/cli.cjs config validate -c config/git-sync.yaml

# 显示配置
node dist/cli.cjs config show -c config/git-sync.yaml

# 检查 git-filter-repo
node dist/cli.cjs check-filter-repo

# 查看帮助
node dist/cli.cjs --help

# 运行测试
npm test
```

---

## WSL2 特殊注意事项

### 1. 持久化路径

WSL2 的文件系统在重启后会重置，建议将重要数据放在 Windows 挂载目录：

```yaml
# config/git-sync.yaml
settings:
  repo_dir: /mnt/c/git-sync/repos    # Windows 目录
```

```bash
# 创建 Windows 目录（在 WSL2 中）
mkdir -p /mnt/c/git-sync/repos
mkdir -p /mnt/c/git-sync/internal-repos
```

### 2. systemd 支持

WSL2 默认不支持 systemd，可以使用 cron 或手动运行：

```bash
# 使用 cron
crontab -e
# 添加定时任务

# 或手动启动 daemon（后台运行）
nohup node dist/cli.cjs daemon -c config/git-sync.yaml > ~/git-sync/logs/daemon.log 2>&1 &
```

### 3. SSH 密钥持久化

```bash
# 将 SSH 密钥放在 Windows 目录
mkdir -p /mnt/c/git-sync/.ssh
cp ~/.ssh/id_rsa /mnt/c/git-sync/.ssh/

# 每次启动时恢复
ln -sf /mnt/c/git-sync/.ssh/id_rsa ~/.ssh/id_rsa
```

---

## 更新和维护

### 更新代码

```bash
cd ~/git-sync
git pull
npm install
npm run build
```

### 清理工作目录

```bash
# 清理仓库工作目录
rm -rf ~/git-sync/repos/*

# 强制重新同步
node dist/cli.cjs sync --force
```

### 查看日志

```bash
# systemd 日志
journalctl -u git-sync -f

# cron 日志
tail -f ~/git-sync/logs/sync.log

# 手动运行日志
node dist/cli.cjs sync -c config/git-sync.yaml 2>&1 | tee sync.log
```

---

## 快速安装脚本

将所有步骤整合为一个脚本：

```bash
#!/bin/bash
# install.sh - Git-Sync 快速安装

set -e

echo "=== Git-Sync 安装脚本 ==="

# 1. 安装 Node.js 20
echo "1. 安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. 安装 Python 和 git-filter-repo
echo "2. 安装 git-filter-repo..."
sudo apt install -y python3 python3-pip
pip3 install git-filter-repo

# 3. 克隆项目
echo "3. 克隆项目..."
cd ~
git clone https://github.com/JasonW404-HW/git-sync.git
cd git-sync

# 4. 安装依赖并构建
echo "4. 安装依赖..."
npm install
npm run build

# 5. 创建目录
echo "5. 创建工作目录..."
mkdir -p ~/git-sync/repos
mkdir -p ~/git-sync/internal-repos
mkdir -p ~/git-sync/logs

# 6. 复制配置示例
echo "6. 创建配置文件..."
cp config/git-sync.yaml.example config/git-sync.yaml

echo ""
echo "=== 安装完成 ==="
echo ""
echo "下一步："
echo "  1. 编辑配置文件: vim ~/git-sync/config/git-sync.yaml"
echo "  2. 配置 SSH 密钥: ssh-keygen -t rsa -b 4096"
echo "  3. 测试同步: node ~/git-sync/dist/cli.cjs sync -c ~/git-sync/config/git-sync.yaml"
echo ""
```

使用方法：

```bash
# 下载并运行
curl -fsSL https://raw.githubusercontent.com/JasonW404-HW/git-sync/main/install.sh | bash

# 或本地运行
chmod +x install.sh
./install.sh
```

---

## 目录结构

安装完成后的目录结构：

```
~/git-sync/
├── config/
│   └── git-sync.yaml     # 配置文件
├── dist/
│   └── cli.cjs           # 构建后的 CLI
├── repos/
│   └── my-repo/          # 仓库工作目录
├── internal-repos/
│   └── my-repo.git/      # 内部仓库（bare）
├── logs/
│   ├── sync.log          # 同步日志
│   └── daemon.log        # Daemon 日志
├── src/                  # 源代码
├── package.json
└── ...
```

---

## 示例：完整工作流程

```bash
# 1. 配置 SSH 密钥
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
cat ~/.ssh/id_rsa.pub  # 添加到 GitHub

# 2. 测试 GitHub 连接
ssh -T git@github.com

# 3. 编辑配置
vim ~/git-sync/config/git-sync.yaml

# 4. 创建内部仓库
cd ~/git-sync/internal-repos
git init --bare my-repo.git

# 5. 验证配置
node ~/git-sync/dist/cli.cjs config validate

# 6. 测试同步
node ~/git-sync/dist/cli.cjs sync

# 7. 查看结果
cd ~/git-sync/internal-repos/my-repo.git
git log --format="%an <%ae>" -5

# 8. 设置定时同步（可选）
crontab -e
# 添加: 0 0 */7 * * cd ~/git-sync && node dist/cli.cjs sync >> logs/sync.log 2>&1
```

---

## 问题排查

### git-filter-repo 未找到

```bash
# 确保 pip 安装路径在 PATH
echo $PATH

# 如果不在，添加到 PATH
export PATH="$HOME/.local/bin:$PATH"

# 或使用完整路径
~/.local/bin/git-filter-repo --version
```

### Node.js 版本不对

```bash
# 检查版本
node --version

# 如果版本低于 20，重新安装
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### SSH 认证失败

```bash
# 检查密钥权限
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub

# 测试连接
ssh -vT git@github.com
```

### 内部仓库推送失败

```bash
# 检查仓库是否存在
ls ~/git-sync/internal-repos/

# 确保是 bare 仓库
cd ~/git-sync/internal-repos/my-repo.git
git rev-parse --is-bare-repository  # 应输出 "true"
```