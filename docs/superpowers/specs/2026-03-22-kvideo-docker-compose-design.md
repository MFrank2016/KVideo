# KVideo + danmu_api Docker Compose 部署设计

## 背景与目标

目标是在当前 KVideo 仓库中补充一套可复用的 Docker Compose 部署方案，同时满足以下要求：

- 使用 KVideo 多账户系统（`ACCOUNTS`）
- 为 `/premium` 提供独立密码（`PREMIUM_PASSWORD`）
- 主登录会话持久化（`PERSIST_SESSION=true`）
- 支持站点名称、标题、描述自定义
- 自动接入并持续刷新多个外部订阅源
- 预置广告过滤关键词（至少包含“博彩”“新葡京”）
- 一起部署 `huangxd-/danmu_api` 并作为 KVideo 默认弹幕 API
- 尽量避免对 KVideo 主逻辑做侵入式修改，优先通过部署层实现兼容

本设计优先追求“可维护、可升级、可解释”，而不是最少容器数。

## 已确认约束

1. `ew/test.json` 已是 KVideo 可识别的标准源列表，可直接纳入订阅。
2. MoonTV 的 `config.json` 与 LunaTV 的 `jin18.json` / `jingjian.json` 都使用 `api_site` 对象格式，KVideo 当前订阅解析器不能直接消费。
3. KVideo 中与品牌和默认弹幕 API 相关的 `NEXT_PUBLIC_*` 配置更适合在构建期注入；直接使用官方预构建镜像再在运行期设置这些变量，存在不生效风险。
4. KVideo 的跨设备配置/收藏/历史同步依赖 Upstash Redis；未配置时应用仍可运行，但只保留本地持久化。
5. `PREMIUM_PASSWORD` 的解锁范围是浏览器会话；`PERSIST_SESSION` 持久化的是主登录会话。

## 方案比较

### 方案 A：Compose + 本地构建 KVideo + 订阅转换服务（推荐）

结构：
- `kvideo`：本地构建镜像
- `danmu-api`：直接运行上游镜像
- `sub-converter`：拉取并转换 MoonTV / LunaTV / ew 为 KVideo 标准格式

优点：
- 不需要深改 KVideo 订阅解析逻辑
- 上游 KVideo 更新时冲突最少
- 可以集中处理源清洗、去重、普通/高级分流
- 更容易扩展新的外部配置格式

缺点：
- 多一个轻量服务

### 方案 B：修改 KVideo，使其原生兼容 `api_site`

优点：
- 服务更少
- 订阅地址可以直连上游

缺点：
- 要改动应用逻辑
- 后续升级 KVideo 更容易产生冲突
- 需要长期维护多种订阅格式兼容

### 方案 C：离线转换后静态挂载

优点：
- 运行时最简单

缺点：
- 不具备自动更新能力
- 不满足“自动订阅源”的要求

结论：采用方案 A。

## 总体架构

Docker Compose 包含三个服务：

### 1. `kvideo`

职责：
- 提供主站 UI 和 API
- 处理多账户认证、权限、`/premium` 独立密码
- 读取标准化后的订阅源
- 预置广告关键词与默认弹幕 API

部署策略：
- 使用当前仓库 `Dockerfile` 本地构建
- 构建期注入：`NEXT_PUBLIC_SITE_NAME`、`NEXT_PUBLIC_SITE_TITLE`、`NEXT_PUBLIC_SITE_DESCRIPTION`、`NEXT_PUBLIC_DANMAKU_API_URL`
- 运行期注入：`ADMIN_PASSWORD`、`ACCOUNTS`、`PREMIUM_PASSWORD`、`PERSIST_SESSION`、`SUBSCRIPTION_SOURCES`、`AD_KEYWORDS_FILE`、可选的 Upstash Redis 配置

### 2. `danmu-api`

职责：
- 提供兼容 KVideo 的弹幕搜索与评论接口
- 作为 KVideo 默认弹幕源
- 本地缓存和配置持久化

部署策略：
- 使用 `logvar/danmu-api:latest`
- 挂载 `config/.env` 与 `.cache`
- 默认使用不显式写 token 路径也可访问的默认 token 方案，方便 KVideo 作为默认弹幕地址直接配置为 `http://danmu-api:9321`

### 3. `sub-converter`

职责：
- 拉取 `ew/test.json`
- 拉取 `MoonTV/config.json`
- 拉取 `LunaTV-config/jin18.json`
- 拉取 `LunaTV-config/jingjian.json`
- 统一转换为 KVideo 标准订阅结构
- 输出普通区与高级区订阅快照

输出地址：
- `/feeds/normal.json`
- `/feeds/premium.json`
- `/feeds/all.json`（调试可选）

## 订阅转换规则

### 输入格式兼容

#### KVideo 原生格式
- 输入示例：`ew/test.json`
- 处理：直接读取数组或 `sources/list` 数组，做轻量清洗与去重
- 默认分组：普通区

#### `api_site` 对象格式
- 输入示例：MoonTV / LunaTV
- 处理：读取 `api_site` 下各对象，转换为：
  - `id`
  - `name`
  - `baseUrl`
  - `group`
  - `enabled`
  - `priority`

