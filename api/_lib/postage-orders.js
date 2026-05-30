const SENSITIVE_ITEM_TYPES = new Set([
  "奶粉",
  "电器",
  "香水 / 液体",
  "香水/液体",
  "带电池产品",
  "易碎品",
  "其他"
]);

const BLOCKED_BOX_TYPES = new Set([
  "2",
  "box2",
  "box-2",
  "2号箱",
  "2号箱子",
  "2号箱子 · 暂时没货"
]);

const STATUS_LABELS = {
  new: "新提交",
  contacted: "已联系",
  pending_pickup: "待取件",
  picked_up: "已取件",
  weighed_pending_quote: "已称重 / 待报价",
  pending_payment: "待付款",
  paid: "已付款",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消"
};

const BOX_DELIVERY_STATUS_LABELS = {
  not_required: "无需送箱",
  pending: "待送箱",
  arranged: "已安排送箱",
  delivered: "已送箱",
  issue: "送箱异常"
};

const PAYMENT_STATUS_LABELS = {
  unpaid: "未付款",
  pending_confirmation: "待确认",
  paid: "已付款",
  refunded: "已退款",
  not_required: "无需付款"
};

const ORDER_STATUSES = Object.keys(STATUS_LABELS);
const BOX_DELIVERY_STATUSES = Object.keys(BOX_DELIVERY_STATUS_LABELS);
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS);

const PUBLIC_IGNORED_FIELDS = new Set([
  "estimated_route",
  "estimated_weight",
  "estimated_box_count",
  "estimated_postage",
  "estimated_box_fee",
  "estimated_upstairs_fee",
  "estimated_total",
  "calculator_snapshot",
  "calculator_snapshot_json"
]);

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const next = text(value);
  return next || null;
}

