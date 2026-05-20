const STORAGE_BOX_CATALOG = {
  "1": { dailyRate: 0.7, buyPrice: 5, label: "1号箱" },
  "2": { dailyRate: 0.7, buyPrice: 5, label: "2号箱" },
  "3": { dailyRate: 0.6, buyPrice: 4, label: "3号箱" },
  "4": { dailyRate: 0.5, buyPrice: 3, label: "4号箱" },
  "5": { dailyRate: 0.4, buyPrice: 2, label: "5号箱" },
  "6": { dailyRate: 0.3, buyPrice: 1, label: "6号箱" }
};

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInteger(value, fallback = 0) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getStorageDays(startDate, endDate) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return 0;
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const diff = endMs - startMs;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / 86400000);
}

function getStorageDiscount(days) {
  if (days >= 200) return 0.35;
  if (days >= 100) return 0.4;
  if (days >= 75) return 0.45;
  if (days >= 60) return 0.5;
  if (days >= 45) return 0.6;
  if (days >= 35) return 0.7;
  if (days >= 25) return 0.8;
  if (days >= 15) return 0.9;
  return 1;
}

function getPickupAccessFee(accessType, boxCount, days) {
  if (accessType === "ground" || boxCount <= 0) return 0;
  if (days >= 100) return accessType === "elevator" ? 0 : boxCount * 2;
  return accessType === "elevator" ? boxCount * 2 : boxCount * 4;
}

function getReturnAccessFee(accessType, boxCount) {
  if (accessType === "ground" || boxCount <= 0) return 0;
  return accessType === "elevator" ? boxCount * 2 : boxCount * 4;
}

function accessTypeFromLift(upstairs, hasLift, fallback) {
  if (upstairs === undefined && hasLift === undefined) return fallback || "";
  if (upstairs === false || upstairs === "false" || upstairs === 0 || upstairs === "0") return "ground";
  if (hasLift === true || hasLift === "true" || hasLift === 1 || hasLift === "1") return "elevator";
  return "stairs";
}

