(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;

  if (!Shared || !Api) {
    return;
  }

  const DEFAULT_BOARD_PAGE_SIZE = 10;
  const DEFAULT_PREVIEW_SIZE = 3;
  const MODAL_ID = "pickupJoinModal";
  const CUSTOMER_SERVICE_QR_SRC = "./img/pickup-service-qr.jpg";

  function normalizeResponse(payload) {
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      total: Number(payload?.total) || 0,
      page: Number(payload?.page) || 1,
      page_size: Number(payload?.page_size) || 0,
      has_next: Boolean(payload?.has_next)
    };
  }

  function getAirportLabel(item) {
    const rawAirportName = String(item?.airport_name || "").trim();
    const airportCode = String(item?.airport_code || "").trim().toUpperCase();
    const looksBrokenAirportName = !rawAirportName
      || /^[?？\s]+$/.test(rawAirportName)
      || /^[\uFFFD]+$/.test(rawAirportName);

    if (!looksBrokenAirportName) {
      return rawAirportName;
    }

    const mappedAirportName = typeof Shared.airportNameFromCode === "function"
      ? Shared.airportNameFromCode(airportCode)
      : "";

    return mappedAirportName || airportCode || "--";
  }

  function getTerminalLabel(item) {
    return item?.terminal_summary || item?.terminal || "--";
  }

  function getFlightLabel(item) {
    if (item?.source_flight_no_preview) {
      return item.source_flight_no_preview;
    }
    if (Array.isArray(item?.flight_no_values) && item.flight_no_values.length) {
      return item.flight_no_values.length > 1
        ? `${item.flight_no_values[0]} +${item.flight_no_values.length - 1}`
        : item.flight_no_values[0];
    }
    return item?.flight_no || "--";
  }

  function getPickupTimeText(item) {
    const explicitPickupTime = item?.preferred_time_start || item?.flight_time_reference || null;
    if (explicitPickupTime) {
      return Shared.formatDateTime(explicitPickupTime);
    }
    const rangeStart = item?.arrival_range?.earliest ? Shared.formatDateTime(item.arrival_range.earliest) : "--";
    const rangeEnd = item?.arrival_range?.latest ? Shared.formatDateTime(item.arrival_range.latest) : "--";
    if (rangeStart !== "--" || rangeEnd !== "--") {
      return rangeStart === rangeEnd || rangeEnd === "--" ? rangeStart : `${rangeStart} - ${rangeEnd}`;
    }
    return Shared.formatDateTime(item?.flight_datetime);
  }

  function isGroupJoinable(item) {
    if (typeof item?.joinable === "boolean") {
      return item.joinable;
    }
    const status = String(item?.status || item?.group_status || "").trim().toLowerCase();
    const remainingSeats = Number(item?.remaining_passenger_count || 0);
    return !["closed", "cancelled", "full"].includes(status) && remainingSeats > 0;
  }

  function getJoinStateText(item) {
    if (isGroupJoinable(item)) {
      return "加入拼车";
    }
    if (item?.join_reason) {
      return item.join_reason;
    }
    if (Number(item?.remaining_passenger_count || 0) <= 0) {
      return "已满";
    }
    return "请联系客服";
  }

  function summarizeUniqueValues(values, fallback = "--") {
    const uniqueValues = Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
    if (!uniqueValues.length) {
      return {
        shortText: fallback,
        fullText: fallback
      };
    }

    return {
      shortText: uniqueValues.slice(0, 2).join(" / "),
      fullText: uniqueValues.join(" / ")
    };
  }

  function getGroupKey(item) {
    return String(item?.group_id || item?.id || "");
  }

  function normalizePublicGroupItem(item) {
    const joinable = isGroupJoinable(item);
    return {
      ...item,
      id: getGroupKey(item),
      group_id: getGroupKey(item),
      joinable,
      join_reason: joinable ? "" : (item?.join_reason || (Number(item?.remaining_passenger_count || 0) <= 0 ? "已满" : "请联系客服"))
    };
  }

  function renderJoinAction(item) {
    const groupKey = getGroupKey(item);
    const joinable = isGroupJoinable(item);
    return `
      <button
        class="button button-secondary transport-board-action-button"
        type="button"
        data-view-pickup="${Shared.escapeHtml(groupKey)}"
      >查看详情</button>
      <button
        class="button ${joinable ? "button-primary transport-board-action-button-primary" : "button-secondary"} transport-board-action-button"
        type="button"
        data-join-pickup="${Shared.escapeHtml(groupKey)}"
        ${joinable ? "" : "disabled"}
      >${Shared.escapeHtml(getJoinStateText(item))}</button>
    `;
  }

  function renderBoardHeader() {
    const labels = [
      { full: "拼车组编号", short: "组号" },
      { full: "服务类型", short: "类型" },
      { full: "机场", short: "机场" },
      { full: "航站楼", short: "航站" },
      { full: "航班号", short: "航班" },
      { full: "接机时间", short: "时间" },
      { full: "当前人数", short: "人数" },
      { full: "操作", short: "查看" }
    ];
    return `
      <div class="transport-board-table-head">
        <div class="transport-board-inline-row transport-board-inline-row-compact">
          ${labels.map(label => `
            <div class="transport-board-head-item">
              <span class="transport-board-head-label-full">${Shared.escapeHtml(label.full)}</span>
              <span class="transport-board-head-label-short">${Shared.escapeHtml(label.short)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderBoardCard(item) {
    const passengerSummary = `${Number(item.current_passenger_count || item.passenger_count || 0)} 人 / 剩余 ${Number(item.remaining_passenger_count || 0)} 位`;
    return `
      <article class="transport-board-card transport-board-card-surface">
        <div class="transport-board-inline-row transport-board-inline-row-compact">
          <div class="transport-board-inline-item transport-board-inline-item-highlight">
            <span>${Shared.escapeHtml(getGroupKey(item) || "--")}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(getAirportLabel(item))}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(getTerminalLabel(item))}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(getFlightLabel(item))}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(getPickupTimeText(item))}</span>
          </div>
          <div class="transport-board-inline-item">
            <span>${Shared.escapeHtml(passengerSummary)}</span>
          </div>
          <div class="transport-board-inline-item transport-board-inline-item-actions">
            <div class="transport-board-card-actions">
              ${renderJoinAction(item)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderPreviewCard(item) {
    const terminalSummary = summarizeUniqueValues(item.terminal_values, getTerminalLabel(item));
    const flightSummary = summarizeUniqueValues(item.flight_no_values, getFlightLabel(item));
    const passengerSummary = `${Number(item.current_passenger_count || item.passenger_count || 0)} 人 / 剩余 ${Number(item.remaining_passenger_count || 0)} 位`;
    return `
      <article class="pickup-board-card pickup-board-card-row">
        <div class="pickup-board-row-grid">
          <div class="pickup-board-row-item pickup-board-row-item-service pickup-board-row-item-key" data-label="接机类型"><span>${Shared.escapeHtml(Shared.serviceLabel(item.service_type))}</span></div>
          <div class="pickup-board-row-item" data-label="机场"><span>${Shared.escapeHtml(getAirportLabel(item))}</span></div>
          <div class="pickup-board-row-item pickup-board-row-item-centered" data-label="航站楼" title="${Shared.escapeHtml(terminalSummary.fullText)}"><span>${Shared.escapeHtml(terminalSummary.shortText)}</span></div>
          <div class="pickup-board-row-item pickup-board-row-item-flight pickup-board-row-item-centered" data-label="航班号" title="${Shared.escapeHtml(flightSummary.fullText)}"><span>${Shared.escapeHtml(flightSummary.shortText)}</span></div>
          <div class="pickup-board-row-item" data-label="接机时间"><span>${Shared.escapeHtml(getPickupTimeText(item))}</span></div>
          <div class="pickup-board-row-item" data-label="人数/座位"><span>${Shared.escapeHtml(passengerSummary)}</span></div>
        </div>
      </article>
    `;
  }

  function renderPreviewHeader() {
    const labels = ["接机类型", "机场", "航站楼", "航班号", "接机时间", "人数/座位"];
    return `
      <div class="pickup-board-table-head">
        <div class="pickup-board-row-grid">
          ${labels.map(label => `<div class="pickup-board-head-item">${Shared.escapeHtml(label)}</div>`).join("")}
        </div>
      </div>
    `;
  }

  function renderPagination(container, page, hasNext) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} 页</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${hasNext ? "" : "disabled"}>下一页</button>
    `;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "pickup-join-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pickup-join-modal-backdrop" data-join-close></div>
      <div class="pickup-join-modal-dialog" role="dialog" aria-modal="true">
        <button class="pickup-join-modal-close" type="button" data-join-close aria-label="关闭">×</button>
        <div class="pickup-join-modal-body">
          <h2 id="pickupJoinModalTitle">加入拼车</h2>
          <div id="pickupJoinModalContent"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      if (event.target.closest("[data-join-close]")) {
        modal.hidden = true;
      }
    });
    return modal;
  }

  function buildJoinForm(item) {
    const isDropoff = item.service_type === "dropoff";
    const timingLabel = isDropoff ? "送机日期时间" : "接机日期时间";
    const routeLabel = isDropoff ? "出发地" : "目的地城市";
    const routeValue = isDropoff ? (item.location_from || "--") : (item.location_to || "--");
    return `
      <form id="pickupJoinForm" class="pickup-join-form">
        <input type="hidden" name="target_request_id" value="${Shared.escapeHtml(item.id)}">
        <input type="hidden" name="service_type" value="${Shared.escapeHtml(item.service_type || "pickup")}">
        <input type="hidden" name="location_from" value="${Shared.escapeHtml(item.location_from || "")}">
        <section class="pickup-join-section">
          <h3>当前拼车组</h3>
          <p>拼车组编号：${Shared.escapeHtml(getGroupKey(item) || "--")}</p>
          <p>机场：${Shared.escapeHtml(getAirportLabel(item))}</p>
          <p>航站楼：${Shared.escapeHtml(getTerminalLabel(item))}</p>
          <p>${Shared.escapeHtml(isDropoff ? "送机时间" : "接机时间")}：${Shared.escapeHtml(getPickupTimeText(item))}</p>
          <p>${Shared.escapeHtml(routeLabel)}：${Shared.escapeHtml(routeValue)}</p>
          <p>当前人数：${Number(item.current_passenger_count || item.passenger_count || 0)}</p>
          <p>剩余位置：${Number(item.remaining_passenger_count || 0)}</p>
        </section>
        <section class="pickup-join-section pickup-join-grid">
          <h3>你的加入信息</h3>
          <label><span>航班号</span><input name="flight_no" required></label>
          <label><span>${Shared.escapeHtml(timingLabel)}</span><input name="flight_datetime" type="datetime-local" required></label>
          <label><span>机场代码</span><input name="airport_code" value="${Shared.escapeHtml(item.airport_code || "")}" required></label>
          <label><span>机场名称</span><input name="airport_name" value="${Shared.escapeHtml(getAirportLabel(item))}" required></label>
          <label><span>航站楼</span><input name="terminal" value="${Shared.escapeHtml(item.terminal || "")}"></label>
          <label><span>${Shared.escapeHtml(routeLabel)}</span><input name="location_to" value="${Shared.escapeHtml(routeValue)}" required></label>
          <label><span>行李数量</span><input name="luggage_count" type="number" min="0" value="0" required></label>
          <label class="pickup-join-grid-wide"><span>联系方式</span><input name="wechat" placeholder="微信号"></label>
          <p class="pickup-join-grid-wide pickup-join-note">当前每个账号默认只登记 1 人；如果还有其他同行人，需要创建账号，也需要分别填写接机拼车表单。</p>
        </section>
        <section class="pickup-join-section">
          <h3>系统判断结果</h3>
          <div id="pickupJoinEvaluation">请填写信息后点击“检查是否可加入”。</div>
        </section>
        <div class="pickup-join-actions">
          <button class="button button-secondary" type="button" id="pickupJoinPreviewButton">检查是否可加入</button>
          <button class="button button-primary" type="submit">确认加入拼车</button>
        </div>
      </form>
    `;
  }

  async function getJoinProfile() {
    if (!window.SiteAuth || typeof window.SiteAuth.getSession !== "function") {
      return {
        authenticated: false,
        nickname: "",
        phone: "",
        wechat: "",
        email: ""
      };
    }

    try {
      const session = await window.SiteAuth.getSession();
      if (!session || !session.authenticated || !session.user) {
        return {
          authenticated: false,
          nickname: "",
          phone: "",
          wechat: "",
          email: ""
        };
      }
      const user = session.user;
      return {
        authenticated: true,
        nickname: String(user.nickname || "").trim(),
        phone: String(user.phone || "").trim(),
        wechat: String(user.wechat_id || "").trim(),
        email: String(user.email || "").trim()
      };
    } catch (error) {
      console.warn("Failed to load join profile", error);
      return {
        authenticated: false,
        nickname: "",
        phone: "",
        wechat: "",
        email: ""
      };
    }
  }

  function buildReadonlyProfileValue(value) {
    return value ? Shared.escapeHtml(value) : '<span class="pickup-join-static-empty">未填写</span>';
  }

  function toLondonDateTimeLocalValue(value) {
    if (!value) {
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(parsed).reduce((accumulator, part) => {
      if (part.type !== "literal") {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function toLondonDateValue(value) {
    const dateTimeValue = toLondonDateTimeLocalValue(value);
    return dateTimeValue ? dateTimeValue.slice(0, 10) : "";
  }

  function shiftIsoMinutes(value, minutes) {
    if (!value) {
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return new Date(parsed.getTime() + minutes * 60000).toISOString();
  }

  function getJoinReferenceDateTime(item) {
    return item?.preferred_time_start || item?.flight_time_reference || item?.flight_datetime || "";
  }

  function buildJoinSummaryText(summary) {
    return [
      "加入拼车摘要",
      `姓名：${summary.nickname || "-"}`,
      `邮箱：${summary.email || "-"}`,
      `微信号：${summary.wechat || "-"}`,
      `联系电话：${summary.phone || "-"}`,
      `拼车组编号：${summary.groupId || "-"}`,
      `服务类型：${summary.serviceLabel}`,
      `英国机场：${summary.airportName || "-"}`,
      `航站楼：${summary.terminal || "-"}`,
      `航班号：${summary.flightNo || "-"}`,
      `${summary.timeLabel}：${summary.flightDatetimeText || "-"}`,
      `接送期望时间：${summary.preferredTimeText || "-"}`,
      `拼车截至日期：${summary.deadlineDate || "-"}`,
      `同行人数：${summary.passengerCount}`,
      `行李数：${summary.luggageCount}`,
      `详细地址：${summary.address || "-"}`,
      `拼车不成功是否接受其他方案：${summary.fallbackLabel || "-"}`,
      `订单编号：${summary.orderNo || "-"}`,
      `Group ID：${summary.groupId || "-"}`
    ].join("\n");
  }

  function buildJoinSuccessView(summary) {
    return `
      <div class="pickup-join-form">
        <section class="pickup-join-section">
          <h3>提交成功</h3>
          <p>订单编号：${Shared.escapeHtml(summary.orderNo || "--")}</p>
          <p>Group ID：${Shared.escapeHtml(summary.groupId || "--")}</p>
          <p>邮件状态：邮件已通知，请尽快联系客服。</p>
        </section>
        <section class="pickup-join-section">
          <h3>提交摘要</h3>
          <pre class="pickup-join-summary-pre">${Shared.escapeHtml(buildJoinSummaryText(summary))}</pre>
        </section>
        <section class="pickup-join-section pickup-join-success-section">
          <div class="pickup-join-success-qr">
            <img src="${CUSTOMER_SERVICE_QR_SRC}" alt="接机客服二维码">
            <p>请立即扫码联系客服。未加客服并完成审核，这单无效。</p>
            <p>客服微信号：Nottsngn</p>
          </div>
        </section>
        <div class="pickup-join-actions">
          <button class="button button-primary" type="button" data-join-close>我知道了</button>
        </div>
      </div>
    `;
  }

  function buildJoinForm(item, profile = {}) {
    const isDropoff = item.service_type === "dropoff";
    const timingLabel = isDropoff ? "起飞日期" : "抵达日期";
    const routeLabel = isDropoff ? "出发地详细地址" : "诺丁汉详细地址";
    const routeFieldName = isDropoff ? "location_from" : "location_to";
    const routeValue = "";
    const routeSummaryLabel = isDropoff ? "出发地信息" : "诺丁汉地址信息";
    const routeSummaryText = "已隐藏，提交后由客服协调";
    const airportLabel = getAirportLabel(item);
    const terminalLabel = getTerminalLabel(item);
    const referenceDateTime = getJoinReferenceDateTime(item);
    const fixedPreferredTime = toLondonDateTimeLocalValue(referenceDateTime);
    const joinWindowMinutes = isDropoff ? 360 : 240;
    const flightDateTimeMin = toLondonDateTimeLocalValue(shiftIsoMinutes(referenceDateTime, -joinWindowMinutes));
    const flightDateTimeMax = toLondonDateTimeLocalValue(shiftIsoMinutes(referenceDateTime, joinWindowMinutes));
    const deadlineDate = toLondonDateValue(referenceDateTime);
    const passengerCount = Number(item.passenger_count || 1) || 1;
    return `
      <form id="pickupJoinForm" class="pickup-join-form">
        <input type="hidden" name="target_request_id" value="${Shared.escapeHtml(item.id)}">
        <input type="hidden" name="service_type" value="${Shared.escapeHtml(item.service_type || "pickup")}">
        ${isDropoff ? "" : `<input type="hidden" name="location_from" value="${Shared.escapeHtml(item.location_from || "")}">`}
        <input type="hidden" name="airport_code" value="${Shared.escapeHtml(item.airport_code || "")}">
        <input type="hidden" name="airport_name" value="${Shared.escapeHtml(airportLabel)}">
        <input type="hidden" name="email" value="${Shared.escapeHtml(profile.email || "")}">
        <div class="pickup-join-service-alert">当前为${Shared.escapeHtml(isDropoff ? "送机拼车" : "接机拼车")}</div>
        <section class="pickup-join-section">
          <h3>当前拼车组</h3>
          <p>拼车组编号：${Shared.escapeHtml(getGroupKey(item) || "--")}</p>
          <p>机场：${Shared.escapeHtml(airportLabel)}</p>
          <p>航站楼：${Shared.escapeHtml(terminalLabel)}</p>
          <p>${Shared.escapeHtml(isDropoff ? "送机时间" : "接机时间")}：${Shared.escapeHtml(getPickupTimeText(item))}</p>
          <p>${Shared.escapeHtml(routeSummaryLabel)}：${Shared.escapeHtml(routeSummaryText)}</p>
          <p>当前人数：${Number(item.current_passenger_count || item.passenger_count || 0)}</p>
          <p>剩余位置：${Number(item.remaining_passenger_count || 0)}</p>
        </section>
        <section class="pickup-join-section pickup-join-grid">
          <h3 class="pickup-join-grid-wide">加入拼车表单</h3>
          <label><span>姓名</span><input value="${Shared.escapeHtml(profile.nickname || "")}" readonly></label>
          <label><span>邮箱</span><input value="${Shared.escapeHtml(profile.email || "")}" readonly></label>
          <label><span>微信号</span><input value="${Shared.escapeHtml(profile.wechat || "")}" readonly></label>
          <label><span>联系电话</span><input value="${Shared.escapeHtml(profile.phone || "")}" readonly></label>
          <label><span>英国机场</span><input value="${Shared.escapeHtml(airportLabel)}" readonly></label>
          <label><span>航站楼</span><input name="terminal" value="${Shared.escapeHtml(item.terminal || "")}" required></label>
          <label><span>航班号</span><input name="flight_no" required></label>
          <label>
            <span>${Shared.escapeHtml(timingLabel)}</span>
            <input name="flight_datetime" type="datetime-local" min="${Shared.escapeHtml(flightDateTimeMin)}" max="${Shared.escapeHtml(flightDateTimeMax)}" required>
            <small class="pickup-join-field-hint">允许时间范围：当前拼车组时间前后 ${isDropoff ? "6" : "4"} 小时。</small>
            <small class="pickup-join-field-hint">需在当前拼车组时间前后 4 小时内。</small>
          </label>
          <label>
            <span>接送期望时间</span>
            <input name="preferred_time_start" value="${Shared.escapeHtml(fixedPreferredTime)}" readonly>
          </label>
          <label>
            <span>拼车截至日期</span>
            <input name="deadline_date" value="${Shared.escapeHtml(deadlineDate)}" readonly>
          </label>
          <label>
            <span>行李数</span>
            <select name="luggage_count">
              <option value="0">0 件</option>
              <option value="1">1 件</option>
              <option value="2" selected>2 件</option>
              <option value="3">3 件</option>
              <option value="4">4 件</option>
            </select>
          </label>
          <label class="pickup-join-grid-wide"><span>${Shared.escapeHtml(routeLabel)}</span><input name="${routeFieldName}" value="" placeholder="请填写你自己的详细地址" required></label>
          <fieldset class="pickup-join-grid-wide pickup-join-choice">
            <legend>拼车不成功，是否可接受包车或现有拼车人数</legend>
            <label><input type="radio" name="fallback_accept" value="接受" checked> 接受</label>
            <label><input type="radio" name="fallback_accept" value="不接受"> 不接受</label>
          </fieldset>
          <label class="pickup-join-grid-wide pickup-join-check">
            <input type="checkbox" name="confirm_truth" required>
            <span>我确认以上信息真实有效，并同意客服根据表单信息联系我安排拼车。</span>
          </label>
        </section>
        <section class="pickup-join-section">
          <h3>系统判断结果</h3>
          <div id="pickupJoinEvaluation">请先补充必要信息，再点击“检查是否可加入”。</div>
        </section>
        <div class="pickup-join-actions">
          <button class="button button-secondary" type="button" id="pickupJoinPreviewButton">检查是否可加入</button>
          <button class="button button-primary" type="submit">确认加入拼车</button>
        </div>
      </form>
    `;
  }

  function buildDetailView(item) {
    const timeRange = getPickupTimeText(item);
    const summaryRows = [
      ["拼车组编号", getGroupKey(item) || "--"],
      ["服务类型", Shared.serviceLabel(item.service_type)],
      ["机场", getAirportLabel(item)],
      ["航站楼情况", getTerminalLabel(item)],
      [item.preferred_time_start || item.flight_time_reference ? "接机时间" : "接机时间范围", timeRange || "--"],
      ["当前人数", `${Number(item.current_passenger_count || item.passenger_count || 0)}人`],
      ["剩余座位", `${Number(item.remaining_passenger_count || 0)}位`],
      ["当前平均价格", item.current_average_price_gbp ? `£${Number(item.current_average_price_gbp).toFixed(2)}` : "£0.00"],
      ["附加费说明", item.surcharge_hint || "无附加费"]
    ];
    const members = Array.isArray(item.member_details) ? item.member_details : [];

    return `
      <div class="pickup-join-section pickup-detail-block">
        <h3>拼车组概要</h3>
        <div class="pickup-detail-section">
          ${summaryRows.map(([label, value]) => `
            <div class="pickup-detail-row">
              <strong>${Shared.escapeHtml(label)}</strong>
              <span>${Shared.escapeHtml(value || "--")}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="pickup-join-section pickup-detail-block">
        <h3>匿名成员信息</h3>
        <div class="pickup-detail-member-list">
          ${members.length ? members.map(member => `
            <article class="pickup-detail-member-card">
              <h4>${Shared.escapeHtml(member.label || "--")}</h4>
              <div class="pickup-detail-section">
                <div class="pickup-detail-row">
                  <strong>航班号</strong>
                  <span>${Shared.escapeHtml(member.flight_no || "--")}</span>
                </div>
                <div class="pickup-detail-row">
                  <strong>落地时间</strong>
                  <span>${Shared.escapeHtml(Shared.formatDateTime(member.flight_datetime))}</span>
                </div>
                <div class="pickup-detail-row">
                  <strong>航站楼</strong>
                  <span>${Shared.escapeHtml(member.terminal || "--")}</span>
                </div>
                <div class="pickup-detail-row">
                  <strong>行李数</strong>
                  <span>${Shared.escapeHtml(member.luggage || "--")}</span>
                </div>
              </div>
            </article>
          `).join("") : '<p class="pickup-detail-empty">当前暂无可展示的成员信息。</p>'}
        </div>
      </div>
    `;
  }

  function serializeJoinForm(form) {
    const formData = new FormData(form);
    const fallbackAccept = formData.get("fallback_accept") || "";
    return {
      target_request_id: formData.get("target_request_id"),
      service_type: formData.get("service_type"),
      email: formData.get("email"),
      flight_no: formData.get("flight_no"),
      flight_datetime: formData.get("flight_datetime"),
      preferred_time_start: formData.get("preferred_time_start"),
      airport_code: formData.get("airport_code"),
      airport_name: formData.get("airport_name"),
      terminal: formData.get("terminal"),
      location_from: formData.get("location_from"),
      location_to: formData.get("location_to"),
      passenger_count: 1,
      luggage_count: Number(formData.get("luggage_count")),
      fallback_accept: fallbackAccept,
      notes: fallbackAccept ? `拼车失败是否接受包车或现有拼车人数：${fallbackAccept}` : ""
    };
  }

  function renderEvaluation(node, payload, isError = false) {
    if (!node) {
      return;
    }
    if (isError) {
      node.innerHTML = `<p class="pickup-join-error">${Shared.escapeHtml(payload)}</p>`;
      return;
    }

    const evaluation = payload?.evaluation || payload;
    const lines = [
      `是否可直接加入：${evaluation.joinable ? "可以" : "不可以"}`,
      `加入后总人数：${evaluation.nextPassengerCount || "--"}`,
      `是否加价：${evaluation.surchargeGbp ? `是，+£${evaluation.surchargeGbp}` : "否"}`
    ];
    if (!evaluation.joinable && evaluation.reason) {
      lines.push(`原因：${evaluation.reason}`);
    }
    if (evaluation.joinable && evaluation.surchargeGbp > 0) {
      lines.push(`提示：跨航站楼附加费 +£${evaluation.surchargeGbp}`);
    }
    node.innerHTML = lines.map(line => `<p>${Shared.escapeHtml(line)}</p>`).join("");
  }

  function renderEvaluation(node, payload, isError = false) {
    if (!node) {
      return;
    }
    if (isError) {
      node.innerHTML = `<p class="pickup-join-error">${Shared.escapeHtml(payload)}</p>`;
      return;
    }

    const evaluation = payload?.evaluation || payload;
    const lines = [
      `是否可直接加入：${evaluation.joinable ? "可以" : "不可以"}`,
      `加入后总人数：${evaluation.nextPassengerCount || "--"}`,
      `是否加价：${evaluation.surchargeGbp ? `是，+£${evaluation.surchargeGbp}` : "否"}`
    ];
    if (!evaluation.joinable && evaluation.reason) {
      lines.push(`原因：${evaluation.reason}`);
    }
    if (evaluation.joinable && evaluation.surchargeGbp > 0) {
      lines.push(`提示：跨航站楼附加费 +£${evaluation.surchargeGbp}`);
    }
    node.innerHTML = lines.map(line => `<p>${Shared.escapeHtml(line)}</p>`).join("");
  }

  async function listMyFutureTransportRequests() {
    const response = await fetch("/api/public/my-transport-requests", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "加载个人订单失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "加载个人订单失败");
    }

    const now = Date.now();
    return (Array.isArray(payload.data) ? payload.data : []).filter(item => {
      if (!item || item.status === "closed") {
        return false;
      }
      const time = new Date(item.flight_datetime || item.preferred_time_start || "").getTime();
      return !Number.isNaN(time) && time > now;
    });
  }

  function serviceTypePromptLabel(serviceType) {
    return serviceType === "dropoff" ? "送机" : "接机";
  }

  function buildFutureOrderPrompt(nextServiceType, requests) {
    const rows = Array.isArray(requests) ? requests.filter(Boolean) : [];
    if (!rows.length) {
      return "";
    }

    const sameTypeRows = rows.filter(item => item.service_type === nextServiceType);
    const crossTypeRows = rows.filter(item => item.service_type && item.service_type !== nextServiceType);
    const lines = [];

    if (sameTypeRows.length) {
      lines.push(`您当前已有未来有效${serviceTypePromptLabel(nextServiceType)}单：${sameTypeRows.map(item => item.order_no).filter(Boolean).join("、")}`);
      lines.push(`系统不允许同一账号同时存在两张${serviceTypePromptLabel(nextServiceType)}单。`);
    } else {
      const firstCross = crossTypeRows[0];
      if (firstCross) {
        lines.push(`您当前已有一张未来有效${serviceTypePromptLabel(firstCross.service_type)}单：${firstCross.order_no || "--"}`);
      } else {
        lines.push("您当前已有未来有效订单。");
      }
      lines.push("如果继续提交，系统会继续判断是否允许再下一张订单。");
    }

    lines.push("提示：同一账号不能同时有两张接机单，或两张送机单。");
    lines.push("确定继续提交吗？");
    return lines.join("\n");
  }

  async function resolveJoinTargetItem(groupId) {
    const response = await Api.listPublicBoard({
      group_id: groupId,
      sort: "upcoming",
      limit: 50,
      page: 1
    });

    const items = Array.isArray(response?.items)
      ? response.items.filter(entry => String(entry.group_id || "") === String(groupId))
      : [];

    if (!items.length) {
      throw new Error("当前拼车组暂无可加入的订单。");
    }

    return items.find(entry => entry.joinable) || items[0];
  }

  async function openJoinModal(item) {
    const targetItem = await resolveJoinTargetItem(getGroupKey(item));
    const modalItem = {
      ...item,
      ...targetItem,
      group_id: getGroupKey(item),
      current_passenger_count: item.current_passenger_count ?? targetItem.current_passenger_count,
      remaining_passenger_count: item.remaining_passenger_count ?? targetItem.remaining_passenger_count,
      member_details: item.member_details || targetItem.member_details,
      current_average_price_gbp: item.current_average_price_gbp ?? targetItem.current_average_price_gbp
    };

    const modal = ensureModal();
    const title = modal.querySelector("#pickupJoinModalTitle");
    const content = modal.querySelector("#pickupJoinModalContent");
    if (title) {
      title.textContent = "加入拼车";
    }
    const profile = await getJoinProfile();
    if (!profile.authenticated && window.SiteAuth && typeof window.SiteAuth.requireLogin === "function") {
      await window.SiteAuth.requireLogin({
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
      });
      return;
    }
    const airportLabel = getAirportLabel(modalItem);
    const terminalLabel = getTerminalLabel(modalItem);
    const referenceDateTime = getJoinReferenceDateTime(modalItem);
    const deadlineDate = toLondonDateValue(referenceDateTime);
    const timingLabel = modalItem.service_type === "dropoff" ? "起飞日期" : "抵达日期";
    content.innerHTML = buildJoinForm(modalItem, profile);
    modal.hidden = false;

    const form = modal.querySelector("#pickupJoinForm");
    const evaluationNode = modal.querySelector("#pickupJoinEvaluation");
    const previewButton = modal.querySelector("#pickupJoinPreviewButton");

    previewButton.addEventListener("click", async () => {
      try {
        const result = await Api.previewJoinPickup(serializeJoinForm(form));
        renderEvaluation(evaluationNode, result);
      } catch (error) {
        renderEvaluation(evaluationNode, error.message, true);
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const payload = serializeJoinForm(form);
        const existingRequests = await listMyFutureTransportRequests();
        const promptText = buildFutureOrderPrompt(payload.service_type, existingRequests);
        if (promptText && !window.confirm(promptText)) {
          renderEvaluation(evaluationNode, "已取消提交。", true);
          return;
        }
        const result = await Api.submitJoinPickup(payload);
        const summary = {
          nickname: profile.nickname,
          email: profile.email,
          wechat: profile.wechat,
          phone: profile.phone,
          orderNo: result.orderNo,
          groupId: result.groupId || modalItem.group_id,
          serviceLabel: Shared.serviceLabel(modalItem.service_type),
          airportName: airportLabel,
          terminal: payload.terminal || terminalLabel,
          flightNo: payload.flight_no,
          flightDatetimeText: Shared.formatDateTime(payload.flight_datetime),
          preferredTimeText: Shared.formatDateTime(payload.preferred_time_start || referenceDateTime),
          deadlineDate: deadlineDate || "--",
          passengerCount: 1,
          luggageCount: payload.luggage_count,
          address: payload.location_to || payload.location_from || "-",
          fallbackLabel: payload.fallback_accept || "-",
          timeLabel: timingLabel
        };
        content.innerHTML = buildJoinSuccessView(summary);
      } catch (error) {
        renderEvaluation(evaluationNode, error.message, true);
      }
    });
  }

  function openDetailModal(item) {
    const modal = ensureModal();
    const title = modal.querySelector("#pickupJoinModalTitle");
    const content = modal.querySelector("#pickupJoinModalContent");
    if (title) {
      title.textContent = "查看拼车详情信息";
    }
    content.innerHTML = buildDetailView(item);
    modal.hidden = false;
  }

  async function initBoardPage() {
    const form = document.querySelector("#transportBoardFilters");
    const list = document.querySelector("#transportBoardList");
    const pagination = document.querySelector("#transportBoardPagination");
    if (!form || !list) {
      return;
    }

    let currentPage = 1;
    let hasNextPage = false;
    let currentItems = [];
    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render(page = 1) {
      currentPage = page;
      list.innerHTML = '<div class="transport-loading">加载中...</div>';
      if (pagination) {
        pagination.innerHTML = "";
      }

      const response = await Api.listPublicGroups({
        group_id: form.group_id.value.trim(),
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value,
        sort: form.date_from.value ? "upcoming" : "latest",
        limit: DEFAULT_BOARD_PAGE_SIZE,
        page
      }).catch(error => {
        list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
        return null;
      });

      if (!response) {
        return;
      }

      const payload = normalizeResponse(response);
      currentItems = payload.items.map(normalizePublicGroupItem);
      hasNextPage = payload.has_next;

      if (!currentItems.length) {
        list.innerHTML = '<div class="transport-empty">当前还没有可公开查看的接机拼车组。</div>';
        renderPagination(pagination, 1, false);
        return;
      }

      list.innerHTML = `
        <div class="transport-board-scroll-hint" role="note" aria-label="横向滚动提示">
          <span class="transport-board-scroll-hint-badge">提示</span>
          <span class="transport-board-scroll-hint-copy">请向右滑动，查看完整订单信息</span>
          <span class="transport-board-scroll-hint-arrow" aria-hidden="true">&rarr;</span>
        </div>
        <div class="transport-board-table-scroll">
          <div class="transport-board-table">
            ${renderBoardHeader()}
            <div class="transport-board-table-body">
              ${currentItems.map(renderBoardCard).join("")}
            </div>
          </div>
        </div>
      `;
      renderPagination(pagination, payload.page, payload.has_next);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });

    list.addEventListener("click", event => {
      const detailButton = event.target.closest("[data-view-pickup]");
      if (detailButton) {
        const item = currentItems.find(entry => getGroupKey(entry) === detailButton.getAttribute("data-view-pickup"));
        if (item) {
          openDetailModal(item);
        }
        return;
      }

      const joinButton = event.target.closest("[data-join-pickup]");
      if (!joinButton) {
        return;
      }
      const item = currentItems.find(entry => getGroupKey(entry) === joinButton.getAttribute("data-join-pickup"));
      if (item && isGroupJoinable(item)) {
        openJoinModal(item).catch(error => {
          list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
        });
      }
    });

    pagination?.addEventListener("click", event => {
      const action = event.target.closest("[data-page-action]")?.dataset.pageAction;
      if (!action) {
        return;
      }
      if (action === "prev" && currentPage > 1) {
        render(currentPage - 1);
      }
      if (action === "next" && hasNextPage) {
        render(currentPage + 1);
      }
    });

    render(1);
  }

  function renderPreviewCard(item, index = 0) {
    const terminalSummary = summarizeUniqueValues(item.terminal_values, getTerminalLabel(item));
    const flightSummary = summarizeUniqueValues(item.flight_no_values, getFlightLabel(item));
    const passengerSummary = `${Number(item.current_passenger_count || item.passenger_count || 0)} 人 / 余 ${Number(item.remaining_passenger_count || 0)} 位`;
    const serviceLabel = Shared.serviceLabel(item.service_type);
    const cardTone = ["violet", "cyan", "amber"][index % 3];

    return `
      <article class="pickup-board-card pickup-board-card-preview pickup-board-card-preview-${cardTone}">
        <div class="pickup-preview-card-shell">
          <div class="pickup-preview-card-top">
            <span class="pickup-preview-service">${Shared.escapeHtml(serviceLabel)}</span>
            <span class="pickup-preview-seats">${Shared.escapeHtml(passengerSummary)}</span>
          </div>
          <div class="pickup-preview-airport">${Shared.escapeHtml(getAirportLabel(item))}</div>
          <div class="pickup-preview-meta">${Shared.escapeHtml(terminalSummary.shortText)} · ${Shared.escapeHtml(flightSummary.shortText)}</div>
          <div class="pickup-preview-time">${Shared.escapeHtml(getPickupTimeText(item))}</div>
          <div class="pickup-preview-grid">
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">接机类型</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(serviceLabel)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">机场</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(getAirportLabel(item))}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航站楼</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(terminalSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航班号</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(flightSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">接机时间</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(getPickupTimeText(item))}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">人数 / 剩余</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(passengerSummary)}</strong>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  async function initPickupPreview() {
    const section = document.querySelector("#pickup-board");
    if (!section) {
      return;
    }

    let list = document.querySelector("#pickupBoardPreview");
    if (!list) {
      const existingEmpty = section.querySelector(".pickup-board-empty");
      list = document.createElement("div");
      list.className = "pickup-board-list";
      list.id = "pickupBoardPreview";
      if (existingEmpty) {
        existingEmpty.replaceWith(list);
      } else {
        section.appendChild(list);
      }
    }

    list.innerHTML = '<div class="transport-loading">加载中...</div>';

    const response = await Api.listPublicGroups({
      sort: "upcoming",
      limit: DEFAULT_PREVIEW_SIZE,
      page: 1
    }).catch(error => {
      list.innerHTML = `<div class="pickup-board-empty">${Shared.escapeHtml(error.message)}</div>`;
      return null;
    });

    if (!response) {
      return;
    }

    const payload = normalizeResponse(response);
    const items = payload.items.map(normalizePublicGroupItem);
    if (!items.length) {
      list.innerHTML = '<div class="pickup-board-empty">当前还没有已发布的接机拼车组。</div>';
      return;
    }

    list.innerHTML = `
      <div class="pickup-board-track-scroll">
        <div class="pickup-board-track">
          ${renderPreviewHeader()}
          ${items.map((item, index) => renderPreviewCard(item, index)).join("")}
        </div>
      </div>
    `;
  }

  async function initPickupPreview() {
    const section = document.querySelector("#pickup-board");
    if (!section) {
      return;
    }

    let list = document.querySelector("#pickupBoardPreview");
    if (!list) {
      const existingEmpty = section.querySelector(".pickup-board-empty");
      list = document.createElement("div");
      list.className = "pickup-board-list";
      list.id = "pickupBoardPreview";
      if (existingEmpty) {
        existingEmpty.replaceWith(list);
      } else {
        section.appendChild(list);
      }
    }

    list.classList.add("pickup-board-list-preview");
    list.innerHTML = '<div class="transport-loading">加载中...</div>';

    const response = await Api.listPublicGroups({
      sort: "upcoming",
      limit: DEFAULT_PREVIEW_SIZE,
      page: 1
    }).catch(error => {
      list.innerHTML = `<div class="pickup-board-empty">${Shared.escapeHtml(error.message)}</div>`;
      return null;
    });

    if (!response) {
      return;
    }

    const payload = normalizeResponse(response);
    const items = payload.items
      .map(normalizePublicGroupItem)
      .slice(0, DEFAULT_PREVIEW_SIZE);
    if (!items.length) {
      list.innerHTML = '<div class="pickup-board-empty">当前还没有已发布的接机拼车组。</div>';
      return;
    }

    list.innerHTML = `
      <p class="pickup-board-preview-note">前台仅展示最近 3 个拼车组，完整信息请查看接机面板。</p>
      <div class="pickup-board-track-scroll">
        <div class="pickup-board-track">
          ${renderPreviewHeader()}
          ${items.map((item, index) => renderPreviewCard(item, index)).join("")}
        </div>
      </div>
    `;
  }

  function renderPreviewCard(item, index = 0) {
    const terminalSummary = summarizeUniqueValues(item.terminal_values, getTerminalLabel(item));
    const flightSummary = summarizeUniqueValues(item.flight_no_values, getFlightLabel(item));
    const passengerSummary = `${Number(item.current_passenger_count || item.passenger_count || 0)} 人 / 余 ${Number(item.remaining_passenger_count || 0)} 位`;
    const serviceLabel = Shared.serviceLabel(item.service_type);
    const cardTone = ["violet", "cyan", "amber"][index % 3];

    return `
      <article class="pickup-board-card pickup-board-card-preview pickup-board-card-preview-${cardTone}">
        <div class="pickup-preview-card-shell">
          <div class="pickup-preview-card-top">
            <span class="pickup-preview-service">${Shared.escapeHtml(serviceLabel)}</span>
            <span class="pickup-preview-seats">${Shared.escapeHtml(passengerSummary)}</span>
          </div>
          <div class="pickup-preview-airport">${Shared.escapeHtml(getAirportLabel(item))}</div>
          <div class="pickup-preview-meta">${Shared.escapeHtml(terminalSummary.shortText)} · ${Shared.escapeHtml(flightSummary.shortText)}</div>
          <div class="pickup-preview-time">${Shared.escapeHtml(getPickupTimeText(item))}</div>
          <div class="pickup-preview-grid">
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">接送类型</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(serviceLabel)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">机场</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(getAirportLabel(item))}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航站楼</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(terminalSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航班号</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(flightSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell pickup-preview-cell-wide">
              <span class="pickup-preview-label">人数 / 剩余</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(passengerSummary)}</strong>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderPreviewCard(item, index = 0) {
    const terminalSummary = summarizeUniqueValues(item.terminal_values, getTerminalLabel(item));
    const flightSummary = summarizeUniqueValues(item.flight_no_values, getFlightLabel(item));
    const passengerSummary = `${Number(item.current_passenger_count || item.passenger_count || 0)} 人 / 余 ${Number(item.remaining_passenger_count || 0)} 位`;
    const serviceLabel = Shared.serviceLabel(item.service_type);
    const cardTone = ["violet", "cyan", "amber"][index % 3];

    return `
      <article class="pickup-board-card pickup-board-card-row pickup-board-card-preview pickup-board-card-preview-${cardTone}">
        <div class="pickup-preview-desktop-row">
          <div class="pickup-board-row-grid">
            <div class="pickup-board-row-item pickup-board-row-item-service pickup-board-row-item-key" data-label="接送类型"><span>${Shared.escapeHtml(serviceLabel)}</span></div>
            <div class="pickup-board-row-item" data-label="机场"><span>${Shared.escapeHtml(getAirportLabel(item))}</span></div>
            <div class="pickup-board-row-item pickup-board-row-item-centered" data-label="航站楼" title="${Shared.escapeHtml(terminalSummary.fullText)}"><span>${Shared.escapeHtml(terminalSummary.shortText)}</span></div>
            <div class="pickup-board-row-item pickup-board-row-item-flight pickup-board-row-item-centered" data-label="航班号" title="${Shared.escapeHtml(flightSummary.fullText)}"><span>${Shared.escapeHtml(flightSummary.shortText)}</span></div>
            <div class="pickup-board-row-item" data-label="接机时间"><span>${Shared.escapeHtml(getPickupTimeText(item))}</span></div>
            <div class="pickup-board-row-item" data-label="人数/座位"><span>${Shared.escapeHtml(passengerSummary)}</span></div>
          </div>
        </div>
        <div class="pickup-preview-card-shell">
          <div class="pickup-preview-card-top">
            <span class="pickup-preview-service">${Shared.escapeHtml(serviceLabel)}</span>
            <span class="pickup-preview-seats">${Shared.escapeHtml(passengerSummary)}</span>
          </div>
          <div class="pickup-preview-airport">${Shared.escapeHtml(getAirportLabel(item))}</div>
          <div class="pickup-preview-meta">${Shared.escapeHtml(terminalSummary.shortText)} · ${Shared.escapeHtml(flightSummary.shortText)}</div>
          <div class="pickup-preview-time">${Shared.escapeHtml(getPickupTimeText(item))}</div>
          <div class="pickup-preview-grid">
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">接送类型</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(serviceLabel)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">机场</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(getAirportLabel(item))}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航站楼</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(terminalSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell">
              <span class="pickup-preview-label">航班号</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(flightSummary.shortText)}</strong>
            </div>
            <div class="pickup-preview-cell pickup-preview-cell-wide">
              <span class="pickup-preview-label">人数 / 剩余</span>
              <strong class="pickup-preview-value">${Shared.escapeHtml(passengerSummary)}</strong>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderPreviewNotice() {
    return `
      <div class="pickup-board-preview-note" role="note" aria-label="预览提示">
        <span class="pickup-board-preview-badge">仅展示最近 3 组</span>
        <span class="pickup-board-preview-copy">这里只展示最新拼车预览，想看全部班次与完整信息，请点击上方 <strong>查看完整拼车表格</strong> 进入接机面板。</span>
      </div>
    `;
  }

  async function initPickupPreview() {
    const section = document.querySelector("#pickup-board");
    if (!section) {
      return;
    }

    let list = document.querySelector("#pickupBoardPreview");
    if (!list) {
      const existingEmpty = section.querySelector(".pickup-board-empty");
      list = document.createElement("div");
      list.className = "pickup-board-list";
      list.id = "pickupBoardPreview";
      if (existingEmpty) {
        existingEmpty.replaceWith(list);
      } else {
        section.appendChild(list);
      }
    }

    list.classList.add("pickup-board-list-preview");
    list.innerHTML = '<div class="transport-loading">加载中...</div>';

    const response = await Api.listPublicGroups({
      sort: "upcoming",
      limit: DEFAULT_PREVIEW_SIZE,
      page: 1
    }).catch(error => {
      list.innerHTML = `<div class="pickup-board-empty">${Shared.escapeHtml(error.message)}</div>`;
      return null;
    });

    if (!response) {
      return;
    }

    const payload = normalizeResponse(response);
    const items = payload.items
      .map(normalizePublicGroupItem)
      .slice(0, DEFAULT_PREVIEW_SIZE);
    if (!items.length) {
      list.innerHTML = '<div class="pickup-board-empty">当前还没有已发布的接机拼车组。</div>';
      return;
    }

    list.innerHTML = `
      ${renderPreviewNotice()}
      <div class="pickup-board-track-scroll">
        <div class="pickup-board-track">
          ${renderPreviewHeader()}
          ${items.map((item, index) => renderPreviewCard(item, index)).join("")}
        </div>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initBoardPage();
    initPickupPreview();
  });
})();
