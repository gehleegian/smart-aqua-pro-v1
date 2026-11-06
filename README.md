# SmartAqua Pro

IoT-based aquarium monitoring and automation system built with Next.js, React, TypeScript, Tailwind CSS, and Firebase.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Firebase values. For a local
   Firebase web app, the public config values are available in Firebase Console
   under Project settings → General → Your apps. The Next.js app uses the
   `NEXT_PUBLIC_FIREBASE_*` names shown in `.env.example`. Existing local `.env`
   files using the old `VITE_FIREBASE_*` names are supported as a migration
   fallback; new setups should use the Next.js names.
3. Start the app: `npm run dev`, then open http://localhost:3000

## Scripts

- `npm run dev`: start the development server
- `npm run build`: create a production build
- `npm run start`: run the production build
- `npm run lint`: run ESLint
