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
      storage_collection: "取寄存订单",
      storage_return: "送寄存订单",
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

  const MEMBERSHIP_BENEFITS = {
    storage: {
      label: "寄存权益",
      description: "最多抵扣 5 个标准箱基础寄存费用，最终金额由后台确认。",
      actionUrl: "./storage"
    },
    pickup: {
      label: "接机权益",
      description: "适用于会员接机服务，系统会在提交订单时由服务端识别会员优惠，最终金额由后台确认。",
      actionUrl: "./pickup"
    },
    moving: {
      label: "搬家权益",
      description: "适用于基础搬家服务，选择后请联系客服安排时间和细节。该权益暂不走线上订单。"
    },
    welcome_pack: {
      label: "新生大礼包",
      description: "价值约 £100，包含基础生活用品。选择后请联系客服确认领取或送达方式。"
    }
  };

  function formatMembershipMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : String(value);
  }

  function membershipStatusLabel(status) {
    const labels = {
      selected: "已选择",
      reserved: "已绑定订单 / 待服务完成",
      used: "权益已使用 / 已完成",
      cancelled: "权益已作废"
    };
    return labels[status] || status || "--";
  }

  function claimOrderMatches(item, claim) {
    if (!item || !claim) {
      return false;
    }
    const linkedId = String(claim.linked_order_id || "");
    const linkedNo = String(claim.linked_order_no || "");
    return (linkedId && linkedId === String(item.id || ""))
      || (linkedNo && linkedNo === String(item.order_no || item.orderNo || ""));
  }

  function findLinkedMembershipTransportRequest(claim, requests = []) {
    if (!claim || (claim.linked_order_table && claim.linked_order_table !== "transport_requests")) {
      return null;
    }
    return requests.find(item => claimOrderMatches(item, claim)) || null;
  }

  function getUkMonth(value) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const month = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      month: "2-digit"
    }).format(date);
    const parsed = Number(month);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function membershipPickupReservationCopy(claim, requests = []) {
    const linkedRequest = findLinkedMembershipTransportRequest(claim, requests);
    const serviceMonth = getUkMonth(linkedRequest?.flight_datetime || linkedRequest?.preferred_time_start);
    const discountAmount = Number(claim?.membership_discount_amount || 0);
    const ending = claim?.status === "used" ? "服务已完成。" : "等待服务完成。";

    if (serviceMonth === 9) {
      return `当前为会员预约：9 月接机免费，${ending}`;
    }
    if (serviceMonth && serviceMonth !== 9) {
      return `当前为会员预约：非 9 月或其他时间接机优惠 100 镑，${ending}`;
    }
    if (discountAmount >= 100) {
      return `当前为会员预约：本次接机优惠 100 镑，${ending}`;
    }
    return "当前为会员预约：接机会员权益已绑定订单，优惠金额以客服确认为准。";
  }

  function hasPickupMembershipReservation(membershipState) {
    const claim = membershipState?.claim || null;
    return claim?.benefit_type === "pickup" && ["reserved", "used"].includes(claim.status);
  }

  function membershipPickupSummaryCopy(claim, requests = []) {
    return membershipPickupReservationCopy(claim, requests).replace(/^当前为会员预约：/, "");
  }

  async function fetchMembershipState() {
    const response = await fetch(resolveUrl("/api/public/membership-me"), {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({ data: null, error: { message: "会员权益状态加载失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "会员权益状态加载失败");
    }
    return payload.data || {};
  }

  async function selectMembershipBenefit(benefitType) {
    const response = await fetch(resolveUrl("/api/public/membership-benefit-selection"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ benefit_type: benefitType })
    });
    const payload = await response.json().catch(() => ({ data: null, error: { message: "会员权益选择失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "会员权益选择失败");
    }
    return payload.data;
  }

  async function redeemMembershipCode(code, memberBirthday = "") {
    const response = await fetch(resolveUrl("/api/public/membership-redeem-code"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ code, member_birthday: memberBirthday })
    });
    const payload = await response.json().catch(() => ({ data: null, error: { message: "会员激活码兑换失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "会员激活码兑换失败");
    }
    return payload.data;
  }

  function renderMembershipDetails(claim) {
    const orderNo = claim?.linked_order_no || "";
    const discountAmount = Number(claim?.membership_discount_amount || 0);
    const shouldShowDiscount = claim?.benefit_type !== "pickup" && discountAmount > 0;
    if (!orderNo && !shouldShowDiscount) {
      return "";
    }
    return `
      <dl class="profile-membership-details">
        ${orderNo ? `<div><dt>关联订单</dt><dd>${escapeHtml(orderNo)}</dd></div>` : ""}
        ${shouldShowDiscount ? `<div><dt>免去金额</dt><dd>${escapeHtml(formatMembershipMoney(discountAmount))}</dd></div>` : ""}
      </dl>
    `;
  }

  function encodeDetailPayload(item) {
    return encodeURIComponent(JSON.stringify(item));
  }

  function membershipOrderDetailAction(claim, context = {}) {
    if (claim?.benefit_type !== "pickup") {
      return "";
    }
    const linkedRequest = findLinkedMembershipTransportRequest(claim, context.requests || []);
    if (!linkedRequest) {
      return "";
    }
    const payload = encodeDetailPayload({
      ...linkedRequest,
      recordKind: "transport",
      membershipBenefitType: "pickup",
      hidePrice: true
    });
    return `<button class="button button-secondary" type="button" data-request-detail="${payload}">查看详情</button>`;
  }

  function renderMembershipPass({ title, statusText, copy, details = "", action = "" }) {
    return `
      <div class="profile-membership-pass">
        <div class="profile-membership-pass-main">
          <span class="profile-membership-pass-kicker">当前权益</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(copy)}</p>
        </div>
        <div class="profile-membership-pass-side">
          <span class="profile-membership-pass-status">${escapeHtml(statusText)}</span>
          ${action ? `<div class="profile-membership-pass-actions">${action}</div>` : ""}
        </div>
        ${details ? `<div class="profile-membership-pass-details">${details}</div>` : ""}
      </div>
    `;
  }

  function renderMembershipState(state, context = {}) {
    const statusNode = document.querySelector("#serviceCenterMembershipStatus");
    const bodyNode = document.querySelector("#serviceCenterMembershipBody");
    const messageNode = document.querySelector("#serviceCenterMembershipMessage");
    if (!bodyNode) {
      return;
    }
    if (messageNode) {
      messageNode.textContent = "";
    }

    const cycle = state?.cycle || "2026-27";
    const claim = state?.claim || null;
    if (!state?.isMember) {
      if (statusNode) {
        statusNode.textContent = "非会员";
      }
      bodyNode.innerHTML = `
        <p>您当前还不是 ${escapeHtml(cycle)} NGN 订房会员。</p>
        <p class="profile-muted">如果您已通过 NGN 完成订房，请输入会员激活码，或联系客服开通会员权益。</p>
        <div class="profile-membership-actions">
          <button class="button button-primary" type="button" data-membership-show-code>输入会员码</button>
        </div>
        <form class="profile-membership-code-form" id="serviceCenterMembershipCodeForm" hidden>
          <label class="field">
            <span>会员激活码</span>
            <input type="text" name="code" autocomplete="off" placeholder="NGN-2026-XXXX-XXXX" required>
          </label>
          <label class="field">
            <span>会员生日（月日）</span>
            <input type="text" name="member_birthday" autocomplete="bday" inputmode="numeric" maxlength="5" pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])" placeholder="MM-DD，例如 08-21" title="请使用 MM-DD 格式，例如 08-21" required>
          </label>
          <button class="button button-primary" type="submit">兑换会员权益</button>
        </form>
      `;
      return;
    }

    if (statusNode) {
      statusNode.textContent = "2026-27 会员";
    }

    if (!claim) {
      bodyNode.innerHTML = `
        <p>您是 ${escapeHtml(cycle)} NGN 订房会员。请选择一个会员权益。</p>
        <p class="profile-muted">每位会员只能选择一个主要权益。选择后不能自行更换，如需修改请联系客服。</p>
        <div class="profile-membership-benefits">
          ${Object.entries(MEMBERSHIP_BENEFITS).map(([type, benefit]) => `
            <button class="profile-membership-benefit" type="button" data-membership-benefit="${escapeHtml(type)}">
              <strong>${escapeHtml(benefit.label)}</strong>
              <span>${escapeHtml(type)}</span>
              <p>${escapeHtml(benefit.description)}</p>
            </button>
          `).join("")}
        </div>
      `;
      return;
    }

    const benefit = MEMBERSHIP_BENEFITS[claim.benefit_type] || { label: claim.benefit_type || "会员权益" };
    if (claim.status === "selected" && claim.benefit_type === "storage") {
      bodyNode.innerHTML = renderMembershipPass({
        title: "寄存权益",
        statusText: "已选择",
        copy: "您已选择会员寄存权益。前往寄存页面提交订单后，系统会自动识别并绑定该会员服务。",
        action: '<a class="button button-primary" href="./storage" data-membership-storage-intro>前往寄存服务</a>'
      });
      return;
    }
    if (claim.status === "selected" && claim.benefit_type === "pickup") {
      bodyNode.innerHTML = renderMembershipPass({
        title: "接机权益",
        statusText: "已选择",
        copy: "您已选择会员接机权益。前往接机页面提交订单后，系统会根据服务类型识别会员服务。",
        action: '<a class="button button-primary" href="./pickup">前往接机服务</a>'
      });
      return;
    }
    if (claim.status === "selected" && claim.benefit_type === "moving") {
      bodyNode.innerHTML = renderMembershipPass({
        title: "搬家权益",
        statusText: "等待客服安排",
        copy: "请联系客服确认搬家时间、地址、箱数和服务细节。该权益暂不走线上订单。"
      });
      return;
    }
    if (claim.status === "selected" && claim.benefit_type === "welcome_pack") {
      bodyNode.innerHTML = renderMembershipPass({
        title: "新生大礼包",
        statusText: "等待客服确认",
        copy: "请联系客服确认领取或送达方式。"
      });
      return;
    }
    if (claim.status === "reserved" || claim.status === "used") {
      const statusCopy = claim.benefit_type === "pickup"
        ? membershipPickupReservationCopy(claim, context.requests)
        : (claim.status === "used"
          ? "权益已使用 / 已完成。"
          : "当前状态：已绑定订单，等待服务完成。");
      bodyNode.innerHTML = renderMembershipPass({
        title: benefit.label,
        statusText: claim.status === "used" ? "已完成" : "已绑定订单",
        copy: statusCopy,
        details: renderMembershipDetails(claim),
        action: membershipOrderDetailAction(claim, context)
      });
      return;
    }
    if (claim.status === "cancelled") {
      bodyNode.innerHTML = renderMembershipPass({
        title: benefit.label,
        statusText: "已作废",
        copy: "该会员权益已作废，请联系客服确认后续处理。"
      });
      return;
    }

    bodyNode.innerHTML = renderMembershipPass({
      title: benefit.label,
      statusText: membershipStatusLabel(claim.status),
      copy: "该会员权益正在处理中，如需调整请联系客服。"
    });
  }

  async function reloadMembershipState() {
    const state = await fetchMembershipState();
    renderMembershipState(state);
    return state;
  }

  function showMembershipStorageIntro(targetHref = "./storage") {
    const existing = document.querySelector("[data-membership-storage-modal]");
    if (existing) {
      existing.remove();
    }

    const modal = document.createElement("div");
    modal.className = "membership-storage-modal";
    modal.setAttribute("data-membership-storage-modal", "true");
    modal.innerHTML = `
      <div class="membership-storage-modal-backdrop" data-membership-storage-close></div>
      <section class="membership-storage-modal-card" role="dialog" aria-modal="true" aria-labelledby="membershipStorageIntroTitle">
        <button class="membership-storage-modal-close" type="button" aria-label="关闭" data-membership-storage-close>×</button>
        <p class="eyebrow">NGN 会员寄存权益</p>
        <h2 id="membershipStorageIntroTitle">您已选择会员寄存服务</h2>
        <div class="membership-storage-modal-copy">
          <p>寄存页面仍会按照普通寄存流程展示预估价格，用于确认箱数、日期和服务内容。</p>
          <p>客服已经为您登记 NGN 会员寄存权益。会员四选一服务中，寄存权益可享 5-10 月基础寄存服务免单，最多覆盖 5 个标准箱，并免费送 5 个纸箱。</p>
          <p>超过 5 箱、超重、特殊搬运、外地送回等额外项目不在自动免单范围内，最终金额以客服确认为准。</p>
        </div>
        <div class="membership-storage-modal-actions">
          <button class="button button-secondary" type="button" data-membership-storage-close>先不前往</button>
          <button class="button button-primary" type="button" data-membership-storage-continue>继续前往寄存服务</button>
        </div>
      </section>
    `;

    const close = () => {
      modal.remove();
      document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = event => {
      if (event.key === "Escape") {
        close();
      }
    };

    modal.addEventListener("click", event => {
      if (event.target.closest("[data-membership-storage-close]")) {
        close();
        return;
      }
      if (event.target.closest("[data-membership-storage-continue]")) {
        window.location.href = targetHref;
      }
    });

    document.body.appendChild(modal);
    document.addEventListener("keydown", onKeydown);
    modal.querySelector("[data-membership-storage-continue]")?.focus();
  }

  function bindMembershipModule() {
    const bodyNode = document.querySelector("#serviceCenterMembershipBody");
    const messageNode = document.querySelector("#serviceCenterMembershipMessage");
    if (!bodyNode) {
      return;
    }

    bodyNode.addEventListener("click", event => {
      const storageIntroLink = event.target.closest("[data-membership-storage-intro]");
      if (storageIntroLink) {
        event.preventDefault();
        showMembershipStorageIntro(storageIntroLink.getAttribute("href") || "./storage");
        return;
      }

      const codeButton = event.target.closest("[data-membership-show-code]");
      if (codeButton) {
        const form = document.querySelector("#serviceCenterMembershipCodeForm");
        if (form) {
          form.hidden = false;
          form.elements.code?.focus();
        }
        return;
      }

      const benefitButton = event.target.closest("[data-membership-benefit]");
      if (!benefitButton) {
        return;
      }
      const benefitType = benefitButton.getAttribute("data-membership-benefit");
      if (!benefitType || !window.confirm("每位会员只能选择一个主要权益。选择后不能自行更换，如需修改请联系客服。是否确认选择？")) {
        return;
      }
      if (messageNode) {
        messageNode.textContent = "正在提交会员权益选择...";
      }
      selectMembershipBenefit(benefitType)
        .then(() => reloadMembershipState())
        .catch(error => {
          if (messageNode) {
            messageNode.textContent = error.message || "会员权益选择失败";
          }
        });
    });

    bodyNode.addEventListener("submit", event => {
      const form = event.target.closest("#serviceCenterMembershipCodeForm");
      if (!form) {
        return;
      }
      event.preventDefault();
      const code = form.elements.code?.value.trim() || "";
      const memberBirthday = form.elements.member_birthday?.value.trim() || "";
      if (messageNode) {
        messageNode.textContent = "正在兑换会员激活码...";
      }
      redeemMembershipCode(code, memberBirthday)
        .then(state => {
          renderMembershipState(state);
          if (messageNode) {
            messageNode.textContent = state.redeemStatus === "already_member"
              ? "您已经是本周期会员。"
              : "会员权益已开通。";
          }
        })
        .catch(error => {
          if (messageNode) {
            messageNode.textContent = error.message || "会员激活码兑换失败";
          }
        });
    });
  }

  function buildRequestDetailMarkup(item) {
    const shouldShowPrice = !(item.hidePrice === true
      || (item.service_type === "pickup" && (item.membershipBenefitType === "pickup"
        || item.membership_benefit_claim_id
        || Number(item.membership_discount_amount || 0) > 0)));
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
        ${shouldShowPrice ? `
          <article class="service-center-detail-field">
            <strong>当前每人价格</strong>
            <span>${escapeHtml(formatCurrencyGbp(item.current_average_price_gbp))}</span>
          </article>
        ` : ""}
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

  function renderPickupCard(requests, membershipState = null, allRequests = requests) {
    const titleNode = document.querySelector("[data-service-center-pickup-title]");
    const copyNode = document.querySelector("[data-service-center-pickup-copy]");
    const cardNode = document.querySelector("[data-service-center-pickup-card]");
    const detailButton = document.querySelector("[data-service-center-pickup-detail]");
    if (!titleNode || !copyNode) {
      return;
    }

    const clearDetail = () => {
      if (cardNode) {
        cardNode.removeAttribute("data-request-detail");
        cardNode.classList.remove("service-center-card-clickable");
      }
      if (detailButton) {
        detailButton.hidden = true;
        detailButton.removeAttribute("data-request-detail");
      }
    };
    const setDetail = item => {
      const payload = encodeDetailPayload(item);
      if (cardNode) {
        cardNode.dataset.requestDetail = payload;
        cardNode.classList.add("service-center-card-clickable");
      }
      if (detailButton) {
        detailButton.dataset.requestDetail = payload;
        detailButton.hidden = false;
      }
    };

    const activePickup = requests.find(item => item.service_type === "pickup" && item.status !== "closed");
    if (!activePickup) {
      if (hasPickupMembershipReservation(membershipState)) {
        const linkedRequest = findLinkedMembershipTransportRequest(membershipState.claim, allRequests);
        titleNode.textContent = "当前为会员预约";
        copyNode.textContent = membershipPickupSummaryCopy(membershipState.claim, allRequests);
        if (linkedRequest) {
          setDetail({
            ...linkedRequest,
            recordKind: "transport",
            membershipBenefitType: "pickup",
            hidePrice: true
          });
        } else {
          clearDetail();
        }
        return;
      }

      titleNode.textContent = "当前无接机预约";
      copyNode.textContent = "需要时可直接发起。";
      clearDetail();
      return;
    }

    titleNode.textContent = `${activePickup.group_id || activePickup.order_no || "接机拼车组"} · ${getStatusLabel(activePickup.status)}`;
    copyNode.textContent = `${activePickup.airport_name || "-"} ${activePickup.terminal || ""} · ${formatDateTime(activePickup.flight_datetime)}`;
    setDetail(activePickup);
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

  function membershipLinkedOrderKeys(membershipState) {
    const claim = membershipState?.claim || null;
    if (!claim || !["reserved", "used"].includes(claim.status)) {
      return { ids: new Set(), orderNos: new Set(), table: "" };
    }
    return {
      ids: new Set([claim.linked_order_id].filter(Boolean).map(value => String(value))),
      orderNos: new Set([claim.linked_order_no].filter(Boolean).map(value => String(value))),
      table: String(claim.linked_order_table || "")
    };
  }

  function isMembershipLinkedTransport(item, linkedKeys) {
    if (linkedKeys.table && linkedKeys.table !== "transport_requests") {
      return false;
    }
    return linkedKeys.ids.has(String(item.id || ""))
      || linkedKeys.orderNos.has(String(item.order_no || ""));
  }

  function isMembershipLinkedStorage(item, linkedKeys) {
    if (linkedKeys.table && linkedKeys.table !== "storage_orders") {
      return false;
    }
    return linkedKeys.ids.has(String(item.id || item.storageOrderId || ""))
      || linkedKeys.orderNos.has(String(item.orderNo || item.order_no || ""));
  }

  function filterMembershipLinkedRecords(requests = [], storageOrders = [], membershipState = null) {
    const linkedKeys = membershipLinkedOrderKeys(membershipState);
    return {
      requests: requests.filter(item => !isMembershipLinkedTransport(item, linkedKeys)),
      storageOrders: storageOrders.filter(item => !isMembershipLinkedStorage(item, linkedKeys))
    };
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
      bindMembershipModule();
      const [requests, storageOrders, membershipState] = await Promise.all([
        fetchMyRequests(),
        fetchMyStorageOrders(),
        fetchMembershipState().catch(error => {
          console.error("[service-center] failed to load membership state", error);
          return null;
        })
      ]);
      if (membershipState) {
        renderMembershipState(membershipState, { requests });
      }
      const displayRecords = filterMembershipLinkedRecords(requests, storageOrders, membershipState);
      renderPickupCard(displayRecords.requests, membershipState, requests);
      renderStorageCard(displayRecords.storageOrders);
      renderAllRecords(displayRecords.requests, displayRecords.storageOrders);
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