映射规则：
- `api` → `baseUrl`
- `name` → 清洗后的 `name`
- `group` → 由来源与规则决定

### 分组策略

#### 普通区
- `ew/test.json` 全部
- LunaTV `jin18.json` 全部
- MoonTV 中未命中高级关键词的源

#### 高级区
- LunaTV `jingjian.json` 全部
- MoonTV 中命中高级关键词的源

### MoonTV 高级关键词

第一版以名称关键字归类，命中即视为高级区：

- `AV`
- `番号`
- `麻豆`
- `色`
- `黄`
- `淫`
- `无码`
- `福利`
- `国产自拍`

该列表单独放在规则文件中，后续允许维护。

### 去重与命名清洗

去重主键：优先 `baseUrl`。

优先保留顺序：
- 普通区：`ew` > `Luna jin18` > `MoonTV`
- 高级区：`Luna jingjian` > `MoonTV`

名称清洗：
- 去掉 `TV-` / `AV-`
- 去掉 emoji 前缀（如 `🎬`）
- 对重名不同 URL 的源追加来源后缀避免混淆

### 刷新与容错

- 启动时立即拉取并生成快照
- 之后定时刷新（建议 6 小时）
- 刷新失败时保留上一次成功快照，不输出空订阅
- KVideo 始终订阅 `sub-converter` 输出的稳定地址，而非直接依赖上游 Raw URL

## 配置设计

### 多账户与权限

推荐保留：
- 一个 `ADMIN_PASSWORD` 作为应急超级管理员入口
- `ACCOUNTS` 作为日常多账户入口
- `PREMIUM_PASSWORD` 独立保护高级区
- `PERSIST_SESSION=true`

推荐账户分层：
- `super_admin`：站长
- `admin`：可信管理者
- `viewer`：普通观看用户，可按需附加 `iptv_access`

### 站点品牌

构建期变量：
- `NEXT_PUBLIC_SITE_NAME`
- `NEXT_PUBLIC_SITE_TITLE`
- `NEXT_PUBLIC_SITE_DESCRIPTION`

### 系统订阅

运行期 `SUBSCRIPTION_SOURCES` 指向转换服务输出：

- `http://sub-converter:8080/feeds/normal.json`
- `http://sub-converter:8080/feeds/premium.json`

KVideo 启动后自动同步这些订阅，并在用户访问时按其自身逻辑进行增量更新。

### 广告过滤

采用文件方式：
- `AD_KEYWORDS_FILE=/app/config/ad_keywords.txt`

初始关键词至少包含：
- `博彩`
- `新葡京`

并扩展一些常见博彩/赌场相关词，便于开箱即用。

### danmu_api

`danmu-api` 第一版采用最小必要配置：
- `TOKEN=87654321`
- `DANMU_API_PORT=9321`
- `RATE_LIMIT_MAX_REQUESTS=0`

KVideo 默认弹幕 API 指向：
- `http://danmu-api:9321`

### 可选云同步

若用户提供 Upstash Redis，则在 `kvideo` 中配置：
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

未提供时不阻断部署，仅缺少跨设备同步能力。

## 目录布局

建议新增：

```text
deploy/
  docker-compose.yml
  .env
  kvideo/
    .env.build
    ad_keywords.txt
  danmu_api/
    config/
      .env
    .cache/
  sub-converter/
    data/
      normal.json
      premium.json
      all.json
    rules/
      premium_keywords.txt
```

## 数据流

1. `sub-converter` 拉取上游配置并输出标准 JSON。
2. `kvideo` 通过 `SUBSCRIPTION_SOURCES` 读取 `sub-converter` 的标准 JSON。
3. 用户访问 KVideo 时，KVideo 自动同步系统订阅到本地设置。
4. 用户开启弹幕后，KVideo 通过自身 `/api/danmaku` 代理访问 `danmu-api`。
5. 若配置 Upstash Redis，KVideo 额外同步配置、历史、收藏。

## 错误处理与验证

### 错误处理
- 上游订阅拉取失败：保留旧快照
- MoonTV/LunaTV 单个条目缺字段：跳过该条目，不中断全量输出
- `danmu-api` 暂时不可用：KVideo 弹幕功能失败，但主站可继续工作
- 未配置 Upstash：静默降级到本地存储

### 验证目标
- Compose 可一键启动
- 多账户登录正常
- `/premium` 被独立密码保护
- 登录会话在浏览器中持久化
- 站点名称/标题/描述已替换
- KVideo 能自动读取普通/高级订阅
- 广告关键词已预加载
- 默认弹幕 API 指向 `danmu-api`
- `danmu-api` 接口可被 KVideo 正常消费

## 范围控制

第一版不做：
- 在转换服务中主动测速或探测源可用性
- 在转换服务中做代理校验
- 修改 KVideo 核心订阅解析协议以直接支持 MoonTV/LunaTV
- 为 `danmu-api` 额外引入本地 Redis 作为必需依赖

这些都可以在部署稳定后再迭代。