function bool(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = numberOrNull(value);
  return number === null ? 0 : Number(number.toFixed(2));
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function dateOrNull(value) {
  const next = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function normalizeItems(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[,，、]/);
  return Array.from(new Set(raw.map(text).filter(Boolean)));
}

function isBlockedBoxType(value) {
  const normalized = text(value).replace(/\s+/g, "");
  return BLOCKED_BOX_TYPES.has(text(value)) || BLOCKED_BOX_TYPES.has(normalized);
}

function hasSensitiveItems(itemTypes, explicitFlag) {
  return bool(explicitFlag) || itemTypes.some(item => SENSITIVE_ITEM_TYPES.has(item));
}

function calculateFinalTotal(payload = {}) {
  const total = money(payload.final_postage)
    + money(payload.final_box_fee)
    + money(payload.final_packing_fee)
    + money(payload.box_delivery_fee)
    + money(payload.box_delivery_upstairs_fee)
    + money(payload.pickup_upstairs_fee)
    + money(payload.other_fee)
    - money(payload.discount);
  return Number(Math.max(total, 0).toFixed(2));
}

function assertAllowedValue(value, allowed, fieldName) {
  if (value === undefined) return undefined;
  const normalized = text(value);
  if (!normalized) return undefined;
  if (!allowed.includes(normalized)) {
    throw new Error(`${fieldName} 不正确`);
  }
  return normalized;
}

function mapPostageOrderSubmission(body = {}, siteUser = {}) {
  for (const key of PUBLIC_IGNORED_FIELDS) {
    delete body[key];
  }

  const customerName = text(body.customer_name || body.customerName || siteUser.nickname);
  const wechatId = nullableText(body.wechat_id || body.wechatId || siteUser.wechat_id);
  const phone = nullableText(body.phone || siteUser.phone);
  const email = nullableText(body.email || siteUser.email);
  const serviceType = text(body.service_type || body.serviceType);
  const boxCount = positiveInteger(body.box_count || body.boxCount);
  const singleBoxWeight = numberOrNull(body.single_box_weight || body.singleBoxWeight);
  const boxType = nullableText(body.box_type || body.boxType);
  const itemTypes = normalizeItems(body.item_types || body.itemTypes);
  const needBoxes = bool(body.need_boxes || body.needBoxes);
  const needPackingMaterials = bool(body.need_packing_materials || body.needPackingMaterials);
  const needBoxDelivery = bool(body.need_box_delivery || body.needBoxDelivery || needBoxes || needPackingMaterials);

  if (!customerName) throw new Error("请填写姓名。");
  if (!wechatId && !phone) throw new Error("请至少填写微信号或手机号。");
  if (!serviceType) throw new Error("请选择服务类型。");
  if (boxCount < 1) throw new Error("预计箱数必须大于等于 1。");
  if (singleBoxWeight !== null && singleBoxWeight <= 0) throw new Error("预计单箱重量必须大于 0。");
  if (boxType && isBlockedBoxType(boxType)) throw new Error("2号箱子暂时没货，不能选择。");
  if (!bool(body.risk_confirmed || body.riskConfirmed)) throw new Error("请先勾选风险确认。");

  const sensitive = hasSensitiveItems(itemTypes, body.has_sensitive_items || body.hasSensitiveItems);
  const boxDeliveryStatus = needBoxDelivery ? "pending" : "not_required";

  return {
    user_id: siteUser.id,
    member_id: siteUser.id,
    status: "new",
    box_delivery_status: boxDeliveryStatus,
    payment_status: "unpaid",
    source_page: "postage_submit",
    customer_name: customerName,
    wechat_id: wechatId,
    phone,
    email,
    service_type: serviceType,
    preferred_route: nullableText(body.preferred_route || body.preferredRoute),
    box_count: boxCount,
    single_box_weight: singleBoxWeight,
    different_box_weights: bool(body.different_box_weights || body.differentBoxWeights),
    need_boxes: needBoxes,
    box_type: boxType,
    need_packing_materials: needPackingMaterials,
    packing_materials: nullableText(body.packing_materials || body.packingMaterials),
    item_types: itemTypes,
    has_sensitive_items: sensitive,
    user_note: nullableText(body.user_note || body.userNote),
    need_box_delivery: needBoxDelivery,
    box_delivery_same_as_pickup: body.box_delivery_same_as_pickup === undefined ? true : bool(body.box_delivery_same_as_pickup),
    box_delivery_address: nullableText(body.box_delivery_address || body.boxDeliveryAddress),
    box_delivery_postcode: nullableText(body.box_delivery_postcode || body.boxDeliveryPostcode),
    box_delivery_building: nullableText(body.box_delivery_building || body.boxDeliveryBuilding),
    box_delivery_room: nullableText(body.box_delivery_room || body.boxDeliveryRoom),
    box_delivery_need_upstairs: bool(body.box_delivery_need_upstairs || body.boxDeliveryNeedUpstairs),
    box_delivery_has_lift: body.box_delivery_has_lift === undefined ? null : bool(body.box_delivery_has_lift),
    preferred_box_delivery_date: dateOrNull(body.preferred_box_delivery_date || body.preferredBoxDeliveryDate),
    preferred_box_delivery_time_slot: nullableText(body.preferred_box_delivery_time_slot || body.preferredBoxDeliveryTimeSlot),
    box_delivery_note: nullableText(body.box_delivery_note || body.boxDeliveryNote),
    need_pickup: body.need_pickup === undefined ? true : bool(body.need_pickup),
    pickup_address: nullableText(body.pickup_address || body.pickupAddress),
    pickup_postcode: nullableText(body.pickup_postcode || body.pickupPostcode),
    pickup_building: nullableText(body.pickup_building || body.pickupBuilding),
    pickup_room: nullableText(body.pickup_room || body.pickupRoom),
    pickup_need_upstairs: bool(body.pickup_need_upstairs || body.pickupNeedUpstairs),
    pickup_has_lift: body.pickup_has_lift === undefined ? null : bool(body.pickup_has_lift),
    preferred_pickup_date: dateOrNull(body.preferred_pickup_date || body.preferredPickupDate),
    preferred_pickup_time_slot: nullableText(body.preferred_pickup_time_slot || body.preferredPickupTimeSlot),
    pickup_note: nullableText(body.pickup_note || body.pickupNote),
    recipient_country: nullableText(body.recipient_country || body.recipientCountry),
    recipient_city: nullableText(body.recipient_city || body.recipientCity),
    recipient_name: nullableText(body.recipient_name || body.recipientName),
    recipient_phone: nullableText(body.recipient_phone || body.recipientPhone),
    recipient_address: nullableText(body.recipient_address || body.recipientAddress),
    risk_confirmed: true
  };
}

function mapPostageOrderPatch(body = {}) {
  const patch = {};
  const fields = [
    "assigned_to", "customer_name", "wechat_id", "phone", "email", "service_type", "preferred_route",
    "box_type", "packing_materials", "user_note", "box_delivery_address", "box_delivery_postcode",
    "box_delivery_building", "box_delivery_room", "preferred_box_delivery_time_slot", "box_delivery_note",
    "pickup_address", "pickup_postcode", "pickup_building", "pickup_room", "preferred_pickup_time_slot",
    "pickup_note", "recipient_country", "recipient_city", "recipient_name", "recipient_phone",
    "recipient_address", "actual_weight_note", "weighing_note", "final_route", "fee_note",
    "payment_method", "payment_note", "carrier", "tracking_number", "tracking_url", "logistics_note",
    "internal_note"
  ];
  fields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = nullableText(body[field]);
  });

  ["status", "box_delivery_status", "payment_status"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const allowed = field === "status" ? ORDER_STATUSES : field === "box_delivery_status" ? BOX_DELIVERY_STATUSES : PAYMENT_STATUSES;
      patch[field] = assertAllowedValue(body[field], allowed, field);
    }
  });

  ["box_count", "actual_box_count"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = positiveInteger(body[field]);
  });
  if (patch.box_count !== undefined && patch.box_count < 1) throw new Error("预计箱数必须大于等于 1。");

  if (Object.prototype.hasOwnProperty.call(body, "single_box_weight")) {
    patch.single_box_weight = numberOrNull(body.single_box_weight);
    if (patch.single_box_weight !== null && patch.single_box_weight <= 0) throw new Error("预计单箱重量必须大于 0。");
  }

  if (Object.prototype.hasOwnProperty.call(body, "box_type") && isBlockedBoxType(body.box_type)) {
    throw new Error("2号箱子暂时没货，不能选择。");
  }

  [
    "different_box_weights", "need_boxes", "need_packing_materials", "has_sensitive_items",
    "need_box_delivery", "box_delivery_same_as_pickup", "box_delivery_need_upstairs",
    "box_delivery_has_lift", "need_pickup", "pickup_need_upstairs", "pickup_has_lift"
  ].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = bool(body[field]);
  });

  ["preferred_box_delivery_date", "preferred_pickup_date", "shipped_at"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = dateOrNull(body[field]);
  });
  if (Object.prototype.hasOwnProperty.call(body, "paid_at")) {
    patch.paid_at = nullableText(body.paid_at);
  }

  if (Object.prototype.hasOwnProperty.call(body, "item_types")) {
    patch.item_types = normalizeItems(body.item_types);
    if (!Object.prototype.hasOwnProperty.call(body, "has_sensitive_items")) {
      patch.has_sensitive_items = hasSensitiveItems(patch.item_types, false);
    }
  }

  [
    "final_postage", "final_box_fee", "final_packing_fee", "box_delivery_fee",
    "box_delivery_upstairs_fee", "pickup_upstairs_fee", "other_fee", "discount"
  ].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = money(body[field]);
  });

  const feeKeys = [
    "final_postage", "final_box_fee", "final_packing_fee", "box_delivery_fee",
    "box_delivery_upstairs_fee", "pickup_upstairs_fee", "other_fee", "discount"
  ];
  if (feeKeys.some(field => Object.prototype.hasOwnProperty.call(patch, field))) {
    patch.final_total = calculateFinalTotal({ ...body, ...patch });
  }
  if (Object.prototype.hasOwnProperty.call(body, "final_total")) {
    patch.final_total = money(body.final_total);
  }

  if (patch.status === "completed") patch.completed_at = new Date().toISOString();
  if (patch.status === "cancelled") patch.cancelled_at = new Date().toISOString();

  return patch;
}

