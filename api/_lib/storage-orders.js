const STORAGE_ORDER_TYPES = {
  box_delivery: {
    label: "买箱子 / 送箱",
    orderNoPrefix: "ST-B"
  },
  storage_collection: {
    label: "预约寄存 / 入仓",
    orderNoPrefix: "ST-C"
  },
  storage_return: {
    label: "取寄存 / 取回",
    orderNoPrefix: "ST-R"
  }
};

const ACTIVE_STORAGE_STATUSES = ["pending_confirmation", "confirmed"];

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeOrderType(value) {
  const orderType = normalizeString(value).toLowerCase();
  if (!STORAGE_ORDER_TYPES[orderType]) {
    throw new Error("请选择本次服务类型");
  }
  return orderType;
}

function assertDateField(fieldName, value) {
  const text = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} is required`);
  }
  return text;
}

function getUkDateTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour)
  };
}

function formatUtcDateInputValue(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateInputValue(dateText, days) {
  const [year, month, day] = String(dateText || "").split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }
  return formatUtcDateInputValue(new Date(Date.UTC(year, month - 1, day + days)));
}

function getUkTodayInputValue(now = new Date()) {
  const parts = getUkDateTimeParts(now);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function getEarliestStorageReturnDateValue(now = new Date()) {
  const ukParts = getUkDateTimeParts(now);
  const today = getUkTodayInputValue(now);
  return addDaysToDateInputValue(today, ukParts.hour < 12 ? 1 : 2);
}

function isWeekendDateInputValue(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))) {
    return false;
  }
  const day = new Date(`${dateText}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function assertStorageReturnServiceDate(value) {
  const serviceDate = assertDateField("service_date", value);
  const today = getUkTodayInputValue();
  const earliestDate = getEarliestStorageReturnDateValue();
  if (serviceDate <= today) {
    throw new Error("送回 / 自取日期必须大于英国当天日期。");
  }
  if (serviceDate < earliestDate) {
    throw new Error(`当前英国时间下，最早可选择 ${earliestDate}。12 点前提交最早第二天可取，12 点后提交最早第三天可取。`);
  }
  return serviceDate;
}

