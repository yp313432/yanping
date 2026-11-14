# Huawei Band 11 健康数据集成

本改动不部署生产、不执行生产迁移。健康查询复用 Horizon 的 `server.ts:server` 和原 MCP 地址；
手机只连接 Cloudflare Workers 的 HTTPS 上传入口，不需要 VPS 或常驻 Node.js 服务器。原有记忆、时感、actor 身份解析和语义检索路径保持原样。

## 审查结论与协议依据

- 审查基线：yanping `2492c342be85055278720bbb6915acf9f257f7dd`。
  `server.ts` 导出 FastMCP 实例，由 Horizon 启动；`server/mcp/index.ts` 同时为 Web `/mcp`
  提供时间工具。健康工具仅注册到现有 Horizon 实例，不向匿名 Web `/mcp` 开放健康数据。
- 现有表来自 `migrations/0001_memory.sql`、`0002_semantic.sql` 和 memory/gap store 的懒初始化：
  `memories`（actor、内容、状态、embedding）和 `gap_last_seen`。健康模块不调用这些表。
- 仓库的 Vite/Nitro 配置面向 Vercel；`.grok/app-env.json` 的 `deploy.database=false` 不能代表
  Horizon 的环境设置。Horizon 当前入口依靠 `DATABASE_URL`；记忆库源码注明 Horizon 不执行 migrations。
  本次没有生产凭据，未连接或读取线上 Neon、Horizon 控制台及真实健康记录。
