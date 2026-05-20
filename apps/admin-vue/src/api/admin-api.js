const JSON_HEADERS = {
  Accept: "application/json"
};

function unwrapApiBody(body) {
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }
  return body;
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
    const error = new Error(body?.message || body?.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return unwrapApiBody(body);
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

export function fetchTransportRequest(id) {
  return request(`/api/transport-requests/${encodeURIComponent(id)}`);
}

export function fetchTransportGroups(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/transport-groups${query ? `?${query}` : ""}`);
}

export function fetchTransportGroup(id) {
  return request(`/api/transport-groups/${encodeURIComponent(id)}`);
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

export function fetchStorageOrder(id) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);
  return request(`/api/admin/storage-orders?${searchParams.toString()}`);
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
