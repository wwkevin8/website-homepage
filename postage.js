(function () {
  const data = window.PostageData;

  if (!data) {
    return;
  }

  const money = value => `£${Number(value || 0).toFixed(Number.isInteger(value) ? 0 : 2).replace(/\.00$/, "")}`;
  const getById = id => document.getElementById(id);
  const routeGroups = ["china", "china", "china", "uk", "special", "special"];
  let activeRouteFilter = "all";
  const panelLabels = {
    prices: ["Price Table", "邮费价格参考"],
    packing: ["Packing", "包装材料与纸箱"],
    prohibited: ["Important Notice", "禁寄物品提醒"],
    faq: ["FAQ", "常见问题"],
    tracking: ["Tracking", "物流查询方式"]
  };

  function renderRouteCards() {
    const target = getById("postageRouteCards");
    if (!target) return;

    target.innerHTML = data.routeCards.map((card, index) => {
      const group = routeGroups[index] || "china";
      return `
      <article class="postage-card postage-route-card${activeRouteFilter !== "all" && group !== activeRouteFilter ? " is-route-hidden" : ""}" data-route-group="${group}">
        <span class="postage-card-index">${String(index + 1).padStart(2, "0")}</span>
        <h3>${card.title}</h3>
        <p>${card.fit}</p>
        <button class="postage-card-link" type="button" data-route-detail="${index}">查看路线详情</button>
      </article>
    `;
    }).join("");
  }

  function setupRouteFilters() {
    const buttons = [...document.querySelectorAll("[data-route-filter]")];
    if (!buttons.length) return;

    buttons.forEach(button => {
      button.addEventListener("click", () => {
        activeRouteFilter = button.dataset.routeFilter || "all";
        buttons.forEach(item => item.classList.toggle("is-active", item === button));
        renderRouteCards();
      });
    });
  }

  function renderQuickGuides() {
    const target = getById("postageQuickGuides");
    if (!target) return;

    target.innerHTML = data.quickGuides.map((item, index) => `
      <article class="postage-guide-card">
        <i>${String(index + 1).padStart(2, "0")}</i>
        <span>${item.title}</span>
        <strong>${item.route}</strong>
        <p>${item.text}</p>
      </article>
    `).join("");
  }

  function renderPriceTable() {
    const target = getById("postagePriceTableBody");
    if (!target) return;

    target.innerHTML = data.priceTable.map(row => `
      <tr>
        <th scope="row">${row.kg}kg</th>
        <td>${money(row.hkAir)}</td>
        <td>${money(row.hkSea)}</td>
        <td>${money(row.sfTaxIncluded)}</td>
        <td>${money(row.royalMailAir)}</td>
        <td>${money(row.taiwan)}</td>
        <td>${money(row.macau)}</td>
        <td>${money(row.upsUSA)}</td>
        <td>${money(row.bpostUSA)}</td>
      </tr>
    `).join("");
  }

  function renderBoxOptions() {
    const boxSelect = getById("postageBoxType");
    const target = getById("postageBoxGrid");
    const materialTarget = getById("postageMaterials");

    if (boxSelect) {
      boxSelect.innerHTML = data.boxOptions.map(box => `
        <option value="${box.id}">${box.name} · ${box.size} · ${money(box.price)}${box.note ? ` · ${box.note}` : ""}</option>
      `).join("");
    }

    if (target) {
      target.innerHTML = data.boxOptions.map(box => `
        <article class="postage-box-card">
          <strong>${box.name}</strong>
          <span>${box.size}</span>
          <b>${money(box.price)}</b>
          ${box.note ? `<em>${box.note}</em>` : ""}
        </article>
      `).join("");
    }

    if (materialTarget) {
      materialTarget.innerHTML = data.packingMaterials.map(item => `
        <li><span>${item.name}</span><strong>${item.price}</strong></li>
      `).join("");
    }
  }

  function renderProhibitedItems() {
    const target = getById("postageProhibitedList");
    if (!target) return;

    target.innerHTML = data.prohibitedItems.map(item => `<li>${item}</li>`).join("");
  }

  function renderFaqs() {
    const target = getById("postageFaqList");
    if (!target) return;

    target.innerHTML = data.faqs.map(([question, answer], index) => `
      <details class="postage-faq-item" ${index < 2 ? "open" : ""}>
        <summary>${question}</summary>
        <p>${answer}</p>
      </details>
    `).join("");
  }

  function renderTrackingLinks() {
    const target = getById("postageTrackingLinks");
    if (!target) return;

    target.innerHTML = data.trackingLinks.map(link => `
      <a class="postage-tracking-card" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <span>${link.name}</span>
        <small>${link.url.replace(/^https?:\/\//, "")}</small>
      </a>
    `).join("");
  }

  function modalPriceTable() {
    return `
      <p class="postage-modal-lead">完整价格表保留在这里，横向滚动可查看不同路线。最终费用仍以实际称重、包装和当期物流规则为准。</p>
      <div class="postage-table-scroll postage-modal-table" aria-label="弹窗内邮费价格表，可横向滚动">
        <table class="postage-price-table">
          <thead>
            <tr>
              <th>公斤数</th>
              <th>香港邮局空运</th>
              <th>香港邮局海运</th>
              <th>顺丰空运包税</th>
              <th>皇家邮局空运</th>
              <th>台湾价格</th>
              <th>澳门价格</th>
              <th>UPS 美国价格</th>
              <th>BPOST 美国价格</th>
            </tr>
          </thead>
          <tbody>
            ${data.priceTable.map(row => `
              <tr>
                <th scope="row">${row.kg}kg</th>
                <td>${money(row.hkAir)}</td>
                <td>${money(row.hkSea)}</td>
                <td>${money(row.sfTaxIncluded)}</td>
                <td>${money(row.royalMailAir)}</td>
                <td>${money(row.taiwan)}</td>
                <td>${money(row.macau)}</td>
                <td>${money(row.upsUSA)}</td>
                <td>${money(row.bpostUSA)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function modalPacking() {
    return `
      <p class="postage-modal-lead">行李箱通常不能直接邮寄，需要装进纸箱。以下是可选纸箱和常用包装材料。</p>
      <div class="postage-modal-grid">
        ${data.boxOptions.map(box => `
          <article>
            <span>${box.name}</span>
            <strong>${box.size}</strong>
            <b>${money(box.price)}${box.note ? ` · ${box.note}` : ""}</b>
          </article>
        `).join("")}
      </div>
      <ul class="postage-modal-list">
        ${data.packingMaterials.map(item => `<li><span>${item.name}</span><strong>${item.price}</strong></li>`).join("")}
      </ul>
    `;
  }

  function modalProhibited() {
    return `
      <p class="postage-modal-lead">以下物品通常不能邮寄。敏感品请先联系客服，不要自行放入包裹。</p>
      <ul class="postage-modal-chip-list is-warning">
        ${data.prohibitedItems.map(item => `<li>${item}</li>`).join("")}
      </ul>
      <p class="postage-modal-note">香水、电器、带电池产品等属于敏感品；隐瞒物品导致退回、扣关、罚款、延误、销毁或损失时，相关风险需由用户自行承担。</p>
    `;
  }

  function modalFaq() {
    return `
      <div class="postage-modal-faq">
        ${data.faqs.map(([question, answer], index) => `
          <details ${index < 3 ? "open" : ""}>
            <summary>${question}</summary>
            <p>${answer}</p>
          </details>
        `).join("")}
      </div>
    `;
  }

  function modalTracking() {
    return `
      <p class="postage-modal-lead">部分路线需要等包裹进入对应国家或地区后才会更新物流。若查询不到，请先确认单号和路线。</p>
      <div class="postage-modal-grid">
        ${data.trackingLinks.map(link => `
          <a href="${link.url}" target="_blank" rel="noopener noreferrer">
            <span>${link.name}</span>
            <strong>${link.url.replace(/^https?:\/\//, "")}</strong>
          </a>
        `).join("")}
      </div>
    `;
  }

  function modalRouteDetail(index) {
    const card = data.routeCards[Number(index)] || data.routeCards[0];
    if (!card) return "";
    return `
      <div class="postage-route-detail-modal">
        <article>
          <span>适合</span>
          <p>${card.fit}</p>
        </article>
        <article>
          <span>特点</span>
          <p>${card.feature}</p>
        </article>
        <article>
          <span>提醒</span>
          <p>${card.note}</p>
        </article>
      </div>
    `;
  }

  function setupInfoModal() {
    const root = document.querySelector("[data-postage-modal-root]");
    const title = document.querySelector("[data-postage-modal-title]");
    const kicker = document.querySelector("[data-postage-modal-kicker]");
    const body = document.querySelector("[data-postage-modal-body]");
    const openers = [...document.querySelectorAll("[data-postage-modal]")];
    const closers = [...document.querySelectorAll("[data-postage-modal-close]")];
    if (!root || !title || !kicker || !body || !openers.length) return;

    const renderers = {
      prices: modalPriceTable,
      packing: modalPacking,
      prohibited: modalProhibited,
      faq: modalFaq,
      tracking: modalTracking
    };

    function closeModal() {
      root.hidden = true;
      document.body.classList.remove("postage-modal-open");
    }

    function openModal(panel, options = {}) {
      if (panel === "route") {
        const card = data.routeCards[Number(options.index)] || data.routeCards[0];
        kicker.textContent = "Route Detail";
        title.textContent = card?.title || "路线详情";
        body.innerHTML = modalRouteDetail(options.index);
        root.hidden = false;
        document.body.classList.add("postage-modal-open");
        root.querySelector(".postage-modal-close")?.focus();
        return;
      }
      const labels = panelLabels[panel] || panelLabels.prices;
      const render = renderers[panel] || modalPriceTable;
      kicker.textContent = labels[0];
      title.textContent = labels[1];
      body.innerHTML = render();
      root.hidden = false;
      document.body.classList.add("postage-modal-open");
      root.querySelector(".postage-modal-close")?.focus();
    }

    openers.forEach(button => {
      button.addEventListener("click", () => openModal(button.dataset.postageModal));
    });
    document.addEventListener("click", event => {
      const routeButton = event.target.closest("[data-route-detail]");
      if (!routeButton) return;
      openModal("route", { index: routeButton.dataset.routeDetail });
    });
    closers.forEach(button => button.addEventListener("click", closeModal));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !root.hidden) closeModal();
    });
  }

  function setupEstimator() {
    const form = getById("postageEstimatorForm");
    const routeSelect = getById("postageRoute");
    const weightField = getById("postageWeightField");
    const weightInput = getById("postageWeight");
    const quantityField = getById("postageSpecialQuantityField");
    const quantityInput = getById("postageSpecialQuantity");
    const quantityLabel = getById("postageSpecialQuantityLabel");
    const quantityHelp = getById("postageSpecialQuantityHelp");
    const boxCountInput = getById("postageBoxCount");
    const stairSelect = getById("postageStairs");
    const buyBoxInput = getById("postageBuyBox");
    const boxTypeSelect = getById("postageBoxType");
    const result = getById("postageEstimateResult");
    const presetButtons = [...document.querySelectorAll("[data-postage-preset]")];

    if (!form || !routeSelect || !result) return;

    routeSelect.innerHTML = data.routes.map(route => `<option value="${route.id}">${route.name}</option>`).join("");

    function selectedRoute() {
      return data.routes.find(route => route.id === routeSelect.value) || data.routes[0];
    }

    function syncFields() {
      const route = selectedRoute();
      const isCertificate = route.type === "certificate";
      const isMilk = route.type === "milk";
      const usesSpecialQuantity = isCertificate || isMilk;

      weightField.hidden = usesSpecialQuantity;
      quantityField.hidden = !usesSpecialQuantity;

      if (isCertificate) {
        quantityLabel.textContent = "毕业证份数";
        quantityHelp.textContent = "最多 4 份一起寄；更多份数请联系客服确认。";
        quantityInput.min = "1";
        quantityInput.max = "4";
        quantityInput.value = Math.min(Math.max(Number(quantityInput.value) || 1, 1), 4);
      } else if (isMilk) {
        quantityLabel.textContent = "奶粉罐数";
        quantityHelp.textContent = "2 罐一箱，按箱估算邮费。";
        quantityInput.min = "1";
        quantityInput.removeAttribute("max");
        quantityInput.value = Math.max(Number(quantityInput.value) || 2, 1);
      }
    }

    function tablePrice(route, weight) {
      const billedWeight = Math.ceil(Math.max(Number(weight) || 1, 1));
      const row = data.priceTable.find(item => item.kg >= billedWeight);
      if (!row) {
        return { price: 0, billedWeight, note: "单箱重量超过 30kg，请联系客服确认路线与价格。" };
      }
      return { price: row[route.id], billedWeight, note: `按单箱 ${row.kg}kg 档计算。` };
    }

    function ukPrice(weight) {
      const billedWeight = Math.ceil(Math.max(Number(weight) || 1, 1));
      if (billedWeight <= 10) {
        return { price: 10, billedWeight, note: "英国境内 10kg 内参考 £10/箱。" };
      }
      if (billedWeight <= 30) {
        return { price: 15, billedWeight, note: "英国境内 15-30kg 参考 £15 起/箱，偏远地区可能略高。" };
      }
      return { price: 0, billedWeight, note: "英国境内超过 30kg 或偏远地区，请联系客服确认。" };
    }

    function calculate() {
      const route = selectedRoute();
      const boxCount = Math.max(Number(boxCountInput.value) || 1, 1);
      const stairValue = stairSelect.value;
      const selectedBox = data.boxOptions.find(box => box.id === boxTypeSelect.value) || data.boxOptions[0];
      const boxFee = buyBoxInput.checked ? selectedBox.price * boxCount : 0;
      const stairFee = stairValue === "elevator" ? boxCount * 2 : stairValue === "noElevator" ? boxCount * 4 : 0;
      const notes = [
        "此估价仅供参考，最终价格以实际称重、路线选择、包装情况及当期物流规则为准。",
        "如果每箱重量不同，请联系客服确认最终价格。"
      ];
      let postage = 0;
      let routeLine = "";

      if (route.type === "table") {
        const price = tablePrice(route, weightInput.value);
        postage = price.price * boxCount;
        routeLine = `${route.name}：${money(price.price)} × ${boxCount} 箱 = ${money(postage)}`;
        notes.push(price.note);
      } else if (route.type === "uk") {
        const price = ukPrice(weightInput.value);
        postage = price.price * boxCount;
        routeLine = price.price ? `${route.name}：${money(price.price)} × ${boxCount} 箱 = ${money(postage)}` : route.name;
        notes.push(price.note);
      } else if (route.type === "certificate") {
        const count = Math.min(Math.max(Number(quantityInput.value) || 1, 1), 4);
        postage = 35 + Math.max(count - 1, 0) * 10;
        routeLine = `${route.name}：${count} 份 = ${money(postage)}`;
        notes.push("毕业证 UPS 最多 4 份一起寄，更多份数请联系客服确认。");
      } else if (route.type === "milk") {
        const cans = Math.max(Number(quantityInput.value) || 1, 1);
        const milkBoxes = Math.ceil(cans / 2);
        postage = milkBoxes * 12;
        routeLine = `${route.name}：${cans} 罐，按 ${milkBoxes} 箱估算 = ${money(postage)}`;
        notes.push("奶粉路线需按要求包装，最终以客服确认为准。");
      }

      if (stairValue === "unknown") {
        notes.push("上楼取件情况不确定，请联系客服确认是否另收费用。");
      }

      const total = postage + boxFee + stairFee;
      const chargeParts = [
        { label: "邮费", value: postage },
        { label: "纸箱", value: boxFee },
        { label: "上楼", value: stairFee }
      ];
      const maxPart = Math.max(...chargeParts.map(part => part.value), 1);
      const quoteText = [
        `路线：${route.name}`,
        `预计合计：${money(total)}`,
        `邮费：${routeLine || money(postage)}`,
        `纸箱：${buyBoxInput.checked ? `${selectedBox.name} ${money(boxFee)}` : "暂不购买纸箱"}`,
        `上楼取件：${stairValue === "unknown" ? "需确认" : money(stairFee)}`
      ].join("\n");
      result.dataset.quote = quoteText;
      result.innerHTML = `
        <div class="postage-result-total">
          <span>预计合计</span>
          <strong>${money(total)}</strong>
        </div>
        <div class="postage-result-bars" aria-label="费用构成">
          ${chargeParts.map(part => `
            <div>
              <span>${part.label}</span>
              <i style="--bar-width: ${Math.max((part.value / maxPart) * 100, part.value > 0 ? 10 : 2)}%"></i>
              <b>${money(part.value)}</b>
            </div>
          `).join("")}
        </div>
        <dl class="postage-result-list">
          <div><dt>预估邮费</dt><dd>${routeLine || money(postage)}</dd></div>
          <div><dt>纸箱费用</dt><dd>${buyBoxInput.checked ? `${selectedBox.name} ${money(selectedBox.price)} × ${boxCount} = ${money(boxFee)}` : "暂不购买纸箱"}</dd></div>
          <div><dt>上楼取件费用</dt><dd>${stairValue === "unknown" ? "请联系客服确认" : money(stairFee)}</dd></div>
        </dl>
        <button class="postage-copy-estimate" type="button" data-copy-estimate>复制估价摘要</button>
        <ul class="postage-result-notes">${notes.map(note => `<li>${note}</li>`).join("")}</ul>
      `;
    }

    const presets = {
      student: { route: "hkAir", weight: "20", boxes: "3", stairs: "none", buyBox: true },
      document: { route: "certificateUps", quantity: "1", boxes: "1", stairs: "none", buyBox: false },
      uk: { route: "ukDomestic", weight: "10", boxes: "1", stairs: "none", buyBox: true }
    };

    function applyPreset(name) {
      const preset = presets[name];
      if (!preset) return;
      routeSelect.value = preset.route;
      if (preset.weight) weightInput.value = preset.weight;
      if (preset.quantity) quantityInput.value = preset.quantity;
      boxCountInput.value = preset.boxes;
      stairSelect.value = preset.stairs;
      buyBoxInput.checked = preset.buyBox;
      presetButtons.forEach(button => button.classList.toggle("is-active", button.dataset.postagePreset === name));
      syncFields();
      calculate();
    }

    routeSelect.addEventListener("change", () => {
      syncFields();
      calculate();
    });
    form.addEventListener("input", calculate);
    form.addEventListener("change", calculate);
    form.addEventListener("submit", event => {
      event.preventDefault();
      calculate();
    });
    presetButtons.forEach(button => {
      button.addEventListener("click", () => applyPreset(button.dataset.postagePreset));
    });
    result.addEventListener("click", async event => {
      const copyButton = event.target.closest("[data-copy-estimate]");
      if (!copyButton) return;
      try {
        await navigator.clipboard.writeText(result.dataset.quote || "");
        copyButton.textContent = "已复制";
      } catch (error) {
        copyButton.textContent = "请手动复制";
      }
      window.setTimeout(() => {
        copyButton.textContent = "复制估价摘要";
      }, 1800);
    });

    syncFields();
    calculate();
  }

  function setupInteractions() {
    document.querySelectorAll("[data-postage-scroll]").forEach(button => {
      button.addEventListener("click", event => {
        const target = document.querySelector(button.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    document.querySelectorAll("[data-copy-wechat]").forEach(button => {
      button.addEventListener("click", async () => {
        const status = button.querySelector("[data-copy-status]");
        try {
          await navigator.clipboard.writeText("NOTTINGHAMNGN");
          if (status) status.textContent = "微信号已复制";
        } catch (error) {
          if (status) status.textContent = "请手动复制：NOTTINGHAMNGN";
        }
      });
    });

    const topButton = getById("postageBackTop");
    if (topButton) {
      topButton.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderRouteCards();
    setupRouteFilters();
    renderQuickGuides();
    renderPriceTable();
    renderBoxOptions();
    renderProhibitedItems();
    renderFaqs();
    renderTrackingLinks();
    setupEstimator();
    setupInfoModal();
    setupInteractions();
  });
})();
