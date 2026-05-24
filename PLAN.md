# P4b PLAN.md：现有批量补录功能审计与修复计划

## Summary

P4b 只审计并计划修复 `/admin/transport/requests` 已有的“批量补录”弹窗、模板、上传、预览和导入逻辑。目标是在现有入口基础上完成客服线下订单批量补录，不新建第二套入口，不做拼车组管理，不自动创建 group，不自动加入 group，不改 `transport_groups` / `transport_group_members` 结构，不触碰 `adjust_flight_time` / `transfer_existing_group`，不改数据库结构，不做 production deploy。

本轮已读取：

- `E:\webside\AGENTS.md`
- `E:\webside\docs\current-status.md`

本计划基于已审计文件：

- `apps/admin-vue/src/views/TransportRequestsView.vue`
- `apps/admin-vue/src/api/admin-api.js`
- `shared/transport-manual-import-columns.json`
- `api/transport-manual-import/preview.js`
- `api/transport-manual-import/commit.js`
- `api/_lib/transport-manual-import.js`
- `public-api-handlers/transport-board.js`
- `public-api-handlers/transport-groups.js`
- `api/_lib/transport-group-lifecycle.js`
- `api/_lib/transport.js`
- `api/transport-requests/export.js`

## 当前已有实现审计结果

### 入口与弹窗位置

- “批量补录”按钮在 `apps/admin-vue/src/views/TransportRequestsView.vue`，通过 `openBatchDialog` 打开已有弹窗。
- 批量补录弹窗也在 `TransportRequestsView.vue`，使用 `ConfirmDialog`，标题为“批量补录接送机订单”，确认按钮为“导入可导入行”。
- 前端 API client 在 `apps/admin-vue/src/api/admin-api.js`：
  - `previewTransportManualImport(rows)` 调用 `/api/transport-manual-import/preview`
  - `commitTransportManualImport(rows, confirmedWarnings)` 调用 `/api/transport-manual-import/commit`

### 当前支持的导入方式

- 已支持粘贴 Excel / Google Sheet 内容。
- 已支持复制模板表头。
- 已支持下载 CSV 模板。
- 已支持下载 Excel `.xlsx` 模板。
- 已支持上传 CSV。
- 已支持上传 XLSX。
- 已支持预览粘贴内容。
- 已支持“导入可导入行”。
- 当前不支持 `.xls`，前端会提示上传 `.xlsx` 或 `.csv`。

### 当前模板字段

模板字段来自 `shared/transport-manual-import-columns.json`，当前包含：

- 学生姓名
- 手机号
- 微信号
- 服务类型
- 机场
- 航站楼
- 航班号
- 航班日期时间
- 服务日期时间
- 地址
- 人数
- 行李数量
- 价格
- 付款状态
- Group ID
- 备注

### 当前字段映射到 transport_requests

- `student_name` -> `transport_requests.student_name`
- `phone` -> `transport_requests.phone`
- `wechat` -> `transport_requests.wechat`
- `service_type` -> `transport_requests.service_type`
- `airport_code` / airport aliases -> `transport_requests.airport_code`
- `terminal` -> `transport_requests.terminal`
- `flight_no` -> `transport_requests.flight_no`
- `flight_datetime` -> `transport_requests.flight_datetime`
- `service_time` -> `transport_requests.preferred_time_start`
- pickup `address` -> `transport_requests.location_to`
- dropoff `address` -> `transport_requests.location_from`
- `passenger_count` -> `transport_requests.passenger_count`
- `luggage_count` / text luggage -> `transport_requests.luggage_count` and/or `transport_requests.luggage_note`
- 当前 `price` -> `manual_price_gbp`，尚未统一到 P3/P4a 工作台字段 `deposit_amount_gbp`
- 当前 `payment_status` -> `manual_payment_status`，尚未统一到 `payment_collection_status`
- 当前 `notes` 会进入 `notes` / `admin_note` 组合逻辑，文案尚未统一为“客服备注”
- 当前 `offline_recorded` 已在 request payload 中默认 true
- 当前 `shareable` 解析默认值是 true，不符合 P4a/P4b “拼车默认否”
- 当前批量 commit 的 `source` 是 `sheet_import`，尚未统一为 `admin_manual`
- 当前 `group_id` 会触发加入已有 group；不填时会触发新建 group

