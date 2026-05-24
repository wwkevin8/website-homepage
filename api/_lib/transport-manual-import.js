const { mapRequestPayload, deriveDisplayGroupId } = require("./transport");
const {
  createRequestRecord,
  createGroupForRequest,
  getGroupByBusinessId,
  addRequestToGroup
} = require("./transport-group-lifecycle");
const { logAdminOperation } = require("./orders");
const importColumns = require("../../shared/transport-manual-import-columns.json");

const AIRPORT_NAMES = {
  LHR: "Heathrow Airport",
  LGW: "Gatwick Airport",
  MAN: "Manchester Airport",
  LTN: "London Luton Airport",
  LCY: "London City Airport",
  BHX: "Birmingham Airport",
  STN: "London Stansted Airport",
  OTHER: "Other Airport"
};

const IMPORT_COLUMN_ALIASES = importColumns.reduce((aliases, column) => {
  aliases[column.key] = [column.key, column.label, ...(column.aliases || [])];
  return aliases;
}, {});

const FIELD_ALIASES = {
  ...IMPORT_COLUMN_ALIASES,
  english_name: ["english_name", "拼音/英文名", "拼音", "英文名", "pinyin", "english name"],
  email: ["email", "邮箱", "邮件"],
  carpool_note: ["carpool_note", "最少能接受几人拼车"],
  group_note: ["group_note", "是否已有车/当前人数", "当前人数"],
  luggage_note: ["luggage_note", "行李备注", "行李数量/行李备注"],
  shareable: ["shareable", "是否愿意拼车", "愿意拼车"],
  contact_status: ["contact_status", "联系状态"],
  payment_collection_status: ["payment_collection_status", "收款状态"],
  deposit_amount_gbp: ["deposit_amount_gbp", "定金 GBP", "定金GBP", "定金"],
  admin_note: ["admin_note", "客服备注"]
};

FIELD_ALIASES.flight_date = ["flight_date", "flight date", "arrival date", "departure date", "航班日期", "抵达日期", "起飞日期"];
FIELD_ALIASES.flight_time = ["flight_time", "flight time", "arrival time", "departure time", "航班时间", "抵达时间", "起飞时间"];
FIELD_ALIASES.service_date = ["service_date", "service date", "pickup date", "dropoff date", "服务日期", "接送日期", "接机日期", "送机日期"];
FIELD_ALIASES.service_time_only = ["service_time_only", "service clock", "pickup time", "dropoff time", "服务具体时间", "接机时间", "送机时间", "上车时间"];

const WARNING_CODES = {
  GROUP_DATE: "group_date_mismatch",
  GROUP_TERMINAL: "group_terminal_mismatch",
  GROUP_LOCATION: "group_location_mismatch",
  GROUP_TIME: "group_time_distance",
  DUPLICATE: "possible_duplicate"
};

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function pickField(row = {}, field) {
  const aliases = FIELD_ALIASES[field] || [field];
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const aliasKey = normalizeKey(alias);
    const match = entries.find(([key]) => normalizeKey(key) === aliasKey);
    if (match && normalizeText(match[1]) !== null) return match[1];
  }
  return undefined;
}

function normalizeAirport(value) {
  const text = String(value || "").trim();
  const upper = text.toUpperCase();
  if (!text) return { code: null, name: null };
  if (upper.includes("LHR") || /HEATHROW/i.test(text) || text.includes("希思罗")) return { code: "LHR", name: AIRPORT_NAMES.LHR };
  if (upper.includes("LGW") || /GATWICK/i.test(text) || text.includes("盖特维克")) return { code: "LGW", name: AIRPORT_NAMES.LGW };
  if (upper.includes("MAN") || /MANCHESTER/i.test(text) || text.includes("曼彻斯特")) return { code: "MAN", name: AIRPORT_NAMES.MAN };
  if (upper.includes("LTN") || /LUTON/i.test(text) || text.includes("卢顿")) return { code: "LTN", name: AIRPORT_NAMES.LTN };
  if (upper.includes("LCY") || /CITY/i.test(text) || text.includes("城市机场")) return { code: "LCY", name: AIRPORT_NAMES.LCY };
  if (upper.includes("BHX") || /BIRMINGHAM/i.test(text) || text.includes("伯明翰")) return { code: "BHX", name: AIRPORT_NAMES.BHX };
  if (upper.includes("STN") || /STANSTED/i.test(text) || text.includes("斯坦斯特德")) return { code: "STN", name: AIRPORT_NAMES.STN };
  return { code: upper.length <= 5 ? upper : "OTHER", name: AIRPORT_NAMES[upper] || text };
}

