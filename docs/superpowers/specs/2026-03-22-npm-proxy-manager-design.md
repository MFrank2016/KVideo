# Nginx Proxy Manager 独立反向代理部署设计

## 背景与目标

当前仓库已经具备 `KVideo + danmu_api + sub-converter` 的 Docker Compose 部署能力，且业务服务默认只绑定宿主机 `127.0.0.1`。现在需要补充一套独立的 Nginx Proxy Manager（下称 NPM）部署方案，用于：

- 通过独立 `docker compose` 启动 NPM
- 对外暴露 `80/443/81`
- 让 `tv.831688.xyz` 通过 Cloudflare DNS 指向当前机器
- 使用 NPM Web UI 远程管理反向代理
- 在不直接暴露 KVideo 后端服务的前提下，将公网流量转发到 KVideo

设计目标是：**反向代理层独立运维、业务层继续本地收口、部署方式可复制、证书申请路径清晰。**

## 已确认约束

1. NPM 必须与现有 KVideo 栈分开管理，使用独立 compose 目录。
2. NPM 管理后台 `81` 端口需要直接对外暴露，便于远程访问。
3. `kvideo` / `danmu-api` / `sub-converter` 继续保持现有的 `127.0.0.1` 端口绑定策略，不直接向公网开放。
4. NPM 需要能够稳定访问 KVideo 上游，而不是依赖 Linux 上不总是可靠的 `host.docker.internal`。
5. 方案最终以 `tv.831688.xyz` 为主域名，由用户在 Cloudflare 中配置 DNS。

## 方案比较

### 方案 A：NPM 独立 compose + 共享外部 Docker 网络（推荐）

结构：
- 现有 `deploy/docker-compose.yml` 保持业务服务定义
- 新增 `deploy/npm/docker-compose.yml`
- 新建一个共享外部网络，例如 `kvideo-proxy`
- KVideo 栈与 NPM 栈同时加入该网络
- NPM 在 UI 中直接将 `kvideo` 作为上游主机名，端口写 `3000`

优点：
- 反代层与业务层完全解耦
- 后端服务不需要改为公网监听
- 不依赖宿主机网关地址或 `host.docker.internal`
- 符合 NPM 官方“同 Docker 网络内以服务名反代”的最佳实践

缺点：
- 需要额外维护一个外部 Docker 网络

### 方案 B：NPM 独立 compose + 转发到宿主机 `127.0.0.1`

优点：
- 不需要共享网络

缺点：
- Linux 容器里无法直接访问宿主机 `127.0.0.1`
- 需要额外桥接地址或特殊 host-gateway 配置
- 可移植性与解释性都更差

### 方案 C：把业务服务也放开到 `0.0.0.0`

优点：
- 反代最简单

缺点：
- 违背“仅由 NPM 对外暴露”的安全目标
- `3000/9321/18080` 将直接暴露到公网

结论：采用**方案 A**。

## 总体架构

部署拆成两个 compose 栈：

### 1. 业务栈：`deploy/docker-compose.yml`

继续负责：
- `kvideo`
- `danmu-api`
- `sub-converter`

关键变化：
- 在保留原有 `127.0.0.1` 端口绑定的同时，加入共享外部网络 `kvideo-proxy`
- 使 `kvideo` 服务名可被 NPM 直接解析并访问

### 2. 反代栈：`deploy/npm/docker-compose.yml`

负责：
- `nginx-proxy-manager`

关键职责：
- 暴露 `80:80`、`443:443`、`81:81`
- 持久化 `/data` 与 `/etc/letsencrypt`
- 连接到同一个外部网络 `kvideo-proxy`
- 通过 Web UI 为 `tv.831688.xyz` 配置反向代理和证书

## Docker 网络设计

新增共享外部网络：

- 网络名：`kvideo-proxy`

使用方式：
- 由运维命令先创建：`docker network create kvideo-proxy`
- KVideo compose 与 NPM compose 都声明：

```yaml
networks:
  default:
    external: true
    name: kvideo-proxy
```

收益：
- 两个独立 compose 项目可以互通
- NPM 可直接把 `kvideo` 当作上游主机名
- 业务服务仍可保留本地回环端口绑定

## NPM 服务设计

NPM 采用 SQLite 最小部署，避免额外数据库容器。

容器配置要点：
- 镜像：`jc21/nginx-proxy-manager:latest`
- 端口：
  - `80:80`
  - `443:443`
  - `81:81`
