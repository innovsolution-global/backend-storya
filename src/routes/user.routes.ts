import { Router } from 'express';

import { authController } from '../controllers/auth.controller';
import { notificationController } from '../controllers/notification.controller';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth';
import { avatarUpload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { idParamSchema, paginationSchema } from '../validators/common.validator';
import {
  changePasswordSchema,
  deleteAccountSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
  updateMeSchema,
  updatePreferencesSchema,
  updateSettingsSchema,
} from '../validators/user.validator';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', authController.me);
userRouter.patch('/me', validate({ body: updateMeSchema }), userController.updateMe);
userRouter.delete('/me', validate({ body: deleteAccountSchema }), userController.deleteMe);
userRouter.patch(
  '/me/preferences',
  validate({ body: updatePreferencesSchema }),
  userController.updatePreferences,
);
userRouter.get('/me/settings', userController.getSettings);
userRouter.patch(
  '/me/settings',
  validate({ body: updateSettingsSchema }),
  userController.updateSettings,
);
userRouter.patch(
  '/me/password',
  validate({ body: changePasswordSchema }),
  userController.changePassword,
);
userRouter.put('/me/avatar', avatarUpload, userController.updateAvatar);
userRouter.delete('/me/avatar', userController.removeAvatar);

// Notifications push : le téléphone s'enregistre à la connexion, se retire à la déconnexion.
userRouter.post(
  '/me/devices',
  validate({ body: registerDeviceSchema }),
  notificationController.registerDevice,
);
userRouter.delete(
  '/me/devices',
  validate({ body: unregisterDeviceSchema }),
  notificationController.unregisterDevice,
);

// Boîte de réception des notifications.
userRouter.get(
  '/me/notifications',
  validate({ query: paginationSchema }),
  notificationController.inbox,
);
userRouter.post('/me/notifications/read', notificationController.markRead);
userRouter.post(
  '/me/notifications/:id/read',
  validate({ params: idParamSchema }),
  notificationController.markRead,
);
