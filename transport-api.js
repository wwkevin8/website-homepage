(function () {
  async function request(url, options) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      ...options
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "Invalid server response" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "Request failed");
    }
    return payload.data;
  }

  function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, value);
      }
    });
    const text = search.toString();
    return text ? `?${text}` : "";
  }

  window.TransportApi = {
    login(password) {
      return request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
    },
    logout() {
      return request("/api/admin/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    session() {
      return request("/api/admin/session");
    },
    listRequests(filters) {
      return request(`/api/transport-requests${buildQuery(filters)}`);
    },
    getRequest(id) {
      return request(`/api/transport-requests/${id}`);
    },
    createRequest(payload) {
      return request("/api/transport-requests", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    updateRequest(id, payload) {
      return request(`/api/transport-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    listGroups(filters) {
      return request(`/api/transport-groups${buildQuery(filters)}`);
    },
    getGroup(id) {
      return request(`/api/transport-groups/${id}`);
    },
    createGroup(payload) {
      return request("/api/transport-groups", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    updateGroup(id, payload) {
      return request(`/api/transport-groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    saveGroupMembers(groupId, requestIds) {
      return request(`/api/transport-groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ request_ids: requestIds })
      });
    },
    removeGroupMember(memberId) {
      return request(`/api/transport-group-members/${memberId}`, {
        method: "DELETE"
      });
    },
    listPublicGroups(filters) {
      return request(`/api/public/transport-groups${buildQuery(filters)}`);
    }
  };
})();
