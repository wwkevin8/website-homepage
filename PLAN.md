# P3 接机工作台筛选、批量操作和表格体验优化计划

## Summary

本轮只做 P3，范围限定在 `/admin/transport/requests` 的客服筛选、批量操作和表格体验。不改补录订单逻辑，不碰 `adjust_flight_time`、`transfer_existing_group`、拼车核心逻辑、`transport_groups` / `transport_group_members`，不做 production deploy。

本轮已读取：

- `E:\webside\AGENTS.md`
- `E:\webside\docs\current-status.md`

## 改动文件

- `apps/admin-vue/src/components/TransportRequestFilters.vue`
  - 将“订单号”升级为“关键词”，使用 `search` 参数。
  - 新增“联系状态”“收款状态”筛选。
  - 将 `offline_recorded` 文案统一为“线下记录状态”。
  - 筛选区整理为三行：核心筛选、客服状态筛选、排序/分页/动作。
- `apps/admin-vue/src/views/TransportRequestsView.vue`
  - 接入 `search`、`contact_status`、`payment_collection_status`。
  - 筛选、分页、每页数量、关键词变化后清空已选订单。
  - 批量标记/取消线下记录增加二次确认，成功后刷新列表。
  - 优化保存失败提示，明确草稿保留。
- `apps/admin-vue/src/components/AdminBulkActionBar.vue`
  - 批量栏继续保持在表格上方。
  - 无选中订单时禁用批量标记、批量取消、导出选中订单。
  - 优化已选数量文案。
- `apps/admin-vue/src/styles.css`
  - 限定优化筛选区三行布局、批量栏、横向滚动和操作栏紧凑样式。
- `api/_lib/transport.js`
  - 补齐列表/导出共用筛选：`search`、`contact_status`、`payment_collection_status`。
  - 服务日期筛选统一为优先 `preferred_time_start`，缺失时回退 `flight_datetime`。
- `api/transport-requests/export.js`
  - 确保导出查询选择字段包含 `preferred_time_start`，并继续复用同一套筛选逻辑。
- `docs/current-status.md`
  - 完成后更新本轮状态。

## 验收约束

- 服务日期筛选必须与表格“服务日期”展示口径一致：优先 `preferred_time_start`，缺失时回退 `flight_datetime`。
- 列表和 export 必须共用 `applyRequestFilters`，避免页面筛选结果和导出结果不一致。
- “导出当前筛选结果”只按当前 filters 导出。
- “导出选中订单”只按 `ids` 导出，不被当前 filters 二次限制。
- 上次操作人筛选不硬编码人员名单，沿用现有 `operator_options` 数据来源。

## 测试方案

- `node --check api/_lib/transport.js`
- `node --check api/transport-requests/index.js`
- `node --check api/transport-requests/export.js`
- `npm run build:admin-vue`
- API 验证列表筛选：关键词、联系状态、收款状态、线下记录状态、机场、服务日期、订单状态。
- API 验证导出：当前筛选导出和 `ids` 选中导出。
- UI 验证：三行筛选布局、无选中批量按钮禁用、有选中后可用、二次确认、刷新列表、清空选择、横向滚动、保存失败草稿保留。

## 风险点

- 服务日期筛选口径统一会改变部分边界记录的命中结果，需要重点验证 `preferred_time_start` 优先和 `flight_datetime` 回退。
- `api/_lib/transport.js` 是列表和导出共用筛选逻辑，改动必须限制在筛选分支。
- 关键词模糊查询需要处理逗号和括号等字符，避免 Supabase `.or()` 查询异常。
