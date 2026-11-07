# 门诊挂号与就诊管理系统

课程实验项目：Spring Boot 3.2.5 + Java 21 + MySQL 的模块化单体后端，Vite 独立 SPA 前端。后端只提供 REST/JWT/STOMP，不再托管业务页面；详细需求、SC 结构图、SD 时序图与状态图、数据库设计和追溯矩阵见 `docs/00-文档索引与编写规范.md`。

## 启动

1. 初始化本地 MySQL：执行 `sql/mysql/01_schema.sql`、`sql/mysql/02_data.sql`，库名 `outpatient`。
2. 在启动后端的终端设置 `SPRING_DATASOURCE_URL`、`SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD`、`APP_SECURITY_JWT_SECRET` 与 `APP_CRYPTO_AES_KEY`，再执行 `mvn spring-boot:run`。密钥生成与保存方法见 [`GITHUB_GUIDE.md`](GITHUB_GUIDE.md)。
3. 启动独立前端 `5173`：执行 `npm ci --prefix frontend`、`npm --prefix frontend run dev`；浏览器访问 `http://127.0.0.1:5173`。
4. 构建/预览：`npm --prefix frontend run build` 输出到 `frontend/dist/`，`npm --prefix frontend run preview` 默认 `4173`。
5. 生产同源部署：`deploy/nginx.conf.example` 托管 `frontend/dist/` 并反代 `/api`、`/ws`；跨域部署用 `VITE_API_BASE`、`VITE_WS_BASE` 并配置 `app.cors.allowed-origins`。

从克隆、数据库初始化到 GitHub 协作的完整步骤见 [`GITHUB_GUIDE.md`](GITHUB_GUIDE.md)。

后端根路径 `http://127.0.0.1:8080/` 返回 JSON 服务标识；Vite 开发态把 `/api` 与 `/ws` 同源代理到 8080。CORS 与 WebSocket 握手都按精确源白名单校验，不使用通配符。

## 演示账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 患者 | `pt0001` | `123456` |
| 护士 | `nurse01` | `123456` |
| 医生 | `zhangming` | `123456` |
| 收费员 | `cashier01` | `123456` |
| 药房（第一签字） | `pharma01` | `123456` |
| 药房（第二签字） | `pharma02` | `123456` |
| 管理员 | `admin01` | `123456` |

演示路径：患者查排班/挂号/取消 → 护士报到 → 医生叫号、接诊、开处方/检查 → 收费员划价、自费/医保结算、挂号退号/整单退费 → 药房审核/双签/发药/退药 → 患者查就诊账单、管理员查统计/审计与「账号与角色 / 排班维护」。挂号费并入已收费单时先办理整单退费，再办理挂号退号；其余边界见 PRD V1.7 与 RTM。分角色操作、管理维护和排障见 `docs/08-用户手册.md`。

## 医保失败演示

另起后端 `8081`：`mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8081 --app.insurance.mode=FAIL"`；另起前端 `5174`：设置 `VITE_BACKEND_URL=http://127.0.0.1:8081`、`VITE_BACKEND_ORIGIN=http://127.0.0.1:5174`、`VITE_PORT=5174`、`VITE_PREVIEW_PORT=4174` 后执行 `npm run dev`。医保结算会保留 `RETRY` 与 FAILED 流水，不记为收费成功。

## 验收

先启动后端、前端及带 `--remote-debugging-port=9225` 的 Edge/Chromium CDP，再在 `frontend/` 执行：

```bash
npm run check:ui
UI_BASE=http://127.0.0.1:5174 npm run check:dynamic
npm run check:registration
npm run check:admin
npm run check:connectivity
npm run check:concurrency
npm run check:mermaid
npm run check:diagrams
npm run check:perf
npm run check:ws
npm run check:audit
npm run check:docs
```

报告输出在 `docs/images/`：`ui-acceptance-report.json`、`ui-dynamic-acceptance-report.json`、`registration-cancel-refund-report.json`、`admin-maintenance-report.json`、`read-only-connectivity-report.json`、`concurrency-acceptance-report.json`、`frontend-split-acceptance-report.json`、`mermaid-export-report.json`、`perf-50-concurrency-report.json`、`ws-authorization-report.json`、`audit-integrity-report.json`、`docs-baseline-report.json`。33 张 SC/SD/PRD/ER/部署图的 SVG/PNG 与图号索引在 `docs/images/diagrams/`，规则见 `docs/09-图集导出与演示记录.md`；50 并发 P95 夹具与判定见 `docs/10-50并发性能压测说明.md`，业务连通性与数据归属审计见 `docs/11-业务连通性与真实功能审计.md`。脚本用 `UI_BASE`、`UI_CDP_PORT`、`UI_OUT_DIR`、`API_BASE`、`MYSQL_BIN`、`MERMAID_CDP_PORT`、`PERF_ROUNDS`、`PERF_CONCURRENCY`、`PERF_P95_BUDGET_MS` 覆盖默认配置。取消/退号、管理维护、并发与压测脚本会创建临时数据并在结束时清理，不会把验收数据留在演示库；连通性脚本只读业务数据；图集命令只解析本地文档。

## 已知边界

用户/角色维护 REST 与排班维护已在 V1.5 交付并通过 `npm run check:admin` 验收；V1.7 补齐患者专属 WebSocket 主题授权、关键审计完整性与文档基线检查，分别通过 `npm run check:ws`、`npm run check:audit`、`npm run check:docs` 验收。六角色业务连通性、患者队列脱敏、收费单/队列/医生归属与跨角色 403 已通过 `npm run check:connectivity` 验收；20 并发抢 15 号源已通过 `npm run check:concurrency` 验收；用户手册见 `docs/08-用户手册.md`，33 张 Mermaid 图的 SVG/PNG 全量导出已通过 `npm run check:diagrams` 验收；50 并发 P95 本机压测已通过 `npm run check:perf` 验收，当前 3 轮单轮 P95 为 705/549/525ms，汇总 P95 为 642ms，审计切面修复后的连接池并发验收全部成功。V1.7 机器报告为 `ws-authorization-report.json`、`audit-integrity-report.json` 与 `docs-baseline-report.json`。价格版本表、批次库存锁、幂等键、HMAC 盲索引、refresh token 黑名单、断线轮询交互实测、真实医保局联调、10 万数据量/收费接口压测与真实用户签名试用记录仍按 `docs/05-需求追溯矩阵.md` 列为待补或扩展设计，不应在评审时表述为已交付。
