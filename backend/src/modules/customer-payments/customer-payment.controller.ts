import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { customerPaymentService } from "./customer-payment.service.js";
import type {
  CustomerPaymentGateway,
  CustomerPaymentVerifyInput,
} from "./customer-payment.types.js";

/**
 * Customer payment endpoints. Customer identity always comes from
 * `req.customer` (→ CustomerAccount → linked CRM Customer). Financial values
 * are never accepted from the client.
 */
export const customerPaymentController = {
  /**
   * GET /customer/payments/gateways
   *
   * Server-discovered payment options for checkout. Availability comes from the
   * provider registry, so the storefront never decides on its own whether a
   * gateway (e.g. Fonepay) exists in this deployment.
   */
  gateways: asyncHandler(async (_req, res) => {
    const gateways = customerPaymentService.getAvailableGateways();
    sendSuccess(res, { gateways }, "Payment options retrieved.");
  }),

  initiate: asyncHandler(async (req, res) => {
    const orderId = req.params.orderId as string;
    const gateway = req.body.gateway as CustomerPaymentGateway;
    const result = await customerPaymentService.initiate(req.customer!.id, orderId, gateway);
    sendSuccess(res, result, "Payment initialized. Please complete your payment.");
  }),

  verify: asyncHandler(async (req, res) => {
    const orderId = req.params.orderId as string;
    const input = req.body as CustomerPaymentVerifyInput;
    const result = await customerPaymentService.verify(req.customer!.id, orderId, input);
    sendSuccess(res, result, "Payment verification complete.");
  }),

  getStatus: asyncHandler(async (req, res) => {
    const orderId = req.params.orderId as string;
    const payment = await customerPaymentService.getStatus(req.customer!.id, orderId);
    sendSuccess(res, { payment });
  }),

  /** Cancel a pending payment attempt (Pending/Initiated → Cancelled). */
  cancel: asyncHandler(async (req, res) => {
    const orderId = req.params.orderId as string;
    const result = await customerPaymentService.cancelPayment(req.customer!.id, orderId);
    sendSuccess(res, result, "Payment cancelled.");
  }),
};