function normalizeTerminal(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/north/i.test(text) || text.includes("北")) return "North";
  if (/south/i.test(text) || text.includes("南")) return "South";
  return text;
}

function normalizeServiceType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("dropoff") || text.includes("送机") || text.includes("诺丁汉到机场") || text.includes("nottingham to airport")) return "dropoff";
  if (text.includes("pickup") || text.includes("接机") || text.includes("机场到诺丁汉") || text.includes("airport to nottingham")) return "pickup";
  return null;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["false", "no", "n", "0", "否", "不愿意"].includes(text)) return false;
  if (["true", "yes", "y", "1", "是", "愿意"].includes(text)) return true;
  return fallback;
}

function parseInteger(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const match = String(value).match(/\d+/);
  if (!match) return fallback;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizePaymentStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("paid") || text.includes("已付") || text.includes("已收")) return "paid";
  if (text.includes("waived") || text.includes("免")) return "waived";
  if (text.includes("pending") || text.includes("待")) return "pending";
  if (text.includes("unpaid") || text.includes("未付") || text.includes("未收")) return "unpaid";
  return null;
}

function normalizePaymentCollectionStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["unpaid", "未付", "未收"].some(item => text.includes(item))) return "unpaid";
  if (["fully_paid", "full", "paid_full"].includes(text) || text.includes("全款")) return "fully_paid";
  if (["deposit_paid", "deposit", "part_paid"].includes(text) || text.includes("定金")) return "deposit_paid";
  if (["paid", "已付", "已收"].some(item => text.includes(item))) return "fully_paid";
  return null;
}

function normalizeContactStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "contacted" || text.includes("已联系") || text.includes("联系过")) return "contacted";
  if (text === "uncontacted" || text.includes("未联系")) return "uncontacted";
  return null;
}

function isInvalidExcelDefaultDate(date) {
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1900;
}

function getLondonTimeZoneParts(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
    return parts;
  }, {});
}

function getLondonOffsetMs(date) {
  const parts = getLondonTimeZoneParts(date);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
  return localAsUtc - date.getTime();
}

function buildLocalIso(year, month, day, hour, minute) {
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
    || parsed.getUTCHours() !== Number(hour)
    || parsed.getUTCMinutes() !== Number(minute)
    || isInvalidExcelDefaultDate(parsed)
  ) {
    return null;
  }
  let utcTime = parsed.getTime();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextUtcTime = parsed.getTime() - getLondonOffsetMs(new Date(utcTime));
    if (nextUtcTime === utcTime) break;
    utcTime = nextUtcTime;
  }
  return new Date(utcTime).toISOString();
}

function normalizeDateTimeText(value) {
  return String(value || "")
    .replace(/[年.]/g, "-")
    .replace(/月/g, "-")
    .replace(/[日号]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClockParts(value) {
  if (value instanceof Date) {
    if (isInvalidExcelDefaultDate(value)) return null;
    return { hour: value.getHours(), minute: value.getMinutes() };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60);
      return { hour: Math.floor(totalMinutes / 60) % 24, minute: totalMinutes % 60 };
    }
    const textNumber = String(value);
    if (/^\d{3,4}$/.test(textNumber)) {
      return { hour: Number(textNumber.slice(0, -2)), minute: Number(textNumber.slice(-2)) };
    }
  }
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?::|：)(\d{2})(?::\d{2})?$/)
    || text.match(/^(\d{1,2})\s*[点時时]\s*(\d{1,2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDateTimeParts(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const normalized = normalizeDateTimeText(text);
  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2})(?::|：)(\d{2})(?::\d{2})?)?$/);
  if (isoMatch) {
    const [, year, month, day, hour = "0", minute = "0"] = isoMatch;
    return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) };
  }

  const localMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2})(?::|：)(\d{2})(?::\d{2})?)?$/);
  if (!localMatch) return null;
  const [, first, second, year, hour = "0", minute = "0"] = localMatch;
  const firstNumber = Number(first);
  const secondNumber = Number(second);
  let day = firstNumber;
  let month = secondNumber;

  if (secondNumber > 12 && firstNumber <= 12) {
    day = secondNumber;
    month = firstNumber;
  }

  return { year: Number(year), month, day, hour: Number(hour), minute: Number(minute) };
}

