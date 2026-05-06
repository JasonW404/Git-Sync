# Git-Sync (Python Version)

将 GitHub 仓库同步到内部代码仓库，并自动替换 commit 作者信息。

## 功能特性

- 定时同步 GitHub 仓库到内部仓库
- 自动替换 commit 作者信息 (user.name & user.email)
- 支持多仓库、多分支同步
- 全局作者映射 + 仓库局部覆写
- CLI 完整命令支持
- TUI 交互式仪表盘 (Textual)
- 单文件可执行文件打包 (PyInstaller)

## 安装

### 方式一：pip 安装

```bash
pip install -e .
```

### 方式二：使用预编译可执行文件

```bash
# 打包
pyinstaller build.spec --onefile

# 输出: dist/git-sync
```

## 系统要求

- Python 3.10+
- git 命令行工具
- git-filter-repo (可选，用于作者重写)

```bash
# 安装 git-filter-repo
pip install git-filter-repo
```

## CLI 命令

```bash
# 查看状态
git-sync status [--json]

# 手动同步
git-sync sync [--repo <id>] [--force]

# 配置管理
git-sync config show
git-sync config validate

# TUI 模式
git-sync tui

# 服务管理
git-sync daemon [--stop]

# 检查依赖
git-sync check-filter-repo

# 版本信息
git-sync --version
```

## 配置示例

见 `config_py/git-sync.yaml.example`

## 开发

```bash
# 安装开发依赖
pip install -e ".[dev]"

# 运行测试
pytest tests_py/

# 类型检查
mypy src_py/git_sync

# 代码格式化
ruff check src_py/
```

## 打包说明

```bash
# 创建 hooks 目录
mkdir -p hooks

# 打包为单文件可执行文件
pyinstaller build.spec --onefile --clean

# 输出文件
dist/git-sync  # 约 20-30MB
```

## 许可证

MIT License