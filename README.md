# tcpaiii

派次元 API 前端与 ESA Functions & Pages 项目，线上域名为 `https://t.paiii.cn`。前端负责在线预览、图库管理、接口文档和统计展示，后端函数提供随机图片、图库增删改查、批量导入和统计接口。

## 本地开发

```sh
npm install
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
- `POST /api/create`、`PUT /api/update/:id`、`DELETE /api/delete/:id`、`POST /api/batch`：图库管理接口。

## ESA 部署

当前项目名固定为 `tcpaiii`，避免继续发布到模板项目 `vite-react-template`。

```sh
npm run esa:login
npm run esa:deploy
```

如果线上访问 `/api/random?format=json` 返回 `<!doctype html>` 或首页内容，说明 `/api/*` 没有命中函数，通常是路由绑定缺失或仍在访问旧项目。登录 ESA 后执行：

```sh
npm run esa:route:list
npm run esa:route:api
npm run check:api
```

`esa:route:api` 绑定的是：

```sh
esa-cli route add t.paiii.cn/api/* paiii.cn --alias tcpaiii-api
```

绑定成功后：

- `https://t.paiii.cn/api/random` 应返回 `302`，响应头 `Location` 是图片地址。
- `https://t.paiii.cn/api/random?tag=acg` 应返回 `302`，响应头 `Location` 是图片地址。
- `https://t.paiii.cn/api/random?format=json` 应返回 `application/json`。

## GitHub

远程仓库：

```sh
git remote -v
git push -u origin main
```

如果 HTTPS 推送失败，需要先在本机登录 GitHub CLI、配置凭据管理器，或把远程地址切换为 SSH。
