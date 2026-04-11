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

function assertStorageOrderPayload(body) {
  if (!isObject(body)) {
    throw new Error("Invalid request payload");
  }

  if (!isObject(body.estimateSummary)) {
    throw new Error("estimateSummary is required");
  }

  if (!isObject(body.customerForm)) {
    throw new Error("customerForm is required");
  }

  const customerForm = body.customerForm;
  if (customerForm.noticeConfirmed !== true) {
    throw new Error("noticeConfirmed is required");
  }

  const requiredFields = [
    ["serviceDate", customerForm.serviceDate],
    ["wechatId", customerForm.wechatId],
    ["customerName", customerForm.customerName],
    ["phone", customerForm.phone],
    ["addressFull", customerForm.addressFull]
  ];

  const missing = requiredFields.find(([, value]) => !normalizeString(value));
  if (missing) {
    throw new Error(`${missing[0]} is required`);
  }

  const totalBoxes = normalizeInteger(body.estimateSummary.totalBoxes, 0);
  const estimatedTotalPrice = normalizeNumber(body.estimateSummary.estimatedTotalPrice, 0);
  if (totalBoxes <= 0 && estimatedTotalPrice <= 0) {
    throw new Error("A valid estimate is required");
  }

  if (normalizeBoolean(customerForm.friendPickup) && !normalizeString(customerForm.friendPhone)) {
    throw new Error("friendPhone is required when friendPickup is true");
  }
}

function mapStorageOrderPayload(body) {
  assertStorageOrderPayload(body);

  const estimateSummary = body.estimateSummary;
  const customerForm = body.customerForm;
  const serviceFlags = isObject(body.serviceFlags) ? body.serviceFlags : {};
  const calculatorSnapshot = isObject(body.calculatorSnapshot) ? body.calculatorSnapshot : {};

  return {
    source: normalizeString(body.source) || "storage_non_member_calculator",
    customer_name: normalizeString(customerForm.customerName),
    wechat_id: normalizeString(customerForm.wechatId),
    phone: normalizeString(customerForm.phone),
    address_full: normalizeString(customerForm.addressFull),
    service_date: normalizeString(customerForm.serviceDate),
    service_time: normalizeString(customerForm.serviceTime) || "daytime",
    need_moving_help: normalizeBoolean(customerForm.needMovingHelp),
    service_label: normalizeString(body.serviceLabel) || normalizeString(estimateSummary.serviceLabel) || "非会员寄存预约",
    service_flags_json: serviceFlags,
    estimated_box_count: Math.max(0, normalizeInteger(customerForm.estimatedBoxCount, normalizeInteger(estimateSummary.totalBoxes, 0))),
    estimated_total_price: normalizeNumber(estimateSummary.estimatedTotalPrice, 0),
    friend_pickup: normalizeBoolean(customerForm.friendPickup),
    friend_phone: normalizeString(customerForm.friendPhone) || null,
    notes: normalizeString(customerForm.notes) || null,
    estimate_summary_json: estimateSummary,
    customer_form_json: customerForm,
    calculator_snapshot_json: calculatorSnapshot,
    final_readable_message: normalizeString(body.finalReadableMessage),
    notification_status: "pending",
    notification_error: null,
    webhook_payload_json: null
  };
}

function buildStorageOrderWebhookPayload(orderRecord) {
  return {
    event: "storage_order.created",
    orderId: orderRecord.id,
    orderNo: orderRecord.order_no,
    status: orderRecord.status,
    notificationStatus: orderRecord.notification_status,
    submittedAt: orderRecord.created_at,
    estimatedTotalPrice: orderRecord.estimated_total_price,
    customer: {
      name: orderRecord.customer_name,
      wechatId: orderRecord.wechat_id,
      phone: orderRecord.phone
    },
    service: {
      date: orderRecord.service_date,
      time: orderRecord.service_time,
      label: orderRecord.service_label,
      flags: orderRecord.service_flags_json
    },
    summary: orderRecord.estimate_summary_json,
    customerForm: orderRecord.customer_form_json,
    finalReadableMessage: orderRecord.final_readable_message
  };
}

function buildStorageOrderAdminFilters(query, queryParams = {}) {
  const search = normalizeString(queryParams.search);
  const status = normalizeString(queryParams.status);
  const notificationStatus = normalizeString(queryParams.notification_status);

  if (search) {
    const safe = search.replace(/,/g, " ").trim();
    query.or(`order_no.ilike.%${safe}%,customer_name.ilike.%${safe}%,wechat_id.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  if (status) {
    query.eq("status", status);
  }

  if (notificationStatus) {
    query.eq("notification_status", notificationStatus);
  }
}

module.exports = {
  assertStorageOrderPayload,
  mapStorageOrderPayload,
  buildStorageOrderWebhookPayload,
  buildStorageOrderAdminFilters
};
