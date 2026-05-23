const assert = require("node:assert/strict");
const { normalizeRow, parseDateTimeDetailed } = require("../api/_lib/transport-manual-import");

function londonTimeParts(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value)).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
}

function excelSerialDate(year, month, day, hour = 0, minute = 0) {
  return (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(1899, 11, 30)) / 86400000;
}

function assertParses(value, expectedDate, expectedTime = "00:00") {
  const result = parseDateTimeDetailed(value);
  assert.ok(result.value, `${value} should parse`);
  const parts = londonTimeParts(result.value);
  assert.equal(`${parts.year}-${parts.month}-${parts.day}`, expectedDate, `${value} date`);
  assert.equal(`${parts.hour}:${parts.minute}`, expectedTime, `${value} time`);
}

assertParses(excelSerialDate(2026, 9, 13, 14, 30), "2026-09-13", "14:30");
assertParses("2026/09/13 14:30", "2026-09-13", "14:30");
assertParses("2026-09-13 14:30", "2026-09-13", "14:30");
assertParses("13/09/2026 14:30", "2026-09-13", "14:30");
assertParses("13-09-2026 14:30", "2026-09-13", "14:30");
assertParses("13/09/2026", "2026-09-13", "00:00");
assertParses("2026/09/13", "2026-09-13", "00:00");
assertParses("2026-09-13", "2026-09-13", "00:00");

const splitRow = normalizeRow({
  student_name: "TEST Date Split",
  phone: "07111111111",
  service_type: "pickup",
  airport_code: "LHR",
  terminal: "T2",
  flight_no: "TST100",
  flight_date: "13/09/2026",
  flight_time: "14:30",
  service_date: "13/09/2026",
  service_time_only: "16:30",
  address: "Nottingham NG1 1AA"
});

const splitFlightParts = londonTimeParts(splitRow.clean.flight_datetime);
assert.equal(`${splitFlightParts.year}-${splitFlightParts.month}-${splitFlightParts.day}`, "2026-09-13");
assert.equal(`${londonTimeParts(splitRow.clean.flight_datetime).hour}:${londonTimeParts(splitRow.clean.flight_datetime).minute}`, "14:30");
assert.equal(`${londonTimeParts(splitRow.clean.service_time).hour}:${londonTimeParts(splitRow.clean.service_time).minute}`, "16:30");

console.log("transport manual import date parsing checks passed");
