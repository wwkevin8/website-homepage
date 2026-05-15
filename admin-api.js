(function () {
  async function request(url, options) {
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        ...options
      });
    } catch (error) {
      const networkError = new Error("无法连接本地后台接口，请先运行 `npm run dev` 再登录。");
      networkError.cause = error;
      throw networkError;
    }

    const payload = await response.json().catch(() => ({
      data: null,
      error: { message: "服务器返回内容无效" }
    }));

    if (!response.ok) {
      const fallbackMessage = response.status === 404
        ? "后台接口不存在，请刷新页面后重试。"
        : "请求失败";
      const error = new Error(payload.error?.message || fallbackMessage);
      error.status = response.status;
      error.details = payload.error?.details || null;
      throw error;
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
    const output = search.toString();
    return output ? `?${output}` : "";
  }

  window.AdminApi = {
    login(username, password) {
      return request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
    },
    session() {
      return request("/api/admin/session");
    },
    changeOwnPassword(payload) {
      const body = JSON.stringify(payload);
      return request("/api/admin/me/change-password", {
        method: "POST",
        body
      }).catch(error => {
        if (error?.status !== 404) {
          throw error;
        }
        return request("/api/admin/login?admin_action=me%2Fchange-password", {
          method: "POST",
          body
        });
      });
    },
    logout() {
      return request("/api/admin/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    dashboard() {
      return request("/api/admin/dashboard");
    },
    listStorageOrders(filters) {
      return request(`/api/admin/storage-orders${buildQuery(filters)}`);
    },
    getStorageOrder(id) {
      return request(`/api/admin/storage-orders?id=${encodeURIComponent(id)}`);
    },
    deleteStorageOrder(id) {
      return request(`/api/admin/storage-orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    },
    updateStorageOrder(id, payload) {
      return request(`/api/admin/storage-orders?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    listOrders(filters) {
      return request(`/api/admin/orders${buildQuery(filters)}`);
    },
    getOrder(id) {
      return request(`/api/admin/orders/${id}`);
    },
    updateOrder(id, payload) {
      return request(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    addOrderNote(id, payload) {
      return request(`/api/admin/orders/${id}/notes`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    archiveOrder(id) {
      return request(`/api/admin/orders/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    unarchiveOrder(id) {
      return request(`/api/admin/orders/${id}/unarchive`, {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    runArchive(olderThanMonths) {
      return request("/api/admin/orders/archive/run", {
        method: "POST",
        body: JSON.stringify({ older_than_months: olderThanMonths })
      });
    },
    listUsers(filters) {
      return request(`/api/admin/users${buildQuery(filters)}`);
    },
    getUser(id) {
      return request(`/api/admin/users/${id}`);
    },
    listMemberships(filters) {
      return request(`/api/admin/memberships${buildQuery(filters)}`);
    },
    searchMembershipUsers(filters) {
      return request(`/api/admin/users${buildQuery(filters)}`);
    },
    grantMembership(payload) {
      return request("/api/admin/memberships", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    markMembershipClaimUsed(id, payload = {}) {
      return request("/api/admin/membership-claims", {
        method: "POST",
        body: JSON.stringify({ ...payload, claim_id: id, action: "mark-used" })
      });
    },
    cancelMembershipClaim(id, payload = {}) {
      return request("/api/admin/membership-claims", {
        method: "POST",
        body: JSON.stringify({ ...payload, claim_id: id, action: "cancel" })
      });
    },
    resetMembershipClaim(id, payload = {}) {
      return request("/api/admin/membership-claims", {
        method: "POST",
        body: JSON.stringify({ ...payload, claim_id: id, action: "reset" })
      });
    },
    deleteMembership(id) {
      return request(`/api/admin/memberships${buildQuery({ id })}`, {
        method: "DELETE"
      });
    },
    createMembershipClaim(payload = {}) {
      return request("/api/admin/membership-claims", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    listMembershipCodes(filters) {
      return request(`/api/admin/membership-codes${buildQuery(filters)}`);
    },
    createMembershipCode(payload) {
      return request("/api/admin/membership-codes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    deleteMembershipCode(id) {
      return request(`/api/admin/membership-codes${buildQuery({ id })}`, {
        method: "DELETE"
      });
    },
    listManagers(filters) {
      return request(`/api/admin/managers${buildQuery(filters)}`);
    },
    createManager(payload) {
      return request("/api/admin/managers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    updateManager(id, payload) {
      return request(`/api/admin/managers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    resetManagerPassword(id) {
      return request(`/api/admin/managers/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    deleteManager(id) {
      return request(`/api/admin/managers/${id}`, {
        method: "DELETE"
      });
    }
  };
})();
