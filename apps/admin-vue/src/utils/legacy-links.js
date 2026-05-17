function firstPresent(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function withQuery(path, query) {
  const searchParams = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      searchParams.set(key, value);
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function storageOrderDetailHref(order = {}, options = {}) {
  const id = firstPresent(order.id, order.storage_order_id, order.legacy_id, order.order_id);
  if (!id) {
    return "";
  }
  return withQuery("/admin-storage-detail.html", {
    id,
    return_to: options.returnTo
  });
}

export function transportRequestDetailHref(request = {}) {
  const id = firstPresent(request.id, request.request_id, request.transport_request_id, request.legacy_id);
  if (!id) {
    return "";
  }
  return withQuery("/transport-admin-request-edit.html", { id });
}

export function transportGroupDetailHref(group = {}) {
  const id = firstPresent(group.id, group.group_ref, group.group_id, group.legacy_id);
  if (!id) {
    return "";
  }
  return withQuery("/transport-admin-group-edit.html", { id });
}

export function orderCenterLegacyDetailHref(order = {}) {
  const source = String(order.source_table || order.source || "").toLowerCase();
  const serviceType = String(order.service_type || order.order_type || "").toLowerCase();
  const storageTypes = new Set(["storage", "box_order", "storage_collection", "storage_return"]);
  const transportTypes = new Set(["pickup", "dropoff", "transport", "airport_pickup", "airport_dropoff"]);

  if (source === "storage_orders" || storageTypes.has(serviceType) || serviceType.includes("storage")) {
    return storageOrderDetailHref(order);
  }

  if (source === "transport_requests" || transportTypes.has(serviceType) || serviceType.includes("transport")) {
    return transportRequestDetailHref(order);
  }

  return "";
}

export function membershipLegacyHref(item = {}, section = "") {
  return withQuery("/admin-memberships.html", {
    id: firstPresent(item.id, item.membership_id, item.claim?.id),
    user_id: firstPresent(item.user_id, item.user?.id, item.redeemed_by_user?.id),
    section
  });
}
