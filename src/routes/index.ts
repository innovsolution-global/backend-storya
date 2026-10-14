import { Router } from 'express';

import { metaController } from '../controllers/meta.controller';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { paymentRouter } from './payment.routes';
import { promotionRouter } from './promotion.routes';
import { userRouter } from './user.routes';
import { videoRouter } from './video.routes';

/** API v1 — monté sous /api/v1 dans app.ts. */
export const apiRouter = Router();

apiRouter.get('/config', metaController.config);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/videos', videoRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/promotions', promotionRouter);
apiRouter.use('/admin', adminRouter);
