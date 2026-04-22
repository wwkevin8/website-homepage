(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  const STATUS_LABELS = {
    pending_confirmation: "待确认",
    confirmed: "已确认",
    cancelled: "已取消",
    draft: "草稿",
    open: "进行中",
    grouped: "已拼单",
    closed: "已完成"
  };

  const SERVICE_LABELS = {
    pickup: "接机",
    dropoff: "送机",
    storage: "寄存"
  };

  let currentPage = 1;
  let totalPages = 1;
  let currentOrderDetail = null;

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

  function escape(value) {
    return AdminShell.escapeHtml(value || "--");
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || "--";
  }

  function serviceLabel(serviceType) {
    return SERVICE_LABELS[serviceType] || serviceType || "--";
  }

  function summarizeOperation(item) {
    const before = item.before_data || {};
    const after = item.after_data || {};
    const changes = [];

    if (before.status !== after.status && after.status) {
      changes.push(`状态：${statusLabel(before.status)} -> ${statusLabel(after.status)}`);
    }
    if (before.customer_name !== after.customer_name && after.customer_name) {
      changes.push(`姓名：${before.customer_name || "--"} -> ${after.customer_name}`);
    }
    if (before.phone !== after.phone && Object.prototype.hasOwnProperty.call(after, "phone")) {
      changes.push(`手机号：${before.phone || "--"} -> ${after.phone || "--"}`);
    }
    if (
      before.wechat_or_whatsapp !== after.wechat_or_whatsapp &&
      Object.prototype.hasOwnProperty.call(after, "wechat_or_whatsapp")
    ) {
      changes.push(`联系方式：${before.wechat_or_whatsapp || "--"} -> ${after.wechat_or_whatsapp || "--"}`);
    }
    if (Object.prototype.hasOwnProperty.call(after, "note")) {
      changes.push(`备注：${after.note}`);
    }
    if (before.archived !== after.archived && Object.prototype.hasOwnProperty.call(after, "archived")) {
      changes.push(after.archived ? "订单已归档" : "订单已取消归档");
    }

    return changes.length ? changes.join("；") : (item.action || "已更新订单");
  }

  function formatOperationSentence(item) {
    const adminName = item.admin_user?.name || item.admin_user?.username || "系统";
    const actionSummary = summarizeOperation(item);
    return `${adminName} 在 ${formatDateTime(item.created_at)} 修改了：${actionSummary}`;
  }

  function statusBadge(status) {
    const tone = status === "cancelled"
      ? "is-danger"
      : status === "confirmed" || status === "closed"
        ? "is-success"
        : status === "grouped"
          ? "is-warning"
          : "is-neutral";

    return `<span class="admin-status-badge ${tone}">${escape(statusLabel(status))}</span>`;
  }

  function showMessage(text, isError) {
    const message = document.querySelector("#adminOrdersMessage");
    if (!message) {
      return;
    }

    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(isError));
    message.classList.toggle("is-success", Boolean(text && !isError));
  }

  function renderPagination(container, page, totalPageCount, total) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${Math.max(totalPageCount, 1)} 页，共 ${total || 0} 条</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${page >= totalPageCount ? "disabled" : ""}>下一页</button>
    `;
  }

  function getFilters() {
    const form = document.querySelector("#adminOrdersFilters");

    return {
      archived: form?.archived?.value || "active",
      order_no: form?.order_no?.value || "",
      customer_name: form?.customer_name?.value || "",
      phone: form?.phone?.value || "",
      service_type: form?.service_type?.value || "",
      status: form?.status?.value || "",
      created_from: form?.created_from?.value || "",
      created_to: form?.created_to?.value || "",
      sort: form?.sort?.value || "latest",
      page_size: form?.page_size?.value || "10"
    };
  }

  function renderOrdersTable(payload) {
    const root = document.querySelector("#adminOrdersList");
    const pagination = document.querySelector("#adminOrdersPagination");

    if (!root) {
      return;
    }

    const items = payload.items || [];
    const meta = payload.pagination || {};
    totalPages = Number(meta.total_pages) || 1;

    if (!items.length) {
      root.innerHTML = `
        <section class="admin-panel">
          <div class="admin-empty-state">
            <h2>暂无符合条件的订单</h2>
            <p>可以调整搜索、筛选或切换到历史订单再试一次。</p>
          </div>
        </section>
      `;
      renderPagination(pagination, currentPage, totalPages, meta.total || 0);
      return;
    }

    root.innerHTML = `
      <section class="admin-panel">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>订单编号</th>
                <th>服务类型</th>
                <th>客户</th>
                <th>联系方式</th>
                <th>状态</th>
                <th>服务日期</th>
                <th>最近更新时间</th>
                <th>归档</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td><strong>${escape(item.order_no)}</strong></td>
                  <td>${escape(serviceLabel(item.service_type))}</td>
                  <td>
                    <strong>${escape(item.customer_name)}</strong>
                    <div class="admin-table-note">${escape(item.source_table === "storage_orders" ? "寄存订单" : "接送机订单")}</div>
                  </td>
                  <td>
                    <div>${escape(item.phone)}</div>
                    <div class="admin-table-note">${escape(item.wechat_or_whatsapp)}</div>
                  </td>
                  <td>${statusBadge(item.status)}</td>
                  <td>${escape(item.pickup_date || item.storage_start_date || "--")}</td>
                  <td>${escape(formatDateTime(item.updated_at))}</td>
                  <td>${item.archived ? '<span class="admin-status-badge is-neutral">已归档</span>' : '<span class="admin-status-badge is-success">活跃</span>'}</td>
                  <td>
                    <button class="button button-secondary admin-table-action" type="button" data-order-view="${escape(item.id)}">查看详情</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;

    renderPagination(pagination, currentPage, totalPages, meta.total || 0);
  }

  function renderLogList(container, items, renderer, emptyText) {
    if (!container) {
      return;
    }

    if (!items.length) {
      container.innerHTML = `<div class="admin-log-empty">${escape(emptyText)}</div>`;
      return;
    }

    container.innerHTML = items.map(renderer).join("");
  }

  function openDrawer(detail) {
    const drawer = document.querySelector("#adminOrderDrawer");
    const title = document.querySelector("#adminOrderDrawerTitle");
    const grid = document.querySelector("#adminOrderDetailGrid");

    currentOrderDetail = detail;

    if (!drawer || !title || !grid) {
      return;
    }

    const order = detail.order;
    const detailRows = [
      ["订单编号", order.order_no],
      ["服务类型", serviceLabel(order.service_type)],
      ["订单来源", order.source_table === "storage_orders" ? "寄存" : "接送机"],
      ["客户姓名", order.customer_name],
      ["手机号", order.phone || "--"],
      ["微信 / WhatsApp", order.wechat_or_whatsapp || "--"],
      ["当前状态", statusLabel(order.status)],
      ["服务日期", order.pickup_date || order.storage_start_date || "--"],
      ["航班号", order.flight_no || "--"],
      ["创建时间", formatDateTime(order.created_at)],
      ["最近更新时间", formatDateTime(order.updated_at)],
      ["归档状态", order.archived ? `已归档（${formatDateTime(order.archived_at)}）` : "活跃"]
    ];

    title.textContent = `订单详情 / ${order.order_no}`;
    grid.innerHTML = detailRows.map(([label, value]) => `
      <div class="admin-detail-item">
        <strong>${escape(label)}</strong>
        <span>${escape(value)}</span>
      </div>
    `).join("");

    renderLogList(
      document.querySelector("#adminOrderOperationLogs"),
      detail.operation_logs || [],
      (item) => `
        <article class="admin-log-card">
          <p>${escape(formatOperationSentence(item))}</p>
        </article>
      `,
      "暂无管理员修改记录"
    );

    drawer.hidden = false;
    document.body.classList.add("admin-overlay-open");
  }

  function closeDrawer() {
    const drawer = document.querySelector("#adminOrderDrawer");
    if (!drawer) {
      return;
    }

    drawer.hidden = true;
    document.body.classList.remove("admin-overlay-open");
  }

  async function fetchAndOpenOrder(orderId) {
    showMessage("正在加载订单详情...");
    try {
      const detail = await AdminApi.getOrder(orderId);
      showMessage("");
      openDrawer(detail);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function render(page) {
    const list = document.querySelector("#adminOrdersList");
    currentPage = page;

    if (list) {
      list.innerHTML = '<div class="admin-loading">正在加载订单列表...</div>';
    }

    try {
      const payload = await AdminApi.listOrders({
        page,
        ...getFilters()
      });
      renderOrdersTable(payload);
    } catch (error) {
      if (list) {
        list.innerHTML = `<section class="admin-panel"><div class="admin-empty-state"><h2>订单列表加载失败</h2><p>${escape(error.message)}</p></div></section>`;
      }
      showMessage(error.message, true);
    }
  }

  document.addEventListener("admin:shell-ready", () => {
    const root = document.querySelector("#adminOrdersPage");
    if (!root) {
      return;
    }

    const form = document.querySelector("#adminOrdersFilters");
    const tabs = document.querySelector("#adminOrdersTabs");
    const pagination = document.querySelector("#adminOrdersPagination");
    const drawer = document.querySelector("#adminOrderDrawer");

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      render(1);
    });

    form?.addEventListener("reset", () => {
      window.setTimeout(() => {
        form.archived.value = "active";
        form.page_size.value = "10";
        tabs?.querySelectorAll("[data-orders-tab]").forEach((button) => {
          button.classList.toggle("is-active", button.getAttribute("data-orders-tab") === "active");
        });
        render(1);
      }, 0);
    });

    tabs?.addEventListener("click", (event) => {
      const eventTarget = event.target;
      const target = eventTarget instanceof Element ? eventTarget.closest("[data-orders-tab]") : null;
      if (!target || !form) {
        return;
      }

      const nextTab = target.getAttribute("data-orders-tab");
      form.archived.value = nextTab === "archived" ? "archived" : "active";
      tabs.querySelectorAll("[data-orders-tab]").forEach((button) => {
        button.classList.toggle("is-active", button === target);
      });
      render(1);
    });

    root.addEventListener("click", (event) => {
      const eventTarget = event.target;
      const orderButton = eventTarget instanceof Element ? eventTarget.closest("[data-order-view]") : null;
      const archiveRunButton = eventTarget instanceof Element ? eventTarget.closest("[data-orders-archive-run]") : null;

      if (orderButton) {
        fetchAndOpenOrder(orderButton.getAttribute("data-order-view"));
        return;
      }

      if (archiveRunButton) {
        const months = Number.parseInt(archiveRunButton.getAttribute("data-orders-archive-run"), 10) || 6;
        showMessage(`正在归档 ${months} 个月前已完成订单...`);
        AdminApi.runArchive(months)
          .then((result) => {
            showMessage(`已归档 ${result.archived_count || 0} 条订单`);
            render(1);
          })
          .catch((error) => showMessage(error.message, true));
      }
    });

    pagination?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.getAttribute("data-page-action");
      if (action === "prev" && currentPage > 1) {
        render(currentPage - 1);
      }
      if (action === "next" && currentPage < totalPages) {
        render(currentPage + 1);
      }
    });

    document.querySelectorAll("[data-admin-order-drawer-close]").forEach((button) => {
      button.addEventListener("click", closeDrawer);
    });

    drawer?.addEventListener("click", (event) => {
      if (event.target === drawer) {
        closeDrawer();
      }
    });

    render(1);
  });
})();
