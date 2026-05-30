const authConfigHandler = require("../../public-api-handlers/auth-config");
const communityCommentReportsHandler = require("../../public-api-handlers/community-comment-reports");
const communityCommentsHandler = require("../../public-api-handlers/community-comments");
const communityImageFinalizeHandler = require("../../public-api-handlers/community-image-finalize");
const communityImageUploadHandler = require("../../public-api-handlers/community-image-upload");
const communityPostReportsHandler = require("../../public-api-handlers/community-post-reports");
const communityPostsHandler = require("../../public-api-handlers/community-posts");
const membershipBenefitSelectionHandler = require("../../public-api-handlers/membership-benefit-selection");
const membershipMeHandler = require("../../public-api-handlers/membership-me");
const membershipRedeemCodeHandler = require("../../public-api-handlers/membership-redeem-code");
const myStorageOrdersHandler = require("../../public-api-handlers/my-storage-orders");
const myTransportRequestsHandler = require("../../public-api-handlers/my-transport-requests");
const postageOrderSubmitHandler = require("../../public-api-handlers/postage-order-submit");
const storageOrderSubmitHandler = require("../../public-api-handlers/storage-order-submit");
const transportBoardHandler = require("../../public-api-handlers/transport-board");
const transportGroupsHandler = require("../../public-api-handlers/transport-groups");
const transportJoinPreviewHandler = require("../../public-api-handlers/transport-join-preview");
const transportJoinSubmitHandler = require("../../public-api-handlers/transport-join-submit");
const transportRequestSubmitHandler = require("../../public-api-handlers/transport-request-submit");
const { badRequest } = require("../_lib/http");

const HANDLERS = {
  "auth-config": authConfigHandler,
  "community-comment-reports": communityCommentReportsHandler,
  "community-comments": communityCommentsHandler,
  "community-image-finalize": communityImageFinalizeHandler,
  "community-image-upload": communityImageUploadHandler,
  "community-post-reports": communityPostReportsHandler,
  "community-posts": communityPostsHandler,
  "membership-me": membershipMeHandler,
  "membership/me": membershipMeHandler,
  "membership-benefit-selection": membershipBenefitSelectionHandler,
  "membership/benefit-selection": membershipBenefitSelectionHandler,
  "membership-redeem-code": membershipRedeemCodeHandler,
  "membership/redeem-code": membershipRedeemCodeHandler,
  "my-storage-orders": myStorageOrdersHandler,
  "my-transport-requests": myTransportRequestsHandler,
  "postage-order-submit": postageOrderSubmitHandler,
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