### Preview API

- `api/transport-manual-import/preview.js`
- 仅允许 admin POST。
- 调用 `api/_lib/transport-manual-import.js` 的 `previewRows(supabase, rows)`。
- 当前 preview 会：
  - normalize 行数据；
  - 校验必填字段；
  - 检查批次内重复和数据库疑似重复；
  - 如果有 `group_id`，校验目标 group；
  - 如果没有 `group_id`，查询 candidate groups；
  - 返回 `errors`、`warnings`、`target_group`、`candidate_groups`、`can_import`。

### Commit / 导入 API

- `api/transport-manual-import/commit.js`
- 仅允许 admin POST。
- 调用 `api/_lib/transport-manual-import.js` 的 `commitRows(supabase, adminUser, rows, options)`。
- 当前 commit 会重新 preview，并对每行执行：
  - 红色错误行拒绝导入；
  - 黄色警告未确认行拒绝导入；
  - 可导入行调用 `createRequestFromPreview`。

### 当前是否会创建 group / member / 调用拼车生命周期

当前批量导入会触碰拼车核心逻辑，必须在 P4b 修复：

- 无 `Group ID` 时，`createRequestFromPreview` 调用 `createGroupForRequest`，会创建 `transport_groups` 和 `transport_group_members`。
- 有 `Group ID` 时，`createRequestFromPreview` 调用 `addRequestToGroup`，会写入 `transport_group_members`。
- `createGroupForRequest` / `addRequestToGroup` 属于拼车生命周期路径，会同步 group 状态和成员关系。
- 这与 P4b “批量补录 request-only，只创建 transport_requests” 冲突。

### 当前是否会出现在 public board / public groups

- P4a 后，`public-api-handlers/transport-board.js` 已使用 `source is null OR source != admin_manual` 排除明确 `source = admin_manual` 的补录订单。
- `api/_lib/transport-group-lifecycle.js` 的 public board pickup backfill 也已用同样逻辑排除 `admin_manual`，不会误伤 `source = null` 的历史正常订单。
- `public-api-handlers/transport-groups.js` 读取 `transport_groups_public_view`；如果 P4b 仍创建 group，则有进入 public groups 的风险。
- 当前批量导入 source 是 `sheet_import`，且会建组/入组，因此不能仅依赖 P4a 的 `admin_manual` 保护。P4b 必须把批量补录改为 `source = admin_manual` 且 request-only。

### 后台搜索、筛选、导出兼容性

- 关键词搜索已覆盖：订单号、姓名、电话、微信、航班号。
- 筛选已覆盖：服务类型、机场、服务日期、联系状态、收款状态、线下记录状态、订单来源、导入批次。
- 当前筛选导出和选中订单导出已共用 P3/P3.1 的列表/export 逻辑。
- 因此 P4b 关键是确保批量补录订单写入这些字段：
  - `source = admin_manual`
  - `import_batch_id = TMI-*`
  - `contact_status`
  - `payment_collection_status`
  - `deposit_amount_gbp`
  - `admin_note`
  - `offline_recorded = true`
  - `preferred_time_start`
  - `flight_datetime`
  - 订单号由现有 `createRequestRecord` 生成

### 错误行、部分成功和格式兼容

- 当前预览表可显示每行原始行号、状态、错误/警告原因，并支持警告确认。
- 当前部分成功/部分失败逻辑：错误行和未确认警告行被拒绝，其余可导入行会继续导入；不是整批事务回滚。
- 当前日期解析兼容：
  - 常见中文/英文表头别名；
  - `YYYY/MM/DD HH:mm` 等文本时间；
  - Excel 自动日期序列号；
  - Date 对象和部分 XLSX cell 对象。
