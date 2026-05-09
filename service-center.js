(function () {
  function resolveUrl(path) {
    if (window.location.protocol === "file:") {
      return `http://localhost:3000${path}`;
    }
    return path;
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(parsed);
  }

  function getStatusLabel(status) {
    if (status === "matched") {
      return "客服跟进中";
    }
    if (status === "closed") {
      return "已关闭";
    }
    return "已发布";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getServiceLabel(serviceType) {
    return serviceType === "dropoff" ? "送机" : "接机";
  }

  function getStorageOrderTypeLabel(orderType) {
    const labels = {
      box_delivery: "买箱子订单",
      storage_collection: "送寄存订单",
      storage_return: "取寄存订单",
      storage: "更新前订单"
    };
    return labels[orderType] || "寄存订单";
  }

  function formatCurrencyGbp(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "-";
    }
    return `£${amount.toFixed(2)}`;
  }

  function buildRequestDetailMarkup(item) {
    return `
      <div class="service-center-detail-grid">
        <article class="service-center-detail-field">
          <strong>拼车组编号</strong>
          <span>${escapeHtml(item.group_id || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>订单编号</strong>
          <span>${escapeHtml(item.order_no || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>状态</strong>
          <span>${escapeHtml(getStatusLabel(item.status))}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>服务类型</strong>
          <span>${escapeHtml(getServiceLabel(item.service_type))}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>机场</strong>
          <span>${escapeHtml(item.airport_name || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>航站楼</strong>
          <span>${escapeHtml(item.terminal || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>航班号</strong>
          <span>${escapeHtml(item.flight_no || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>时间</strong>
          <span>${escapeHtml(formatDateTime(item.flight_datetime))}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>目前拼车人数</strong>
          <span>${escapeHtml(item.current_passenger_count || item.passenger_count || "-")}</span>
        </article>
        <article class="service-center-detail-field">
          <strong>当前每人价格</strong>
          <span>${escapeHtml(formatCurrencyGbp(item.current_average_price_gbp))}</span>
        </article>
        <article class="service-center-detail-field service-center-detail-field-wide">
          <strong>出发地</strong>
          <span>${escapeHtml(item.location_from || "-")}</span>
        </article>
        <article class="service-center-detail-field service-center-detail-field-wide">
          <strong>目的地</strong>
          <span>${escapeHtml(item.location_to || "-")}</span>
        </article>
        <article class="service-center-detail-field service-center-detail-field-wide">
          <strong>备注</strong>
          <span>${escapeHtml(item.notes || "-")}</span>
        </article>
      </div>
    `;
  }

  async function fetchMyRequests() {
    const response = await fetch(resolveUrl("/api/public/my-transport-requests"), {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "加载预约失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "加载预约失败");
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }

  async function fetchMyStorageOrders() {
    const response = await fetch(resolveUrl("/api/public/my-storage-orders?scope=all"), {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "寄存订单加载失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "寄存订单加载失败");
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }

  function renderPickupCard(requests) {
    const titleNode = document.querySelector("[data-service-center-pickup-title]");
    const copyNode = document.querySelector("[data-service-center-pickup-copy]");
    const cardNode = document.querySelector("[data-service-center-pickup-card]");
    if (!titleNode || !copyNode) {
      return;
    }

    const activePickup = requests.find(item => item.service_type === "pickup" && item.status !== "closed");
    if (!activePickup) {
      titleNode.textContent = "当前无接机预约";
      copyNode.textContent = "需要时可直接发起。";
      if (cardNode) {
        cardNode.removeAttribute("data-request-detail");
        cardNode.classList.remove("service-center-card-clickable");
      }
      return;
    }

    titleNode.textContent = `${activePickup.group_id || activePickup.order_no || "接机拼车组"} · ${getStatusLabel(activePickup.status)}`;
    copyNode.textContent = `${activePickup.airport_name || "-"} ${activePickup.terminal || ""} · ${formatDateTime(activePickup.flight_datetime)}`;
    if (cardNode) {
      cardNode.dataset.requestDetail = encodeURIComponent(JSON.stringify(activePickup));
      cardNode.classList.add("service-center-card-clickable");
    }
  }

  function renderStorageCard(storageOrders) {
    const titleNode = document.querySelector("[data-service-center-storage-title]");
    const copyNode = document.querySelector("[data-service-center-storage-copy]");
    const cardNode = document.querySelector("[data-service-center-storage-card]");
    if (!titleNode || !copyNode) {
      return;
    }

    const latestStorage = storageOrders[0] || null;
    if (!latestStorage) {
      titleNode.textContent = "当前无寄存预约";
      copyNode.textContent = "需要时可直接发起。";
      if (cardNode) {
        cardNode.removeAttribute("data-request-detail");
        cardNode.classList.remove("service-center-card-clickable");
      }
      return;
    }

    titleNode.textContent = `${latestStorage.orderNo || "寄存订单"} · ${getStorageOrderTypeLabel(latestStorage.orderType)}`;
    copyNode.textContent = `${latestStorage.serviceDate || "-"} ${latestStorage.serviceTimeSlot || ""} · ${latestStorage.status || "pending_confirmation"}`;
    if (cardNode) {
      cardNode.dataset.requestDetail = encodeURIComponent(JSON.stringify({
        ...latestStorage,
        recordKind: "storage"
      }));
      cardNode.classList.add("service-center-card-clickable");
    }
  }

  function buildStorageDetailMarkup(item) {
    return `
      <div class="service-center-detail-grid">
        <article class="service-center-detail-field"><strong>User ID</strong><span>${escapeHtml(item.publicUserId || "-")}</span></article>
        <article class="service-center-detail-field"><strong>订单编号</strong><span>${escapeHtml(item.orderNo || "-")}</span></article>
        <article class="service-center-detail-field"><strong>服务类型</strong><span>${escapeHtml(getStorageOrderTypeLabel(item.orderType))}</span></article>
        <article class="service-center-detail-field"><strong>状态</strong><span>${escapeHtml(item.status || "-")}</span></article>
        <article class="service-center-detail-field"><strong>服务日期</strong><span>${escapeHtml(item.serviceDate || "-")}</span></article>
        <article class="service-center-detail-field"><strong>时间段</strong><span>${escapeHtml(item.serviceTimeSlot || "-")}</span></article>
        <article class="service-center-detail-field"><strong>箱数 / 数量</strong><span>${escapeHtml(item.estimatedBoxCount || "-")}</span></article>
        <article class="service-center-detail-field"><strong>预计结束日期</strong><span>${escapeHtml(item.expectedStorageEndDate || "-")}</span></article>
        <article class="service-center-detail-field service-center-detail-field-wide"><strong>地址</strong><span>${escapeHtml(item.addressFull || "-")}</span></article>
      </div>
    `;
  }

  function renderRecords(requests) {
    const emptyNode = document.querySelector("[data-service-center-records-empty]");
    const listNode = document.querySelector("[data-service-center-records-list]");
    if (!emptyNode || !listNode) {
      return;
    }

    if (!requests.length) {
      emptyNode.hidden = false;
      listNode.hidden = true;
      listNode.innerHTML = "";
      return;
    }

    emptyNode.hidden = true;
    listNode.hidden = false;
    listNode.innerHTML = requests.slice(0, 5).map(item => `
      <article class="service-center-task service-center-task-clickable" data-request-detail="${encodeURIComponent(JSON.stringify(item))}">
        <div>
          <h3>${item.group_id || item.order_no || "预约记录"} · ${getStatusLabel(item.status)}</h3>
          <p>${item.service_type === "pickup" ? "接机" : "送机"} · ${item.airport_name || "-"} ${item.terminal || ""} · ${formatDateTime(item.flight_datetime)}</p>
        </div>
        <button class="button button-secondary" type="button">查看详情</button>
      </article>
    `).join("");
  }

  function renderAllRecords(requests, storageOrders = []) {
    const emptyNode = document.querySelector("[data-service-center-records-empty]");
    const listNode = document.querySelector("[data-service-center-records-list]");
    if (!emptyNode || !listNode) {
      return;
    }

    const records = [
      ...storageOrders.map(item => ({ ...item, recordKind: "storage", sortTime: item.createdAt || "" })),
      ...requests.map(item => ({ ...item, recordKind: "transport", sortTime: item.created_at || item.createdAt || "" }))
    ].sort((a, b) => String(b.sortTime || "").localeCompare(String(a.sortTime || "")));

    if (!records.length) {
      emptyNode.hidden = false;
      listNode.hidden = true;
      listNode.innerHTML = "";
      return;
    }

    emptyNode.hidden = true;
    listNode.hidden = false;
    listNode.innerHTML = records.slice(0, 8).map(item => `
      <article class="service-center-task service-center-task-clickable" data-request-detail="${encodeURIComponent(JSON.stringify(item))}">
        <div>
          <h3>${escapeHtml(item.orderNo || item.group_id || item.order_no || "预约记录")} · ${escapeHtml(item.recordKind === "storage" ? getStorageOrderTypeLabel(item.orderType) : getStatusLabel(item.status))}</h3>
          <p>${escapeHtml(item.recordKind === "storage" ? `${item.serviceDate || "-"} ${item.serviceTimeSlot || ""}` : `${item.service_type === "pickup" ? "接机" : "送机"} · ${item.airport_name || "-"} ${item.terminal || ""} · ${formatDateTime(item.flight_datetime)}`)}</p>
        </div>
        <button class="button button-secondary" type="button">查看详情</button>
      </article>
    `).join("");
  }

  function bindDetailModal() {
    const modal = document.querySelector("#serviceCenterDetailModal");
    const modalBody = document.querySelector("#serviceCenterDetailBody");
    const closeButton = document.querySelector("#serviceCenterDetailClose");

    if (!modal || !modalBody) {
      return;
    }

    const closeModal = () => {
      modal.hidden = true;
      document.body.classList.remove("pickup-help-modal-open");
    };

    const openModal = request => {
      modalBody.innerHTML = request.recordKind === "storage"
        ? buildStorageDetailMarkup(request)
        : buildRequestDetailMarkup(request);
      modal.hidden = false;
      document.body.classList.add("pickup-help-modal-open");
    };

    closeButton?.addEventListener("click", closeModal);
    modal.addEventListener("click", event => {
      if (event.target.hasAttribute("data-service-center-detail-close")) {
        closeModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal.hidden) {
        closeModal();
      }
    });

    document.addEventListener("click", event => {
      const trigger = event.target.closest("[data-request-detail]");
      if (!trigger) {
        return;
      }

      const payload = String(trigger.dataset.requestDetail || "").trim();
      if (!payload) {
        return;
      }

      try {
        openModal(JSON.parse(decodeURIComponent(payload)));
      } catch (error) {
        console.error("[service-center] invalid request detail payload", error);
      }
    });
  }

  function patchServiceLinks() {
    const primaryActions = document.querySelectorAll(".service-center-primary-actions a");
    if (primaryActions[0]) {
      primaryActions[0].setAttribute("href", "./pickup");
      primaryActions[0].textContent = "查看接机服务";
    }
    if (primaryActions[1]) {
      primaryActions[1].setAttribute("href", "./storage");
      primaryActions[1].textContent = "查看寄存服务";
    }

    document.querySelectorAll(".service-center-link-item").forEach(link => {
      const href = link.getAttribute("href") || "";
      const titleNode = link.querySelector("strong");
      const copyNode = link.querySelector("p");
      const ctaNode = link.querySelector("span:last-child");
      if (!titleNode || !copyNode) return;

      if (href.includes("pickup-form")) {
        link.setAttribute("href", "./pickup");
        titleNode.innerHTML = '<span class="service-center-link-icon" aria-hidden="true">✈</span>接机服务';
        copyNode.textContent = "查看接机流程、拼车说明与服务安排，再决定是否继续填写预约。";
        if (ctaNode) ctaNode.textContent = "前往";
      }

      if (href.includes("storage-booking")) {
        link.setAttribute("href", "./storage");
        titleNode.innerHTML = '<span class="service-center-link-icon" aria-hidden="true">📦</span>寄存服务';
        copyNode.textContent = "先查看寄存价格、流程和注意事项，再进入后续预约或估价流程。";
        if (ctaNode) ctaNode.textContent = "前往";
      }
    });
  }

  async function initServiceCenter() {
    if (!document.body || document.body.dataset.requireAuthPage !== "true") {
      return;
    }

    try {
      patchServiceLinks();
      const [requests, storageOrders] = await Promise.all([
        fetchMyRequests(),
        fetchMyStorageOrders()
      ]);
      renderPickupCard(requests);
      renderStorageCard(storageOrders);
      renderAllRecords(requests, storageOrders);
      bindDetailModal();
    } catch (error) {
      console.error("[service-center] failed to load requests", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initServiceCenter);
  } else {
    initServiceCenter();
  }
})();
