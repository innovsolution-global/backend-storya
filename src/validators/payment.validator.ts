import { z } from 'zod';

import { PREMIUM_OFFERS } from '../constants';

const offerIds = Object.keys(PREMIUM_OFFERS) as [
  keyof typeof PREMIUM_OFFERS,
  ...(keyof typeof PREMIUM_OFFERS)[],
];

export const checkoutSchema = z
  .object({
    offer: z.enum(offerIds, {
      errorMap: () => ({ message: `Offre inconnue (${offerIds.join(', ')}).` }),
    }),
  })
  .strict();

export const transactionParamSchema = z.object({
  transactionId: z.string().regex(/^STY[A-Z0-9]{10,40}$/, 'Identifiant de transaction invalide.'),
});

/** Notification CinetPay (application/x-www-form-urlencoded) : seul l'identifiant nous intéresse. */
export const cinetpayNotificationSchema = z
  .object({
    cpm_trans_id: z.string().regex(/^STY[A-Z0-9]{10,40}$/),
    cpm_site_id: z.string().optional(),
  })
  .passthrough();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
