# Collaborative Board & DM Chat

Application web collaborative en temps reel avec authentification JWT, messagerie publique/privee, tableau pixel-art synchronise et inspecteur de trames WebSocket.

## Fonctionnalites

- Authentification locale par generation de jeton JWT.
- Choix du role utilisateur : `user` ou `admin`.
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

1. Saisissez un pseudonyme.
2. Choisissez un role :
   - `Utilisateur` pour discuter et dessiner.
   - `Admin` pour pouvoir vider la grille.
3. Choisissez une duree de validite du jeton.
4. Cliquez sur `Signer mon JWT & Connecter`.
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

### `POST /api/token`

Genere un jeton JWT et un profil utilisateur.

Exemple de body :

```json
{
  "username": "Alice",
  "role": "admin",
  "expireInSecs": 3600
}
```

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
- `SEND_PRIVATE_MESSAGE`
- `PRIVATE_MESSAGE`
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
