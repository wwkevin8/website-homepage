const {
  clearStorageTestData,
  getLocalSupabaseAdmin,
  TEST_NOTE_MARKER
} = require("./clear-storage-test-data");

function pad(value) {
  return String(value).padStart(2, "0");
}

function addDays(dateText, days) {
  const [year, month, day] = String(dateText).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("-");
}

function ukToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addressKey(...values) {
  return values
    .map(value => String(value || "").toLowerCase().trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .slice(0, 240);
}

function estimate({
  storageFee = 0,
  homeFee = 0,
  stairsFee = 0,
  overweightFee = 0,
  purchaseFee = 0,
  discount = 0,
  storageQty = 0,
  purchaseQty = 0,
  days = 0,
  boxLabel = "中号箱"
}) {
  const total = Math.max(0, storageFee + homeFee + stairsFee + overweightFee + purchaseFee - discount);
  return {
    days,
    storageTotal: storageFee,
    discountedBase: storageFee,
    pickupFee: homeFee,
    returnFee: 0,
    collectionFee: homeFee,
    stairsFee,
    upstairsFee: stairsFee,
    overweightFee,
    purchaseTotal: purchaseFee,
    totalPurchaseBoxes: purchaseQty,
    membershipDiscountAmount: discount,
    estimatedTotalPrice: total,
    finalPrice: total,
    items: [
      {
        label: boxLabel,
        boxType: boxLabel,
        storageQty,
        purchaseQty,
        quantity: purchaseQty,
        purchase: purchaseFee,
        subtotal: purchaseFee,
        overweightFee
      }
    ]
  };
}

function buildReadableMessage(row) {
  return [
    `${TEST_NOTE_MARKER}`,
    `订单编号：${row.order_no}`,
    `服务：${row.service_label}`,
    `姓名：${row.customer_name}`,
    `电话：${row.phone}`,
    `微信：${row.wechat_id}`,
    `服务日期：${row.service_date}`,
    `时间段：${row.service_time_slot}`,
    `地址：${row.address_full}`,
    `箱子数量：${row.estimated_box_count}`,
    `是否有电梯：${row.has_lift === true ? "是" : row.has_lift === false ? "否" : "待确认"}`,
    `是否需要上楼：${row.needs_upstairs ? "是" : "否"}`,
    `备注：${row.notes || "无"}`
  ].join("\n");
}

function baseOrder(today, index, scenario) {
  const orderNo = `TEST-ST-${String(index).padStart(3, "0")}`;
  const serviceDate = addDays(today, scenario.offset);
  const startDate = scenario.storageStartOffset === undefined ? serviceDate : addDays(today, scenario.storageStartOffset);
  const endDate = scenario.storageEndOffset === undefined ? addDays(serviceDate, scenario.days || 14) : addDays(today, scenario.storageEndOffset);
  const priceSummary = estimate(scenario.price || {});
  const address = `${scenario.address}, ${scenario.city || "Manchester"}`;
  const formJson = {
    customerName: scenario.name,
    customerPinyin: scenario.pinyin,
    contactHandle: scenario.wechat,
    noticeConfirmed: true,
    orderType: scenario.orderType,
    notes: scenario.userNote,
    serviceDetails: {
      serviceDate,
      serviceTimeSlot: scenario.timeSlot,
      storageStartDate: startDate,
      expectedStorageEndDate: endDate,
      storageDays: scenario.days || priceSummary.days || 0,
      collectionAddress: address,
      returnAddress: address,
      serviceAddress: address,
      roomOrBuilding: scenario.room,
      postcode: scenario.postcode,
      hasLift: scenario.hasLift,
      needsUpstairs: scenario.needsUpstairs,
      storageBoxCount: scenario.storageQty,
      itemCount: scenario.storageQty,
      purchaseQuantity: scenario.purchaseQty,
      itemDescription: scenario.itemDescription,
      notes: scenario.userNote
    },
    admin: {
      service_notes: `${TEST_NOTE_MARKER}：${scenario.internalNote}`,
      billing: {
        payment_status: scenario.paymentStatus,
        payment_note: `${TEST_NOTE_MARKER}：${scenario.paymentNote || scenario.paymentStatus}`
      }
    }
  };

  const row = {
    order_no: orderNo,
    order_type: scenario.orderType,
    business_date: serviceDate,
    status: scenario.status || "confirmed",
    source: "local_storage_workbench_seed",
    site_user_id: null,
    student_email: scenario.email,
    customer_name: scenario.name,
    wechat_id: scenario.wechat,
    phone: scenario.phone,
    address_full: `${address} / ${scenario.room} / ${scenario.postcode}`,
    service_date: serviceDate,
    service_time: scenario.timeSlot,
    service_time_slot: scenario.timeSlot,
    need_moving_help: Boolean(scenario.needsUpstairs),
    service_label: scenario.serviceLabel,
    service_flags_json: {
      local_test_seed: true,
      service_content: scenario.serviceContent,
      boxTypeSummary: scenario.boxLabel,
      storageDays: scenario.days || priceSummary.days || 0
    },
    estimated_box_count: scenario.storageQty || scenario.purchaseQty || 0,
    estimated_total_price: priceSummary.estimatedTotalPrice,
    friend_pickup: false,
    friend_phone: null,
    notes: scenario.userNote,
    estimate_summary_json: priceSummary,
    customer_form_json: formJson,
    calculator_snapshot_json: {
      local_test_seed: true,
      boxCounts: { [scenario.boxLabel || "中号箱"]: scenario.storageQty || scenario.purchaseQty || 0 }
    },
    final_readable_message: "",
    parent_order_no: scenario.parentOrderNo || null,
    box_order_no: scenario.boxOrderNo || null,
    storage_pickup_order_no: scenario.pickupOrderNo || null,
    box_delivery_date: scenario.boxDeliveryOffset === undefined ? null : addDays(today, scenario.boxDeliveryOffset),
    box_delivery_time_slot: scenario.boxDeliveryOffset === undefined ? null : scenario.timeSlot,
    box_delivery_method: scenario.purchaseQty ? (scenario.needsUpstairs ? "upstairs" : "downstairs") : null,
    purchased_boxes: scenario.purchaseQty ? [{
      label: scenario.boxLabel || "中号箱",
      boxType: scenario.boxLabel || "中号箱",
      quantity: scenario.purchaseQty,
      subtotal: scenario.price?.purchaseFee || 0
    }] : [],
    storage_intake_date: scenario.orderType === "storage_return" ? null : startDate,
    storage_start_date: startDate,
    storage_end_date: endDate,
    expected_storage_end_date: endDate,
    related_order_no: scenario.relatedOrderNo || null,
    postcode: scenario.postcode,
    room_or_building: scenario.room,
    address_key: addressKey(address, scenario.room, scenario.postcode),
    has_lift: scenario.hasLift,
    needs_upstairs: scenario.needsUpstairs,
    item_description: scenario.itemDescription,
    notification_status: "pending",
    notification_error: null,
    student_email_status: "skipped",
    student_email_error: null,
    webhook_payload_json: null,
    membership_discount_amount: scenario.price?.discount || 0,
    extra_charge_amount: scenario.price?.extraFee || 0,
    final_price: priceSummary.estimatedTotalPrice,
    membership_discount_breakdown_json: scenario.price?.discount ? { local_test_seed: true, amount: scenario.price.discount } : {},
    offline_recorded: Boolean(scenario.offlineRecorded),
    last_operated_by: scenario.offlineRecorded ? "本地测试客服" : null,
    last_operated_at: scenario.offlineRecorded ? new Date().toISOString() : null
  };
  row.final_readable_message = buildReadableMessage(row);
  return row;
}

function scenarios(today) {
  return [
    { orderType: "box_delivery", serviceLabel: "买箱 / 送箱", serviceContent: "买箱", name: "测试-张三", pinyin: "Zhang San", email: "test-storage-01@example.local", phone: "07111000001", wechat: "test_zhangsan", offset: 0, timeSlot: "09:00-11:00", address: "Vita Student Circle Square", room: "A座 1201", postcode: "M1 7ED", hasLift: true, needsUpstairs: false, purchaseQty: 3, storageQty: 0, boxLabel: "中号箱", paymentStatus: "paid", offlineRecorded: true, userNote: "请送到前台", internalNote: "买箱已电话确认", paymentNote: "已收款", boxDeliveryOffset: 0, price: { purchaseFee: 36, purchaseQty: 3 } },
    { orderType: "box_delivery", serviceLabel: "送箱", serviceContent: "送箱", name: "测试-李四", pinyin: "Li Si", email: "test-storage-02@example.local", phone: "07111000002", wechat: "test_lisi", offset: 2, timeSlot: "13:00-15:00", address: "Unite Parkway Gate", room: "B座 808", postcode: "M15 6JH", hasLift: true, needsUpstairs: false, purchaseQty: 1, storageQty: 0, boxLabel: "小号箱", paymentStatus: "unpaid", offlineRecorded: false, userNote: "到楼下联系", internalNote: "待确认箱型", paymentNote: "未收款", boxDeliveryOffset: 2, price: { purchaseFee: 0, purchaseQty: 1 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "取寄存", name: "测试-王五", pinyin: "Wang Wu", email: "test-storage-03@example.local", phone: "07111000003", wechat: "test_wangwu", offset: 1, timeSlot: "10:00-12:00", address: "iQ Lambert & Fairfield House", room: "C栋 305", postcode: "M1 2EH", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 4, boxLabel: "大号箱", paymentStatus: "paid", offlineRecorded: false, userNote: "有一个行李箱", internalNote: "需提醒司机拍照", paymentNote: "已收款", pickupOrderNo: "TEST-ST-P-003", storageStartOffset: 1, storageEndOffset: 31, days: 30, price: { storageFee: 96, homeFee: 20, storageQty: 4, days: 30 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "取寄存", name: "测试-赵六", pinyin: "Zhao Liu", email: "test-storage-04@example.local", phone: "07111000004", wechat: "test_zhaoliu", offset: 3, timeSlot: "15:00-17:00", address: "Canvas River Street Tower", room: "12楼 1205", postcode: "M15 5GQ", hasLift: false, needsUpstairs: true, purchaseQty: 0, storageQty: 2, boxLabel: "行李箱", paymentStatus: "unpaid", offlineRecorded: true, userNote: "无电梯，需要上楼", internalNote: "楼梯费待沟通", paymentNote: "未收款", pickupOrderNo: "TEST-ST-P-004", storageStartOffset: 3, storageEndOffset: 18, days: 15, price: { storageFee: 42, homeFee: 20, stairsFee: 10, storageQty: 2, days: 15 } },
    { orderType: "storage_return", serviceLabel: "送回", serviceContent: "送回", name: "测试-孙七", pinyin: "Sun Qi", email: "test-storage-05@example.local", phone: "07111000005", wechat: "test_sunqi", offset: 5, timeSlot: "11:00-13:00", address: "Moss Court", room: "Flat 6", postcode: "M14 4PQ", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 3, boxLabel: "混合箱", paymentStatus: "paid", offlineRecorded: true, userNote: "送回前一天微信确认", internalNote: "送回单已入表", paymentNote: "已收款", relatedOrderNo: "TEST-ST-P-003", storageStartOffset: -25, storageEndOffset: 5, days: 30, price: { storageFee: 0, homeFee: 22, storageQty: 3 } },
    { orderType: "storage_return", serviceLabel: "送回", serviceContent: "送回", name: "测试-周八", pinyin: "Zhou Ba", email: "test-storage-06@example.local", phone: "07111000006", wechat: "test_zhouba", offset: 9, timeSlot: "16:00-18:00", address: "The Grafton", room: "Block D 417", postcode: "M13 9WU", hasLift: false, needsUpstairs: true, purchaseQty: 0, storageQty: 5, boxLabel: "大号箱", paymentStatus: "unpaid", offlineRecorded: false, userNote: "需要搬上二楼", internalNote: "待安排强壮司机", paymentNote: "未收款", relatedOrderNo: "TEST-ST-P-006", storageStartOffset: -14, storageEndOffset: 9, days: 23, price: { homeFee: 24, stairsFee: 12, storageQty: 5 } },
    { orderType: "storage_collection", serviceLabel: "寄存组合服务", serviceContent: "买箱 + 取寄存", name: "测试-吴九", pinyin: "Wu Jiu", email: "test-storage-07@example.local", phone: "07111000007", wechat: "test_wujiu", offset: 4, timeSlot: "09:30-11:30", address: "Weston Hall", room: "Room 902", postcode: "M1 3BB", hasLift: true, needsUpstairs: false, purchaseQty: 2, storageQty: 3, boxLabel: "中号箱", paymentStatus: "paid", offlineRecorded: false, userNote: "先送箱再取件", internalNote: "组合服务，注意两个动作", paymentNote: "已收款", parentOrderNo: "TEST-ST-COMBO-007", boxOrderNo: "TEST-ST-B-007", pickupOrderNo: "TEST-ST-P-007", boxDeliveryOffset: 2, storageStartOffset: 4, storageEndOffset: 34, days: 30, price: { storageFee: 72, homeFee: 20, purchaseFee: 24, storageQty: 3, purchaseQty: 2, days: 30 } },
    { orderType: "storage", serviceLabel: "寄存相关组合服务", serviceContent: "寄存组合", name: "测试-郑十", pinyin: "Zheng Shi", email: "test-storage-08@example.local", phone: "07111000008", wechat: "test_zhengshi", offset: 6, timeSlot: "14:00-16:00", address: "Artisan Heights", room: "Apt 1103", postcode: "M5 4LA", hasLift: true, needsUpstairs: true, purchaseQty: 1, storageQty: 2, boxLabel: "小号箱", paymentStatus: "pending", offlineRecorded: true, userNote: "组合服务待拆单确认", internalNote: "本地组合场景", paymentNote: "待确认", parentOrderNo: "TEST-ST-COMBO-008", boxOrderNo: "TEST-ST-B-008", pickupOrderNo: "TEST-ST-P-008", boxDeliveryOffset: 6, storageStartOffset: 6, storageEndOffset: 20, days: 14, price: { storageFee: 35, homeFee: 20, stairsFee: 8, purchaseFee: 12, storageQty: 2, purchaseQty: 1, days: 14 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "取寄存", name: "测试-过去单", pinyin: "Guo Qu", email: "test-storage-09@example.local", phone: "07111000009", wechat: "test_past", offset: -3, timeSlot: "12:00-14:00", address: "True Student Salford", room: "Flat 210", postcode: "M50 3SP", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 1, boxLabel: "行李箱", paymentStatus: "paid", offlineRecorded: true, userNote: "过去日期用于筛选", internalNote: "过去服务日期", paymentNote: "已收款", pickupOrderNo: "TEST-ST-P-009", storageStartOffset: -3, storageEndOffset: 10, days: 13, price: { storageFee: 18, homeFee: 18, storageQty: 1, days: 13 } },
    { orderType: "storage_return", serviceLabel: "送回", serviceContent: "送回", name: "测试-远期单", pinyin: "Yuan Qi", email: "test-storage-10@example.local", phone: "07111000010", wechat: "test_future", offset: 20, timeSlot: "10:00-12:00", address: "Park View", room: "Block C 502", postcode: "M14 5RB", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 2, boxLabel: "中号箱", paymentStatus: "paid", offlineRecorded: false, userNote: "未来更远日期", internalNote: "远期送回", paymentNote: "已收款", relatedOrderNo: "TEST-ST-P-010", storageStartOffset: -10, storageEndOffset: 20, days: 30, price: { homeFee: 20, storageQty: 2 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "取寄存", name: "测试-未收款收费", pinyin: "Wei Shou", email: "test-storage-11@example.local", phone: "07111000011", wechat: "test_unpaid_charged", offset: 7, timeSlot: "17:00-19:00", address: "Mayfair Court", room: "Room 88", postcode: "L7 7EE", city: "Liverpool", hasLift: false, needsUpstairs: true, purchaseQty: 0, storageQty: 6, boxLabel: "大号箱", paymentStatus: "unpaid", offlineRecorded: false, userNote: "收费未付款", internalNote: "重点追款", paymentNote: "未收款", pickupOrderNo: "TEST-ST-P-011", storageStartOffset: 7, storageEndOffset: 37, days: 30, price: { storageFee: 150, homeFee: 30, stairsFee: 18, overweightFee: 6, storageQty: 6, days: 30 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "免费 / 待确认寄存", name: "测试_免费待确认", pinyin: "Mian Fei", email: "test-storage-12@example.local", phone: "07111000012", wechat: "test_free", offset: 8, timeSlot: "08:00-10:00", address: "Liberty Point", room: "Flat 1", postcode: "M1 5DD", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 1, boxLabel: "文件箱", paymentStatus: "waived", offlineRecorded: false, userNote: "免费测试单", internalNote: "免费/待确认筛选", paymentNote: "免收", pickupOrderNo: "TEST-ST-P-012", storageStartOffset: 8, storageEndOffset: 15, days: 7, price: { storageQty: 1, days: 7 } },
    { orderType: "box_delivery", serviceLabel: "买箱 / 送箱", serviceContent: "买箱", name: "测试-未来七天边界", pinyin: "Bian Jie", email: "test-storage-13@example.local", phone: "07111000013", wechat: "test_day7", offset: 7, timeSlot: "19:00-21:00", address: "Daisybank Villas", room: "House 3", postcode: "M14 5QP", hasLift: false, needsUpstairs: false, purchaseQty: 4, storageQty: 0, boxLabel: "中号箱", paymentStatus: "unpaid", offlineRecorded: true, userNote: "未来 7 天边界", internalNote: "用于今日/未来7天统计", paymentNote: "未收款", boxDeliveryOffset: 7, price: { purchaseFee: 48, purchaseQty: 4 } },
    { orderType: "storage_return", serviceLabel: "送回", serviceContent: "送回", name: "测试-免费送回", pinyin: "Free Return", email: "test-storage-14@example.local", phone: "07111000014", wechat: "test_free_return", offset: 12, timeSlot: "13:30-15:30", address: "Kincardine Court", room: "2F 22", postcode: "M13 9SY", hasLift: true, needsUpstairs: false, purchaseQty: 0, storageQty: 1, boxLabel: "小号箱", paymentStatus: "waived", offlineRecorded: false, userNote: "免费送回测试", internalNote: "送回免费场景", paymentNote: "免收", relatedOrderNo: "TEST-ST-P-014", storageStartOffset: -5, storageEndOffset: 12, days: 17, price: { storageQty: 1 } },
    { orderType: "storage_collection", serviceLabel: "取寄存", serviceContent: "取寄存", name: "测试-备注编辑", pinyin: "Bei Zhu", email: "test-storage-15@example.local", phone: "07111000015", wechat: "test_note_edit", offset: 10, timeSlot: "18:00-20:00", address: "MSV South", room: "Flat 44", postcode: "M14 6HR", hasLift: true, needsUpstairs: true, purchaseQty: 1, storageQty: 2, boxLabel: "中号箱", paymentStatus: "paid", offlineRecorded: true, userNote: "用于内部备注保存测试", internalNote: "可覆盖编辑测试", paymentNote: "已收款", pickupOrderNo: "TEST-ST-P-015", boxOrderNo: "TEST-ST-B-015", boxDeliveryOffset: 9, storageStartOffset: 10, storageEndOffset: 40, days: 30, price: { storageFee: 60, homeFee: 20, stairsFee: 8, purchaseFee: 12, storageQty: 2, purchaseQty: 1, days: 30 } }
  ];
}

async function seedStorageTestData() {
  const supabase = getLocalSupabaseAdmin();
  const clearResult = await clearStorageTestData(supabase);
  const today = ukToday();
  const rows = scenarios(today).map((scenario, index) => baseOrder(today, index + 1, scenario));
  const { data, error } = await supabase
    .from("storage_orders")
    .insert(rows)
    .select("id, order_no, customer_name, order_type, service_date, offline_recorded");
  if (error) throw error;

  const logs = (data || []).flatMap(row => ([
    {
      target_type: "storage_orders",
      target_id: row.id,
      action: "local_storage_test_seed_created",
      before_data: null,
      after_data: { order_no: row.order_no, local_test_seed: true },
      metadata: { source: "scripts/seed-storage-test-data.js", note: TEST_NOTE_MARKER }
    },
    row.offline_recorded ? {
      target_type: "storage_orders",
      target_id: row.id,
      action: "order_marked_offline_recorded",
      before_data: { offline_recorded: false },
      after_data: { offline_recorded: true },
      metadata: { source: "scripts/seed-storage-test-data.js", note: TEST_NOTE_MARKER }
    } : null
  ])).filter(Boolean);

  if (logs.length) {
    const { error: logError } = await supabase.from("admin_operation_logs").insert(logs);
    if (logError) throw logError;
  }

  return {
    cleared: clearResult.deleted,
    inserted: data?.length || 0,
    orderNos: (data || []).map(row => row.order_no)
  };
}

async function main() {
  const result = await seedStorageTestData();
  console.log(`[storage-test-seed] cleared ${result.cleared} old local test order(s).`);
  console.log(`[storage-test-seed] inserted ${result.inserted} local test storage order(s).`);
  console.log(result.orderNos.join("\n"));
}

if (require.main === module) {
  main().catch(error => {
    console.error("[storage-test-seed] failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  seedStorageTestData
};
