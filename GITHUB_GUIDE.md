# GitHub 源码仓库与开发协作指南

本文供首次克隆项目的开发者使用，覆盖环境准备、数据库初始化、密钥配置、前后端启动、构建验收与 GitHub 协作。项目为课程演示系统，不应直接承载真实患者数据或生产业务。

公开源码仓库：[qowieqq1123/outpatient-management-system](https://github.com/qowieqq1123/outpatient-management-system)

## 1. 项目与目录

本项目使用前后端分离的模块化单体架构：Spring Boot 提供 REST、JWT 与 STOMP WebSocket API；Vite 提供独立 SPA；MySQL 保存业务数据。

| 路径 | 内容 |
| --- | --- |
| `src/main/java/` | Spring Boot API、认证、权限、业务服务与持久层 |
| `src/main/resources/application.yml` | 服务端默认配置；数据库与加密密钥从环境变量读取 |
| `sql/mysql/01_schema.sql` | 创建 `outpatient` 数据库与业务表、视图、约束 |
| `sql/mysql/02_data.sql` | 插入课程演示角色、账号、科室、排班和业务样例 |
| `frontend/` | 独立 Vite SPA、页面样式、API 客户端与开发代理 |
| `scripts/` | UI、接口、并发、WebSocket、审计和图集验收脚本 |
| `deploy/nginx.conf.example` | 静态前端与后端 API/WebSocket 的同源部署示例 |
| `docs/` | PRD、SC/SD、数据库设计、追溯矩阵、用户手册与验收证据 |
| `docs/images/diagrams/` | 由 Mermaid 图源导出的 SVG/PNG 图集 |

设计基线和业务边界见 [`docs/00-文档索引与编写规范.md`](docs/00-文档索引与编写规范.md)、[`docs/01-产品需求文档PRD.md`](docs/01-产品需求文档PRD.md) 和 [`docs/05-需求追溯矩阵.md`](docs/05-需求追溯矩阵.md)。

## 2. 环境要求

- JDK 21。
- Apache Maven 3.9 或兼容版本；仓库当前未携带 Maven Wrapper。
- MySQL 8.0 或 9.x，InnoDB，字符集 `utf8mb4`；命令行客户端用于初始化数据库及运行部分验收脚本。
- Node.js 18 或更新版本以及 npm。
- 可选：Edge/Chrome 的远程调试端口，用于浏览器 UI 与 Mermaid 图集验收。

默认端口：MySQL `3306`、后端 `8080`、Vite `5173`；FAIL 模式验收还会使用后端 `8081`、前端 `5174`；浏览器自动化默认连接 CDP `9225`。如有端口冲突，可按验收脚本支持的环境变量覆盖。

## 3. 首次克隆和数据库初始化

```bash
git clone https://github.com/qowieqq1123/outpatient-management-system.git
cd outpatient-management-system
```

使用有建库权限的本地 MySQL 用户导入结构和演示数据。PowerShell 示例：

```powershell
mysql -h 127.0.0.1 -P 3306 -u root -p < sql/mysql/01_schema.sql
mysql -h 127.0.0.1 -P 3306 -u root -p outpatient < sql/mysql/02_data.sql
```

macOS/Linux 示例：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < sql/mysql/01_schema.sql
mysql -h 127.0.0.1 -P 3306 -u root -p outpatient < sql/mysql/02_data.sql
```

MySQL 会交互式询问密码。应用运行账号建议使用仅对 `outpatient` 数据库有权限的专用账号，不要在生产环境使用 `root`。验收脚本目前按本机 MySQL `root`、无密码的演示环境编写；更换数据库账号时，需同步调整脚本中的连接参数。

`02_data.sql` 中的患者、医生、挂号、排班和账号均为课程演示数据。首次启动会把带 `PLAIN:` 前缀的演示敏感字段迁移为加密值。请勿将真实患者资料导入后再上传到仓库。

## 4. 后端密钥和环境变量

数据库地址、用户名和密码，以及 JWT/AES 密钥均由环境变量提供。配置文件不会携带可用的固定密钥；缺少 JWT/AES 环境变量时，后端应拒绝启动。

### Windows PowerShell

在启动后端的 PowerShell 窗口中执行以下命令。首次生成密钥后，将两段密钥安全保存，并在同一开发数据库的后续运行中继续使用原值；AES 密钥改变后，已有加密字段将无法解密。

```powershell
$jwtBytes = New-Object byte[] 48
$aesBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($jwtBytes)
$rng.GetBytes($aesBytes)

$env:SPRING_DATASOURCE_URL = 'jdbc:mysql://127.0.0.1:3306/outpatient?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true'
$env:SPRING_DATASOURCE_USERNAME = 'outpatient_dev'
$env:SPRING_DATASOURCE_PASSWORD = '<本机数据库密码>'
$env:APP_SECURITY_JWT_SECRET = [Convert]::ToBase64String($jwtBytes)
$env:APP_CRYPTO_AES_KEY = [Convert]::ToBase64String($aesBytes)

mvn spring-boot:run
```

如果密钥已生成并保存到安全的本地密码库，后续运行时直接设置原有 `APP_SECURITY_JWT_SECRET` 与 `APP_CRYPTO_AES_KEY`，不要重新生成。不要把真实密钥写入 `application.yml`、提交到 Git，或发到聊天/工单中。

### macOS/Linux

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/outpatient?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true'
export SPRING_DATASOURCE_USERNAME='outpatient_dev'
export SPRING_DATASOURCE_PASSWORD='<本机数据库密码>'
export APP_SECURITY_JWT_SECRET="$(openssl rand -base64 48)"
export APP_CRYPTO_AES_KEY="$(openssl rand -base64 32)"
mvn spring-boot:run
```

不要每次重启都重新生成 AES 密钥。若使用上面的随机生成命令，首次生成后应将该密钥保存在本机安全存储中，并在后续 shell 中重新设置同一值。

## 5. 启动前后端

### 后端

在已配置数据库和密钥环境变量的终端中：

```bash
mvn spring-boot:run
```

后端提供 `http://127.0.0.1:8080`。根路径返回 JSON 服务标识；业务端点从 `/api` 开始。可用浏览器或 `curl` 检查：

```bash
curl http://127.0.0.1:8080/
```

### 前端

新开终端，在项目根目录执行：

```bash
npm ci --prefix frontend
npm --prefix frontend run dev
```

浏览器打开 `http://127.0.0.1:5173`。Vite 默认把 `/api` 和 `/ws` 代理到本机后端，开发时通常不需要设置 `VITE_API_BASE` 或 `VITE_WS_BASE`。

生产构建和本地预览：

```bash
npm --prefix frontend run build
npm --prefix frontend run preview
```

构建产物在 `frontend/dist/`，该目录已加入 `.gitignore`。部署拓扑和 Nginx 反向代理细节见 [`docs/07-前后端分离架构与部署说明.md`](docs/07-前后端分离架构与部署说明.md)。

### 医保失败重试演示（可选）

在后端密钥与数据库环境变量已配置的终端启动 FAIL 模式后端：

```bash
mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8081 --app.insurance.mode=FAIL"
```

前端的 FAIL 模式代理参数和演示步骤见 [`docs/08-用户手册.md`](docs/08-用户手册.md) 与 README 的“医保失败演示”。

## 6. 演示账号与功能路径

演示数据中所有账号的初始密码均为 `123456`：

| 角色 | 账号 |
| --- | --- |
| 患者 | `pt0001`、`pt0002` 等 `pt` 前缀账号 |
| 护士 | `nurse01` |
| 医生 | `zhangming`、`lihui` |
| 收费员 | `cashier01` |
| 药房人员 | `pharma01`、`pharma02` |
| 管理员 | `admin01` |

建议按患者挂号 → 护士报到 → 医生接诊及开单 → 收费员收费/退费 → 药房审核/发药 → 管理员维护与审计的顺序体验完整业务链。更多角色操作步骤和限制见 [`docs/08-用户手册.md`](docs/08-用户手册.md)。

这些账号和口令仅用于本地课程演示。部署到共享环境前，应替换账号口令、配置独立的数据库账号和随机密钥，并清除演示数据。

## 7. 构建与验收

基本构建：

```bash
mvn -DskipTests package
npm --prefix frontend run build
```

接口、业务与图集验收命令在 `frontend/package.json` 中定义。运行前应启动 MySQL、后端；UI 验收还要启动前端，并准备一个开放 CDP `9225` 的 Edge/Chrome 实例。

```bash
npm --prefix frontend run check:registration
npm --prefix frontend run check:admin
npm --prefix frontend run check:connectivity
npm --prefix frontend run check:concurrency
npm --prefix frontend run check:perf
npm --prefix frontend run check:ws
npm --prefix frontend run check:audit
npm --prefix frontend run check:ui
npm --prefix frontend run check:dynamic
npm --prefix frontend run check:mermaid
npm --prefix frontend run check:diagrams
npm --prefix frontend run check:docs
```

验收脚本会在 `docs/images/` 写入 JSON 报告；部分脚本会创建并清理数据库临时数据。不要在含有重要数据的数据库上运行。命令所需服务、端口、环境变量、测试边界和历史结果详见 [`docs/07-前后端分离架构与部署说明.md`](docs/07-前后端分离架构与部署说明.md)、[`docs/09-图集导出与演示记录.md`](docs/09-图集导出与演示记录.md)、[`docs/10-50并发性能压测说明.md`](docs/10-50并发性能压测说明.md) 和 [`docs/11-业务连通性与真实功能审计.md`](docs/11-业务连通性与真实功能审计.md)。

## 8. GitHub 日常协作

克隆仓库后建议通过分支提交改动：

```bash
git switch -c feature/<简短主题>
git status --short
git add <本次修改文件>
git diff --cached
git commit -m "feat: <改动摘要>"
git push -u origin feature/<简短主题>
```

之后在 GitHub 上创建 Pull Request，说明需求、改动范围、验证命令和未覆盖事项。同步主分支并开始下一项工作：

```bash
git switch main
git pull --ff-only
git switch -c feature/<下一主题>
```

推荐提交前检查：

```bash
git status --short
git diff --check
git diff --cached --check
```

不要提交 `target/`、`frontend/node_modules/`、`frontend/dist/`、本地 `.env`/密钥文件、日志、数据库备份、真实患者资料或个人报告原件。仓库中的 `docs/images/diagrams/` 是设计文档交付物；验收截图与 JSON 是演示证据，上传前应确认只包含合成演示数据。

## 9. 问题排查

| 现象 | 检查点 |
| --- | --- |
| 后端启动提示 JWT/AES 配置缺失 | 检查 `APP_SECURITY_JWT_SECRET`、`APP_CRYPTO_AES_KEY` 是否在启动后端的同一终端中设置 |
| 加密字段解密失败 | 确认当前 `APP_CRYPTO_AES_KEY` 与该数据库首次加密时使用的值完全相同 |
| MySQL 连接失败 | 检查服务状态、端口、数据库名、JDBC URL、账号权限与密码环境变量 |
| 登录失败 | 确认已导入 `02_data.sql`，并使用未修改的演示账号；演示密码为 `123456` |
| 前端显示网络错误 | 确认后端 `8080` 已启动；Vite 代理默认目标是本机 `8080` |
| UI 验收找不到浏览器 | 启动 Edge/Chrome 并开放 CDP `9225`，或为脚本设置 `UI_CDP_PORT` |
| 端口已被占用 | 结束占用进程或按部署文档修改服务端口、Vite 端口及白名单源 |

## 10. 当前范围边界

本仓库用于课程演示和设计验收。未交付真实医保局联调、生产级密钥管理、refresh token 黑名单、10 万数据量压测及收费接口压测等能力；详细状态以 [`docs/05-需求追溯矩阵.md`](docs/05-需求追溯矩阵.md) 的缺口表为准。
