import type { Role } from '../constants';
import { currentUser } from '../middlewares/auth';
import { userService } from '../services/user.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  ChangePasswordInput,
  ListUsersQuery,
  UpdateMeInput,
  UpdatePreferencesInput,
  UpdateSettingsInput,
} from '../validators/user.validator';

export const userController = {
  updateMe: asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(currentUser(req).id, req.body as UpdateMeInput);
    sendSuccess(res, user, { message: 'Profil mis à jour.' });
  }),

  updatePreferences: asyncHandler(async (req, res) => {
    const user = await userService.updatePreferences(
      currentUser(req).id,
      req.body as UpdatePreferencesInput,
    );
    sendSuccess(res, user, { message: 'Préférences mises à jour.' });
  }),

  getSettings: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.getSettings(currentUser(req).id));
  }),

  updateSettings: asyncHandler(async (req, res) => {
    const settings = await userService.updateSettings(
      currentUser(req).id,
      req.body as UpdateSettingsInput,
    );
    sendSuccess(res, settings, { message: 'Réglages mis à jour.' });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const result = await userService.changePassword(
      currentUser(req).id,
      req.body as ChangePasswordInput,
      {
        userAgent: req.get('user-agent'),
        ip: req.ip,
      },
    );
    sendSuccess(
      res,
      { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
      { message: 'Mot de passe modifié. Vos autres sessions ont été fermées.' },
    );
  }),

  updateAvatar: asyncHandler(async (req, res) => {
    const user = await userService.updateAvatar(currentUser(req).id, req.file);
    sendSuccess(res, user, { message: 'Photo de profil mise à jour.' });
  }),

  removeAvatar: asyncHandler(async (req, res) => {
    const user = await userService.removeAvatar(currentUser(req).id);
    sendSuccess(res, user, { message: 'Photo de profil supprimée.' });
  }),

  deleteMe: asyncHandler(async (req, res) => {
    await userService.deleteAccount(
      currentUser(req).id,
      (req.body as { password: string }).password,
    );
    sendSuccess(res, null, { message: 'Votre compte a été supprimé.' });
  }),

  list: asyncHandler(async (req, res) => {
    const { items, meta } = await userService.list(req.query as unknown as ListUsersQuery);
    sendSuccess(res, items, { meta });
  }),

  updateRole: asyncHandler(async (req, res) => {
    const user = await userService.updateRole(
      currentUser(req).id,
      req.params.id ?? '',
      (req.body as { role: Role }).role,
    );
    sendSuccess(res, user, { message: 'Rôle mis à jour.' });
  }),
};
