# DIP for Supply Chain (SupplyChainBrain)

供应链大脑 (Supply Chain Brain) 是一个基于 DIP (Data Intelligence Platform) 的供应链管理智能应用。

## 目录结构

- `src/`: 前端源代码 (React + Vite)
- `backend/`: 预测服务 (Python + Prophet)
- `buildkit/`: DIP 应用打包工具
- `scripts/`: 辅助脚本

## 开发指南 (Development Mode)

在开发模式下，前端直接连接到 ADP 环境。

### 1. 环境准备

- Node.js (v18+)
- Python (v3.10+)
- uv (Python 包管理工具)

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local` 并配置你的 ADP Token：

```bash
cp .env.example .env.local
```

在 `.env.local` 中设置：
```ini
VITE_AGENT_API_TOKEN=your_actual_token_here
```

### 3. 启动应用

安装依赖并启动前端开发服务器：

```bash
npm install
npm run dev
```

启动后端预测服务 (如需要)：

```bash
cd backend
# 创建并激活虚拟环境
python -m venv venv
# Windows
.\venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
python run.py
```

## 用户使用模式 (User Mode)

用户模式下，应用被打包为 `.dip` 文件，并通过 DIP 应用商店安装。

### 1. 打包应用

本项目使用 `buildkit` 进行打包。

```bash
cd buildkit
uv venv
# Windows
.\.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate

# 构建 AMD64 架构包
uv run scripts/build_package.py --arch=amd64

# 构建 ARM64 架构包
uv run scripts/build_package.py --arch=arm64
```

### 2. 获取安装包

打包完成后，在 `buildkit/.cache/<timestamp>/package/` 目录下找到生成的 `.dip` 文件。

### 3. 安装

1. 登录 DIP 平台。
2. 进入应用商店。
3. 上传并安装生成的 `.dip` 文件。
