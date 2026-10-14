import { currentUser } from '../middlewares/auth';
import { notificationService } from '../services/notification.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { SendCampaignInput } from '../validators/admin.validator';
import type { RegisterDeviceInput } from '../validators/user.validator';

export const notificationController = {
  registerDevice: asyncHandler(async (req, res) => {
    await notificationService.registerDevice(currentUser(req).id, req.body as RegisterDeviceInput);
    sendSuccess(res, null, { message: 'Notifications activées sur cet appareil.' });
  }),

  unregisterDevice: asyncHandler(async (req, res) => {
    await notificationService.unregisterDevice(
      currentUser(req).id,
      (req.body as { token: string }).token,
    );
    sendSuccess(res, null, { message: 'Notifications désactivées sur cet appareil.' });
  }),

  inbox: asyncHandler(async (req, res) => {
    const { items, unread, meta } = await notificationService.inbox(
      currentUser(req).id,
      req.query as unknown as { page: number; limit: number },
    );
    sendSuccess(res, { items, unread }, { meta });
  }),

  markRead: asyncHandler(async (req, res) => {
    const id = (req.params as { id?: string }).id;
    await notificationService.markRead(currentUser(req).id, id);
    sendSuccess(res, null);
  }),

  listCampaigns: asyncHandler(async (_req, res) => {
    sendSuccess(res, await notificationService.campaigns());
  }),

  sendCampaign: asyncHandler(async (req, res) => {
    const campaign = await notificationService.sendCampaign(
      currentUser(req).id,
      req.body as SendCampaignInput,
    );
    sendSuccess(res, campaign, { message: 'Notification envoyée.', statusCode: 201 });
  }),
};