function getBoxCountsFromSources(summary, snapshot, fallbackCount) {
  const counts = {};
  const items = Array.isArray(summary.items) ? summary.items : [];
  items.forEach(item => {
    const boxType = String(item.boxType || item.box_type || "").trim();
    if (!STORAGE_BOX_CATALOG[boxType]) return;
    counts[boxType] = Math.max(0, normalizeInteger(item.storageQty ?? item.storage_quantity, 0));
  });

  const snapshotCounts = snapshot.boxCounts || snapshot.box_counts || {};
  Object.keys(STORAGE_BOX_CATALOG).forEach(boxType => {
    if (counts[boxType] > 0) return;
    counts[boxType] = Math.max(0, normalizeInteger(snapshotCounts[boxType], 0));
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total <= 0 && fallbackCount > 0) {
    counts["1"] = fallbackCount;
  }
  return counts;
}

function getPurchaseCountsFromSources(summary, snapshot) {
  const counts = {};
  const items = Array.isArray(summary.items) ? summary.items : [];
  items.forEach(item => {
    const boxType = String(item.boxType || item.box_type || "").trim();
    if (!STORAGE_BOX_CATALOG[boxType]) return;
    counts[boxType] = Math.max(0, normalizeInteger(item.purchaseQty ?? item.purchase_quantity, 0));
  });

  const snapshotCounts = snapshot.purchaseCounts || snapshot.purchase_counts || {};
  Object.keys(STORAGE_BOX_CATALOG).forEach(boxType => {
    if (counts[boxType] > 0) return;
    counts[boxType] = Math.max(0, normalizeInteger(snapshotCounts[boxType], 0));
  });
  return counts;
}

function getWeightsFromSources(summary, snapshot) {
  const weights = {};
  const items = Array.isArray(summary.items) ? summary.items : [];
  items.forEach(item => {
    const boxType = String(item.boxType || item.box_type || "").trim();
    if (!STORAGE_BOX_CATALOG[boxType]) return;
    const weight = item.weight ?? item.maxWeight ?? item.max_weight;
    if (weight !== undefined && weight !== null && weight !== "") {
      weights[boxType] = normalizeInteger(weight, 0);
    }
  });

  const snapshotWeights = snapshot.boxWeights || snapshot.weights || snapshot.maxWeights || snapshot.max_weights || {};
  Object.keys(STORAGE_BOX_CATALOG).forEach(boxType => {
    if (weights[boxType] !== undefined) return;
    const weight = snapshotWeights[boxType];
    if (weight !== undefined && weight !== null && weight !== "") {
      weights[boxType] = normalizeInteger(weight, 0);
    }
  });
  return weights;
}

function rebalanceSingleQuantity(boxCounts, nextTotal) {
  const total = Object.values(boxCounts).reduce((sum, value) => sum + Math.max(0, value || 0), 0);
  const activeTypes = Object.entries(boxCounts)
    .filter(([, qty]) => Math.max(0, qty || 0) > 0)
    .map(([boxType]) => boxType);
  if (nextTotal === undefined || nextTotal === null) {
    return { boxCounts, changed: false, blockedReason: "" };
  }
  const quantity = Math.max(0, normalizeInteger(nextTotal, 0));
  if (activeTypes.length > 1 && quantity !== total) {
    return {
      boxCounts,
      changed: false,
      blockedReason: "multi_box_quantity_requires_breakdown"
    };
  }
  const targetType = activeTypes[0] || "1";
  return {
    boxCounts: { ...boxCounts, [targetType]: quantity },
    changed: quantity !== total,
    blockedReason: ""
  };
}

function calculateStorageEstimate({ boxCounts, purchaseCounts, boxWeights, startDate, endDate, boxDeliveryDate, pickupMethod, pickupAccessType, returnType, deliveryMethod, returnAccessType }) {
  const days = getStorageDays(startDate, endDate);
  const entries = Object.entries(STORAGE_BOX_CATALOG);
  const totalBoxes = Object.values(boxCounts).reduce((sum, value) => sum + Math.max(0, normalizeInteger(value, 0)), 0);
  const totalPurchaseBoxes = Object.values(purchaseCounts).reduce((sum, value) => sum + Math.max(0, normalizeInteger(value, 0)), 0);
  const discount = getStorageDiscount(days);
  let rawStorageTotal = 0;
  let purchaseTotal = 0;
  let overweightFee = 0;

  const items = entries.map(([boxType, boxInfo]) => {
    const storageQty = Math.max(0, normalizeInteger(boxCounts[boxType], 0));
    const purchaseQty = Math.max(0, normalizeInteger(purchaseCounts[boxType], 0));
    const weightValue = boxWeights[boxType];
    const weight = weightValue === undefined || weightValue === null || weightValue === "" ? null : Math.max(0, normalizeInteger(weightValue, 0));
    const rawStorage = storageQty * boxInfo.dailyRate * days;
    const purchase = purchaseQty * boxInfo.buyPrice;
    const itemOverweightFee = storageQty > 0 && weight !== null && weight >= 25 && weight <= 30
      ? storageQty * Math.ceil(days / 7) * 0.5
      : 0;
    rawStorageTotal += rawStorage;
    purchaseTotal += purchase;
    overweightFee += itemOverweightFee;
    return {
      boxType,
      label: boxInfo.label,
      storageQty,
      purchaseQty,
      weight,
      rawStorage,
      purchase,
      overweightFee: itemOverweightFee
    };
  }).filter(item => item.storageQty > 0 || item.purchaseQty > 0);

  const discountedBase = rawStorageTotal * discount;
  const pickupAccessFee = pickupMethod === "home" ? getPickupAccessFee(pickupAccessType, totalBoxes, days) : 0;
  const returnAccessFee = returnType === "local" && deliveryMethod === "home" ? getReturnAccessFee(returnAccessType, totalBoxes) : 0;
  let pickup = 0;
  let delivery = 0;
  let minimumAdjustment = 0;
  let total = 0;

  if (days <= 0 || totalBoxes <= 0) {
    total = purchaseTotal;
  } else if (days <= 30) {
    pickup = pickupMethod === "home" ? totalBoxes * 2 : 0;
    delivery = returnType === "local" && deliveryMethod === "home" ? totalBoxes * 2 : 0;
    const minimum = totalBoxes === 1 ? 20 : 30;
    const adjustedBase = Math.max(discountedBase, minimum);
    minimumAdjustment = adjustedBase - discountedBase;
    total = adjustedBase + purchaseTotal + pickup + delivery + pickupAccessFee + returnAccessFee + overweightFee;
  } else {
    total = discountedBase + purchaseTotal + pickupAccessFee + returnAccessFee + overweightFee;
  }

  return {
    days,
    totalBoxes,
    totalPurchaseBoxes,
    items,
    rawStorageTotal,
    discount,
    discountedBase,
    pickup,
    delivery,
    pickupAccessFee,
    returnAccessFee,
    overweightFee,
    purchaseTotal,
    minimumAdjustment,
    total,
    estimatedTotalPrice: total,
    startDate,
    endDate,
    boxDeliveryDate,
    pickupMethod,
    pickupAccessType,
    returnType,
    deliveryMethod,
    returnAccessType
  };
}

function recalculateStorageOrderPricing(existing, patch = {}) {
  const summary = parseJsonObject(existing.estimate_summary_json);
  const snapshot = parseJsonObject(existing.calculator_snapshot_json);
  const serviceDetails = parseJsonObject(existing.customer_form_json).serviceDetails || {};
  const nextCount = patch.estimated_box_count ?? patch.storage_quantity;
  const orderType = patch.order_type || existing.order_type;
  const isBoxOrder = orderType === "box_order"
    || orderType === "box_delivery"
    || Boolean(existing.box_order_no)
    || String(existing.order_no || "").toUpperCase().startsWith("ST-B");
  const fallbackCount = normalizeInteger(existing.estimated_box_count ?? serviceDetails.storageBoxCount ?? summary.totalBoxes, 0);
  const baseCounts = getBoxCountsFromSources(summary, snapshot, fallbackCount);
  const basePurchaseCounts = getPurchaseCountsFromSources(summary, snapshot);
  const rebalancedStorage = isBoxOrder
    ? { boxCounts: baseCounts, changed: false, blockedReason: "" }
    : rebalanceSingleQuantity(baseCounts, nextCount);
  const rebalancedPurchase = isBoxOrder
    ? rebalanceSingleQuantity(basePurchaseCounts, nextCount)
    : { boxCounts: basePurchaseCounts, changed: false, blockedReason: "" };
  if (rebalancedStorage.blockedReason || rebalancedPurchase.blockedReason) {
    return { ok: false, reason: rebalancedStorage.blockedReason || rebalancedPurchase.blockedReason };
  }

  const startDate = normalizeDate(patch.storage_start_date ?? patch.storage_intake_date ?? existing.storage_start_date ?? existing.storage_intake_date ?? summary.startDate ?? serviceDetails.serviceDate);
  const endDate = normalizeDate(patch.storage_end_date ?? patch.expected_storage_end_date ?? existing.storage_end_date ?? existing.expected_storage_end_date ?? summary.endDate ?? serviceDetails.expectedStorageEndDate);
  const boxDeliveryDate = normalizeDate(patch.box_delivery_date ?? existing.box_delivery_date ?? summary.boxDeliveryDate ?? serviceDetails.boxDeliveryDate);
  const pickupAccessType = accessTypeFromLift(
    patch.needs_upstairs ?? existing.needs_upstairs,
    patch.has_lift ?? existing.has_lift,
    summary.pickupAccessType || serviceDetails.pickupAccessType
  );
  const returnAccessType = accessTypeFromLift(
    patch.needs_upstairs ?? existing.needs_upstairs,
    patch.has_lift ?? existing.has_lift,
    summary.returnAccessType || serviceDetails.returnAccessType
  );

  const estimate = calculateStorageEstimate({
    boxCounts: rebalancedStorage.boxCounts,
    purchaseCounts: rebalancedPurchase.boxCounts,
    boxWeights: getWeightsFromSources(summary, snapshot),
    startDate,
    endDate,
    boxDeliveryDate,
    pickupMethod: summary.pickupMethod || serviceDetails.pickupMethod || (orderType === "storage_return" ? "self" : "home"),
    pickupAccessType,
    returnType: summary.returnType || serviceDetails.returnType || "local",
    deliveryMethod: summary.deliveryMethod || serviceDetails.deliveryMethod || (orderType === "storage_return" ? "home" : "self"),
    returnAccessType
  });
  const effectiveCount = isBoxOrder ? estimate.totalPurchaseBoxes : estimate.totalBoxes;
  const purchasedBoxes = estimate.items
    .filter(item => item.purchaseQty > 0)
    .map(item => ({
      boxType: item.boxType,
      label: item.label,
      quantity: item.purchaseQty,
      subtotal: Number(item.purchase.toFixed(2))
    }));

  const resultPatch = {
    estimated_box_count: effectiveCount,
    estimated_total_price: Number(estimate.estimatedTotalPrice.toFixed(2)),
    estimate_summary_json: {
      ...summary,
      ...estimate,
      items: estimate.items.map(item => ({
        boxType: item.boxType,
        label: item.label,
        storageQty: item.storageQty,
        purchaseQty: item.purchaseQty,
        weight: item.weight,
        rawStorage: Number(item.rawStorage.toFixed(2)),
        purchase: Number(item.purchase.toFixed(2)),
        overweightFee: Number(item.overweightFee.toFixed(2))
      }))
    }
  };
  if (isBoxOrder) {
    resultPatch.purchased_boxes = purchasedBoxes;
  }

  return {
    ok: true,
    patch: resultPatch
  };
}

module.exports = {
  recalculateStorageOrderPricing
};
