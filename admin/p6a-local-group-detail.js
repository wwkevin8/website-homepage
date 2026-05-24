(function () {
  const ROUTE_RE = /^\/admin\/transport\/groups\/([^/?#]+)/;
  const STYLE_ID = "p6a-group-detail-polish";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function display(value) {
    const text = String(value ?? "").trim();
    return text || "--";
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "--";
    const amount = Number(value);
    return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : display(value);
  }

  function formatDate(value) {
    if (!value) return "--";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(String(value).slice(0, 10) + "T00:00:00"));
    } catch (_) {
      return display(value);
    }
  }

  function formatDateTime(value) {
    if (!value) return "--";
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
    } catch (_) {
      return display(value);
    }
  }

  function formatTimeRange(group) {
    const arrivals = group.summary?.arrival_time_range || {};
    const start = arrivals.earliest || group.preferred_time_start || group.flight_time_reference;
    const end = arrivals.latest || group.preferred_time_end || group.flight_time_reference;
    if (!start && !end) return "--";
    if (!end || start === end) return formatDateTime(start);
    return `${formatDateTime(start)} - ${formatDateTime(end)}`;
  }

  function serviceLabel(value) {
    return value === "dropoff" ? "送机" : value === "pickup" ? "接机" : display(value);
  }

  function statusLabel(value) {
    return {
      single_member: "单人组",
      active: "拼车中",
      open: "拼车中",
      full: "已满员",
      closed: "已关闭",
      cancelled: "已取消",
      canceled: "已取消",
      published: "有效单",
      matched: "已入组"
    }[value] || display(value);
  }

  function contactLabel(value) {
    return value === "contacted" ? "已联系" : "未联系";
  }

  function paymentLabel(value) {
    return {
      unpaid: "未付款",
      deposit_paid: "已付定金",
      fully_paid: "已付全款",
      paid: "已付款",
      pending: "待确认",
      waived: "已免除"
    }[value] || display(value);
  }

  function normalizeGroup(payload) {
    return payload?.data || payload?.group || payload?.item || payload || {};
  }

  function membersOf(group) {
    return Array.isArray(group.members) ? group.members.map(row => ({
      ...row,
      request: row.transport_requests || row.transport_request || row.request || row
    })) : [];
  }

  function requestId(row) {
    return row?.request?.id || row?.request_id || row?.transport_request_id || "";
  }

  function paymentState(row) {
    const request = row.request || {};
    const direct = String(row.payment_status || request.manual_payment_status || request.payment_status || "").trim().toLowerCase();
    if (direct) return direct === "waived" ? "paid" : direct;
    const collection = String(request.payment_collection_status || "").trim().toLowerCase();
    if (collection === "fully_paid" || collection === "paid" || collection === "waived") return "paid";
    if (collection) return collection;
    const match = String(request.admin_note || "").match(/\[payment:(paid|unpaid)\]/i);
    return match ? match[1].toLowerCase() : "unpaid";
  }

  function isPaid(row) {
    return ["paid", "fully_paid", "waived"].includes(paymentState(row));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message || body?.error || `Request failed with ${response.status}`);
    }
    return body?.data || body;
  }

  function terminalSummary(rows, group) {
    const terminals = Array.from(new Set(rows.map(row => String(row.request?.terminal || "").trim()).filter(Boolean)));
    return terminals.join(" / ") || group.summary?.terminal_summary || group.terminal || "--";
  }

  function totalLuggage(rows) {
    return rows.reduce((sum, row) => sum + Number(row.request?.luggage_count || row.luggage_count_snapshot || 0), 0);
  }

  function memberAddress(row, group) {
    const request = row.request || {};
    return group.service_type === "dropoff"
      ? request.location_from || request.location_to
      : request.location_to || request.location_from;
  }

  function memberPrice(row) {
    const request = row.request || {};
    return request.confirmed_price_gbp ?? request.manual_price_gbp ?? request.deposit_amount_gbp ?? "";
  }

  function buildSummary(group, rows) {
    const terminals = terminalSummary(rows, group);
    const payment = group.payment_summary || {};
    const memberLines = rows.map((row, index) => {
      const request = row.request || {};
      return [
        `${index + 1}. ${display(request.student_name)}`,
        `电话: ${display(request.phone)}`,
        `微信: ${display(request.wechat)}`,
        `航班: ${display(request.flight_no)}`,
        `时间: ${formatDateTime(request.flight_datetime || request.preferred_time_start)}`,
        `航站楼: ${display(request.terminal)}`,
        `人数: ${Number(request.passenger_count || row.passenger_count_snapshot || 0)}`,
        `行李: ${Number(request.luggage_count || row.luggage_count_snapshot || 0)}`,
        `地址: ${display(memberAddress(row, group))}`,
        `付款: ${paymentLabel(paymentState(row))}`,
        `联系: ${contactLabel(request.contact_status)}`,
        `线下记录: ${request.offline_recorded ? "已记录" : "未记录"}`
      ].join("；");
    }).join("\n");

    return [
      "司机派单摘要",
      "",
      `Group ID: ${display(group.group_id || group.id)}`,
      `服务类型: ${serviceLabel(group.service_type)}`,
      `日期时间: ${formatDate(group.group_date)} ${formatTimeRange(group)}`,
      `机场航站楼: ${display(group.airport_code)} / ${display(group.airport_name)} / ${terminals}`,
      `总人数: ${Number(group.current_passenger_count || rows.length || 0)} / ${Number(group.max_passengers || 0)}`,
      `总行李: ${totalLuggage(rows)} 件`,
      `动态人均: ${money(payment.average_price_gbp || group.current_average_price_gbp)}`,
      "",
      "乘客明细:",
      memberLines || "暂无成员",
      "",
      `备注: ${display(group.notes)}`
    ].join("\n");
  }

  function badge(text, tone = "neutral") {
    return `<span class="p6a-badge p6a-badge--${tone}">${escapeHtml(text)}</span>`;
  }

  function statusTone(status) {
    if (["full", "paid", "fully_paid", "published", "matched"].includes(String(status || ""))) return "success";
    if (["closed", "cancelled", "canceled"].includes(String(status || ""))) return "neutral";
    return "warning";
  }

  function renderInfoItem(label, value, options = {}) {
    const valueHtml = options.html ? value : escapeHtml(display(value));
    const className = options.emphasis ? "p6a-info-item p6a-info-item--emphasis" : "p6a-info-item";
    return `
      <div class="${className}">
        <span>${escapeHtml(label)}</span>
        <strong>${valueHtml}</strong>
      </div>
    `;
  }

  function renderOverview(group, rows) {
    const payment = group.payment_summary || {};
    const currentCount = Number(group.current_passenger_count || rows.length || 0);
    const capacity = Number(group.max_passengers || 0);
    const visibility = group.visible_on_frontend ? badge("前台显示", "success") : badge("前台隐藏", "neutral");
    return `
      <section class="p6a-card p6a-overview-card">
        <div class="p6a-card-header">
          <div>
            <h3>拼车组概览</h3>
            <p>关键调度信息一屏核对；行程、价格和成员关系字段在 P6A 保持只读。</p>
          </div>
          <div class="p6a-header-badges">
            ${badge(statusLabel(group.status), statusTone(group.status))}
            ${visibility}
          </div>
        </div>
        <div class="p6a-info-grid">
          ${renderInfoItem("Group ID", group.group_id || group.id)}
          ${renderInfoItem("服务类型", serviceLabel(group.service_type))}
          ${renderInfoItem("机场 / 航站楼", `${display(group.airport_code)} / ${terminalSummary(rows, group)}`)}
          ${renderInfoItem("服务日期", formatDate(group.group_date))}
          ${renderInfoItem("服务时间", formatTimeRange(group))}
          ${renderInfoItem("当前人数 / 容量", `${currentCount} / ${capacity}`, { emphasis: true })}
          ${renderInfoItem("行李数", `${totalLuggage(rows)} 件`)}
          ${renderInfoItem("当前人均价", money(payment.average_price_gbp || group.current_average_price_gbp))}
        </div>
      </section>
    `;
  }

  function renderRisks(group) {
    const risks = Array.isArray(group.dispatch_risks) ? group.dispatch_risks : [];
    const content = risks.length
      ? risks.map(risk => `
          <div class="p6a-risk-item">
            ${badge(risk.label || risk.code || "调度风险", "warning")}
            <span>${escapeHtml(risk.message || risk.description || risk.code || "")}</span>
          </div>
        `).join("")
      : `<div class="p6a-risk-empty">${badge("无明显风险", "success")}<span>当前拼车组没有检测到需要优先处理的调度风险。</span></div>`;
    return `
      <section class="p6a-card p6a-risk-card">
        <div class="p6a-card-header p6a-card-header--compact">
          <h3>调度风险提示</h3>
        </div>
        <div class="p6a-risk-list">${content}</div>
      </section>
    `;
  }

  function renderSettings(group, rows) {
    const currentCount = Math.max(Number(group.current_passenger_count || rows.length || 0), 1);
    return `
      <section class="p6a-card">
        <div class="p6a-card-header">
          <div>
            <h3>调度设置</h3>
            <p>调整拼车组容量、前台展示和内部备注。容量不会修改任何成员订单人数或成员关系。</p>
          </div>
          <button class="p6a-button p6a-button--primary" type="button" data-p6a-save-group>保存设置</button>
        </div>
        <div class="p6a-form-grid">
          <label class="p6a-field p6a-field--short">
            <span>最大人数 / 座位容量</span>
            <input data-p6a-capacity type="number" min="${currentCount}" max="9" value="${Number(group.max_passengers || currentCount)}" />
          </label>
          <label class="p6a-field p6a-field--short">
            <span>是否前台展示</span>
            <select data-p6a-visible>
              <option value="true" ${group.visible_on_frontend ? "selected" : ""}>前台显示</option>
              <option value="false" ${!group.visible_on_frontend ? "selected" : ""}>前台隐藏</option>
            </select>
          </label>
          <label class="p6a-field p6a-field--wide">
            <span>组备注 / 司机备注 / 调度备注</span>
            <textarea data-p6a-notes rows="4">${escapeHtml(group.notes || "")}</textarea>
          </label>
        </div>
      </section>
    `;
  }

  function renderPayment(group, rows) {
    const payment = group.payment_summary || {};
    const memberRows = rows.map(row => {
      const request = row.request || {};
      const id = requestId(row);
      const paid = isPaid(row);
      return `
        <div class="p6a-payment-row">
          <div>
            <strong>${escapeHtml(display(request.student_name))}</strong>
            <small>${escapeHtml(display(request.order_no))}</small>
          </div>
          <div class="p6a-payment-row__actions">
            ${badge(paymentLabel(paymentState(row)), paid ? "success" : "warning")}
            <button class="p6a-button p6a-button--small ${paid ? "p6a-button--disabled" : "p6a-button--secondary"}" type="button" data-p6a-paid="${escapeHtml(id)}" data-name="${escapeHtml(display(request.student_name))}" ${paid ? "disabled" : ""}>${paid ? "已付款" : "标记已付款"}</button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="p6a-card">
        <div class="p6a-card-header">
          <div>
            <h3>费用与付款</h3>
            <p>付款状态按成员订单处理；不会修改拼车组容量、订单人数或成员关系。</p>
          </div>
        </div>
        <div class="p6a-stat-grid">
          <article>
            <span>总价</span>
            <strong>${escapeHtml(money(payment.total_price_gbp))}</strong>
          </article>
          <article>
            <span>当前人均价</span>
            <strong>${escapeHtml(money(payment.average_price_gbp || group.current_average_price_gbp))}</strong>
          </article>
          <article>
            <span>跨航站楼费用</span>
            <strong>${escapeHtml(money(payment.cross_terminal_surcharge_total_gbp || 0))}</strong>
          </article>
        </div>
        <div class="p6a-payment-list">${memberRows || "<p class=\"p6a-muted\">暂无成员付款状态。</p>"}</div>
        <p class="p6a-helper">LOCAL TEST MODE 下会走付款确认流程，但后端会以 local mock 方式跳过真实邮件发送。</p>
      </section>
    `;
  }

  function renderMembers(group, rows) {
    const body = rows.map(row => {
      const request = row.request || {};
      const id = requestId(row);
      const paid = isPaid(row);
      return `
        <tr>
          <td><strong>${escapeHtml(display(request.order_no || row.order_no))}</strong></td>
          <td>${escapeHtml(display(request.student_name || row.student_name))}</td>
          <td>${escapeHtml(display(request.phone))}<br><small>${escapeHtml(display(request.wechat))}</small></td>
          <td>${escapeHtml(display(request.flight_no))}<br><small>${escapeHtml(formatDateTime(request.flight_datetime || request.preferred_time_start))}</small></td>
          <td>${escapeHtml(display(request.airport_code || group.airport_code))}<br><small>${escapeHtml(display(request.terminal))}</small></td>
          <td>${Number(request.passenger_count || row.passenger_count_snapshot || 0)} 人<br><small>${Number(request.luggage_count || row.luggage_count_snapshot || 0)} 件行李</small></td>
          <td class="p6a-table-address">${escapeHtml(display(memberAddress(row, group)))}</td>
          <td>${escapeHtml(money(memberPrice(row)))}</td>
          <td>${badge(paymentLabel(paymentState(row)), paid ? "success" : "warning")}</td>
          <td>${badge(request.offline_recorded ? "已记录" : "未记录", request.offline_recorded ? "success" : "neutral")}</td>
          <td>${badge(contactLabel(request.contact_status), request.contact_status === "contacted" ? "success" : "warning")}</td>
          <td>
            <div class="p6a-row-actions">
              <button class="p6a-button p6a-button--small p6a-button--secondary" type="button" data-p6a-offline="${escapeHtml(id)}" data-next="${request.offline_recorded ? "false" : "true"}">${request.offline_recorded ? "取消记录" : "标记记录"}</button>
              <button class="p6a-button p6a-button--small p6a-button--secondary" type="button" data-p6a-contact="${escapeHtml(id)}" data-next="${request.contact_status === "contacted" ? "uncontacted" : "contacted"}">${request.contact_status === "contacted" ? "取消联系" : "标记已联系"}</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <section class="p6a-card">
        <div class="p6a-card-header">
          <div>
            <h3>组内成员明细</h3>
            <p>成员核心字段只读。航站楼、航班、日期、时间、订单人数、价格和成员关系变更请在 P5 订单变更流程处理。</p>
          </div>
        </div>
        <div class="p6a-table-wrap">
          <table class="p6a-table">
            <thead>
              <tr>
                <th>Order No</th>
                <th>学生</th>
                <th>电话 / 微信</th>
                <th>航班 / 时间</th>
                <th>机场 / 航站楼</th>
                <th>人数 / 行李</th>
                <th>地址</th>
                <th>价格</th>
                <th>付款</th>
                <th>线下记录</th>
                <th>联系状态</th>
                <th>记录操作</th>
              </tr>
            </thead>
            <tbody>${body || `<tr><td colspan="12">暂无成员</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderDriverSummary(summary) {
    return `
      <section class="p6a-card">
        <div class="p6a-card-header">
          <div>
            <h3>司机派单摘要</h3>
            <p>复制给司机使用；不修改订单、价格或成员关系。</p>
          </div>
          <button class="p6a-button p6a-button--primary" type="button" data-p6a-copy>一键复制</button>
        </div>
        <textarea class="p6a-summary-textarea" rows="10" data-p6a-summary>${escapeHtml(summary)}</textarea>
      </section>
    `;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .transport-group-detail-view--p6a {
        max-width: 1440px;
        margin: 0 auto;
        padding: 0 8px 32px;
      }
      .transport-group-detail-view--p6a .view-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .transport-group-detail-view--p6a .view-heading > div:first-child {
        min-width: 0;
      }
      .transport-group-detail-view--p6a .view-heading__actions {
        display: flex;
        flex: 0 0 auto;
        justify-content: flex-end;
        padding-top: 2px;
      }
      .transport-group-detail-view--p6a .view-heading__actions .secondary-button {
        white-space: nowrap;
      }
      .transport-group-detail-view--p6a .view-heading h2 {
        margin: 0;
        color: #111827;
        font-size: 24px;
        line-height: 1.25;
      }
      .transport-group-detail-view--p6a .view-heading p {
        margin: 6px 0 0;
        color: #64748b;
        font-size: 14px;
      }
      .p6a-card {
        margin-top: 16px;
        padding: 18px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .p6a-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 14px;
      }
      .p6a-card-header--compact {
        margin-bottom: 10px;
      }
      .p6a-card-header h3 {
        margin: 0;
        color: #111827;
        font-size: 16px;
        line-height: 1.35;
      }
      .p6a-card-header p,
      .p6a-muted {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 13px;
        line-height: 1.5;
      }
      .p6a-header-badges {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .p6a-info-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .p6a-info-item {
        min-height: 72px;
        padding: 12px;
        border: 1px solid #eef2f7;
        border-radius: 8px;
        background: #f8fafc;
      }
      .p6a-info-item span,
      .p6a-stat-grid span {
        display: block;
        margin-bottom: 6px;
        color: #64748b;
        font-size: 12px;
        line-height: 1.3;
      }
      .p6a-info-item strong,
      .p6a-stat-grid strong {
        color: #111827;
        font-size: 15px;
        line-height: 1.35;
        word-break: break-word;
      }
      .p6a-info-item--emphasis {
        border-color: #bfdbfe;
        background: #eff6ff;
      }
      .p6a-info-item--emphasis strong {
        color: #1d4ed8;
        font-size: 20px;
      }
      .p6a-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 3px 9px;
        border: 1px solid #e5e7eb;
        border-radius: 999px;
        background: #f8fafc;
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
      }
      .p6a-badge--success {
        border-color: #bbf7d0;
        background: #f0fdf4;
        color: #166534;
      }
      .p6a-badge--warning {
        border-color: #fde68a;
        background: #fffbeb;
        color: #92400e;
      }
      .p6a-badge--neutral {
        border-color: #e2e8f0;
        background: #f8fafc;
        color: #475569;
      }
      .p6a-risk-list {
        display: grid;
        gap: 8px;
      }
      .p6a-risk-item,
      .p6a-risk-empty {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 38px;
        padding: 8px 10px;
        border: 1px solid #eef2f7;
        border-radius: 8px;
        color: #475569;
        font-size: 13px;
      }
      .p6a-form-grid {
        display: grid;
        grid-template-columns: 220px 220px minmax(320px, 1fr);
        gap: 14px;
        align-items: start;
      }
      .p6a-field {
        display: grid;
        gap: 7px;
      }
      .p6a-field span {
        color: #334155;
        font-size: 13px;
        font-weight: 600;
      }
      .p6a-field input,
      .p6a-field select,
      .p6a-field textarea,
      .p6a-summary-textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        background: #ffffff;
        color: #111827;
        font: inherit;
        font-size: 14px;
        line-height: 1.45;
      }
      .p6a-field input,
      .p6a-field select {
        height: 38px;
        padding: 7px 10px;
      }
      .p6a-field textarea,
      .p6a-summary-textarea {
        padding: 10px 12px;
        resize: vertical;
      }
      .p6a-field input:focus,
      .p6a-field select:focus,
      .p6a-field textarea:focus,
      .p6a-summary-textarea:focus {
        outline: 2px solid #bfdbfe;
        border-color: #60a5fa;
      }
      .p6a-stat-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }
      .p6a-stat-grid article {
        padding: 13px 14px;
        border: 1px solid #eef2f7;
        border-radius: 8px;
        background: #f8fafc;
      }
      .p6a-stat-grid strong {
        font-size: 18px;
      }
      .p6a-payment-list {
        display: grid;
        gap: 8px;
      }
      .p6a-payment-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 12px;
        border: 1px solid #eef2f7;
        border-radius: 8px;
        background: #ffffff;
      }
      .p6a-payment-row strong {
        display: block;
        color: #111827;
        font-size: 14px;
      }
      .p6a-payment-row small {
        display: block;
        margin-top: 3px;
        color: #64748b;
        font-size: 12px;
      }
      .p6a-payment-row__actions,
      .p6a-row-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      .p6a-helper {
        margin: 10px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
      }
      .p6a-table-wrap {
        overflow: auto;
        max-width: 100%;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        -webkit-overflow-scrolling: touch;
      }
      .p6a-table {
        width: 100%;
        min-width: 1160px;
        border-collapse: separate;
        border-spacing: 0;
        background: #ffffff;
        font-size: 13px;
      }
      .p6a-table th {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
        background: #f8fafc;
        color: #475569;
        font-weight: 700;
        text-align: left;
        white-space: nowrap;
      }
      .p6a-table td {
        padding: 10px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
        vertical-align: middle;
      }
      .p6a-table tr:last-child td {
        border-bottom: 0;
      }
      .p6a-table small {
        color: #64748b;
      }
      .p6a-table-address {
        max-width: 220px;
        white-space: normal;
      }
      .p6a-row-actions {
        flex-wrap: wrap;
        min-width: 148px;
      }
      .p6a-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 7px 13px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #ffffff;
        color: #334155;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
        cursor: pointer;
      }
      .p6a-button:hover:not(:disabled) {
        background: #f8fafc;
        border-color: #94a3b8;
      }
      .p6a-button--primary {
        border-color: #2563eb;
        background: #2563eb;
        color: #ffffff;
      }
      .p6a-button--primary:hover:not(:disabled) {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }
      .p6a-button--secondary {
        border-color: #dbe3ef;
        background: #ffffff;
      }
      .p6a-button--small {
        min-height: 30px;
        padding: 5px 9px;
        font-size: 12px;
      }
      .p6a-button:disabled,
      .p6a-button--disabled {
        cursor: not-allowed;
        opacity: 0.58;
      }
      .p6a-summary-textarea {
        min-height: 210px;
        max-height: 420px;
        background: #f8fafc;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
      }
      .transport-group-detail-view--p6a .inline-notice {
        margin: 0 0 16px;
        padding: 10px 12px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        background: #eff6ff;
        color: #1e40af;
        font-size: 13px;
      }
      .transport-group-detail-view--p6a .p6a-toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 1000;
        max-width: min(420px, calc(100vw - 48px));
        padding: 10px 12px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        background: #eff6ff;
        color: #1e40af;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
        font-size: 13px;
        line-height: 1.45;
      }
      @media (max-width: 1180px) {
        .p6a-info-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .p6a-form-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .p6a-field--wide {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 760px) {
        .transport-group-detail-view--p6a {
          padding: 0 0 24px;
        }
        .transport-group-detail-view--p6a .view-heading {
          flex-direction: column;
          align-items: stretch;
        }
        .transport-group-detail-view--p6a .view-heading__actions {
          justify-content: flex-start;
        }
        .p6a-card-header,
        .p6a-payment-row {
          flex-direction: column;
          align-items: stretch;
        }
        .p6a-info-grid,
        .p6a-stat-grid,
        .p6a-form-grid {
          grid-template-columns: 1fr;
        }
        .p6a-card {
          padding: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function render() {
    const match = window.location.pathname.match(ROUTE_RE);
    if (!match) return;
    injectStyles();
    const legacyHost = document.querySelector(".transport-group-detail-view:not([data-p6a-group-detail-mount])");
    if (!legacyHost) return;
    legacyHost.hidden = true;
    let host = document.querySelector("[data-p6a-group-detail-mount]");
    if (!host) {
      host = document.createElement("section");
      host.className = "transport-group-detail-view transport-group-detail-view--p6a";
      host.setAttribute("data-p6a-group-detail-mount", "");
      legacyHost.parentNode.insertBefore(host, legacyHost);
    }
    if (host.dataset.p6aApplied === "true") return;
    host.dataset.p6aApplied = "true";

    const groupId = decodeURIComponent(match[1]);
    host.innerHTML = `<section class="p6a-card"><p class="p6a-muted">正在加载 P6A 调度详情...</p></section>`;

    try {
      const session = await api("/api/admin/session?p6a_group_detail=1");
      const runtime = session.runtime_environment || session.data?.runtime_environment || {};
      if (runtime.is_production) {
        host.innerHTML = `<section class="p6a-card"><p class="inline-notice">Blocked: production data session is not allowed for P6A local checks.</p></section>`;
        return;
      }

      const group = normalizeGroup(await api(`/api/transport-groups/${encodeURIComponent(groupId)}`));
      const rows = membersOf(group);
      const summary = buildSummary(group, rows);

      host.innerHTML = `
        <div class="view-heading">
          <div>
            <p class="view-heading__eyebrow">Transport dispatch · P6A</p>
            <h2>拼车组调度校对</h2>
            <p>用于客服核对拼车组容量、前台展示、成员记录、付款状态和司机派单摘要。</p>
          </div>
          <div class="view-heading__actions">
            <a class="secondary-button" href="/admin/transport/groups">返回拼车组管理</a>
          </div>
        </div>
        <p class="inline-notice" data-p6a-notice hidden></p>
        ${renderOverview(group, rows)}
        ${renderRisks(group)}
        ${renderSettings(group, rows)}
        ${renderPayment(group, rows)}
        ${renderMembers(group, rows)}
        ${renderDriverSummary(summary)}
      `;

      bindActions(host, groupId);
    } catch (error) {
      host.innerHTML = `<section class="p6a-card"><p class="inline-notice">${escapeHtml(error.message || "P6A detail load failed")}</p></section>`;
    }
  }

  function showNotice(host, message) {
    const notice = host.querySelector("[data-p6a-notice]");
    if (notice) {
      notice.textContent = message;
      notice.hidden = false;
    }
    let toast = host.querySelector("[data-p6a-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "p6a-toast";
      toast.setAttribute("data-p6a-toast", "");
      host.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(host._p6aToastTimer);
    host._p6aToastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function bindActions(host, groupId) {
    host.querySelector("[data-p6a-save-group]")?.addEventListener("click", async () => {
      try {
        const capacityInput = host.querySelector("[data-p6a-capacity]");
        const visibleSelect = host.querySelector("[data-p6a-visible]");
        const currentCount = Number(capacityInput?.min || 1);
        const nextCapacity = Number(capacityInput?.value || 0);
        if (!Number.isInteger(nextCapacity) || nextCapacity < currentCount) {
          showNotice(host, `最大人数不能小于当前已入组人数 ${currentCount}。`);
          return;
        }
        if (!window.confirm(`确认将拼车组最大人数调整为 ${nextCapacity} 吗？此操作只修改组容量，不修改订单人数或成员关系。`)) {
          return;
        }
        if (nextCapacity === currentCount && visibleSelect?.value === "true" && window.confirm("最大人数已等于当前人数，是否同时关闭前台展示？")) {
          visibleSelect.value = "false";
        }
        await api(`/api/transport-groups/${encodeURIComponent(groupId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            max_passengers: nextCapacity,
            visible_on_frontend: visibleSelect?.value === "true",
            notes: host.querySelector("[data-p6a-notes]")?.value || null
          })
        });
        host.dataset.p6aApplied = "";
        await render();
        showNotice(host, "调度设置已保存。");
      } catch (error) {
        showNotice(host, error.message || "保存失败。");
      }
    });

    host.querySelector("[data-p6a-copy]")?.addEventListener("click", async () => {
      try {
        const summaryInput = host.querySelector("[data-p6a-summary]");
        const summaryText = summaryInput?.value || "";
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(summaryText);
        } else {
          summaryInput?.focus();
          summaryInput?.select();
          document.execCommand("copy");
        }
        showNotice(host, "司机派单摘要已复制。");
      } catch (_) {
        const summaryInput = host.querySelector("[data-p6a-summary]");
        summaryInput?.focus();
        summaryInput?.select();
        if (document.execCommand("copy")) {
          showNotice(host, "司机派单摘要已复制。");
        } else {
          showNotice(host, "复制失败，请手动选择摘要内容复制。");
        }
      }
    });

    host.querySelectorAll("[data-p6a-paid]").forEach(button => {
      button.addEventListener("click", async () => {
        const id = button.dataset.p6aPaid;
        if (!id || button.disabled) return;
        if (!window.confirm(`确认将 ${button.dataset.name || "该成员"} 标记为已付款，并触发付款确认邮件流程吗？`)) {
          return;
        }
        try {
          const updated = await api(`/api/transport-requests/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify({ manual_payment_status: "paid" })
          });
          host.dataset.p6aApplied = "";
          await render();
          const email = updated?.payment_email;
          if (email?.skipped && email?.provider === "local_mock") {
            showNotice(host, "已标记付款。本地测试模式不会发送真实付款确认邮件。");
          } else if (email?.error) {
            showNotice(host, `已标记付款，但付款确认邮件发送失败：${email.error}`);
          } else {
            showNotice(host, "已标记付款，并已触发付款确认邮件流程。");
          }
        } catch (error) {
          showNotice(host, error.message || "付款状态保存失败。");
        }
      });
    });

    host.querySelectorAll("[data-p6a-offline]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/transport-requests/${encodeURIComponent(button.dataset.p6aOffline)}`, {
            method: "PATCH",
            body: JSON.stringify({ offline_recorded: button.dataset.next === "true" })
          });
          host.dataset.p6aApplied = "";
          await render();
          showNotice(host, "线下记录状态已保存。");
        } catch (error) {
          showNotice(host, error.message || "线下记录状态保存失败。");
        }
      });
    });

    host.querySelectorAll("[data-p6a-contact]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/transport-requests/${encodeURIComponent(button.dataset.p6aContact)}`, {
            method: "PATCH",
            body: JSON.stringify({
              action: "update_safe_fields",
              contact_status: button.dataset.next
            })
          });
          host.dataset.p6aApplied = "";
          await render();
          showNotice(host, "联系状态已保存。");
        } catch (error) {
          showNotice(host, error.message || "联系状态保存失败。");
        }
      });
    });
  }

  function scheduleRender() {
    window.setTimeout(render, 0);
    window.setTimeout(render, 300);
    window.setTimeout(render, 900);
  }

  ["pushState", "replaceState"].forEach(name => {
    const original = history[name];
    history[name] = function patchedHistory() {
      const result = original.apply(this, arguments);
      scheduleRender();
      return result;
    };
  });
  window.addEventListener("popstate", scheduleRender);
  document.addEventListener("DOMContentLoaded", scheduleRender);
  window.setInterval(scheduleRender, 1200);
})();
