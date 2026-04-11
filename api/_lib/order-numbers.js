const ORDER_TYPE_PREFIXES = {
  pickup: "PU",
  storage: "ST",
  housing: "HS"
};

function normalizeOrderType(orderType) {
  const normalized = String(orderType || "").trim().toLowerCase();
  if (!ORDER_TYPE_PREFIXES[normalized]) {
    throw new Error(`Unsupported order type: ${orderType}`);
  }
  return normalized;
}

async function allocateOrderNumber(supabase, orderType) {
  const normalizedOrderType = normalizeOrderType(orderType);
  const { data, error } = await supabase.rpc("allocate_order_no", {
    p_order_type: normalizedOrderType
  });

  if (error) {
    throw error;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  const normalizedPayload = typeof payload === "string" ? JSON.parse(payload) : payload;

  if (!normalizedPayload || typeof normalizedPayload !== "object" || !normalizedPayload.order_no || !normalizedPayload.business_date) {
    throw new Error("Failed to allocate order number");
  }

  return {
    orderNo: normalizedPayload.order_no,
    orderType: normalizedPayload.order_type || normalizedOrderType,
    businessDate: normalizedPayload.business_date,
    prefix: normalizedPayload.prefix || ORDER_TYPE_PREFIXES[normalizedOrderType],
    sequence: normalizedPayload.sequence_no || null
  };
}

module.exports = {
  ORDER_TYPE_PREFIXES,
  normalizeOrderType,
  allocateOrderNumber
};
