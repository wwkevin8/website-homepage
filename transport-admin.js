(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;

  if (!Shared || !Api) {
    return;
  }

  async function requireSession() {
    const session = await Api.session().catch(() => ({ authenticated: false, is_admin: false }));
    if (!session.authenticated || !session.is_admin) {
      window.location.href = "./admin-login.html";
      return false;
    }
    return true;
  }

  function bindLogout() {
    document.querySelectorAll("[data-transport-logout]").forEach(button => {
      if (button.dataset.transportLogoutBound === "true") {
        return;
      }
      button.dataset.transportLogoutBound = "true";
      button.addEventListener("click", async event => {
        event.preventDefault();
        await Api.logout().catch(() => {});
        window.location.href = "./admin-login.html";
      });
    });
  }

  function setRequestHints(form) {
    const type = Shared.fieldValue(form, '[name="service_type"]');
    const fromInput = form.querySelector('[name="location_from"]');
    const toInput = form.querySelector('[name="location_to"]');
    const flightLabel = form.querySelector("[data-flight-datetime-label]");
    const terminalLabel = form.querySelector("[data-terminal-label]");

    if (type === "dropoff") {
      if (fromInput) fromInput.placeholder = "\u4f8b\u5982\uff1a\u8bfa\u4e01\u6c49\u5e02\u533a";
      if (toInput) toInput.placeholder = "\u4f8b\u5982\uff1a\u5e0c\u601d\u7f57\u673a\u573a";
      if (flightLabel) flightLabel.textContent = "\u51fa\u53d1\u65f6\u95f4";
      if (terminalLabel) terminalLabel.textContent = "\u51fa\u53d1\u822a\u7ad9\u697c";
      return;
    }

    if (fromInput) fromInput.placeholder = "\u4f8b\u5982\uff1a\u5e0c\u601d\u7f57\u673a\u573a";
    if (toInput) toInput.placeholder = "\u4f8b\u5982\uff1a\u8bfa\u4e01\u6c49";
    if (flightLabel) flightLabel.textContent = "\u5230\u8fbe\u65f6\u95f4";
    if (terminalLabel) terminalLabel.textContent = "\u5230\u8fbe\u822a\u7ad9\u697c";
  }

  function requestPayloadFromForm(form) {
    return {
      service_type: Shared.fieldValue(form, '[name="service_type"]'),
      student_name: Shared.fieldValue(form, '[name="student_name"]'),
      phone: Shared.fieldValue(form, '[name="phone"]'),
      wechat: Shared.fieldValue(form, '[name="wechat"]'),
      passenger_count: Number.parseInt(Shared.fieldValue(form, '[name="passenger_count"]'), 10),
      luggage_count: Number.parseInt(Shared.fieldValue(form, '[name="luggage_count"]'), 10),
      airport_code: Shared.fieldValue(form, '[name="airport_code"]'),
      airport_name: Shared.fieldValue(form, '[name="airport_name"]'),
      terminal: Shared.fieldValue(form, '[name="terminal"]'),
      flight_no: Shared.fieldValue(form, '[name="flight_no"]'),
      flight_datetime: Shared.fieldValue(form, '[name="flight_datetime"]'),
      location_from: Shared.fieldValue(form, '[name="location_from"]'),
      location_to: Shared.fieldValue(form, '[name="location_to"]'),
      preferred_time_start: Shared.fieldValue(form, '[name="preferred_time_start"]') || null,
      preferred_time_end: Shared.fieldValue(form, '[name="preferred_time_end"]') || null,
      shareable: Boolean(Shared.fieldValue(form, '[name="shareable"]')),
      status: Shared.fieldValue(form, '[name="status"]'),
      notes: Shared.fieldValue(form, '[name="notes"]')
    };
  }

  function groupPayloadFromForm(form) {
    const groupDate = Shared.fieldValue(form, '[name="group_date"]');
    const currentPassengerCount = Number.parseInt(Shared.fieldValue(form, '[name="current_passenger_count"]'), 10) || 0;
    const remainingSeats = Number.parseInt(Shared.fieldValue(form, '[name="remaining_passenger_count"]'), 10) || 0;
    return {
      service_type: Shared.fieldValue(form, '[name="service_type"]'),
      group_date: groupDate || null,
      airport_code: Shared.fieldValue(form, '[name="airport_code"]'),
      airport_name: Shared.fieldValue(form, '[name="airport_name"]'),
      terminal: Shared.fieldValue(form, '[name="terminal"]'),
      location_from: Shared.fieldValue(form, '[name="location_from"]'),
      location_to: Shared.fieldValue(form, '[name="location_to"]'),
      flight_time_reference: Shared.fieldValue(form, '[name="flight_time_reference"]') || null,
      preferred_time_start: Shared.fieldValue(form, '[name="preferred_time_start"]') || null,
      preferred_time_end: Shared.fieldValue(form, '[name="preferred_time_end"]') || null,
      current_passenger_count: currentPassengerCount,
      max_passengers: currentPassengerCount + remainingSeats,
      visible_on_frontend: Shared.fieldValue(form, '[name="visible_on_frontend"]') === "true",
      status: Shared.fieldValue(form, '[name="status"]'),
      notes: Shared.fieldValue(form, '[name="notes"]')
    };
  }

  function getLondonIsoDateTimeDatePart(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : "";
  }

  function buildConfirmedOrderPayloadFromRequest(request) {
    const passengerCount = Number.parseInt(request.passenger_count, 10) || 0;
    const luggageCount = Number.parseInt(request.luggage_count, 10) || 0;
    const sourceDateTime = request.preferred_time_start || request.flight_datetime || request.preferred_time_end || null;
    const noteLines = [
      request.order_no ? `来源登记编号：${request.order_no}` : "",
      request.student_name ? `同学姓名：${request.student_name}` : "",
      request.phone ? `联系电话：${request.phone}` : "",
      request.wechat ? `微信号：${request.wechat}` : "",
      request.notes ? `登记备注：${request.notes}` : ""
    ].filter(Boolean);

    return {
      service_type: request.service_type,
      group_date: getLondonIsoDateTimeDatePart(sourceDateTime) || undefined,
      airport_code: request.airport_code,
      airport_name: request.airport_name,
      terminal: request.terminal || "",
      location_from: request.location_from,
      location_to: request.location_to,
      flight_time_reference: request.flight_datetime || null,
      preferred_time_start: request.preferred_time_start || request.flight_datetime || null,
      preferred_time_end: request.preferred_time_end || null,
      current_passenger_count: passengerCount,
      max_passengers: passengerCount,
      visible_on_frontend: false,
      status: "open",
      notes: `${noteLines.join("\n")}${noteLines.length ? "\n" : ""}行李件数：${luggageCount}`
    };
  }

  function wireAirportFields(form) {
    const codeSelect = form.querySelector('[name="airport_code"]');
    const nameInput = form.querySelector('[name="airport_name"]');
    if (!codeSelect || !nameInput) {
      return;
    }
    Shared.populateAirportCodeSelect(codeSelect, codeSelect.querySelector('option[value=""]') !== null);
    Shared.syncAirportNameField(codeSelect, nameInput);
  }

  function fillDateTimeInput(node, value) {
    if (!node) {
      return;
    }
    node.value = value ? new Date(value).toISOString().slice(0, 16) : "";
  }

  function requestStatusBadge(status) {
    const tone = status === "cancelled" ? "is-danger" : status === "closed" ? "is-neutral" : status === "in_service" ? "is-success" : "is-warning";
    return `<span class="admin-status-badge ${tone}">${Shared.escapeHtml(Shared.requestStatusLabel(status || "-"))}</span>`;
  }

  function requestMatchBadge(status) {
    const tone = status === "created" ? "is-success" : status === "matched" ? "is-warning" : "is-neutral";
    return `<span class="admin-status-badge ${tone}">${Shared.escapeHtml(Shared.requestMatchStatusLabel(status || "-"))}</span>`;
  }

  function groupStatusBadge(status) {
    const tone = status === "cancelled" ? "is-danger" : status === "closed" ? "is-neutral" : status === "full" ? "is-success" : "is-warning";
    return `<span class="admin-status-badge ${tone}">${Shared.escapeHtml(Shared.groupStatusLabel(status || "-"))}</span>`;
  }

  function remainingSeats(group) {
    const current = Number(group?.current_passenger_count || 0);
    const max = Number(group?.max_passengers || 0);
    return Math.max(max - current, 0);
  }

  function renderTransportPagination(container, page, totalPages) {
    if (!container) {
      return;
    }
    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${Math.max(totalPages, 1)} 页</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  async function initRequestsListPage() {
    const root = document.querySelector("#transportRequestsPage");
    if (!root || !(await requireSession())) {
      return;
    }

    bindLogout();

    const form = document.querySelector("#transportRequestFilters");
    const list = document.querySelector("#transportRequestsList");
    const message = document.querySelector("#transportRequestsMessage");
    const pagination = document.querySelector("#transportRequestsPagination");
    let currentPage = 1;
    let totalPages = 1;
    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render(page = 1) {
      currentPage = page;
      list.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u767b\u8bb0\u8868\u5355...</div>';
      if (pagination) {
        pagination.innerHTML = "";
      }
      const payload = await Api.listRequests({
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
        list.innerHTML = `<section class="admin-panel"><div class="admin-empty-state"><h2>\u767b\u8bb0\u8868\u5355\u52a0\u8f7d\u5931\u8d25</h2><p>${Shared.escapeHtml(error.message)}</p></div></section>`;
      });

      if (!payload) {
        return;
      }

      const data = Array.isArray(payload?.items) ? payload.items : [];
      totalPages = Number(payload?.pagination?.total_pages) || 1;

      if (!data.length) {
        list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>\u6682\u65e0\u7b26\u5408\u6761\u4ef6\u7684\u767b\u8bb0\u8868\u5355</h2><p>\u8bf7\u8c03\u6574\u7b5b\u9009\u6761\u4ef6\uff0c\u6216\u5230\u524d\u53f0\u63d0\u4ea4\u65b0\u7684\u767b\u8bb0\u3002</p></div></section>';
        renderTransportPagination(pagination, currentPage, totalPages);
        return;
      }

      list.innerHTML = `
        <section class="admin-panel">
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>订单编号</th>
                  <th>提交时间</th>
                  <th>\u63d0\u4ea4\u4eba</th>
                  <th>\u670d\u52a1\u7c7b\u578b</th>
                  <th>\u76ee\u6807\u673a\u573a</th>
                  <th>\u822a\u73ed\u4fe1\u606f</th>
                  <th>\u76ee\u6807\u5730\u5740</th>
                  <th>\u4eba\u6570 / \u884c\u674e</th>
                  <th>\u5907\u6ce8</th>
                  <th>\u670d\u52a1\u72b6\u6001</th>
                  <th>\u5339\u914d\u60c5\u51b5</th>
                  <th>\u64cd\u4f5c</th>
                </tr>
              </thead>
              <tbody>
                ${data.map(item => `
                  <tr>
                    <td><strong>${Shared.escapeHtml(item.order_no || "--")}</strong></td>
                    <td>${Shared.escapeHtml(Shared.formatDateTime(item.created_at))}</td>
                    <td>
                      <strong>${Shared.escapeHtml(item.student_name)}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml(item.wechat || item.phone || "--")}</div>
                    </td>
                    <td>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</td>
                    <td>
                      <strong>${Shared.escapeHtml(item.airport_code)}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml(item.airport_name || "--")}</div>
                    </td>
                    <td>
                      <strong>${Shared.escapeHtml(item.flight_no || "--")}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml(Shared.formatDateTime(item.flight_datetime))}</div>
                    </td>
                    <td>${Shared.escapeHtml(item.location_to)}</td>
                    <td>${item.passenger_count} \u4eba / ${item.luggage_count} \u4ef6</td>
                    <td>${Shared.escapeHtml(item.notes || "--")}</td>
                    <td>${requestStatusBadge(item.service_status_code || item.status)}</td>
                    <td>${requestMatchBadge(item.matching_status_code)}</td>
                    <td>
                      <div class="admin-table-actions">
                        <a class="button button-secondary admin-table-action" href="./transport-admin-request-edit.html?id=${item.id}">\u7f16\u8f91</a>
                        <button
                          class="button button-text is-danger admin-table-action"
                          type="button"
                          data-request-delete="${item.id}"
                          data-request-order-no="${Shared.escapeHtml(item.order_no || "")}"
                          data-request-student-name="${Shared.escapeHtml(item.student_name || "")}"
                        >\u5220\u9664</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      `;

      list.querySelectorAll("[data-request-delete]").forEach(button => {
        button.addEventListener("click", async () => {
          const requestId = button.dataset.requestDelete;
          const orderNo = button.dataset.requestOrderNo || "";
          const studentName = button.dataset.requestStudentName || "";
          const displayName = orderNo || studentName || requestId;
          const confirmed = window.confirm(`\u786e\u8ba4\u5220\u9664\u8fd9\u6761\u63a5\u9001\u673a\u767b\u8bb0\u5417\uff1f\n\n${displayName}\n\n\u5220\u9664\u540e\u5c06\u65e0\u6cd5\u6062\u590d\u3002`);

          if (!confirmed) {
            return;
          }

          Shared.showMessage(message, "\u6b63\u5728\u5220\u9664\u767b\u8bb0\u8868\u5355...");
          button.disabled = true;

          try {
            await Api.deleteRequest(requestId);
            Shared.showMessage(message, `\u5df2\u5220\u9664\u767b\u8bb0\u8868\u5355\uff1a${displayName}`);
            await render();
          } catch (error) {
            button.disabled = false;
            Shared.showMessage(message, error.message, true);
          }
        });
      });

      renderTransportPagination(pagination, currentPage, totalPages);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });

    pagination?.addEventListener("click", event => {
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

    render(1);
  }

  async function initRequestFormPage() {
    const root = document.querySelector("#transportRequestFormPage");
    if (!root || !(await requireSession())) {
      return;
    }

    bindLogout();

    const form = document.querySelector("#transportRequestForm");
    const message = document.querySelector("#transportRequestMessage");
    const groupSection = document.querySelector("#transportRequestAssignSection");
    const groupSelect = document.querySelector("#transportRequestGroupSelect");
    const assignButton = document.querySelector("#transportRequestAssignButton");
    const assignHint = document.querySelector("#transportRequestAssignHint");
    const assignableGroupsList = document.querySelector("#transportRequestAssignableGroups");
    const forceAssignForm = document.querySelector("#transportRequestForceAssignForm");
    const convertCheckbox = document.querySelector("#transportRequestConvertToGroup");
    const convertHint = document.querySelector("#transportRequestConvertHint");
    const requestId = Shared.queryParam("id");

    wireAirportFields(form);
    form.service_type.addEventListener("change", () => setRequestHints(form));
    setRequestHints(form);

    async function assignRequestToGroup(groupId) {
      if (!requestId || !groupId) {
        Shared.showMessage(message, "\u8bf7\u5148\u9009\u62e9\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355", true);
        return;
      }
      Shared.showMessage(message, "\u6b63\u5728\u5339\u914d\u5230\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355...");
      try {
        const group = await Api.getGroup(groupId);
        const requestIds = (group.members || []).map(item => item.request_id);
        if (!requestIds.includes(requestId)) {
          requestIds.push(requestId);
        }
        await Api.saveGroupMembers(group.id, requestIds);
        Shared.showMessage(message, "\u5df2\u5339\u914d\u5230\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355");
        await loadAssignableGroups(await Api.getRequest(requestId));
      } catch (error) {
        if (error.details?.group_id) {
          Shared.showMessage(message, "\u8fd9\u6761\u767b\u8bb0\u5df2\u7ecf\u5728\u5176\u4ed6\u786e\u8ba4\u5355\u91cc\uff0c\u6b63\u5728\u8df3\u8f6c...", true);
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(error.details.group_id)}`;
          return;
        }
        Shared.showMessage(message, error.message, true);
      }
    }

    async function loadAssignableGroups(currentRequest) {
      if (!groupSection || !groupSelect) {
        return;
      }
      const referenceDate = getLondonIsoDateTimeDatePart(currentRequest.flight_datetime || currentRequest.preferred_time_start || currentRequest.preferred_time_end || "");
      const groups = await Api.listGroups({
        service_type: currentRequest.service_type,
        airport_code: currentRequest.airport_code,
        date_from: referenceDate || undefined,
        date_to: referenceDate || undefined
      }).catch(() => []);

      groupSelect.innerHTML = '<option value="">\u8bf7\u9009\u62e9\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355</option>' + groups.map(group => (
        `<option value="${group.id}">${Shared.escapeHtml(`${Shared.formatDate(group.group_date)} · ${group.airport_code} · ${group.location_from} \u5230 ${group.location_to}`)}</option>`
      )).join("");

      if (assignHint) {
        assignHint.textContent = referenceDate
          ? `已按航班参考时间筛选 ${Shared.formatDate(referenceDate)} 的确认接送机订单。`
          : "\u672a\u8bc6\u522b\u5230\u822a\u73ed\u53c2\u8003\u65e5\u671f\uff0c\u5f53\u524d\u663e\u793a\u540c\u673a\u573a\u7684\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u3002";
      }

      if (assignableGroupsList) {
        assignableGroupsList.innerHTML = groups.length
          ? groups.map(group => `
            <article class="transport-assign-card">
              <div>
                <strong>${Shared.escapeHtml(`${Shared.formatDate(group.group_date)} · ${group.location_from} 到 ${group.location_to}`)}</strong>
                <p>${Shared.escapeHtml(group.airport_code)} · ${Shared.escapeHtml(group.terminal || "--")} · 当前 ${group.current_passenger_count || 0} 人 / 还可拼 ${remainingSeats(group)} 人</p>
              </div>
              <button class="button button-secondary" type="button" data-assign-group-id="${group.id}">\u5339\u914d\u5230\u8fd9\u5f20\u786e\u8ba4\u5355</button>
            </article>
          `).join("")
          : '<div class="transport-empty">\u5f53\u5929\u6ca1\u6709\u627e\u5230\u53ef\u5339\u914d\u7684\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\uff0c\u4f60\u53ef\u4ee5\u52fe\u9009\u4e0a\u65b9\u7684\u201c\u4fdd\u5b58\u540e\u540c\u6b65\u8f6c\u6362\u201d\u81ea\u52a8\u65b0\u5efa\u3002</div>';

        assignableGroupsList.querySelectorAll("[data-assign-group-id]").forEach(button => {
          button.addEventListener("click", () => assignRequestToGroup(button.dataset.assignGroupId));
        });
      }

      groupSection.hidden = false;
    }

    function syncConvertState(currentRequest) {
      if (!convertCheckbox || !convertHint) {
        return;
      }

      if (currentRequest?.is_grouped) {
        convertCheckbox.checked = false;
        convertCheckbox.disabled = true;
        convertHint.textContent = "这条登记已经匹配到确认接送机订单，如需重新转换，请先解除原匹配。";
        return;
      }

      convertCheckbox.disabled = false;
      convertHint.textContent = "勾选后，会用当前登记信息自动创建一条确认接送机订单，并把这条登记自动加入进去。";
    }

    if (requestId) {
      const data = await Api.getRequest(requestId).catch(error => {
        Shared.showMessage(message, error.message, true);
      });

      if (data) {
        Object.entries(data).forEach(([key, value]) => {
          if (!form[key]) {
            return;
          }
          if (form[key].type === "checkbox") {
            form[key].checked = Boolean(value);
          } else {
            form[key].value = value ?? "";
          }
        });
        fillDateTimeInput(form.flight_datetime, data.flight_datetime);
        fillDateTimeInput(form.preferred_time_start, data.preferred_time_start);
        fillDateTimeInput(form.preferred_time_end, data.preferred_time_end);
        form.shareable.checked = Boolean(data.shareable);
        Shared.syncAirportNameField(form.airport_code, form.airport_name);
        setRequestHints(form);
        syncConvertState(data);
        await loadAssignableGroups(data);
      }
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const shouldConvertToGroup = Boolean(requestId && convertCheckbox?.checked);
      Shared.showMessage(message, shouldConvertToGroup ? "\u6b63\u5728\u4fdd\u5b58\u5e76\u8f6c\u6362\u6210\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355..." : "\u6b63\u5728\u4fdd\u5b58\u767b\u8bb0\u8868\u5355...");
      try {
        const payload = requestPayloadFromForm(form);
        const result = requestId
          ? await Api.updateRequest(requestId, payload)
          : await Api.createRequest(payload);

        if (!requestId) {
          Shared.showMessage(message, "\u767b\u8bb0\u8868\u5355\u4fdd\u5b58\u6210\u529f");
          window.location.href = `./transport-admin-request-edit.html?id=${result.id}`;
        } else {
          if (shouldConvertToGroup) {
            if (result.is_grouped) {
              Shared.showMessage(message, "\u8fd9\u6761\u767b\u8bb0\u5df2\u7ecf\u5339\u914d\u5230\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\uff0c\u8bf7\u5148\u89e3\u9664\u539f\u5339\u914d\u540e\u518d\u8f6c\u6362\u3002", true);
              syncConvertState(result);
              await loadAssignableGroups(result);
              return;
            }

            const groupPayload = buildConfirmedOrderPayloadFromRequest(result);
            const createdGroup = await Api.createGroup(groupPayload);
            await Api.saveGroupMembers(createdGroup.id, [result.id]);
            Shared.showMessage(message, "\u5df2\u4fdd\u5b58\u767b\u8bb0\u5e76\u8f6c\u6362\u6210\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355");
            window.location.href = `./transport-admin-group-edit.html?id=${createdGroup.id}`;
            return;
          }

          Shared.showMessage(message, "\u767b\u8bb0\u8868\u5355\u4fdd\u5b58\u6210\u529f");
          syncConvertState(result);
          await loadAssignableGroups(result);
        }
      } catch (error) {
        Shared.showMessage(message, error.message, true);
      }
    });

    if (assignButton && groupSelect) {
      assignButton.addEventListener("click", async () => {
        await assignRequestToGroup(groupSelect.value);
      });
    }

    forceAssignForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const sourceOrderInput = forceAssignForm.elements.source_order_no;
      const sourceOrderNo = String(sourceOrderInput?.value || "").trim().toUpperCase();

      if (!sourceOrderNo) {
        Shared.showMessage(message, "请输入一个已在确认单里的登记订单编号", true);
        return;
      }

      Shared.showMessage(message, "正在按编号查找目标确认单...");

      try {
        const requests = await Api.listRequests({ order_no: sourceOrderNo });
        const matchedRequest = Array.isArray(requests) ? requests[0] : null;

        if (!matchedRequest) {
          Shared.showMessage(message, `未找到登记订单编号：${sourceOrderNo}`, true);
          return;
        }

        const matchedGroupId = matchedRequest.transport_group_members?.[0]?.group_id;
        if (!matchedGroupId) {
          Shared.showMessage(message, `登记 ${sourceOrderNo} 还没有加入任何确认接送机订单，不能用来强制匹配。`, true);
          return;
        }

        await assignRequestToGroup(matchedGroupId);
      } catch (error) {
        Shared.showMessage(message, error.message, true);
      }
    });
  }

  async function initGroupsListPage() {
    const root = document.querySelector("#transportGroupsPage");
    if (!root || !(await requireSession())) {
      return;
    }

    bindLogout();

    const form = document.querySelector("#transportGroupFilters");
    const list = document.querySelector("#transportGroupsList");
    const quickJumpForm = document.querySelector("#transportRequestQuickJump");
    const quickJumpMessage = document.querySelector("#transportGroupQuickJumpMessage");
    const pagination = document.querySelector("#transportGroupsPagination");
    let currentPage = 1;
    let totalPages = 1;
    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render(page = 1) {
      currentPage = page;
      list.innerHTML = '<div class="admin-loading">\u6b63\u5728\u52a0\u8f7d\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355...</div>';
      if (pagination) {
        pagination.innerHTML = "";
      }
      const payload = await Api.listGroups({
        paginate: true,
        page,
        page_size: 10,
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        status: form.status.value,
        visible_on_frontend: form.visible_on_frontend.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value
      }).catch(error => {
          list.innerHTML = `<section class="admin-panel"><div class="admin-empty-state"><h2>\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u52a0\u8f7d\u5931\u8d25</h2><p>${Shared.escapeHtml(error.message)}</p></div></section>`;
      });

      if (!payload) {
        return;
      }

      const data = Array.isArray(payload?.items) ? payload.items : [];
      totalPages = Number(payload?.pagination?.total_pages) || 1;

      if (!data.length) {
        list.innerHTML = '<section class="admin-panel"><div class="admin-empty-state"><h2>\u6682\u65e0\u7b26\u5408\u6761\u4ef6\u7684\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355</h2><p>\u8bf7\u8c03\u6574\u7b5b\u9009\u6761\u4ef6\u6216\u65b0\u5efa\u4e00\u6761\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u3002</p></div></section>';
        renderTransportPagination(pagination, currentPage, totalPages);
        return;
      }

      list.innerHTML = `
        <section class="admin-panel">
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>\u521d\u59cb\u8ba2\u5355\u7f16\u53f7</th>
                  <th>\u670d\u52a1\u7c7b\u578b</th>
                  <th>\u51fa\u884c\u65e5\u671f</th>
                  <th>\u8def\u7ebf</th>
                  <th>\u5f53\u524d\u4eba\u6570 / \u8fd8\u53ef\u62fc\u4eba\u6570</th>
                  <th>\u524d\u7aef\u5165\u53e3\u663e\u793a</th>
                  <th>\u72b6\u6001</th>
                  <th>\u64cd\u4f5c</th>
                </tr>
              </thead>
              <tbody>
                ${data.map(item => `
                  <tr>
                    <td>
                      <strong>${Shared.escapeHtml(item.source_order_no_preview || "--")}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml((item.source_order_nos || []).join(" · ") || "--")}</div>
                    </td>
                    <td>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</td>
                    <td>
                      <strong>${Shared.escapeHtml(Shared.formatDate(item.group_date))}</strong>
                      <div class="admin-table-subtle">${Shared.escapeHtml(item.airport_code)} · ${Shared.escapeHtml(item.terminal || "--")}</div>
                    </td>
                    <td>${Shared.escapeHtml(item.location_from)} \u5230 ${Shared.escapeHtml(item.location_to)}</td>
                    <td>${item.current_passenger_count || 0} / ${remainingSeats(item)}</td>
                    <td>${item.visible_on_frontend ? "\u5df2\u5c55\u793a" : "\u672a\u5c55\u793a"}</td>
                    <td>${groupStatusBadge(item.status)}</td>
                    <td>
                      <div class="admin-table-actions">
                        <a class="button button-secondary admin-table-action" href="./transport-admin-group-edit.html?id=${item.id}">\u7f16\u8f91</a>
                        <button class="button button-text is-danger admin-table-action" type="button" data-group-delete="${item.id}">\u5220\u9664</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      `;

      list.querySelectorAll("[data-group-delete]").forEach(button => {
        button.addEventListener("click", async () => {
          const groupId = button.dataset.groupDelete;
          const confirmed = window.confirm("\u786e\u8ba4\u5220\u9664\u8fd9\u6761\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u5417\uff1f\n\n\u5220\u9664\u540e\uff0c\u8be5\u8ba2\u5355\u4e0b\u7684\u5339\u914d\u5173\u7cfb\u4f1a\u4e00\u8d77\u89e3\u9664\uff0c\u767b\u8bb0\u8868\u5355\u4f1a\u56de\u5230\u672a\u5339\u914d\u72b6\u6001\u3002");
          if (!confirmed) {
            return;
          }

          Shared.showMessage(quickJumpMessage, "\u6b63\u5728\u5220\u9664\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355...");
          button.disabled = true;

          try {
            await Api.deleteGroup(groupId);
            Shared.showMessage(quickJumpMessage, "\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u5df2\u5220\u9664");
            await render();
          } catch (error) {
            button.disabled = false;
            Shared.showMessage(quickJumpMessage, error.message, true);
          }
        });
      });

      renderTransportPagination(pagination, currentPage, totalPages);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });

    quickJumpForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const orderNoInput = quickJumpForm.elements.order_no;
      const orderNo = String(orderNoInput?.value || "").trim().toUpperCase();

      if (!orderNo) {
        Shared.showMessage(quickJumpMessage, "请输入登记订单编号", true);
        return;
      }

      Shared.showMessage(quickJumpMessage, "正在查找对应登记...");

      try {
        const requests = await Api.listRequests({ order_no: orderNo });
        const matchedRequest = Array.isArray(requests) ? requests[0] : null;

        if (!matchedRequest) {
          Shared.showMessage(quickJumpMessage, `未找到登记订单编号：${orderNo}`, true);
          return;
        }

        const matchedGroupId = matchedRequest.transport_group_members?.[0]?.group_id;
        if (matchedRequest.is_grouped && matchedGroupId) {
          Shared.showMessage(quickJumpMessage, `登记 ${orderNo} 已经匹配过，正在跳转到原确认单...`);
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(matchedGroupId)}`;
          return;
        }

        Shared.showMessage(quickJumpMessage, `已找到登记 ${orderNo}，正在带入确认接送机订单编辑页...`);
        window.location.href = `./transport-admin-group-new.html?from_request_id=${encodeURIComponent(matchedRequest.id)}`;
      } catch (error) {
        Shared.showMessage(quickJumpMessage, error.message, true);
      }
    });

    pagination?.addEventListener("click", event => {
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

    render(1);
  }

  async function initGroupFormPage() {
    const root = document.querySelector("#transportGroupFormPage");
    if (!root || !(await requireSession())) {
      return;
    }

    bindLogout();

    const form = document.querySelector("#transportGroupForm");
    const message = document.querySelector("#transportGroupMessage");
    const memberPanel = document.querySelector("#transportGroupMembersPanel");
    const memberList = document.querySelector("#transportGroupMembersList");
    const currentMembers = document.querySelector("#transportGroupCurrentMembers");
    const assignHint = document.querySelector("#transportGroupAssignHint");
    const forceAssignForm = document.querySelector("#transportGroupForceAssignForm");
    const groupId = Shared.queryParam("id");
    const sourceRequestId = Shared.queryParam("from_request_id");
    const sourceHint = document.querySelector("#transportGroupSourceHint");

    wireAirportFields(form);

    function applyGroupPayloadToForm(payload) {
      Object.entries(payload || {}).forEach(([key, value]) => {
        if (!form[key]) {
          return;
        }
        form[key].value = value ?? "";
      });
      fillDateTimeInput(form.flight_time_reference, payload.flight_time_reference);
      fillDateTimeInput(form.preferred_time_start, payload.preferred_time_start);
      fillDateTimeInput(form.preferred_time_end, payload.preferred_time_end);
      if (form.current_passenger_count) {
        form.current_passenger_count.value = String(payload.current_passenger_count ?? 0);
      }
      if (form.remaining_passenger_count) {
        const remaining = Math.max(Number(payload.max_passengers || 0) - Number(payload.current_passenger_count || 0), 0);
        form.remaining_passenger_count.value = String(remaining);
      }
      Shared.syncAirportNameField(form.airport_code, form.airport_name);
    }

    async function saveRequestIdsToCurrentGroup(requestIds) {
      if (!groupId) {
        return;
      }

      Shared.showMessage(message, "\u6b63\u5728\u4fdd\u5b58\u5339\u914d\u7ed3\u679c...");
      try {
        await Api.saveGroupMembers(groupId, requestIds);
        Shared.showMessage(message, "\u5339\u914d\u7ed3\u679c\u4fdd\u5b58\u6210\u529f");
        await loadGroup(groupId);
      } catch (error) {
        if (error.details?.group_id) {
          Shared.showMessage(message, "\u8fd9\u6761\u767b\u8bb0\u5df2\u7ecf\u5728\u5176\u4ed6\u786e\u8ba4\u5355\u91cc\uff0c\u6b63\u5728\u8df3\u8f6c...", true);
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(error.details.group_id)}`;
          return;
        }
        Shared.showMessage(message, error.message, true);
      }
    }

    async function renderAssignableRequests(group) {
      if (!memberPanel || !memberList) {
        return;
      }

      const referenceDate = group.group_date || getLondonIsoDateTimeDatePart(group.flight_time_reference || group.preferred_time_start || group.preferred_time_end || "");
      const requests = await Api.listRequests({
        service_type: group.service_type,
        airport_code: group.airport_code,
        date_from: referenceDate || undefined,
        date_to: referenceDate || undefined
      }).catch(() => []);

      const selectedIds = new Set((group.members || []).map(item => item.request_id));
      const eligible = requests.filter(item => item.status !== "cancelled" && (!item.is_grouped || selectedIds.has(item.id)));

      if (assignHint) {
        assignHint.textContent = referenceDate
          ? `已按这张确认接送机订单的日期 ${Shared.formatDate(referenceDate)} 筛选同一天登记表单。`
          : "\u672a\u8bc6\u522b\u5230\u786e\u8ba4\u5355\u65e5\u671f\uff0c\u5f53\u524d\u663e\u793a\u540c\u673a\u573a\u7684\u767b\u8bb0\u8868\u5355\u3002";
      }

      memberList.innerHTML = eligible.length ? eligible.map(item => `
        <label class="transport-check-card">
          <input type="checkbox" value="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""}>
          <div>
            <strong>${Shared.escapeHtml(item.student_name)} · ${item.passenger_count} \u4eba</strong>
            <p>${Shared.escapeHtml(item.airport_code)} · ${Shared.escapeHtml(Shared.formatDateTime(item.flight_datetime))}</p>
            <p>${Shared.escapeHtml(item.location_from)} \u5230 ${Shared.escapeHtml(item.location_to)}</p>
          </div>
        </label>
      `).join("") : '<div class="admin-empty-state"><h2>\u6682\u65e0\u53ef\u5339\u914d\u767b\u8bb0\u8868\u5355</h2><p>\u5f53\u524d\u6ca1\u6709\u7b26\u5408\u8be5\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u6761\u4ef6\u7684\u767b\u8bb0\u8868\u5355\u3002</p></div>';

      memberPanel.hidden = false;
    }

    function renderCurrentMembers(group) {
      if (!currentMembers) {
        return;
      }
      const members = group.members || [];
      currentMembers.innerHTML = members.length ? members.map(member => `
        <article class="transport-current-member">
          <div>
            <strong>${Shared.escapeHtml(member.transport_requests.student_name)}</strong>
            <p>${Shared.escapeHtml(member.transport_requests.airport_code)} · \u4eba\u6570\u5feb\u7167 ${member.passenger_count_snapshot} · \u884c\u674e\u5feb\u7167 ${member.luggage_count_snapshot}</p>
          </div>
          <button class="button button-secondary" type="button" data-remove-member="${member.id}">\u79fb\u9664</button>
        </article>
      `).join("") : '<div class="admin-empty-state"><h2>\u6682\u65e0\u5df2\u5339\u914d\u767b\u8bb0\u8868\u5355</h2><p>\u8bf7\u5148\u6dfb\u52a0\u7b26\u5408\u6761\u4ef6\u7684\u767b\u8bb0\u8868\u5355\u3002</p></div>';
    }

    async function loadGroup(id) {
      const group = await Api.getGroup(id).catch(error => {
        Shared.showMessage(message, error.message, true);
      });

      if (!group) {
        return null;
      }

      Object.entries(group).forEach(([key, value]) => {
        if (!form[key]) {
          return;
        }
        form[key].value = value ?? "";
      });
      fillDateTimeInput(form.flight_time_reference, group.flight_time_reference);
      fillDateTimeInput(form.preferred_time_start, group.preferred_time_start);
      fillDateTimeInput(form.preferred_time_end, group.preferred_time_end);
      if (form.current_passenger_count) {
        form.current_passenger_count.value = String(group.current_passenger_count || 0);
      }
      if (form.remaining_passenger_count) {
        form.remaining_passenger_count.value = String(remainingSeats(group));
      }
      Shared.syncAirportNameField(form.airport_code, form.airport_name);

      await renderAssignableRequests(group);
      renderCurrentMembers(group);
      return group;
    }

    async function loadSourceRequestIntoNewGroup() {
      if (!sourceRequestId || groupId) {
        return;
      }

      const request = await Api.getRequest(sourceRequestId).catch(error => {
        Shared.showMessage(message, error.message, true);
      });

      if (!request) {
        return;
      }

      if (request.is_grouped) {
        const matchedGroupId = request.transport_group_members?.[0]?.group_id;
        Shared.showMessage(message, "这条登记已经匹配到确认接送机订单，正在带你跳转到原确认单。", true);
        if (sourceHint) {
          sourceHint.hidden = false;
          sourceHint.textContent = `来源登记 ${request.order_no || request.id} 已经匹配过，请先查看原确认接送机订单。`;
        }
        if (matchedGroupId) {
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(matchedGroupId)}`;
        }
        return;
      }

      const payload = buildConfirmedOrderPayloadFromRequest(request);
      applyGroupPayloadToForm(payload);
      if (sourceHint) {
        sourceHint.hidden = false;
        sourceHint.textContent = `已带入登记 ${request.order_no || request.id} 的信息。你可以先修改确认接送机订单内容，保存后会自动把这条登记加入订单。`;
      }
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      Shared.showMessage(message, "\u6b63\u5728\u4fdd\u5b58\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355...");
      try {
        const payload = groupPayloadFromForm(form);
        const result = groupId
          ? await Api.updateGroup(groupId, payload)
          : await Api.createGroup(payload);

        if (!groupId && sourceRequestId) {
          await Api.saveGroupMembers(result.id, [sourceRequestId]);
        }

        Shared.showMessage(message, "\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355\u4fdd\u5b58\u6210\u529f");
        if (!groupId) {
          window.location.href = `./transport-admin-group-edit.html?id=${result.id}`;
        } else {
          await loadGroup(groupId);
        }
      } catch (error) {
        if (error.details?.group_id) {
          Shared.showMessage(message, "这条登记已经匹配到其他确认接送机订单，正在带你跳过去。", true);
          window.location.href = `./transport-admin-group-edit.html?id=${encodeURIComponent(error.details.group_id)}`;
          return;
        }
        Shared.showMessage(message, error.message, true);
      }
    });

      if (groupId) {
      await loadGroup(groupId);

      const saveMembersButton = document.querySelector("#transportGroupSaveMembersButton");
      if (saveMembersButton) {
        saveMembersButton.addEventListener("click", async () => {
          const requestIds = Array.from(memberList.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
          await saveRequestIdsToCurrentGroup(requestIds);
        });
      }

      forceAssignForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const sourceOrderInput = forceAssignForm.elements.source_order_no;
        const sourceOrderNo = String(sourceOrderInput?.value || "").trim().toUpperCase();

        if (!sourceOrderNo) {
          Shared.showMessage(message, "请输入登记订单编号", true);
          return;
        }

        Shared.showMessage(message, "正在查找这条登记...");

        try {
          const requests = await Api.listRequests({ order_no: sourceOrderNo });
          const matchedRequest = Array.isArray(requests) ? requests[0] : null;

          if (!matchedRequest) {
            Shared.showMessage(message, `未找到登记订单编号：${sourceOrderNo}`, true);
            return;
          }

          const currentSelectedIds = Array.from(memberList.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
          const nextIds = Array.from(new Set([...currentSelectedIds, matchedRequest.id]));
          await saveRequestIdsToCurrentGroup(nextIds);
        } catch (error) {
          Shared.showMessage(message, error.message, true);
        }
      });

      currentMembers?.addEventListener("click", async event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const memberId = target.getAttribute("data-remove-member");
        if (!memberId) {
          return;
        }
        Shared.showMessage(message, "\u6b63\u5728\u79fb\u9664\u5df2\u5339\u914d\u767b\u8bb0\u8868\u5355...");
        try {
          await Api.removeGroupMember(memberId);
          Shared.showMessage(message, "\u79fb\u9664\u6210\u529f");
          await loadGroup(groupId);
        } catch (error) {
          Shared.showMessage(message, error.message, true);
        }
      });
    }

    if (!groupId) {
      await loadSourceRequestIntoNewGroup();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initRequestsListPage();
    initRequestFormPage();
    initGroupsListPage();
    initGroupFormPage();
  });
})();
