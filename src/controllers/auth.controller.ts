import type { CookieOptions, Request, Response } from 'express';

import { env, isProduction } from '../config/env';
import { REFRESH_COOKIE_NAME } from '../constants';
import { findUserById } from '../db/users';
import { currentUser } from '../middlewares/auth';
import type { AuthResult } from '../services/auth.service';
import { authService } from '../services/auth.service';
import type { ClientMeta } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { toUserDto } from '../utils/serializers';
import type { LoginInput, RegisterInput, ResetPasswordInput } from '../validators/auth.validator';

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/v1/auth',
    domain: env.COOKIE_DOMAIN,
    ...(expires ? { expires } : {}),
  };
}

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

/** L'app mobile ne gère pas les cookies : elle reçoit le refresh token dans le corps. */
function isMobileClient(req: Request): boolean {
  return req.get('x-client-type')?.toLowerCase() === 'mobile';
}

function readRefreshToken(req: Request): string | undefined {
  const fromCookie = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  return fromCookie ?? fromBody;
}

function sendSession(
  req: Request,
  res: Response,
  result: AuthResult,
  message: string,
  statusCode = 200,
): Response {
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(result.refreshTokenExpiresAt));
  return sendSuccess(
    res,
    {
      user: toUserDto(result.user),
      accessToken: result.accessToken,
      ...(isMobileClient(req)
        ? { refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt }
        : {}),
    },
    { message, statusCode },
  );
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body as RegisterInput, clientMeta(req));
    sendSession(req, res, result, 'Compte créé. Un email de confirmation vous a été envoyé.', 201);
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body as LoginInput, clientMeta(req));
    sendSession(req, res, result, 'Connexion réussie.');
  }),

  refresh: asyncHandler(async (req, res) => {
    const token = readRefreshToken(req);
    if (!token) throw AppError.unauthorized('Session expirée. Veuillez vous reconnecter.');
    const result = await authService.refresh(token, clientMeta(req));
    sendSession(req, res, result, 'Session renouvelée.');
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(readRefreshToken(req));
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
    sendSuccess(res, null, { message: 'Déconnexion réussie.' });
  }),

  logoutAll: asyncHandler(async (req, res) => {
    await authService.logoutAll(currentUser(req).id);
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
    sendSuccess(res, null, { message: 'Toutes vos sessions ont été fermées.' });
  }),

  me: asyncHandler(async (req, res) => {
    const user = await findUserById(currentUser(req).id);
    if (!user) throw AppError.notFound('Utilisateur introuvable.');
    sendSuccess(res, toUserDto(user));
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    await authService.forgotPassword((req.body as { email: string }).email);
    sendSuccess(res, null, {
      message:
        'Si un compte existe avec cet email, un code de réinitialisation vient de vous être envoyé.',
    });
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body as ResetPasswordInput);
    sendSuccess(res, null, { message: 'Mot de passe mis à jour. Vous pouvez vous reconnecter.' });
  }),

  verifyEmail: asyncHandler(async (req, res) => {
    await authService.verifyEmail((req.body as { token: string }).token);
    sendSuccess(res, null, { message: 'Adresse email confirmée.' });
  }),

  resendVerification: asyncHandler(async (req, res) => {
    await authService.resendVerification(currentUser(req).id);
    sendSuccess(res, null, { message: 'Email de confirmation renvoyé.' });
  }),
};
