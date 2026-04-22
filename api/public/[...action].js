const authConfigHandler = require("../../public-api-handlers/auth-config");
const myTransportRequestsHandler = require("../../public-api-handlers/my-transport-requests");
const storageOrderSubmitHandler = require("../../public-api-handlers/storage-order-submit");
const transportBoardHandler = require("../../public-api-handlers/transport-board");
const transportGroupsHandler = require("../../public-api-handlers/transport-groups");
const transportJoinPreviewHandler = require("../../public-api-handlers/transport-join-preview");
const transportJoinSubmitHandler = require("../../public-api-handlers/transport-join-submit");
const transportRequestSubmitHandler = require("../../public-api-handlers/transport-request-submit");
const { badRequest } = require("../_lib/http");

const HANDLERS = {
  "auth-config": authConfigHandler,
  "my-transport-requests": myTransportRequestsHandler,
  "storage-order-submit": storageOrderSubmitHandler,
  "transport-board": transportBoardHandler,
  "transport-groups": transportGroupsHandler,
  "transport-join-preview": transportJoinPreviewHandler,
  "transport-join-submit": transportJoinSubmitHandler,
  "transport-request-submit": transportRequestSubmitHandler
};

function resolveAction(req) {
  const actionParam = req.query?.action;
  const fromQuery = Array.isArray(actionParam) ? actionParam.join("/") : String(actionParam || "").trim();
  if (fromQuery) {
    return fromQuery;
  }

  const rawUrl = String(req.url || "");
  const pathname = rawUrl.split("?")[0] || "";
  const match = pathname.match(/^\/api\/public\/(.+)$/);
  return match?.[1] ? String(match[1]).trim() : "";
}

module.exports = async function handler(req, res) {
  const action = resolveAction(req);
  const nextHandler = HANDLERS[action];

  if (!nextHandler) {
    badRequest(res, "Unknown public API action");
    return;
  }

  return nextHandler(req, res);
};
