# Huawei Band 11 健康数据集成

本改动不部署生产、不执行生产迁移。健康查询复用 Horizon 的 `server.ts:server` 和原 MCP 地址；
手机只连接独立的 HTTPS 接收服务。原有记忆、时感、actor 身份解析和语义检索路径保持原样。

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
  本方案不依赖该能力，独立 HTTPS ingress 是可部署的保守路径。

## 部署拓扑

```text
Band 11 -> Android App -> HTTPS receiver /api/health -> Neon health_* tables
                                                         ^
AI -> 原 Horizon MCP 地址 -> 原 FastMCP + health_* 查询工具 --+
```

接收服务不提供 MCP 或健康 HTTP GET 查询。它使用 server-side `HEALTH_ACTOR_ID` 绑定 Horizon
的可信 actor，客户端不能在 payload/header 指定 actor 或 source。当前按单人、单手环接入配置；
手机直传协议没有设备 ID，必须只选择 Band 11，不能将多个设备的数据混入同一个接收实例。
多用户/多设备需要各自独立 token、receiver 配置和 source，不能共用上传密钥。

## 环境变量

所有密钥使用部署平台 Secret 管理，不写入仓库或 `VITE_*` 变量。可用 `openssl rand -hex 32`
分别生成两个不同随机密钥；不要复制示例测试 token。

| 变量 | 接收服务 | Horizon MCP | 说明 |
| --- | --- | --- | --- |
| `HEALTH_INGEST_TOKEN` | 必需 | 不需要 | 上传 Bearer 密钥，32–512 个无空白字符 |
| `HEALTH_QUERY_TOKEN` | 不需要 | 必需 | 独立查询密钥，客户端作为 `x-health-query-token` 请求头发送 |
| `HEALTH_ACTOR_ID` | 必需 | 不需要 | 原 Horizon Authentication 验证后的确切 actor 标识；不要填显示名或猜邮箱 |
| `HEALTH_SOURCE_ID` | 默认 `huawei-band-11` | 同左 | 两边必须相同，1–64 位字母数字、下划线或短横线 |
| `HEALTH_TIMEZONE` | 默认 `Asia/Shanghai` | 不使用 | IANA 时区，必须与手机系统时区一致 |
| `HEALTH_PUBLIC_URL` | 必需 | 不需要 | HTTPS origin，如 `https://health.example.com`，不含路径、查询参数或凭据 |
| `HEALTH_DATABASE_URL` | 推荐 | 推荐 | 健康数据库连接串；未设置时回退 `DATABASE_URL`。可分别使用写入/只读角色连接同一数据库 |
| `DATABASE_URL` | 可回退 | 保留原值 | 原 Neon 连接串，原记忆/时感依赖它；不要为接入健康功能改掉原值 |
| `HEALTH_HOST` | 默认 `127.0.0.1` | 不需要 | TLS 反代与服务同机；容器内部可设 `0.0.0.0`，只暴露给反代 |
| `HEALTH_PORT` | 默认 `3100` | 不需要 | 内部 HTTP 监听端口 |
| `CF_ACCOUNT_ID`、`CF_API_TOKEN` | 不需要 | 保留原配置 | 原有语义检索使用，不改动 |

若同一进程配置了两个 token，代码拒绝相同值。两个进程分别持有最小必要的凭据；运维配置
仍需保证两个密钥独立。查询同时要求原可信 `horizon-actor` 和查询密钥；只带上传密钥不能查询。
不要直接公网启动 Horizon 入口并信任任意客户端自带的 `horizon-actor`。

## 分阶段上线（人工执行，不自动部署）

1. 准备测试 Neon 分支或空测试数据库及合成记录。先从 `information_schema.columns` 确认现有
   `memories` / `gap_last_seen` / `health_*` 的结构；检查有无同名不兼容表，不读取业务行。
   备份/快照现有数据库，记录当前 Horizon release、入口、Authentication 和环境变量名称。
2. 用迁移管理员连接目标**健康数据库**，显式应用 `migrations/0003_health.sql`：

   ```bash
   psql "$HEALTH_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/0003_health.sql
   ```

   迁移只 `CREATE TABLE/INDEX IF NOT EXISTS`，不修改旧表、不删除数据，可重跑。
   Horizon 不自动执行它；不能因为记忆表会自愈建表就跳过这步。
   现有 `npm run build` 会对 `DATABASE_URL` 运行项目迁移；验证构建时保持该变量为空，
   不要在连接生产数据库的环境中试跑构建。若使用独立健康库，显式迁移必须指向该库。
