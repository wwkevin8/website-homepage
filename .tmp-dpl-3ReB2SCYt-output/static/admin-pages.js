(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  let currentSession = null;

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
      { label: "邮箱", value: user.email || "--" },
      { label: "昵称", value: user.nickname || "未填写" }
    ]);

    renderDetailItems(document.querySelector("#adminUserBaseGrid"), [
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

  function renderStorageOrdersTable(payload) {
    const table = document.querySelector("#adminStorageList");
    const pagination = document.querySelector("#adminStoragePagination");
    if (!table) {
      return;
    }

    const items = payload.items || [];
    if (!items.length) {
      table.innerHTML = `
        <div class="admin-panel">
          <div class="admin-empty-state">
            <h2>\u6682\u65e0\u5bc4\u5b58\u9884\u7ea6\u8ba2\u5355</h2>
            <p>\u53ef\u4ee5\u8c03\u6574\u641c\u7d22\u6216\u7b5b\u9009\u6761\u4ef6\u540e\u91cd\u8bd5\u3002</p>
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
              <th>\u8ba2\u5355\u7f16\u53f7</th>
              <th>\u63d0\u4ea4\u65f6\u95f4</th>
              <th>\u59d3\u540d</th>
              <th>\u5fae\u4fe1</th>
              <th>\u7535\u8bdd</th>
              <th>\u670d\u52a1\u65e5\u671f</th>
              <th>\u9884\u8ba1\u603b\u4ef7</th>
              <th>\u8ba2\u5355\u72b6\u6001</th>
              <th>\u901a\u77e5\u72b6\u6001</th>
              <th>\u64cd\u4f5c</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td><strong>${AdminShell.escapeHtml(item.order_no || "--")}</strong></td>
                <td>${AdminShell.escapeHtml(formatDateTime(item.created_at))}</td>
                <td>${AdminShell.escapeHtml(item.customer_name || "--")}</td>
                <td>${AdminShell.escapeHtml(item.wechat_id || "--")}</td>
                <td>${AdminShell.escapeHtml(item.phone || "--")}</td>
                <td>${AdminShell.escapeHtml(item.service_date || "--")}</td>
                <td>${AdminShell.escapeHtml(typeof item.estimated_total_price === "number" ? `£${item.estimated_total_price.toFixed(2)}` : `£${Number(item.estimated_total_price || 0).toFixed(2)}`)}</td>
                <td><span class="admin-status-badge is-neutral">${AdminShell.escapeHtml(item.status || "--")}</span></td>
                <td>
                  <span class="admin-status-badge ${item.notification_status === "sent" ? "is-success" : item.notification_status === "failed" ? "is-danger" : "is-neutral"}">${AdminShell.escapeHtml(item.notification_status || "--")}</span>
                  ${item.notification_error ? `<div class="admin-table-note">${AdminShell.escapeHtml(item.notification_error)}</div>` : ""}
                </td>
                <td>
                  <button class="button button-secondary admin-table-action" type="button" data-storage-view="${AdminShell.escapeHtml(item.id)}">\u67e5\u770b\u8be6\u60c5</button>
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
      const drawer = document.querySelector("#adminStorageDrawer");
      const detailGrid = document.querySelector("#adminStorageDetailGrid");
      const readableMessage = document.querySelector("#adminStorageReadableMessage");
      let currentPage = 1;
      let totalPages = 1;
      let latestItems = [];

    function closeStorageDrawer() {
      if (!drawer) {
        return;
      }
      drawer.hidden = true;
      document.body.classList.remove("admin-overlay-open");
    }

    function openStorageDrawer(item) {
      if (!drawer || !detailGrid || !readableMessage || !item) {
        return;
      }

      const detailRows = [
        ["订单编号", item.order_no || "--"],
        ["客户姓名", item.customer_name || "--"],
        ["微信号", item.wechat_id || "--"],
        ["联系电话", item.phone || "--"],
        ["服务日期", item.service_date || "--"],
        ["服务时间", item.service_time === "evening" ? "晚上" : item.service_time === "daytime" ? "白天" : "--"],
        ["服务项目", item.service_label || "--"],
        ["箱子数量预估", item.estimated_box_count ?? "--"],
        ["预计总价", typeof item.estimated_total_price === "number" ? `£${item.estimated_total_price.toFixed(2)}` : `£${Number(item.estimated_total_price || 0).toFixed(2)}`],
        ["订单状态", item.status || "--"],
        ["通知状态", item.notification_status || "--"],
        ["朋友代取", item.friend_pickup ? `是${item.friend_phone ? `（${item.friend_phone}）` : ""}` : "否"],
        ["完整地址", item.address_full || "--"],
        ["备注", item.notes || "--"],
        ["通知错误", item.notification_error || "--"]
      ];

      detailGrid.innerHTML = detailRows.map(([label, value]) => `
        <div class="admin-detail-item">
          <strong>${AdminShell.escapeHtml(String(label))}</strong>
          <span>${AdminShell.escapeHtml(String(value))}</span>
        </div>
      `).join("");

      readableMessage.textContent = item.final_readable_message || "暂无客服摘要";
      drawer.hidden = false;
      document.body.classList.add("admin-overlay-open");
    }

    async function render() {
      const table = document.querySelector("#adminStorageList");
      if (table) {
        table.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u5bc4\u5b58\u9884\u7ea6\u8ba2\u5355...</div>';
      }

      try {
        const payload = await AdminApi.listStorageOrders({
          page: currentPage,
          page_size: form?.page_size?.value || 20,
          search: form?.search?.value || "",
          status: form?.status?.value || "",
          notification_status: form?.notification_status?.value || ""
        });
        totalPages = Number(payload?.pagination?.total_pages || 1);
        latestItems = payload.items || [];
        renderStorageOrdersTable(payload);
      } catch (error) {
        if (table) {
          table.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>\u52a0\u8f7d\u5931\u8d25</h2><p>${AdminShell.escapeHtml(error.message)}</p></div></div>`;
        }
      }
    }

    form?.addEventListener("submit", event => {
      event.preventDefault();
      currentPage = 1;
      render();
    });

    document.querySelectorAll("[data-admin-storage-drawer-close]").forEach(button => {
      button.addEventListener("click", closeStorageDrawer);
    });

    drawer?.addEventListener("click", event => {
      if (event.target === drawer) {
        closeStorageDrawer();
      }
    });

    root.addEventListener("click", event => {
      const button = event.target.closest("[data-storage-view]");
      if (!button) {
        return;
      }
      const item = latestItems.find(entry => String(entry.id) === String(button.getAttribute("data-storage-view")));
      if (item) {
        openStorageDrawer(item);
      }
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

  document.addEventListener("admin:shell-ready", event => {
    currentSession = event.detail?.session || null;
    initDashboardPage();
    initUsersPage();
    initManagersPage();
    initStoragePage();
  });
})();
