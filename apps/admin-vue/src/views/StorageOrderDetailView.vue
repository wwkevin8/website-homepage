<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { deleteStorageOrder, exportStorageOrders, fetchStorageOrder, fetchStorageOrders, updateStorageOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const router = useRouter();
const order = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const savingSchedule = ref(false);
const savingAddress = ref(false);
const exporting = ref(false);
const deleting = ref(false);
const savingStatus = ref(false);
const deleteDialogOpen = ref(false);
const statusDialogOpen = ref(false);
const statusDraft = ref("");
const relatedBoxOrder = ref(null);

const scheduleForm = reactive({
  service_time_slot: "",
  box_delivery_date: "",
  box_delivery_time_slot: "",
  storage_start_date: "",
  storage_end_date: ""
});

const addressForm = reactive({
  room_or_building: "",
  address_full: "",
  postcode: "",
  has_lift: "",
  needs_upstairs: ""
});

const orderId = computed(() => String(route.params.id || "").trim());

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return text !== "" && text !== "-" && text !== "--" && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined";
}

function firstValue(...values) {
  return values.find(isMeaningfulValue);
}

function displayValue(value) {
  return isMeaningfulValue(value) ? String(value) : "未填写";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

function formatDate(value) {
  const text = String(firstValue(value) || "").slice(0, 10);
  if (!text) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${text}T00:00:00`));
  } catch (err) {
    return text;
  }
}

function formatDateTime(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch (err) {
    return displayValue(value);
  }
}

function inputDate(value) {
  return String(firstValue(value) || "").slice(0, 10);
}

function boolLabel(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "是";
  if (value === false || value === "false" || value === 0 || value === "0") return "否";
  return "未填写";
}

function boolFormValue(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "true";
  if (value === false || value === "false" || value === 0 || value === "0") return "false";
  return "";
}

function formatMoney(value) {
  if (!isMeaningfulValue(value)) return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
}

function moneyAmount(...values) {
  const value = firstValue(...values);
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatFormulaMoney(value) {
  const amount = Number(value);
  return `£${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

const customerForm = computed(() => parseJson(order.value?.customer_form_json) || {});
const serviceFlags = computed(() => parseJson(order.value?.service_flags_json) || {});
const serviceDetails = computed(() => {
  const details = customerForm.value?.serviceDetails
    || customerForm.value?.service_details
    || serviceFlags.value?.serviceDetails
    || serviceFlags.value?.service_details
    || {};
  return details && typeof details === "object" ? details : {};
});
const userSnapshot = computed(() => {
  const snapshot = customerForm.value?.userSnapshot || customerForm.value?.user_snapshot || {};
  return snapshot && typeof snapshot === "object" ? snapshot : {};
});
const estimateSummary = computed(() => {
  const direct = parseJson(order.value?.estimate_summary_json || order.value?.pricing_summary_json || order.value?.price_breakdown_json);
  return direct || serviceFlags.value?.estimate || serviceFlags.value?.pricing || {};
});
const calculatorSnapshot = computed(() => parseJson(order.value?.calculator_snapshot_json) || {});
const purchaseItems = computed(() => {
  const direct = parseJson(order.value?.purchased_boxes);
  if (Array.isArray(direct) && direct.length) return direct;
  const items = Array.isArray(estimateSummary.value?.items) ? estimateSummary.value.items : [];
  return items.filter((item) => Number(item?.purchaseQty ?? item?.purchase_quantity ?? item?.quantity ?? 0) > 0);
});

const estimateItems = computed(() => {
  const items = Array.isArray(estimateSummary.value?.items) ? estimateSummary.value.items : [];
  return items.filter((item) => item && typeof item === "object");
});

function summaryLine(label) {
  const source = String(order.value?.final_readable_message || "");
  if (!source || !label) return undefined;
  const normalizedLabel = String(label).replace(/\s+/g, "");
  const line = source
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => {
      const normalized = item.replace(/\s+/g, "");
      return normalized.startsWith(`${normalizedLabel}：`) || normalized.startsWith(`${normalizedLabel}:`);
    });
  if (!line) return undefined;
  const value = line.replace(/^[^:：]+[:：]\s*/, "").trim();
  return isMeaningfulValue(value) ? value : undefined;
}

function purchasedBoxSummary() {
  const parts = purchaseItems.value
    .map((item) => {
      const label = firstValue(item.label, item.boxType ? `${item.boxType}号箱` : "", item.box_type ? `${item.box_type}号箱` : "");
      const qty = firstValue(item.quantity, item.purchaseQty, item.purchase_quantity);
      const subtotal = firstValue(item.subtotal, item.purchase);
      if (!label && !qty) return "";
      return `${displayValue(label)}${qty ? ` x ${qty}` : ""}${subtotal ? `，小计 ${formatMoney(subtotal)}` : ""}`;
    })
    .filter(Boolean);
  return firstValue(parts.join("；"), summaryLine("箱型"));
}

function itemQuantitySummary() {
  return firstValue(
    order.value?.item_count,
    order.value?.estimated_box_count,
    serviceDetails.value.itemCount,
    serviceDetails.value.storageBoxCount,
    serviceFlags.value.itemCount,
    summaryLine("箱数 / 物品数量"),
    summaryLine("寄存箱数"),
    summaryLine("需要买箱子"),
    summaryLine("需购买箱子")
  );
}

function purchaseQuantitySummary() {
  const purchaseTotal = purchaseItems.value.reduce((sum, item) => {
    const qty = Number(firstValue(item.quantity, item.purchaseQty, item.purchase_quantity) || 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  return firstValue(
    purchaseTotal > 0 ? purchaseTotal : undefined,
    estimateSummary.value.totalPurchaseBoxes,
    estimateSummary.value.purchaseTotalBoxes,
    serviceDetails.value.purchaseBoxCount,
    serviceDetails.value.boxPurchaseCount,
    serviceFlags.value.purchaseBoxCount,
    summaryLine("购买数量"),
    summaryLine("需要买箱子"),
    summaryLine("需购买箱子")
  );
}

function quantityAmount(...values) {
  const value = firstValue(...values);
  const amount = Number(value);
  if (Number.isFinite(amount)) return amount;
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function boxTypeLabel(item = {}) {
  return displayValue(firstValue(
    item.label,
    item.boxLabel,
    item.box_label,
    item.boxTypeLabel,
    item.box_type_label,
    item.boxType ? `${item.boxType}号箱` : "",
    item.box_type ? `${item.box_type}号箱` : ""
  ));
}

function itemPurchaseFee(item = {}) {
  return moneyAmount(item.purchase, item.purchaseFee, item.purchase_fee, item.subtotal, item.total);
}

function itemOverweightFee(item = {}) {
  return moneyAmount(item.overweightFee, item.overweight_fee, item.extraWeightFee, item.extra_weight_fee);
}

function itemDescriptionSummary() {
  return firstValue(
    order.value?.item_description,
    order.value?.items_description,
    serviceDetails.value.itemDescription,
    serviceDetails.value.itemDescriptionText,
    serviceDetails.value.storageItemsDescription,
    serviceDetails.value.notes,
    serviceFlags.value.itemDescription,
    purchasedBoxSummary()
  );
}

function syncEditableForms(record = order.value || {}) {
  scheduleForm.service_time_slot = String(firstValue(record.service_time_slot, record.service_time, serviceDetails.value.serviceTime, serviceDetails.value.serviceTimeSlot) || "");
  scheduleForm.box_delivery_date = inputDate(firstValue(record.box_delivery_date, serviceDetails.value.boxDeliveryDate));
  scheduleForm.box_delivery_time_slot = String(firstValue(record.box_delivery_time_slot, serviceDetails.value.boxDeliveryTimeSlot, serviceDetails.value.boxDeliveryTime) || "");
  scheduleForm.storage_start_date = inputDate(firstValue(record.storage_start_date, record.storage_intake_date, serviceDetails.value.serviceDate, serviceDetails.value.storageStartDate));
  scheduleForm.storage_end_date = inputDate(firstValue(record.storage_end_date, record.expected_storage_end_date, serviceDetails.value.expectedStorageEndDate, serviceDetails.value.storageEndDate));

  addressForm.room_or_building = String(firstValue(record.room_or_building, serviceDetails.value.roomOrBuilding, serviceDetails.value.room, customerForm.value.roomOrBuilding) || "");
  addressForm.address_full = String(firstValue(record.address_full, serviceDetails.value.address, serviceDetails.value.fullAddress, serviceDetails.value.pickupAddress, customerForm.value.address) || "");
  addressForm.postcode = String(firstValue(record.postcode, serviceDetails.value.postcode, customerForm.value.postcode) || "");
  addressForm.has_lift = boolFormValue(firstValue(record.has_lift, serviceDetails.value.hasLift));
  addressForm.needs_upstairs = boolFormValue(firstValue(record.needs_upstairs, serviceDetails.value.needsUpstairs, serviceDetails.value.needUpstairs));
  statusDraft.value = String(firstValue(record.status) || "");
}

function resolvedOrderType(record = order.value || {}) {
  const value = firstValue(record.order_type, record.service_type, record.storage_type);
  const explicit = String(value || "").trim();
  const orderNoText = String(firstValue(record.storage_pickup_order_no, record.box_order_no, record.order_no, record.parent_order_no) || "").toUpperCase();
  const labelText = String(firstValue(record.service_label, record.service_type_label, record.order_label) || "");
  if (explicit === "box_delivery" || explicit === "box_order") return "box_order";
  if (explicit === "storage_collection" || orderNoText.startsWith("ST-P") || labelText.includes("取寄存") || labelText.includes("预约寄存") || labelText.includes("入仓")) {
    return "storage_collection";
  }
  if (explicit === "storage_return" || orderNoText.startsWith("ST-R") || orderNoText.startsWith("ST-S") || labelText.includes("送寄存") || labelText.includes("取回")) {
    return "storage_return";
  }
  if (record.box_order_no || record.box_delivery_date) return "box_order";
  if (record.storage_end_date || record.expected_storage_end_date) return "storage_return";
  return "storage_collection";
}

function serviceTypeLabel(type = resolvedOrderType()) {
  const labels = {
    box_order: "买箱订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单",
    storage: "寄存订单"
  };
  return labels[type] || displayValue(type);
}
function statusLabel(status) {
  const labels = {
    pending_confirmation: "待确认",
    confirmed: "已确认",
    completed: "已完成",
    cancelled: "已取消",
    canceled: "已取消"
  };
  return labels[status] || displayValue(status);
}
function statusTone(status) {
  if (status === "confirmed" || status === "completed") return "success";
  if (status === "cancelled" || status === "canceled") return "neutral";
  return "warning";
}

function rowOrderNo(record = order.value || {}) {
  const type = resolvedOrderType(record);
  if (type === "box_order") {
    return displayValue(firstValue(record.box_order_no, record.order_no, record.parent_order_no));
  }
  if (type === "storage_collection") {
    return displayValue(firstValue(record.storage_pickup_order_no, record.order_no, record.parent_order_no));
  }
  if (type === "storage_return") {
    return displayValue(firstValue(record.order_no, record.storage_return_order_no, record.related_order_no, record.parent_order_no));
  }
  return displayValue(firstValue(record.order_no, record.storage_pickup_order_no, record.box_order_no, record.parent_order_no));
}

function listHrefForOrder() {
  const returnTo = String(route.query.return_to || "");
  if (returnTo.startsWith("/admin-vue/storage/")) return returnTo;
  const type = String(route.query.order_type || resolvedOrderType());
  const routes = {
    box_order: "/admin-vue/storage/box-orders",
    storage_collection: "/admin-vue/storage/collections",
    storage_return: "/admin-vue/storage/returns"
  };
  return routes[type] || "/admin-vue/storage/collections";
}


const relatedBoxOrderNo = computed(() => firstValue(
  order.value?.box_order_no,
  String(order.value?.related_order_no || "").toUpperCase().startsWith("ST-B") ? order.value?.related_order_no : "",
  String(order.value?.parent_order_no || "").toUpperCase().startsWith("ST-B") ? order.value?.parent_order_no : "",
  customerForm.value.boxOrderNo,
  customerForm.value.box_order_no,
  serviceDetails.value.boxOrderNo,
  serviceDetails.value.box_order_no,
  summaryLine("买箱编号"),
  summaryLine("买箱订单编号")
));

const relatedBoxOrderRoute = computed(() => {
  const returnTo = route.fullPath.startsWith("/admin-vue") ? route.fullPath : `/admin-vue${route.fullPath}`;
  const boxId = firstValue(
    relatedBoxOrder.value?.id,
    order.value?.box_order_id,
    order.value?.box_storage_order_id,
    order.value?.related_box_order_id,
    order.value?.linked_box_order_id
  );
  if (boxId) {
    return {
      name: "storage-box-order-detail",
      params: { id: String(boxId) },
      query: { return_to: returnTo }
    };
  }
  if (relatedBoxOrderNo.value) {
    return {
      name: "storage-box-orders",
      query: { search: relatedBoxOrderNo.value }
    };
  }
  return null;
});

async function resolveRelatedBoxOrder() {
  relatedBoxOrder.value = null;
  const explicitId = firstValue(
    order.value?.box_order_id,
    order.value?.box_storage_order_id,
    order.value?.related_box_order_id,
    order.value?.linked_box_order_id
  );
  if (explicitId) {
    relatedBoxOrder.value = { id: explicitId, order_no: relatedBoxOrderNo.value };
    return;
  }
  if (!relatedBoxOrderNo.value) return;
  try {
    const payload = await fetchStorageOrders({
      order_type: "box_order",
      search: relatedBoxOrderNo.value,
      page: 1,
      page_size: 5
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    relatedBoxOrder.value = items.find((item) => {
      const candidates = [item.order_no, item.box_order_no, item.parent_order_no].filter(Boolean).map((value) => String(value).trim());
      return candidates.includes(String(relatedBoxOrderNo.value).trim());
    }) || items[0] || null;
  } catch (err) {
    relatedBoxOrder.value = null;
  }
}

function currentOrderType() {
  const queryType = String(route.query.order_type || "").trim();
  if (["box_order", "box_delivery", "storage_collection", "storage_return"].includes(queryType)) {
    return queryType === "box_delivery" ? "box_order" : queryType;
  }
  return resolvedOrderType();
}

function shouldRecalculatePricing() {
  const snapshotCounts = calculatorSnapshot.value?.boxCounts || calculatorSnapshot.value?.box_counts || {};
  const hasSnapshotCounts = snapshotCounts && typeof snapshotCounts === "object" && Object.values(snapshotCounts).some((value) => Number(value) > 0);
  const hasEstimateItems = Array.isArray(estimateSummary.value?.items) && estimateSummary.value.items.length > 0;
  const hasTotalBoxes = Number(firstValue(estimateSummary.value?.totalBoxes, order.value?.estimated_box_count, serviceDetails.value.storageBoxCount)) > 0;
  return currentOrderType() === "storage_collection" && (hasEstimateItems || hasSnapshotCounts || hasTotalBoxes);
}

const baseFields = computed(() => [
  field("订单编号", rowOrderNo()),
  field("User ID", firstValue(order.value?.public_user_id, order.value?.site_user_id, order.value?.user_id)),
  field("服务类型", serviceTypeLabel()),
  field("订单状态", statusLabel(order.value?.status)),
  field("创建时间", formatDateTime(order.value?.created_at)),
  field("更新时间", formatDateTime(order.value?.updated_at))
]);

const enhancedContactFields = computed(() => [
  field("姓名", firstValue(order.value?.customer_name, customerForm.value.customerName, customerForm.value.name, userSnapshot.value.name)),
  field("邮箱", firstValue(order.value?.student_email, order.value?.linked_user_email, customerForm.value.email, userSnapshot.value.email)),
  field("电话", firstValue(order.value?.phone, customerForm.value.phone, userSnapshot.value.phone, serviceFlags.value.phone)),
  field("微信", firstValue(order.value?.wechat_id, customerForm.value.wechatId, customerForm.value.contactHandle, userSnapshot.value.wechatId))
]);
const enhancedServiceFields = computed(() => [
  field("寄存开始日期", formatDate(firstValue(order.value?.storage_start_date, order.value?.storage_intake_date, serviceDetails.value.serviceDate, serviceDetails.value.storageStartDate, summaryLine("取件日期")))),
  field("寄存结束日期", formatDate(firstValue(order.value?.storage_end_date, order.value?.expected_storage_end_date, serviceDetails.value.expectedStorageEndDate, serviceDetails.value.storageEndDate, summaryLine("预计寄存结束日期")))),
  field("寄存天数", firstValue(order.value?.storage_days, estimateSummary.value.days, serviceDetails.value.storageDays, serviceFlags.value.storageDays))
]);
const enhancedAddressFields = computed(() => [
  field("公寓 / 楼栋 / 房间", firstValue(order.value?.room_or_building, serviceDetails.value.roomOrBuilding, serviceDetails.value.room, serviceFlags.value.roomOrBuilding, customerForm.value.roomOrBuilding, summaryLine("房间 / 楼栋 / 公寓名"))),
  field("邮编", firstValue(order.value?.postcode, serviceDetails.value.postcode, serviceFlags.value.postcode, customerForm.value.postcode, summaryLine("邮编"))),
  field("取件地址", firstValue(order.value?.address_full, serviceDetails.value.address, serviceDetails.value.fullAddress, serviceDetails.value.pickupAddress, serviceFlags.value.address, customerForm.value.address, summaryLine("地址"), summaryLine("取件地址")), true),
  field("是否有电梯", boolLabel(firstValue(order.value?.has_lift, serviceDetails.value.hasLift))),
  field("是否需要上楼", boolLabel(firstValue(order.value?.needs_upstairs, serviceDetails.value.needsUpstairs, serviceDetails.value.needUpstairs)))
]);
const enhancedItemFields = computed(() => [
  field("寄存箱型", firstValue(order.value?.box_type_summary, order.value?.box_type, serviceDetails.value.boxType, serviceDetails.value.boxTypeSummary, serviceFlags.value.boxType, serviceFlags.value.boxTypeSummary, purchasedBoxSummary()), true),
  field("寄存数量", itemQuantitySummary()),
  field("购买数量", purchaseQuantitySummary()),
  field("重量信息", firstValue(order.value?.weight, order.value?.estimated_weight, serviceDetails.value.weight, serviceFlags.value.weight)),
  field("是否超重", boolLabel(firstValue(order.value?.is_overweight, serviceDetails.value.isOverweight, serviceFlags.value.isOverweight))),
  field("物品说明", itemDescriptionSummary(), true)
]);

const boxDetailRows = computed(() => {
  const rows = estimateItems.value.map((item, index) => {
    const storageQty = quantityAmount(item.storageQty, item.storage_quantity, item.storageCount, item.storage_count);
    const purchaseQty = quantityAmount(item.purchaseQty, item.purchase_quantity, item.purchaseCount, item.purchase_count, item.quantity);
    const purchaseFee = itemPurchaseFee(item);
    const overweightFee = itemOverweightFee(item);
    const weight = firstValue(item.weight, item.estimatedWeight, item.estimated_weight, order.value?.weight, order.value?.estimated_weight, serviceDetails.value.weight, serviceFlags.value.weight);
    const hasAnyValue = storageQty > 0 || purchaseQty > 0 || purchaseFee > 0 || overweightFee > 0 || isMeaningfulValue(weight);
    if (!hasAnyValue) return null;
    return {
      key: `${boxTypeLabel(item)}-${index}`,
      boxType: boxTypeLabel(item),
      storageQty,
      purchaseQty,
      purchaseFee,
      weight: displayValue(weight),
      overweightFee
    };
  }).filter(Boolean);

  if (rows.length) return rows;

  const storageQty = quantityAmount(itemQuantitySummary());
  const purchaseQty = quantityAmount(purchaseQuantitySummary());
  const purchaseFee = purchaseItems.value.reduce((sum, item) => sum + itemPurchaseFee(item), 0);
  const overweightFee = moneyAmount(order.value?.overweight_fee, estimateSummary.value.overweightFee);
  const weight = firstValue(order.value?.weight, order.value?.estimated_weight, serviceDetails.value.weight, serviceFlags.value.weight);
  if (!storageQty && !purchaseQty && !purchaseFee && !overweightFee && !isMeaningfulValue(weight) && !isMeaningfulValue(purchasedBoxSummary())) {
    return [];
  }
  return [{
    key: "summary",
    boxType: displayValue(purchasedBoxSummary()),
    storageQty,
    purchaseQty,
    purchaseFee,
    weight: displayValue(weight),
    overweightFee
  }];
});

const priceFormula = computed(() => {
  const storageFee = moneyAmount(order.value?.storage_fee, estimateSummary.value.storageTotal, estimateSummary.value.discountedBase);
  const homeFee = moneyAmount(
    order.value?.pickup_fee,
    order.value?.return_fee,
    estimateSummary.value.pickupFee,
    estimateSummary.value.returnFee,
    estimateSummary.value.collectionFee,
    Number(estimateSummary.value.pickup || 0) + Number(estimateSummary.value.delivery || 0)
  );
  const stairsFee = moneyAmount(
    order.value?.stairs_fee,
    order.value?.upstairs_fee,
    estimateSummary.value.stairsFee,
    estimateSummary.value.upstairsFee,
    Number(estimateSummary.value.pickupAccessFee || 0) + Number(estimateSummary.value.returnAccessFee || 0)
  );
  const overweightFee = moneyAmount(order.value?.overweight_fee, estimateSummary.value.overweightFee);
  const extraFee = moneyAmount(order.value?.extra_charge_amount, estimateSummary.value.extraChargeAmount);
  const purchaseFee = moneyAmount(
    order.value?.box_fee,
    order.value?.purchase_fee,
    order.value?.box_purchase_fee,
    estimateSummary.value.purchaseTotal,
    estimateSummary.value.purchase_total,
    purchaseItems.value.reduce((sum, item) => sum + itemPurchaseFee(item), 0)
  );
  const discount = moneyAmount(order.value?.membership_discount_amount);
  const total = moneyAmount(
    order.value?.final_price,
    order.value?.total_price,
    order.value?.estimated_total_price,
    estimateSummary.value.finalPrice,
    estimateSummary.value.estimatedTotalPrice
  );
  return {
    total,
    parts: [
      { label: "仓储费", amount: storageFee, operator: "+" },
      { label: "上门费", amount: homeFee, operator: "+" },
      { label: "楼梯费", amount: stairsFee, operator: "+" },
      { label: "超重费", amount: overweightFee, operator: "+" },
      { label: "购买箱子费用", amount: purchaseFee, operator: "+" },
      ...(extraFee > 0 ? [{ label: "附加费用", amount: extraFee, operator: "+" }] : []),
      { label: "会员减免", amount: discount, operator: "-" }
    ]
  };
});
const enhancedNoteFields = computed(() => [
  field("用户备注", firstValue(order.value?.notes, customerForm.value.notes, serviceDetails.value.notes), true)
]);

function readableSummaryLine(item) {
  const value = String(item?.value || "").trim();
  if (!isMeaningfulValue(value) || value === "未填写") return "";
  return `${item.label}：${value}`;
}

const businessSummary = computed(() => [
  `订单编号：${rowOrderNo()}`,
  `服务类型：${serviceTypeLabel()}`,
  ...enhancedContactFields.value.map(readableSummaryLine),
  ...enhancedServiceFields.value.map(readableSummaryLine),
  ...enhancedAddressFields.value.map(readableSummaryLine),
  ...enhancedItemFields.value.map(readableSummaryLine),
  `费用：总费用 ${formatFormulaMoney(priceFormula.value.total)}`,
  ...enhancedNoteFields.value.map(readableSummaryLine)
].filter(Boolean).join("\n"));
async function saveSchedule() {
  if (savingSchedule.value) return;
  savingSchedule.value = true;
  notice.value = "";
  error.value = "";
  try {
    const syncedServiceDate = currentOrderType() === "storage_return"
      ? scheduleForm.storage_end_date
      : scheduleForm.storage_start_date;
    await updateStorageOrder(orderId.value, {
      service_date: syncedServiceDate,
      service_time_slot: scheduleForm.service_time_slot,
      storage_intake_date: scheduleForm.storage_start_date,
      storage_start_date: scheduleForm.storage_start_date,
      storage_end_date: scheduleForm.storage_end_date,
      expected_storage_end_date: scheduleForm.storage_end_date,
      ...(shouldRecalculatePricing() ? { recalculate_pricing: true } : {})
    });
    await loadOrder({ silent: true });
    notice.value = "寄存预约信息已保存。";
  } catch (err) {
    notice.value = err.message || "寄存预约信息保存失败。";
  } finally {
    savingSchedule.value = false;
  }
}
async function saveAddress() {
  if (savingAddress.value) return;
  savingAddress.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, {
      room_or_building: addressForm.room_or_building,
      address_full: addressForm.address_full,
      postcode: addressForm.postcode,
      has_lift: addressForm.has_lift === "" ? null : addressForm.has_lift === "true",
      needs_upstairs: addressForm.needs_upstairs === "" ? null : addressForm.needs_upstairs === "true",
      ...(shouldRecalculatePricing() ? { recalculate_pricing: true } : {})
    });
    await loadOrder({ silent: true });
    notice.value = "地址信息已保存。";
  } catch (err) {
    notice.value = err.message || "地址信息保存失败。";
  } finally {
    savingAddress.value = false;
  }
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || `${currentOrderType()}-${rowOrderNo()}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function exportCurrentOrder() {
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportStorageOrders({
      order_type: currentOrderType(),
      search: rowOrderNo(),
      sort: "created_at_desc"
    });
    downloadBlob(blob, filename);
    notice.value = "当前订单导出已开始下载。";
  } catch (err) {
    notice.value = err.message || "导出 Excel 失败。";
  } finally {
    exporting.value = false;
  }
}

function openDeleteDialog() {
  deleteDialogOpen.value = true;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialogOpen.value = false;
}

async function confirmDelete() {
  if (deleting.value || !orderId.value) return;
  deleting.value = true;
  notice.value = "";
  error.value = "";
  try {
    await deleteStorageOrder(orderId.value);
    notice.value = "订单已删除，正在返回列表。";
    window.location.href = listHrefForOrder();
  } catch (err) {
    notice.value = err.message || "删除订单失败。";
  } finally {
    deleting.value = false;
    deleteDialogOpen.value = false;
  }
}

function openStatusDialog() {
  statusDraft.value = String(order.value?.status || "");
  statusDialogOpen.value = true;
  notice.value = "";
}

function closeStatusDialog() {
  if (!savingStatus.value) statusDialogOpen.value = false;
}

async function confirmStatusChange() {
  if (savingStatus.value || !statusDraft.value) return;
  savingStatus.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, { status: statusDraft.value });
    await loadOrder({ silent: true });
    notice.value = `订单状态已更新为：${statusLabel(statusDraft.value)}。`;
    statusDialogOpen.value = false;
  } catch (err) {
    notice.value = err.message || "状态修改失败。";
  } finally {
    savingStatus.value = false;
  }
}
async function loadOrder(options = {}) {
  if (!orderId.value) {
    order.value = null;
    error.value = "缺少寄存订单 ID。";
    return;
  }
  if (!options.silent) {
    loading.value = true;
    notice.value = "";
  }
  error.value = "";
  try {
    const payload = await fetchStorageOrder(orderId.value);
    order.value = payload?.order || payload?.item || payload;
    syncEditableForms(order.value);
    if (resolvedOrderType(order.value) === "box_order") {
      router.replace({
        path: `/storage/box-orders/${encodeURIComponent(orderId.value)}`,
        query: {
          return_to: route.query.return_to || "/admin-vue/storage/box-orders",
          order_type: "box_order"
        }
      });
      return;
    }
    await resolveRelatedBoxOrder();
  } catch (err) {
    order.value = null;
    error.value = err.message || "寄存订单详情加载失败";
  } finally {
    if (!options.silent) loading.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <section class="storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage order detail</p>
        <h2>寄存订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHrefForOrder()" label="返回列表" />
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载寄存订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!order" title="未找到寄存订单" description="请从寄存订单列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>订单编号</span>
          <strong>{{ rowOrderNo() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</StatusBadge>
      </div>

      <DetailSection title="订单基础信息" description="订单编号和服务类型用于核对，不在详情页修改。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="用户与联系方式" description="展示订单提交时留下的客户联系方式。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in enhancedContactFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="寄存周期 / 预约信息" description="只展示和编辑寄存订单相关日期，不混入买箱配送字段。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in enhancedServiceFields" :key="item.label" v-bind="item" />
        </div>
        <form class="editable-detail-form" @submit.prevent="saveSchedule">
          <label>
            <span>取件 / 送回时间段</span>
            <input v-model="scheduleForm.service_time_slot" type="text" placeholder="例如 10:00 - 13:00" />
          </label>
          <label>
            <span>寄存开始日期</span>
            <input v-model="scheduleForm.storage_start_date" type="date" />
          </label>
          <label>
            <span>寄存结束日期</span>
            <input v-model="scheduleForm.storage_end_date" type="date" />
          </label>
          <div class="editable-detail-form__actions">
            <button class="primary-button" type="submit" :disabled="savingSchedule">
              {{ savingSchedule ? "保存中..." : "保存寄存预约信息" }}
            </button>
          </div>
        </form>
      </DetailSection>
      <DetailSection title="地址信息" description="地址、房间、邮编、电梯和楼层信息集中核对。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in enhancedAddressFields" :key="item.label" v-bind="item" />
        </div>
                <form class="editable-detail-form editable-detail-form--address" @submit.prevent="saveAddress">
          <label>
            <span>公寓 / 楼栋 / 房间</span>
            <input v-model="addressForm.room_or_building" type="text" />
          </label>
          <label>
            <span>邮编</span>
            <input v-model="addressForm.postcode" type="text" />
          </label>
          <label>
            <span>是否有电梯</span>
            <select v-model="addressForm.has_lift">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            <span>是否需要上楼</span>
            <select v-model="addressForm.needs_upstairs">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label class="editable-detail-form__wide">
            <span>详细地址</span>
            <textarea v-model="addressForm.address_full" rows="3"></textarea>
          </label>
          <div class="editable-detail-form__actions">
            <button class="primary-button" type="submit" :disabled="savingAddress">
              {{ savingAddress ? "保存中..." : "保存地址信息" }}
            </button>
          </div>
        </form>
      </DetailSection>

      <DetailSection title="箱子 / 物品 / 数量信息">
        <div class="storage-related-order-panel">
          <div>
            <span>关联买箱订单</span>
            <strong>{{ displayValue(relatedBoxOrderNo) }}</strong>
          </div>
          <RouterLink v-if="relatedBoxOrderRoute" class="secondary-button" :to="relatedBoxOrderRoute">
            查看买箱订单
          </RouterLink>
          <span v-else class="storage-related-action__empty">暂无关联买箱订单</span>
        </div>
        <div class="storage-box-table-wrap">
          <table class="storage-box-table">
            <thead>
              <tr>
                <th>箱型</th>
                <th>寄存数量</th>
                <th>购买数量</th>
                <th>购买费用</th>
                <th>重量信息</th>
                <th>超重费用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in boxDetailRows" :key="item.key">
                <td>{{ item.boxType }}</td>
                <td>{{ item.storageQty }}</td>
                <td>{{ item.purchaseQty }}</td>
                <td>{{ formatFormulaMoney(item.purchaseFee) }}</td>
                <td>{{ item.weight }}</td>
                <td>{{ item.overweightFee > 0 ? formatFormulaMoney(item.overweightFee) : "无超重" }}</td>
              </tr>
              <tr v-if="!boxDetailRows.length">
                <td class="storage-box-table__empty" colspan="6">暂无箱型明细</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection title="费用 / 价格信息" description="按当前详情接口已有费用字段展示，实际重算仍走后端估价逻辑。">
        <div class="storage-price-formula">
          <strong>总费用 {{ formatFormulaMoney(priceFormula.total) }}</strong>
          <span>=</span>
          <template v-for="(part, index) in priceFormula.parts" :key="part.label">
            <span v-if="index > 0">{{ part.operator }}</span>
            <span>{{ formatFormulaMoney(part.amount) }}（{{ part.label }}）</span>
          </template>
        </div>
      </DetailSection>

      <DetailSection title="备注信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in enhancedNoteFields" :key="item.label" v-bind="item" />
        </div>
        <details v-if="businessSummary" class="detail-text-block">
          <summary>展开客服可读摘要</summary>
          <pre>{{ businessSummary }}</pre>
        </details>
      </DetailSection>

      <DetailSection title="操作区" description="寄存模块必要操作；删除和状态修改都会先确认。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" :disabled="exporting" @click="exportCurrentOrder">
            {{ exporting ? "导出中..." : "导出当前订单 Excel" }}
          </button>
          <button class="table-action-button" type="button" :disabled="savingStatus" @click="openStatusDialog">状态修改</button>
          <button class="table-action-button table-action-button--danger" type="button" :disabled="deleting" @click="openDeleteDialog">
            {{ deleting ? "删除中..." : "删除订单" }}
          </button>
        </div>
      </DetailSection>
    </template>

    <ConfirmDialog
      :open="deleteDialogOpen"
      title="确认删除寄存订单"
      confirm-label="确认删除"
      :loading="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    >
      <p class="confirm-dialog__warning">删除后不可恢复，请确认这是要删除的单条寄存订单。</p>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ rowOrderNo() }}</strong>
        </article>
        <article class="readonly-field">
          <span>服务类型</span>
          <strong>{{ serviceTypeLabel() }}</strong>
        </article>
        <article class="readonly-field">
          <span>用户姓名</span>
          <strong>{{ displayValue(order?.customer_name) }}</strong>
        </article>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      :open="statusDialogOpen"
      title="确认修改订单状态"
      confirm-label="确认修改"
      :loading="savingStatus"
      tone="default"
      @cancel="closeStatusDialog"
      @confirm="confirmStatusChange"
    >
      <p>请选择新的寄存订单状态。状态会写入现有寄存订单接口。</p>
      <label class="field">
        <span>订单状态</span>
        <select v-model="statusDraft">
          <option value="pending_confirmation">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ rowOrderNo() }}</strong>
        </article>
        <article class="readonly-field">
          <span>当前状态</span>
          <strong>{{ statusLabel(order?.status) }}</strong>
        </article>
        <article class="readonly-field">
          <span>将修改为</span>
          <strong>{{ statusLabel(statusDraft) }}</strong>
        </article>
      </div>
    </ConfirmDialog>
  </section>
</template>
