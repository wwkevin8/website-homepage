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
      error: { message: "\u670d\u52a1\u5668\u8fd4\u56de\u5185\u5bb9\u65e0\u6548" }
    }));

    if (!response.ok) {
      const error = new Error(payload.error?.message || "\u8bf7\u6c42\u5931\u8d25");
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
      return request("/api/admin/me/change-password", {
        method: "POST",
        body: JSON.stringify(payload)
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