- 当前手机号仅做文本清理，不做强格式限制，因此英国手机号和带 `+44` 手机号应可保留；P4b 测试需覆盖。
- 当前 CSV 解析通过简单分隔符 split，虽然模板下载会处理 CSV 引号，但上传 CSV 解析对带逗号字段有风险，需要在计划修复中收口或明确测试限制。
- 当前 CSV/粘贴和 XLSX 都会经过同一套表头规范化和后端 normalize，但前端 CSV split 与 XLSX 读取在日期/逗号字段上存在一致性风险。

## 可以复用的部分

- 复用现有 `/admin/transport/requests` 右上角“批量补录”入口。
- 复用现有批量补录弹窗和 ConfirmDialog 交互。
- 复用粘贴、CSV 下载、Excel 下载、CSV/XLSX 上传、预览、导入按钮。
- 复用已有 admin API 路由：
  - `/api/transport-manual-import/preview`
  - `/api/transport-manual-import/commit`
- 复用 `normalizeRow`、日期解析、机场/服务类型标准化、必填校验、重复提示、警告确认机制。
- 复用 P3 后台列表、搜索、筛选、导出逻辑。
- 复用 P4a 已完成的 public board 保护原则：只排除明确 `source = admin_manual`，保留 `source = null` 或非 admin_manual 的正常历史订单。

## 需要统一或调整的字段

- “付款状态”统一为“收款状态”，字段使用 `payment_collection_status`。
- “价格”统一为“定金 GBP”，字段使用 `deposit_amount_gbp`。
- “备注”统一为“客服备注”，字段使用 `admin_note`。
- 增加或保留“联系状态”，字段使用 `contact_status`，默认 `uncontacted`。
- 批量补录 source 统一为 `admin_manual`。
- 批量补录 `offline_recorded` 默认 true。
- 拼车默认否：`shareable` 默认 false。
- 可保留 `shareable` 作为普通订单字段，但即使传 true 也不能创建 group、加入 group 或触发拼车匹配。
- `Group ID`、candidate group、target group summary 不再作为 P4b 批量补录能力展示或提交。
- 为兼容旧表，后端可继续识别旧别名 `price`、`payment_status`、`notes`，但新模板和 UI 文案必须使用 P4a/P3 工作台口径。

## 是否需要修改 Preview API

需要修改，但不新增 API。

计划：

- 保留 `POST /api/transport-manual-import/preview`。
- Preview 改为 P4b request-only 预览：
  - 继续 normalize、必填校验、重复检查、警告确认；
  - 不再查询 candidate groups；
  - 不再校验 existing group；
  - 如果请求行包含 `group_id`，返回清晰错误或忽略并给出警告；推荐返回错误，避免客服误以为已入组；
  - 返回结构保持前端可用，但 `target_group` 和 `candidate_groups` 应为空。
- 保持预览和 commit 共用同一套 normalize 逻辑，避免预览通过但导入字段不同。

## 是否需要修改 Commit API

需要修改，但不新增 API。

计划：

- 保留 `POST /api/transport-manual-import/commit`。
- 新增或改造批量 request-only 创建路径：
  - 只调用 `createRequestRecord` 创建 `transport_requests`；
  - 不调用 `createGroupForRequest`；
  - 不调用 `addRequestToGroup`；
  - 不写 `transport_group_members`；
  - 不修改 `transport_groups`；
  - 不触发 public board backfill；
  - 不触碰 `adjust_flight_time` / `transfer_existing_group`。
- 写入：
  - `source = admin_manual`
  - `import_batch_id = TMI-*`
  - `created_by_admin_id`
  - `created_by_admin_name`
  - `raw_import_payload`
  - `last_operated_by`
  - `last_operated_at`
  - `contact_status`
  - `payment_collection_status`
  - `deposit_amount_gbp`
  - `admin_note`
  - `offline_recorded = true`
  - `shareable = false` 默认
