# Huawei Band 11 健康数据集成

生产变更须经所有者批准后执行。健康查询复用 Horizon 的 `server.ts:server` 和原 MCP 地址；
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
  上游查询使用独立 `HEALTH_MCP_ACCESS_TOKEN`；本实现由 Horizon OAuth 认证，并按 `HEALTH_OWNER_EMAIL` 限制为本人查询。
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

`HEALTH_ACTOR_ID` 是两端共用的固定健康身份，不等同于 Horizon 账户 UUID。
MCP 先核对可信用户类型和本人邮箱，再使用固定身份；payload/header 不能覆盖 actor/source。
当前每个 Worker 配置绑定一位用户和一只手环。手机协议不含设备 ID，App 只选择 Band 11。
多用户或多设备需独立 Worker/token/绑定；不能共用 token 后依赖客户端传 actor。

## 配置清单

不把密钥写入仓库、wrangler `vars`、工具参数、URL 或 `VITE_*`。预览与生产分别配置密钥和 Neon
数据库/分支。上传 token 使用至少 32 个无空白随机字符；不要使用测试 token。查询无需客户端自定义 token。

| 变量 | Cloudflare Worker | Horizon MCP | 说明 |
| --- | --- | --- | --- |
| `HEALTH_INGEST_TOKEN` | **Secret，必需** | 不需要 | 手机 Bearer 上传密钥，32–512 字符 |
| `HEALTH_DATABASE_URL` | **Secret，必需** | 推荐 | Worker 要求 Neon `.neon.tech` PostgreSQL URL，经 WSS；不会回退到其他 DATABASE_URL。两端连接同一健康库，可各用写入/只读角色 |
| `HEALTH_ACTOR_ID` | **Secret，必需** | **Secret，必需** | 服务端固定健康身份，两边完全一致，不复用测试身份 |
| `HEALTH_OWNER_EMAIL` | 不配置 | **Secret，必需** | Horizon 认证后的本人邮箱；其他用户及服务账户一律拒绝 |
| `HEALTH_SOURCE_ID` | Text，默认 `huawei-band-11` | 同左 | 两边一致，1–64 位字母数字、下划线、短横线 |
| `HEALTH_TIMEZONE` | Text，默认 `Asia/Shanghai` | 不使用 | 必须与手机系统 IANA 时区一致 |
| `HEALTH_PUBLIC_URL` | Text，必需 | 不需要 | 精确 HTTPS origin，例如 Worker 的 `.workers.dev` 地址；不带 `/api/health` |
| `DATABASE_URL` | 不使用 | 保留原值 | 原记忆/时感 Neon 配置不改；Horizon 健康查询没设专用 URL 时仍可回退此值 |
| `CF_ACCOUNT_ID`、`CF_API_TOKEN` | 不需要 | 保留原配置 | 原语义检索使用，不能拿来充当健康密钥 |

原 `HEALTH_HOST`、`HEALTH_PORT` 和 Caddy/VPS 配置不再使用。`wrangler.jsonc` 不含 account ID、
生产地址、actor 或凭据；其中 `.example.invalid` 必须在人工上线前改为对应 Worker 的 origin。
配置不完整时返回通用 503，错误 origin 返回 421，不会接收数据到错误绑定。

## 生产发布顺序

1. 在现有 Neon 生产分支读取健康表结构元数据。执行 0003_health.sql 前确认同名表兼容；
   事务内只添加缺少的五张健康表及索引，不更改 memories/gap/embedding、不复制整个测试分支。
2. Worker 使用仅限健康表 SELECT/INSERT/UPDATE 角色，MCP 健康连接使用只读角色。
   原 DATABASE_URL、CF_ACCOUNT_ID、CF_API_TOKEN 保持原值。
3. 沿用现有上传 Worker；上线配置明确指定目标 name 和 HEALTH_PUBLIC_URL，不部署占位名称。
   更新生产 HEALTH_DATABASE_URL、新上传令牌及新固定 HEALTH_ACTOR_ID；手机后续使用新令牌。
   保留兼容日期 2026-09-01、nodejs_compat、workers_dev，关闭请求体日志。
4. Horizon 原服务 Production 设置 HEALTH_DATABASE_URL、HEALTH_OWNER_EMAIL、HEALTH_ACTOR_ID、
   HEALTH_SOURCE_ID。保留 Authentication、server.ts:server 入口、原域名及既有环境变量。
5. 合并现有 PR #1 触发原服务部署；不合并身份诊断 PR。变量缺失时健康查询拒绝访问，
   原记忆和时间工具不依赖新变量。生产发布成功后手机重新同步，Yisle 使用现有连接查询。

## Horizon 身份信任边界

仅通过启用了 Horizon Authentication 的托管网关访问该入口。网关剥离调用者提交的 horizon-* 头，
再注入认证身份；不得公开暴露绕过网关的 FastMCP HTTP 服务。
参考 [TubeTrace 平台部署说明](https://glama.ai/mcp/servers/ph20/tubetrace-mcp/tree)。

六个健康工具从每次请求的 server.getContext().http.headers 校验 horizon-actor-type=user 和
horizon-actor-email=HEALTH_OWNER_EMAIL，再映射到固定健康身份。类型/邮箱缺失、不匹配、
服务账户或配置缺失均在读取数据库前拒绝。知道上传令牌或旧查询令牌的其他用户也不能查询。
旧 check:health:horizon 脚本只适用于已废弃的自定义查询头方案，不用于此发布。
原记忆的 horizon-actor 身份解析没有变化，不迁移或重绑定记忆记录。

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
Cloudflare 语义配置保持不变，健康配置不完整时保持拒绝访问。
保留五张健康表，不执行 DROP/TRUNCATE/DELETE 或整库覆盖；旧版本不引用这些表。恢复时重新
配置 Worker/Horizon 绑定并启用，幂等键允许补传和重试。Worker 更新本身无需改数据库 schema。
