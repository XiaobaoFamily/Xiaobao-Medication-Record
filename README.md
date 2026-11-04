# 小宝大事记 PWA

一个无需构建步骤、可以直接部署到 GitHub Pages 的静态 PWA。可记录用药、护理和医疗时间轴，数据由 Supabase 保存，登录使用邮箱和密码。

记录事件时可一键把所选日期的时间设为早上 10:00 或晚上 22:00，也可用快捷按钮前后调整 30 分钟。

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

## 趋势图与 PDF

底部“趋势”Tab 支持自定义起止日期、“全部时间”和截至最新记录日期的“最近30天”。日期和时段均按芝加哥时区统计，完整历史记录会分页读取。修改日期后点击“生成图表”应用筛选。

页面包含五张英文图表，统一使用本地 Apache ECharts：

- 合并图：氟替卡松与泼尼松龙的双轨用药阶段时间线，下方对齐展示每天记录的咳嗽发作次数。
- 两张单药图：用阶段色块显示单次剂量和方案频率，图内表格列出每一段的完整起止日期；短阶段可悬停查看详情。
- 咳嗽记录图：上方面板显示每天的发作记录数（整数刻度），下方面板显示备注中估计的咳嗽下数（每20下一格），保留范围线、下限和未知计数标记。鼻涕与阿莫西林/克拉维酸时间标注位于上方面板。
- 时段点阵图：显示每条咳嗽记录的芝加哥本地时刻，图例使用独立区域，支持日期滑块缩放和悬停查看准确时间。

时间线文字显示单次剂量及频率，颜色深浅按方案折算的日均剂量决定：同一种药物内，日均剂量越高颜色越深。例如 `5 mg q48h` 相当于 2.5 mg/天。颜色在不同日期筛选范围内保持一致，两种药物之间不能直接比较。同一阶段记录多个方案时，色深采用各方案日均剂量的简单平均并明确标注；缺少剂量、频率或可比较的单位时不填色。折算值不是已确认的实际给药量。阶段结束日期按包含当天显示；最后一段截至筛选范围末尾，不代表已经确认停药。起始阶段可能承接筛选范围之前的方案。手机上可横向滑动图表。

“导出 PDF”在浏览器本地生成五页英文图表，不上传导出内容，也不添加诊断或分析。咳嗽次数从备注中提取，范围保留为范围，未注明次数的记录仍计入发作次数，计数不完整的日期标为下限或问号；未记录的日期不等同于无症状。可展开“咳嗽原始记录”核对原文。

数据和剂量颜色检查：`node tests/insights.test.mjs` 和 `node tests/regimen-colors.test.mjs`。

## 数据设计

补剂（`supplement`）记录名称（存入 `medicine`）、开始或结束（`supplement_action` 为 `start` / `end`）、剂量和“每 X 天 X 次”频率；`occurred_at` 就是开始/结束时间。名称必填，备注可选；不计入用药次数或自动医疗时间轴。已有数据库在部署前运行最新 `supabase/add_supplement.sql`（之前执行过也需重跑），无需重跑其他旧迁移。旧补剂记录没有名称或频率时保留为空，显示“未记录名称”或“未记录”。

- `occurred_at`：事件实际发生时间（带时区）
- `type`：`inhaled`、`oral`、`behavior`、`brushing`、`elimination`
- `medicine`：行为记录时为空
- `dose_amount` + `dose_unit`：拆分存储，方便统计和校验；单位可选 `mcg`、`mg`、`g`、`mL`、`IU`、片、粒、滴或喷
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

`medications` 表保存每种药的当前状态和最新方案：

- 以“药物类型 + 规范化药名”区分不同药物
- `status`：`active`（使用中）、`finished`（已用完）或 `stopped`（已停药）
- `current_dose_amount`、`current_dose_unit`、`current_frequency`：该药最近一次记录的方案
- `started_on`、`last_recorded_at`：首次记录日期和最近用药时间

所有事件都从“记录”Tab 添加：疫苗和疾病保存后直接进入医疗时间轴；吸入药和口服药则由数据库自动判断。如果“类型 + 药名”从未出现，会写入一条“新增用药”并保存初始剂量和频率；之后只和同一种药自己的上一条记录比较，只有剂量、剂量单位或频率变化时才写入“用药变化”。不同口服药交替记录不会再被视为方案变化。

吸入药和口服药都可以从下拉菜单选择各自的历史药名，也可以选择“新增其他药物”后输入新药名。看板的最近记录会以“类型 · 药名”显示用药事件，例如“口服药 · Prednisolone”。看板上的口服药提醒只计算 `Prednisolone`（泼尼松龙），其他口服药不会计入提醒。医疗时间轴中的事件可以编辑；编辑后会标记为手动修改，后续历史回填不会覆盖。删除事件前会要求再次确认。

医疗页包含“当前用药”和“医疗时间轴”两个子页。“当前用药”可查看每种药的最新方案，并把状态更新为使用中、已用完或已停药。医疗时间轴每页显示 10 条，可用上一页/下一页浏览；月份下拉菜单可筛选单月，选择“全部月份”时会保留月份分割线。

### 为现有数据库加入 frequency

如果数据库是在加入 `frequency` 之前创建的，请先在 Supabase **SQL Editor** 中运行一次
`supabase/add_frequency.sql`，再部署新版网页。该脚本会为旧记录补上对应疗程阶段的频率。

### 为现有数据库加入刷牙和排泄

在部署包含刷牙、排泄和口服药提醒的版本前，请在 Supabase **SQL Editor** 中运行一次
`supabase/add_care_types.sql`。

### 为现有数据库加入医疗时间轴

部署包含“医疗”Tab 的版本前，请在 Supabase **SQL Editor** 中运行一次
`supabase/add_medical_history.sql`。升级到支持当前用药状态和按药名追踪方案的版本时也请重新运行整份脚本。该脚本可重复运行，会创建用药状态表、清理尚未手动编辑的错误自动事件，并按“类型 + 药名”补齐历史首次用药和真实方案变化；同时沿用现有两位照护者的共享访问权限。

### 为现有数据库加入更多剂量单位

部署包含更多剂量单位的版本前，请在 Supabase **SQL Editor** 中运行一次
`supabase/add_dose_units.sql`，否则数据库会拒绝使用 `mL` 等新单位的记录。

## 当前边界

- 离线时可以打开已缓存的界面，但新增记录仍需要网络连接到 Supabase。
- 当前只允许 schema 中列出的两位照护者登录，两人可以共同读取和维护小宝的全部记录。
- 本项目用于记录，不代替医生意见或正式病历。

图表依赖：Apache ECharts 6.0.0 已保存在 `vendor/echarts/`，附 LICENSE、NOTICE；运行时无需从外部 CDN 加载。