- 保留部分成功/部分失败策略，导入结果继续返回 `imported_count`、`rejected_count`、`items`、`rejected`。

## 是否需要修改模板下载

需要修改。

计划：

- 更新 `shared/transport-manual-import-columns.json` 作为 CSV、Excel、粘贴示例的单一模板来源。
- 移除新模板中的 `Group ID`。
- 新模板字段建议：
  - 学生姓名
  - 手机号
  - 微信号
  - 服务类型
  - 机场
  - 航站楼
  - 航班号
  - 航班日期时间
  - 服务日期时间
  - 地址
  - 人数
  - 行李数量
  - 联系状态
  - 收款状态
  - 定金 GBP
  - 是否愿意拼车
  - 客服备注
- 默认示例中“是否愿意拼车”为“否”。
- 表头 alias 保留旧字段：
  - `price` / 价格 / 费用 -> `deposit_amount_gbp`
  - `payment_status` / 付款状态 / 支付状态 -> `payment_collection_status`
  - `notes` / 备注 -> `admin_note`
- 旧模板中含 `Group ID` 时，P4b 后端应拒绝或警告，不进行入组。

## 如何保证 request-only

- 前端：
  - 批量弹窗预览表不再显示 Group ID 输入框、candidate group 按钮、target group summary。
  - 前端不再向批量 preview/commit 主动提交 `Group ID`。
- 后端：
  - `previewRows` 对 batch manual import 使用 request-only 规则，不调用 `findCandidateGroups` 或 `validateExistingGroup`。
  - `commitRows` 调用新的 request-only 创建函数，而不是当前会建组/入组的 `createRequestFromPreview`。
  - 如果仍收到 `group_id`，返回清楚错误，例如 `group_disabled_for_batch_manual_import`。
- 验证：
  - 记录导入前后 `transport_groups` 和 `transport_group_members` count；
  - 导入 P4B-* 测试行后确认 count 不变；
  - 确认新订单只有 `transport_requests` 记录。

## 如何保证不进入 public board / public groups

- 批量补录订单写入 `source = admin_manual`。
- 批量补录 request-only，不创建 public group，也不写 group member。
- 继续沿用 P4a public board 保护：
  - public board 查询使用 `source is null OR source != admin_manual`；
  - pickup backfill 也使用 `source is null OR source != admin_manual`；
  - 不使用简单 `.neq("source", "admin_manual")`，避免误伤 `source = null` 历史正常订单。
- 验证：
  - P4B-* `admin_manual` 补录订单不出现在 public board；
  - P4B-* 不产生 public groups；
  - `source = null` 的历史正常订单逻辑不被代码层误伤；
  - `source = public_form` 或其他非 admin_manual 正常订单仍可进入 public board / public groups。

## 数据库变更

- 预计不需要数据库结构变更。
- 如果目标环境缺少 P3/P4a 已使用字段，如 `contact_status`、`payment_collection_status`、`deposit_amount_gbp`、`admin_note`、`offline_recorded`、`import_batch_id`、`source`，应停止实现并提示需要先应用既有迁移；本轮不设计新 schema。

## 测试方案

### 静态 / 构建

- `node --check api/transport-manual-import/preview.js`
- `node --check api/transport-manual-import/commit.js`
- `node --check api/_lib/transport-manual-import.js`
- `node --check public-api-handlers/transport-board.js`
- `node --check api/_lib/transport-group-lifecycle.js`
- `node --check api/transport-requests/export.js`
- `npm run build:admin-vue`

### UI 验证

- 打开 `/admin/transport/requests`。
- 确认仍复用现有“批量补录”按钮和弹窗，没有新增第二入口。
- 确认弹窗支持：
  - 粘贴 Excel / Google Sheet 内容；
  - 下载 CSV 模板；
  - 下载 Excel 模板；
  - 上传 CSV；
  - 上传 XLSX；
  - 预览粘贴内容；
  - 导入可导入行。
