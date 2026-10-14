# Storya API

Backend REST de **Storya**, l'application Flutter (`../storya_app`) de **génération de vidéos par IA** :

- **Storytelling** : une histoire racontée en vidéo, avec voix off et musique ;
- **Cartoon** : des personnages animés pour les petits et les grands ;
- **Publicité** : une pub percutante pour une marque ou un produit.

Chaque vidéo dure **au maximum 2 min 30 (150 s)**. L'utilisateur peut joindre **jusqu'à 5 images** (personnages, produit, décor) dont l'IA se sert comme point de départ des scènes.

**Stack** : Node.js · Express 4 · TypeScript (strict) · PostgreSQL / Drizzle ORM · JWT · Zod · ffmpeg · Pino · Vitest + Supertest · Swagger.

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Comment une vidéo est générée](#comment-une-vidéo-est-générée)
3. [Mode démo (sans clé API)](#mode-démo-sans-clé-api)
4. [Endpoints](#endpoints)
5. [Scripts npm](#scripts-npm)
6. [Variables d'environnement](#variables-denvironnement)
7. [Architecture](#architecture)
8. [Choix techniques importants](#choix-techniques-importants)
9. [Intégration avec l'app Flutter](#intégration-avec-lapp-flutter)
10. [Tests](#tests)
11. [Déploiement](#déploiement)

---

## Démarrage rapide

Prérequis : **Node.js ≥ 20**. Rien d'autre : PostgreSQL (PGlite, embarqué) et ffmpeg sont fournis par npm pour le développement.

```bash
npm install
npm approve-scripts bcrypt esbuild ffmpeg-static   # npm ≥ 11
cp .env.example .env          # puis renseigner les secrets JWT
npm run dev:local             # PostgreSQL embarqué (données gardées dans .pg-data/) + API
```

API sur `http://localhost:4000`, documentation interactive sur **`/api/docs`**.

Avec un vrai PostgreSQL (≥ 13 ; Docker, Neon, Supabase, RDS…) : renseigner `DATABASE_URL` puis `npm run dev` (les migrations sont appliquées au démarrage hors production), ou `docker compose up --build`.

Après une modification de [`src/db/schema.ts`](src/db/schema.ts) : `npm run db:generate` crée la migration SQL dans `drizzle/` (à committer).

Générer un secret JWT :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Téléphone réel** : l'app doit appeler l'IP du PC sur le Wi-Fi (`APP_URL` et `API_BASE_URL`), pas `localhost`. Si Windows le demande, autoriser Node.js dans le pare-feu.

## Comment une vidéo est générée

Les modèles vidéo (Sora, Veo) ne produisent que des clips de 4 à 12 secondes. Une vidéo de 2 min 30 est donc **découpée en scènes d'environ 8 s**, puis remontée :

```
POST /videos (type, idée, style, durée, format, voix, musique, images…)  →  202 + vidéo « queued »
        │
        ▼  file de jobs en arrière-plan
 1. Script      GPT écrit le titre, la voix off et une scène par tranche de ~8 s
                (il « voit » les images de l'utilisateur pour les décrire fidèlement)
 2. Scènes      un clip par scène, 3 en parallèle :
                Sora (image de départ envoyée en fichier) → sinon Veo (image en URL publique)
 3. Son         voix off ElevenLabs (Féminine / Masculine / Enfant)
                + musique : piste de assets/music/ ou nappe synthétisée par ffmpeg
 4. Montage     ffmpeg : recadrage au format (9:16, 16:9, 1:1), assemblage,
                mixage voix + musique, coupe exacte à la durée, miniature
        │
        ▼
GET /videos/:id  →  status « completed », videoUrl (MP4 H.264/AAC), thumbnailUrl
```

L'app suit la progression avec `GET /videos/:id` toutes les 5 à 10 s : `progress.step` (1 à 4), `progress.ratio` (0 à 1), `progress.label` et `progress.message` (« Scène 3 sur 8 prête »).

En cas d'échec (crédit IA épuisé, fournisseur indisponible…), la vidéo passe en `failed` avec un message lisible, et `POST /videos/:id/retry` la relance avec les mêmes paramètres et les mêmes images.

## Mode démo (sans clé API)

Tant qu'`OPENAI_API_KEY` est vide (et hors production), la génération fonctionne **sans aucun service payant** : le parcours, la progression et le résultat sont identiques, mais :

- le **script** est construit localement à partir de l'idée ;
- chaque **scène** est une image de l'utilisateur animée (zoom, panoramique, fondus) ou, sans image, un clip libre de droit ;
- la **voix off** est une lecture LibriVox du domaine public ;
- la **musique** et le **montage** sont les mêmes qu'en mode réel.

C'est un vrai MP4 au bon format et à la bonne durée. Exemple mesuré : une pub de 20 s à partir d'une image, générée en 12 s.

`AI_DEMO_MODE=on|off|auto` force ou désactive ce mode ; il est refusé en production.

## Endpoints

Documentation interactive : **`/api/docs`** (Swagger UI). Spécification brute : `/api/docs.json`, importable dans Postman ou Insomnia.

| Ressource   | Routes |
| ----------- | ------ |
| Vidéos      | `POST /videos` (JSON ou multipart avec `images`) · `GET /videos` (`type`, `status`, pagination) · `GET /videos/quota` · `GET /videos/:id` · `PATCH /videos/:id` (titre) · `DELETE /videos/:id` · `POST /videos/:id/retry` · `GET /videos/explore` (vidéos publiées, `type`) · `POST /videos/:id/publish` · `DELETE /videos/:id/publish` |
| Référentiel | `GET /config` : types et styles, durées, formats, voix, musiques, publics, appels à l'action, limites d'images, offres, fonctionnalités actives · `GET /health` |
| Auth        | `POST /auth/register` · `login` · `refresh-token` · `logout` · `logout-all` · `forgot-password` · `reset-password` · `verify-email` · `resend-verification` · `GET /auth/me` |
| Utilisateur | `GET/PATCH/DELETE /users/me` · `PATCH /users/me/preferences` · `GET/PATCH /users/me/settings` · `PATCH /users/me/password` · `PUT/DELETE /users/me/avatar` |
| Paiements   | `GET /payments/offers` · `POST /payments/checkout` · `GET /payments` · `GET /payments/:transactionId` · `POST /payments/cinetpay/notify` |
| Admin       | `GET /admin/stats/overview` · `GET /admin/stats/timeseries?days=` · `GET /admin/activity` · `GET /admin/system` · `GET /admin/users` · `GET /admin/users/:id` · `PATCH /admin/users/:id/role` · `PATCH /admin/users/:id/subscription` · `GET /admin/videos` · `DELETE /admin/videos/:id` · `DELETE /admin/videos/:id/publish` · `GET /admin/payments` |

### Créer une vidéo

| Champ          | Valeurs | Défaut |
| -------------- | ------- | ------ |
| `type`         | `storytelling`, `cartoon`, `publicite` | **requis** |
| `prompt`       | l'idée (3 à 1500 caractères) | **requis** |
| `style`        | storytelling : Cinématique, Réaliste, Conte africain, Aquarelle, Noir & blanc · cartoon : Animation 3D, Dessin animé 2D, Anime, Pâte à modeler, Livre illustré · publicité : Dynamique, Premium, Humour, Émotion, Minimaliste | 1er style du type |
| `durationSeconds` | 10 à **150** | 90 / 60 / 30 selon le type |
| `aspectRatio`  | `9:16`, `16:9`, `1:1` | `16:9` pour cartoon, sinon `9:16` |
| `voice`        | `feminine`, `masculine`, `enfant`, `aucune` | `feminine` |
| `music`        | `douce`, `epique`, `joyeuse`, `aucune` | `douce` |
| `brand`        | marque (publicité : **requis**) | |
| `keyMessage`, `callToAction` | publicité | |
| `audience`     | publicité et cartoon | |
| `characters`   | cartoon : personnages récurrents | |
| `title`        | sinon « Pub &lt;marque&gt; » ou la première phrase de l'idée | |
| `images`       | fichiers JPEG/PNG/WebP, 5 max, 10 Mo chacun (multipart) | |

Format des réponses :

```jsonc
// Succès
{ "success": true, "message": "OK", "data": { … }, "meta": { "page": 1, "limit": 20, "total": 12, "totalPages": 1, "hasNextPage": false } }
// Erreur
{ "success": false, "message": "Données invalides.", "code": "BAD_REQUEST", "errors": [{ "field": "durationSeconds", "message": "Une vidéo ne peut pas dépasser 2 min 30 (150 secondes)." }] }
```

Codes notables : `401 TOKEN_EXPIRED` (appeler `/auth/refresh-token`), `409` (une vidéo déjà en cours), `423 ACCOUNT_LOCKED`, `429` (rate limit ou quota de vidéos), `503` (génération indisponible).

## Scripts npm

| Script                 | Rôle |
| ---------------------- | ---- |
| `npm run dev:local`    | API + PostgreSQL embarqué persistant (`.pg-data/`), sans rien installer |
| `npm run dev`          | API avec rechargement (PostgreSQL via `DATABASE_URL`) |
| `npm run build`        | Compilation TypeScript → `dist/` (nettoyé avant) |
| `npm start`            | Version compilée (production) |
| `npm test`             | Tests unitaires + intégration (PostgreSQL en mémoire via PGlite, ffmpeg simulé) |
| `npm run smoke:ffmpeg` | Vérifie le montage ffmpeg réel (image animée, clip, musique, mixage, miniature) |
| `npm run typecheck` · `lint` · `format` | TypeScript · ESLint · Prettier |
| `npm run seed`         | Compte admin (`SEED_ADMIN_*`) |
| `npm run db:generate`  | Migration SQL à partir des changements de `src/db/schema.ts` (drizzle-kit) |
| `npm run db:migrate`   | Applique les migrations en attente (production, après `build`) |

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example) et **validées au démarrage** (`src/config/env.ts`) : si une variable manque ou est invalide, le serveur affiche la liste des problèmes et s'arrête.

| Groupe    | Variables clés | Remarques |
| --------- | -------------- | --------- |
| Serveur   | `PORT`, `APP_URL`, `CLIENT_APP_URL`, `CORS_ORIGINS`, `TRUST_PROXY` | `APP_URL` sert aux liens des fichiers : IP du PC en dev sur téléphone |
| Base      | `DATABASE_URL` | `postgres://…`, ou `pglite:<dossier>` (PostgreSQL embarqué, dev uniquement) |
| Auth      | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 car.) | |
| Fichiers  | `STORAGE_DRIVER` (`local` \| `cloudinary`), `CLOUDINARY_*` | Cloudinary recommandé en production (et requis pour que Veo lise les images) |
| IA        | `OPENAI_API_KEY` (+ `_FALLBACK`), `SORA_MODEL`, `KIE_VEO_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_*` | |
| Génération | `AI_DEMO_MODE`, `MUSIC_DIR`, `FFMPEG_PATH`, `GENERATION_DAILY_LIMIT_FREE` / `_PREMIUM` | |
| Paiement  | `PAYMENT_PROVIDER` (`mock` \| `cinetpay`), `CINETPAY_*` | montants en GNF ; `mock` interdit en production |
| Emails, SMS | `SMTP_*`, `SMS_PROVIDER` | sans SMTP, les emails sont écrits dans les logs |

## Architecture

```
backend/
├── src/
│   ├── config/          env (Zod), database, logger (pino), cloudinary
│   ├── constants/       types de vidéo, styles, durées, formats, voix, musiques, offres Premium
│   ├── db/              schéma PostgreSQL (Drizzle), accès utilisateurs, helpers SQL
│   ├── models/          types User, Video (demande + progression + scènes + résultat), Payment… et règles métier
│   ├── validators/      schémas Zod par ressource
│   ├── middlewares/     auth (JWT + RBAC), validate, sanitize, rate limiters, upload, erreurs, logs HTTP
│   ├── services/
│   │   ├── video.service.ts           création, quotas, liste, relance, reprise au démarrage
│   │   ├── videoScript.service.ts     découpage en scènes, script GPT, script démo
│   │   ├── videoGenerator.service.ts  pipeline script → scènes → son → montage
│   │   └── auth, token, user, payment, email, media…
│   ├── controllers/     fins : lisent la requête, appellent un service, formatent la réponse
│   ├── routes/          un routeur par ressource, monté sous /api/v1
│   ├── integrations/
│   │   ├── ai/          OpenAI (GPT vision + Sora), Veo (kie.ai), ElevenLabs
│   │   ├── video/       VideoComposer → ffmpeg (recadrage, animation d'image, concat, mixage)
│   │   ├── storage/     StorageProvider → Local, Cloudinary
│   │   ├── payment/     PaymentProvider → CinetPay, Mock
│   │   ├── email/ · sms/
│   ├── docs/            spécification OpenAPI
│   ├── utils/           AppError, asyncHandler, réponses, pagination, JWT, file de jobs…
│   ├── app.ts · server.ts
├── assets/music/        musiques libres de droit (facultatif)
├── drizzle/             migrations SQL générées (appliquées par db:migrate / au démarrage en dev)
├── scripts/             dev-local.ts (PostgreSQL embarqué), composer-smoke.ts (test ffmpeg)
├── tests/               unit/ + integration/
└── uploads/             fichiers servis en mode STORAGE_DRIVER=local
```

## Choix techniques importants

**Génération par scènes.** La durée est découpée en scènes de 5 à 8 s dont la somme vaut exactement la durée demandée ; même si le modèle de texte renvoie un mauvais nombre de scènes, le découpage est imposé par le code. Les clips sont générés 3 par 3 en parallèle (une vidéo de 2 min 30 compte 19 scènes), puis normalisés (même format, 30 i/s, H.264) avant assemblage.

**Images de l'utilisateur.** Elles sont réparties sur toute la vidéo (`assignImages`), montrées à GPT (vision) pour que le script les décrive fidèlement, puis données au modèle vidéo comme image de départ de leur scène : en fichier recadré aux bonnes dimensions pour Sora, en URL pour Veo (qui doit pouvoir la télécharger : stockage Cloudinary en production). Leur contenu réel est vérifié (« magic bytes »), pas seulement leur type MIME.

**Formats.** Sora et Veo ne génèrent qu'en 9:16 ou 16:9 ; le format carré est généré en vertical puis recadré au montage.

**Musique.** Aucun service gratuit ne génère de musique : une piste de `assets/music/` est utilisée si elle existe, sinon ffmpeg synthétise une nappe selon l'humeur. Elle est atténuée sous la voix off.

**Génération asynchrone et robuste.** `POST /videos` répond `202` ; une seule vidéo à la fois par utilisateur, un quota journalier (3 en gratuit, 20 en Premium) et un rate limit par minute. La file est en mémoire (2 vidéos simultanées par instance) derrière l'interface `JobQueue`, remplaçable par BullMQ + Redis pour plusieurs instances. Au redémarrage, les vidéos interrompues passent en échec (relançables) et celles en attente repartent.

**Sécurité** (inchangée) : refresh tokens hashés avec rotation et détection de réutilisation, cookie `httpOnly` + corps pour le mobile (`X-Client-Type: mobile`), verrouillage après 5 échecs de connexion, validation Zod stricte, protection NoSQL/XSS, rôle relu à chaque requête.

**Paiement CinetPay** en **francs guinéens** (30 000 GNF/mois, 300 000 GNF/an) : le webhook déclenche seulement une vérification auprès de CinetPay, avec contrôle du montant, et l'abonnement n'est crédité qu'une fois.

### Langue et réglages

- **API bilingue** : l'en-tête `Accept-Language` (envoyé par l'app selon sa langue) choisit la langue des réponses : messages, erreurs de validation, libellés (`typeLabel`, `voiceLabel`…), étapes et messages de progression, offres Premium. Français par défaut ; la réponse porte `Content-Language`. Le code écrit ses messages en français ; ils sont traduits à la sortie par `src/i18n` (dictionnaire `en.ts`, gabarits `{param}` pour les messages variables comme « Scène 3 sur 8 prête »).
- **Réglages du compte** (`GET/PATCH /users/me/settings`, aussi renvoyés dans `user.settings`) : langue (`system` · `fr` · `en`), format par défaut, qualité d'export, réseau de téléchargement, notifications. Ils suivent l'utilisateur d'un appareil à l'autre.
- **Emails** dans la langue de l'utilisateur (réglage du compte, sinon langue de la requête) : confirmation, code de réinitialisation, Premium, et **« Votre vidéo est prête »**, envoyé à la fin de chaque génération tant que `notifications.videoReady` est activé.
- **Langue des vidéos** : le script, le titre et la voix off sont écrits dans la langue de l'idée saisie (langue de l'app si elle est ambiguë) ; le script du mode démo suit la langue de l'app.

## Back-office

Le back-office web (React) se trouve dans `../admin` et utilise les routes `/admin/*` ci-dessus
(réservées au rôle `admin`). Voir `../admin/README.md`.

## Intégration avec l'app Flutter

| Dans l'app (`video_providers.dart`, simulé) | Avec l'API |
| ------------------------------------------- | ---------- |
| `VideoProjectsNotifier.start(request)`      | `POST /videos` (multipart si images) puis polling de `GET /videos/:id` |
| `VideoType.publicite` / `.storytelling` / `.cartoon` | mêmes identifiants : `publicite`, `storytelling`, `cartoon` |
| `VideoFormat.portrait` / `paysage` / `carre` | `aspectRatio` : `9:16` / `16:9` / `1:1` |
| `voice` « Féminine », « Masculine », « Enfant », « Sans voix » | `feminine`, `masculine`, `enfant`, `aucune` |
| `music` « Douce », « Épique », « Joyeuse », « Sans musique » | `douce`, `epique`, `joyeuse`, `aucune` |
| `VideoProject.progress` / `step`            | `progress.ratio` / `progress.step` (4 étapes) |
| `VideoStatus.generating` / `ready` / `failed` | `queued`+`processing` / `completed` / `failed` |
| `videoUrl`                                  | `videoUrl` (+ `thumbnailUrl`) |
| `VideoCatalog.styles`, durées…              | `GET /config` (évite de dupliquer les listes) |
| Suppression                                 | `DELETE /videos/:id` |

L'inscription accepte encore le champ `format` envoyé par l'ancienne version de l'app (ignoré) ; les préférences sont désormais `genres` (thèmes) et `videoTypes`.

## Tests

```bash
npm test              # 78 tests
npm run smoke:ffmpeg  # montage réel avec ffmpeg
```

- **Vidéos** : génération complète avec fournisseurs simulés (découpage en scènes, images montrées au script et données à Sora, format carré, musique), échec puis relance, validation (durée > 150 s, style hors type, pub sans marque, plus de 5 images, faux fichier image), une génération à la fois, quota, liste/filtre/renommage/suppression, isolation entre utilisateurs, mode démo sans aucun appel IA.
- **Auth, sécurité, profil, paiements** : inscription avec téléphone, verrouillage anti brute-force, rotation des jetons, reset par code, injection NoSQL, XSS, RBAC, CORS, idempotence des paiements.
- **Langue et réglages** : réglages par défaut et mise à jour partielle, validation, réponses en anglais (`Accept-Language`), emails dans la langue du compte, email « vidéo prête » envoyé ou non selon la notification, consigne de langue donnée au script ; chaque message du code a sa traduction anglaise.
- **Unitaires** : découpage en scènes, répartition des images, titres, script démo, pagination, erreurs IA, signatures de fichiers.

## Déploiement

1. PostgreSQL managé (≥ 13 : Neon, Supabase, RDS…) et Cloudinary (`STORAGE_DRIVER=cloudinary`, indispensable pour que Veo lise les images).
2. Variables de production : `NODE_ENV=production`, `PAYMENT_PROVIDER=cinetpay`, `CORS_ORIGINS`, `APP_URL` en HTTPS, `TRUST_PROXY=1`, clés OpenAI / ElevenLabs (et Veo en secours).
3. `npm ci && npm run build && npm run db:migrate && npm start`, ou l'image Docker (`docker build -t storya-api .`, avec ffmpeg inclus).
4. Prévoir du CPU pour ffmpeg : le montage d'une vidéo de 2 min 30 prend quelques dizaines de secondes.
#   b a c k e n d - s t o r y a  
 