async function allocatePostageOrderNumber(supabase) {
  const { data, error } = await supabase.rpc("allocate_postage_order_no");
  if (error) throw error;
  const payload = Array.isArray(data) ? data[0] : data;
  const normalized = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!normalized?.order_no) throw new Error("Failed to allocate postage order number");
  return {
    orderNo: normalized.order_no,
    businessDate: normalized.business_date,
    sequence: normalized.sequence_no || null
  };
}

function formatPostageOrder(order = {}) {
  return {
    ...order,
    status_label: STATUS_LABELS[order.status] || order.status || "",
    box_delivery_status_label: BOX_DELIVERY_STATUS_LABELS[order.box_delivery_status] || order.box_delivery_status || "",
    payment_status_label: PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status || "",
    final_total: order.final_total === null || order.final_total === undefined ? calculateFinalTotal(order) : order.final_total
  };
}

function buildPostageSummary(order = {}) {
  const itemTypes = Array.isArray(order.item_types) ? order.item_types.join("、") : "";
  const lines = [
    "【邮寄需求】",
    `订单编号：${order.order_no || ""}`,
    `姓名：${order.customer_name || ""}`,
    `微信：${order.wechat_id || ""}`,
    `电话：${order.phone || ""}`,
    `服务类型：${order.service_type || ""}`,
    `预期路线：${order.preferred_route || ""}`,
    `箱数：${order.box_count || ""}`,
    `预计单箱重量：${order.single_box_weight || ""}`,
    `是否需要纸箱：${order.need_boxes ? "是" : "否"}`,
    `纸箱型号：${order.box_type || ""}`,
    `是否需要送箱：${order.need_box_delivery ? "是" : "否"}`,
    `送箱地址：${[order.box_delivery_building, order.box_delivery_room, order.box_delivery_address, order.box_delivery_postcode].filter(Boolean).join(" / ")}`,
    `期望送箱时间：${[order.preferred_box_delivery_date, order.preferred_box_delivery_time_slot].filter(Boolean).join(" ")}`,
    `送箱状态：${BOX_DELIVERY_STATUS_LABELS[order.box_delivery_status] || ""}`,
    `是否需要取件：${order.need_pickup ? "是" : "否"}`,
    `取件地址：${[order.pickup_building, order.pickup_room, order.pickup_address, order.pickup_postcode].filter(Boolean).join(" / ")}`,
    `期望取件时间：${[order.preferred_pickup_date, order.preferred_pickup_time_slot].filter(Boolean).join(" ")}`,
    `收件国家/地区：${order.recipient_country || ""}`,
    `收件城市：${order.recipient_city || ""}`,
    `收件人：${order.recipient_name || ""}`,
    `收件电话：${order.recipient_phone || ""}`,
    `物品类型：${itemTypes}`,
    `敏感物品：${order.has_sensitive_items ? "是" : "否"}`,
    `当前状态：${STATUS_LABELS[order.status] || ""}`,
    `付款状态：${PAYMENT_STATUS_LABELS[order.payment_status] || ""}`,
    `最终金额：${order.final_total ?? ""}`,
    `备注：${order.user_note || order.internal_note || ""}`
  ];
  if (order.carrier || order.tracking_number || order.tracking_url) {
    lines.push("", `承运商：${order.carrier || ""}`, `物流单号：${order.tracking_number || ""}`, `查询链接：${order.tracking_url || ""}`);
  }
  return lines.join("\n");
}

module.exports = {
  ORDER_STATUSES,
  BOX_DELIVERY_STATUSES,
  PAYMENT_STATUSES,
  STATUS_LABELS,
  BOX_DELIVERY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  calculateFinalTotal,
  mapPostageOrderSubmission,
  mapPostageOrderPatch,
  allocatePostageOrderNumber,
  formatPostageOrder,
  buildPostageSummary,
  isBlockedBoxType
};
