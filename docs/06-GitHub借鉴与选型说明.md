# GitHub 借鉴与选型说明

| 项目 | 内容 |
| --- | --- |
| 文档编号 | REF-OUTP-001 |
| 版本 | V1.8（同步 V1.7 基线收口与安全验收加固） |
| 上游文档 | 《01-产品需求文档PRD.md》V1.7、《02-概要设计说明书-SC结构图.md》V1.7、《03-详细设计说明书-SD时序图与状态图.md》V1.7、《04-数据库设计说明书.md》V1.3、《05-需求追溯矩阵.md》V1.7、《07-前后端分离架构与部署说明.md》V1.7、《08-用户手册.md》V1.5、《09-图集导出与演示记录.md》V1.2、《10-50并发性能压测说明.md》V1.2、《11-业务连通性与真实功能审计.md》V1.2 |
| 结论 | 本项目继续采用 Spring Boot + MySQL + 分层单体；借鉴 GitHub 上同类项目的安全、并发、审计、价格版本、实时叫号与角色工作台信息组织，不直接复制任何仓库代码 |
| 变更记录 | V1.1 用 GitHub raw README/LICENSE 核对参考仓库，补齐界面型参考，区分「已实现」「扩展设计」「不采纳」，修正早期 `shared/` 包别名；V1.2 追加本轮 README 复查与 PRD/SC/SD/界面验收回链，明确借鉴边界与未验证项；V1.3 按 V1.4 文档基线同步上游版本与独立部署结论；V1.4 按 V1.5 管理维护基线同步上游版本并补充借鉴边界，不新增外部仓库或复制素材；V1.5 按 V1.5.3 图集导出基线同步上游版本，明确 Mermaid 导出为本项目文档工具链，不引入新仓库或复制图示；V1.6 按 V1.5.4 压测基线同步上游版本，明确本项目自写 Node 夹具，不复制第三方压测脚本或性能结论；V1.7 说明队列脱敏与数据归属为本项目安全修正；V1.8 说明 WebSocket 患者专属主题与授权矩阵为本项目运行态复验后的自主加固，不复制外部仓库源码或图示，参考仓库只提供实时队列思路 |

## 1. 参考仓库

