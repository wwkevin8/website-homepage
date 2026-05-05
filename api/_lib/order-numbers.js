const ORDER_TYPE_PREFIXES = {
  pickup: "PU",
  storage: "ST",
  housing: "HS"
};

const STORAGE_SERVICE_PREFIXES = {
  box_delivery: "ST-B",
  storage_collection: "ST-C",
  storage_return: "ST-R"
};

const GROUP_ID_PREFIX = "GRP";
const GROUP_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

async function allocateStorageServiceOrderNumber(supabase, storageOrderType) {
  const normalizedStorageOrderType = String(storageOrderType || "").trim().toLowerCase();
  const prefix = STORAGE_SERVICE_PREFIXES[normalizedStorageOrderType];
  if (!prefix) {
    throw new Error(`Unsupported storage service order type: ${storageOrderType}`);
  }

  const baseIdentity = await allocateOrderNumber(supabase, "storage");
  const businessDateCode = String(baseIdentity.businessDate || "").replace(/-/g, "").slice(2);
  if (!businessDateCode || !baseIdentity.sequence) {
    throw new Error("Failed to allocate storage service order number");
  }

  return {
    ...baseIdentity,
    orderNo: `${prefix}-${businessDateCode}-${String(baseIdentity.sequence).padStart(4, "0")}`,
    orderType: normalizedStorageOrderType,
    prefix
  };
}

module.exports = {
  ORDER_TYPE_PREFIXES,
  STORAGE_SERVICE_PREFIXES,
  normalizeOrderType,
  allocateOrderNumber,
  allocateStorageServiceOrderNumber,
  async allocateGroupId(supabase) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit"
    });
    const [{ value: day }, , { value: month }, , { value: year }] = formatter.formatToParts(new Date());

    for (let attempt = 0; attempt < 20; attempt += 1) {
      let suffix = "";
      for (let index = 0; index < 4; index += 1) {
        suffix += GROUP_ID_ALPHABET[Math.floor(Math.random() * GROUP_ID_ALPHABET.length)];
      }
      const candidate = `${GROUP_ID_PREFIX}-${year}${month}${day}-${suffix}`;
      const { data, error } = await supabase
        .from("transport_groups")
        .select("group_id")
        .eq("group_id", candidate)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return candidate;
      }
    }

    throw new Error("Failed to allocate group id");
  }
};
