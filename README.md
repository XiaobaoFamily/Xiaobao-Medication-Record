# 小宝大事记 PWA

一个无需构建步骤、可以直接部署到 GitHub Pages 的静态 PWA。可记录用药、护理和医疗时间轴，数据由 Supabase 保存，登录使用邮箱和密码。

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

然后访问 `http://localhost:8080`。如需测试密码设置邮件，也要把这个地址加入 Supabase Redirect URLs。

## 数据设计

- `occurred_at`：事件实际发生时间（带时区）
- `type`：`inhaled`、`oral`、`behavior`、`brushing`、`elimination`
- `medicine`：行为记录时为空
- `dose_amount` + `dose_unit`：拆分存储，方便统计和校验
- `frequency`：该条用药记录发生时采用的服药频率，格式为“每 X 天 X 次”（例如 `每天3次`、`每3天1次`）
- `bowel_movement`：排泄记录是否有大便
- `urine_amount`：排泄记录中的小便团数
- `note`：可选备注
- `user_id`：由登录用户自动写入；RLS 只允许配置的两位照护者访问，并让两人共享记录

`total` 没有存进表，而是按事件实时统计，避免补录或删除后数字失真。

医疗时间轴使用独立的 `medical_history` 表：

- `occurred_on`：疫苗、疾病或用药变化发生的日期
- `event_type`：`vaccine`、`illness`、`medication_start` 或 `medication_change`
- `title`：疫苗名称、疾病名称或药物名称
- `dose`：变化后的剂量，仅用于自动生成的用药变化
- `frequency`：变化后的频率，仅用于自动生成的用药变化
- `source_medication_record_id`：自动生成的用药变化所对应的原始用药记录，用于防止重复
- `is_user_edited`：标记医疗时间轴事件是否经过手动编辑，避免历史回填覆盖修改
- `note`：医院、症状、医生建议或调整原因等补充信息

所有事件都从“记录”Tab 添加：疫苗和疾病保存后直接进入医疗时间轴；吸入药和口服药则由数据库自动判断。如果药名从未在历史记录中出现，会写入一条“新增用药”并保存初始剂量和频率；如果药名已经出现，但相对同类上一条记录的药名、剂量、剂量单位或频率发生变化，会写入一条“用药变化”。重新运行医疗时间轴脚本时，也会补齐已有记录中的首次用药和历史变化。

口服药可以从下拉菜单选择历史药名，也可以选择“新增其他口服药”后输入新药名。看板上的口服药提醒只计算 `Prednisolone`（泼尼松龙），其他口服药不会计入提醒。医疗时间轴中的事件可以编辑；编辑后会标记为手动修改，后续历史回填不会覆盖。删除事件前会要求再次确认。

医疗时间轴每页显示 10 条，可用上一页/下一页浏览；月份下拉菜单可筛选单月，选择“全部月份”时会保留月份分割线。

### 为现有数据库加入 frequency

如果数据库是在加入 `frequency` 之前创建的，请先在 Supabase **SQL Editor** 中运行一次
`supabase/add_frequency.sql`，再部署新版网页。该脚本会为旧记录补上对应疗程阶段的频率。

### 为现有数据库加入刷牙和排泄

在部署包含刷牙、排泄和口服药提醒的版本前，请在 Supabase **SQL Editor** 中运行一次
`supabase/add_care_types.sql`。

### 为现有数据库加入医疗时间轴

部署包含“医疗”Tab 的版本前，请在 Supabase **SQL Editor** 中运行一次
`supabase/add_medical_history.sql`。升级到支持“新增用药”自动事件的版本时也请重新运行整份脚本。该脚本可重复运行，会创建或升级医疗记录表、补齐历史首次用药和方案变化，并启用后续自动记录；同时沿用现有两位照护者的共享访问权限。

## 当前边界

- 离线时可以打开已缓存的界面，但新增记录仍需要网络连接到 Supabase。
- 当前只允许 schema 中列出的两位照护者登录，两人可以共同读取和维护小宝的全部记录。
- 本项目用于记录，不代替医生意见或正式病历。