- 卷：
  - `./data:/data`
  - `./letsencrypt:/etc/letsencrypt`
- 重启策略：`unless-stopped`
- 时区：使用 `TZ`

首版不引入 MariaDB，原因：
- 这是单机场景
- NPM 官方文档支持 SQLite 最小部署
- 降低首次部署复杂度

## 业务服务互通设计

在共享网络中：
- NPM 上游主机：`kvideo`
- 上游端口：`3000`
- Scheme：`http`

这样配置后：
- 公网 `https://tv.831688.xyz`
- 由 NPM 接收并终止 TLS
- 再由 NPM 通过 Docker 网络把流量转发给 `kvideo:3000`

`danmu-api` 与 `sub-converter` 不需要单独做公网入口，因为它们已经由 KVideo 在应用层间接使用。

## Cloudflare 与域名策略

前提：
- `tv.831688.xyz` 的 DNS A 记录指向当前机器公网 IP

建议：
- 初次申请 Let’s Encrypt 时，优先使用 **DNS only**（灰云）
- 证书签发成功并验证访问正常后，再视需要切回 Cloudflare 代理

原因：
- HTTP-01 挑战依赖 `80/443`
- 若 Cloudflare 代理或源站规则配置不当，可能影响首次签发

## NPM UI 操作设计

文档需要明确以下操作步骤：

1. 打开 `http://服务器IP:81`
2. 登录 NPM 管理界面
3. 新建 Proxy Host：
   - Domain Names: `tv.831688.xyz`
   - Scheme: `http`
   - Forward Hostname / IP: `kvideo`
   - Forward Port: `3000`
   - 勾选 `Websockets Support`
4. 在 SSL 页签：
   - Request a new SSL Certificate
   - 勾选 `Force SSL`
   - 勾选 `HTTP/2 Support`
   - 按需勾选 HSTS

文档不强依赖某一默认初始密码文案，而是以“首次访问 NPM 管理后台并按页面提示完成登录/改密”为准，避免未来上游文档变化导致说明失效。

## 目录布局

新增目录：

```text
deploy/
  npm/
    docker-compose.yml
    README.md
    data/
    letsencrypt/
```

说明：
- `data/`：NPM SQLite 数据、用户配置、代理规则
- `letsencrypt/`：证书持久化目录

这两个目录都应保留 `.gitkeep`，而实际运行数据不纳入版本控制。

## 错误处理与运维策略

### 网络不存在

现象：
- compose 启动时报外部网络不存在

处理：
- 在 README 中明确要求先执行：
  - `docker network create kvideo-proxy`

### 80/443/81 端口冲突

现象：
- NPM 无法启动

处理：
- 文档中提示先检查宿主机现有 Web 服务、旧反代容器或安全面板

### 证书申请失败

常见原因：
- Cloudflare 代理导致 HTTP-01 不通
- 80/443 未放行
- 域名尚未解析生效

处理：
- 提供检查顺序：
  1. DNS 是否已生效
  2. Cloudflare 是否临时切为 DNS only
  3. 宿主机安全组/防火墙是否已放行 80/443
  4. NPM 容器是否正常运行

### 502 Bad Gateway

常见原因：
- `kvideo` 没加入共享网络
- NPM 上游主机名填错
- KVideo 服务未启动

处理：
- 文档中明确检查：
  - `docker network inspect kvideo-proxy`
  - `docker compose -f deploy/docker-compose.yml ps`
  - `docker compose -f deploy/npm/docker-compose.yml ps`

## 验证策略

实现完成后至少验证：

1. `docker compose -f deploy/docker-compose.yml config` 成功
2. `docker compose -f deploy/npm/docker-compose.yml config` 成功
3. 两个 compose 项目都能启动
4. `docker network inspect kvideo-proxy` 可见两边容器
5. 从 NPM 容器内能解析并访问 `kvideo:3000`
6. 宿主机访问 `http://127.0.0.1:3000` 仍正常
7. NPM 管理端口 `81` 可访问
8. 代理配置完成后，域名能正确打开 KVideo 首页

## 非目标

本次设计不包含：

- 为 `danmu-api` 或 `sub-converter` 单独暴露公网域名
- 自动化调用 NPM API 创建代理主机
- 自动化申请 Cloudflare DNS API 证书
- 引入额外数据库以替代 SQLite