| 仓库 | 主要价值 | 采纳情况 |
| --- | --- | --- |
| [ryancamus12138-sketch/campus-clinic-outpatient-billing](https://github.com/ryancamus12138-sketch/campus-clinic-outpatient-billing) | 高校校医院收费系统，README 标明 Spring Boot 4.1 / Java 21 / Vue 3 / MySQL 8.4，MIT；展示「登录先选身份、菜单与接口按角色授权、收款异常单独成区、模块化单体、独立审计日志」 | 重点借鉴：角色工作台信息组织、异常状态可见性、独立审计事务、价格快照、退费状态机；Vue/Redis/Flyway 不照搬 |
| [Sai-Vijaya-Krishna/Hospital-Appointment-Management-System](https://github.com/Sai-Vijaya-Krishna/Hospital-Appointment-Management-System) | 医院预约 + 队列 + 电子处方，README 标明 Spring Boot 3.2 / MySQL / JWT / WebSocket-STOMP，MIT；展示 Patient/Doctor/Admin 工作台、实时 Token 队列、Dashboard 图表 | 重点借鉴：JWT Filter、角色工作台、WebSocket 队列广播、断线后全量队列回拉；邮件通知不采纳 |
| [nature924/No37Hospital-registration-and-treatment-system-based-on-Spring-Boot](https://github.com/nature924/No37Hospital-registration-and-treatment-system-based-on-Spring-Boot) | 传统医院挂号就诊系统，Spring Boot + Vue + MySQL，功能清单完整 | 参考功能划分：前台/后台、医生/患者/管理员三角色 |
| [wwqking/Hospital-registration-and-treatment-system](https://github.com/wwqking/Hospital-registration-and-treatment-system) | 同类医院挂号系统，文档较完整 | 参考需求覆盖：挂号、排班、医生、患者、药品、统计 |
| [Nikithayyadav/hospital-token-system](https://github.com/Nikithayyadav/hospital-token-system) | 医院叫号系统，Spring Boot + Thymeleaf | 参考叫号模型：普通队列 + 急诊优先队列 |
| [dhanya0053/ClinicQ](https://github.com/dhanya0053/ClinicQ) | React 前端预约与叫号 | 仅参考界面思路，仓库缺少后端，不作为架构依据 |
| [yujian95/hospital](https://github.com/yujian95/hospital) | README 标明 Spring Boot + MyBatis、Spring Security + JWT、REST 前后端分离，LICENSE 为 GPL-3.0 | 只参考角色动态权限与 REST 分层；因许可证及技术栈差异，不复制代码、不使用其 GPL 素材 |
| [yujian95/hospital-web](https://github.com/yujian95/hospital-web) | Vue + Vuex + Element UI 的 PC 管理端；README 描述医生管理员按日期查看挂号队列/病历，系统管理员维护医院、专科、医生、排班 | 参考「按角色拆工作台」「按日期查看队列」的信息层级；未检出 LICENSE，不复用代码与图片 |

## 2. 已采纳的设计

### 2.1 分层模块化单体

来源：`campus-clinic-outpatient-billing`

采纳其“一个 Spring Boot 应用，内部按业务域分包，模块间只通过公开接口调用”的做法。本项目包结构调整为：

```text
com.hospital.outpatient
├── auth/          # 登录、JWT、权限
├── audit/         # 操作日志
├── schedule/      # 号源与排班
├── registration/  # 挂号与退号
├── queue/         # 分诊叫号与过号
├── visit/         # 就诊与病历
├── prescription/  # 处方与检查单
├── billing/       # 划价、收费、医保、退费
├── pharmacy/      # 药房、库存、发药
├── stats/         # 统计
├── common/        # 统一响应、业务异常、全局异常处理
├── config/        # 配置属性与种子数据加密迁移
└── security/      # 口令哈希、手机号加解密
```

V1.1 修正：早期草案把通用包写作 `shared/`，当前实际代码是 `common/`、`config/`、`security/`；文档以代码为准，不为对齐别名移动包。每个模块内部仍按 `controller → service → repository` 分层。后续用 ArchUnit 测试检查：

- Controller 不得调用 Repository。
- Service 不得直接操作 `HttpServletRequest`。
- 模块之间只能依赖对方 `api` 包，不允许形成循环依赖。

### 2.2 Spring Security + JWT

来源：`campus-clinic-outpatient-billing`、`Hospital-Appointment-Management-System`

将原先的“自写 Session 拦截器”改为标准 Spring Security：

- `SecurityFilterChain` 统一配置公开接口、认证接口、角色权限。
- `JwtAuthenticationFilter` 从 `Authorization: Bearer <token>` 解析用户。
- `@EnableMethodSecurity` + `@PreAuthorize("hasRole('DOCTOR')")` 做接口级授权。
- 登录成功后签发带 `jti`/过期时间的 JWT；当前退出登录清除浏览器 token，服务端黑名单与 refresh token 属于 `[扩展设计]`。
- 密码继续使用 PBKDF2 或 BCrypt 哈希，不落明文。

收益：更符合 Spring Boot 生态，避免自写拦截器遗漏边界；前端只需保存 token，便于后续接入 Vue 或 React。

### 2.3 敏感字段加密 + 盲索引 `[部分实现]`

来源：`campus-clinic-outpatient-billing`

当前 `PhoneCipher` 与 `SeedCipherMigrator` 已实现 AES-GCM 密文入库与展示脱敏。以下两项是后续工程细节，当前 DDL 尚未包含：

1. 附加数据（AAD）绑定字段用途：`patient.phone` 与 `patient.id_card` 使用不同 purpose，密文复制到另一列会解密失败。
2. 盲索引（blind index）：为手机号、身份证号各保存一列 HMAC-SHA256 哈希，用于唯一约束和精确检索，数据库中不出现可穷举的普通哈希。

数据库调整示例：

```sql
phone_enc    VARBINARY(128),
phone_hash   CHAR(64),
id_card_enc  VARBINARY(128),
id_card_hash CHAR(64),
UNIQUE KEY uk_patient_id_card (id_card_hash),
KEY idx_patient_phone (phone_hash)
```

### 2.4 金额值对象 `[扩展设计]`

来源：`campus-clinic-outpatient-billing`

建议后续新增 `Money` 值对象；当前实现用 `BigDecimal` + `DECIMAL(10,2)` 保证不出现浮点金额运算，前端统一显示两位小数：

- 不可变，固定两位小数。
- 禁止负数。
- `add / subtract / multiply / ratio / allocate` 统一舍入规则。
- 数据库映射为 `DECIMAL(12,2)`。

业务代码中不再出现 `double` 或 `float` 金额运算，避免医保拆分和退费分摊产生分毫误差。

### 2.5 价格版本与快照 `[部分实现]`

来源：`campus-clinic-outpatient-billing`

当前处方明细、检查单已保存名称/单价快照；`price_item` 版本表属于后续扩展：

```text
item_code + effective_from + effective_to
```

- 挂号、检查、药品都按“当时生效价格”开单。
- 单据上保存单价、名称、报销比例快照。
- 后续调价不影响历史单据。
- 支持撤销未生效的调价。

这解决了 PRD 中 FR-19“自动划价”的可追溯问题。

### 2.6 号源并发三道防线

来源：`campus-clinic-outpatient-billing`、`Hospital-Appointment-Management-System`

当前采用号源行锁、号序唯一键和有效挂号生成列唯一索引；条件更新是后续增强：

1. 数据库唯一约束：`(schedule_id, queue_no)` 唯一，防止号序重复。
2. 行锁 + 条件更新：`UPDATE schedule SET remaining = remaining - 1 WHERE remaining > 0`。
3. 有效挂号生成列 + 唯一索引：

```sql
active_slot_id BIGINT AS (IF(status IN ('REGISTERED','TRIAGED'), schedule_id, NULL)) VIRTUAL,
UNIQUE KEY uk_patient_active_slot (patient_id, active_slot_id)
```

即使并发窗口绕过服务层判断，数据库也能拒绝同一患者同一号源的第二条有效挂号。

### 2.7 实时叫号：WebSocket + 定时扫描

来源：`Hospital-Appointment-Management-System`

叫号看板增加 WebSocket 推送：

```text
/topic/queue/{doctorId}/{workDate}
/topic/queue/{doctorId}/{workDate}/masked/{patientId}
```

- 医生叫号、患者报到、过号重排、取消挂号都会广播。
- 前端订阅后无需轮询刷新。
- 服务端 `QueueSweeper` 每 20 秒扫描 3 分钟未应答的 `CALLING` 记录，保证即使 WebSocket 断线，业务状态也正确。
- 前端握手携带 `token` query 参数，服务端按 JWT 校验并按角色、医生、日期和患者归属授权队列主题；员工主题保留完整看板，患者专属主题按订阅者保留本人身份并脱敏他人；断线时通过 `GET /api/queue/board` 轮询降级。V1.7 停用了患者共享 `/masked` 主题。

### 2.8 审计日志独立化

来源：`campus-clinic-outpatient-billing`

- 审计日志不参与业务事务，单独 `INSERT` 并自动提交。
- 业务回滚时，“谁尝试了什么、为什么失败”仍要留痕。
- 生产环境可将日志表放入独立数据库 `outpatient_audit`，应用账号只授予 `INSERT` 和 `SELECT`，不授予 `UPDATE` 或 `DELETE`。
- 拦截器统一记录所有写操作和 403 拒绝，不记录请求体，避免日志本身泄露敏感信息。

### 2.9 库存锁定与批次 `[扩展设计]`

来源：`campus-clinic-outpatient-billing`

当前 `medicine.stock_qty` 单列库存配合药品行锁与 `dispense_record` 流水；批次模型为后续扩展：

```text
medicine          # 药品字典
stock_batch       # 批次库存，含有效期
stock_lock        # 开方锁定
stock_flow        # 出入库流水
```

- 开方时锁定库存，患者未缴费也不会被别人开走。
- 发药时将锁定转为实扣。
- 退药时回补库存并记录流水。
- 批次按“先到期先出”排序加锁，避免死锁。

### 2.10 幂等键 `[扩展设计]`

来源：`campus-clinic-outpatient-billing`

挂号、缴费、退费、医保结算接口均要求客户端生成 `Idempotency-Key`：

```sql
UNIQUE KEY uk_idem (idempotency_key)
```

网络重试或重复点击返回第一次的结果，不会产生第二笔业务单据。

## 3. 明确不采纳的做法

| 做法 | 来源 | 不采纳原因 |
| --- | --- | --- |
| 完全去掉物理外键，全部改为逻辑外键 | `campus-clinic-outpatient-billing` | 该项目为高并发收费系统，用逻辑外键减少锁冲突；本项目是课程设计，PRD NFR-09 明确要求外键约束，保留物理外键更符合验收 |
| Redis 号源预扣 | `campus-clinic-outpatient-billing` | 本项目并发规模不需要 Redis，MySQL 行锁已足够；引入 Redis 会增加部署复杂度 |
| 微服务拆分 | 部分开源项目 | 单人课程项目，事务一致性和调试成本优先 |
| 急诊优先队列 | `hospital-token-system` | 题目四未要求急诊分级，采用普通 FIFO 加过号重排即可 |
| 邮件通知 | `Hospital-Appointment-Management-System` | 非核心需求，且演示环境配置 SMTP 不稳定 |

## 4. 对现有文档的影响

| 文档 | 需要补充的内容 |
| --- | --- |
| 02 概要设计 | V1.1 已对齐实际端点、SPA、JWT Filter、WebSocket Broker、Queue Sweeper、Audit REQUIRES_NEW、MockInsuranceGateway；价格版本/幂等键/库存批次明确标为扩展设计 |
| 03 详细设计 | V1.1 已对齐实际类名与端点，增加 JWT 登录/失效、看板实时与降级、医保失败重试、审计独立事务、前端首屏时序；库存锁定/幂等图标为扩展设计 |
| 04 数据库设计 | 增加 `price_item`、`stock_batch`、`stock_lock`、`stock_flow`，并为敏感字段补充 hash 列 |
| 01 产品需求 | V1.1 增加 PRD-01~04 需求图、UI-01~08 与 AC-19~21，按开源项目界面实践优化六个工作台验收口径 |
| 05 需求追溯矩阵 | V1.1 按「已实现 / 部分实现 / 扩展设计」回填真实端点、类、界面图与验收状态；V1.2 回填浏览器证据；V1.4 补入取消/退号事务与 AC-23；V1.5 回填管理维护 AC-24，同时保留并发压测缺口 |

## 5. 许可证与引用说明

- 所有参考仓库仅用于设计借鉴，不复制其源码、SQL 或文档正文。
- `campus-clinic-outpatient-billing` 使用 MIT License，允许借鉴思路；本项目不直接复制其代码。
- `Hospital-Appointment-Management-System` 的 README 声明 MIT License。
- 其他仓库未在本项目中直接复用代码，仅作为功能与架构参考。

## 6. 2026-11-05 复核对账

GitHub API 当时返回 403 rate limit，因此改用公开 `raw.githubusercontent.com` 的 README/LICENSE 与 GitHub 仓库页面核对；不编造 star 数、更新时间或无法确认的许可证。

| 仓库 | 已核实材料 | 许可证结论 | 对本次优化的实际影响 |
| --- | --- | --- | --- |
| campus-clinic-outpatient-billing | main 分支 README、`LICENSE` | MIT | 登录身份选择、角色菜单、收费异常单独成区、独立审计；PRD-03、UI-05、SC-RUN-01 |
| Hospital-Appointment-Management-System | main 分支 README、LICENSE | MIT | 角色工作台、JWT localStorage、STOMP 队列广播与 Dashboard；本项目落地为员工主题与患者专属主题，PRD-03、SD-08/09/14 |
| nature924/No37... | main 分支 README | 未核实 | 仅作三角色功能划分参考，不引入前台资讯模块 |
| wwqking/Hospital-registration... | master 分支 README | 未核实 | 仅核对模块清单，不引入客服/咨询模块 |
| Nikithayyadav/hospital-token-system | GitHub 仓库页面可达，README 404 | 未核实 | 仅保留队列概念参考；急诊优先队列明确不采纳 |
| dhanya0053/ClinicQ | main 分支 README（CRA 默认模板） | 未核实 | 仅确认 React 前端形态，不作为架构依据 |
| yujian95/hospital | master 分支 README、`LICENSE` | GPL-3.0 | 只参考 REST/JWT 分层；不复制 GPL 代码或素材 |
| yujian95/hospital-web | master 分支 README | 未检出 LICENSE | 只参考角色工作台与按日期队列的信息层级 |

- 所有参考仓库仅用于设计借鉴，不复制其源码、SQL、截图或文档正文。
- MIT 仓库允许借鉴思路，但本项目不直接复制代码；GPL-3.0 与未核实许可证的仓库只作抽象概念参考。
- 本项目界面使用原创 HTML/CSS/JS 与系统字体/图标方案，不下载参考仓库截图，不引入外部前端依赖。
- 开源项目中的客服、健康教育、公告、邮件、Redis、Flyway、微服务、急诊优先级均未进入 PRD 范围边界图 PRD-04。

## 7. V1.2 图示复核与本轮界面落地

2026-11-05 再次读取上述仓库的公开 README，重点核对角色工作台、收费异常区、JWT、STOMP、按日期队列，不复制仓库截图、源码或文档正文；同时对照只读实验二用例图修正 PRD-01 的参与者关联与 `include/extend` 方向。核对结论按「只改变信息组织，不改变课程需求范围」执行：

| 借鉴点 | 文档落地 | 界面/代码落地 | 当前证据 |
| --- | --- | --- | --- |
| 登录先辨身份、按角色组织导航 | PRD-01、PRD-03、SC-MOD-01、SD-14 | 六张身份卡片、服务端角色目录、按角色 `NAV` | `docs/images/00-login-desktop.png`、六张 `workspace-*-desktop.png` |
| 异常单据单独成区、状态不误判成功 | PRD-02、PRD-03、SD-05/12、UI-05 | 收费台 `RETRY` 统计卡、`data.status` 检查、中文原因与「重新结算」标签 | `docs/images/workspace-cashier-desktop.png`、`dynamic-cashier-retry-after.png`；FAIL 模式浏览器验收 PASS |
| JWT 失效回登录 | SD-08/14、UI-02 | 统一 `code` 判定、清理 localStorage、回登录页并提示 | `docs/images/02-unauthorized-return.png`、`ui-acceptance-report.json` |
| 实时队列 + 全量回拉降级 | SC-RUN-01、SD-09/14、UI-04 | MiniStomp 按角色订阅员工完整主题或患者专属脱敏主题，断线自动轮询 `/api/queue/board` | 浏览器报告 `connection: 实时队列已连接`；断网实测待演示 |
| 角色工作台与按日期队列 | PRD-03、SC-API-01、UI-03 | 出诊医生/日期筛选、当前叫号、候诊、过号标记 | `docs/images/workspace-nurse-desktop.png`、`mobile-nurse-workspace.png`、六张 `mobile-workspace-*.png` |

界面优化过程中的真实修复：身份卡片默认填充对应演示账号且不覆盖用户手动输入；顶栏时间和页面时间标签统一为 `yyyy-MM-dd` 中文格式；启动遮罩缩短且截图前结束入场动画；窄屏约束导航/工作区最小宽度，使 `390px` 布局视口不再被撑到 `429px`。最终两份浏览器报告均为 `PASS`，覆盖医保 FAIL 模式与 390px 六工作台，无 JS exception、无 error/warning 日志、无横向溢出；详见 `docs/images/ui-acceptance-report.json` 与 `ui-dynamic-acceptance-report.json`。

边界说明：本轮 GitHub 借鉴没有新增业务功能，也未把仓库的 Vue/React 技术栈、GPL 代码、截图、客服/公告/邮件/Redis/微服务模块搬入项目；开源参考不能替代课程实验报告，PRD-01 的语义仍以只读实验二用例图为准。

V1.3 回链补充：后续 PRD/SC/SD/DBD/RTM 的 V1.4 增量是依据只读实验报告、课程需求追溯和既有 MIT 仓库的「角色工作台 + 异常状态单独成区 + 独立审计」设计结论落地，不是从参考仓库复制代码。独立前端交付拓扑以 `docs/07-前后端分离架构与部署说明.md` V1.1 为准；患者取消与收费员退号入口沿用角色工作台信息组织，状态/号源/退费/审计仍由 Spring Boot 纯 API 单事务负责。

V1.4 回链补充：V1.5 的管理维护依据既有 MIT 仓库的「角色工作台 + 独立审计」信息组织，把用户、角色和排班维护放入 ADMIN 工作台；仅借鉴界面信息架构与职责拆分，不复制仓库源码、SQL、图片或文档正文。所有写操作仍由 Spring Boot 校验 ADMIN 权限、PBKDF2 口令、档案关联、号源容量和审计留痕。AC-24 已由 `docs/images/admin-maintenance-report.json` 记录 PASS，证据包含 1440px/390px 管理台截图与清理后的演示库；上位文档基线以本文开头的版本表为准。

V1.5 回链补充：V1.5.3 的设计图集沿用本项目已有的 Mermaid 图源与本地 `scripts/mermaid.min.js`，通过 CDP 导出 33 张 SVG/PNG，方便贴入课程报告；没有新增参考仓库，也没有使用任何 GitHub 项目的图片、主题、字体或导出脚本。图集规则与边界见 `docs/09-图集导出与演示记录.md`，导出结果以 `docs/images/mermaid-export-report.json` 为准；本增量不把图集导出表述为业务功能或外部借鉴成果。

V1.6 回链补充：V1.5.4 的 50 并发 P95 压测仍沿用既有 MIT 参考抽象出的「行锁 + 唯一约束」设计结论，压测夹具由本项目 Node.js 自行编写，只验证本系统的 `POST /api/registrations`，不复制第三方测试源码，也不搬运其他项目的吞吐/P95 数字。规则与边界见 `docs/10-50并发性能压测说明.md`，结果以 `docs/images/perf-50-concurrency-report.json` 为准。

V1.8 回链补充：V1.7 运行态复验只确认本项目自身 WebSocket 授权和审计问题，整改范围限定在本项目 PRD/SC/SD/DBD/RTM 与代码，不新增参考仓库、素材或外部实现。

V1.7 回链补充：V1.6 的队列脱敏与数据归属修正不是复制参考仓库实现，而是在本系统已有 JWT、REST 和 STOMP 边界上补齐课程验收必需的最小安全规则。参考仓库仅提供「实时队列 + 全量回拉」的信息架构；本项目将员工完整看板与患者脱敏看板拆成不同主题，并由服务端按医生、日期和角色授权。审计结果见 `docs/images/read-only-connectivity-report.json`。