3. 为接收服务角色授予这些健康表的 `SELECT, INSERT, UPDATE`，为 Horizon 健康查询角色授予
   `SELECT`，不授予 DELETE/DDL。原记忆连接串和权限不变。可共用 Neon 实例中的独立表，
   推荐使用独立健康连接角色；必要时健康数据库也可完全独立。
4. 部署接收代码到独立 Node 22.18+ HTTPS 主机。`npm ci --ignore-scripts` 后运行
   `npm run health:receiver`；无额外框架依赖。用服务管理器注入上表环境变量。
   示例反代配置见 `deploy/health-receiver.Caddyfile`。配置仅提供模板，本 PR 没有运行部署。
5. 反代必须终止 TLS、保留 public Host、限制 1 MiB body，并对上传路径设置适当的请求速率限制。
   仅暴露 HTTPS，内部 3100 端口不得公网直连。禁止请求体、Authorization、自定义查询密钥和
   SQL 参数日志，也不要打开返回值/请求体级别的调试跟踪。`/healthz` 只说明进程存活，不代表 DB 可写。
6. 在 Horizon Preview 使用本分支，入口仍为 `server.ts:server`，保留原 Authentication、Neon 和
   Cloudflare 配置；只增加健康查询所需变量。MCP 客户端在原连接的 headers 增加
   `x-health-query-token`，保留原 Horizon 认证。验证自定义头能到达 `getContext().http.headers`。
   若网关未转发该头，需在 Horizon 配置允许转发后才能启用；不要把密钥放进工具参数。
7. 先用合成 payload 验证 200、错误 token 的 401、错误数据的 400、重复同步不增记录、跨 actor
   不可见，以及现有 memory/time/semantic 工具回归。确认这些检查后，再人工审批生产发布。
   真实手环的蓝牙配对、Band 11 固件兼容和后台同步需真机验收，本 PR 不声称已实测真机。

## 手机 App 配置

1. 安装指定 fork 的“健康数据”App，按其 [GUIDE](https://github.com/xiaoyou5602/band-health-sync/blob/7a7fab9bc705881466af87502a8d67cecf85fc36/docs/GUIDE.md)
   完成 Band 11 蓝牙配对、蓝牙/通知权限与后台运行设置。先确认 App 内能看到手环数据。
2. 在自托管健康同步设置中启用上传，只勾选 Band 11。服务器 URL 填
   `https://你的接收域名/api/health`，令牌填 `HEALTH_INGEST_TOKEN` 的原始值（不带 `Bearer `）。
   不要填写 Horizon MCP 地址、`/mcp` 或查询密钥。
3. 手机时区需与 `HEALTH_TIMEZONE` 一致；修改时区后同步调整服务配置。已有某日记录的 source
   时区不允许悄悄改变；旅行导致同一天时区冲突时会返回 400，应使用新 source 配置并分别查询，
   或等待后续新的本地日期，避免把步数错归日期。
4. 选择首次回填起点，启用“取数后立即上传”和周期兜底（例如 30 分钟）；允许后台电池策略。
   根据需要启用“运动摘要上传”（上游默认关闭），否则运动查询会明确无数据。
5. 点击“立即上传”，确认状态为 HTTP 200，然后通过原 MCP 调用 `health_get_status` 和摘要工具。
   HTTP 400 检查时区/数据，401 检查上传令牌，413 表示请求过大，503 表示数据库或迁移未就绪。
6. 上游 Huawei 历史心率后台抓取默认每 3 分钟；实际仍受蓝牙、系统调度、手机网络影响。
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
npm test
npm run test:memory
npm run test:health
# 仅使用一次性测试库，不会回退到生产 DATABASE_URL：
npm run test:health:postgres
npm run typecheck
npm run build
```

Postgres 测试需要 `HEALTH_TEST_DATABASE_URL`，使用合成数据；测试会创建测试表和故障注入约束，
只能用于临时数据库。CI 使用 Postgres 16 service，无生产 secrets，也没有部署步骤。
测试覆盖原记忆/时感核心、上传错误响应、鉴权隔离、重复/并发同步、事务回滚、时区/DST、睡眠修订、
运动修订、分页、重启读取及已有记忆行保留。

回滚顺序：先暂停 App 上传并停止独立接收服务/撤销上传密钥，再将 Horizon 切回接入前 release。
原记忆/时感/语义检索配置保持原值；移除客户端的健康查询头并撤销健康查询密钥。
保留五张健康表和数据，不执行 DROP/TRUNCATE/DELETE；旧版本不引用它们，保留不会影响记忆工具。
需恢复时重新启用本版本与独立服务；幂等同步允许安全重试。不要为回滚恢复整库覆盖现有记忆。