function buildIsoFromParts(parts) {
  if (!parts) return null;
  return buildLocalIso(parts.year, parts.month, parts.day, parts.hour ?? 0, parts.minute ?? 0);
}

function combineDateAndClock(dateValue, timeValue) {
  const dateParts = parseDateTimeParts(dateValue);
  const clockParts = parseClockParts(timeValue);
  if (!dateParts || !clockParts) return null;
  return buildLocalIso(dateParts.year, dateParts.month, dateParts.day, clockParts.hour, clockParts.minute);
}

function formatParsedDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function parseDateTimeDetailed(value) {
  if (value instanceof Date) {
    if (isInvalidExcelDefaultDate(value)) return { value: null, warnings: [] };
    return { value: value.toISOString(), warnings: [] };
  }
  if (value && typeof value === "object") {
    const nested = value.value ?? value.text ?? value.result ?? value.date ?? value.v ?? value.w;
    return nested === undefined ? { value: null, warnings: [] } : parseDateTimeDetailed(nested);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0 || value < 1) return { value: null, warnings: [] };
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000);
    if (isInvalidExcelDefaultDate(date)) return { value: null, warnings: [] };
    return {
      value: buildLocalIso(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes()
      ),
      warnings: []
    };
  }
  const text = normalizeText(value);
  if (!text) return { value: null, warnings: [] };
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return { value: null, warnings: [] };
  if (/^\d+(?:\.\d+)?$/.test(text)) return parseDateTimeDetailed(Number(text));

  const parsedParts = parseDateTimeParts(text);
  return { value: buildIsoFromParts(parsedParts), warnings: [] };
}

function parseDateTime(value) {
  return parseDateTimeDetailed(value).value;
}

function sameDate(left, right) {
  if (!left || !right) return false;
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

function hoursApart(left, right) {
  if (!left || !right) return null;
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b) / 3600000;
}

function buildNotes(clean) {
  const parts = [];
  if (clean.english_name) parts.push(`拼音/英文名: ${clean.english_name}`);
  if (clean.luggage_note) parts.push(`行李: ${clean.luggage_note}`);
  if (clean.carpool_note) parts.push(`拼车备注: ${clean.carpool_note}`);
  if (clean.group_note) parts.push(`旧表组备注: ${clean.group_note}`);
  if (clean.notes) parts.push(clean.notes);
  return parts.join(" | ") || null;
}

function buildAdminNote(clean) {
  const parts = [];
  const payment = clean.payment_status === "paid" ? "paid" : "unpaid";
  parts.push(`[payment:${payment}]`);
  if (clean.price !== null && clean.price !== undefined) parts.push(`补录价格: GBP ${clean.price}`);
  if (clean.payment_status) parts.push(`结构化付款状态: ${clean.payment_status}`);
  return parts.join(" ");
}

