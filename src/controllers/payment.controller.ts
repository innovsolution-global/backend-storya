import { logger } from '../config/logger';
import { currentUser } from '../middlewares/auth';
import { paymentService } from '../services/payment.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { PaginationInput } from '../utils/pagination';
import { cinetpayNotificationSchema } from '../validators/payment.validator';
import type { CheckoutInput } from '../validators/payment.validator';

export const paymentController = {
  offers: asyncHandler(async (_req, res) => {
    sendSuccess(res, await paymentService.offers());
  }),

  checkout: asyncHandler(async (req, res) => {
    const payment = await paymentService.checkout(
      currentUser(req).id,
      (req.body as CheckoutInput).offer,
    );
    sendSuccess(res, payment, { message: 'Paiement initialisé.', statusCode: 201 });
  }),

  status: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await paymentService.status(currentUser(req).id, req.params.transactionId ?? ''),
    );
  }),

  history: asyncHandler(async (req, res) => {
    const { items, meta } = await paymentService.history(
      currentUser(req).id,
      req.query as unknown as PaginationInput,
    );
    sendSuccess(res, items, { meta });
  }),

  /**
   * Webhook CinetPay. On répond toujours 200 pour éviter les relances inutiles :
   * les erreurs sont journalisées et le paiement reste vérifiable par l'app.
   */
  cinetpayNotify: asyncHandler(async (req, res) => {
    const parsed = cinetpayNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ body: req.body as unknown }, 'Notification CinetPay invalide');
      res.status(200).send('OK');
      return;
    }
    try {
      await paymentService.handleNotification('cinetpay', parsed.data.cpm_trans_id);
    } catch (error) {
      logger.error(
        { err: error, transactionId: parsed.data.cpm_trans_id },
        'Traitement de notification échoué',
      );
    }
    res.status(200).send('OK');
  }),
};
