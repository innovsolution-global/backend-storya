import express, { Router } from 'express';

import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { paginationSchema } from '../validators/common.validator';
import { checkoutSchema, transactionParamSchema } from '../validators/payment.validator';

export const paymentRouter = Router();

paymentRouter.get('/offers', paymentController.offers);

// Webhook public (appelé par CinetPay en x-www-form-urlencoded).
paymentRouter.post(
  '/cinetpay/notify',
  express.urlencoded({ extended: false, limit: '20kb' }),
  paymentController.cinetpayNotify,
);
// CinetPay teste la disponibilité de l'URL de notification.
paymentRouter.get('/cinetpay/notify', (_req, res) => {
  res.status(200).send('OK');
});

paymentRouter.post(
  '/checkout',
  authenticate,
  validate({ body: checkoutSchema }),
  paymentController.checkout,
);
paymentRouter.get(
  '/',
  authenticate,
  validate({ query: paginationSchema }),
  paymentController.history,
);
paymentRouter.get(
  '/:transactionId',
  authenticate,
  validate({ params: transactionParamSchema }),
  paymentController.status,
);
