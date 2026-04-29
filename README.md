# tcpaiii

派次元 API 前端与腾讯云 EdgeOne Pages 项目，线上域名为 `https://t.paiii.cn`。前端负责在线预览、图库管理、接口文档和统计展示，后端 Pages Functions 提供随机图片、图库增删改查、批量导入和统计接口，数据写入 EdgeOne KV。

## 本地开发

```sh
npm install
npm run edgeone:dev
```

`edgeone pages dev` 会读取 `edgeone.json` 的 `devCommand` 启动 Vite，并在同一个本地端口代理 Pages Functions。若只开发前端界面，也可以直接运行：

```sh
npm run dev
```

常用检查：

```sh
npm run lint
npm run test
npm run build
```

## API 行为

- `GET /api/random`：默认 `302` 重定向到随机图片 URL。
- `GET /api/random?tag=acg`：按标签筛选后 `302` 重定向到图片 URL。
- `GET /api/random?format=json`：返回 JSON，供在线预览和前端调用使用。
- `GET /api/stats`：返回图片数量、标签列表、调用统计和最近 7 天数据。
- `GET /api/list`：无参数时返回旧版完整图库数组；带 `page` / `pageSize` / `search` / `tag` 参数时返回分页结果。
- `POST /api/create`、`PUT /api/update/:id`、`DELETE /api/delete/:id`、`POST /api/batch`：图库管理接口，必须携带管理密钥。

## EdgeOne KV

EdgeOne Pages 控制台里创建两个 KV 命名空间，并绑定到项目变量：

- `images_kv`：保存图库数据，主要 key 为 `all`。
- `stats_kv`：保存统计和管理配置，主要 key 为 `data` 与 `admin-config`。

项目函数入口在 `edge-functions/api/[[default]].ts`，会接管 `/api/*`。代码优先读取 EdgeOne Pages 运行时注入的 `images_kv` / `stats_kv` 绑定；本地单元测试里仍可通过 mock 绑定覆盖 KV 行为。

## 管理鉴权

公开读接口不需要鉴权；所有写接口必须携带：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

管理密钥支持三种配置方式：

- 推荐：在 EdgeOne Pages 环境变量中配置 `ADMIN_TOKEN`。
- 可选：配置 `ADMIN_TOKEN_SHA256` 为管理密钥的 SHA-256 十六进制摘要。
- 可选：在 `stats_kv` 中写入 `admin-config` 记录，内容为 `{"tokenSha256":"<管理密钥 SHA-256 十六进制摘要>","updatedAt":"2026-04-29T00:00:00.000Z"}`，避免保存明文。

两种环境变量同时存在时优先使用 `ADMIN_TOKEN`。如果没有配置管理密钥，写接口会返回 `503 Admin token is not configured`，不会允许任何人添加、编辑或删除图片。

前端图库页会要求输入管理密钥，密钥只保存在当前页面内存中，刷新页面后需要重新输入，不写入 `localStorage`。图库页的“校验”按钮会请求 `GET /api/admin/verify`，只有服务端验证通过后页面才显示“已验证”。

## EdgeOne Pages 部署

当前项目名固定为 `tcpaiii`。

```sh
npm run edgeone:login
npm run edgeone:link
npm run edgeone:deploy
```

CLI 会按 `edgeone.json` 执行 `npm run build`，并自动打包 `dist`、`edge-functions` 和 `package.json` 部署到 Pages。预览环境部署：

```sh
npm run edgeone:deploy:preview
```

上线后检查：

```sh
npm run check:api
```

绑定成功后：

- `https://t.paiii.cn/api/random` 应返回 `302`，响应头 `Location` 是图片地址。
- `https://t.paiii.cn/api/random?tag=acg` 应返回 `302`，响应头 `Location` 是图片地址。
- `https://t.paiii.cn/api/random?format=json` 应返回 `application/json`。

如果线上访问 `/api/random?format=json` 返回 `<!doctype html>` 或首页内容，说明 `/api/*` 没有命中 Pages Functions，请检查 `edge-functions/api/[[default]].ts` 是否随 EdgeOne Pages 项目部署，并确认当前域名指向的是新项目。

## GitHub

远程仓库：

```sh
git remote -v
git push -u origin main
```
