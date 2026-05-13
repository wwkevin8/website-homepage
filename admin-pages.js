(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  let currentSession = null;

  const storageTypeLabels = {
    box_delivery: "买箱子订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单",
    storage: "寄存订单"
  };

  const storageTypeShortLabels = {
    box_delivery: "买箱",
    storage_collection: "取寄存",
    storage_return: "送寄存",
    storage: "旧单"
  };

  function resolveStorageOrderType(item = {}) {
    const originalOrderType = item.customer_form_json?.originalOrderType || item.customer_form_json?.orderType || "";
    const serviceFlags = item.service_flags_json || {};
    const serviceLabel = `${item.service_label || ""} ${item.final_readable_message || ""}`;
    if (item.order_type === "box_delivery" || item.order_type === "storage_collection" || item.order_type === "storage_return") {
      return item.order_type;
    }
    if (originalOrderType === "box_delivery" || serviceFlags.box_delivery || serviceLabel.includes("买箱")) {
      return "box_delivery";
    }
    if (originalOrderType === "storage_collection" || serviceFlags.storage_collection || serviceLabel.includes("取寄存") || serviceLabel.includes("入仓")) {
      return "storage_collection";
    }
    if (originalOrderType === "storage_return" || serviceFlags.storage_return || serviceLabel.includes("送寄存") || serviceLabel.includes("送回") || serviceLabel.includes("取回")) {
      return "storage_return";
    }
    return item.order_type || "storage";
  }

  function getStorageReturnHistoryCheck(item = {}) {
    return item.customer_form_json?.storage_return_history_check || null;
  }

  function needsStorageReturnHistoryWarning(item = {}) {
    return resolveStorageOrderType(item) === "storage_return" && getStorageReturnHistoryCheck(item)?.matched === false;
  }

  function storageServiceTime(item = {}) {
    if (item.service_time_slot) {
      return item.service_time_slot;
    }
    if (item.service_time === "evening") {
      return "晚上";
    }
    if (item.service_time === "daytime") {
      return "白天";
    }
    return item.service_time || "--";
  }

  function getStorageFormDetails(item = {}) {
    const formJson = item.customer_form_json || {};
    return formJson.serviceDetails || formJson.service_details || {};
  }

  function storageApartmentName(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(
      item.room_or_building,
      serviceDetails.roomOrBuilding,
      serviceDetails.room_or_building,
      serviceDetails.apartmentName,
      serviceDetails.apartment_name,
      serviceDetails.buildingName,
      serviceDetails.building_name,
      item.customer_form_json?.roomOrBuilding,
      item.customer_form_json?.room_or_building
    ) || "--";
  }

  function storagePostcodeValue(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(
      item.postcode,
      serviceDetails.postcode,
      serviceDetails.postCode,
      serviceDetails.post_code,
      item.customer_form_json?.postcode,
      item.customer_form_json?.postCode,
      item.customer_form_json?.post_code
    ) || "--";
  }

  function storageEstimateSummary(item = {}) {
    return item.estimate_summary_json || {};
  }

  function storagePurchasedBoxes(item = {}) {
    if (Array.isArray(item.purchased_boxes) && item.purchased_boxes.length) {
      return item.purchased_boxes;
    }
    const serviceDetails = getStorageFormDetails(item);
    if (Array.isArray(serviceDetails.purchaseItems) && serviceDetails.purchaseItems.length) {
      return serviceDetails.purchaseItems;
    }
    const summaryItems = Array.isArray(storageEstimateSummary(item).items) ? storageEstimateSummary(item).items : [];
    return summaryItems
      .filter(entry => Number(entry.purchaseQty || entry.purchase_quantity || 0) > 0)
      .map(entry => ({
        boxType: entry.boxType || entry.box_type,
        label: entry.label,
        quantity: entry.purchaseQty || entry.purchase_quantity,
        subtotal: entry.purchase || entry.subtotal
      }));
  }

  function storagePurchaseQuantity(item = {}) {
    const boxes = storagePurchasedBoxes(item);
    const total = boxes.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || entry.purchaseQty || entry.purchase_quantity || 0)), 0);
    if (total > 0) {
      return total;
    }
    const serviceDetails = getStorageFormDetails(item);
    return Number(serviceDetails.purchaseQuantity || storageEstimateSummary(item).totalPurchaseBoxes || 0);
  }

  function storageBoxOrderNo(item = {}) {
    return storagePurchaseQuantity(item) > 0 ? (item.box_order_no || "提交后生成") : "--";
  }

  function storageBoxDeliveryDate(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(item.box_delivery_date, serviceDetails.boxDeliveryDate, storageEstimateSummary(item).boxDeliveryDate) || "--";
  }

  function storageBoxDeliveryTimeSlot(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(item.box_delivery_time_slot, serviceDetails.boxDeliveryTimeSlot) || "--";
  }

  function storageBoxDeliveryMethod(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    const raw = firstStorageDetailValue(item.box_delivery_method, serviceDetails.boxDeliveryMethod, storageEstimateSummary(item).boxDeliveryMethod);
    return storageMethodLabel(raw, "楼下交接") || "--";
  }

  function storageBuyBoxStatusCell(item = {}) {
    if (storagePurchaseQuantity(item) <= 0) {
      return '<span class="admin-status-badge is-neutral" title="无买箱需求">否</span>';
    }
    const tooltip = [
      `买箱编号：${storageBoxOrderNo(item)}`,
      `送箱日期：${storageBoxDeliveryDate(item)}`
    ].join("\n");
    return `<span class="admin-status-badge is-success" title="${AdminShell.escapeHtml(tooltip)}">是</span>`;
  }

  function storageParentOrderNo(item = {}) {
    return firstStorageDetailValue(item.parent_order_no, item.order_no) || "--";
  }

  function storageIntakeDate(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(item.storage_intake_date, item.service_date, serviceDetails.serviceDate, storageEstimateSummary(item).startDate) || "--";
  }

  function storageStartDate(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(item.storage_start_date, item.service_date, serviceDetails.serviceDate, storageEstimateSummary(item).startDate) || "--";
  }

  function storageEndDate(item = {}) {
    const serviceDetails = getStorageFormDetails(item);
    return firstStorageDetailValue(item.storage_end_date, item.expected_storage_end_date, serviceDetails.expectedStorageEndDate, storageEstimateSummary(item).endDate) || "--";
  }

  function storageIntakeDateCell(item = {}) {
    const intakeDate = storageIntakeDate(item);
    const endDate = storageEndDate(item);
    if (!endDate || endDate === "--") {
      return AdminShell.escapeHtml(intakeDate);
    }
    return `<span title="${AdminShell.escapeHtml(`寄存结束日期：${endDate}`)}">${AdminShell.escapeHtml(intakeDate)}</span>`;
  }

  function storageExpectedPrice(item = {}) {
    const estimate = storageEstimateSummary(item);
    const value = firstStorageDetailValue(
      item.estimated_total_price,
      item.estimatedTotalPrice,
      estimate.estimated_total_price,
      estimate.estimatedTotalPrice,
      estimate.totalPrice,
      estimate.finalTotal,
      estimate.grandTotal,
      estimate.total
    );
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? formatStorageDetailMoney(number) : "--";
  }

  function storageInputValue(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function storageBoolValue(value) {
    if (value === true) {
      return "true";
    }
    if (value === false) {
      return "false";
    }
    return "";
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }

    try {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function getRoleLabel(role) {
    return role === "super_admin"
      ? "\u8d85\u7ea7\u7ba1\u7406\u5458"
      : role === "operations_admin"
        ? "\u8fd0\u8425\u7ba1\u7406\u5458"
        : role || "--";
  }

  function getManagerStatusLabel(status) {
    return status === "active" ? "\u542f\u7528" : status === "disabled" ? "\u505c\u7528" : status || "--";
  }

  function getBadgeClass(type, value) {
    if (type === "manager-role") {
      return value === "super_admin" ? "is-success" : "is-neutral";
    }
    if (type === "manager-status") {
      return value === "active" ? "is-success" : "is-danger";
    }
    return "is-neutral";
  }

  function getUserProviderLabel(provider) {
    const normalized = String(provider || "").trim().toLowerCase();
    if (!normalized) {
      return "未记录";
    }
    if (normalized === "google") {
      return "Google";
    }
    if (normalized === "password") {
      return "密码登录";
    }
    return normalized;
  }

  function getBooleanLabel(value) {
    return value ? "已填写" : "未填写";
  }

  function renderDetailItems(container, items) {
    if (!container) {
      return;
    }

    container.innerHTML = (items || []).map(item => `
      <div class="admin-detail-item">
        <strong>${AdminShell.escapeHtml(item.label || "--")}</strong>
        <span>${AdminShell.escapeHtml(item.value || "--")}</span>
      </div>
    `).join("");
  }

  function renderPaginationControls(container, meta) {
    if (!container) {
      return;
    }

    const page = Number(meta?.page || 1);
    const totalPages = Math.max(Number(meta?.total_pages || 1), 1);
    const total = Number(meta?.total || 0);

    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${totalPages} 页，共 ${total} 条</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  function renderDashboard(data) {
    const cards = document.querySelector("#adminDashboardCards");
    if (!cards) {
      return;
    }

    cards.innerHTML = `
      <article class="admin-stat-card">
        <p>\u542f\u7528\u4e2d\u7684\u7ba1\u7406\u5458</p>
        <strong>${data.cards.active_admins}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u5e73\u53f0\u7528\u6237\u603b\u6570</p>
        <strong>${data.cards.total_users}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u8fd1 7 \u5929\u767b\u5f55\u6b21\u6570</p>
        <strong>${data.cards.logins_last_7_days}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u5f85\u5904\u7406\u8ba2\u5355</p>
        <strong>${data.cards.transport_requests_pending}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u5f85\u786e\u8ba4\u5bc4\u5b58\u9884\u7ea6</p>
        <strong>${data.cards.storage_orders_pending || 0}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u6d3b\u8dc3\u8ba2\u5355</p>
        <strong>${data.cards.active_orders_total || 0}</strong>
      </article>
      <article class="admin-stat-card">
        <p>\u5df2\u5f52\u6863\u8ba2\u5355</p>
        <strong>${data.cards.archived_orders_total || 0}</strong>
      </article>
    `;

    const summary = document.querySelector("#adminDashboardSummary");
    if (summary) {
      summary.innerHTML = `
        <div class="admin-panel">
          <h2>\u5f53\u524d\u540e\u53f0\u72b6\u6001</h2>
          <p>\u540e\u53f0\u5df2\u7edf\u4e00\u63a5\u5165\u72ec\u7acb\u7ba1\u7406\u5458\u8d26\u53f7\u767b\u5f55\uff0c\u63a7\u5236\u53f0\u3001\u7528\u6237\u7ba1\u7406\u3001\u63a5\u9001\u673a\u7ba1\u7406\u4e0e\u5bc4\u5b58\u7ba1\u7406\u5171\u7528\u540c\u4e00\u5957\u8fd0\u8425\u540e\u53f0\u6846\u67b6\u3002</p>
        </div>
        <div class="admin-panel">
          <h2>\u540e\u7eed\u6269\u5c55\u5efa\u8bae</h2>
          <p>\u7ba1\u7406\u5458\u89d2\u8272\u3001\u83dc\u5355\u80fd\u529b\u548c\u66f4\u591a\u670d\u52a1\u6a21\u5757\u90fd\u5df2\u9884\u7559\u6269\u5c55\u4f4d\uff0c\u540e\u7eed\u53ef\u5728\u4e0d\u91cd\u505a\u58f3\u5c42\u7684\u524d\u63d0\u4e0b\u7ee7\u7eed\u6269\u5c55\u3002</p>
        </div>
      `;
    }
  }

  function renderUsersTable(payload) {
    const table = document.querySelector("#adminUsersTable");
    const pagination = document.querySelector("#adminUsersPagination");
    if (!table) {
      return;
    }

    const items = payload.items || [];
    if (!items.length) {
      table.innerHTML = `
        <div class="admin-panel">
          <div class="admin-empty-state">
            <h2>\u6682\u65e0\u7b26\u5408\u6761\u4ef6\u7684\u6570\u636e</h2>
            <p>\u8bf7\u8c03\u6574\u7b5b\u9009\u6761\u4ef6\u540e\u91cd\u8bd5\u3002</p>
          </div>
        </div>
      `;
      if (pagination) {
        pagination.textContent = "";
      }
      return;
    }

    table.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>\u90ae\u7bb1</th>
              <th>\u6635\u79f0</th>
              <th>\u624b\u673a\u53f7</th>
              <th>\u9996\u6b21\u767b\u5f55</th>
              <th>\u6700\u8fd1\u767b\u5f55</th>
              <th>\u767b\u5f55\u65b9\u5f0f</th>
              <th>\u767b\u5f55\u6b21\u6570</th>
              <th>\u64cd\u4f5c</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td><strong>${AdminShell.escapeHtml(item.public_user_id || "--")}</strong></td>
                <td>${AdminShell.escapeHtml(item.email || "--")}</td>
                <td>${AdminShell.escapeHtml(item.nickname || "--")}</td>
                <td>${AdminShell.escapeHtml(item.phone || "--")}</td>
                <td>${AdminShell.escapeHtml(formatDateTime(item.first_login_at))}</td>
                <td>${AdminShell.escapeHtml(formatDateTime(item.last_login_at))}</td>
                <td><span class="admin-status-badge ${getBadgeClass("provider", item.last_login_provider)}">${AdminShell.escapeHtml(getUserProviderLabel(item.last_login_provider))}</span></td>
                <td>${Number(item.login_count || 0)}</td>
                <td><button class="button button-secondary admin-table-action" type="button" data-user-view="${AdminShell.escapeHtml(item.id)}">\u67e5\u770b\u8be6\u60c5</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    if (pagination) {
      renderPaginationControls(pagination, payload.pagination || {});
    }
  }

  function closeUserDrawer() {
    const drawer = document.querySelector("#adminUserDrawer");
    if (!drawer) {
      return;
    }

    drawer.hidden = true;
    document.body.classList.remove("admin-overlay-open");
  }

  function setUserDrawerState(message, isError) {
    const stateNode = document.querySelector("#adminUserDrawerState");
    const contentNode = document.querySelector("#adminUserDrawerContent");
    if (!stateNode || !contentNode) {
      return;
    }

    stateNode.hidden = false;
    contentNode.hidden = true;
    stateNode.textContent = message || "";
    stateNode.className = "admin-detail-pre";
    if (isError) {
      stateNode.classList.add("is-error");
    }
  }

  function openUserDrawerWithData(user) {
    const drawer = document.querySelector("#adminUserDrawer");
    const stateNode = document.querySelector("#adminUserDrawerState");
    const contentNode = document.querySelector("#adminUserDrawerContent");
    if (!drawer || !stateNode || !contentNode || !user) {
      return;
    }

    renderDetailItems(document.querySelector("#adminUserSummaryGrid"), [
      { label: "User ID", value: user.public_user_id || "--" },
      { label: "邮箱", value: user.email || "--" },
      { label: "昵称", value: user.nickname || "未填写" }
    ]);

    renderDetailItems(document.querySelector("#adminUserBaseGrid"), [
      { label: "User ID", value: user.public_user_id || "--" },
      { label: "邮箱", value: user.email || "--" },
      { label: "昵称", value: user.nickname || "未填写" },
      { label: "手机号", value: user.phone || "未填写" },
      { label: "注册时间", value: formatDateTime(user.created_at) }
    ]);

    renderDetailItems(document.querySelector("#adminUserLoginGrid"), [
      { label: "首次登录", value: formatDateTime(user.first_login_at) },
      { label: "最近登录", value: formatDateTime(user.last_login_at) },
      { label: "最近登录方式", value: getUserProviderLabel(user.last_login_provider) },
      { label: "累计登录次数", value: String(Number(user.login_count || 0)) }
    ]);

    renderDetailItems(document.querySelector("#adminUserProfileGrid"), [
      { label: "昵称资料", value: getBooleanLabel(Boolean(user.profile_flags?.has_nickname)) },
      { label: "手机号资料", value: getBooleanLabel(Boolean(user.profile_flags?.has_phone)) }
    ]);

    stateNode.hidden = true;
    contentNode.hidden = false;
    drawer.hidden = false;
    document.body.classList.add("admin-overlay-open");
  }

  function renderManagerTable(payload) {
    const table = document.querySelector("#adminManagersTable");
    const pagination = document.querySelector("#adminManagersPagination");
    if (!table) {
      return;
    }

    const items = payload.items || [];
    if (!items.length) {
      table.innerHTML = `
        <div class="admin-panel">
          <div class="admin-empty-state">
            <h2>\u6682\u65e0\u7ba1\u7406\u5458\u6570\u636e</h2>
            <p>\u8bf7\u5148\u65b0\u589e\u7ba1\u7406\u5458\u8d26\u53f7\u3002</p>
          </div>
        </div>
      `;
      if (pagination) {
        pagination.textContent = "";
      }
      return;
    }

    table.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>\u59d3\u540d</th>
              <th>\u8d26\u53f7</th>
              <th>\u90ae\u7bb1</th>
              <th>\u624b\u673a\u53f7</th>
              <th>\u89d2\u8272</th>
              <th>\u521b\u5efa\u65f6\u95f4</th>
              <th>\u6700\u8fd1\u767b\u5f55\u65f6\u95f4</th>
              <th>\u64cd\u4f5c</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td><strong>${AdminShell.escapeHtml(item.name || "--")}</strong></td>
                <td>${AdminShell.escapeHtml(item.username || "--")}</td>
                <td>${AdminShell.escapeHtml(item.email || "--")}</td>
                <td>${AdminShell.escapeHtml(item.phone || "--")}</td>
                <td><span class="admin-status-badge ${getBadgeClass("manager-role", item.role)}">${getRoleLabel(item.role)}</span></td>
                <td>${AdminShell.escapeHtml(formatDateTime(item.created_at))}</td>
                <td>${AdminShell.escapeHtml(formatDateTime(item.last_login_at))}</td>
                <td>
                  <div class="admin-table-actions">
                    <button class="button button-text" type="button" data-manager-edit="${item.id}">\u7f16\u8f91</button>
                    <button class="button button-text" type="button" data-manager-reset-password="${item.id}">\u91cd\u7f6e\u5bc6\u7801</button>
                    <button class="button button-text is-danger" type="button" data-manager-delete="${item.id}" ${item.role === "super_admin" ? "disabled title=\"\u8d85\u7ea7\u7ba1\u7406\u5458\u8d26\u53f7\u4e0d\u80fd\u5220\u9664\"" : currentSession?.admin?.id === item.id ? "disabled title=\"\u5f53\u524d\u8d26\u53f7\u4e0d\u80fd\u5220\u9664\u81ea\u5df1\"" : ""}>\u5220\u9664\u8d26\u53f7</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    if (pagination) {
      renderPaginationControls(pagination, payload.pagination || {});
    }
  }

  async function initDashboardPage() {
    const cards = document.querySelector("#adminDashboardCards");
    if (!cards) {
      return;
    }

    cards.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u63a7\u5236\u53f0\u6570\u636e...</div>';

    try {
      const data = await AdminApi.dashboard();
      renderDashboard(data);
    } catch (error) {
      cards.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>\u63a7\u5236\u53f0\u52a0\u8f7d\u5931\u8d25</h2><p>${AdminShell.escapeHtml(error.message)}</p></div></div>`;
    }
  }

  async function initUsersPage() {
    const root = document.querySelector("#adminUsersPage");
    if (!root) {
      return;
    }

    const form = document.querySelector("#adminUsersFilters");
    const table = document.querySelector("#adminUsersTable");
    const pagination = document.querySelector("#adminUsersPagination");
    const drawer = document.querySelector("#adminUserDrawer");
    let currentPage = 1;
    let totalPages = 1;

    async function render() {
      if (table) {
        table.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u7528\u6237\u6570\u636e...</div>';
      }

      try {
        const payload = await AdminApi.listUsers({
          page: currentPage,
          page_size: form ? form.page_size.value : 20,
          search: form ? form.search.value : "",
          provider: form ? form.provider.value : ""
        });
        totalPages = Number(payload?.pagination?.total_pages || 1);
        renderUsersTable(payload);
      } catch (error) {
        if (table) {
          table.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>\u7528\u6237\u5217\u8868\u52a0\u8f7d\u5931\u8d25</h2><p>${AdminShell.escapeHtml(error.message)}</p></div></div>`;
        }
      }
    }

    async function openUserDrawer(userId) {
      setUserDrawerState("正在加载用户详情...");
      if (drawer) {
        drawer.hidden = false;
        document.body.classList.add("admin-overlay-open");
      }

      try {
        const user = await AdminApi.getUser(userId);
        openUserDrawerWithData(user);
      } catch (error) {
        setUserDrawerState(error.message || "用户详情加载失败", true);
      }
    }

    form?.addEventListener("submit", event => {
      event.preventDefault();
      currentPage = 1;
      render();
    });

    form?.addEventListener("reset", () => {
      window.setTimeout(() => {
        currentPage = 1;
        render();
      }, 0);
    });

    pagination?.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.getAttribute("data-page-action");
      if (action === "prev" && currentPage > 1) {
        currentPage -= 1;
        render();
      }
      if (action === "next" && currentPage < totalPages) {
        currentPage += 1;
        render();
      }
    });

    document.querySelectorAll("[data-admin-user-drawer-close]").forEach(button => {
      button.addEventListener("click", closeUserDrawer);
    });

    drawer?.addEventListener("click", event => {
      if (event.target === drawer) {
        closeUserDrawer();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && drawer && !drawer.hidden) {
        closeUserDrawer();
      }
    });

    table?.addEventListener("click", event => {
      const button = event.target.closest("[data-user-view]");
      if (!button) {
        return;
      }

      const userId = button.getAttribute("data-user-view");
      if (!userId) {
        return;
      }

      openUserDrawer(userId);
    });

    render();
  }

  function openManagerDrawer(mode, item) {
    const drawer = document.querySelector("#adminManagerDrawer");
    const form = document.querySelector("#adminManagerForm");
    const title = document.querySelector("#adminManagerDrawerTitle");
    const note = document.querySelector("#adminManagerDrawerNote");
    const passwordField = document.querySelector("#adminManagerPasswordField");

    if (!drawer || !form || !title || !note || !passwordField) {
      return;
    }

    form.reset();
    form.dataset.mode = mode;
    title.textContent = mode === "create" ? "\u65b0\u589e\u7ba1\u7406\u5458" : "\u7f16\u8f91\u7ba1\u7406\u5458";
    note.textContent = mode === "create"
      ? "\u521b\u5efa\u540e\u53f0\u7ba1\u7406\u5458\u8d26\u53f7\uff0c\u5e76\u76f4\u63a5\u5206\u914d\u89d2\u8272\u3002"
      : "\u53ef\u4fee\u6539\u7ba1\u7406\u5458\u7684\u59d3\u540d\u3001\u90ae\u7bb1\u3001\u624b\u673a\u53f7\u548c\u89d2\u8272\u3002";
    passwordField.hidden = mode !== "create";
    form.username.disabled = mode !== "create";

    if (item) {
      form.id.value = item.id || "";
      form.name.value = item.name || "";
      form.username.value = item.username || "";
      form.email.value = item.email || "";
      form.phone.value = item.phone || "";
      form.role.value = item.role || "operations_admin";
      form.status.value = item.status || "active";
    } else {
      form.role.value = "operations_admin";
      form.status.value = "active";
    }

    drawer.hidden = false;
    document.body.classList.add("admin-overlay-open");
  }

  function closeManagerDrawer() {
    const drawer = document.querySelector("#adminManagerDrawer");
    if (!drawer) {
      return;
    }
    drawer.hidden = true;
    document.body.classList.remove("admin-overlay-open");
  }

  function openConfirmModal(options) {
    const modal = document.querySelector("#adminConfirmModal");
    if (!modal) {
      if (window.confirm(options.text || options.title || "请确认后继续。")) {
        Promise.resolve(options.onConfirm?.()).catch(error => {
          window.alert(error?.message || "操作失败");
        });
      }
      return;
    }

    modal.hidden = false;
    document.body.classList.add("admin-overlay-open");
    modal.querySelector("[data-confirm-title]").textContent = options.title;
    modal.querySelector("[data-confirm-text]").textContent = options.text;

    const submitButton = modal.querySelector("[data-confirm-submit]");
    submitButton.textContent = options.confirmText || "\u786e\u8ba4";
    submitButton.className = options.danger ? "button button-danger" : "button button-primary";

    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("admin-overlay-open");
      const nextSubmit = submitButton.cloneNode(true);
      submitButton.replaceWith(nextSubmit);
      modal.querySelectorAll("[data-confirm-close]").forEach(button => {
        const nextButton = button.cloneNode(true);
        button.replaceWith(nextButton);
      });
    };

    modal.querySelectorAll("[data-confirm-close]").forEach(button => {
      button.addEventListener("click", close, { once: true });
    });

    modal.querySelector("[data-confirm-submit]").addEventListener("click", async () => {
      await options.onConfirm();
      close();
    }, { once: true });
  }

  async function initManagersPage() {
    const root = document.querySelector("#adminManagersPage");
    if (!root) {
      return;
    }

    const form = document.querySelector("#adminManagersFilters");
    const table = document.querySelector("#adminManagersTable");
    const message = document.querySelector("#adminManagersMessage");
    const drawer = document.querySelector("#adminManagerDrawer");
    const drawerForm = document.querySelector("#adminManagerForm");
    let latestItems = [];

    function showMessage(text, isError) {
      if (!message) {
        return;
      }
      message.textContent = text || "";
      message.classList.toggle("is-error", Boolean(isError));
      message.classList.toggle("is-success", Boolean(text && !isError));
    }

    async function render() {
      if (table) {
        table.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u7ba1\u7406\u5458\u5217\u8868...</div>';
      }

      try {
        const payload = await AdminApi.listManagers({
          page: 1,
          page_size: 20,
          keyword: form?.keyword.value || "",
          role: form?.role.value || ""
        });
        latestItems = payload.items || [];
        renderManagerTable(payload);
      } catch (error) {
        if (table) {
          table.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>\u7ba1\u7406\u5458\u5217\u8868\u52a0\u8f7d\u5931\u8d25</h2><p>${AdminShell.escapeHtml(error.message)}</p></div></div>`;
        }
      }
    }

    document.querySelector("#adminCreateManagerButton")?.addEventListener("click", () => {
      showMessage("");
      openManagerDrawer("create");
    });

    document.querySelectorAll("[data-admin-drawer-close]").forEach(button => {
      button.addEventListener("click", closeManagerDrawer);
    });

    drawer?.addEventListener("click", event => {
      if (event.target === drawer) {
        closeManagerDrawer();
      }
    });

    drawerForm?.addEventListener("submit", async event => {
      event.preventDefault();
      showMessage("\u6b63\u5728\u4fdd\u5b58\u7ba1\u7406\u5458\u4fe1\u606f...");

      const payload = {
        name: drawerForm.name.value,
        username: drawerForm.username.value,
        email: drawerForm.email.value,
        phone: drawerForm.phone.value,
        role: drawerForm.role.value,
        status: drawerForm.status.value,
        password: drawerForm.password ? drawerForm.password.value : ""
      };

      try {
        if (drawerForm.dataset.mode === "create") {
          await AdminApi.createManager(payload);
          showMessage("\u65b0\u589e\u6210\u529f");
        } else {
          await AdminApi.updateManager(drawerForm.id.value, payload);
          showMessage("\u4fdd\u5b58\u6210\u529f");
        }
        closeManagerDrawer();
        await render();
      } catch (error) {
        showMessage(error.message, true);
      }
    });

    table?.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const editId = target.getAttribute("data-manager-edit");
      if (editId) {
        const item = latestItems.find(entry => entry.id === editId);
        if (item) {
          openManagerDrawer("edit", item);
        }
        return;
      }

      const deleteId = target.getAttribute("data-manager-delete");
      if (deleteId) {
        const item = latestItems.find(entry => entry.id === deleteId);
        if (item?.role === "super_admin") {
          showMessage("\u8d85\u7ea7\u7ba1\u7406\u5458\u8d26\u53f7\u4e0d\u80fd\u5220\u9664", true);
          return;
        }
        openConfirmModal({
          title: "\u786e\u8ba4\u5220\u9664\u7ba1\u7406\u5458\u8d26\u53f7",
          text: item?.username
            ? `\u5220\u9664\u540e\uff0c${item.username} \u5c06\u65e0\u6cd5\u7ee7\u7eed\u767b\u5f55\u540e\u53f0\uff0c\u4e14\u8be5\u8d26\u53f7\u4f1a\u4ece\u7ba1\u7406\u5458\u5217\u8868\u4e2d\u79fb\u9664\u3002`
            : "\u5220\u9664\u540e\uff0c\u8be5\u8d26\u53f7\u5c06\u65e0\u6cd5\u7ee7\u7eed\u767b\u5f55\u540e\u53f0\uff0c\u4e14\u4f1a\u4ece\u7ba1\u7406\u5458\u5217\u8868\u4e2d\u79fb\u9664\u3002",
          confirmText: "\u786e\u8ba4\u5220\u9664",
          danger: true,
          onConfirm: async () => {
            try {
              await AdminApi.deleteManager(deleteId);
              showMessage("\u5220\u9664\u6210\u529f");
              await render();
            } catch (error) {
              showMessage(error.message, true);
            }
          }
        });
        return;
      }

      const resetId = target.getAttribute("data-manager-reset-password");
      if (resetId) {
        openConfirmModal({
          title: "\u786e\u8ba4\u91cd\u7f6e\u5bc6\u7801",
          text: "\u7cfb\u7edf\u5c06\u751f\u6210\u65b0\u7684\u4e34\u65f6\u5bc6\u7801\uff0c\u8bf7\u5728\u64cd\u4f5c\u540e\u7acb\u5373\u8f6c\u4ea4\u5bf9\u5e94\u7ba1\u7406\u5458\u3002",
          confirmText: "\u786e\u8ba4\u91cd\u7f6e",
          danger: true,
          onConfirm: async () => {
            try {
              const result = await AdminApi.resetManagerPassword(resetId);
              showMessage(`\u5bc6\u7801\u5df2\u91cd\u7f6e\uff0c\u4e34\u65f6\u5bc6\u7801\uff1a${result.temporary_password}`);
            } catch (error) {
              showMessage(error.message, true);
            }
          }
        });
      }
    });

    form?.addEventListener("submit", event => {
      event.preventDefault();
      render();
    });

    form?.addEventListener("reset", () => {
      window.setTimeout(render, 0);
    });

    render();
  }

  function buildStorageDetailUrl(id) {
    const currentPageName = window.location.pathname.split("/").pop() || "admin-storage.html";
    const current = `${currentPageName}${window.location.search || ""}`;
    return `./admin-storage-detail.html?id=${encodeURIComponent(id)}&return_to=${encodeURIComponent(`./${current}`)}`;
  }

  function renderStorageOrdersTable(payload) {
    const table = document.querySelector("#adminStorageList");
    const pagination = document.querySelector("#adminStoragePagination");
    if (!table) {
      return;
    }

    const items = payload.items || [];
    const activeOrderType = String(document.querySelector("#adminStorageFilters")?.order_type?.value || "");
    const showServiceTypeColumn = !["storage_collection", "storage_return"].includes(activeOrderType);
    if (!items.length) {
      table.innerHTML = `
        <div class="admin-panel">
          <div class="admin-empty-state">
            <h2>暂无寄存订单</h2>
            <p>可以调整搜索或筛选条件后重试。</p>
          </div>
        </div>
      `;
      if (pagination) {
        pagination.textContent = "";
      }
      return;
    }

    if (activeOrderType === "box_order") {
      table.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>提交时间</th>
                <th>主订单编号</th>
                <th>买箱编号</th>
                <th>姓名</th>
                <th>微信</th>
                <th>电话</th>
                <th>买箱数量</th>
                <th>送箱日期</th>
                <th>送箱时间段</th>
                <th>送箱方式</th>
                <th>公寓名</th>
                <th>邮编</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${AdminShell.escapeHtml(formatDateTime(item.created_at))}</td>
                  <td><strong>${AdminShell.escapeHtml(storageParentOrderNo(item))}</strong></td>
                  <td><strong>${AdminShell.escapeHtml(storageBoxOrderNo(item))}</strong></td>
                  <td>${AdminShell.escapeHtml(item.customer_name || "--")}</td>
                  <td>${AdminShell.escapeHtml(item.wechat_id || "--")}</td>
                  <td>${AdminShell.escapeHtml(item.phone || "--")}</td>
                  <td>${AdminShell.escapeHtml(`${storagePurchaseQuantity(item) || 0} 个`)}</td>
                  <td>${AdminShell.escapeHtml(storageBoxDeliveryDate(item))}</td>
                  <td>${AdminShell.escapeHtml(storageBoxDeliveryTimeSlot(item))}</td>
                  <td>${AdminShell.escapeHtml(storageBoxDeliveryMethod(item))}</td>
                  <td>${AdminShell.escapeHtml(storageApartmentName(item))}</td>
                  <td>${AdminShell.escapeHtml(storagePostcodeValue(item))}</td>
                  <td>
                    <div class="admin-table-actions">
                      <a class="button button-secondary admin-table-action" href="${AdminShell.escapeHtml(buildStorageDetailUrl(item.id))}">查看详情</a>
                      <button class="button button-text is-danger admin-table-action" type="button" data-storage-delete="${AdminShell.escapeHtml(item.id)}">删除</button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      if (pagination) {
        renderPaginationControls(pagination, payload.pagination || {});
      }
      return;
    }

    table.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>提交时间</th>
              <th>订单编号</th>
              ${showServiceTypeColumn ? "<th>服务类型</th>" : ""}
              <th>姓名</th>
              <th>微信</th>
              <th>电话</th>
              <th>是否买箱</th>
              <th>取件/自送日期</th>
              <th>时间段</th>
              <th>公寓名</th>
              <th>邮编</th>
              <th>预期价格</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${AdminShell.escapeHtml(formatDateTime(item.created_at))}</td>
                <td><strong>${AdminShell.escapeHtml(item.order_no || "--")}</strong></td>
                ${showServiceTypeColumn ? `
                  <td>
                    ${AdminShell.escapeHtml(storageTypeShortLabels[resolveStorageOrderType(item)] || item.service_label || item.order_type || "--")}
                    ${needsStorageReturnHistoryWarning(item) ? '<div class="admin-table-warning">此账号未找到可对应的取寄存订单，请人工核验</div>' : ""}
                  </td>
                ` : ""}
                <td>${AdminShell.escapeHtml(item.customer_name || "--")}</td>
                <td>${AdminShell.escapeHtml(item.wechat_id || "--")}</td>
                <td>${AdminShell.escapeHtml(item.phone || "--")}</td>
                <td>${storageBuyBoxStatusCell(item)}</td>
                <td>${storageIntakeDateCell(item)}</td>
                <td>${AdminShell.escapeHtml(storageServiceTime(item))}</td>
                <td>${AdminShell.escapeHtml(storageApartmentName(item))}</td>
                <td>${AdminShell.escapeHtml(storagePostcodeValue(item))}</td>
                <td>${AdminShell.escapeHtml(storageExpectedPrice(item))}</td>
                <td>
                  <div class="admin-table-actions">
                    <a class="button button-secondary admin-table-action" href="${AdminShell.escapeHtml(buildStorageDetailUrl(item.id))}">查看详情</a>
                    <button class="button button-text is-danger admin-table-action" type="button" data-storage-delete="${AdminShell.escapeHtml(item.id)}">删除</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    if (pagination) {
      renderPaginationControls(pagination, payload.pagination || {});
    }
  }
  async function initStoragePage() {
    const root = document.querySelector("#adminStoragePage");
    if (!root) {
      return;
    }

    const form = document.querySelector("#adminStorageFilters");
    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    let latestItems = [];

    const urlParams = new URLSearchParams(window.location.search);
    if (form?.order_type) {
      const requestedOrderType = urlParams.get("order_type") || "storage_collection";
      form.order_type.value = ["box_order", "storage_collection", "storage_return"].includes(requestedOrderType)
        ? requestedOrderType
        : "storage_collection";
    }

    async function render() {
      const table = document.querySelector("#adminStorageList");
      if (table) {
        table.innerHTML = '<div class="admin-loading">正在加载寄存订单...</div>';
      }

      try {
        const payload = await AdminApi.listStorageOrders({
          page: currentPage,
          page_size: 10,
          search: form?.search?.value || "",
          order_type: form?.order_type?.value || "",
          status: form?.status?.value || ""
        });
        totalPages = Number(payload?.pagination?.total_pages || 1);
        totalItems = Number(payload?.pagination?.total || (payload.items || []).length || 0);
        latestItems = payload.items || [];
        renderStorageOrdersTable(payload);
      } catch (error) {
        if (table) {
          table.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>加载失败</h2><p>${AdminShell.escapeHtml(error.message)}</p></div></div>`;
        }
      }
    }

    form?.addEventListener("submit", event => {
      event.preventDefault();
      currentPage = 1;
      render();
    });

    root.addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-storage-delete]");
      if (!deleteButton) {
        return;
      }

      const deleteId = deleteButton.getAttribute("data-storage-delete");
      const item = latestItems.find(entry => String(entry.id) === String(deleteId));
      openConfirmModal({
        title: "确认删除寄存订单",
        text: item?.order_no
          ? `删除后，订单 ${item.order_no} 会从寄存管理列表中移除。此操作不可恢复。`
          : "删除后，该寄存订单会从寄存管理列表中移除。此操作不可恢复。",
        confirmText: "确认删除",
        danger: true,
        onConfirm: async () => {
          try {
            await AdminApi.deleteStorageOrder(deleteId);
            latestItems = latestItems.filter(entry => String(entry.id) !== String(deleteId));
            totalItems = Math.max(0, totalItems - 1);
            totalPages = totalItems ? Math.ceil(totalItems / 10) : 1;
            if (!latestItems.length && currentPage > 1) {
              currentPage -= 1;
              await render();
              return;
            }
            renderStorageOrdersTable({
              items: latestItems,
              pagination: {
                page: currentPage,
                page_size: 10,
                total: totalItems,
                total_pages: totalPages
              }
            });
          } catch (error) {
            window.alert(error.message || "删除失败");
          }
        }
      });
    });

    document.querySelector("#adminStoragePagination")?.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.getAttribute("data-page-action");
      if (action === "prev" && currentPage > 1) {
        currentPage -= 1;
        render();
      }
      if (action === "next" && currentPage < totalPages) {
        currentPage += 1;
        render();
      }
    });

    render();
  }

  function normalizeAdminReturnTo(value) {
    const fallback = "./admin-storage.html";
    const raw = String(value || "").trim();
    if (!raw) {
      return fallback;
    }
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch (error) {
      decoded = raw;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith("//")) {
      return fallback;
    }
    const normalized = decoded.startsWith("./") ? decoded.slice(2) : decoded.replace(/^\/+/, "");
    if (!/^admin-[a-z0-9-]+\.html(?:[?#].*)?$/i.test(normalized)) {
      return fallback;
    }
    return `./${normalized}`;
  }

  function formatCurrencyInput(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : String(value);
  }

  function normalizeStorageQuantity(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function formatStorageBoxTypeSummary(item = {}) {
    const summary = item.estimate_summary_json || {};
    const summaryItems = Array.isArray(summary.items) ? summary.items : [];
    const rows = summaryItems
      .map(entry => {
        const storageQty = normalizeStorageQuantity(entry.storageQty ?? entry.storage_quantity);
        const purchaseQty = normalizeStorageQuantity(entry.purchaseQty ?? entry.purchase_quantity);
        const weight = entry.weight ?? entry.maxWeight ?? entry.max_weight;
        if (!storageQty && !purchaseQty && (weight === undefined || weight === null || weight === "")) {
          return "";
        }
        const label = entry.label || entry.boxType || entry.box_type || "箱型";
        const parts = [];
        if (storageQty) {
          parts.push(`寄存 ${storageQty} 个`);
        }
        if (purchaseQty) {
          parts.push(`购买 ${purchaseQty} 个`);
        }
        if (weight !== undefined && weight !== null && weight !== "") {
          parts.push(`最大重量 ${weight}kg`);
        }
        return `${label}：${parts.join(" / ")}`;
      })
      .filter(Boolean);

    if (rows.length) {
      return rows.join("\n");
    }

    const snapshot = item.calculator_snapshot_json || {};
    const boxCounts = snapshot.boxCounts || snapshot.box_counts || {};
    const purchaseCounts = snapshot.purchaseCounts || snapshot.purchase_counts || {};
    const weights = snapshot.weights || snapshot.maxWeights || snapshot.max_weights || {};
    const boxRows = Array.from({ length: 6 }, (_, index) => {
      const boxNo = index + 1;
      const key = String(boxNo);
      const storageQty = normalizeStorageQuantity(boxCounts[key] ?? boxCounts[boxNo]);
      const purchaseQty = normalizeStorageQuantity(purchaseCounts[key] ?? purchaseCounts[boxNo]);
      const weight = weights[key] ?? weights[boxNo];
      if (!storageQty && !purchaseQty && (weight === undefined || weight === null || weight === "")) {
        return "";
      }
      const parts = [];
      if (storageQty) {
        parts.push(`寄存 ${storageQty} 个`);
      }
      if (purchaseQty) {
        parts.push(`购买 ${purchaseQty} 个`);
      }
      if (weight !== undefined && weight !== null && weight !== "") {
        parts.push(`最大重量 ${weight}kg`);
      }
      return `${boxNo}号箱：${parts.join(" / ")}`;
    }).filter(Boolean);

    if (boxRows.length) {
      return boxRows.join("\n");
    }

    return item.item_description || "";
  }

  function formatStoragePurchaseSummary(item = {}) {
    return storagePurchasedBoxes(item)
      .map(entry => {
        const label = entry.label || (entry.boxType ? `${entry.boxType}号箱` : "箱型");
        const quantity = entry.quantity || entry.purchaseQty || entry.purchase_quantity || 0;
        const subtotal = entry.subtotal || entry.purchase || 0;
        return `${label}：购买 ${quantity} 个${subtotal ? ` / ${formatStorageDetailMoney(subtotal)}` : ""}`;
      })
      .join("\n");
  }

  function firstStorageDetailValue(...values) {
    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      const text = String(value).trim();
      if (text && text !== "—" && text !== "--" && text !== "-") {
        return text;
      }
    }
    return "";
  }

  function storageMethodLabel(type, fallback = "") {
    const labels = {
      home: "上门取件",
      self: "自送 / 自取",
      local: "诺丁汉当地寄存送还",
      other_city: "外地送还",
      campus: "校区交接",
      courier: "快递 / 物流",
      downstairs: "楼下交接"
    };
    return labels[type] || fallback || type || "";
  }

  function storageAccessLabel(type, fallback = "") {
    const labels = {
      downstairs: "楼下交接",
      upstairs: "电梯上楼",
      stairs: "楼梯上楼",
      reception: "前台 / Reception",
      door: "门口交接"
    };
    return labels[type] || fallback || type || "";
  }

  function formatStorageDetailMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `£${number.toFixed(2)}` : String(value);
  }

  function storageDetailBoolLabel(value) {
    if (value === true || value === "true") {
      return "是";
    }
    if (value === false || value === "false") {
      return "否";
    }
    return "";
  }

  function readableMessageNeedsRebuild(value) {
    const text = String(value || "").trim();
    if (!text) {
      return true;
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      return true;
    }
    const emptyLines = lines.filter(line => /[:：]\s*(?:—|--|-|暂无|无|鈥\?|鏃\?)\s*$/.test(line));
    return emptyLines.length >= 3;
  }

  function buildStorageDetailReadableMessage(item = {}) {
    const formJson = item.customer_form_json || {};
    const customerForm = formJson.customerForm || formJson.customer_form || {};
    const serviceDetails = formJson.serviceDetails || formJson.service_details || {};
    const estimate = item.estimate_summary_json || {};
    const boxSummary = formatStorageBoxTypeSummary(item);
    const resolvedOrderType = resolveStorageOrderType(item);
    const serviceType = storageTypeLabels[resolvedOrderType] || item.service_label || item.order_type || "寄存订单";
    const customerName = firstStorageDetailValue(item.customer_name, customerForm.customerName, customerForm.name);
    const phone = firstStorageDetailValue(item.phone, customerForm.phone, serviceDetails.contactPhone, serviceDetails.storagePhone);
    const contact = firstStorageDetailValue(item.wechat_id, customerForm.contactHandle, customerForm.wechatId, serviceDetails.wechatId);
    const email = firstStorageDetailValue(item.student_email, item.linked_user_email, customerForm.email);
    const serviceTime = firstStorageDetailValue(
      item.service_time_slot,
      serviceDetails.serviceTimeSlot,
      item.service_time === "evening" ? "晚上" : item.service_time === "daytime" ? "白天" : item.service_time
    );
    const serviceDate = firstStorageDetailValue(item.service_date, serviceDetails.serviceDate);
    const boxDeliveryDate = firstStorageDetailValue(serviceDetails.boxDeliveryDate, serviceDetails.deliveryDate);
    const address = firstStorageDetailValue(
      item.address_full,
      serviceDetails.collectionAddress,
      serviceDetails.serviceAddress,
      serviceDetails.returnAddress,
      customerForm.addressFull
    );
    const room = firstStorageDetailValue(item.room_or_building, serviceDetails.roomOrBuilding);
    const postcode = firstStorageDetailValue(item.postcode, serviceDetails.postcode);
    const pickupMethod = storageMethodLabel(
      firstStorageDetailValue(estimate.pickupMethod, serviceDetails.pickupMethod),
      firstStorageDetailValue(serviceDetails.pickupMethodLabel)
    );
    const pickupAccess = storageAccessLabel(
      firstStorageDetailValue(estimate.pickupAccessType, serviceDetails.pickupAccessType),
      firstStorageDetailValue(serviceDetails.pickupAccessTypeLabel)
    );
    const returnType = storageMethodLabel(
      firstStorageDetailValue(estimate.returnType, serviceDetails.returnType),
      firstStorageDetailValue(serviceDetails.returnTypeLabel)
    );
    const deliveryMethod = storageMethodLabel(
      firstStorageDetailValue(estimate.deliveryMethod, serviceDetails.deliveryMethod),
      firstStorageDetailValue(serviceDetails.deliveryMethodLabel)
    );
    const returnAccess = storageAccessLabel(
      firstStorageDetailValue(estimate.returnAccessType, serviceDetails.returnAccessType),
      firstStorageDetailValue(serviceDetails.returnAccessTypeLabel)
    );
    const days = firstStorageDetailValue(estimate.days && `${estimate.days} 天`, serviceDetails.storageDays);
    const note = firstStorageDetailValue(item.notes, serviceDetails.notes, customerForm.notes);

    if (resolvedOrderType === "storage_return") {
      const returnRows = [
        ["服务类型", serviceType],
        ["客户姓名", customerName],
        ["联系电话", phone],
        ["邮箱", email],
        ["联系方式", contact],
        ["送回 / 自取日期", serviceDate],
        ["时间段", serviceTime],
        ["原寄存订单号", firstStorageDetailValue(item.related_order_no, serviceDetails.relatedOrderNo)],
        ["寄存物品数量", firstStorageDetailValue(item.estimated_box_count, serviceDetails.itemCount)],
        ["物品简单描述", firstStorageDetailValue(item.item_description, serviceDetails.itemDescription)],
        ["送回地址", address],
        ["房间 / 公寓", room],
        ["邮编", postcode],
        ["是否有电梯", storageDetailBoolLabel(item.has_lift)],
        ["是否需要上楼送回", storageDetailBoolLabel(item.needs_upstairs)]
      ]
        .filter(([, value]) => firstStorageDetailValue(value))
        .map(([label, value]) => `${label}：${value}`);

      return [
        `【${serviceType}】`,
        "",
        ...returnRows,
        "",
        "用户备注：",
        note || "无"
      ].join("\n");
    }

    const rows = [
      ["服务类型", serviceType],
      ["客户姓名", customerName],
      ["联系电话", phone],
      ["邮箱", email],
      ["联系方式", contact],
      ["时间段", serviceTime],
      ["寄存天数", days],
      ["送箱日期", boxDeliveryDate],
      ["取件方式", pickupMethod],
      ["取寄存交接方式", pickupAccess],
      ["送还方式", returnType],
      ["送回方式", deliveryMethod],
      ["送回交接方式", returnAccess],
      ["地址 / 说明", address],
      ["房间 / 公寓", room],
      ["邮编", postcode]
    ]
      .filter(([, value]) => firstStorageDetailValue(value))
      .map(([label, value]) => `${label}：${value}`);

    const sections = [
      `【${serviceType}】`,
      "",
      ...rows,
      "",
      "箱型 / 物品信息：",
      boxSummary || "暂无箱型明细",
      "",
      "用户备注：",
      note || "无"
    ];

    return sections.join("\n");
  }

  async function initStorageDetailPage() {
    const root = document.querySelector("#adminStorageDetailPage");
    if (!root) {
      return;
    }

    const form = document.querySelector("#adminStorageDetailForm");
    const message = document.querySelector("#adminStorageDetailMessage");
    const saveButtons = [
      document.querySelector("#adminStorageDetailSave"),
      document.querySelector("#adminStorageDetailSaveBottom")
    ].filter(Boolean);
    const backLink = document.querySelector("#adminStorageDetailBack");
    const serviceHint = document.querySelector("#storageDetailServiceHint");
    const addressHint = document.querySelector("#storageDetailAddressHint");
    const addressLabel = document.querySelector("#storageDetailAddressLabel");
    const typedFields = Array.from(document.querySelectorAll("[data-storage-detail-type]"));
    const params = new URLSearchParams(window.location.search);
    const orderId = String(params.get("id") || "").trim();
    const returnTo = normalizeAdminReturnTo(params.get("return_to"));
    let currentOrder = null;

    if (backLink) {
      backLink.href = returnTo;
    }

    function showMessage(text, isError = false) {
      if (!message) {
        return;
      }
      message.textContent = text || "";
      message.classList.toggle("is-error", Boolean(text && isError));
      message.classList.toggle("is-success", Boolean(text && !isError));
    }

    function setSaving(isSaving) {
      saveButtons.forEach(button => {
        button.disabled = isSaving;
        button.textContent = isSaving ? "保存中..." : "保存修改";
      });
    }

    function setValue(name, value) {
      const field = form?.elements[name];
      if (!field) {
        return;
      }
      field.value = storageInputValue(value);
    }

    function setText(id, value) {
      const element = document.querySelector(`#${id}`);
      if (element) {
        element.textContent = storageInputValue(value) || "--";
      }
    }

    function readText(name) {
      return form?.elements[name]?.value?.trim() || "";
    }

    function readBoolean(name) {
      const value = readText(name);
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
      return null;
    }

    function syncOrderTypeFields(orderType) {
      const isReturnOrder = orderType === "storage_return";
      typedFields.forEach(element => {
        const type = element.getAttribute("data-storage-detail-type");
        const visible = isReturnOrder ? type === "return" : type === "collection";
        element.hidden = !visible;
        element.querySelectorAll("input, select, textarea").forEach(field => {
          field.disabled = !visible;
        });
      });
      if (serviceHint) {
        serviceHint.textContent = isReturnOrder
          ? "送寄存订单只显示送回 / 自取相关信息，不使用取寄存的开始日期、结束日期和预估租金字段。"
          : "箱型明细会从用户提交时的估价记录自动读取。";
      }
      if (addressHint) {
        addressHint.textContent = isReturnOrder
          ? "送回地址为本次送寄存订单的主要地址；房间、邮编和楼层服务信息可在这里核对。"
          : "取件地址为订单主要地址；房间、邮编和楼层服务信息可在这里核对。";
      }
      if (addressLabel) {
        addressLabel.textContent = isReturnOrder ? "送回地址 / 自取说明" : "取件地址 / 服务地址";
      }
    }

    function populate(order) {
      currentOrder = order;
      const resolvedOrderType = resolveStorageOrderType(order);
      const serviceDetails = getStorageFormDetails(order);
      const estimate = storageEstimateSummary(order);
      const purchaseQuantity = storagePurchaseQuantity(order);
      const purchaseFields = Array.from(document.querySelectorAll("[data-storage-purchase-field]"));
      syncOrderTypeFields(resolvedOrderType);
      purchaseFields.forEach(element => {
        element.hidden = resolvedOrderType !== "storage_collection" || purchaseQuantity <= 0;
      });

      setValue("order_no", order.order_no || "");
      setValue("public_user_id", order.public_user_id || "未绑定用户");
      setText("storageDetailOrderType", storageTypeLabels[resolvedOrderType] || order.service_label || order.order_type || "--");
      setValue("customer_name", order.customer_name || "");
      setValue("student_email", order.student_email || order.linked_user_email || "");
      setValue("phone", order.phone || "");
      setValue("wechat_id", order.wechat_id || "");
      setValue("service_time_slot", order.service_time_slot || (order.service_time === "evening" ? "晚上" : order.service_time === "daytime" ? "白天" : order.service_time || ""));
      setValue("service_date", order.service_date || serviceDetails.serviceDate || "");
      setValue("box_order_no", storageBoxOrderNo(order));
      setValue("box_purchase_summary", formatStoragePurchaseSummary(order));
      setValue("box_purchase_quantity", purchaseQuantity > 0 ? `${purchaseQuantity} 个` : "");
      setValue("box_purchase_fee", formatStorageDetailMoney(firstStorageDetailValue(serviceDetails.purchaseTotal, estimate.purchaseTotal)));
      setValue("box_delivery_date", firstStorageDetailValue(order.box_delivery_date, serviceDetails.boxDeliveryDate, estimate.boxDeliveryDate));
      setValue("box_delivery_time_slot", firstStorageDetailValue(order.box_delivery_time_slot, serviceDetails.boxDeliveryTimeSlot));
      setValue("box_delivery_method", storageMethodLabel(firstStorageDetailValue(order.box_delivery_method, serviceDetails.boxDeliveryMethod, estimate.boxDeliveryMethod), "楼下交接"));
      setValue("box_delivery_address", order.address_full || "");
      setValue("box_delivery_notes", firstStorageDetailValue(order.notes, serviceDetails.notes));
      setValue("storage_intake_date", storageIntakeDate(order) === "--" ? "" : storageIntakeDate(order));
      setValue("storage_start_date", storageStartDate(order) === "--" ? "" : storageStartDate(order));
      setValue("storage_end_date", storageEndDate(order) === "--" ? "" : storageEndDate(order));
      setValue("storage_days", firstStorageDetailValue(estimate.days && `${estimate.days} 天`, serviceDetails.storageDays));
      setValue("storage_fee", formatStorageDetailMoney(firstStorageDetailValue(estimate.discountedBase, estimate.storageTotal, serviceDetails.storageFee)));
      setValue("storage_pickup_method", storageMethodLabel(firstStorageDetailValue(estimate.pickupMethod, serviceDetails.pickupMethod), firstStorageDetailValue(serviceDetails.pickupMethodLabel)));
      setValue("storage_return_method", storageMethodLabel(firstStorageDetailValue(estimate.returnType, serviceDetails.returnType), firstStorageDetailValue(serviceDetails.returnTypeLabel)));
      setValue("related_order_no", order.related_order_no || serviceDetails.relatedOrderNo || "");
      setValue("estimated_box_count", firstStorageDetailValue(order.estimated_box_count, serviceDetails.itemCount));
      setValue("item_description", firstStorageDetailValue(order.item_description, serviceDetails.itemDescription));
      setValue("box_type_summary", formatStorageBoxTypeSummary(order));
      setValue("address_full", order.address_full || "");
      setValue("room_or_building", order.room_or_building || "");
      setValue("postcode", order.postcode || "");
      setValue("has_lift", storageBoolValue(order.has_lift));
      setValue("needs_upstairs", storageBoolValue(order.needs_upstairs));
      setValue("notes", order.notes || "");
      setValue(
        "final_readable_message",
        readableMessageNeedsRebuild(order.final_readable_message)
          ? buildStorageDetailReadableMessage(order)
          : order.final_readable_message
      );
      if (form) {
        form.hidden = false;
      }
    }

    async function loadOrder() {
      if (!orderId) {
        showMessage("缺少订单 ID，无法加载寄存订单详情。", true);
        return;
      }
      showMessage("正在加载订单详情...");
      try {
        const order = await AdminApi.getStorageOrder(orderId);
        populate(order);
        showMessage("");
      } catch (error) {
        showMessage(error.message || "订单详情加载失败", true);
      }
    }

    form?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!orderId) {
        showMessage("缺少订单 ID，无法保存。", true);
        return;
      }

      setSaving(true);
      showMessage("正在保存修改...");
      try {
        const resolvedOrderType = resolveStorageOrderType(currentOrder || {});
        const payload = {
          service_time_slot: readText("service_time_slot"),
          address_full: readText("address_full"),
          room_or_building: readText("room_or_building"),
          postcode: readText("postcode"),
          box_delivery_date: readText("box_delivery_date"),
          box_delivery_time_slot: readText("box_delivery_time_slot"),
          box_delivery_method: readText("box_delivery_method"),
          storage_intake_date: readText("storage_intake_date"),
          storage_start_date: readText("storage_start_date"),
          storage_end_date: readText("storage_end_date"),
          has_lift: readBoolean("has_lift"),
          needs_upstairs: readBoolean("needs_upstairs"),
          notes: readText("notes"),
          final_readable_message: readText("final_readable_message")
        };
        if (resolvedOrderType === "storage_return") {
          payload.service_date = readText("service_date");
          payload.estimated_box_count = readText("estimated_box_count");
          payload.related_order_no = readText("related_order_no");
          payload.item_description = readText("item_description");
        }
        const updated = await AdminApi.updateStorageOrder(orderId, payload);
        populate({ ...(currentOrder || {}), ...updated });
        showMessage("保存成功，已更新寄存订单详情。");
      } catch (error) {
        showMessage(error.message || "保存失败，已保留当前填写内容。", true);
      } finally {
        setSaving(false);
      }
    });

    loadOrder();
  }

  document.addEventListener("admin:shell-ready", event => {
    currentSession = event.detail?.session || null;
    initDashboardPage();
    initUsersPage();
    initManagersPage();
    initStoragePage();
    initStorageDetailPage();
  });
})();
