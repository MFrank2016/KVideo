# Nginx Proxy Manager 反向代理快速指南

本目录包含 Nginx Proxy Manager (NPM) 的 Docker Compose 模板，适合在已有 KVideo 堆栈之上添加一层公网 HTTPS/域名反向代理。请务必让 NPM 与业务容器共享 `kvideo-proxy` 网络，并在 Proxy Host 中将请求转发到网络别名 `kvideo`（Compose service 名称/网络别名，容器名为 `kvideo-compose`），以便反向代理能访问内部服务。

## 1. Bootstrap：网络与堆栈

1. **创建 `kvideo-proxy` 网络**（若已存在可跳过）：
   ```sh
   docker network create kvideo-proxy
   ```
   - 可通过 `docker network ls | grep kvideo-proxy` 验证网络是否就绪。
2. **启动业务堆栈（从仓库根目录）**：
   ```sh
   (cd deploy && docker compose up -d --build)
   ```
   - 该堆栈包含 `kvideo`、`danmu-api`、`sub-converter`，使用外部网络 `kvideo-proxy`。其中 `kvideo` 监听 `127.0.0.1:${KVIDEO_PORT:-3000}`，主机可通过该地址访问；其他在 `kvideo-proxy` 网络（例如 NPM）需使用服务别名 `kvideo:3000`。
3. **启动 NPM 反向代理（从仓库根目录）**：
   ```sh
   (cd deploy/npm && docker compose up -d)
   ```
   - 依赖同一个 `kvideo-proxy` 网络，这里不会自动创建网络，因此必须先执行第 1 步。
4. **访问 NPM UI 并完成首次登录**：
   - 在浏览器打开 `http://<server-ip>:81`（`<server-ip>` 为能访问该服务器的公网/管理 IP）。
   - 首次访问时按照提示填写管理员邮箱+密码并激活账号；不要依赖仓库里的默认密码，务必在 UI 中完成登录凭证设置。
   - 为持久化配置，`deploy/npm/data` 记录 UI 数据，`deploy/npm/letsencrypt` 保存证书。

## 2. 创建 Proxy Host

1. 打开 NPM 控制台，点击 **Proxy Hosts → Add Proxy Host**。
2. 填写字段：
   - **Domain Names**：`<your-domain>`（例如 `tv.831688.xyz`，需在 DNS 中指向服务器的公网/管理 IP）。
   - **Scheme**：选择 `http`。
   - **Forward Hostname / IP**：`kvideo`（Compose service 名称/网络别名，容器名为 `kvideo-compose`）。
   - **Forward Port**：`3000`。
   - **Block Common Exploits**：开启，提升安全性。
   - **Websockets Support**：根据需要启用，KVideo 包含 WebSocket 通信。
3. 点击 **Save** 保存 Proxy Host；保存后该记录会以 `kvideo` 网络别名为 upstream，NPM 会使用 `kvideo-proxy` 网络连通。
4. 确保 DNS 指向服务器 IP，否则证书申请时会失败（例如 `tv.831688.xyz`）。

## 3. Let's Encrypt 证书

1. 在刚刚创建的 Proxy Host 编辑界面，切换到 **SSL** 选项卡。
2. 勾选 **Request a new SSL Certificate**、**Force SSL**（可选）并填写管理员邮箱。
3. 点击 **Save** 重新提交设置，NPM 会自动向 Let's Encrypt 发起证书申请。
4. **Cloudflare 用户注意**：申请阶段请把 `<your-domain>`（例如 `tv.831688.xyz`）的代理状态设置为“DNS only”（灰色云朵），确保 Let's Encrypt 能直接访问 NPM；证书签发后可按需再切换回代理状态。

## 4. 常见故障排查

### 4.1 80/443/81 端口占用

- NPM 默认监听 `80`/`443`/`81`，若宿主机上已有 Web 服务占用这些端口会导致容器启动失败。
- 运行 `sudo lsof -i :80 -i :443 -i :81` 找出占用进程，或使用 `ss -tulpn | grep "80\|443\|81"`。
- 停止冲突服务或在 `deploy/npm/docker-compose.yml` 中调整端口映射后重新 `docker compose up -d`。

### 4.2 502 Bad Gateway / 连接失败

- 确认 `kvideo` 服务在运行：`docker compose -f deploy/docker-compose.yml ps kvideo`，必要时查看日志 `docker compose -f deploy/docker-compose.yml logs -f kvideo`。
- Proxy Host 应指向服务别名 `kvideo:3000`（Compose service 名称/网络别名，容器名为 `kvideo-compose`），使用 HTTP 协议；错误配置会触发 502。
- 验证网络连通：临时运行一个 curl 容器加入 `kvideo-proxy` 网络，例如 `docker run --rm --network kvideo-proxy curlimages/curl:latest -I http://kvideo:3000`；若无法连接说明网络或服务异常。
- 检查 `kvideo` 是否绑定在 `kvideo-proxy` 网络，`docker network inspect kvideo-proxy` 应能看到 `kvideo` 和 `kvideo-nginx-proxy-manager`。

### 4.3 缺少 `kvideo-proxy` 网络

- `docker compose up` 报错 `Network "kvideo-proxy" not found` 意味着网络尚未创建。
- 重新执行第 1 步：`docker network create kvideo-proxy`。
- 之后先启动业务堆栈，再运行 NPM stack（均在仓库根目录执行）：
  ```sh
  (cd deploy && docker compose up -d --build)
  (cd deploy/npm && docker compose up -d)
  ```
```
