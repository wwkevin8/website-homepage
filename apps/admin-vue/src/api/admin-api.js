const JSON_HEADERS = {
  Accept: "application/json"
};

function unwrapApiBody(body) {
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }
  return body;
}

function extractApiErrorMessage(body, fallback) {
  if (!body || typeof body !== "object") {
    return fallback;
  }
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  if (body.error && typeof body.error === "object") {
    if (typeof body.error.message === "string" && body.error.message.trim()) {
      return body.error.message;
    }
    if (typeof body.error.details === "string" && body.error.details.trim()) {
      return body.error.details;
    }
  }
  return fallback;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...JSON_HEADERS,
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const error = new Error(extractApiErrorMessage(body, `Request failed with ${response.status}`));
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return unwrapApiBody(body);
}

async function requestBlob(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/vnd.ms-excel,application/octet-stream,application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    const error = new Error(extractApiErrorMessage(body, `Request failed with ${response.status}`));
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return {
    blob: await response.blob(),
    filename: parseContentDispositionFilename(response.headers.get("content-disposition"))
  };
}

function parseContentDispositionFilename(value = "") {
  const utf8Match = String(value).match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const asciiMatch = String(value).match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || "";
}

export function fetchAdminSession() {
  return request("/api/admin/session");
}

export function fetchDashboard() {
  return request("/api/admin/dashboard");
}

export function fetchOrders(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/orders${query ? `?${query}` : ""}`);
}

export function bulkSetOrdersOfflineRecorded(items = [], offlineRecorded = true) {
  return request("/api/admin/orders", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "set_offline_recorded",
      items,
      offline_recorded: offlineRecorded
    })
  });
}

export function fetchOrder(id) {
  return request(`/api/admin/orders/${encodeURIComponent(id)}`);
}

export function fetchUsers(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/users${query ? `?${query}` : ""}`);
}

export function fetchManagers(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/managers${query ? `?${query}` : ""}`);
}

export function createManager(payload = {}) {
  return request("/api/admin/managers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function updateManager(id, payload = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/managers?${searchParams.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function resetManagerPassword(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  searchParams.set("manager_action", "reset-password");
  return request(`/api/admin/managers?${searchParams.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
}

export function deleteManager(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/managers?${searchParams.toString()}`, {
    method: "DELETE"
  });
}

export function fetchTransportRequests(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/transport-requests${query ? `?${query}` : ""}`);
}

export function previewTransportManualImport(rows = []) {
  return request("/api/transport-manual-import/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rows })
  });
}

export function commitTransportManualImport(rows = [], confirmedWarnings = {}) {
  return request("/api/transport-manual-import/commit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rows,
      confirmed_warnings: confirmedWarnings
    })
  });
}

export function createManualTransportRequest(row = {}, confirmWarnings = false, groupOptions = {}) {
  return request("/api/transport-manual-import/manual", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      row,
      confirm_warnings: confirmWarnings,
      group_action: groupOptions.group_action || "create_single",
      target_group_id: groupOptions.target_group_id || ""
    })
  });
}

export function fetchTransportRequest(id) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}`);
}

export function updateTransportRequest(id, payload = {}) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function updateTransportRequestSafeFields(id, payload = {}) {
  return updateTransportRequest(id, {
    action: "update_safe_fields",
    ...payload
  });
}

export function previewTransportOrderChange(id, payload = {}) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}/change-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function confirmTransportOrderChange(id, payload = {}) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}/change-confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function fetchTransportRequestGroupCandidates(id) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}/group`);
}

export function updateTransportRequestGroup(id, payload = {}) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}/group`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function deleteTransportRequest(id) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function bulkSetTransportRequestsOfflineRecorded(ids = [], offlineRecorded = true) {
  return request("/api/transport-requests", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "set_offline_recorded",
      ids,
      offline_recorded: offlineRecorded
    })
  });
}

export function exportTransportRequests(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return requestBlob(`/api/transport-requests/export${query ? `?${query}` : ""}`);
}

export function fetchTransportGroups(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/transport-groups${query ? `?${query}` : ""}`);
}

export function fetchTransportGroup(id) {
  return request(`/api/transport-groups/${encodeURIComponent(id)}`);
}

export function updateTransportGroup(id, payload = {}) {
  return request(`/api/transport-groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function deleteTransportGroup(id) {
  return request(`/api/transport-groups/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function saveTransportGroupMembers(groupId, requestIds = []) {
  return request(`/api/transport-groups/${encodeURIComponent(groupId)}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      request_ids: requestIds
    })
  });
}

export function fetchTransportSyncLogs(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/transport-sync-audit-logs${query ? `?${query}` : ""}`);
}

export function fetchStorageSyncLogs(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/storage-sync-audit-logs${query ? `?${query}` : ""}`);
}

export function runStorageSyncAudit(options = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/run-storage-sync-audit${query ? `?${query}` : ""}`, {
    method: "POST"
  });
}

export function fetchStorageOrders(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/storage-orders${query ? `?${query}` : ""}`);
}

export function fetchPostageOrders(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/postage-orders${query ? `?${query}` : ""}`);
}

export function fetchPostageOrder(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/postage-orders?${searchParams.toString()}`);
}

export function updatePostageOrder(id, payload = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/postage-orders?${searchParams.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function fetchStorageOrder(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/storage-orders?${searchParams.toString()}`);
}

export function updateStorageOrder(id, payload = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/storage-orders?${searchParams.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function bulkSetStorageOrdersOfflineRecorded(ids = [], offlineRecorded = true) {
  return request("/api/admin/storage-orders", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "set_offline_recorded",
      ids,
      offline_recorded: offlineRecorded
    })
  });
}

export function exportStorageOrders(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return requestBlob(`/api/admin/storage-orders-export${query ? `?${query}` : ""}`);
}

export function deleteStorageOrder(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/storage-orders?${searchParams.toString()}`, {
    method: "DELETE"
  });
}

export function fetchMemberships(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/memberships${query ? `?${query}` : ""}`);
}

export function fetchMembershipAdvisors() {
  return request("/api/admin/memberships?view=advisors");
}

export function grantMembership(payload = {}) {
  return request("/api/admin/memberships", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function deleteMembership(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/memberships?${searchParams.toString()}`, {
    method: "DELETE"
  });
}

export function createMembershipClaim(payload = {}) {
  return request("/api/admin/membership-claims", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function updateMembershipClaim(id, action, payload = {}) {
  return request("/api/admin/membership-claims", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      claim_id: id,
      action
    })
  });
}

export function fetchMembershipCodes(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/membership-codes${query ? `?${query}` : ""}`);
}

export function fetchMembershipBirthdays(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/membership-birthdays${query ? `?${query}` : ""}`);
}

export function createMembershipCode(payload = {}) {
  return request("/api/admin/membership-codes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function deleteMembershipCode(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/membership-codes?${searchParams.toString()}`, {
    method: "DELETE"
  });
}

export function fetchCommunityPosts(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/community-posts${query ? `?${query}` : ""}`);
}

export function fetchCommunityPostDetail(postId) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", postId);
  return request(`/api/admin/community-posts?${searchParams.toString()}`);
}

export function fetchCommunityComments(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/admin/community-comments${query ? `?${query}` : ""}`);
}

export function logoutAdmin() {
  return request("/api/admin/logout", {
    method: "POST"
  });
}
