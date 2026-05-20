(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  const CURRENT_CYCLE = "2026-27";
  let membershipsPage = 1;
  let membershipsTotalPages = 1;
  let membershipCodesPage = 1;

  function escapeHtml(value) {
    return AdminShell.escapeHtml(value === null || value === undefined ? "" : String(value));
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
      return String(value);
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `GBP ${number.toFixed(2)}` : String(value);
  }

  function benefitLabel(type) {
    const labels = {
      storage: "寄存",
      pickup: "接机",
      moving: "搬家",
      welcome_pack: "新生大礼包",
      cashback: "返现/人工备注",
      manual: "人工记录"
    };
    return labels[type] || type || "--";
  }

  function statusLabel(status) {
    const labels = {
      active: "有效 / 未使用",
      redeemed: "已兑换",
      revoked: "已作废",
      expired: "已过期",
      selected: "已选择",
      reserved: "已绑定订单",
      used: "已使用",
      cancelled: "已作废",
      manual: "人工记录"
    };
    return labels[status] || status || "--";
  }

  function auditActionLabel(action) {
    const labels = {
      membership_entitlement_granted: "开通会员",
      membership_manual_claim_recorded: "登记权益",
      membership_claim_marked_used: "标记已使用",
      membership_claim_cancelled: "作废权益",
      membership_claim_reset: "重置权益",
      membership_claim_order_bound: "绑定订单",
      membership_claim_order_unbound: "解绑订单",
      membership_activation_code_created: "生成激活码",
      membership_activation_code_deleted: "删除激活码",
      membership_activation_code_revoked: "作废激活码",
      membership_activation_code_redeemed: "兑换激活码"
    };
    return labels[action] || action || "--";
  }

  function promptManualClaimInput(defaultStatus = "selected") {
    const benefitOptions = [
      { key: "pickup", label: "接机" },
      { key: "storage", label: "寄存" },
      { key: "moving", label: "搬家" },
      { key: "welcome_pack", label: "新生大礼包" }
    ];
    const benefitChoice = window.prompt(
      "请选择权益类型：\n1. 接机\n2. 寄存\n3. 搬家\n4. 新生大礼包",
      "1"
    );
    if (benefitChoice === null) {
      return null;
    }
    const normalizedBenefitInput = String(benefitChoice || "").trim();
    const benefitByNumber = benefitOptions[Number(normalizedBenefitInput) - 1]?.key || "";
    const normalizedBenefit = benefitByNumber || normalizedBenefitInput;
    if (!benefitOptions.some(option => option.key === normalizedBenefit)) {
      window.alert("权益类型无效，请输入 1-4，或输入 pickup、storage、moving、welcome_pack");
      return null;
    }

    const status = window.prompt("请选择权益状态：\n1. 已选择\n2. 人工记录\n3. 已使用\n4. 已绑定订单", defaultStatus);
    if (status === null) {
      return null;
    }
    const statusInput = String(status || "").trim();
    const statusByNumber = {
      1: "selected",
      2: "manual",
      3: "used",
      4: "reserved"
    }[statusInput] || "";
    const normalizedStatus = statusByNumber || statusInput || defaultStatus;
    if (!["selected", "manual", "used", "reserved"].includes(normalizedStatus)) {
      window.alert("权益状态无效，请输入 1-4，或输入 selected、manual、used、reserved");
      return null;
    }

    const note = window.prompt("备注，可留空", "");
    if (note === null) {
      return null;
    }

    return {
      benefit_type: normalizedBenefit,
      status: normalizedStatus,
      admin_note: String(note || "").trim()
    };
  }

  function statusBadge(status) {
    const normalized = String(status || "").trim();
    const className = normalized === "active" || normalized === "used"
      ? "is-success"
      : normalized === "reserved" || normalized === "selected" || normalized === "manual"
        ? "is-warning"
        : normalized === "cancelled" || normalized === "revoked" || normalized === "expired"
          ? "is-danger"
          : "is-neutral";
    return `<span class="admin-status-badge ${className}">${escapeHtml(statusLabel(normalized))}</span>`;
  }

  function adminName(admin, fallback = "") {
    if (!admin) {
      return fallback || "--";
    }
    return admin.name || admin.username || admin.email || fallback || "--";
  }

  function siteUserName(user, fallback = "--") {
    if (!user) {
      return fallback || "--";
    }
    if (user.name && user.email) {
      return `${user.name} / ${user.email}`;
    }
    return user.name || user.email || user.phone || user.public_user_id || fallback || "--";
  }

  function setMessage(node, text, isError = false) {
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.classList.toggle("is-error", Boolean(text && isError));
    node.classList.toggle("is-success", Boolean(text && !isError));
  }

  function renderPagination(container, meta) {
    if (!container) {
      return;
    }
    const page = Number(meta?.page || 1);
    const totalPages = Math.max(Number(meta?.total_pages || 1), 1);
    const total = Number(meta?.total || 0);
    container.innerHTML = `
      <button class="button button-secondary" type="button" data-membership-page="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${totalPages} 页，共 ${total} 条</span>
      <button class="button button-secondary" type="button" data-membership-page="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  function renderUserResults(users) {
    const container = document.querySelector("#adminMembershipUserResults");
    if (!container) {
      return;
    }
    if (!users.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          <h2>没有找到用户</h2>
          <p>请换一个姓名、邮箱、手机号或微信再试。</p>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>邮箱</th>
              <th>手机号</th>
              <th>微信</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td>${escapeHtml(user.nickname || "--")}</td>
                <td>${escapeHtml(user.email || "--")}</td>
                <td>${escapeHtml(user.phone || "--")}</td>
                <td>${escapeHtml(user.wechat_id || "--")}</td>
                <td>${escapeHtml(formatDateTime(user.created_at))}</td>
                <td>
                  <button
                    class="button button-secondary admin-table-action"
                    type="button"
                    data-membership-pick-user="${escapeHtml(user.id)}"
                    data-membership-pick-user-label="${escapeHtml(user.nickname || user.email || user.phone || user.wechat_id || user.public_user_id || "已选择用户")}"
                  >选择开通</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAuditLogs(logs) {
    if (!Array.isArray(logs) || !logs.length) {
      return '<p class="admin-table-subtle">暂无操作记录。</p>';
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td>${escapeHtml(formatDateTime(log.created_at))}</td>
                <td>${escapeHtml(auditActionLabel(log.action))}</td>
                <td>${escapeHtml(log.metadata?.reason || log.metadata?.note || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function entitlementActions(item, claim) {
    const liveStatuses = ["selected", "reserved", "used", "manual", "cancelled"];
    const status = String(claim?.status || "").trim();
    const actions = [];
    if (!claim || !liveStatuses.includes(status)) {
      actions.push(`<button class="button button-secondary admin-table-action" type="button" data-membership-action="manual-claim" data-entitlement-id="${escapeHtml(item.id)}">登记权益</button>`);
    } else {
      actions.push(`<button class="button button-secondary admin-table-action" type="button" data-membership-action="show-benefit-detail" data-entitlement-id="${escapeHtml(item.id)}">权益详情</button>`);
      actions.push(`<button class="button button-secondary admin-table-action" type="button" data-membership-action="show-audit-log" data-entitlement-id="${escapeHtml(item.id)}">操作记录</button>`);
      if (status === "cancelled") {
        actions.push(`<button class="button button-secondary admin-table-action" type="button" data-membership-action="manual-claim" data-entitlement-id="${escapeHtml(item.id)}">重新登记权益</button>`);
      }
    }
    actions.push(`<button class="button button-secondary admin-table-action" type="button" data-membership-action="delete-membership" data-entitlement-id="${escapeHtml(item.id)}">删除</button>`);
    return `
      <div class="admin-inline-actions">
        ${actions.filter(Boolean).join("")}
      </div>
    `;
  }

  function toggleMembershipPanel(entitlementId, panelName) {
    if (!entitlementId || !panelName) {
      return;
    }
    const detailPanel = document.getElementById(`membershipBenefitDetails-${entitlementId}`);
    const auditPanel = document.getElementById(`membershipAuditLogs-${entitlementId}`);
    const target = panelName === "audit" ? auditPanel : detailPanel;
    if (!target) {
      return;
    }
    [detailPanel, auditPanel].forEach(panel => {
      if (panel && panel !== target) {
        panel.hidden = true;
      }
    });
    target.hidden = !target.hidden;
    if (!target.hidden) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderMemberships(payload) {
    const table = document.querySelector("#adminMembershipsTable");
    const pagination = document.querySelector("#adminMembershipsPagination");
    if (!table) {
      return;
    }
    const items = payload.items || [];
    if (!items.length) {
      table.innerHTML = `
        <div class="admin-panel">
          <div class="admin-empty-state">
            <h2>暂无会员数据</h2>
            <p>可以先从上方搜索用户并手动开通 2026-27 会员。</p>
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
              <th>用户姓名</th>
              <th>邮箱</th>
              <th>手机号</th>
              <th>会员周期</th>
              <th>会员状态</th>
              <th>权益类型</th>
              <th>关联订单号</th>
              <th>所属顾问</th>
              <th>会员生日信息</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const user = item.user || {};
              const claim = item.claim || null;
              const createdAt = claim?.created_at || item.created_at;
              const updatedAt = claim?.updated_at || item.updated_at;
              const isCancelled = claim?.status === "cancelled";
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(user.nickname || user.public_user_id || "--")}</strong>
                  </td>
                  <td>${escapeHtml(user.email || "--")}</td>
                  <td>${escapeHtml(user.phone || "--")}</td>
                  <td>${escapeHtml(item.membership_cycle || "--")}</td>
                  <td>${statusBadge(claim?.status || item.status)}</td>
                  <td>${escapeHtml(benefitLabel(claim?.benefit_type))}</td>
                  <td>${escapeHtml(claim?.linked_order_no || "--")}</td>
                  <td>${escapeHtml(adminName(item.advisor))}</td>
                  <td>${escapeHtml(item.member_birthday || "--")}</td>
                  <td>${entitlementActions(item, claim)}</td>
                </tr>
                ${claim ? `
                <tr>
                  <td colspan="10">
                    <div class="admin-detail-section" id="membershipBenefitDetails-${escapeHtml(item.id)}" hidden>
                      <h3>权益详情</h3>
                      ${isCancelled ? `
                        <p class="admin-table-subtle">该权益已作废，不再占用当前会员权益。</p>
                        ${claim?.linked_order_no ? `<p class="admin-table-subtle">历史关联订单：${escapeHtml(claim.linked_order_no)}</p>` : ""}
                      ` : ""}
                      <div class="service-center-detail-grid">
                        <article class="service-center-detail-field"><strong>会员抵扣</strong><span>${escapeHtml(formatMoney(claim?.membership_discount_amount))}</span></article>
                        <article class="service-center-detail-field"><strong>创建时间</strong><span>${escapeHtml(formatDateTime(createdAt))}</span></article>
                        <article class="service-center-detail-field"><strong>更新时间</strong><span>${escapeHtml(formatDateTime(updatedAt))}</span></article>
                      </div>
                    </div>
                    <div class="admin-detail-section" id="membershipAuditLogs-${escapeHtml(item.id)}" hidden>
                      <h3>操作记录</h3>
                      ${renderAuditLogs(item.audit_logs || [])}
                    </div>
                  </td>
                </tr>
                ` : ""}
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    renderPagination(pagination, payload.pagination || {});
  }

  function renderMembershipCodes(payload) {
    const container = document.querySelector("#adminMembershipCodesTable");
    if (!container) {
      return;
    }
    const items = payload?.items || [];
    if (!items.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          <h2>暂无会员激活码</h2>
          <p>可先生成一个一次性会员码，用户兑换后会自动开通本周期会员。</p>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>激活码前缀</th>
              <th>会员周期</th>
              <th>创建管理员</th>
              <th>兑换用户</th>
              <th>兑换时间</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${escapeHtml(item.code_prefix || "--")}</td>
                <td>${escapeHtml(item.membership_cycle || "--")}</td>
                <td>${escapeHtml(adminName(item.generated_by_admin, item.generated_by_admin_id ? "未知管理员" : "--"))}</td>
                <td>${escapeHtml(siteUserName(item.redeemed_by_user, item.redeemed_by_user_id ? "已兑换" : "--"))}</td>
                <td>${escapeHtml(formatDateTime(item.redeemed_at))}</td>
                <td>${escapeHtml(formatDateTime(item.created_at))}</td>
                <td>
                  ${item.status === "redeemed"
                    ? '<span class="admin-table-subtle">已兑换</span>'
                    : `<button class="button button-secondary admin-table-action" type="button" data-membership-code-action="delete" data-code-id="${escapeHtml(item.id)}">删除</button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadMembershipCodes() {
    const container = document.querySelector("#adminMembershipCodesTable");
    const searchForm = document.querySelector("#adminMembershipCodeSearchForm");
    const searchFields = searchForm?.elements || {};
    if (container) {
      container.innerHTML = '<div class="admin-loading">正在加载会员激活码...</div>';
    }
    try {
      const payload = await AdminApi.listMembershipCodes({
        page: membershipCodesPage,
        page_size: 3,
        cycle: CURRENT_CYCLE,
        search: searchFields.search?.value || ""
      });
      renderMembershipCodes(payload);
    } catch (error) {
      if (container) {
        container.innerHTML = `<div class="admin-empty-state"><h2>会员激活码加载失败</h2><p>${escapeHtml(error.message)}</p></div>`;
      }
    }
  }

  async function loadMemberships() {
    const form = document.querySelector("#adminMembershipFilters");
    const table = document.querySelector("#adminMembershipsTable");
    const fields = form?.elements || {};
    const selectedStatus = fields.status?.value || "";
    const claimStatuses = ["selected", "reserved", "used", "manual", "cancelled"];
    const entitlementStatus = selectedStatus === "expired" ? "expired" : selectedStatus === "unused" ? "active" : "";
    const claimStatus = claimStatuses.includes(selectedStatus) ? selectedStatus : "";
    if (table) {
      table.innerHTML = '<div class="admin-loading">正在加载会员权益数据...</div>';
    }
    try {
      const payload = await AdminApi.listMemberships({
        page: membershipsPage,
        page_size: 10,
        search: fields.search?.value || "",
        cycle: fields.cycle?.value || CURRENT_CYCLE,
        status: entitlementStatus,
        benefit_type: fields.benefit_type?.value || "",
        claim_status: claimStatus,
        display_status: selectedStatus
      });
      membershipsTotalPages = Number(payload?.pagination?.total_pages || 1);
      renderMemberships(payload);
    } catch (error) {
      if (table) {
        table.innerHTML = `<div class="admin-panel"><div class="admin-empty-state"><h2>会员列表加载失败</h2><p>${escapeHtml(error.message)}</p></div></div>`;
      }
    }
  }

  async function handleClaimAction(action, claimId) {
    if (!claimId) {
      return;
    }
    if (action === "reset" && !window.confirm("确认要重置该会员权益吗？当前权益将被标记为已作废，用户可重新选择权益。")) {
      return;
    }
    const reason = window.prompt(action === "mark-used" ? "核销备注，可留空" : "请输入操作原因或备注");
    if (reason === null) {
      return;
    }
    const payload = { reason };
    if (action === "mark-used") {
      await AdminApi.markMembershipClaimUsed(claimId, payload);
    } else if (action === "cancel") {
      await AdminApi.cancelMembershipClaim(claimId, payload);
    } else if (action === "reset") {
      await AdminApi.resetMembershipClaim(claimId, payload);
    }
    window.dispatchEvent(new CustomEvent("admin:assistant-message", {
      detail: { message: "会员权益操作已保存" }
    }));
    await loadMemberships();
  }

  function initMembershipsPage() {
    const root = document.querySelector("#adminMembershipsPage");
    if (!root) {
      return;
    }

    const userSearchForm = document.querySelector("#adminMembershipSearchForm");
    const userResults = document.querySelector("#adminMembershipUserResults");
    const grantForm = document.querySelector("#adminMembershipGrantForm");
    const grantMessage = document.querySelector("#adminMembershipGrantMessage");
    const filters = document.querySelector("#adminMembershipFilters");
    const table = document.querySelector("#adminMembershipsTable");
    const pagination = document.querySelector("#adminMembershipsPagination");
    const codeForm = document.querySelector("#adminMembershipCodeForm");
    const codeMessage = document.querySelector("#adminMembershipCodeMessage");
    const generatedCode = document.querySelector("#adminMembershipGeneratedCode");
    const codesTable = document.querySelector("#adminMembershipCodesTable");
    const codesRefresh = document.querySelector("#adminMembershipCodesRefresh");
    const codeSearchForm = document.querySelector("#adminMembershipCodeSearchForm");

    userSearchForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const fields = userSearchForm.elements || {};
      if (userResults) {
        userResults.innerHTML = '<div class="admin-loading">正在搜索用户...</div>';
      }
      try {
        const payload = await AdminApi.searchMembershipUsers({
          search: fields.search?.value || ""
        });
        renderUserResults(payload.items || []);
      } catch (error) {
        if (userResults) {
          userResults.innerHTML = `<div class="admin-empty-state"><h2>用户搜索失败</h2><p>${escapeHtml(error.message)}</p></div>`;
        }
      }
    });

    userSearchForm?.addEventListener("reset", () => {
      window.setTimeout(() => {
        if (userResults) {
          userResults.textContent = "";
        }
      }, 0);
    });

    userResults?.addEventListener("click", event => {
      const button = event.target.closest("[data-membership-pick-user]");
      if (!button || !grantForm) {
        return;
      }
      const fields = grantForm.elements || {};
      fields.site_user_id.value = button.getAttribute("data-membership-pick-user") || "";
      fields.selected_user_label.value = button.getAttribute("data-membership-pick-user-label") || "已选择用户";
      fields.membership_cycle.value = CURRENT_CYCLE;
      setMessage(grantMessage, "已选择用户，可以手动开通会员。");
    });

    grantForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const fields = grantForm.elements || {};
      setMessage(grantMessage, "正在开通会员...");
      try {
        await AdminApi.grantMembership({
          site_user_id: fields.site_user_id.value.trim(),
          membership_cycle: fields.membership_cycle.value.trim() || CURRENT_CYCLE,
          notes: ""
        });
        setMessage(grantMessage, "会员已开通。");
        await loadMemberships();
      } catch (error) {
        setMessage(grantMessage, error.message || "开通会员失败", true);
      }
    });

    codeForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const fields = codeForm.elements || {};
      setMessage(codeMessage, "正在生成会员激活码...");
      if (generatedCode) {
        generatedCode.hidden = true;
        generatedCode.innerHTML = "";
      }
      try {
        const payload = await AdminApi.createMembershipCode({
          membership_cycle: fields.membership_cycle?.value.trim() || CURRENT_CYCLE
        });
        setMessage(codeMessage, "会员激活码已生成。请立即复制保存，此激活码只显示一次。");
        if (generatedCode) {
          generatedCode.hidden = false;
          generatedCode.innerHTML = `
            <div class="admin-empty-state">
              <h2>请复制保存，此激活码只显示一次</h2>
              <p class="admin-membership-generated-code">${escapeHtml(payload.code || "")}</p>
            </div>
          `;
        }
        await loadMembershipCodes();
      } catch (error) {
        setMessage(codeMessage, error.message || "会员激活码生成失败", true);
      }
    });

    codesRefresh?.addEventListener("click", () => {
      membershipCodesPage = 1;
      loadMembershipCodes();
    });

    codeSearchForm?.addEventListener("submit", event => {
      event.preventDefault();
      membershipCodesPage = 1;
      loadMembershipCodes();
    });

    codeSearchForm?.addEventListener("reset", () => {
      window.setTimeout(() => {
        membershipCodesPage = 1;
        loadMembershipCodes();
      }, 0);
    });

    codesTable?.addEventListener("click", event => {
      const button = event.target.closest("[data-membership-code-action]");
      if (!button) {
        return;
      }
      const action = button.getAttribute("data-membership-code-action");
      const codeId = button.getAttribute("data-code-id");
      if (action !== "delete" || !codeId) {
        return;
      }
      if (!window.confirm("确认删除这个会员激活码吗？删除后将不再显示，也不能被兑换。")) {
        return;
      }
      AdminApi.deleteMembershipCode(codeId)
        .then(() => loadMembershipCodes())
        .catch(error => window.alert(error.message || "会员激活码删除失败"));
    });

    filters?.addEventListener("submit", event => {
      event.preventDefault();
      membershipsPage = 1;
      loadMemberships();
    });

    filters?.addEventListener("reset", () => {
      window.setTimeout(() => {
        membershipsPage = 1;
        const fields = filters.elements || {};
        if (fields.cycle) {
          fields.cycle.value = CURRENT_CYCLE;
        }
        loadMemberships();
      }, 0);
    });

    pagination?.addEventListener("click", event => {
      const button = event.target.closest("[data-membership-page]");
      if (!button) {
        return;
      }
      const action = button.getAttribute("data-membership-page");
      if (action === "prev" && membershipsPage > 1) {
        membershipsPage -= 1;
        loadMemberships();
      }
      if (action === "next" && membershipsPage < membershipsTotalPages) {
        membershipsPage += 1;
        loadMemberships();
      }
    });

    table?.addEventListener("click", event => {
      const button = event.target.closest("[data-membership-action]");
      if (!button) {
        return;
      }
      const action = button.getAttribute("data-membership-action");
      if (action === "show-benefit-detail") {
        const entitlementId = button.getAttribute("data-entitlement-id");
        toggleMembershipPanel(entitlementId, "detail");
        return;
      }
      if (action === "show-audit-log") {
        const entitlementId = button.getAttribute("data-entitlement-id");
        toggleMembershipPanel(entitlementId, "audit");
        return;
      }
      if (action === "manual-claim") {
        const entitlementId = button.getAttribute("data-entitlement-id");
        if (!entitlementId) {
          return;
        }
        const payload = promptManualClaimInput("selected");
        if (!payload) {
          return;
        }
        AdminApi.createMembershipClaim({
          entitlement_id: entitlementId,
          ...payload
        })
          .then(() => {
            window.dispatchEvent(new CustomEvent("admin:assistant-message", {
              detail: { message: "会员权益已登记" }
            }));
            return loadMemberships();
          })
          .catch(error => {
            window.alert(error.message || "登记会员权益失败");
          });
        return;
      }
      if (action === "delete-membership") {
        const entitlementId = button.getAttribute("data-entitlement-id");
        if (!entitlementId || !window.confirm("确认删除这个会员资格吗？删除后该用户将不再是当前周期会员，已登记的权益记录也会一并移除。")) {
          return;
        }
        AdminApi.deleteMembership(entitlementId)
          .then(() => {
            window.dispatchEvent(new CustomEvent("admin:assistant-message", {
              detail: { message: "会员资格已删除" }
            }));
            return loadMemberships();
          })
          .catch(error => {
            window.alert(error.message || "删除会员资格失败");
          });
        return;
      }
      const claimId = button.getAttribute("data-claim-id");
      handleClaimAction(action, claimId).catch(error => {
        window.alert(error.message || "会员权益操作失败");
      });
    });

    loadMemberships();
    loadMembershipCodes();
  }

  document.addEventListener("admin:shell-ready", initMembershipsPage);
})();
