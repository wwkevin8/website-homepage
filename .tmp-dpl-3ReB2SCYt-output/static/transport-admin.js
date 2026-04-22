(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;
  if (!Shared || !Api) return;
  const ADMIN_SESSION_CACHE_KEY = "ngn_admin_session_cache";

  const q = name => new URLSearchParams(window.location.search).get(name) || "";

  async function requireSession() {
    try {
      const raw = window.sessionStorage.getItem(ADMIN_SESSION_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.authenticated && cached?.is_admin) {
          return true;
        }
      }
    } catch (error) {}
    const session = await Api.session().catch(() => ({ authenticated: false, is_admin: false }));
    if (!session.authenticated || !session.is_admin) {
      window.location.href = "./admin-login.html";
      return false;
    }
    return true;
  }

  function bindLogout() {
    document.querySelectorAll("[data-transport-logout]").forEach(button => {
      if (button.dataset.transportLogoutBound === "true") return;
      button.dataset.transportLogoutBound = "true";
      button.addEventListener("click", async event => {
        event.preventDefault();
        await Api.logout().catch(() => {});
        window.location.href = "./admin-login.html";
      });
    });
  }

  function msg(node, text, isError = false) {
    Shared.showMessage(node, text, isError);
  }

  function fillDateTimeInput(node, value) {
    if (!node) return;
    if (!value) {
      node.value = "";
      return;
    }
    const date = new Date(value);
    node.value = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
  }

  const DISPATCH_SUMMARY_START = "[dispatch_summary_override]";
  const DISPATCH_SUMMARY_END = "[/dispatch_summary_override]";

  function resolveGroupPickupTime(groupLike) {
    if (!groupLike || typeof groupLike !== "object") return null;
    return groupLike.preferred_time_start
      || groupLike.flight_time_reference
      || groupLike.summary?.arrival_time_range?.earliest
      || groupLike.arrival_range?.earliest
      || null;
  }

  function resolveGroupPickupTimeRange(groupLike) {
    if (!groupLike || typeof groupLike !== "object") return "--";
    const explicitPickupTime = resolveGroupPickupTime(groupLike);
    if (explicitPickupTime) {
      return Shared.formatDateTime(explicitPickupTime) || "--";
    }
    const arrivalRange = groupLike.summary?.arrival_time_range || groupLike.arrival_range || {};
    if (arrivalRange.earliest && arrivalRange.latest) {
      return `${Shared.formatDateTime(arrivalRange.earliest)} - ${Shared.formatDateTime(arrivalRange.latest)}`;
    }
    return Shared.formatDateTime(arrivalRange.earliest || arrivalRange.latest) || "--";
  }

  function extractDispatchSummaryOverride(notes) {
    const text = String(notes || "");
    const start = text.indexOf(DISPATCH_SUMMARY_START);
    const end = text.indexOf(DISPATCH_SUMMARY_END);
    if (start === -1 || end === -1 || end < start) return "";
    return text.slice(start + DISPATCH_SUMMARY_START.length, end).trim();
  }

  function stripDispatchSummaryOverride(notes) {
    const text = String(notes || "");
    if (!text.includes(DISPATCH_SUMMARY_START) || !text.includes(DISPATCH_SUMMARY_END)) {
      return text.trim();
    }
    return text
      .replace(new RegExp(`\\s*${DISPATCH_SUMMARY_START}[\\s\\S]*?${DISPATCH_SUMMARY_END}\\s*`, "g"), "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function mergeGroupNotesWithDispatchSummaryOverride(notes, overrideText) {
    const cleanNotes = stripDispatchSummaryOverride(notes);
    const cleanOverride = String(overrideText || "").trim();
    if (!cleanOverride) {
      return cleanNotes || null;
    }
    return [cleanNotes, `${DISPATCH_SUMMARY_START}\n${cleanOverride}\n${DISPATCH_SUMMARY_END}`]
      .filter(Boolean)
      .join("\n\n");
  }

  function londonDatePart(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : "";
  }

  function setRequestHints(form) {
    const type = Shared.fieldValue(form, '[name="service_type"]');
    const fromInput = form.querySelector('[name="location_from"]');
    const toInput = form.querySelector('[name="location_to"]');
    const flightLabel = form.querySelector("[data-flight-datetime-label]");
    const terminalLabel = form.querySelector("[data-terminal-label]");
    if (type === "dropoff") {
      if (fromInput) fromInput.placeholder = "例如：Nottingham";
      if (toInput) toInput.placeholder = "例如：LHR";
      if (flightLabel) flightLabel.textContent = "出发时间";
      if (terminalLabel) terminalLabel.textContent = "出发航站楼";
      return;
    }
    if (fromInput) fromInput.placeholder = "例如：LHR";
    if (toInput) toInput.placeholder = "例如：Nottingham";
    if (flightLabel) flightLabel.textContent = "到达时间";
    if (terminalLabel) terminalLabel.textContent = "到达航站楼";
  }

  function requestStatusBadge(requestLike) {
    const request = requestLike && typeof requestLike === "object" ? requestLike : { status: requestLike };
    const status = String(request?.status || "");
    const referenceTime = request?.flight_datetime || request?.preferred_time_start || request?.preferred_time_end || null;
    const isExpired = request?.closed_reason === "expired"
      || request?.service_status_code === "closed"
      || (status === "closed" && referenceTime && !Number.isNaN(new Date(referenceTime).getTime()) && Date.now() >= new Date(referenceTime).getTime());
    const tone = status === "matched" ? "is-success" : status === "closed" || isExpired ? "is-neutral" : "is-warning";
    const label = isExpired ? "已过期" : Shared.requestStatusLabel(status || "-");
    return `<span class="admin-status-badge ${tone}">${Shared.escapeHtml(label)}</span>`;
  }

  function groupStatusBadge(groupLike) {
    const status = String(groupLike?.status || "");
    const groupDate = String(groupLike?.group_date || "").trim();
    const today = Shared.getLondonTodayIsoDate();
    if (groupDate && groupDate === today) {
      return '<span class="admin-status-badge is-success">发车</span>';
    }
    const tone = status === "closed" || status === "cancelled"
      ? "is-neutral"
      : status === "full"
        ? "is-success"
        : "is-warning";
    return `<span class="admin-status-badge ${tone}">${Shared.escapeHtml(Shared.groupStatusLabel(status || "-"))}</span>`;
  }

  function buildPaymentAdminNote(adminNote, nextStatus) {
    const text = String(adminNote || "").replace(/\[payment:(paid|unpaid)\]/ig, "").trim();
    const prefix = `[payment:${nextStatus}]`;
    return text ? `${prefix}\n${text}` : prefix;
  }

  function paymentUpdateMessage(result, nextStatus) {
    if (nextStatus !== "paid") {
      return "已标记为未付款。";
    }
    const paymentEmail = result?.payment_email;
    if (!paymentEmail) {
      return "已标记为已付款。";
    }
    if (paymentEmail.error) {
      return `已标记为已付款，但确认邮件发送失败：${paymentEmail.error}`;
    }
    if (paymentEmail.skipped) {
      if (paymentEmail.reason === "missing email context") {
        return "已标记为已付款，但这张订单未绑定学生邮箱，系统未发送确认邮件。";
      }
      return `已标记为已付款，但系统跳过了邮件发送：${paymentEmail.reason || "缺少邮件信息"}`;
    }
    return `已标记为已付款，确认邮件已发送至 ${paymentEmail.email || "学生邮箱"}。`;
  }

  function renderGroupPaymentStatus(item) {
    const payment = item?.payment_summary || {};
    const total = Number(payment.total_member_count || 0);
    const paid = Number(payment.paid_member_count || 0);
    const allPaid = Boolean(payment.all_members_paid);
    if (total <= 0) {
      return '<span class="admin-status-badge is-neutral">无成员</span>';
    }
    if (allPaid) {
      return `<span class="admin-status-badge is-success">已全部付款</span><div class="admin-table-subtle">${paid}/${total}</div>`;
    }
    return `<span class="admin-status-badge is-warning">未全部付款</span><div class="admin-table-subtle">${paid}/${total} 已付款</div>`;
  }

  function renderGroupPayAllAction(item) {
    const payment = item?.payment_summary || {};
    const total = Number(payment.total_member_count || 0);
    const unpaid = Number(payment.unpaid_member_count || 0);
    if (total <= 0) {
      return '<span class="admin-table-subtle">无成员</span>';
    }
    if (unpaid <= 0) {
      return '<button class="button button-secondary admin-table-action" type="button" disabled>已全部付款</button>';
    }
    return `<button class="button button-secondary admin-table-action" type="button" data-pay-all-group="${Shared.escapeHtml(item.id || item.group_id || "")}" data-pay-all-group-name="${Shared.escapeHtml(item.group_id || item.id || "--")}">确认全部付款</button>`;
  }

  function requestGroupLink(item) {
    const groupId = String(item?.group_id || "").trim();
    const groupRef = String(item?.group_ref || item?.group_id || "").trim();
    if (!groupId || !groupRef) {
      return '<span class="admin-table-subtle">--</span>';
    }
    return `<a href="./transport-admin-group-edit.html?id=${encodeURIComponent(groupRef)}"><strong>${Shared.escapeHtml(groupId)}</strong></a>`;
  }

  function renderFutureRequestHint(item) {
    const sameServiceOrderNos = Array.isArray(item?.same_service_future_order_nos)
      ? item.same_service_future_order_nos.filter(Boolean)
      : Array.isArray(item?.future_duplicate_order_nos)
        ? item.future_duplicate_order_nos.filter(Boolean)
        : [];
    const crossServiceOrderNos = Array.isArray(item?.cross_service_future_order_nos)
      ? item.cross_service_future_order_nos.filter(Boolean)
      : [];

    if (sameServiceOrderNos.length) {
      return `<div class="admin-table-warning">同账号未来重复单：${Shared.escapeHtml(sameServiceOrderNos.join("、"))}</div>`;
    }

    if (crossServiceOrderNos.length) {
      return `<div class="admin-table-notice">同账号未来订单：${Shared.escapeHtml(crossServiceOrderNos.join("、"))}（接机 + 送机）</div>`;
    }

    return "";
  }

  function requestFlightDateLabel(item) {
    const raw = item?.flight_datetime || item?.preferred_time_start || item?.preferred_time_end;
    if (!raw) return "--";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "--";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    const hour = parts.find(part => part.type === "hour")?.value;
    const minute = parts.find(part => part.type === "minute")?.value;
    if (!year || !month || !day || !hour || !minute) return "--";
    return `${year}/${month}/${day} ${hour}:${minute}`;
  }

  function requestFlightTimeLabel(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const hour = parts.find(part => part.type === "hour")?.value;
    const minute = parts.find(part => part.type === "minute")?.value;
    if (!hour || !minute) return "--";
    return `${hour}:${minute}`;
  }

  function displayGroupName(groupLike) {
    if (!groupLike) return "--";
    return String(groupLike.group_id || groupLike.id || "--");
  }

  function remainingSeats(group) {
    return Math.max(Number(group?.max_passengers || 0) - Number(group?.current_passenger_count || 0), 0);
  }

  function renderPagination(container, page, totalPages) {
    if (!container) return;
    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${Math.max(totalPages, 1)} 页</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  function requestPayloadFromForm(form, existingRequest = null) {
    const resolvedStatus = existingRequest?.status || "published";
    const resolvedClosedAt = resolvedStatus === "closed" ? (existingRequest?.closed_at || new Date().toISOString()) : null;
    const resolvedClosedReason = resolvedStatus === "closed" ? (existingRequest?.closed_reason || "admin_closed") : null;
    return {
      service_type: Shared.fieldValue(form, '[name="service_type"]'),
      student_name: Shared.fieldValue(form, '[name="student_name"]'),
      email: Shared.fieldValue(form, '[name="student_email"]') || null,
      phone: Shared.fieldValue(form, '[name="phone"]'),
      wechat: Shared.fieldValue(form, '[name="wechat"]'),
      passenger_count: 1,
      luggage_count: Number.parseInt(existingRequest?.luggage_count, 10) || 0,
      airport_code: Shared.fieldValue(form, '[name="airport_code"]'),
      airport_name: Shared.fieldValue(form, '[name="airport_name"]'),
      terminal: Shared.fieldValue(form, '[name="terminal"]'),
      flight_no: Shared.fieldValue(form, '[name="flight_no"]'),
      flight_datetime: Shared.fieldValue(form, '[name="flight_datetime"]'),
      location_from: Shared.fieldValue(form, '[name="location_from"]'),
      location_to: Shared.fieldValue(form, '[name="location_to"]'),
      preferred_time_start: Shared.fieldValue(form, '[name="preferred_time_start"]') || null,
      preferred_time_end: null,
      shareable: true,
      status: resolvedStatus,
      notes: Shared.fieldValue(form, '[name="notes"]'),
      admin_note: Shared.fieldValue(form, '[name="admin_note"]'),
      closed_at: resolvedClosedAt,
      closed_reason: resolvedClosedReason
    };
  }

  function requestPayloadFromRecord(record) {
    if (!record) return null;
    return {
      service_type: record.service_type || "pickup",
      student_name: record.student_name || "",
      email: record.student_email || record.email || "",
      phone: record.phone || "",
      wechat: record.wechat || "",
      passenger_count: Number.parseInt(record.passenger_count, 10) || 1,
      luggage_count: Number.parseInt(record.luggage_count, 10) || 0,
      airport_code: record.airport_code || "",
      airport_name: record.airport_name || "",
      terminal: record.terminal || "",
      flight_no: record.flight_no || "",
      flight_datetime: record.flight_datetime || null,
      location_from: record.location_from || "",
      location_to: record.location_to || "",
      preferred_time_start: record.preferred_time_start || null,
      preferred_time_end: record.preferred_time_end || null,
      shareable: typeof record.shareable === "boolean" ? record.shareable : true,
      status: record.status || "published",
      notes: record.notes || "",
      admin_note: record.admin_note || "",
      closed_at: record.closed_at || null,
      closed_reason: record.closed_reason || null
    };
  }

  function requestFormStateFromRecord(record) {
    if (!record) return {};
    return {
      service_type: record.service_type || "pickup",
      student_name: record.student_name || "",
      student_email: record.student_email || record.email || "",
      phone: record.phone || "",
      wechat: record.wechat || "",
      passenger_count: Number.parseInt(record.passenger_count, 10) || 1,
      airport_code: record.airport_code || "",
      airport_name: record.airport_name || "",
      terminal: record.terminal || "",
      flight_no: record.flight_no || "",
      location_from: record.location_from || "",
      location_to: record.location_to || "",
      notes: record.notes || "",
      admin_note: record.admin_note || ""
    };
  }

  function populateRequestForm(form, record) {
    const formState = requestFormStateFromRecord(record);
    Object.entries(formState).forEach(([key, value]) => {
      if (!form[key]) return;
      if (form[key].type === "checkbox") {
        form[key].checked = Boolean(value);
        return;
      }
      form[key].value = value ?? "";
    });
    fillDateTimeInput(form.flight_datetime, record?.flight_datetime);
    fillDateTimeInput(form.preferred_time_start, record?.preferred_time_start);
    hydrateRequestLuggageDisplay(form, record);
    Shared.syncAirportNameField(form.airport_code, form.airport_name);
    setRequestHints(form);
  }

  function parseLuggageTextFromNotes(notes) {
    const match = String(notes || "").match(/行李[:：]\s*([^|\n\r]+)/);
    return match ? match[1].trim() : "";
  }

  function luggageSummaryLabel(request, member) {
    const luggageText = parseLuggageTextFromNotes(request?.notes);
    if (luggageText) {
      return luggageText;
    }
    const luggageCount = Number(request?.luggage_count || member?.luggage_count_snapshot || 0);
    return luggageCount > 0 ? `共 ${luggageCount} 件` : "--";
  }

  function ensureRequestLuggageDisplayField(form) {
    const existingField = form.querySelector('[name="luggage_display"]');
    if (existingField instanceof HTMLTextAreaElement) {
      return existingField;
    }
    const legacyGroup = form.querySelector("#transportRequestLuggageGroup");
    if (legacyGroup instanceof HTMLElement) {
      legacyGroup.hidden = true;
      const wrapper = document.createElement("label");
      wrapper.className = "field transport-field-span-2";
      wrapper.innerHTML = '<span>行李数量</span><textarea name="luggage_display" rows="3" readonly></textarea>';
      legacyGroup.insertAdjacentElement("afterend", wrapper);
      return wrapper.querySelector('[name="luggage_display"]');
    }
    return null;
  }

  function hydrateRequestLuggageDisplay(form, request) {
    const displayField = ensureRequestLuggageDisplayField(form);
    if (!(displayField instanceof HTMLTextAreaElement)) return;
    const luggageText = parseLuggageTextFromNotes(request?.notes);
    displayField.value = luggageText || (Number(request?.luggage_count || 0) > 0 ? `共 ${Number(request.luggage_count || 0)} 件` : "--");
  }

  function groupPayloadFromForm(form) {
    const current = Number.parseInt(Shared.fieldValue(form, '[name="current_passenger_count"]'), 10) || 0;
    const remaining = Number.parseInt(Shared.fieldValue(form, '[name="remaining_passenger_count"]'), 10) || 0;
    return {
      service_type: Shared.fieldValue(form, '[name="service_type"]'),
      group_date: Shared.fieldValue(form, '[name="group_date"]') || null,
      airport_code: Shared.fieldValue(form, '[name="airport_code"]'),
      airport_name: Shared.fieldValue(form, '[name="airport_name"]'),
      terminal: Shared.fieldValue(form, '[name="terminal"]'),
      location_from: Shared.fieldValue(form, '[name="location_from"]'),
      location_to: Shared.fieldValue(form, '[name="location_to"]'),
      flight_time_reference: Shared.fieldValue(form, '[name="flight_time_reference"]') || null,
      preferred_time_start: Shared.fieldValue(form, '[name="preferred_time_start"]') || null,
      preferred_time_end: Shared.fieldValue(form, '[name="preferred_time_end"]') || null,
      current_passenger_count: current,
      max_passengers: current + remaining,
      visible_on_frontend: Shared.fieldValue(form, '[name="visible_on_frontend"]') === "true",
      status: Shared.fieldValue(form, '[name="status"]'),
      notes: Shared.fieldValue(form, '[name="notes"]')
    };
  }

  async function initRequestsListPage() {
    const root = document.querySelector("#transportRequestsPage");
    if (!root || !(await requireSession())) return;
    bindLogout();
    const form = document.querySelector("#transportRequestFilters");
    const list = document.querySelector("#transportRequestsList");
    const message = document.querySelector("#transportRequestsMessage");
    const pagination = document.querySelector("#transportRequestsPagination");
    const exportButton = document.querySelector("#transportRequestsExport");
    let page = 1;
    let totalPages = 1;
    Shared.populateAirportCodeSelect(form.airport_code, true);

    function buildRequestFilters() {
      return {
        order_no: form.order_no.value,
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        status: form.status.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value,
        sort: form.sort?.value || "submitted_latest"
      };
    }

    async function render(nextPage = 1) {
      page = nextPage;
      list.innerHTML = '<div class="admin-loading">正在加载接送机订单...</div>';
      pagination.innerHTML = "";
      const payload = await Api.listRequests({
        paginate: true,
        page,
        page_size: 10,
        ...buildRequestFilters()
      }).catch(error => {
        msg(message, error.message, true);
        return null;
      });
      if (!payload) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      totalPages = Number(payload.pagination?.total_pages) || 1;
      msg(message, `当前第 ${page} / ${Math.max(totalPages, 1)} 页，共 ${Number(payload.pagination?.total || 0)} 条订单。`);
      if (!items.length) {
        list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>暂无符合条件的订单</h2><p>请调整筛选条件后重试。</p></div></section>';
        renderPagination(pagination, page, totalPages);
        return;
      }
      list.innerHTML = `
        <section class="admin-panel"><div class="admin-table-wrap"><table class="admin-table">
          <thead><tr>
            <th>Order No</th><th>提交时间</th><th>学生</th><th>服务</th><th>机场</th><th>航班</th><th>您抵达/起飞日期和时间</th><th>目的地</th><th>行李数</th><th>Group ID</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td><strong>${Shared.escapeHtml(item.order_no || "--")}</strong></td>
                <td>${Shared.escapeHtml(Shared.formatDateTime(item.created_at))}</td>
                <td>
                  <strong>${Shared.escapeHtml(item.student_name || "--")}</strong>
                  <div class="admin-table-subtle">${Shared.escapeHtml(item.phone || "--")}</div>
                  <div class="admin-table-subtle">${Shared.escapeHtml(item.student_email || "--")}</div>
                  ${renderFutureRequestHint(item)}
                </td>
                <td>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</td>
                <td><strong>${Shared.escapeHtml(item.airport_code || "--")}</strong><div class="admin-table-subtle">${Shared.escapeHtml(item.terminal || "--")}</div></td>
                <td><strong>${Shared.escapeHtml(item.flight_no || "--")}</strong></td>
                <td>${Shared.escapeHtml(requestFlightDateLabel(item))}</td>
                <td>${Shared.escapeHtml(item.location_to || "--")}</td>
                <td>${Number(item.luggage_count || 0)}</td>
                <td>${requestGroupLink(item)}</td>
                <td><div class="admin-table-actions">
                  <a class="button button-secondary admin-table-action" href="./transport-admin-request-edit.html?id=${encodeURIComponent(item.id)}">查看</a>
                  <button class="button button-danger admin-table-action" type="button" data-delete-request="${item.id}" data-delete-order-no="${Shared.escapeHtml(item.order_no || "--")}">删除</button>
                </div></td>
              </tr>
            `).join("")}
          </tbody>
        </table></div></section>
      `;
      renderPagination(pagination, page, totalPages);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });
    form.status?.addEventListener("change", () => render(1));
    form.sort?.addEventListener("change", () => render(1));
    form.addEventListener("reset", () => window.setTimeout(() => render(1), 0));
    exportButton?.addEventListener("click", async () => {
      exportButton.disabled = true;
      msg(message, "正在生成 Excel 文件...");
      try {
        const filename = await Api.downloadRequestsExcel(buildRequestFilters());
        msg(message, `${filename} 已开始下载。`);
      } catch (error) {
        msg(message, error.message, true);
      } finally {
        exportButton.disabled = false;
      }
    });
    pagination.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-page-action");
      if (action === "prev" && page > 1) render(page - 1);
      if (action === "next" && page < totalPages) render(page + 1);
    });
    list.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const requestId = target.getAttribute("data-delete-request");
      const orderNo = target.getAttribute("data-delete-order-no") || "该订单";
      if (!requestId) return;
      if (!window.confirm(`确定删除 ${orderNo} 吗？删除后无法恢复。`)) return;
      msg(message, `正在删除 ${orderNo}...`);
      try {
        await Api.deleteRequest(requestId);
        const nextPage = page > 1 && list.querySelectorAll("tbody tr").length <= 1 ? page - 1 : page;
        msg(message, `${orderNo} 已删除。`);
        await render(nextPage);
      } catch (error) {
        msg(message, error.message, true);
      }
    });
    render(1);
  }

  async function initRequestFormPage() {
    const root = document.querySelector("#transportRequestFormPage");
    if (!root || !(await requireSession())) return;
    bindLogout();
    const form = document.querySelector("#transportRequestForm");
    const message = document.querySelector("#transportRequestMessage");
    const assignSection = document.querySelector("#transportRequestAssignSection");
    const assignHint = document.querySelector("#transportRequestAssignHint");
    const assignList = document.querySelector("#transportRequestAssignableGroups");
    const legacyAssignRow = document.querySelector("#transportRequestGroupSelect")?.closest(".transport-inline-actions") || null;
    const forceAssignForm = document.querySelector("#transportRequestForceAssignForm");
    if (legacyAssignRow instanceof HTMLElement) {
      legacyAssignRow.remove();
    }
    const pageActions = root.querySelector(".admin-page-actions");
    const currentGroupHint = (() => {
      if (!(message instanceof HTMLElement) || !(message.parentElement instanceof HTMLElement)) return null;
      let node = document.querySelector("#transportRequestCurrentGroupHint");
      if (node instanceof HTMLElement) return node;
      node = document.createElement("p");
      node.id = "transportRequestCurrentGroupHint";
      node.className = "transport-form-message transport-field-span-2 is-success";
      message.insertAdjacentElement("afterend", node);
      return node;
    })();
    const undoButton = document.querySelector("#transportRequestUndoButton") || (() => {
      if (!(pageActions instanceof HTMLElement)) return null;
      const button = document.createElement("button");
      button.className = "button button-secondary";
      button.type = "button";
      button.id = "transportRequestUndoButton";
      button.textContent = "撤回上次操作";
      button.disabled = true;
      pageActions.appendChild(button);
      return button;
    })();
    const formActions = form?.querySelector(".transport-card-actions");
    const deleteButton = document.querySelector("#transportRequestDeleteButton") || (() => {
      if (!(formActions instanceof HTMLElement)) return null;
      const button = document.createElement("button");
      button.className = "button button-danger";
      button.type = "button";
      button.id = "transportRequestDeleteButton";
      button.textContent = "删除订单";
      button.hidden = true;
      formActions.appendChild(button);
      return button;
    })();
    const requestId = q("id");
    let currentRequest = null;
    let lastUndoAction = null;

    Shared.populateAirportCodeSelect(form.airport_code, false);
    form.service_type.addEventListener("change", () => setRequestHints(form));
    setRequestHints(form);
    ensureRequestLuggageDisplayField(form);

    function setUndoAction(action) {
      lastUndoAction = action;
      if (undoButton) {
        undoButton.disabled = !action;
      }
    }

    function renderCurrentGroupHint(request) {
      if (!(currentGroupHint instanceof HTMLElement)) return;
      const groupId = String(request?.group_id || "").trim();
      const groupRef = String(request?.group_ref || "").trim();
      const orderNo = String(request?.order_no || "").trim();
      if (!groupId || !groupRef) {
        currentGroupHint.hidden = true;
        currentGroupHint.innerHTML = "";
        return;
      }
      currentGroupHint.hidden = false;
      currentGroupHint.innerHTML = `当前订单 ${Shared.escapeHtml(orderNo || "--")} 当前拼车组为 <a href="./transport-admin-group-edit.html?id=${encodeURIComponent(groupRef)}"><strong>${Shared.escapeHtml(groupId)}</strong></a>。点击可查看当前拼车组详情。`;
    }

    async function assignToGroup(targetGroupId) {
      if (!requestId || !targetGroupId) return;
      const fromGroupId = displayGroupName(currentRequest);
      msg(message, "正在更换拼车组...");
      try {
        const previousRequest = currentRequest ? JSON.parse(JSON.stringify(currentRequest)) : null;
        const targetGroup = await Api.getGroup(targetGroupId);
        const previousTargetRequestIds = Array.from(new Set((targetGroup.members || []).map(item => item.request_id).filter(Boolean)));
        const requestIds = new Set(previousTargetRequestIds);
        requestIds.add(requestId);
        await Api.saveGroupMembers(targetGroupId, Array.from(requestIds));
        const refreshed = await Api.getRequest(requestId);
        currentRequest = refreshed;
        await loadAssignableGroups(refreshed);
        setUndoAction({
          label: "更换拼车组",
          run: async () => {
            if (previousRequest?.group_id) {
              const previousGroup = await Api.getGroup(previousRequest.group_id);
              const previousGroupRequestIds = Array.from(new Set((previousGroup.members || []).map(item => item.request_id).filter(Boolean)));
              previousGroupRequestIds.push(requestId);
              await Api.saveGroupMembers(previousRequest.group_id, Array.from(new Set(previousGroupRequestIds)));
              return;
            }
            await Api.saveGroupMembers(targetGroupId, previousTargetRequestIds);
          }
        });
        msg(message, `订单已从 ${fromGroupId} 更换到 ${displayGroupName(targetGroup)}，系统已确保该订单只属于一个拼车组。`);
      } catch (error) {
        msg(message, error.message, true);
      }
    }

    async function loadAssignableGroups(request) {
      if (!assignSection) return;
      const refDate = londonDatePart(request.flight_datetime || request.preferred_time_start || request.preferred_time_end);
      const payload = await Api.listGroups({
        service_type: request.service_type,
        airport_code: request.airport_code,
        date_from: refDate || undefined,
        date_to: refDate || undefined
      }).catch(() => []);
      const groups = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
      const candidates = groups.filter(group => group.group_id !== request.group_id);
      if (assignHint) {
        const currentGroupText = request.group_id ? request.group_id : "当前独立 group_id";
        assignHint.textContent = `当前订单从 ${currentGroupText} 更换到目标拼车组后，会自动退出原拼车组，确保一单仅属于一个拼车组。`;
      }
      assignList.innerHTML = candidates.length ? candidates.map(group => `
        <article class="transport-assign-card">
          <div>
            <strong>${Shared.escapeHtml(group.group_id)}</strong>
            <p>${Shared.escapeHtml(group.airport_code)} / ${Shared.escapeHtml(group.terminal || "--")} / ${Shared.escapeHtml(Shared.formatDate(group.group_date))}</p>
            <p>${Shared.escapeHtml(group.location_to || "--")} / 当前 ${Number(group.current_passenger_count || 0)} 人 / 剩余 ${remainingSeats(group)} 位</p>
          </div>
          <button class="button button-secondary" type="button" data-assign-group="${group.id}">更换到该拼车组</button>
        </article>
      `).join("") : '<div class="transport-empty">当前没有其他可更换的拼车组。</div>';
      assignList.querySelectorAll("[data-assign-group]").forEach(button => button.addEventListener("click", () => assignToGroup(button.getAttribute("data-assign-group"))));
      assignSection.hidden = false;
    }

    if (requestId) {
      if (deleteButton) deleteButton.hidden = false;
      currentRequest = await Api.getRequest(requestId).catch(error => {
        msg(message, error.message, true);
        return null;
      });
      if (!currentRequest) return;
      populateRequestForm(form, currentRequest);
      await loadAssignableGroups(currentRequest);
      renderCurrentGroupHint(currentRequest);
    } else {
      Shared.syncAirportNameField(form.airport_code, form.airport_name);
      renderCurrentGroupHint(null);
      if (deleteButton) deleteButton.hidden = true;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      msg(message, "正在保存订单...");
      try {
        const previousRequest = currentRequest ? JSON.parse(JSON.stringify(currentRequest)) : null;
        const payload = requestPayloadFromForm(form, currentRequest);
        const result = requestId ? await Api.updateRequest(requestId, payload) : await Api.createRequest(payload);
        msg(message, `订单已保存。Group ID: ${result.group_id || "--"}`);
        if (!requestId) {
          window.location.href = `./transport-admin-request-edit.html?id=${encodeURIComponent(result.id)}`;
          return;
        }
        currentRequest = result;
        renderCurrentGroupHint(currentRequest);
        setUndoAction(previousRequest ? {
          label: "编辑订单",
          run: async () => {
            await Api.updateRequest(requestId, requestPayloadFromRecord(previousRequest));
          }
        } : null);
        await loadAssignableGroups(result);
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    forceAssignForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const raw = String(forceAssignForm.elements.source_order_no?.value || "").trim().toUpperCase();
      if (!raw) {
        msg(message, "请输入目标 Group ID。", true);
        return;
      }
      if (!raw.startsWith("GRP-")) {
        msg(message, "只能输入 Group ID，例如 GRP-260413-ED6D。", true);
        return;
      }
      await assignToGroup(raw);
    });

    deleteButton?.addEventListener("click", async () => {
      if (!requestId || !currentRequest) return;
      const orderNo = currentRequest.order_no || "该订单";
      if (!window.confirm(`确定删除 ${orderNo} 吗？删除后无法恢复。`)) return;
      msg(message, `正在删除 ${orderNo}...`);
      try {
        await Api.deleteRequest(requestId);
        window.location.href = "./transport-admin-requests.html";
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    undoButton?.addEventListener("click", async () => {
      if (!lastUndoAction || !requestId) return;
      const action = lastUndoAction;
      msg(message, "正在撤回上次操作...");
      try {
        setUndoAction(null);
        await action.run();
        currentRequest = await Api.getRequest(requestId);
        populateRequestForm(form, currentRequest);
        await loadAssignableGroups(currentRequest);
        renderCurrentGroupHint(currentRequest);
        msg(message, `已撤回上次操作：${action.label}。`);
      } catch (error) {
        setUndoAction(action);
        msg(message, error.message, true);
      }
    });
  }

  async function initGroupsListPage() {
    const root = document.querySelector("#transportGroupsPage");
    if (!root || !(await requireSession())) return;
    bindLogout();
    const form = document.querySelector("#transportGroupFilters");
    const list = document.querySelector("#transportGroupsList");
    const message = document.querySelector("#transportGroupQuickJumpMessage");
    const pagination = document.querySelector("#transportGroupsPagination");
    let page = 1;
    let totalPages = 1;
    let currentItems = [];
    const filtersMain = form?.querySelector(".transport-group-filters-main");
    const filtersSide = form?.querySelector(".transport-group-filters-side");
    const filterActions = form?.querySelector(".transport-group-filter-actions") || null;
    const orderField = form?.order_no?.closest(".field") || null;
    const serviceField = form?.service_type?.closest(".field") || null;
    const airportField = form?.airport_code?.closest(".field") || null;
    const statusField = form?.status?.closest(".field") || null;
    const dateFromField = form?.date_from?.closest(".field") || null;
    const dateToField = form?.date_to?.closest(".field") || null;
    if (filtersMain instanceof HTMLElement) {
      [orderField, serviceField, airportField, statusField, dateFromField, dateToField]
        .filter(field => field instanceof HTMLElement)
        .forEach(field => filtersMain.appendChild(field));
      if (filterActions instanceof HTMLElement) {
        filtersMain.appendChild(filterActions);
      }
    }
    Shared.populateAirportCodeSelect(form.airport_code, true);
    if (form.status) {
      form.status.innerHTML = [
        '<option value="active" selected>拼车中</option>',
        '<option value="closed">已过期</option>'
      ].join("");
    }
    const visibleOnFrontendField = form.visible_on_frontend?.closest(".field") || null;
    if (visibleOnFrontendField instanceof HTMLElement) {
      visibleOnFrontendField.remove();
    }
    if (filtersSide instanceof HTMLElement) {
      filtersSide.querySelectorAll(".field").forEach(field => field.remove());
    }

    function buildGroupMemberRows(item) {
      const orderNos = Array.isArray(item.source_order_nos) ? item.source_order_nos : [];
      const studentNames = Array.isArray(item.student_names) ? item.student_names : [];
      const memberDetails = Array.isArray(item.member_details) ? item.member_details : [];
      const rowCount = Math.max(orderNos.length, studentNames.length, memberDetails.length, 1);

      return Array.from({ length: rowCount }, (_, index) => {
        const detail = memberDetails[index] || {};
        return {
          orderNo: orderNos[index] || "--",
          studentName: studentNames[index] || "--",
          serviceLabel: Shared.serviceLabel(item.service_type),
          groupDate: Shared.formatDate(item.group_date),
          airportTime: `${item.airport_code || "--"} ${detail.terminal || item.terminal || "--"} / ${requestFlightTimeLabel(detail.flight_datetime || item.flight_time_reference || item.preferred_time_start)}`,
          destination: item.location_to || "--"
        };
      });
    }

    function renderGroupMemberStack(lines, formatter, extraClass = "") {
      return `
        <div class="transport-groups-member-stack ${extraClass}">
          ${lines.map((line, index) => `<div class="transport-groups-member-line${index === 0 ? " is-primary" : ""}">${formatter(line, index)}</div>`).join("")}
        </div>
      `;
    }

    async function render(nextPage = 1) {
      page = nextPage;
      list.innerHTML = '<div class="admin-loading">正在加载拼车组...</div>';
      pagination.innerHTML = "";
      const payload = await Api.listGroups({
        paginate: true,
        page,
        page_size: 10,
        order_no: form.order_no.value,
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        status: form.status.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value
      }).catch(error => {
        msg(message, error.message, true);
        return null;
      });
      if (!payload) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      currentItems = items;
      totalPages = Number(payload.pagination?.total_pages) || 1;
      msg(message, `当前第 ${page} / ${Math.max(totalPages, 1)} 页，共 ${Number(payload.pagination?.total || 0)} 个拼车组。`);
      if (!items.length) {
        list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>暂无符合条件的拼车组</h2><p>请调整筛选条件后重试。</p></div></section>';
        renderPagination(pagination, page, totalPages);
        return;
      }
      list.innerHTML = `
          <section class="admin-panel">
            <div class="admin-table-wrap transport-groups-table-wrap" data-transport-groups-scroll-wrap><table class="admin-table transport-groups-table">
            <thead><tr>
              <th>Group ID</th><th>同学姓名</th><th>服务</th><th>出行日期</th><th>机场 / 时间</th><th>目的地</th><th>当前人数 / 座位数</th><th>是否全部已付款</th><th>一键确认全部付款</th><th>状态</th><th>操作</th>
            </tr></thead>
            <tbody>
              ${items.map(item => `
                ${(() => {
                  const memberRows = buildGroupMemberRows(item);
                  return `
                <tr>
                  <td class="transport-groups-cell transport-groups-cell-group">
                    <strong class="transport-groups-group-id">${Shared.escapeHtml(item.group_id || item.id || "--")}</strong>
                    ${renderGroupMemberStack(memberRows, line => `<span class="admin-table-subtle">${Shared.escapeHtml(line.orderNo)}</span>`)}
                  </td>
                  <td class="transport-groups-cell">
                    ${renderGroupMemberStack(memberRows, line => `<strong>${Shared.escapeHtml(line.studentName)}</strong>`)}
                    ${renderFutureRequestHint(item)}
                  </td>
                  <td class="transport-groups-cell transport-groups-cell-center">${renderGroupMemberStack(memberRows, line => Shared.escapeHtml(line.serviceLabel), "transport-groups-member-stack-center")}</td>
                  <td class="transport-groups-cell">${renderGroupMemberStack(memberRows, line => Shared.escapeHtml(line.groupDate))}</td>
                  <td class="transport-groups-cell">${renderGroupMemberStack(memberRows, line => Shared.escapeHtml(line.airportTime))}</td>
                  <td class="transport-groups-cell">${renderGroupMemberStack(memberRows, line => Shared.escapeHtml(line.destination))}</td>
                  <td class="transport-groups-cell transport-groups-cell-center"><strong>${Number(item.current_passenger_count || 0)} / ${Number(item.max_passengers || 0)}</strong></td>
                  <td class="transport-groups-cell transport-groups-cell-center">${renderGroupPaymentStatus(item)}</td>
                  <td class="transport-groups-cell transport-groups-cell-center">${renderGroupPayAllAction(item)}</td>
                  <td class="transport-groups-cell transport-groups-cell-center">${groupStatusBadge(item)}</td>
                <td><div class="admin-table-actions">
                  <a class="button button-secondary admin-table-action" href="./transport-admin-group-edit.html?id=${encodeURIComponent(item.id || item.group_id)}">查看</a>
                  <button class="button button-danger admin-table-action" type="button" data-delete-group="${Shared.escapeHtml(item.id || item.group_id)}" data-delete-group-name="${Shared.escapeHtml(item.group_id || item.id || "--")}">删除</button>
                </div></td>
              </tr>
            `;
                })()}
            `).join("")}
          </tbody>
        </table></div>
      </section>
      `;
      renderPagination(pagination, page, totalPages);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });
    form.status?.addEventListener("change", () => render(1));
    form.addEventListener("reset", () => window.setTimeout(() => render(1), 0));
    pagination.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-page-action");
      if (action === "prev" && page > 1) render(page - 1);
      if (action === "next" && page < totalPages) render(page + 1);
    });
    list.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const payAllGroupRef = target.getAttribute("data-pay-all-group");
      const payAllGroupName = target.getAttribute("data-pay-all-group-name") || "该拼车组";
      if (payAllGroupRef) {
        const listItem = currentItems.find(item => String(item.id || item.group_id) === String(payAllGroupRef));
        const unpaidCount = Number(listItem?.payment_summary?.unpaid_member_count || 0);
        if (unpaidCount <= 0) {
          msg(message, `${payAllGroupName} 当前没有待确认付款成员。`);
          return;
        }
        if (!window.confirm(`确定把 ${payAllGroupName} 组内 ${unpaidCount} 位未付款成员全部标记为已付款吗？`)) return;
        msg(message, `正在确认 ${payAllGroupName} 全部付款...`);
        try {
          const group = await Api.getGroup(payAllGroupRef);
          const members = Array.isArray(group?.members) ? group.members : [];
          const unpaidMembers = members.filter(member => {
            const requestId = member.transport_requests?.id || member.request_id;
            return requestId && member.payment_status !== "paid";
          });
          if (!unpaidMembers.length) {
            msg(message, `${payAllGroupName} 当前已经全部付款。`);
            await render(page);
            return;
          }
          let updatedCount = 0;
          const failedMembers = [];
          for (const member of unpaidMembers) {
            const requestId = member.transport_requests?.id || member.request_id;
            try {
              await Api.updateRequest(requestId, {
                admin_note: buildPaymentAdminNote(member.transport_requests?.admin_note, "paid")
              });
              updatedCount += 1;
            } catch (error) {
              failedMembers.push(`${member.transport_requests?.student_name || member.transport_requests?.order_no || requestId}: ${error.message}`);
            }
          }
          await render(page);
          if (!failedMembers.length) {
            msg(message, `${payAllGroupName} 已确认 ${updatedCount} 位成员付款。`);
            return;
          }
          const failureSuffix = failedMembers.length === 1
            ? failedMembers[0]
            : `失败 ${failedMembers.length} 人：${failedMembers.join("；")}`;
          const successPrefix = updatedCount > 0 ? `已确认 ${updatedCount} 位成员付款，` : "";
          msg(message, `${payAllGroupName} ${successPrefix}${failureSuffix}`, true);
        } catch (error) {
          msg(message, error.message, true);
        }
        return;
      }
      const groupRef = target.getAttribute("data-delete-group");
      const groupName = target.getAttribute("data-delete-group-name") || "该拼车组";
      if (!groupRef) return;
      try {
        const group = await Api.getGroup(groupRef);
        const memberCount = Array.isArray(group?.members) ? group.members.length : 0;
        if (memberCount > 0) {
          window.alert("请把当前拼车组成员移到其他组里。");
          return;
        }
        if (!window.confirm(`确定删除 ${groupName} 吗？`)) return;
        msg(message, `正在删除 ${groupName}...`);
        await Api.deleteGroup(groupRef);
        const nextPage = page > 1 && list.querySelectorAll("tbody tr").length <= 1 ? page - 1 : page;
        msg(message, `${groupName} 已删除。`);
        await render(nextPage);
      } catch (error) {
        msg(message, error.message, true);
      }
    });
    render(1);
  }

  async function initGroupFormPage() {
    const root = document.querySelector("#transportGroupFormPage");
    if (!root || !(await requireSession())) return;
    bindLogout();
    const form = document.querySelector("#transportGroupForm");
    const message = document.querySelector("#transportGroupMessage");
    const summaryGrid = document.querySelector("#transportGroupSummaryGrid");
    const dispatchSummary = document.querySelector("#transportGroupDispatchSummary");
    const judgementGrid = document.querySelector("#transportGroupJudgementGrid");
    const blockingReasons = document.querySelector("#transportGroupBlockingReasons");
    const membersPanel = document.querySelector("#transportGroupMembersPanel");
    const membersList = document.querySelector("#transportGroupMembersList");
    const currentMembers = document.querySelector("#transportGroupCurrentMembers");
    const assignHint = document.querySelector("#transportGroupAssignHint");
    const saveMembersButton = document.querySelector("#transportGroupSaveMembersButton");
    const forceAssignForm = document.querySelector("#transportGroupForceAssignForm");
    const membersHeaderHint = membersPanel?.querySelector(".transport-panel-header p") || null;
    const pageActions = root.querySelector(".admin-page-actions");
    const undoButton = document.querySelector("#transportGroupUndoButton") || (() => {
      if (!(pageActions instanceof HTMLElement)) return null;
      const button = document.createElement("button");
      button.className = "button button-secondary";
      button.type = "button";
      button.id = "transportGroupUndoButton";
      button.textContent = "撤回上次操作";
      button.disabled = true;
      pageActions.appendChild(button);
      return button;
    })();
    const groupId = q("id");
    let currentGroup = null;
    let lastUndoAction = null;

    if (form?.airport_code) {
      Shared.populateAirportCodeSelect(form.airport_code, false);
    }

    // Remove legacy join-member helper copy even if an old cached HTML shell is served.
    if (membersHeaderHint instanceof HTMLElement) {
      membersHeaderHint.remove();
    }
    if (assignHint instanceof HTMLElement) {
      assignHint.remove();
    }

    function setUndoAction(action) {
      lastUndoAction = action;
      if (undoButton) {
        undoButton.disabled = !action;
      }
    }

    function summaryCard(label, value, tone = "") {
      return `
        <article class="transport-group-summary-card ${tone}">
          <span>${Shared.escapeHtml(label)}</span>
          <strong>${value}</strong>
        </article>
      `;
    }

    function summaryItem(label, value, extraClass = "") {
      return `
        <div class="transport-group-summary-item ${extraClass}">
          <span>${Shared.escapeHtml(label)}</span>
          <strong>${value}</strong>
        </div>
      `;
    }

  function formatMoney(value) {
    return `£${Number(value || 0).toFixed(2)}`;
  }

  function formatCompactDateTime(value) {
    const formatted = Shared.formatDateTime(value);
    return formatted === "--" ? formatted : String(formatted).replace(",", "");
  }

  function parseLuggageCounts(text, fallbackCount = 0) {
    const raw = String(text || "").trim();
    const bigMatch = raw.match(/(\d+)\s*大/);
    const smallMatch = raw.match(/(\d+)\s*小/);
    const big = bigMatch ? Number.parseInt(bigMatch[1], 10) || 0 : 0;
    const small = smallMatch ? Number.parseInt(smallMatch[1], 10) || 0 : 0;
    if (big || small) {
      return {
        big,
        small,
        parsed: true
      };
    }
    const count = Number(fallbackCount || 0);
    return {
      big: count,
      small: 0,
      parsed: false
    };
  }

  function formatLuggageCounts(big, small) {
    return `${Number(big || 0)}大${Number(small || 0)}小`;
  }

  function buildMemberLuggageSummary(request, member) {
    const luggageText = parseLuggageTextFromNotes(request?.notes);
    const counts = parseLuggageCounts(luggageText, request?.luggage_count || member?.luggage_count_snapshot || 0);
    return {
      text: counts.parsed
        ? formatLuggageCounts(counts.big, counts.small)
        : (luggageText || (Number(request?.luggage_count || member?.luggage_count_snapshot || 0) > 0
            ? `共${Number(request?.luggage_count || member?.luggage_count_snapshot || 0)}件`
            : "--")),
      big: counts.big,
      small: counts.small
    };
  }

  function formatDispatchServiceDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const year = String(date.getFullYear()).slice(-2);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  function compactDispatchRemark(group, members) {
    const summary = group.summary || group;
    const memberSummary = (members || []).map(member => {
      const request = member.transport_requests || {};
      return `${request.student_name || "--"}(${request.order_no || "--"})`;
    }).join("、") || "暂无成员";
    const terminalList = Array.from(new Set((members || []).map(member => String(member.transport_requests?.terminal || "").trim()).filter(Boolean)));
    const terminalSummary = terminalList.join(" / ") || group.terminal || summary.terminal_summary || "--";
    const pickupTime = resolveGroupPickupTimeRange(group);
    const contactSummary = (members || []).map(member => member.transport_requests?.phone).filter(Boolean).join("，") || "--";
    const nameSummary = (members || []).map(member => member.transport_requests?.student_name).filter(Boolean).join("，") || "--";
    const lines = [
      `Group ID：${summary.group_id || group.group_id || "--"}；成员：${memberSummary}；航站楼：${terminalSummary}；接机时间：${pickupTime}。`,
      `同学姓名：${nameSummary}`,
      `联系电话：${contactSummary}`
    ];
    return lines.join("\n");
  }

  function buildGeneratedDispatchSummary(group) {
    const summary = group.summary || group;
    const members = Array.isArray(group.members) ? group.members : [];
    const payment = group.payment_summary || {};
    const isDropoff = group.service_type === "dropoff";
    const serviceType = isDropoff ? "送机" : "接机";
    const dispatchTime = formatCompactDateTime(resolveGroupPickupTime(group));
    const serviceDate = formatDispatchServiceDate(resolveGroupPickupTime(group) || group.group_date);
    const terminalList = Array.from(new Set(members.map(member => String(member.transport_requests?.terminal || "").trim()).filter(Boolean)));
    const terminalSummary = terminalList.join(" / ") || group.terminal || summary.terminal_summary || "--";
    const airportDisplay = group.airport_name || group.airport_code || "--";
    const paymentLines = members.length
      ? members.map((member, index) => {
          const request = member.transport_requests || {};
          const paymentStatus = member.payment_status === "paid" ? "已付款" : "未付款";
          return `（${index + 1}）${request.student_name || "--"} 电话：${request.phone || "--"} 微信：${request.wechat || "--"} ${paymentStatus}`;
        }).join("\n")
      : "暂无成员";
    const memberLuggageTotals = members.reduce((sum, member) => {
      const request = member.transport_requests || {};
      const luggage = buildMemberLuggageSummary(request, member);
      return {
        big: sum.big + luggage.big,
        small: sum.small + luggage.small
      };
    }, { big: 0, small: 0 });
    const addressLabel = isDropoff ? "出发地" : "地址";
    const addressLines = members.length
      ? members.map((member, index) => {
          const request = member.transport_requests || {};
          const address = isDropoff
            ? (request.location_from || "--")
            : (request.location_to || "--");
          return `（${index + 1}）${address}`;
        }).join("\n")
      : (isDropoff ? "暂无出发地" : "暂无地址");
    const flightLines = members.length
      ? members.map((member, index) => {
          const request = member.transport_requests || {};
          const flightCode = request.flight_no || "--";
          const terminal = request.terminal || "--";
          const flightTime = formatCompactDateTime(request.flight_datetime);
          return `（${index + 1}）${airportDisplay}\t${terminal}\t${flightCode}\t${flightTime}`;
        }).join("\n")
      : "暂无航班信息";
    const crossTerminalText = summary.has_cross_terminal || group.has_cross_terminal
      ? `有，多航站楼加价 ${formatMoney(payment.cross_terminal_surcharge_total_gbp || 0)}`
      : "无";

    return `车服信息

1，用车类型和时间：${serviceDate}${serviceType}${terminalSummary}

2，航班信息：
${flightLines}

3，价格（有无多航站楼）：
人均 ${formatMoney(payment.average_price_gbp || 0)}；总价 ${formatMoney(payment.total_price_gbp || 0)}；多航站楼：${crossTerminalText}

4，几位和联系电话（以及付款情况）：
${paymentLines}

5，行李：默认2大1小/人，总计：${formatLuggageCounts(memberLuggageTotals.big, memberLuggageTotals.small)}

6，${addressLabel}：
${addressLines}

7，司机：
`;
  }

  function renderDispatchSummary(group) {
      if (!dispatchSummary) return;
      const overrideText = extractDispatchSummaryOverride(group.notes);
      const dispatchText = overrideText || buildGeneratedDispatchSummary(group);
      dispatchSummary.innerHTML = `
        <div class="transport-group-dispatch-summary-actions">
          <button class="button button-secondary admin-table-action" type="button" data-copy-dispatch-summary>一键复制</button>
          <button class="button button-secondary admin-table-action" type="button" data-reset-dispatch-summary ${overrideText ? "" : "disabled"}>恢复自动生成</button>
          <button class="button button-secondary admin-table-action" type="button" data-save-dispatch-summary>保存摘要</button>
        </div>
        <textarea class="transport-group-dispatch-summary-textarea" data-dispatch-summary-editor rows="18">${Shared.escapeHtml(dispatchText)}</textarea>
      `;
    }

    function renderGroupSummary(group) {
      if (!summaryGrid) return;
      const summary = group.summary || group;
      const serviceType = summary.service_type || group.service_type || "pickup";
      const serviceLabel = Shared.serviceLabel(serviceType);
      const currentCount = Number(summary.current_passenger_count || group.current_passenger_count || 0);
      const maxPassengers = Number(summary.max_passengers || group.max_passengers || 0);
      const pickupTimeEditorValue = (() => {
        const rawValue = resolveGroupPickupTime(group);
        if (!rawValue) return "";
        const date = new Date(rawValue);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
      })();
      const pickupTime = resolveGroupPickupTimeRange(group);
      summaryGrid.innerHTML = [
        summaryItem("创建时间", Shared.escapeHtml(Shared.formatDateTime(summary.created_at || group.created_at))),
        summaryItem("Group ID", Shared.escapeHtml(summary.group_id || group.group_id || "--"), "is-primary"),
        summaryItem("服务类型", `<span class="transport-inline-tag is-danger transport-inline-tag-service">${Shared.escapeHtml(serviceLabel)}</span>`, "is-primary"),
        summaryItem("当前拼车人数", String(currentCount)),
        `
          <div class="transport-group-summary-item transport-group-summary-input">
            <span>最大人数</span>
            <div class="transport-group-summary-input-row">
              <input type="number" min="${Math.max(currentCount, 1)}" step="1" value="${maxPassengers}" data-group-max-passengers>
              <button class="button button-secondary admin-table-action" type="button" data-save-group-max-passengers>保存</button>
            </div>
          </div>
        `,
        summaryItem("机场", Shared.escapeHtml([summary.airport_code || group.airport_code, summary.airport_name || group.airport_name].filter(Boolean).join(" · ") || "--")),
        summaryItem("航站楼情况", `${Shared.escapeHtml(summary.terminal_summary || "--")}${summary.has_cross_terminal ? '<span class="transport-inline-tag">跨航站楼 每人 +£15</span>' : ""}`),
        `
          <div class="transport-group-summary-item transport-group-summary-input">
            <span>${Shared.escapeHtml(`${serviceLabel}时间`)}</span>
            <div class="transport-group-summary-input-row">
              <input type="datetime-local" value="${Shared.escapeHtml(pickupTimeEditorValue)}" data-group-pickup-time aria-label="接机时间">
              <button class="button button-secondary admin-table-action" type="button" data-save-group-pickup-time>保存</button>
            </div>
            <strong>${Shared.escapeHtml(pickupTime)}</strong>
          </div>
        `,
        summaryItem("最近更新时间", Shared.escapeHtml(Shared.formatDateTime(summary.updated_at || group.updated_at)))
      ].join("");
    }

    function renderSystemJudgement(group) {
      if (!judgementGrid || !blockingReasons) return;
      const payment = group.payment_summary || {};
      const paymentItems = Array.isArray(payment.member_payments) ? payment.member_payments : [];
      judgementGrid.innerHTML = [
        summaryCard("总价", formatMoney(payment.total_price_gbp || 0), "is-primary"),
        summaryCard("跨航站楼", formatMoney(payment.cross_terminal_surcharge_total_gbp || 0)),
        summaryCard("当前人均价", formatMoney(payment.average_price_gbp || 0))
      ].join("");
      blockingReasons.innerHTML = paymentItems.length
        ? `
          <div class="transport-group-reasons-title">组内成员付款状态</div>
          <div class="transport-payment-list">
            ${paymentItems.map(item => `
              <div class="transport-payment-item">
                <div>
                  <strong>${Shared.escapeHtml(item.student_name || "--")}</strong>
                  <div class="admin-table-subtle">${Shared.escapeHtml(item.order_no || "--")}</div>
                </div>
                <div class="transport-payment-actions">
                  <span class="transport-inline-tag ${item.payment_status === "paid" ? "is-success" : "is-danger"}">${Shared.escapeHtml(item.payment_status === "paid" ? "已付款" : "未付款")}</span>
                  <button class="button button-secondary admin-table-action" type="button" data-payment-request="${item.request_id}" data-payment-status="${item.payment_status === "paid" ? "unpaid" : "paid"}">${item.payment_status === "paid" ? "标记未付款" : "标记已付款"}</button>
                </div>
              </div>
            `).join("")}
          </div>
        `
        : `<div class="transport-group-reasons-title">暂无成员付款状态</div>`;
    }

    async function saveGroupMaxPassengers() {
      if (!groupId || !currentGroup || !summaryGrid) return;
      const input = summaryGrid.querySelector("[data-group-max-passengers]");
      if (!(input instanceof HTMLInputElement)) return;
      const nextValue = Number.parseInt(input.value, 10) || 0;
      const currentCount = Number(currentGroup.summary?.current_passenger_count || currentGroup.current_passenger_count || 0);
      if (nextValue < Math.max(currentCount, 1)) {
        msg(message, `最大人数不能小于当前拼车人数 ${currentCount}。`, true);
        input.value = String(currentGroup.summary?.max_passengers || currentGroup.max_passengers || currentCount);
        return;
      }
      msg(message, "正在保存最大人数...");
      try {
        const previousMaxPassengers = Number(currentGroup.summary?.max_passengers || currentGroup.max_passengers || currentCount);
        await Api.updateGroup(groupId, { max_passengers: nextValue });
        await loadGroup(groupId);
        setUndoAction({
          label: "修改最大人数",
          run: async () => {
            await Api.updateGroup(groupId, { max_passengers: previousMaxPassengers });
          }
        });
        msg(message, `最大人数已更新为 ${nextValue}。`);
      } catch (error) {
        msg(message, error.message, true);
      }
    }

    async function saveGroupPickupTime() {
      if (!groupId || !currentGroup || !summaryGrid) return;
      const input = summaryGrid.querySelector("[data-group-pickup-time]");
      if (!(input instanceof HTMLInputElement)) return;
      const nextValue = String(input.value || "").trim();
      if (!nextValue) {
        msg(message, "请先输入接机时间。", true);
        return;
      }
      msg(message, "正在保存接机时间...");
      try {
        const previousPreferredTimeStart = currentGroup.preferred_time_start || null;
        const previousGroupDate = currentGroup.group_date || null;
        await Api.updateGroup(groupId, {
          preferred_time_start: nextValue,
          group_date: londonDatePart(nextValue) || previousGroupDate
        });
        await loadGroup(groupId);
        setUndoAction({
          label: "修改接机时间",
          run: async () => {
            await Api.updateGroup(groupId, {
              preferred_time_start: previousPreferredTimeStart,
              group_date: previousPreferredTimeStart
                ? (londonDatePart(previousPreferredTimeStart) || previousGroupDate)
                : previousGroupDate
            });
          }
        });
        msg(message, "接机时间已更新。");
      } catch (error) {
        msg(message, error.message, true);
      }
    }

    async function saveDispatchSummary(shouldReset = false) {
      if (!groupId || !currentGroup || !dispatchSummary) return;
      const editor = dispatchSummary.querySelector("[data-dispatch-summary-editor]");
      if (!(editor instanceof HTMLTextAreaElement)) return;
      const previousNotes = currentGroup.notes || null;
      const generatedSummary = buildGeneratedDispatchSummary(currentGroup);
      const nextSummary = shouldReset ? "" : String(editor.value || "").trim();
      const nextNotes = mergeGroupNotesWithDispatchSummaryOverride(previousNotes, nextSummary);
      msg(message, shouldReset ? "正在恢复自动摘要..." : "正在保存摘要...");
      try {
        await Api.updateGroup(groupId, { notes: nextNotes });
        await loadGroup(groupId);
        setUndoAction({
          label: shouldReset ? "恢复自动摘要" : "修改摘要",
          run: async () => {
            await Api.updateGroup(groupId, { notes: previousNotes });
          }
        });
        msg(message, shouldReset ? "已恢复自动生成摘要。" : "摘要已保存。");
      } catch (error) {
        editor.value = shouldReset ? generatedSummary : editor.value;
        msg(message, error.message, true);
      }
    }

    function applyGroup(group) {
      if (!form) return;
      Object.entries(group).forEach(([key, value]) => {
        if (!form[key]) return;
        form[key].value = value ?? "";
      });
      fillDateTimeInput(form.flight_time_reference, group.flight_time_reference);
      fillDateTimeInput(form.preferred_time_start, group.preferred_time_start);
      fillDateTimeInput(form.preferred_time_end, group.preferred_time_end);
      if (form.current_passenger_count) form.current_passenger_count.value = String(group.current_passenger_count || 0);
      if (form.remaining_passenger_count) form.remaining_passenger_count.value = String(remainingSeats(group));
      Shared.syncAirportNameField(form.airport_code, form.airport_name);
    }

    function renderCurrentMembers(group) {
      const members = group.members || [];
      currentMembers.innerHTML = members.length ? `
        <div class="admin-table-wrap">
          <table class="admin-table transport-group-members-table">
            <thead>
              <tr>
                <th>Order No</th>
                <th>姓名 / 角色</th>
                <th>订单状态</th>
                <th>联系方式</th>
                <th>机场 / 航班 / 落地时间</th>
                <th>航站楼</th>
                <th>行李</th>
                <th>目的地</th>
                <th>附加费</th>
                <th>付款状态</th>
                <th>加入时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(member => {
                const request = member.transport_requests || {};
                const requestRef = request.id || member.request_id || request.order_no || "";
                const requestActions = requestRef
                  ? `
                      <a class="button button-secondary admin-table-action" href="./transport-admin-request-edit.html?id=${encodeURIComponent(requestRef)}">查看订单详情</a>
                      <a class="button button-secondary admin-table-action" href="./transport-admin-request-edit.html?id=${encodeURIComponent(requestRef)}">更换拼车组</a>
                    `
                  : '<span class="admin-table-subtle">订单链接暂不可用</span>';
                return `
                  <tr>
                    <td><strong>${Shared.escapeHtml(request.order_no || "--")}</strong></td>
                    <td>
                      <strong>${Shared.escapeHtml(request.student_name || "--")}</strong>
                      <div class="admin-table-subtle">${member.is_initiator ? '<span class="admin-status-badge is-warning">initiator</span>' : "成员"}</div>
                    </td>
                    <td>${requestStatusBadge(request)}</td>
                    <td>
                      <div>${Shared.escapeHtml(request.phone || "--")}</div>
                      <div class="admin-table-subtle">${Shared.escapeHtml(request.wechat || "--")}</div>
                    </td>
                    <td>
                      <div><strong>${Shared.escapeHtml(request.airport_code || request.airport_name || "--")}</strong></div>
                      <strong>${Shared.escapeHtml(request.flight_no || "--")}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml(Shared.formatDateTime(request.flight_datetime))}</div>
                    </td>
                    <td>${Shared.escapeHtml(request.terminal || "--")}</td>
                    <td>${Shared.escapeHtml(luggageSummaryLabel(request, member))}</td>
                    <td>${Shared.escapeHtml(request.location_to || "--")}</td>
                    <td>${member.member_surcharge_gbp ? `£${Number(member.member_surcharge_gbp)}` : "£0"}</td>
                    <td><span class="transport-inline-tag ${member.payment_status === "paid" ? "is-success" : "is-danger"}">${Shared.escapeHtml(member.payment_status === "paid" ? "已付款" : "未付款")}</span></td>
                    <td>${Shared.escapeHtml(Shared.formatDateTime(member.joined_at || member.created_at || request.created_at))}</td>
                    <td>
                      <div class="admin-table-actions">
                        ${requestActions}
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      ` : '<div class="admin-empty-state"><h2>暂无组内成员</h2><p>可以从下方把个人订单加入该拼车组。</p></div>';
    }

    async function renderAssignableRequests(group) {
      const refDate = group.group_date || londonDatePart(group.flight_time_reference || group.preferred_time_start);
      const payload = await Api.listRequests({
        compact: true,
        service_type: group.service_type,
        airport_code: group.airport_code,
        status: "active",
        date_from: refDate || undefined,
        date_to: refDate || undefined
      }).catch(() => []);
      const requests = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
      const selectedIds = new Set((group.members || []).map(item => item.request_id));
      if (assignHint) {
        assignHint.textContent = "";
      }
      membersList.innerHTML = requests.filter(item => item.status !== "closed").map(item => `
        <label class="transport-check-card">
          <input type="checkbox" value="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""}>
          <div>
            <strong>${Shared.escapeHtml(item.order_no || "--")} / ${Shared.escapeHtml(item.student_name || "--")}</strong>
            <p>${Shared.escapeHtml(item.group_id || "--")} / ${Shared.escapeHtml(item.airport_code || "--")} / ${Shared.escapeHtml(item.terminal || "--")}</p>
            <p>${Shared.escapeHtml(Shared.formatDateTime(item.flight_datetime))} / ${Shared.escapeHtml(item.location_to || "--")}</p>
            <p>人数 ${Number(item.passenger_count || 0)} / 行李 ${Number(item.luggage_count || 0)}</p>
          </div>
        </label>
      `).join("");
      membersPanel.hidden = false;
    }

    async function loadGroup(id) {
      const group = await Api.getGroup(id).catch(error => {
        msg(message, error.message, true);
        return null;
      });
      if (!group) return null;
      currentGroup = group;
      applyGroup(group);
      renderGroupSummary(group);
      renderDispatchSummary(group);
      renderSystemJudgement(group);
      renderCurrentMembers(group);
      await renderAssignableRequests(group);
      msg(message, `当前拼车组：${group.group_id || group.id}`);
      return group;
    }

    form?.addEventListener("submit", async event => {
      event.preventDefault();
      msg(message, "正在保存拼车组...");
      try {
        const payload = groupPayloadFromForm(form);
        const result = groupId ? await Api.updateGroup(groupId, payload) : await Api.createGroup(payload);
        if (!groupId) {
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(result.id || result.group_id)}`;
          return;
        }
        await loadGroup(groupId);
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    saveMembersButton?.addEventListener("click", async () => {
      if (!groupId) return;
      const previousRequestIds = Array.from(new Set((currentGroup?.members || []).map(item => item.request_id).filter(Boolean)));
      const existingRequestIds = new Set((currentGroup?.members || []).map(item => item.request_id).filter(Boolean));
      const checkedRequestIds = Array.from(membersList.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
      const requestIds = Array.from(new Set([...existingRequestIds, ...checkedRequestIds]));
      if (!requestIds.length) {
        msg(message, "当前没有可保存的成员变更。");
        return;
      }
      msg(message, "正在保存组内成员...");
      try {
        await Api.saveGroupMembers(groupId, requestIds);
        await loadGroup(groupId);
        setUndoAction({
          label: "保存成员变更",
          run: async () => {
            await Api.saveGroupMembers(groupId, previousRequestIds);
          }
        });
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    forceAssignForm?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!groupId) return;
      const previousRequestIds = Array.from(new Set((currentGroup?.members || []).map(item => item.request_id).filter(Boolean)));
      const raw = String(forceAssignForm.elements.source_order_no?.value || "").trim().toUpperCase();
      if (!raw) {
        msg(message, "请输入 order_no。", true);
        return;
      }
      const payload = await Api.listRequests({ order_no: raw, compact: true }).catch(error => {
        msg(message, error.message, true);
        return null;
      });
      const request = Array.isArray(payload?.items) ? payload.items[0] : Array.isArray(payload) ? payload[0] : null;
      if (!request) {
        msg(message, "未找到该订单。", true);
        return;
      }
      const requestIds = new Set((currentGroup?.members || []).map(item => item.request_id));
      requestIds.add(request.id);
      try {
        await Api.saveGroupMembers(groupId, Array.from(requestIds));
        await loadGroup(groupId);
        setUndoAction({
          label: "加入成员",
          run: async () => {
            await Api.saveGroupMembers(groupId, previousRequestIds);
          }
        });
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    currentMembers?.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const paymentRequestId = target.getAttribute("data-payment-request");
      const paymentStatus = target.getAttribute("data-payment-status");
      if (paymentRequestId && paymentStatus) {
        const member = (currentGroup?.members || []).find(item => (item.transport_requests?.id || item.request_id) === paymentRequestId);
        if (!member) return;
        msg(message, paymentStatus === "paid" ? "正在标记为已付款..." : "正在标记为未付款...");
        try {
          const previousAdminNote = member.transport_requests?.admin_note || "";
          const result = await Api.updateRequest(paymentRequestId, {
            admin_note: buildPaymentAdminNote(member.transport_requests?.admin_note, paymentStatus)
          });
          await loadGroup(groupId);
          setUndoAction({
            label: paymentStatus === "paid" ? "标记已付款" : "标记未付款",
            run: async () => {
              await Api.updateRequest(paymentRequestId, { admin_note: previousAdminNote });
            }
          });
          msg(message, paymentUpdateMessage(result, paymentStatus));
        } catch (error) {
          msg(message, error.message, true);
        }
        return;
      }
    });

    summaryGrid?.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.hasAttribute("data-save-group-max-passengers")) {
        await saveGroupMaxPassengers();
        return;
      }
      if (target.hasAttribute("data-save-group-pickup-time")) {
        await saveGroupPickupTime();
      }
    });

    summaryGrid?.addEventListener("keydown", async event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.hasAttribute("data-group-max-passengers") && !target.hasAttribute("data-group-pickup-time")) return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (target.hasAttribute("data-group-max-passengers")) {
        await saveGroupMaxPassengers();
        return;
      }
      await saveGroupPickupTime();
    });

    dispatchSummary?.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.hasAttribute("data-copy-dispatch-summary")) {
        const editor = dispatchSummary.querySelector("[data-dispatch-summary-editor]");
        if (!(editor instanceof HTMLTextAreaElement)) return;
        try {
          await navigator.clipboard.writeText(editor.value || "");
          msg(message, "摘要已复制。");
        } catch (error) {
          msg(message, "复制失败，请手动复制。", true);
        }
        return;
      }
      if (target.hasAttribute("data-save-dispatch-summary")) {
        await saveDispatchSummary(false);
        return;
      }
      if (target.hasAttribute("data-reset-dispatch-summary")) {
        await saveDispatchSummary(true);
      }
    });

    blockingReasons?.addEventListener("click", async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const paymentRequestId = target.getAttribute("data-payment-request");
      const paymentStatus = target.getAttribute("data-payment-status");
      if (!paymentRequestId || !paymentStatus) return;
      const member = (currentGroup?.members || []).find(item => (item.transport_requests?.id || item.request_id) === paymentRequestId);
      if (!member) return;
      msg(message, paymentStatus === "paid" ? "正在标记为已付款..." : "正在标记为未付款...");
      try {
        const previousAdminNote = member.transport_requests?.admin_note || "";
        const result = await Api.updateRequest(paymentRequestId, {
          admin_note: buildPaymentAdminNote(member.transport_requests?.admin_note, paymentStatus)
        });
        await loadGroup(groupId);
        setUndoAction({
          label: paymentStatus === "paid" ? "标记已付款" : "标记未付款",
          run: async () => {
            await Api.updateRequest(paymentRequestId, { admin_note: previousAdminNote });
          }
        });
        msg(message, paymentUpdateMessage(result, paymentStatus));
      } catch (error) {
        msg(message, error.message, true);
      }
    });

    undoButton?.addEventListener("click", async () => {
      if (!lastUndoAction || !groupId) return;
      const action = lastUndoAction;
      msg(message, "正在撤回上次操作...");
      try {
        setUndoAction(null);
        await action.run();
        await loadGroup(groupId);
        msg(message, `已撤回上次操作：${action.label}。`);
      } catch (error) {
        setUndoAction(action);
        msg(message, error.message, true);
      }
    });

    if (groupId) await loadGroup(groupId);
  }

  async function initSyncLogsPage() {
    const root = document.querySelector("#transportSyncLogsPage");
    if (!root || !(await requireSession())) return;
    bindLogout();
    const form = document.querySelector("#transportSyncLogFilters");
    const list = document.querySelector("#transportSyncLogsList");
    const message = document.querySelector("#transportSyncLogMessage");
    const pagination = document.querySelector("#transportSyncLogsPagination");
    let page = 1;
    let totalPages = 1;

    function renderDetailsBlock(title, items, formatter) {
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) {
        return `<div class="admin-table-subtle">${Shared.escapeHtml(title)}：无</div>`;
      }
      return `
        <details class="transport-sync-log-details">
          <summary>${Shared.escapeHtml(`${title}（${rows.length}）`)}</summary>
          <div class="transport-sync-log-details-body">
            ${rows.map(item => formatter(item)).join("")}
          </div>
        </details>
      `;
    }

    function renderSimpleListBlock(title, items) {
      const rows = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!rows.length) {
        return `<div class="admin-table-subtle">${Shared.escapeHtml(title)}：无</div>`;
      }
      return `
        <details class="transport-sync-log-details">
          <summary>${Shared.escapeHtml(`${title}（${rows.length}）`)}</summary>
          <div class="transport-sync-log-details-body">
            ${rows.map(item => `
              <div class="transport-sync-log-line">
                <strong>${Shared.escapeHtml(String(item))}</strong>
              </div>
            `).join("")}
          </div>
        </details>
      `;
    }

    function mismatchLine(item) {
      if (item?.field === "future_duplicate_same_service_order") {
        return `
          <div class="transport-sync-log-line">
            <strong>${Shared.escapeHtml(item.group_id || "--")}</strong>
            <span>同账号出现同类未来有效单</span>
            <span>${Shared.escapeHtml(String(item.actual ?? "--"))}</span>
            ${item.order_no ? `<span>订单：${Shared.escapeHtml(item.order_no)}</span>` : ""}
          </div>
        `;
      }
      return `
        <div class="transport-sync-log-line">
          <strong>${Shared.escapeHtml(item.group_id || "--")}</strong>
          <span>${Shared.escapeHtml(item.surface || "--")} / ${Shared.escapeHtml(item.field || "--")}</span>
          <span>期望：${Shared.escapeHtml(String(item.expected ?? "--"))}</span>
          <span>实际：${Shared.escapeHtml(String(item.actual ?? "--"))}</span>
          ${item.order_no ? `<span>订单：${Shared.escapeHtml(item.order_no)}</span>` : ""}
        </div>
      `;
    }

    function formatSyncSkippedReason(item) {
      const reason = String(item?.reason || "").trim();
      if (reason === "no_site_user_linked_member") {
        return "该组没有可用于个人中心校验的注册用户成员";
      }
      if (reason === "order_not_in_recent_personal_center_list") {
        return "该组样本订单未出现在对应用户的个人中心最近记录里";
      }
      return reason || "--";
    }

    function skippedLine(item) {
      return `
        <div class="transport-sync-log-line">
          <strong>${Shared.escapeHtml(item.group_id || "--")}</strong>
          <span>${Shared.escapeHtml(item.surface || "--")}</span>
          <span>${Shared.escapeHtml(formatSyncSkippedReason(item))}</span>
          ${item.order_no ? `<span>订单：${Shared.escapeHtml(item.order_no)}</span>` : ""}
        </div>
      `;
    }

    async function render(nextPage = 1) {
      page = nextPage;
      list.innerHTML = '<div class="admin-loading">正在加载同步巡检日志...</div>';
      pagination.innerHTML = "";

      try {
        const payload = await Api.listSyncAuditLogs({
          page,
          page_size: 20,
          mismatch_only: Shared.fieldValue(form, '[name="mismatch_only"]')
        });

        totalPages = Math.max(payload?.pagination?.total_pages || 1, 1);
        const items = Array.isArray(payload?.items) ? payload.items : [];

        if (payload?.storage?.ready === false) {
          list.innerHTML = `
            <section class="admin-panel">
              <div class="admin-empty-state">
                <h2>日志表尚未启用</h2>
                <p>请先执行同步巡检日志表的 Supabase SQL，再回来查看记录。</p>
              </div>
            </section>
          `;
          renderPagination(pagination, page, totalPages);
          return;
        }

        if (!items.length) {
          list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>暂无巡检日志</h2><p>当前筛选条件下没有可显示的记录。</p></div></section>';
          renderPagination(pagination, page, totalPages);
          return;
        }

        list.innerHTML = `
          <section class="admin-panel">
            <div class="admin-table-wrap">
              <table class="admin-table transport-sync-log-table">
                <thead>
                  <tr>
                    <th>巡检时间</th>
                    <th>抽查组数</th>
                    <th>个人中心订单数</th>
                    <th>异常数</th>
                    <th>跳过数</th>
                    <th>结果</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(item => `
                    <tr>
                      <td>${Shared.escapeHtml(Shared.formatDateTime(item.checked_at) || "--")}</td>
                      <td>${Shared.escapeHtml(String(item.sampled_group_count ?? 0))}</td>
                      <td>${Shared.escapeHtml(String(item.checked_request_count ?? 0))}</td>
                      <td>${Shared.escapeHtml(String(item.mismatch_count ?? 0))}</td>
                      <td>${Shared.escapeHtml(String(item.skipped_check_count ?? 0))}</td>
                      <td>${item.mismatch_count > 0
                        ? '<span class="admin-status-badge is-warning">发现异常</span>'
                        : '<span class="admin-status-badge is-success">正常</span>'}</td>
                      <td class="transport-sync-log-cell-details">
                        ${renderSimpleListBlock("抽查 Group ID", item.sampled_group_ids)}
                        ${renderSimpleListBlock("校验订单号", item.checked_order_nos)}
                        ${renderDetailsBlock("异常明细", item.mismatches, mismatchLine)}
                        ${renderDetailsBlock("跳过明细", item.skipped_checks, skippedLine)}
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;

        msg(message, items[0]?.mismatch_count > 0 ? "最近一批巡检里存在异常，请展开详情查看。" : "同步巡检日志已更新。");
        renderPagination(pagination, page, totalPages);
      } catch (error) {
        list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>加载失败</h2><p>请稍后重试。</p></div></section>';
        msg(message, error.message, true);
      }
    }

    form?.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });
    form?.addEventListener("reset", () => window.setTimeout(() => render(1), 0));
    pagination?.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-page-action");
      if (action === "prev" && page > 1) render(page - 1);
      if (action === "next" && page < totalPages) render(page + 1);
    });

    render(1);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initRequestsListPage();
    initRequestFormPage();
    initGroupsListPage();
    initGroupFormPage();
    initSyncLogsPage();
  });
})();