function normalizeRow(rawRow = {}) {
  const serviceType = normalizeServiceType(pickField(rawRow, "service_type"));
  const airport = normalizeAirport(pickField(rawRow, "airport_code"));
  const flightDateTimeRaw = pickField(rawRow, "flight_datetime");
  const serviceTimeRaw = pickField(rawRow, "service_time");
  const flightDatetimeCombined = combineDateAndClock(pickField(rawRow, "flight_date"), pickField(rawRow, "flight_time"));
  const serviceTimeCombined = combineDateAndClock(pickField(rawRow, "service_date"), pickField(rawRow, "service_time_only"));
  const flightDatetime = flightDatetimeCombined
    ? { value: flightDatetimeCombined, warnings: [] }
    : parseDateTimeDetailed(flightDateTimeRaw);
  const serviceTime = serviceTimeCombined
    ? { value: serviceTimeCombined, warnings: [] }
    : parseDateTimeDetailed(serviceTimeRaw);
  const address = normalizeText(pickField(rawRow, "address"));
  const rawLuggageCount = pickField(rawRow, "luggage_count");
  const rawLuggageNote = pickField(rawRow, "luggage_note");
  const luggageCount = parseInteger(rawLuggageCount, parseInteger(rawLuggageNote, 0));
  const luggageNote = normalizeText(rawLuggageNote)
    || (rawLuggageCount && !/^\s*\d+\s*$/.test(String(rawLuggageCount)) ? normalizeText(rawLuggageCount) : null);
  const clean = {
    service_type: serviceType,
    student_name: normalizeText(pickField(rawRow, "student_name")),
    english_name: normalizeText(pickField(rawRow, "english_name")),
    phone: normalizeText(pickField(rawRow, "phone")),
    wechat: normalizeText(pickField(rawRow, "wechat")),
    email: normalizeText(pickField(rawRow, "email")),
    passenger_count: parseInteger(pickField(rawRow, "passenger_count"), 1),
    luggage_count: luggageCount,
    luggage_note: luggageNote,
    airport_code: airport.code,
    airport_name: airport.name,
    terminal: normalizeTerminal(pickField(rawRow, "terminal")),
    flight_no: normalizeText(pickField(rawRow, "flight_no")),
    flight_datetime: flightDatetime.value,
    service_time: serviceTime.value,
    address,
    shareable: parseBoolean(pickField(rawRow, "shareable"), true),
    price: parseMoney(pickField(rawRow, "price")),
    payment_status: normalizePaymentStatus(pickField(rawRow, "payment_status")),
    deposit_amount_gbp: parseMoney(pickField(rawRow, "deposit_amount_gbp") ?? pickField(rawRow, "price")),
    payment_collection_status: normalizePaymentCollectionStatus(pickField(rawRow, "payment_collection_status") ?? pickField(rawRow, "payment_status")),
    contact_status: normalizeContactStatus(pickField(rawRow, "contact_status")),
    admin_note: normalizeText(pickField(rawRow, "admin_note")),
    notes: normalizeText(pickField(rawRow, "notes")),
    carpool_note: normalizeText(pickField(rawRow, "carpool_note")),
    group_note: normalizeText(pickField(rawRow, "group_note")),
    group_id: normalizeText(pickField(rawRow, "group_id"))
  };

  const locationFrom = clean.service_type === "dropoff" ? clean.address : (clean.airport_name || clean.airport_code);
  const locationTo = clean.service_type === "dropoff" ? (clean.airport_name || clean.airport_code) : clean.address;
  return {
    clean,
    warnings: [...flightDatetime.warnings, ...serviceTime.warnings],
    requestPayload: {
      service_type: clean.service_type,
      student_name: clean.student_name,
      email: clean.email,
      phone: clean.phone,
      wechat: clean.wechat,
      passenger_count: clean.passenger_count,
      luggage_count: clean.luggage_count,
      airport_code: clean.airport_code,
      airport_name: clean.airport_name,
      terminal: clean.terminal,
      flight_no: clean.flight_no,
      flight_datetime: clean.flight_datetime,
      location_from: locationFrom,
      location_to: locationTo,
      preferred_time_start: clean.service_time,
      preferred_time_end: null,
      shareable: clean.shareable,
      notes: buildNotes(clean),
      admin_note: clean.admin_note || buildAdminNote(clean),
      offline_recorded: true
    }
  };
}