- 已读 [health-mcp 的接收与合并实现](https://github.com/xiaoyou5602/health-mcp/blob/f8e57be59570c101662edca2c2ee995a77d36b9e/health-server.js)：
  `POST /api/health`，`Authorization: Bearer <HEALTH_INGEST_TOKEN>`，JSON body，成功返回 `{ok:true,date}`。
  上游查询使用独立 `HEALTH_MCP_ACCESS_TOKEN`；本实现的查询由 Horizon 加 `HEALTH_QUERY_TOKEN` 保护。
- 已读手机的 [Payload](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/util/selfhostedhealth/SelfHostedHealthPayload.kt)、
  [Uploader](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/util/selfhostedhealth/SelfHostedHealthUploader.kt)、
  [Worker](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/util/selfhostedhealth/SelfHostedHealthSyncWorker.kt)、
  [运动字段](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/util/selfhostedhealth/SelfHostedWorkoutPayload.kt)。
  一个请求对应手机本地一天，字段是 `date`、可选 `steps:{total}`、`heart_rate:[{timestamp,value}]`、
  `sleep:[{session_start_time,session_end_time,duration_seconds,stages}]` 和 `workouts`。
  时间带偏移；心率为 300 秒桶平均值；睡眠总时长排除清醒期、按醒来日归属；运动按开始日归属。
  手机将任意 2xx 视为成功，网络错误、429 和 5xx 可重试，4xx 表示需修正配置/请求。
- FastMCP [v1.7.2 源码](https://github.com/PrefectHQ/fastmcp-ts/blob/v1.7.2/src/server/FastMCP.ts)
  的 `customRoute()` 只在自身 `run()` 的 HTTP listener 上生效，不通过 `fetch()` 暴露，且绕过 MCP 鉴权。
  因此 SDK 支持自定义 HTTP 路由，但仓库没有证据证明 Horizon 网关转发任意上传路径，或允许
  手机只凭上传令牌经过网关。未做线上探测，不能断言 Horizon 永远不支持。
  本方案不依赖该能力，因此使用 Cloudflare Workers 作为独立 HTTPS ingress。

## 部署拓扑与事务

```text
Band 11 -> Android App -> Cloudflare Worker /api/health
                             | Neon WebSocket Client (WSS), one request/connection
                             | BEGIN -> source lock -> validate day -> writes -> COMMIT
                             v
                      Neon health_* tables
                             ^
AI -> 原 Horizon MCP 地址 -> 原 FastMCP + 六个 health_* 查询工具 (Node pg)
```

Worker 只处理上传，不提供健康 HTTP GET 或第二个 MCP 地址。`nodejs_compat` 用于共享校验代码的
`node:crypto`；不启动 Node HTTP 服务，不使用文件系统、TCP pg 或跨请求连接池。原来的 Node 接收
入口及 Caddy 配置已移除。Worker 的驱动与构建依赖放在 `workers/health/` 独立 package，Horizon
继续用根 package 的 `pg`，查询 SQL、六个工具、记忆、时感和语义检索行为不变。

Workers 使用 [Neon serverless v1.2.1](https://github.com/neondatabase/serverless/blob/v1.2.1/README.md)
的 WebSocket `Client`。官方要求连接在单次请求内创建/使用/关闭，本实现遵守这一点。
没有将逐条 `neon()` HTTP 查询拼成假事务，也没有用不支持交互检查的 HTTP batch 替代。

`server/mcp/health-ingest.ts` 是无驱动的共享写入实现，Node 和 Worker 调用同一份参数化 SQL。
Worker 先 `BEGIN`，设置事务本地 statement/lock/idle 超时，source upsert 获取 PostgreSQL 行锁，
检查 day upsert 的返回行数，再写所有指标，等待 `COMMIT` 成功才返回 200。JS 时区冲突或 SQL
失败都会 `ROLLBACK`，最后关闭连接。source 锁在提交前持续持有，对跨 Worker isolate 的并发
也生效。连接或提交时网络失败返回不含详情的 503；提交结果不明时由 App 重试，幂等键防止重复。
不在后台 `waitUntil` 里提交，也不在请求结束后继续写数据。

`HEALTH_ACTOR_ID` 是服务端绑定的确切 Horizon actor，payload/header 不能覆盖 actor/source。
当前每个 Worker 配置绑定一位用户和一只手环。手机协议不含设备 ID，App 只选择 Band 11。
多用户或多设备需独立 Worker/token/绑定；不能共用 token 后依赖客户端传 actor。

## 配置清单

不把密钥写入仓库、wrangler `vars`、工具参数、URL 或 `VITE_*`。预览与生产分别配置密钥和 Neon
数据库/分支。两个独立随机 token 至少 32 个无空白字符；不要使用合成测试 token。

| 变量 | Cloudflare Worker | Horizon MCP | 说明 |
| --- | --- | --- | --- |
| `HEALTH_INGEST_TOKEN` | **Secret，必需** | 不需要 | 手机 Bearer 上传密钥，32–512 字符 |
| `HEALTH_DATABASE_URL` | **Secret，必需** | 推荐 | Worker 要求 Neon `.neon.tech` PostgreSQL URL，经 WSS；不会回退到其他 DATABASE_URL。两端连接同一健康库，可各用写入/只读角色 |
| `HEALTH_ACTOR_ID` | **Secret，必需** | 不需要 | 必须是认证后可信的 actor，不是猜测的显示名/邮箱 |
| `HEALTH_QUERY_TOKEN` | 不配置 | **Secret，必需** | 与上传密钥不同，客户端通过 `x-health-query-token` 发送 |
| `HEALTH_SOURCE_ID` | Text，默认 `huawei-band-11` | 同左 | 两边一致，1–64 位字母数字、下划线、短横线 |
| `HEALTH_TIMEZONE` | Text，默认 `Asia/Shanghai` | 不使用 | 必须与手机系统 IANA 时区一致 |
| `HEALTH_PUBLIC_URL` | Text，必需 | 不需要 | 精确 HTTPS origin，例如 Worker 的 `.workers.dev` 地址；不带 `/api/health` |
| `DATABASE_URL` | 不使用 | 保留原值 | 原记忆/时感 Neon 配置不改；Horizon 健康查询没设专用 URL 时仍可回退此值 |
| `CF_ACCOUNT_ID`、`CF_API_TOKEN` | 不需要 | 保留原配置 | 原语义检索使用，不能拿来充当健康密钥 |

原 `HEALTH_HOST`、`HEALTH_PORT` 和 Caddy/VPS 配置不再使用。`wrangler.jsonc` 不含 account ID、
生产地址、actor 或凭据；其中 `.example.invalid` 必须在人工上线前改为对应 Worker 的 origin。
配置不完整时返回通用 503，错误 origin 返回 421，不会接收数据到错误绑定。

## 人工部署：仅 Cloudflare Workers + Horizon + Neon

本 PR 的 CI 只测试和打包，没有 Cloudflare token、部署命令或生产数据库权限。不启用按推送自动
生产部署，不会触发此文档中的任何操作。根 `npm run build` 现有流程会使用 `DATABASE_URL` 迁移，
所以验证构建时保持其为空，不能拿生产连接串试构建。

1. 在 Neon Console 创建空测试库或测试分支。核对 `information_schema.columns` 中现有
   `memories` / `gap_last_seen` / `health_*` 结构及同名冲突，只查看元数据。记录生产快照与当前
   Horizon release/Authentication/变量名，不读取真实健康行。按原流程备份，不覆盖现有记忆。
2. 在 **目标健康库** 的 Neon SQL Editor 中粘贴并执行 `migrations/0003_health.sql`，可包在
   `BEGIN; ... COMMIT;` 中。它只新增五张健康表/索引，可重跑，不改旧表或删除数据。
   Horizon 和 Worker 都不会在请求中自动建表。使用独立健康库时，必须明确选中该库。
3. Worker 写入角色只需这些健康表的 `SELECT, INSERT, UPDATE`，Horizon 健康角色只需 `SELECT`，
   不授予 DELETE/DDL，原记忆角色不变。将同一健康库的两份角色连接串分别放在对应平台 Secret。
   Worker 推荐 Neon pooled endpoint，连接在 `BEGIN/COMMIT` 期间保持，兼容事务池。
4. 在 Cloudflare Dashboard 新建专用测试 Worker，名称对应 `wrangler.jsonc` 的 preview name。
   配置兼容日期 `2026-09-01` 和 `nodejs_compat`；关闭 Observability/请求体跟踪。
   `workers_dev=true` 可直接使用 HTTPS `.workers.dev` 地址，不需要购买域名或 VPS。
5. 将 preview `HEALTH_PUBLIC_URL` 改为这个地址，并设置其 Text 变量和三个 Worker Secrets。
   生产与预览变量/Secrets 不继承，须分别设置。生产 actor 和 preview actor 必须人工核验绑定。
6. 发布方式二选一，都是**人工操作**：

   - **Dashboard，无本地 Node 工具链**：下载 PR CI 的 `health-worker-build` artifact，取其中
     `index.js`，在 Worker 编辑器作为模块入口替换代码，再人工点击部署。保持上述兼容标志和
     Secrets。artifact 只有生产入口的离线构建，不能使用 `dist-test/worker.js`。
   - **Wrangler CLI**：在临时开发环境/本地运行下方命令，只需 Node 22.12+ 做构建/上传，
     不需要 Node 云服务器。部署后代码在 Cloudflare 运行。CLI 认证使用 Cloudflare 登录或
     最小权限上传凭据，与 Horizon 的 `CF_API_TOKEN` 无关。

   ```bash
   cd workers/health
   npm ci --ignore-scripts
   npx wrangler login
   npx wrangler secret put HEALTH_DATABASE_URL --env preview
   npx wrangler secret put HEALTH_INGEST_TOKEN --env preview
   npx wrangler secret put HEALTH_ACTOR_ID --env preview
   npm run build                    # --dry-run，只打包，不上线
   npm run deploy:preview            # 仅在人工验收允许时执行
   ```

   生产发布前更新 production origin，在 production 环境分别 `secret put` 同名三个 Secret，
   最后人工执行 `npm run deploy:production`。不要将生产密钥放到 preview 或 GitHub PR CI。
7. 用合成 payload 验证上传 200、无/错 token 401、未知字段/错时区 400、超限 413、数据库失败
   503 和重复同步无重复记录。`/healthz` 只表示配置和进程存活，不能证明数据库可写。
   不在该路径附加健康信息，不公开原始异常、连接串或请求体。不要启用需要浏览器登录的
   Cloudflare Access challenge 来替代 App 的 Bearer 协议。
8. 在 Horizon Preview 保留 `server.ts:server`、Authentication、记忆和语义检索变量，只添加
   HEALTH 查询配置。通过原 MCP URL 验证原有工具，再验证下面的请求头上线门槛。全部通过后
   才人工批准生产发布。真机配对、固件兼容、后台调度必须另做真机验收。

## 上线阻塞项：Horizon 自定义查询头

**当前未确认 Horizon 网关转发 `x-health-query-token`，属于上线阻塞，不能以 SDK 测试代替。**

已检查：

- FastMCP [v1.7.2 httpContext.ts](https://github.com/PrefectHQ/fastmcp-ts/blob/v1.7.2/src/server/httpContext.ts)
  默认隐藏 Authorization/Cookie 等，**不**隐藏 `x-health-query-token`；现有原 MCP 入口集成测试
  已证明到达 SDK 的该头可被读取、正确/错误 token 的行为不同。
- [Horizon 官方公开部署文档](https://github.com/PrefectHQ/fastmcp/blob/a8745d61e650467756bb28b4157822dbfbdfa34f/docs/v3/deployment/prefect-horizon.mdx)
  描述网关、OAuth 与 Preview，但没有承诺任意自定义头的转发策略，不能据此断言支持。
- 仓库不含实际网关地址/转发配置，本次也没有网关认证凭据或控制台访问。未向生产网关发请求，
  未检查平台对该自定义密钥头的审计日志脱敏。因此实际转发、可信 actor、防伪造边界和日志脱敏
  均须在 Preview 验证后解阻。

已提供 `npm run check:health:horizon`。在可联网的受控临时环境设置 **Preview** 的
`HORIZON_MCP_URL`、有效的 `HORIZON_ACCESS_TOKEN` 和其 `HEALTH_QUERY_TOKEN` 后运行。
脚本不打印密钥/URL/actor/工具原始结果，使用一个故意无效的日期调用现有 `health_get_status`：
正确 token 必须先通过鉴权再返回 `Invalid health query`；缺少/错误 token 必须返回
`Health query unauthorized`。日期校验在任何 DB 查询之前，因此不会读取或记录健康数据。
原 MCP 入口测试也断言此探测不触发 store 查询。

三个探测都通过才可确认这条客户端→网关→运行时路径的头转发和鉴权。若失败，不得把密钥改为
工具参数、移除鉴权或另开匿名查询入口；保持阻塞，核对网关设置/供应商支持。Horizon 网关中
该头和 Authorization 的日志脱敏也必须由控制台/平台文档人工确认。

## 手机 App 配置

1. 安装指定 fork 的“健康数据”App，按其 [GUIDE](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/docs/GUIDE.md)
   完成 Band 11 蓝牙配对、蓝牙/通知权限与后台运行设置。先确认 App 内能看到手环数据。
2. 在自托管健康同步设置中启用上传，只勾选 Band 11。服务器 URL 填
   `https://你的Worker地址/api/health`，令牌填 `HEALTH_INGEST_TOKEN` 的原始值（不带 `Bearer `）。
   不要填写 Horizon MCP 地址、`/mcp` 或查询密钥。
3. 手机时区需与 `HEALTH_TIMEZONE` 一致；修改时区后同步调整 Worker 配置。已有某日记录的 source
   时区不允许悄悄改变；旅行导致同一天时区冲突时会返回 400，应使用新 source 配置并分别查询，
   或等待后续新的本地日期，避免把步数错归日期。
4. 选择首次回填起点，启用“取数后立即上传”和周期兜底（例如 30 分钟）；允许后台电池策略。
   根据需要启用“运动摘要上传”（上游默认关闭），否则运动查询会明确无数据。
5. 点击“立即上传”，确认状态为 HTTP 200，然后通过原 MCP 调用 `health_get_status` 和摘要工具。
   HTTP 400 检查时区/数据，401 检查上传令牌，413 表示请求过大，503 表示数据库或迁移未就绪。
6. 手机 fork 自身的本地同步历史会保存 payload（上游 Worker 行为）；本仓库的 Worker 不记录请求体。不要将手机同步详情或真实健康记录粘贴到公开日志/Issue。
7. 上游 Huawei 历史心率后台抓取默认每 3 分钟；实际仍受蓝牙、系统调度、手机网络影响。
   直传心率只保留 5 分钟桶平均值；睡眠会等待约 10 分钟稳定期，且受手机已有数据进度影响。
   Worker 回看约 24 小时，单次读取窗口上限约 31 天；本服务能保存长期数据，但不能补出手机未上传的数据。

## 查询和幂等语义

| 原 MCP 新增工具 | 输出 |
| --- | --- |
| `health_get_status` | 范围内实际收到/缺失的指标、最近接收时间、最近测量时间和延迟 |
| `health_get_summary` | 每日步数、心率 min/max/avg/count、睡眠与运动统计、缺失天数 |
| `health_get_samples` | 分页心率/扩展测量样本；`limit<=1000`，使用 `nextCursor` 续查 |
| `health_get_sleep` | 睡眠时段、分期和实际睡眠秒数，去除重叠版本的重复累计 |
| `health_get_workouts` | 稳定 ID、类型码、起止时间、运动秒数、距离、热量和心率 |
| `health_get_trends` | 最多 62 天的每日趋势，空白日也返回 |

通用参数：`from`、`to`（包含当天，YYYY-MM-DD），`timezone`（默认 Asia/Shanghai）。缺省最近
7 天，可分段查询任意历史。查询不接受 actor/source；source 由服务配置决定。
日步数缺测是 null；真实 0 步是 0。步数沿用手机原始日期，并返回 `stepsTimezone`，不能可靠地
重分到另一个时区。带时间戳的数据按查询 IANA 时区分日，含 DST；睡眠按醒来日，运动按开始日。

写入一次事务提交整份 payload，参数化 SQL，任意失败全部回滚。仅操作五张 `health_*` 表：

- `health_sources`：绑定的 actor/source 与同步水位，串行化同 source 的并发写入。
- `health_days`：actor/source/date 主键，步数取最大值，不相加，缺失字段不清空已有值。
- `health_samples`：actor/source/metric/UTC instant 主键；相同瞬间的不同 offset 也是同一个点。
  保持上游首次观测优先，重复上传不新增、不累加；不人为截断每天 288 点之外的合法数据。
- `health_sleep`：规范化内容哈希去重，延长的睡眠作为不可变版本保留；查询按传递重叠合并，
  保留更完整版本，独立午睡保留。跨午夜版本在筛选日期前合并。无需删除旧版本来防重复累计。
- `health_workouts`：actor/source/App 稳定 `gbw1` ID 主键，保留更新的 `captured_at` 版本，
  迟到的旧重试不覆盖新摘要；不接收轨迹、位置、设备地址或自由文本名称。

`lastReceivedAt` 是服务接收时间；`latestObservedAt` 来自测量、睡眠结束或运动结束时间，
**不会**把手机生成运动摘要时的 `captured_at` 当测量时间。1 小时为提示性过期阈值，不能据此判定
设备失效。每个指标的每日统计另带 `latest_at`；不能用另一个指标的新数据推断心率是实时值。

当前手机直传仅提供步数、心率、睡眠、可选运动摘要。运动实际提供的距离、活动热量、活动/总秒数、
平均/最低/最高心率一并保留；缺失数值不补零。未声称 Band 11 已上传血氧、压力、HRV 或体温。
服务另支持可选扩展 `metrics:[{metric,timestamp,value}]`，供未来适配器提供实际测量：`spo2` (%)、
`stress` (0–100 index)、`hrv` (ms)、`resting_heart_rate` (bpm)、`respiratory_rate` (breaths/min)、
`skin_temperature` (C)。这是**本服务的扩展**，当前 App 没有发出；不可把皮肤温度当核心体温。
不兼容的老式 `type/data` webhook、`/cycle` 和任意未知字段会拒绝，避免错误数据或隐私字段落库。

## 验证与回滚

```bash
# 仓库根目录，原 Horizon Node 行为回归：
npm ci --ignore-scripts
npm test
npm run test:memory
npm run test:health
npm run test:health:postgres  # 只使用一次性 HEALTH_TEST_DATABASE_URL
npm run typecheck
npm run build               # DATABASE_URL 保持为空

# 独立 Workers 工具链，离线打包和本地 workerd/Miniflare：
cd workers/health
npm ci --ignore-scripts
npm run typecheck
npm run build
npm run build:test
npm test
```

CI 使用 Postgres 16 + Neon 官方 `wsproxy` 的一次性服务，在实际 workerd/Miniflare 中运行与生产
相同的 handler、Neon WebSocket Client 和写入 SQL，验证并发重复上传、source 行锁阻塞到提交、
JS 校验失败回滚、最后一张表写入失败后整体回滚、跨 actor/source 隔离、重试/新 isolate 幂等。
生产 bundle 也在 workerd 加载并验证认证与校验。测试入口仅覆盖测试代理的地址/明文 WS 配置，
与生产入口分离，不接受任何环境变量/请求参数来关闭生产 WSS；测试入口不会进入部署 artifact。

测试只使用合成数据，不回退 `DATABASE_URL`；会对临时库添加故障约束，不能使用生产连接串。
这里验证真实 PostgreSQL 事务与 Neon WebSocket 协议，但**不等于**已验证用户的 Neon 云端可达性、
角色权限或 Workers 套餐限制；这些连同网关请求头和真机自动同步仍是上线前验收项。

回滚：先关闭 App 自动上传并撤销 Worker 上传 token，或停用 Worker 路由；Cloudflare Dashboard
可将 Worker 回滚到已验证版本。Horizon 切回接入前 release，原 DATABASE_URL、Authentication 和
Cloudflare 语义配置保持不变，移除客户端健康查询头/撤销健康查询 token。
保留五张健康表，不执行 DROP/TRUNCATE/DELETE 或整库覆盖；旧版本不引用这些表。恢复时重新
配置 Worker/Horizon 绑定并启用，幂等键允许补传和重试。Worker 更新本身无需改数据库 schema。
