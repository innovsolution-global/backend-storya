import { Router } from 'express';

import { adminController } from '../controllers/admin.controller';
import { notificationController } from '../controllers/notification.controller';
import { promotionController } from '../controllers/promotion.controller';
import { promotionImageUpload } from '../middlewares/upload';
import { createPromotionSchema, updatePromotionSchema } from '../validators/promotion.validator';
import { userController } from '../controllers/user.controller';
import { videoController } from '../controllers/video.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  activityQuerySchema,
  adminListPaymentsQuerySchema,
  createAdminSchema,
  sendCampaignSchema,
  timeseriesQuerySchema,
  updateSubscriptionSchema,
} from '../validators/admin.validator';
import { idParamSchema } from '../validators/common.validator';
import { listUsersQuerySchema, updateRoleSchema } from '../validators/user.validator';
import { adminListVideosQuerySchema } from '../validators/video.validator';

/** Back-office (réservé aux administrateurs). */
export const adminRouter = Router();

adminRouter.use(authenticate, authorize('admin'));

// Tableau de bord.
adminRouter.get('/stats/overview', adminController.overview);
adminRouter.get(
  '/stats/timeseries',
  validate({ query: timeseriesQuerySchema }),
  adminController.timeseries,
);
adminRouter.get('/activity', validate({ query: activityQuerySchema }), adminController.activity);
adminRouter.get('/system', adminController.system);

// Modération des vidéos générées.
adminRouter.get(
  '/videos',
  validate({ query: adminListVideosQuerySchema }),
  videoController.adminList,
);
adminRouter.delete('/videos/:id', validate({ params: idParamSchema }), videoController.adminRemove);
adminRouter.delete(
  '/videos/:id/publish',
  validate({ params: idParamSchema }),
  videoController.adminUnpublish,
);

// Utilisateurs.
adminRouter.get('/users', validate({ query: listUsersQuerySchema }), adminController.listUsers);
adminRouter.get('/users/:id', validate({ params: idParamSchema }), adminController.getUser);
adminRouter.patch(
  '/users/:id/role',
  validate({ params: idParamSchema, body: updateRoleSchema }),
  userController.updateRole,
);
adminRouter.patch(
  '/users/:id/subscription',
  validate({ params: idParamSchema, body: updateSubscriptionSchema }),
  adminController.updateSubscription,
);

// Administrateurs du back-office.
adminRouter.get('/admins', adminController.listAdmins);
adminRouter.post('/admins', validate({ body: createAdminSchema }), adminController.createAdmin);
adminRouter.delete('/admins/:id', validate({ params: idParamSchema }), adminController.removeAdmin);

// Notifications push (campagnes).
adminRouter.get('/notifications', notificationController.listCampaigns);
adminRouter.post(
  '/notifications',
  validate({ body: sendCampaignSchema }),
  notificationController.sendCampaign,
);

// Promotions (bannières, offres limitées, essais gratuits).
adminRouter.get('/promotions', promotionController.list);
adminRouter.post(
  '/promotions',
  validate({ body: createPromotionSchema }),
  promotionController.create,
);
adminRouter.patch(
  '/promotions/:id',
  validate({ params: idParamSchema, body: updatePromotionSchema }),
  promotionController.update,
);
adminRouter.delete(
  '/promotions/:id',
  validate({ params: idParamSchema }),
  promotionController.remove,
);
adminRouter.put(
  '/promotions/:id/image',
  validate({ params: idParamSchema }),
  promotionImageUpload,
  promotionController.setImage,
);

// Paiements.
adminRouter.get(
  '/payments',
  validate({ query: adminListPaymentsQuerySchema }),
  adminController.listPayments,
);
