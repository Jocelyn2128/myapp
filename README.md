# Collaborative Board & DM Chat

Application web collaborative en temps reel avec authentification JWT, messagerie publique/privee, tableau pixel-art synchronise et inspecteur de trames WebSocket.

## Fonctionnalites

- Authentification locale par generation de jeton JWT.
- Inscription utilisateur avec validation obligatoire par un administrateur.
- Connexion refusee tant que le compte n'est pas approuve.
- Panneau administrateur pour valider ou refuser les comptes en attente.
- Expiration configurable du jeton pour tester la deconnexion.
- Connexion temps reel via WebSocket.
- Salon de discussion public.
- Messages prives entre utilisateurs connectes.
- Tableau pixel-art collaboratif 20 x 20.
- Palette de couleurs, pinceau et gomme.
- Reinitialisation de la grille reservee aux administrateurs.

## Stack technique

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Express
- WebSocket avec `ws`
- JWT signe avec `crypto`
- `tsx` pour le serveur de developpement

## Prerequis

Installez Node.js puis verifiez :

```bash
node -v
npm -v
```

## Installation

Clonez ou ouvrez le projet, puis installez les dependances :

```bash
npm install
```

Copiez le fichier d'environnement :

```bash
cp .env.example .env.local
```

Exemple de configuration locale :

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="http://localhost:3000"
JWT_SECRET="change-me-in-production"
ADMIN_PASSWORD="admin123"
```

Note : `GEMINI_API_KEY` est present dans le template AI Studio, mais cette version du projet utilise surtout le serveur Express/WebSocket local.

## Demarrage en developpement

Lancez le serveur :

```bash
npm run dev
```

Ouvrez ensuite :

```text
http://localhost:3000
```

Le serveur Express expose l'API et les WebSockets, puis Vite sert l'application React en middleware.

## Utilisation

1. Creez un compte depuis l'onglet `Inscription`.
2. Connectez-vous avec le compte administrateur par defaut :
   - pseudonyme : `admin`
   - mot de passe : valeur de `ADMIN_PASSWORD`, ou `admin123` par defaut
3. Dans le panneau `Validation des inscriptions`, approuvez le nouveau compte.
4. Connectez-vous avec le compte approuve.
5. Ouvrez un deuxieme onglet pour tester la collaboration temps reel, les messages prives et les mises a jour du tableau.

## Scripts disponibles

```bash
npm run dev
```

Lance le serveur de developpement avec `tsx server.ts`.

```bash
npm run build
```

Compile l'application Vite et bundle le serveur dans `dist/server.cjs`.

```bash
npm run start
```

Lance la version build depuis `dist/server.cjs`.

```bash
npm run lint
```

Execute la verification TypeScript avec `tsc --noEmit`.

```bash
npm run clean
```

Supprime les fichiers generes `dist` et `server.js`.

## Structure du projet

```text
.
├── server.ts
├── src
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── types.ts
│   └── components
│       ├── MessageBoard.tsx
│       └── PixelBoard.tsx
├── index.html
├── vite.config.ts
├── package.json
└── .env.example
```

## API et WebSocket

### `POST /api/register`

Cree un compte utilisateur en attente de validation.

Exemple de body :

```json
{
  "username": "Alice",
  "password": "secret"
}
```

### `POST /api/login`

Connecte un compte deja approuve et genere un jeton JWT.

Exemple de body :

```json
{
  "username": "Alice",
  "password": "secret",
  "expireInSecs": 3600
}
```

### `GET /api/admin/pending-users`

Liste les comptes en attente. Requiert un token administrateur.

### `POST /api/admin/users/:userId/approve`

Valide un compte en attente. Requiert un token administrateur.

### `POST /api/admin/users/:userId/reject`

Refuse et supprime un compte en attente. Requiert un token administrateur.

### WebSocket

La connexion WebSocket se fait sur le meme host avec le jeton en query string :

```text
ws://localhost:3000?token=<JWT>
```

Evenements principaux :

- `INITIAL_STATE`
- `PING`
- `PONG`
- `USER_JOINED`
- `USER_LEFT`
- `SEND_PUBLIC_MESSAGE`
- `PUBLIC_MESSAGE`
- `EDIT_PUBLIC_MESSAGE`
- `DELETE_PUBLIC_MESSAGE`
- `PUBLIC_MESSAGE_UPDATED`
- `SEND_PRIVATE_MESSAGE`
- `PRIVATE_MESSAGE`
- `EDIT_PRIVATE_MESSAGE`
- `DELETE_PRIVATE_MESSAGE`
- `PRIVATE_MESSAGE_UPDATED`
- `REQUEST_PRIVATE_HISTORY`
- `PRIVATE_HISTORY`
- `SEND_PIXEL_UPDATE`
- `PIXEL_UPDATED`
- `CLEAR_GRID`
- `GRID_CLEARED`
- `ERROR`

## Depannage

### Port 3000 deja utilise

Si vous voyez :

```text
Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
```

Cherchez le processus :

```bash
lsof -i :3000
```

Puis arretez le processus Node qui ecoute sur ce port :

```bash
kill -9 <PID>
```

Relancez ensuite :

```bash
npm run dev
```

### Modifier le port

Actuellement, le port est fixe dans `server.ts` :

```ts
const PORT = 3000;
```

Pour autoriser un port configurable :

```ts
const PORT = Number(process.env.PORT) || 3000;
```

Vous pourrez ensuite lancer :

```bash
PORT=3001 npm run dev
```

## Build production

Construisez le projet :

```bash
npm run build
```

Puis lancez :

```bash
npm run start
```

## Notes de securite

- Changez `JWT_SECRET` en production.
- Ne publiez jamais vos fichiers `.env.local`.
- Les donnees de chat et de grille sont stockees en memoire : elles sont perdues au redemarrage du serveur.
- Les messages prives sont limites au fonctionnement applicatif local ; ils ne sont pas chiffres de bout en bout.