function validateRequired(clean) {
  const errors = [];
  if (!clean.service_type) errors.push({ code: "missing_service_type", message: "缺少或无法识别服务类型" });
  if (!clean.student_name) errors.push({ code: "missing_student_name", message: "缺少学生姓名" });
  if (!clean.passenger_count || clean.passenger_count <= 0) errors.push({ code: "missing_passenger_count", message: "缺少有效人数" });
  if (!clean.airport_code) errors.push({ code: "missing_airport", message: "缺少或无法识别机场" });
  if (!clean.flight_datetime) errors.push({ code: "missing_flight_datetime", message: "请填写完整日期时间，例如 2026/05/22 12:00。" });
  if (!clean.address) errors.push({ code: "missing_address", message: "缺少地址" });
  if (!clean.phone && !clean.wechat) errors.push({ code: "missing_contact", message: "Phone or WeChat is required" });
  if (!clean.terminal) errors.push({ code: "missing_terminal", message: "Terminal is required" });
  if (!clean.flight_no) errors.push({ code: "missing_flight_no", message: "Flight number is required" });
  if (!clean.service_time) errors.push({ code: "missing_service_time", message: "请填写完整日期时间，例如 2026/05/22 12:00。" });
  return errors;
}

function duplicateKeyParts(clean) {
  const contact = clean.phone || clean.wechat || "";
  const date = clean.flight_datetime ? new Date(clean.flight_datetime).toISOString().slice(0, 10) : "";
  return {
    strict: [clean.student_name, contact, clean.flight_no, clean.flight_datetime].map(item => String(item || "").toUpperCase()).join("|"),
    contactDate: [contact, date, clean.service_type].map(item => String(item || "").toUpperCase()).join("|")
  };
}

function addBatchDuplicateWarnings(previews) {
  const strict = new Map();
  const contactDate = new Map();
  previews.forEach(item => {
    const keys = duplicateKeyParts(item.clean || {});
    if (keys.strict.replace(/\|/g, "")) strict.set(keys.strict, [...(strict.get(keys.strict) || []), item.row_index]);
    if (keys.contactDate.replace(/\|/g, "")) contactDate.set(keys.contactDate, [...(contactDate.get(keys.contactDate) || []), item.row_index]);
  });

  previews.forEach(item => {
    const keys = duplicateKeyParts(item.clean || {});
    const matched = [
      ...(strict.get(keys.strict) || []),
      ...(contactDate.get(keys.contactDate) || [])
    ].filter(index => index !== item.row_index);
    if (matched.length) {
      item.warnings.push({
        code: WARNING_CODES.DUPLICATE,
        message: `同一批次内疑似重复行: ${Array.from(new Set(matched)).join(", ")}`
      });
    }
  });
}

async function findDatabaseDuplicates(supabase, clean) {
  const warnings = [];
  const contactValues = [clean.phone, clean.wechat].filter(Boolean);
  if (!contactValues.length && !clean.student_name) return warnings;

  let query = supabase
    .from("transport_requests")
    .select("id, order_no, student_name, phone, wechat, flight_no, flight_datetime, service_type")
    .limit(20);

  if (contactValues.length) {
    query = query.or(contactValues.map(value => `phone.eq.${value},wechat.eq.${value}`).join(","));
  } else {
    query = query.eq("student_name", clean.student_name);
  }

  const { data, error } = await query;
  if (error) throw error;

  const matched = (data || []).filter(row => {
    const sameStrict = clean.student_name && row.student_name === clean.student_name
      && (clean.phone && row.phone === clean.phone || clean.wechat && row.wechat === clean.wechat)
      && clean.flight_no && row.flight_no === clean.flight_no
      && clean.flight_datetime && row.flight_datetime && hoursApart(clean.flight_datetime, row.flight_datetime) < 1;
    const sameContactDate = (clean.phone && row.phone === clean.phone || clean.wechat && row.wechat === clean.wechat)
      && sameDate(clean.flight_datetime, row.flight_datetime)
      && clean.service_type === row.service_type;
    return sameStrict || sameContactDate;
  });

  if (matched.length) {
    warnings.push({
      code: WARNING_CODES.DUPLICATE,
      message: `数据库已有疑似重复订单: ${matched.map(row => row.order_no || row.id).join(", ")}`,
      matches: matched.map(row => ({ id: row.id, order_no: row.order_no }))
    });
  }
  return warnings;
}

