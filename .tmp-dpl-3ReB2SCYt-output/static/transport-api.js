(function () {
  const ERROR_MESSAGE_MAP = {
    "request service_type must match group service_type": "当前订单的服务类型与目标拼车组不一致，接机单和送机单不能混加。",
    "request airport_code must match group airport_code": "当前订单的机场与目标拼车组不一致，无法加入该拼车组。",
    "selected members exceed max_passengers": "所选成员加入后会超过拼车组人数上限。",
    "group not found": "未找到目标拼车组。"
  };

  function resolveUrl(url) {
    if (/^https?:\/\//.test(url)) {
      return url;
    }
    if (window.location.protocol === "file:") {
      return `http://localhost:3000${url}`;
    }
    return url;
  }

  function translateErrorMessage(message) {
    const text = String(message || "").trim();
    return ERROR_MESSAGE_MAP[text] || text || "请求失败";
  }

  async function request(url, options) {
    let response;
    try {
      response = await fetch(resolveUrl(url), {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        ...options
      });
    } catch (error) {
      if (window.location.protocol === "file:") {
        throw new Error("本地预览请先运行 `npm run dev`，再刷新当前页面。");
      }
      throw error;
    }

    const payload = await response.json().catch(() => ({ data: null, error: { message: "Invalid server response" } }));
    if (!response.ok) {
      throw new Error(translateErrorMessage(payload.error?.message || "Request failed"));
    }
    return payload.data;
  }

  async function download(url, suggestedFilename) {
    let response;
    try {
      response = await fetch(resolveUrl(url), {
        credentials: "include"
      });
    } catch (error) {
      if (window.location.protocol === "file:") {
        throw new Error("本地预览请先运行 `npm run dev`，再刷新当前页面。");
      }
      throw error;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: { message: "Request failed" } }));
      throw new Error(translateErrorMessage(payload.error?.message || "Request failed"));
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
    const filename = decodeURIComponent(match?.[1] || match?.[2] || suggestedFilename || "download.xlsx");
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
    return filename;
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
      return Promise.reject(new Error("Use the site login flow instead of a shared admin password."));
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
    downloadRequestsExcel(filters) {
      return download(`/api/transport-requests/export${buildQuery(filters)}`, "transport-requests.xlsx");
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
    recreateRequest(id) {
      return request(`/api/transport-requests/${id}/recreate`, {
        method: "POST",
        body: JSON.stringify({})
      });
    },
    deleteRequest(id) {
      return request(`/api/transport-requests/${id}`, {
        method: "DELETE"
      });
    },
    listGroups(filters) {
      return request(`/api/transport-groups${buildQuery(filters)}`);
    },
    listSyncAuditLogs(filters) {
      return request(`/api/transport-sync-audit-logs${buildQuery(filters)}`);
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
    deleteGroup(id) {
      return request(`/api/transport-groups/${id}`, {
        method: "DELETE"
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
    },
    listPublicBoard(filters) {
      return request(`/api/public/transport-board${buildQuery(filters)}`);
    },
    previewJoinPickup(payload) {
      return request("/api/public/transport-join-preview", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    submitJoinPickup(payload) {
      return request("/api/public/transport-join-submit", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  };
})();
