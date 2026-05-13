(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  const CURRENT_CYCLE = "2026-27";
  let membershipsPage = 1;
  let membershipsTotalPages = 1;

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
    return Number.isFinite(number) ? `£${number.toFixed(2)}` : String(value);
  }

  function benefitLabel(type) {
    const labels = {
      storage: "会员寄存权益",
      pickup: "会员接机权益",
      moving: "线下搬家权益",
      welcome_pack: "线下大礼包",
      cashback: "线下返现"
    };
    return labels[type] || type || "--";
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
    return `<span class="admin-status-badge ${className}">${escapeHtml(normalized || "--")}</span>`;
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
          <p>请换一个 User ID、邮箱、昵称或手机号再试。</p>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>邮箱</th>
              <th>昵称</th>
              <th>手机号</th>
              <th>Site User ID</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td><strong>${escapeHtml(user.public_user_id || "--")}</strong></td>
                <td>${escapeHtml(user.email || "--")}</td>
                <td>${escapeHtml(user.nickname || "--")}</td>
                <td>${escapeHtml(user.phone || "--")}</td>
                <td><code>${escapeHtml(user.id || "--")}</code></td>
                <td>
                  <button class="button button-secondary admin-table-action" type="button" data-membership-pick-user="${escapeHtml(user.id)}">选择开通</button>
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
      return '<p class="admin-table-subtle">暂无 audit log。</p>';
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>Admin ID</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td>${escapeHtml(formatDateTime(log.created_at))}</td>
                <td>${escapeHtml(log.action || "--")}</td>
                <td><code>${escapeHtml(log.admin_user_id || "--")}</code></td>
                <td>${escapeHtml(log.metadata?.reason || log.metadata?.note || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderClaimSummary(claim) {
    if (!claim) {
      return '<span class="admin-table-subtle">未选择权益</span>';
    }
    return `
      <div><strong>${escapeHtml(benefitLabel(claim.benefit_type))}</strong></div>
      <div>${statusBadge(claim.status)}</div>
      <div class="admin-table-subtle">订单号：${escapeHtml(claim.linked_order_no || "--")}</div>
    `;
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
              <th>用户</th>
              <th>Entitlement</th>
              <th>Claim</th>
              <th>订单绑定</th>
              <th>金额</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const user = item.user || {};
              const claim = item.claim || null;
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(user.public_user_id || "--")}</strong>
                    <div class="admin-table-subtle">${escapeHtml(user.email || "--")}</div>
                    <div class="admin-table-subtle">${escapeHtml(user.nickname || user.phone || "")}</div>
                  </td>
                  <td>
                    <div>${statusBadge(item.status)}</div>
                    <div class="admin-table-subtle">周期：${escapeHtml(item.membership_cycle || "--")}</div>
                    <div class="admin-table-subtle">开通：${escapeHtml(formatDateTime(item.granted_at))}</div>
                    <div class="admin-table-subtle">Entitlement ID：<code>${escapeHtml(item.id)}</code></div>
                  </td>
                  <td>
                    ${renderClaimSummary(claim)}
                    ${claim ? `<div class="admin-table-subtle">Claim ID：<code>${escapeHtml(claim.id)}</code></div>` : ""}
                  </td>
                  <td>
                    <div>${escapeHtml(claim?.linked_order_table || "--")}</div>
                    <div class="admin-table-subtle">${escapeHtml(claim?.linked_order_no || "--")}</div>
                  </td>
                  <td>
                    <div>抵扣：${escapeHtml(formatMoney(claim?.membership_discount_amount))}</div>
                    <div>额外：${escapeHtml(formatMoney(claim?.extra_charge_amount))}</div>
                    <div>最终：${escapeHtml(formatMoney(claim?.final_price))}</div>
                  </td>
                  <td>
                    <div class="admin-inline-actions">
                      <button class="button button-secondary admin-table-action" type="button" data-membership-action="mark-used" data-claim-id="${escapeHtml(claim?.id || "")}" ${claim ? "" : "disabled"}>mark used</button>
                      <button class="button button-secondary admin-table-action" type="button" data-membership-action="cancel" data-claim-id="${escapeHtml(claim?.id || "")}" ${claim ? "" : "disabled"}>cancel</button>
                      <button class="button button-secondary admin-table-action" type="button" data-membership-action="reset" data-claim-id="${escapeHtml(claim?.id || "")}" ${claim ? "" : "disabled"}>reset</button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colspan="6">
                    <details>
                      <summary>Audit log / 抵扣明细</summary>
                      <div class="admin-detail-section">
                        <h3>Audit log</h3>
                        ${renderAuditLogs(item.audit_logs || [])}
                      </div>
                      <div class="admin-detail-section">
                        <h3>Discount breakdown</h3>
                        <pre class="admin-detail-pre">${escapeHtml(JSON.stringify(claim?.discount_breakdown_json || {}, null, 2))}</pre>
                      </div>
                    </details>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    renderPagination(pagination, payload.pagination || {});
  }

  async function loadMemberships() {
    const form = document.querySelector("#adminMembershipFilters");
    const table = document.querySelector("#adminMembershipsTable");
    const fields = form?.elements || {};
    if (table) {
      table.innerHTML = '<div class="admin-loading">正在加载会员权益数据...</div>';
    }
    try {
      const payload = await AdminApi.listMemberships({
        page: membershipsPage,
        page_size: 20,
        search: fields.search?.value || "",
        cycle: fields.cycle?.value || CURRENT_CYCLE,
        status: fields.status?.value || "",
        benefit_type: fields.benefit_type?.value || "",
        claim_status: fields.claim_status?.value || ""
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
          notes: fields.notes.value.trim()
        });
        setMessage(grantMessage, "会员已开通。");
        fields.notes.value = "";
        await loadMemberships();
      } catch (error) {
        setMessage(grantMessage, error.message || "开通会员失败", true);
      }
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
      const claimId = button.getAttribute("data-claim-id");
      handleClaimAction(action, claimId).catch(error => {
        window.alert(error.message || "会员权益操作失败");
      });
    });

    loadMemberships();
  }

  document.addEventListener("admin:shell-ready", initMembershipsPage);
})();