async function findCandidateGroups(supabase, clean) {
  if (!clean.service_type || !clean.airport_code || !clean.flight_datetime) return [];
  const date = new Date(clean.service_time || clean.flight_datetime).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("transport_groups_public_view")
    .select("group_id, service_type, group_date, airport_code, terminal, location_from, location_to, preferred_time_start, current_passenger_count, remaining_passenger_count, status")
    .eq("service_type", clean.service_type)
    .eq("airport_code", clean.airport_code)
    .eq("group_date", date)
    .in("status", ["single_member", "active"])
    .gt("remaining_passenger_count", 0)
    .limit(10);
  if (error) throw error;
  return (data || []).map(group => ({
    group_id: group.group_id,
    status: group.status,
    current_passenger_count: group.current_passenger_count,
    remaining_passenger_count: group.remaining_passenger_count,
    terminal: group.terminal,
    preferred_time_start: group.preferred_time_start,
    location_from: group.location_from,
    location_to: group.location_to
  }));
}

function buildGroupWarnings(clean, group) {
  const warnings = [];
  if (!group) return warnings;
  if (!sameDate(clean.service_time || clean.flight_datetime, group.preferred_time_start || group.flight_time_reference || group.group_date)) {
    warnings.push({ code: WARNING_CODES.GROUP_DATE, message: "订单日期与目标拼车组日期不一致" });
  }
  if (clean.terminal && group.terminal && clean.terminal !== group.terminal) {
    warnings.push({ code: WARNING_CODES.GROUP_TERMINAL, message: `航站楼不一致: 订单 ${clean.terminal} / 组 ${group.terminal}` });
  }
  const cleanLocation = clean.service_type === "dropoff" ? clean.address : clean.address;
  const groupLocation = clean.service_type === "dropoff" ? group.location_from : group.location_to;
  if (cleanLocation && groupLocation && !String(groupLocation).toLowerCase().includes(String(cleanLocation).toLowerCase()) && !String(cleanLocation).toLowerCase().includes(String(groupLocation).toLowerCase())) {
    warnings.push({ code: WARNING_CODES.GROUP_LOCATION, message: "地址/上车城市与目标拼车组不完全一致" });
  }
  const distance = hoursApart(clean.service_time || clean.flight_datetime, group.preferred_time_start || group.flight_time_reference);
  if (distance !== null && distance > 3) {
    warnings.push({ code: WARNING_CODES.GROUP_TIME, message: `服务时间与目标拼车组相差约 ${Math.round(distance * 10) / 10} 小时` });
  }
  return warnings;
}

async function validateExistingGroup(supabase, clean) {
  if (!clean.group_id) return { group: null, errors: [], warnings: [] };
  let group = null;
  try {
    group = await getGroupByBusinessId(supabase, clean.group_id);
  } catch (error) {
    return { group: null, errors: [{ code: "group_not_found", message: "未找到目标 Group ID" }], warnings: [] };
  }
  const errors = [];
  if (group.service_type !== clean.service_type) errors.push({ code: "group_service_type_mismatch", message: "目标组服务类型不一致" });
  if (group.airport_code !== clean.airport_code) errors.push({ code: "group_airport_mismatch", message: "目标组机场不一致" });
  const { data: members, error: membersError } = await supabase
    .from("transport_group_members")
    .select("passenger_count_snapshot, transport_requests(status, passenger_count)")
    .eq("group_id", group.group_id || clean.group_id);
  if (membersError) throw membersError;
  const currentPassengers = (members || []).reduce((sum, member) => {
    if (member.transport_requests?.status === "closed") return sum;
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const remaining = Math.max(Number(group.max_passengers || 0) - currentPassengers, 0);
  if (remaining < Number(clean.passenger_count || 0)) {
    errors.push({ code: "group_capacity_exceeded", message: "加入后会超过目标组人数上限" });
  }
  return { group, errors, warnings: buildGroupWarnings(clean, group), remaining };
}

function statusFromIssues(errors, warnings) {
  if (errors.length) return "error";
  if (warnings.length) return "warning";
  return "ready";
}

function buildGroupSummary(group, remaining = null) {
  if (!group) return null;
  const current = remaining === null || remaining === undefined
    ? null
    : Math.max(Number(group.max_passengers || 0) - Number(remaining || 0), 0);
  return {
    group_id: group.group_id,
    status: group.status,
    service_type: group.service_type,
    airport_code: group.airport_code,
    airport_name: group.airport_name,
    terminal: group.terminal,
    group_date: group.group_date,
    flight_time_reference: group.flight_time_reference,
    preferred_time_start: group.preferred_time_start,
    current_passenger_count: current,
    remaining_passenger_count: remaining,
    max_passengers: group.max_passengers,
    location_from: group.location_from,
    location_to: group.location_to
  };
}

async function previewRows(supabase, rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const sourceRow = row?.raw || row?.raw_import_payload || row;
    const normalized = normalizeRow(sourceRow);
    return {
      row_index: Number(row?.row_index || row?.rowIndex || index + 1),
      raw_import_payload: sourceRow,
      clean: normalized.clean,
      request_payload: normalized.requestPayload,
      errors: validateRequired(normalized.clean),
      warnings: normalized.warnings || []
    };
  });

  addBatchDuplicateWarnings(normalizedRows);

  for (const item of normalizedRows) {
    if (!item.errors.length) {
      item.warnings.push(...await findDatabaseDuplicates(supabase, item.clean));
      const groupCheck = await validateExistingGroup(supabase, item.clean);
      item.errors.push(...groupCheck.errors);
      item.warnings.push(...groupCheck.warnings);
      item.target_group = buildGroupSummary(groupCheck.group, groupCheck.remaining);
      item.candidate_groups = item.clean.group_id ? [] : await findCandidateGroups(supabase, item.clean);
    }
    item.status = statusFromIssues(item.errors, item.warnings);
    item.can_import = item.status !== "error";
  }

  return normalizedRows;
}

