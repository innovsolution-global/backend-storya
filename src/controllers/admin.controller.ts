import type { Request } from 'express';

import { currentUser } from '../middlewares/auth';
import { adminService } from '../services/admin.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  ActivityQuery,
  AdminListPaymentsQuery,
  CreateAdminInput,
  TimeseriesQuery,
  UpdateSubscriptionInput,
} from '../validators/admin.validator';
import type { ListUsersQuery } from '../validators/user.validator';

const userId = (req: Request) => (req.params as { id: string }).id;

/** Back-office : statistiques et suivi de l'activité de l'app mobile. */
export const adminController = {
  overview: asyncHandler(async (_req, res) => {
    sendSuccess(res, await adminService.overview());
  }),

  timeseries: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.timeseries(req.query as unknown as TimeseriesQuery));
  }),

  activity: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.activity(req.query as unknown as ActivityQuery));
  }),

  system: asyncHandler(async (_req, res) => {
    sendSuccess(res, adminService.system());
  }),

  listUsers: asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listUsers(req.query as unknown as ListUsersQuery);
    sendSuccess(res, items, { meta });
  }),

  getUser: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.getUser(userId(req)));
  }),

  updateSubscription: asyncHandler(async (req, res) => {
    const input = req.body as UpdateSubscriptionInput;
    const user = await adminService.updateSubscription(userId(req), input);
    sendSuccess(res, user, {
      message: input.plan === 'premium' ? 'Premium activé.' : 'Premium retiré.',
    });
  }),

  listAdmins: asyncHandler(async (_req, res) => {
    sendSuccess(res, await adminService.listAdmins());
  }),

  createAdmin: asyncHandler(async (req, res) => {
    const admin = await adminService.createAdmin(req.body as CreateAdminInput);
    sendSuccess(res, admin, { message: 'Administrateur ajouté.', statusCode: 201 });
  }),

  removeAdmin: asyncHandler(async (req, res) => {
    await adminService.removeAdmin(currentUser(req).id, userId(req));
    sendSuccess(res, null, { message: 'Administrateur supprimé.' });
  }),

  listPayments: asyncHandler(async (req, res) => {
    const { items, meta, acceptedAmount } = await adminService.listPayments(
      req.query as unknown as AdminListPaymentsQuery,
    );
    sendSuccess(res, { items, acceptedAmount }, { meta });
  }),
};