function normalizeAddressKey(...values) {
  return values
    .map(value => normalizeString(value).toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .slice(0, 240);
}

function getStorageServiceLabel(orderType) {
  return STORAGE_ORDER_TYPES[orderType]?.label || orderType || "寄存服务预约";
}

function buildAddressFull(details) {
  return [
    normalizeString(details.addressFull || details.serviceAddress || details.returnAddress || details.collectionAddress),
    normalizeString(details.roomOrBuilding),
    normalizeString(details.postcode)
  ].filter(Boolean).join(" / ");
}

function buildStorageReadableMessage(payload) {
  const lines = [
    `【${payload.service_label}待确认】`,
    "",
    `订单服务：${payload.service_label}`,
    `客户姓名：${payload.customer_name || "—"}`,
    `联系电话：${payload.phone || "—"}`,
    `联系方式：${payload.wechat_id || "—"}`,
    `服务日期：${payload.service_date || "—"}`,
    `服务时间段：${payload.service_time_slot || "—"}`,
    `地址：${payload.address_full || "—"}`,
    `房间 / 楼栋 / 公寓名：${payload.room_or_building || "—"}`,
    `邮编：${payload.postcode || "—"}`,
    `箱数 / 物品数量：${payload.estimated_box_count || 0}`,
    payload.related_order_no ? `原寄存订单号：${payload.related_order_no}` : "",
    payload.storage_start_date ? `寄存开始日期：${payload.storage_start_date}` : "",
    payload.expected_storage_end_date ? `预计寄存结束日期：${payload.expected_storage_end_date}` : "",
    payload.has_lift === null || payload.has_lift === undefined ? "" : `是否有电梯：${payload.has_lift ? "是" : "否"}`,
    payload.needs_upstairs === null || payload.needs_upstairs === undefined ? "" : `是否需要上楼：${payload.needs_upstairs ? "是" : "否"}`,
    payload.item_description ? `物品简单描述：${payload.item_description}` : "",
    "",
    "寄存信息摘要：",
    payload.final_readable_message || payload.notes || "无",
    "",
    "备注：",
    payload.notes || "无"
  ].filter(line => line !== "");

  return lines.join("\n");
}

function assertCommonPayload(body, details) {
  if (!isObject(body)) {
    throw new Error("Invalid request payload");
  }

  if (!isObject(body.customerForm)) {
    throw new Error("customerForm is required");
  }

  if (!isObject(details)) {
    throw new Error("serviceDetails is required");
  }

  const customerForm = body.customerForm;
  if (customerForm.noticeConfirmed !== true) {
    throw new Error("noticeConfirmed is required");
  }
}

function mapBoxDeliveryPayload(body, details) {
  const serviceDate = assertDateField("service_date", details.serviceDate);
  const purchaseQuantity = Math.max(0, normalizeInteger(details.purchaseQuantity, 0));
  if (purchaseQuantity <= 0) {
    throw new Error("purchaseQuantity is required");
  }

  const contactName = normalizeString(details.contactName || body.customerForm.customerName);
  const contactPhone = normalizeString(details.contactPhone || body.customerForm.phone);
  const serviceAddress = normalizeString(details.serviceAddress);
  const roomOrBuilding = normalizeString(details.roomOrBuilding);
  const postcode = normalizeString(details.postcode);
  const serviceTimeSlot = normalizeString(details.serviceTimeSlot);

  const required = [
    ["contactName", contactName],
    ["contactPhone", contactPhone],
    ["serviceTimeSlot", serviceTimeSlot],
    ["serviceAddress", serviceAddress],
    ["roomOrBuilding", roomOrBuilding],
    ["postcode", postcode]
  ].find(([, value]) => !value);
  if (required) {
    throw new Error(`${required[0]} is required`);
  }

  return {
    customerName: contactName,
    phone: contactPhone,
    contactHandle: normalizeString(body.customerForm.contactHandle),
    serviceDate,
    serviceTimeSlot,
    addressFull: buildAddressFull({ serviceAddress, roomOrBuilding, postcode }),
    roomOrBuilding,
    postcode,
    addressKey: normalizeAddressKey(serviceAddress, roomOrBuilding, postcode),
    estimatedBoxCount: purchaseQuantity,
    notes: normalizeString(details.notes),
    finalReadableMessage: normalizeString(body.finalReadableMessage)
      || `购买箱子数量：${purchaseQuantity}\n送箱服务默认楼下交接。如有特殊情况，请查看备注。`
  };
}

function mapStorageCollectionPayload(body, details) {
  const serviceDate = assertDateField("service_date", details.serviceDate);
  const expectedEndDate = assertDateField("expected_storage_end_date", details.expectedStorageEndDate);
  const boxCount = Math.max(0, normalizeInteger(details.storageBoxCount, 0));
  if (boxCount <= 0) {
    throw new Error("storageBoxCount is required");
  }

  const addressText = normalizeString(details.collectionAddress);
  const roomOrBuilding = normalizeString(details.roomOrBuilding);
  const postcode = normalizeString(details.postcode);
  const serviceTimeSlot = normalizeString(details.serviceTimeSlot);
  const hasLiftProvided = details.hasLift !== undefined && details.hasLift !== null && details.hasLift !== "";
  const needsUpstairsProvided = details.needsUpstairs !== undefined && details.needsUpstairs !== null && details.needsUpstairs !== "";

  const required = [
    ["serviceTimeSlot", serviceTimeSlot],
    ["collectionAddress", addressText],
    ["roomOrBuilding", roomOrBuilding],
    ["postcode", postcode]
  ].find(([, value]) => !value);
  if (required) {
    throw new Error(`${required[0]} is required`);
  }
  if (!hasLiftProvided) {
    throw new Error("hasLift is required");
  }
  if (!needsUpstairsProvided) {
    throw new Error("needsUpstairs is required");
  }

  return {
    customerName: normalizeString(body.customerForm.customerName),
    phone: normalizeString(body.customerForm.phone),
    contactHandle: normalizeString(body.customerForm.contactHandle),
    serviceDate,
    serviceTimeSlot,
    addressFull: buildAddressFull({ collectionAddress: addressText, roomOrBuilding, postcode }),
    roomOrBuilding,
    postcode,
    addressKey: normalizeAddressKey(addressText, roomOrBuilding, postcode),
    estimatedBoxCount: boxCount,
    storageStartDate: serviceDate,
    expectedStorageEndDate: expectedEndDate,
    hasLift: normalizeBoolean(details.hasLift),
    needsUpstairs: normalizeBoolean(details.needsUpstairs),
    notes: normalizeString(details.notes),
    finalReadableMessage: normalizeString(body.finalReadableMessage)
      || `寄存箱数：${boxCount}\n预计寄存结束日期：${expectedEndDate}\n本次仅提交取件入仓预约。`
  };
}

function mapStorageReturnPayload(body, details) {
  const serviceDate = assertStorageReturnServiceDate(details.serviceDate);
  const itemCount = Math.max(0, normalizeInteger(details.itemCount, 0));
  if (itemCount <= 0) {
    throw new Error("itemCount is required");
  }

  const customerForm = isObject(body.customerForm) ? body.customerForm : {};
  const storageCustomerName = normalizeString(details.storageCustomerName || customerForm.customerName);
  const storagePhone = normalizeString(details.storagePhone || customerForm.phone);
  const storageContact = normalizeString(details.storageContact || customerForm.contactHandle || customerForm.contactPreferenceLabel);
  const itemDescription = normalizeString(details.itemDescription);
  const returnAddress = normalizeString(details.returnAddress);
  const roomOrBuilding = normalizeString(details.roomOrBuilding);
  const postcode = normalizeString(details.postcode);
  const serviceTimeSlot = normalizeString(details.serviceTimeSlot);
  const hasLiftProvided = details.hasLift !== undefined && details.hasLift !== null && details.hasLift !== "";
  const needsUpstairsProvided = details.needsUpstairs !== undefined && details.needsUpstairs !== null && details.needsUpstairs !== "";

  const required = [
    ["storageCustomerName", storageCustomerName],
    ["storagePhone", storagePhone],
    ["itemDescription", itemDescription],
    ["serviceTimeSlot", serviceTimeSlot],
    ["returnAddress", returnAddress],
    ["roomOrBuilding", roomOrBuilding],
    ["postcode", postcode]
  ].find(([, value]) => !value);
  if (required) {
    throw new Error(`${required[0]} is required`);
  }
  if (!storageContact) {
    throw new Error("storageContact is required");
  }
  if (!hasLiftProvided) {
    throw new Error("hasLift is required");
  }
  if (!needsUpstairsProvided) {
    throw new Error("needsUpstairs is required");
  }

  const relatedOrderNo = normalizeString(details.relatedOrderNo).toUpperCase();
  return {
    customerName: storageCustomerName,
    phone: storagePhone,
    contactHandle: storageContact,
    serviceDate,
    serviceTimeSlot,
    addressFull: buildAddressFull({ returnAddress, roomOrBuilding, postcode }),
    roomOrBuilding,
    postcode,
    addressKey: normalizeAddressKey(returnAddress, roomOrBuilding, postcode),
    estimatedBoxCount: itemCount,
    relatedOrderNo: relatedOrderNo || null,
    hasLift: normalizeBoolean(details.hasLift),
    needsUpstairs: normalizeBoolean(details.needsUpstairs),
    itemDescription,
    notes: normalizeString(details.notes),
    finalReadableMessage: [
      normalizeString(body.finalReadableMessage),
      "寄存信息摘要：",
      `寄存人姓名：${storageCustomerName}`,
      `寄存时使用的手机号：${storagePhone}`,
      `微信 / WhatsApp / 邮箱：${storageContact}`,
      `寄存物品数量：${itemCount}`,
      `物品简单描述：${itemDescription}`,
      isWeekendDateInputValue(serviceDate) ? "周末日期提示：周六周日是否有可用司机需要再和客服确认。" : ""
    ].filter(Boolean).join("\n")
  };
}

function mapStorageOrderPayload(body) {
  const orderType = normalizeOrderType(body.orderType || body.order_type);
  const details = isObject(body.serviceDetails) ? body.serviceDetails : {};
  assertCommonPayload(body, details);

  const mapper = {
    box_delivery: mapBoxDeliveryPayload,
    storage_collection: mapStorageCollectionPayload,
    storage_return: mapStorageReturnPayload
  }[orderType];
  const mapped = mapper(body, details);
  const estimateSummary = isObject(body.estimateSummary) ? body.estimateSummary : {};
  const serviceFlags = isObject(body.serviceFlags) ? body.serviceFlags : {};
  const calculatorSnapshot = isObject(body.calculatorSnapshot) ? body.calculatorSnapshot : {};
  const finalReadableMessage = mapped.finalReadableMessage || normalizeString(body.finalReadableMessage);

  const payload = {
    source: normalizeString(body.source) || "storage_service_booking",
    order_type: orderType,
    customer_name: mapped.customerName,
    wechat_id: mapped.contactHandle,
    phone: mapped.phone,
    address_full: mapped.addressFull,
    service_date: mapped.serviceDate,
    service_time: mapped.serviceTimeSlot,
    service_time_slot: mapped.serviceTimeSlot,
    need_moving_help: normalizeBoolean(mapped.needsUpstairs),
    service_label: getStorageServiceLabel(orderType),
    service_flags_json: serviceFlags,
    estimated_box_count: mapped.estimatedBoxCount,
    estimated_total_price: normalizeNumber(estimateSummary.estimatedTotalPrice, 0),
    friend_pickup: false,
    friend_phone: null,
    notes: mapped.notes || null,
    estimate_summary_json: estimateSummary,
    customer_form_json: {
      ...body.customerForm,
      orderType,
      serviceDetails: details
    },
    calculator_snapshot_json: calculatorSnapshot,
    final_readable_message: finalReadableMessage ? buildStorageReadableMessage({
      ...mapped,
      service_label: getStorageServiceLabel(orderType),
      estimated_box_count: mapped.estimatedBoxCount,
      final_readable_message: finalReadableMessage
    }) : buildStorageReadableMessage({
      ...mapped,
      service_label: getStorageServiceLabel(orderType),
      estimated_box_count: mapped.estimatedBoxCount
    }),
    notification_status: "pending",
    notification_error: null,
    webhook_payload_json: null,
    storage_start_date: mapped.storageStartDate || null,
    expected_storage_end_date: mapped.expectedStorageEndDate || null,
    related_order_no: mapped.relatedOrderNo || null,
    postcode: mapped.postcode,
    room_or_building: mapped.roomOrBuilding,
    address_key: mapped.addressKey,
    has_lift: mapped.hasLift === undefined ? null : mapped.hasLift,
    needs_upstairs: mapped.needsUpstairs === undefined ? null : mapped.needsUpstairs,
    item_description: mapped.itemDescription || null
  };

  if (orderType === "box_delivery") {
    delete payload.related_order_no;
  }

  return payload;
}

function buildStorageOrderWebhookPayload(orderRecord) {
  return {
    event: "storage_order.created",
    orderId: orderRecord.id,
    orderNo: orderRecord.order_no,
    orderType: orderRecord.order_type,
    status: orderRecord.status,
    notificationStatus: orderRecord.notification_status,
    submittedAt: orderRecord.created_at,
    serviceDate: orderRecord.service_date,
    serviceTimeSlot: orderRecord.service_time_slot || orderRecord.service_time,
    estimatedTotalPrice: orderRecord.estimated_total_price,
    customer: {
      name: orderRecord.customer_name,
      wechatId: orderRecord.wechat_id,
      phone: orderRecord.phone,
      email: orderRecord.student_email
    },
    service: {
      date: orderRecord.service_date,
      time: orderRecord.service_time_slot || orderRecord.service_time,
      label: orderRecord.service_label,
      flags: orderRecord.service_flags_json,
      relatedOrderNo: orderRecord.related_order_no
    },
    summary: orderRecord.estimate_summary_json,
    customerForm: orderRecord.customer_form_json,
    finalReadableMessage: orderRecord.final_readable_message
  };
}

function buildStorageOrderAdminFilters(query, queryParams = {}, options = {}) {
  const search = normalizeString(queryParams.search);
  const status = normalizeString(queryParams.status);
  const notificationStatus = normalizeString(queryParams.notification_status);
  const orderType = normalizeString(queryParams.order_type) === "box_delivery"
    ? ""
    : normalizeString(queryParams.order_type);

  if (search) {
    const safe = search.replace(/,/g, " ").trim();
    const supportedColumns = options.supportedColumns instanceof Set ? options.supportedColumns : null;
    const hasColumn = column => !supportedColumns || supportedColumns.has(column);
    const searchParts = [
      hasColumn("order_no") ? `order_no.ilike.%${safe}%` : "",
      hasColumn("customer_name") ? `customer_name.ilike.%${safe}%` : "",
      hasColumn("wechat_id") ? `wechat_id.ilike.%${safe}%` : "",
      hasColumn("phone") ? `phone.ilike.%${safe}%` : "",
      hasColumn("student_email") ? `student_email.ilike.%${safe}%` : "",
      hasColumn("related_order_no") ? `related_order_no.ilike.%${safe}%` : ""
    ].filter(Boolean);
    const matchingSiteUserIds = Array.isArray(options.matchingSiteUserIds) ? options.matchingSiteUserIds : [];
    if (matchingSiteUserIds.length && hasColumn("site_user_id")) {
      searchParts.push(`site_user_id.in.(${matchingSiteUserIds.join(",")})`);
    }
    if (searchParts.length) {
      query.or(searchParts.join(","));
    }
  }

  if (status) {
    query.eq("status", status);
  }

  if (notificationStatus) {
    query.eq("notification_status", notificationStatus);
  }

  if (orderType === "storage_collection") {
    query.or("order_type.eq.storage_collection,service_label.ilike.%预约寄存%,service_label.ilike.%送寄存%,service_label.ilike.%入仓%");
  } else if (orderType === "storage_return") {
    query.or("order_type.eq.storage_return,service_label.ilike.%取回%");
  } else if (orderType === "storage") {
    query.eq("order_type", "storage");
  } else {
    query.neq("order_type", "box_delivery");
  }
}

module.exports = {
  ACTIVE_STORAGE_STATUSES,
  STORAGE_ORDER_TYPES,
  assertStorageOrderPayload: assertCommonPayload,
  mapStorageOrderPayload,
  buildStorageOrderWebhookPayload,
  buildStorageOrderAdminFilters,
  getStorageServiceLabel,
  normalizeAddressKey
};