function hasUnconfirmedWarnings(preview, confirmedWarnings = {}) {
  if (!preview.warnings.length) return false;
  const rowConfirmation = confirmedWarnings[String(preview.row_index)] || confirmedWarnings[preview.row_index];
  return rowConfirmation !== true;
}

function generateImportBatchId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `TMI-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function logTransportImportOperation(supabase, adminUser, request, action, metadata = {}) {
  try {
    await logAdminOperation(supabase, {
      admin_user_id: adminUser.id || null,
      target_type: "transport_request",
      target_id: request.id,
      action,
      before_data: null,
      after_data: {
        id: request.id,
        order_no: request.order_no,
        group_id: metadata.group_id || null
      },
      metadata: {
        ...metadata,
        admin_name: resolveAdminDisplayName(adminUser)
      }
    });
  } catch (error) {
    console.warn("transport_manual_import_operation_log_failed", {
      request_id: request?.id,
      action,
      message: error?.message || String(error)
    });
  }
}

async function createRequestFromPreview(supabase, adminUser, preview, options = {}) {
  const source = options.source || "sheet_import";
  const importBatchId = options.importBatchId || null;
  const adminName = resolveAdminDisplayName(adminUser);
  const paymentStatus = preview.clean.payment_status || "unpaid";
  const requestPayload = mapRequestPayload(preview.request_payload);
  const request = await createRequestRecord(supabase, {
    ...requestPayload,
    source,
    created_by_admin_id: adminUser.id || null,
    created_by_admin_name: adminName,
    import_batch_id: importBatchId,
    raw_import_payload: preview.raw_import_payload || null,
    manual_price_gbp: preview.clean.price,
    manual_payment_status: paymentStatus,
    last_operated_by: adminName,
    last_operated_at: new Date().toISOString()
  });

  let group;
  let action = "create_transport_manual_request";
  if (preview.clean.group_id) {
    group = await addRequestToGroup(supabase, preview.clean.group_id, request);
    action = "create_transport_manual_request_and_join_group";
  } else {
    group = await createGroupForRequest(supabase, request, { isInitiator: true });
  }

  await logTransportImportOperation(supabase, adminUser, request, action, {
    source,
    import_batch_id: importBatchId,
    group_id: group?.group_id || preview.clean.group_id || null,
    confirmed_warnings: options.confirmedWarnings || [],
    warning_count: preview.warnings.length
  });

  if (preview.clean.group_id && preview.warnings.length) {
    await logTransportImportOperation(supabase, adminUser, request, "force_join_transport_group_with_warnings", {
      source,
      import_batch_id: importBatchId,
      group_id: preview.clean.group_id,
      confirmed_warnings: preview.warnings
    });
  }

  return {
    request,
    group,
    group_id: group?.group_id || deriveDisplayGroupId(group?.id, request.flight_datetime)
  };
}

async function commitRows(supabase, adminUser, rows = [], options = {}) {
  const previews = await previewRows(supabase, rows);
  const confirmedWarnings = options.confirmedWarnings || {};
  const importBatchId = options.importBatchId || generateImportBatchId();
  const results = [];
  const rejected = [];

  for (const preview of previews) {
    if (preview.errors.length) {
      rejected.push(preview);
      continue;
    }
    if (hasUnconfirmedWarnings(preview, confirmedWarnings)) {
      rejected.push({
        ...preview,
        errors: [{ code: "warnings_not_confirmed", message: "存在黄色提示，需管理员确认后才能导入" }]
      });
      continue;
    }
    results.push(await createRequestFromPreview(supabase, adminUser, preview, {
      source: "sheet_import",
      importBatchId,
      confirmedWarnings: preview.warnings
    }));
  }

  return {
    import_batch_id: importBatchId,
    imported_count: results.length,
    rejected_count: rejected.length,
    items: results,
    rejected
  };
}

async function createManualRequest(supabase, adminUser, row = {}, options = {}) {
  if (normalizeText(pickField(row, "group_id"))) {
    return {
      ok: false,
      preview: {
        row_index: 1,
        raw_import_payload: { ...row },
        clean: null,
        target_group: null,
        candidate_groups: [],
        status: "error",
        can_import: false,
        errors: [
          {
            code: "group_disabled_for_single_manual_request",
            message: "P4a 单条补录暂不支持填写 Group ID，也不会创建或加入拼车组。"
          }
        ],
        warnings: []
      }
    };
  }

  const [preview] = await previewRows(supabase, [row]);
  if (!preview || preview.errors.length) {
    return { ok: false, preview };
  }
  if (preview.clean.group_id) {
    return {
      ok: false,
      preview: {
        ...preview,
        status: "error",
        can_import: false,
        errors: [
          ...(preview.errors || []),
          {
            code: "group_disabled_for_single_manual_request",
            message: "P4a 单条补录暂不支持填写 Group ID，也不会创建或加入拼车组。"
          }
        ]
      }
    };
  }
  if (preview.warnings.length && options.confirmWarnings !== true) {
    return { ok: false, preview, requires_confirmation: true };
  }

  if (pickField(row, "shareable") === undefined) {
    preview.clean.shareable = false;
    preview.request_payload.shareable = false;
  }

  const adminName = resolveAdminDisplayName(adminUser);
  const requestPayload = mapRequestPayload(preview.request_payload);
  const request = await createRequestRecord(supabase, {
    ...requestPayload,
    source: "admin_manual",
    created_by_admin_id: adminUser.id || null,
    created_by_admin_name: adminName,
    import_batch_id: null,
    raw_import_payload: preview.raw_import_payload || null,
    manual_price_gbp: preview.clean.deposit_amount_gbp,
    manual_payment_status: null,
    contact_status: preview.clean.contact_status || "uncontacted",
    payment_collection_status: preview.clean.payment_collection_status || "unpaid",
    deposit_amount_gbp: preview.clean.deposit_amount_gbp,
    offline_recorded: true,
    last_operated_by: adminName,
    last_operated_at: new Date().toISOString()
  });

  await logTransportImportOperation(supabase, adminUser, request, "create_transport_manual_request_request_only", {
    source: "admin_manual",
    import_batch_id: null,
    group_id: null,
    confirmed_warnings: options.confirmWarnings === true ? preview.warnings : [],
    warning_count: preview.warnings.length
  });

  return {
    ok: true,
    preview,
    request,
    group: null,
    group_id: null
  };
}

module.exports = {
  normalizeRow,
  parseDateTimeDetailed,
  previewRows,
  commitRows,
  createManualRequest,
  generateImportBatchId,
  WARNING_CODES
};
