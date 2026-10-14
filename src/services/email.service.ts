import { env } from '../config/env';
import { logger } from '../config/logger';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { getEmailProvider } from '../integrations/email';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appLink(path: string, token: string): string {
  const base = env.CLIENT_APP_URL.endsWith('/') ? env.CLIENT_APP_URL : `${env.CLIENT_APP_URL}/`;
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

function layout(lang: Lang, title: string, body: string): string {
  return `<!doctype html><html lang="${lang}"><body style="font-family:Arial,sans-serif;background:#0f0d1a;color:#f4f1ff;padding:24px">
<div style="max-width:520px;margin:auto;background:#1b1830;border-radius:16px;padding:32px">
<h1 style="font-size:22px;margin-top:0">${title}</h1>${body}
<p style="color:#9a94b8;font-size:12px;margin-top:32px">${t('Storya — Là où les histoires prennent vie.', {}, lang)}</p>
</div></body></html>`;
}

/**
 * Les emails ne doivent jamais faire échouer la requête qui les déclenche :
 * en cas d'erreur du fournisseur, on journalise et on continue.
 */
async function safeSend(to: string, subject: string, text: string, html: string): Promise<void> {
  try {
    await getEmailProvider().send({ to, subject, text, html });
  } catch (error) {
    logger.error({ err: error, subject }, "Échec d'envoi d'email");
  }
}

/** Chaque email est écrit dans la langue [lang] de son destinataire (français par défaut). */
export const emailService = {
  async sendVerificationEmail(
    to: string,
    firstName: string,
    token: string,
    lang: Lang = 'fr',
  ): Promise<void> {
    const link = appLink('verify-email', token);
    const name = escapeHtml(firstName);
    await safeSend(
      to,
      t('Confirmez votre adresse email', {}, lang),
      t(
        'Bonjour {name},\n\nConfirmez votre adresse email : {link}\n\nCe lien expire dans 24 heures.',
        { name: firstName, link },
        lang,
      ),
      layout(
        lang,
        t('Bienvenue sur Storya, {name} !', { name }, lang),
        `<p>${t('Confirmez votre adresse email pour sécuriser votre compte.', {}, lang)}</p>
<p><a href="${link}" style="background:#7c5cff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">${t('Confirmer mon email', {}, lang)}</a></p>
<p style="color:#9a94b8">${t('Ce lien expire dans 24 heures.', {}, lang)}</p>`,
      ),
    );
  },

  /** Le code se saisit dans l'app (pas de lien : Gmail bloque souvent les liens storya://). */
  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    code: string,
    lang: Lang = 'fr',
  ): Promise<void> {
    const name = escapeHtml(firstName);
    await safeSend(
      to,
      t('{code} est votre code Storya', { code }, lang),
      t(
        "Bonjour {name},\n\nVotre code de réinitialisation : {code}\n\nSaisissez-le dans l'application Storya pour choisir un nouveau mot de passe. Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
        { name: firstName, code },
        lang,
      ),
      layout(
        lang,
        t('Mot de passe oublié ?', {}, lang),
        `<p>${t('Bonjour {name}, voici votre code de réinitialisation :', { name }, lang)}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#0f0d1a;border-radius:12px;padding:16px;text-align:center">${code}</p>
<p>${t("Saisissez-le dans l'application Storya pour choisir un nouveau mot de passe.", {}, lang)}</p>
<p style="color:#9a94b8">${t("Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.", {}, lang)}</p>`,
      ),
    );
  },

  async sendPremiumConfirmation(
    to: string,
    firstName: string,
    expiresAt: Date,
    lang: Lang = 'fr',
  ): Promise<void> {
    const until = expiresAt.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    await safeSend(
      to,
      t('Votre abonnement Premium est actif', {}, lang),
      t(
        "Bonjour {name},\n\nMerci ! Votre abonnement Storya Premium est actif jusqu'au {date}.",
        { name: firstName, date: until },
        lang,
      ),
      layout(
        lang,
        t('★ Bienvenue chez les membres Premium', {}, lang),
        `<p>${t("Merci {name} ! Votre abonnement est actif jusqu'au <strong>{date}</strong>.", { name: escapeHtml(firstName), date: until }, lang)}</p>`,
      ),
    );
  },

  /** Envoyé à la fin d'une génération si la notification « Vidéo prête » est activée. */
  async sendVideoReady(
    to: string,
    firstName: string,
    title: string,
    lang: Lang = 'fr',
  ): Promise<void> {
    await safeSend(
      to,
      t('Votre vidéo « {title} » est prête', { title }, lang),
      t(
        "Bonjour {name},\n\nVotre vidéo « {title} » est prête. Ouvrez l'application Storya pour la regarder et la partager.\n\nVous pouvez désactiver ces emails dans Profil › Notifications.",
        { name: firstName, title },
        lang,
      ),
      layout(
        lang,
        t('Votre vidéo est prête 🎬', {}, lang),
        `<p>${t("Bonjour {name}, votre vidéo <strong>« {title} »</strong> est prête. Ouvrez l'application Storya pour la regarder et la partager.", { name: escapeHtml(firstName), title: escapeHtml(title) }, lang)}</p>
<p style="color:#9a94b8">${t('Vous pouvez désactiver ces emails dans Profil › Notifications.', {}, lang)}</p>`,
      ),
    );
  },
};