- 确认模板和预览表文案统一为：
  - 联系状态；
  - 收款状态；
  - 定金 GBP；
  - 客服备注；
  - 是否愿意拼车默认否。
- 确认 Group ID、校验/选择 group、candidate group、group summary 不显示。
- 确认错误行展示第几行、哪个字段或错误原因。
- 确认黄色警告行需要确认后才能导入。
- 确认部分成功/部分失败时弹窗或页面提示清楚，并能看到 import batch。

### API / 数据验证

- 使用粘贴、CSV 上传、XLSX 上传分别创建 P4B-* 临时批量订单。
- 覆盖 pickup 和 dropoff。
- 覆盖中文日期、Excel 自动日期格式、英国手机号、带 `+44` 的手机号。
- 覆盖旧字段别名：
  - `price`
  - `payment_status`
  - `notes`
- 覆盖新字段：
  - `contact_status`
  - `payment_collection_status`
  - `deposit_amount_gbp`
  - `admin_note`
- 确认 `transport_requests` 有记录：
  - `source = admin_manual`
  - `import_batch_id = TMI-*`
  - `offline_recorded = true`
  - 默认 `shareable = false`
  - P3 工作台字段写入正确
- 确认 `transport_groups` 没新增。
- 确认 `transport_group_members` 没新增。
- 即使输入 `shareable = true`，也不创建 group、不加入 group。
- 如果上传或粘贴包含 `Group ID`，确认不会入组；按最终实现策略验证清晰错误或警告。

### 后台兼容验证

- 新订单出现在 `/admin/transport/requests`。
- 关键词搜索可命中：
  - 订单号；
  - 姓名；
  - 电话；
  - 微信；
  - 航班号。
- 筛选可命中：
  - 服务类型；
  - 机场；
  - 服务日期；
  - 联系状态；
  - 收款状态；
  - 线下记录状态；
  - 订单来源；
  - 导入批次。
- 导出当前筛选结果包含批量补录订单。
- 导出选中订单包含批量补录订单，且不被当前 filters 二次限制。

### Public 保护验证

- `/api/public/transport-board` 不返回 P4B-* `admin_manual` 批量补录订单。
- `/api/public/transport-groups` 不返回 P4B-* 批量补录产生的 group，因为 P4b 不应产生 group。
- 验证 `source = null` 或正常 `public_form` 历史订单不被 `admin_manual` 排除逻辑误伤。

### 清理

- 测试后清理全部 P4B-* 临时 `transport_requests`。
- 如果发现意外 group/member，清理并定位原因；P4b 实现不能接受意外 group/member 残留。

## 风险点

- 当前批量 commit 会建组或入组，这是 P4b 的最大行为风险，必须改成 request-only。
- 当前批量 source 是 `sheet_import`；如果不改为 `admin_manual`，P4a public board 保护不会覆盖批量补录订单。
- 当前 `shareable` 默认 true；如果不改为 false，可能造成 public board 或拼车语义误解。
- 模板字段改名可能影响客服手里的旧 Excel；需要保留旧别名兼容，但 UI 和新模板必须统一 P4a/P3 文案。
- CSV 上传当前是简单 split，带逗号或引号的字段可能解析不一致；P4b 实现时需修复或明确限制并验证。
- Preview 和 commit 必须共用同一套 request-only normalize/validate 逻辑，否则会出现预览通过但导入结果不一致。
- 部分成功不是事务回滚模式；如果中途失败，需要清楚返回每行结果，避免客服误以为整批失败或整批成功。
- Public 保护不能使用简单 `.neq("source", "admin_manual")`，否则可能排除 `source = null` 的历史正常订单。
- P4b 不应修改数据库结构；如果环境缺字段，应暂停并说明依赖的既有迁移。
