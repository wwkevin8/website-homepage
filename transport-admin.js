(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;

  if (!Shared || !Api) {
    return;
  }

  async function requireSession() {
    const session = await Api.session().catch(() => ({ authenticated: false }));
    if (!session.authenticated) {
      window.location.href = "./transport-admin-login.html";
      return false;
    }
    return true;
  }

  function highlightAdminNav() {
    const currentPath = window.location.pathname.split("/").pop() || "";
    document.querySelectorAll(".transport-admin-nav a.button").forEach(link => {
      const href = link.getAttribute("href") || "";
      const targetPath = href.split("/").pop();
      const isMatch =
        currentPath === targetPath ||
        (currentPath.startsWith("transport-admin-request-") && targetPath === "transport-admin-requests.html") ||
        (currentPath.startsWith("transport-admin-group-") && targetPath === "transport-admin-groups.html");

      link.classList.toggle("is-current", isMatch);
      if (isMatch) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function bindLogout() {
    document.querySelectorAll("[data-transport-logout]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        await Api.logout().catch(() => {});
        window.location.href = "./transport-admin-login.html";
      });
    });
  }

  function setRequestHints(form) {
    const type = Shared.fieldValue(form, '[name="service_type"]');
    const fromInput = form.querySelector('[name="location_from"]');
    const toInput = form.querySelector('[name="location_to"]');
    const flightLabel = form.querySelector('[data-flight-datetime-label]');
    const terminalLabel = form.querySelector('[data-terminal-label]');

    if (type === "dropoff") {
      if (fromInput) fromInput.placeholder = "例如：Nottingham City Centre";
      if (toInput) toInput.placeholder = "例如：Heathrow Airport";
      if (flightLabel) flightLabel.textContent = "起飞日期时间";
      if (terminalLabel) terminalLabel.textContent = "出发航站楼";
    } else {
      if (fromInput) fromInput.placeholder = "例如：Heathrow Airport";
      if (toInput) toInput.placeholder = "例如：Nottingham";
      if (flightLabel) flightLabel.textContent = "抵达日期时间";
      if (terminalLabel) terminalLabel.textContent = "抵达航站楼";
    }
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
      vehicle_type: Shared.fieldValue(form, '[name="vehicle_type"]'),
      max_passengers: Number.parseInt(Shared.fieldValue(form, '[name="max_passengers"]'), 10),
      visible_on_frontend: Shared.fieldValue(form, '[name="visible_on_frontend"]') === "true",
      status: Shared.fieldValue(form, '[name="status"]'),
      notes: Shared.fieldValue(form, '[name="notes"]')
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

  async function initLoginPage() {
    const form = document.querySelector("#transportAdminLoginForm");
    if (!form) {
      return;
    }

    const session = await Api.session().catch(() => ({ authenticated: false }));
    if (session.authenticated) {
      window.location.href = "./transport-admin-requests.html";
      return;
    }

    const message = document.querySelector("#transportAdminLoginMessage");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      Shared.showMessage(message, "正在登录...");
      try {
        await Api.login(form.password.value);
        window.location.href = "./transport-admin-requests.html";
      } catch (error) {
        Shared.showMessage(message, error.message, true);
      }
    });
  }

  async function initRequestsListPage() {
    const root = document.querySelector("#transportRequestsPage");
    if (!root || !(await requireSession())) {
      return;
    }
    bindLogout();

    const form = document.querySelector("#transportRequestFilters");
    const list = document.querySelector("#transportRequestsList");
    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render() {
      list.innerHTML = '<div class="transport-loading">加载中...</div>';
      const data = await Api.listRequests({
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        status: form.status.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value
      }).catch(error => {
        list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
      });

      if (!data) {
        return;
      }

      if (!data.length) {
        list.innerHTML = '<div class="transport-empty">暂无符合条件的需求。</div>';
        return;
      }

      list.innerHTML = data.map(item => `
        <article class="transport-list-card">
          <div class="transport-list-top">
            <div>
              <h3>${Shared.escapeHtml(item.student_name)} · ${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</h3>
              <p>${Shared.escapeHtml(item.airport_code)} · ${Shared.escapeHtml(item.airport_name)} · ${Shared.escapeHtml(item.terminal || "--")} · ${Shared.escapeHtml(Shared.formatDateTime(item.flight_datetime))}</p>
            </div>
            <span class="transport-status-pill">${Shared.escapeHtml(Shared.requestStatusLabel(item.effective_status || item.status))}</span>
          </div>
          <p>${Shared.escapeHtml(item.location_from)} → ${Shared.escapeHtml(item.location_to)}</p>
          <p>人数 ${item.passenger_count} / 行李 ${item.luggage_count} / 可拼车 ${item.shareable ? "是" : "否"} / 分组情况 ${item.is_grouped ? "已分组" : "未分组"}</p>
          <div class="transport-card-actions">
            <a class="button button-secondary" href="./transport-admin-request-edit.html?id=${item.id}">编辑需求</a>
          </div>
        </article>
      `).join("");
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render();
    });

    render();
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
    const requestId = Shared.queryParam("id");

    wireAirportFields(form);
    form.service_type.addEventListener("change", () => setRequestHints(form));
    setRequestHints(form);

    async function loadAssignableGroups(currentRequest) {
      if (!groupSection || !groupSelect) {
        return;
      }
      const groups = await Api.listGroups({
        service_type: currentRequest.service_type,
        airport_code: currentRequest.airport_code
      }).catch(() => []);

      groupSelect.innerHTML = '<option value="">请选择拼车组</option>' + groups.map(group => (
        `<option value="${group.id}">${Shared.escapeHtml(`${Shared.formatDate(group.group_date)} · ${group.airport_code} · ${group.location_from} → ${group.location_to}`)}</option>`
      )).join("");

      groupSection.hidden = false;
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
        await loadAssignableGroups(data);
      }
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      Shared.showMessage(message, "保存中...");
      try {
        const payload = requestPayloadFromForm(form);
        const result = requestId
          ? await Api.updateRequest(requestId, payload)
          : await Api.createRequest(payload);
        Shared.showMessage(message, "需求已保存。");
        if (!requestId) {
          window.location.href = `./transport-admin-request-edit.html?id=${result.id}`;
        } else {
          await loadAssignableGroups(result);
        }
      } catch (error) {
        Shared.showMessage(message, error.message, true);
      }
    });

    if (assignButton && groupSelect) {
      assignButton.addEventListener("click", async () => {
        if (!requestId || !groupSelect.value) {
          Shared.showMessage(message, "请先选择一个拼车组。", true);
          return;
        }
        Shared.showMessage(message, "分配中...");
        try {
          const group = await Api.getGroup(groupSelect.value);
          const requestIds = (group.members || []).map(item => item.request_id);
          if (!requestIds.includes(requestId)) {
            requestIds.push(requestId);
          }
          await Api.saveGroupMembers(group.id, requestIds);
          Shared.showMessage(message, "已分配到拼车组。");
        } catch (error) {
          Shared.showMessage(message, error.message, true);
        }
      });
    }
  }

  async function initGroupsListPage() {
    const root = document.querySelector("#transportGroupsPage");
    if (!root || !(await requireSession())) {
      return;
    }
    bindLogout();

    const form = document.querySelector("#transportGroupFilters");
    const list = document.querySelector("#transportGroupsList");
    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render() {
      list.innerHTML = '<div class="transport-loading">加载中...</div>';
      const data = await Api.listGroups({
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        status: form.status.value,
        visible_on_frontend: form.visible_on_frontend.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value
      }).catch(error => {
        list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
      });

      if (!data) {
        return;
      }

      if (!data.length) {
        list.innerHTML = '<div class="transport-empty">暂无符合条件的拼车组。</div>';
        return;
      }

      list.innerHTML = data.map(item => `
        <article class="transport-list-card">
          <div class="transport-list-top">
            <div>
              <h3>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))} · ${Shared.escapeHtml(Shared.formatDate(item.group_date))}</h3>
              <p>${Shared.escapeHtml(item.airport_code)} · ${Shared.escapeHtml(item.airport_name)} · ${Shared.escapeHtml(item.terminal || "--")} · ${Shared.escapeHtml(item.location_from)} → ${Shared.escapeHtml(item.location_to)}</p>
            </div>
            <span class="transport-status-pill">${Shared.escapeHtml(Shared.groupStatusLabel(item.status))}</span>
          </div>
          <p>车型 ${Shared.escapeHtml(item.vehicle_type || "--")} / 最大 ${item.max_passengers} / 已报 ${item.current_passenger_count || 0} / 剩余 ${item.remaining_passenger_count || 0}</p>
          <p>前台可见：${item.visible_on_frontend ? "是" : "否"}</p>
          <div class="transport-card-actions">
            <a class="button button-secondary" href="./transport-admin-group-edit.html?id=${item.id}">编辑拼车组</a>
          </div>
        </article>
      `).join("");
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render();
    });

    render();
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
    const groupId = Shared.queryParam("id");

    wireAirportFields(form);

    async function renderAssignableRequests(group) {
      if (!memberPanel || !memberList) {
        return;
      }

      const requests = await Api.listRequests({
        service_type: group.service_type,
        airport_code: group.airport_code
      }).catch(() => []);

      const selectedIds = new Set((group.members || []).map(item => item.request_id));
      const eligible = requests.filter(item => item.status !== "cancelled" && (!item.is_grouped || selectedIds.has(item.id)));

      memberList.innerHTML = eligible.length ? eligible.map(item => `
        <label class="transport-check-card">
          <input type="checkbox" value="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""}>
          <div>
            <strong>${Shared.escapeHtml(item.student_name)} · ${item.passenger_count} 人</strong>
            <p>${Shared.escapeHtml(item.airport_code)} · ${Shared.escapeHtml(item.airport_name)} · ${Shared.escapeHtml(Shared.formatDateTime(item.flight_datetime))}</p>
            <p>${Shared.escapeHtml(item.location_from)} → ${Shared.escapeHtml(item.location_to)}</p>
          </div>
        </label>
      `).join("") : '<div class="transport-empty">暂无可分配需求。</div>';

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
            <p>${Shared.escapeHtml(member.transport_requests.airport_code)} · 快照人数 ${member.passenger_count_snapshot} · 快照行李 ${member.luggage_count_snapshot}</p>
          </div>
          <button class="button button-secondary" type="button" data-remove-member="${member.id}">移除成员</button>
        </article>
      `).join("") : '<div class="transport-empty">当前还没有成员。</div>';
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
      Shared.syncAirportNameField(form.airport_code, form.airport_name);

      await renderAssignableRequests(group);
      renderCurrentMembers(group);
      return group;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      Shared.showMessage(message, "保存中...");
      try {
        const payload = groupPayloadFromForm(form);
        const result = groupId
          ? await Api.updateGroup(groupId, payload)
          : await Api.createGroup(payload);
        Shared.showMessage(message, "拼车组已保存。");
        if (!groupId) {
          window.location.href = `./transport-admin-group-edit.html?id=${result.id}`;
        } else {
          await loadGroup(groupId);
        }
      } catch (error) {
        Shared.showMessage(message, error.message, true);
      }
    });

    if (groupId) {
      await loadGroup(groupId);

      const saveMembersButton = document.querySelector("#transportGroupSaveMembersButton");
      if (saveMembersButton) {
        saveMembersButton.addEventListener("click", async () => {
          Shared.showMessage(message, "成员保存中...");
          try {
            const requestIds = Array.from(memberList.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
            await Api.saveGroupMembers(groupId, requestIds);
            Shared.showMessage(message, "成员已更新。");
            await loadGroup(groupId);
          } catch (error) {
            Shared.showMessage(message, error.message, true);
          }
        });
      }

      currentMembers?.addEventListener("click", async event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const memberId = target.getAttribute("data-remove-member");
        if (!memberId) {
          return;
        }
        Shared.showMessage(message, "成员移除中...");
        try {
          await Api.removeGroupMember(memberId);
          Shared.showMessage(message, "成员已移除。");
          await loadGroup(groupId);
        } catch (error) {
          Shared.showMessage(message, error.message, true);
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    highlightAdminNav();
    initLoginPage();
    initRequestsListPage();
    initRequestFormPage();
    initGroupsListPage();
    initGroupFormPage();
  });
})();
