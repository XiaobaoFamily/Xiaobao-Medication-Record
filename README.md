# 小宝用药记录 PWA

一个无需构建步骤、可以直接部署到 GitHub Pages 的静态 PWA。数据由 Supabase 保存，登录使用邮箱 Magic Link。

## 首次设置

1. 新建 Supabase 项目，在 **SQL Editor** 中运行 `supabase/schema.sql`。
2. 在 **Authentication → URL Configuration** 中：
   - Site URL 填 GitHub Pages 地址，例如 `https://YOUR_NAME.github.io/YOUR_REPO/`
   - Redirect URLs 加入同一个地址，并保留末尾 `/`
3. 在 Supabase **Project Settings → API** 复制 Project URL 和 `anon` / `publishable` key，填入 `config.js`。
   - 不要把 `service_role` 或 secret key 放进这个仓库。
4. 把项目 push 到 GitHub 的 `main` 分支，在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 本地预览

PWA 和 ES modules 需要通过 HTTP 打开，不能直接双击 `index.html`。可在项目目录运行任意静态服务器，例如：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。如需测试本地 Magic Link，也要把这个地址加入 Supabase Redirect URLs。

## 数据设计

- `occurred_at`：事件实际发生时间（带时区）
- `type`：`inhaled`、`oral`、`behavior`
- `medicine`：行为记录时为空
- `dose_amount` + `dose_unit`：拆分存储，方便统计和校验
- `note`：可选备注
- `user_id`：由登录用户自动写入，用 RLS 保证只能访问自己的记录

`total` 没有存进表，而是按事件实时统计，避免补录或删除后数字失真。

## 当前边界

- 离线时可以打开已缓存的界面，但新增记录仍需要网络连接到 Supabase。
- 当前每个账号只能看到自己的记录；若需要两位照护者共享同一个小宝的数据，应增加 family / caregiver membership 表。
- 本项目用于记录，不代替医生意见或正式病历。
