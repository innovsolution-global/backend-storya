/**
 * Traductions anglaises des messages de l'API. Clé : le message français exact ;
 * les `{param}` marquent les parties variables (gabarits). `tests/unit/i18n.test.ts`
 * vérifie que les messages du code ont tous leur traduction.
 */
export const englishMessages: Readonly<Record<string, string>> = {
  // ─── Erreurs génériques ───────────────────────────────────────────────────
  'Authentification requise.': 'Authentication required.',
  'Accès refusé.': 'Access denied.',
  'Ressource introuvable.': 'Resource not found.',
  'Route introuvable : {method} {url}': 'Route not found: {method} {url}',
  'Données invalides.': 'Invalid data.',
  'Valeur invalide pour « {field} ».': 'Invalid value for “{field}”.',
  'Cette ressource existe déjà.': 'This resource already exists.',
  'Fichier trop volumineux.': 'File too large.',
  'Trop de fichiers envoyés.': 'Too many files sent.',
  'Fichier inattendu ou trop nombreux (champ « {field} »).':
    'Unexpected or too many files (field “{field}”).',
  'Upload refusé : {reason}': 'Upload refused: {reason}',
  'Corps de requête JSON invalide.': 'Invalid JSON request body.',
  'Corps de requête trop volumineux.': 'Request body too large.',
  'Erreur interne du serveur.': 'Internal server error.',
  'Origine non autorisée par CORS : {origin}': 'Origin not allowed by CORS: {origin}',
  'Champ de fichier inattendu : {field}.': 'Unexpected file field: {field}.',
  'Type de fichier non autorisé pour « {field} » ({type}).':
    'File type not allowed for “{field}” ({type}).',
  'Le fichier « {name} » n’est pas un fichier {kind} valide.':
    'The file “{name}” is not a valid {kind} file.',
  "Le fichier « {name} » n'est pas un fichier {kind} valide.":
    'The file “{name}” is not a valid {kind} file.',
  OK: 'OK',

  // Limites de débit
  'Trop de requêtes.': 'Too many requests.',
  'Trop de requêtes. Réessayez dans quelques minutes.':
    'Too many requests. Try again in a few minutes.',
  'Trop de tentatives. Réessayez dans quelques minutes.':
    'Too many attempts. Try again in a few minutes.',
  'Trop de demandes. Réessayez dans une heure.': 'Too many requests. Try again in an hour.',
  'Trop de générations lancées. Patientez une minute.':
    'Too many generations started. Wait a minute.',

  // ─── Authentification et session ──────────────────────────────────────────
  'Session expirée.': 'Session expired.',
  'Session expirée. Veuillez vous reconnecter.': 'Session expired. Please sign in again.',
  'Session renouvelée.': 'Session renewed.',
  'Jeton invalide.': 'Invalid token.',
  'Jeton requis.': 'Token required.',
  'Compte introuvable.': 'Account not found.',
  'Mot de passe modifié. Veuillez vous reconnecter.': 'Password changed. Please sign in again.',
  "Vous n'avez pas les droits nécessaires.": 'You don’t have the required permissions.',
  'Compte créé. Un email de confirmation vous a été envoyé.':
    'Account created. A confirmation email has been sent to you.',
  'Connexion réussie.': 'Signed in.',
  'Déconnexion réussie.': 'Signed out.',
  'Toutes vos sessions ont été fermées.': 'All your sessions have been closed.',
  'Utilisateur introuvable.': 'User not found.',
  'Si un compte existe avec cet email, un code de réinitialisation vient de vous être envoyé.':
    'If an account exists with this email, a reset code has just been sent to you.',
  'Mot de passe mis à jour. Vous pouvez vous reconnecter.':
    'Password updated. You can sign in again.',
  'Adresse email confirmée.': 'Email address confirmed.',
  'Email de confirmation renvoyé.': 'Confirmation email sent again.',
  'Email ou mot de passe incorrect.': 'Incorrect email or password.',
  'Un compte existe déjà avec ce numéro de téléphone.':
    'An account already exists with this phone number.',
  'Un compte existe déjà avec cet email.': 'An account already exists with this email.',
  'Code invalide ou expiré. Demandez un nouveau code.':
    'Invalid or expired code. Request a new code.',
  'Trop de tentatives échouées. Réessayez dans {n} minutes.':
    'Too many failed attempts. Try again in {n} minutes.',
  'Trop de tentatives échouées. Réessayez dans {n} minute.':
    'Too many failed attempts. Try again in {n} minute.',
  'Trop de codes erronés. Demandez un nouveau code.': 'Too many wrong codes. Request a new code.',
  'Code incorrect. Il vous reste {n} essais.': 'Incorrect code. You have {n} attempts left.',
  'Code incorrect. Il vous reste {n} essai.': 'Incorrect code. You have {n} attempt left.',
  'Lien de vérification invalide ou expiré.': 'Invalid or expired verification link.',
  'Votre email est déjà vérifié.': 'Your email is already verified.',

  // ─── Profil ───────────────────────────────────────────────────────────────
  'Profil mis à jour.': 'Profile updated.',
  'Préférences mises à jour.': 'Preferences updated.',
  'Réglages mis à jour.': 'Settings updated.',
  'Mot de passe modifié. Vos autres sessions ont été fermées.':
    'Password changed. Your other sessions have been closed.',
  'Photo de profil mise à jour.': 'Profile photo updated.',
  'Photo de profil supprimée.': 'Profile photo deleted.',
  'Votre compte a été supprimé.': 'Your account has been deleted.',
  'Rôle mis à jour.': 'Role updated.',
  'Mot de passe actuel incorrect.': 'Incorrect current password.',
  'Aucune image reçue (champ « avatar »).': 'No image received (“avatar” field).',
  'Mot de passe incorrect.': 'Incorrect password.',
  'Vous ne pouvez pas modifier votre propre rôle.': 'You can’t change your own role.',

  // ─── Validation ───────────────────────────────────────────────────────────
  'Indiquez votre prénom.': 'Enter your first name.',
  'Le prénom ne peut pas dépasser 60 caractères.':
    'The first name can’t be longer than 60 characters.',
  'Thème inconnu.': 'Unknown theme.',
  'Type de vidéo inconnu ({values}).': 'Unknown video type ({values}).',
  'Saisissez votre mot de passe.': 'Enter your password.',
  'Saisissez le code reçu par email.': 'Enter the code you received by email.',
  'Le code contient 6 chiffres.': 'The code has 6 digits.',
  'Identifiant requis.': 'ID required.',
  'Identifiant invalide.': 'Invalid ID.',
  'La page doit être ≥ 1.': 'The page must be ≥ 1.',
  'La limite doit être ≥ 1.': 'The limit must be ≥ 1.',
  'La limite ne peut pas dépasser {max}.': 'The limit can’t exceed {max}.',
  "L'email est requis.": 'Email is required.',
  "L'email est trop long.": 'The email is too long.',
  'Saisissez une adresse email valide.': 'Enter a valid email address.',
  'Le numéro de téléphone est requis.': 'Phone number is required.',
  'Saisissez un numéro de téléphone valide (8 à 15 chiffres).':
    'Enter a valid phone number (8 to 15 digits).',
  'Le mot de passe est requis.': 'Password is required.',
  'Le mot de passe doit contenir au moins 8 caractères.':
    'The password must be at least 8 characters long.',
  'Le mot de passe ne peut pas dépasser 128 caractères.':
    'The password can’t be longer than 128 characters.',
  'Le mot de passe doit contenir au moins une lettre.':
    'The password must contain at least one letter.',
  'Le mot de passe doit contenir au moins un chiffre.':
    'The password must contain at least one number.',
  'Offre inconnue ({values}).': 'Unknown plan ({values}).',
  'Identifiant de transaction invalide.': 'Invalid transaction ID.',
  'Aucune modification fournie.': 'No changes provided.',
  'Aucune préférence fournie.': 'No preferences provided.',
  'Aucun réglage fourni.': 'No settings provided.',
  'Mot de passe actuel requis.': 'Current password required.',
  "Le nouveau mot de passe doit être différent de l'actuel.":
    'The new password must be different from the current one.',
  'Confirmez avec votre mot de passe.': 'Confirm with your password.',
  'Langue inconnue ({values}).': 'Unknown language ({values}).',
  'Qualité inconnue ({values}).': 'Unknown quality ({values}).',
  'Réseau inconnu ({values}).': 'Unknown network ({values}).',
  '{label} : {max} caractères maximum.': '{label}: {max} characters max.',
  'Décrivez votre idée de vidéo.': 'Describe your video idea.',
  'Décrivez votre idée en quelques mots (3 caractères minimum).':
    'Describe your idea in a few words (3 characters minimum).',
  "L'idée ne peut pas dépasser 1500 caractères.": 'The idea can’t be longer than 1500 characters.',
  'Durée invalide.': 'Invalid length.',
  'La durée doit être un nombre entier de secondes.':
    'The length must be a whole number of seconds.',
  'Durée minimale : {n} secondes.': 'Minimum length: {n} seconds.',
  'Une vidéo ne peut pas dépasser 2 min 30 (150 secondes).':
    'A video can’t be longer than 2 min 30 (150 seconds).',
  'Format inconnu ({values}).': 'Unknown format ({values}).',
  'Voix inconnue ({values}).': 'Unknown voice ({values}).',
  'Musique inconnue ({values}).': 'Unknown music ({values}).',
  'Style inconnu pour ce type ({values}).': 'Unknown style for this type ({values}).',
  'Indiquez la marque ou le produit à mettre en avant.': 'Enter the brand or product to feature.',
  'Le titre ne peut pas être vide.': 'The title can’t be empty.',
  'Titre : 120 caractères maximum.': 'Title: 120 characters max.',
  'Identifiant utilisateur invalide.': 'Invalid user ID.',
  Marque: 'Brand',
  'Message clé': 'Key message',
  "Appel à l'action": 'Call to action',
  Public: 'Audience',
  Personnages: 'Characters',
  Titre: 'Title',

  // ─── Vidéos ───────────────────────────────────────────────────────────────
  'Génération de la vidéo lancée.': 'Video generation started.',
  'Vidéo renommée.': 'Video renamed.',
  'Vidéo supprimée.': 'Video deleted.',
  'Génération relancée.': 'Generation restarted.',
  'Vidéo introuvable.': 'Video not found.',
  'Vidéo supprimée pendant la génération.': 'Video deleted during generation.',
  'Insertion utilisateur sans résultat': 'User insert returned no row',
  'Insertion paiement sans résultat': 'Payment insert returned no row',
  'Insertion vidéo sans résultat': 'Video insert returned no row',
  'La génération de vidéos est temporairement indisponible.':
    'Video generation is temporarily unavailable.',
  'Une vidéo est déjà en cours de génération. Attendez la fin pour en lancer une autre.':
    'A video is already being generated. Wait for it to finish before starting another one.',
  'Quota atteint : {n} vidéos par jour. Passez Premium pour en créer davantage.':
    'Quota reached: {n} videos per day. Go Premium to create more.',
  'Quota atteint : {n} vidéo par jour. Passez Premium pour en créer davantage.':
    'Quota reached: {n} video per day. Go Premium to create more.',
  'La vidéo est en cours de génération : attendez la fin pour la supprimer.':
    'The video is being generated: wait for it to finish before deleting it.',
  'Seule une génération échouée peut être relancée.': 'Only a failed generation can be restarted.',
  'Une autre vidéo est déjà en cours de génération.': 'Another video is already being generated.',
  'Génération interrompue par un redémarrage du serveur. Relancez-la.':
    'Generation interrupted by a server restart. Start it again.',

  // Progression et résultat
  'Écriture du script': 'Writing the script',
  'Génération des scènes': 'Generating the scenes',
  'Génération des scènes ({n})': 'Generating the scenes ({n})',
  'Voix off': 'Voice-over',
  'Montage final': 'Final edit',
  'Scène {done} sur {total} prête': 'Scene {done} of {total} ready',
  'Votre vidéo est prête !': 'Your video is ready!',
  'Impossible de générer la vidéo. Réessayez.': 'Couldn’t generate the video. Try again.',
  'Nouvelle vidéo': 'New video',
  'Aucun fournisseur vidéo configuré.': 'No video provider configured.',
  "Veo n'a pas pu utiliser vos images : elles doivent être accessibles publiquement (stockage Cloudinary).":
    'Veo couldn’t use your images: they must be publicly accessible (Cloudinary storage).',
  'Mode démo : la voix off est une lecture du domaine public (LibriVox), pas votre script.':
    'Demo mode: the voice-over is a public-domain reading (LibriVox), not your script.',
  'Mode démo : voix off d’exemple indisponible (connexion).':
    'Demo mode: sample voice-over unavailable (connection).',
  'Voix off désactivée : aucune clé ElevenLabs configurée.':
    'Voice-over disabled: no ElevenLabs key configured.',
  'Voix off indisponible.': 'Voice-over unavailable.',

  // Fournisseurs d'IA (messages montrés quand une génération échoue)
  '{provider} : crédit ou quota épuisé côté fournisseur.':
    '{provider}: credit or quota exhausted with the provider.',
  '{provider} : trop de requêtes. Réessayez dans une minute.':
    '{provider}: too many requests. Try again in a minute.',
  '{provider} : clé API invalide ou accès refusé.': '{provider}: invalid API key or access denied.',
  '{provider} : erreur inattendue ({status}).': '{provider}: unexpected error ({status}).',
  '{provider} : aucune clé API configurée.': '{provider}: no API key configured.',
  'ElevenLabs : aucune clé API configurée.': 'ElevenLabs: no API key configured.',
  'ElevenLabs : texte de narration vide.': 'ElevenLabs: empty narration text.',
  'OpenAI texte : réponse vide.': 'OpenAI text: empty response.',
  'OpenAI texte : réponse JSON invalide.': 'OpenAI text: invalid JSON response.',
  'Sora : identifiant de vidéo absent.': 'Sora: missing video ID.',
  'Sora : délai dépassé (plus de {n} min).': 'Sora: timed out (more than {n} min).',
  'Sora a échoué : {reason}.': 'Sora failed: {reason}.',
  'Veo : aucune clé API configurée.': 'Veo: no API key configured.',
  'Veo : vidéo générée sans URL.': 'Veo: video generated without a URL.',
  'Veo : délai dépassé, la vidéo est toujours en cours.':
    'Veo: timed out, the video is still in progress.',
  'Veo : {reason}.': 'Veo: {reason}.',
  'erreur inconnue': 'unknown error',
  'génération échouée': 'generation failed',
  'statut illisible': 'unreadable status',
  'ffmpeg a échoué : {reason}': 'ffmpeg failed: {reason}',

  // Libellés
  Publicité: 'Ad',
  Féminine: 'Female',
  Masculine: 'Male',
  Enfant: 'Child',
  'Sans voix': 'No voice',
  Douce: 'Gentle',
  Épique: 'Epic',
  Joyeuse: 'Cheerful',
  'Sans musique': 'No music',
  Vertical: 'Vertical',
  Horizontal: 'Horizontal',
  Carré: 'Square',
  'Fil Instagram, Facebook': 'Instagram feed, Facebook',

  // ─── Paiements ────────────────────────────────────────────────────────────
  'Paiement initialisé.': 'Payment initialised.',
  'Paiement introuvable.': 'Payment not found.',
  "Le paiement n'a pas pu être initialisé. Réessayez dans un instant.":
    'The payment couldn’t be initialised. Try again in a moment.',
  'Premium mensuel': 'Monthly Premium',
  'Premium annuel': 'Yearly Premium',

  // ─── Emails ───────────────────────────────────────────────────────────────
  'Storya — Là où les histoires prennent vie.': 'Storya — Where stories come to life.',
  'Confirmez votre adresse email': 'Confirm your email address',
  'Bonjour {name},\n\nConfirmez votre adresse email : {link}\n\nCe lien expire dans 24 heures.':
    'Hello {name},\n\nConfirm your email address: {link}\n\nThis link expires in 24 hours.',
  'Bienvenue sur Storya, {name} !': 'Welcome to Storya, {name}!',
  'Confirmez votre adresse email pour sécuriser votre compte.':
    'Confirm your email address to secure your account.',
  'Confirmer mon email': 'Confirm my email',
  'Ce lien expire dans 24 heures.': 'This link expires in 24 hours.',
  '{code} est votre code Storya': '{code} is your Storya code',
  "Bonjour {name},\n\nVotre code de réinitialisation : {code}\n\nSaisissez-le dans l'application Storya pour choisir un nouveau mot de passe. Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.":
    'Hello {name},\n\nYour reset code: {code}\n\nEnter it in the Storya app to choose a new password. This code expires in 15 minutes. If you didn’t request this, ignore this email.',
  'Mot de passe oublié ?': 'Forgot your password?',
  'Bonjour {name}, voici votre code de réinitialisation :':
    'Hello {name}, here is your reset code:',
  "Saisissez-le dans l'application Storya pour choisir un nouveau mot de passe.":
    'Enter it in the Storya app to choose a new password.',
  "Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.":
    'This code expires in 15 minutes. If you didn’t request this, ignore this email.',
  'Votre abonnement Premium est actif': 'Your Premium subscription is active',
  "Bonjour {name},\n\nMerci ! Votre abonnement Storya Premium est actif jusqu'au {date}.":
    'Hello {name},\n\nThank you! Your Storya Premium subscription is active until {date}.',
  '★ Bienvenue chez les membres Premium': '★ Welcome to Premium',
  "Merci {name} ! Votre abonnement est actif jusqu'au <strong>{date}</strong>.":
    'Thank you {name}! Your subscription is active until <strong>{date}</strong>.',
  'Votre vidéo « {title} » est prête': 'Your video “{title}” is ready',
  "Bonjour {name},\n\nVotre vidéo « {title} » est prête. Ouvrez l'application Storya pour la regarder et la partager.\n\nVous pouvez désactiver ces emails dans Profil › Notifications.":
    'Hello {name},\n\nYour video “{title}” is ready. Open the Storya app to watch and share it.\n\nYou can turn off these emails in Profile › Notifications.',
  'Votre vidéo est prête 🎬': 'Your video is ready 🎬',
  "Bonjour {name}, votre vidéo <strong>« {title} »</strong> est prête. Ouvrez l'application Storya pour la regarder et la partager.":
    'Hello {name}, your video <strong>“{title}”</strong> is ready. Open the Storya app to watch and share it.',
  'Vous pouvez désactiver ces emails dans Profil › Notifications.':
    'You can turn off these emails in Profile › Notifications.',

  // ─── Script du mode démo ──────────────────────────────────────────────────
  'Pub {brand}': '{brand} ad',
  'Tout commence ainsi : {idea}.': 'It all begins like this: {idea}.',
  'Personne ne se doutait de ce qui allait suivre.': 'No one suspected what was about to happen.',
  'Le chemin se fait plus difficile, mais il faut avancer.':
    'The road gets harder, but there’s no turning back.',
  'Puis vient le moment de vérité.': 'Then comes the moment of truth.',
  'Et rien ne sera plus jamais comme avant.': 'And nothing will ever be the same again.',
  'Il était une fois… {idea}.': 'Once upon a time… {idea}.',
  'Nos amis se lancent dans une drôle d’aventure.': 'Our friends set off on a funny adventure.',
  'Oups ! Rien ne se passe comme prévu.': 'Oops! Nothing goes as planned.',
  'Mais ensemble, ils trouvent une idée géniale.':
    'But together, they come up with a brilliant idea.',
  'Et tout le monde éclate de rire.': 'And everyone bursts out laughing.',
  '{brand} : {idea}.': '{brand}: {idea}.',
  'Notre marque': 'Our brand',
  'Pensé pour vous simplifier la vie.': 'Designed to make your life easier.',
  'De la qualité, à chaque instant.': 'Quality, every moment.',
  'Essayez-le dès aujourd’hui.': 'Try it today.',
  '{brand}. {cta} !': '{brand}. {cta}!',
  'En savoir plus': 'Learn more',
  '{type} · {style} · {n} s — générée en mode démo.':
    '{type} · {style} · {n} s — generated in demo mode.',
  // Back-office.
  'Premium activé.': 'Premium activated.',
  'Premium retiré.': 'Premium removed.',
  'Nouvel utilisateur': 'New user',
  'OpenAI (clé de secours)': 'OpenAI (backup key)',
  'Administrateur ajouté.': 'Administrator added.',
  'Notifications push (Firebase)': 'Push notifications (Firebase)',
  'Notifications activées sur cet appareil.': 'Notifications enabled on this device.',
  'Notifications désactivées sur cet appareil.': 'Notifications disabled on this device.',
  'Notification envoyée.': 'Notification sent.',
  'Promotion créée.': 'Promotion created.',
  'Promotion mise à jour.': 'Promotion updated.',
  'Promotion supprimée.': 'Promotion deleted.',
  'Promotion introuvable.': 'Promotion not found.',
  'Image de la bannière mise à jour.': 'Banner image updated.',
  'Seule une bannière a une image.': 'Only a banner has an image.',
  'Choisissez une image.': 'Choose an image.',
  'Insertion promotion sans résultat': 'Promotion insert returned no row',
  'La fin doit être après le début.': 'The end must be after the start.',
  'Indiquez le pourcentage de réduction.': 'Enter the discount percentage.',
  'Indiquez la durée de l’essai.': 'Enter the trial length.',
  'Titre : 60 caractères maximum.': 'Title: 60 characters maximum.',
  'Texte : 160 caractères maximum.': 'Text: 160 characters maximum.',
  'Bouton : 24 caractères maximum.': 'Button: 24 characters maximum.',
  'Réduction : 5 % minimum.': 'Discount: 5% minimum.',
  'Réduction : 90 % maximum.': 'Discount: 90% maximum.',
  'Essai : 1 jour minimum.': 'Trial: 1 day minimum.',
  'Essai : 90 jours maximum.': 'Trial: 90 days maximum.',
  'Date invalide.': 'Invalid date.',
  'Notification (non envoyée : Firebase absent)': 'Notification (not sent: Firebase missing)',
  'Jeton de notification invalide.': 'Invalid notification token.',
  'Indiquez un titre.': 'Enter a title.',
  'Titre : 65 caractères maximum.': 'Title: 65 characters maximum.',
  'Indiquez un message.': 'Enter a message.',
  'Message : 240 caractères maximum.': 'Message: 240 characters maximum.',
  'Votre vidéo est prête': 'Your video is ready',
  '« {title} » est prête : touchez pour la regarder.': '“{title}” is ready: tap to watch it.',
  'La génération a échoué': 'Generation failed',
  '« {title} » n’a pas pu être générée. Touchez pour réessayer.':
    '“{title}” could not be generated. Tap to try again.',
  'Premium vous est offert': 'Premium is on us',
  'Bienvenue dans Storya Premium': 'Welcome to Storya Premium',
  'Profitez de plus de vidéos chaque jour, jusqu’au {date}.':
    'Enjoy more videos every day, until {date}.',
  'Vidéo retirée d’Explorer': 'Video removed from Explore',
  '« {title} » n’est plus visible dans Explorer. Elle reste dans vos vidéos.':
    '“{title}” is no longer visible in Explore. It stays in your videos.',
  'Seule une vidéo terminée peut être publiée.': 'Only a finished video can be published.',
  'Vidéo publiée dans Explorer.': 'Video published to Explore.',
  'Vidéo retirée d’Explorer.': 'Video removed from Explore.',
  'Administrateur supprimé.': 'Administrator deleted.',
  'Insertion administrateur sans résultat': 'Administrator insert returned no row',
  'Vous ne pouvez pas supprimer votre propre compte administrateur.':
    'You cannot delete your own administrator account.',
  'Administrateur introuvable.': 'Administrator not found.',
  'Les administrateurs ont Premium d’office : aucun paiement n’est nécessaire.':
    'Administrators get Premium automatically: no payment needed.',
};
