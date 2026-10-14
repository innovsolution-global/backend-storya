import { Router } from 'express';

import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { authLimiter, sensitiveLimiter } from '../middlewares/rateLimiters';
import { validate } from '../middlewares/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register,
);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh-token', validate({ body: refreshSchema }), authController.refresh);
authRouter.post('/logout', validate({ body: refreshSchema }), authController.logout);
authRouter.post('/logout-all', authenticate, authController.logoutAll);
authRouter.get('/me', authenticate, authController.me);

authRouter.post(
  '/forgot-password',
  sensitiveLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  sensitiveLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
authRouter.post('/verify-email', validate({ body: verifyEmailSchema }), authController.verifyEmail);
authRouter.post(
  '/resend-verification',
  authenticate,
  sensitiveLimiter,
  authController.resendVerification,
);
