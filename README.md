# Bingo Bailable

Bingo Bailable is a real-time multiplayer bingo game with music, challenges, voting, and organizer/TV views. The repository contains an Express + Socket.IO backend and a Vite + React frontend.

## Quick start

### 1. Configure the backend

```bash
cd backend
cp .env.example .env
npm ci
npm test -- --runInBand
npm run dev
```

The development backend listens on `http://localhost:5001` by default. Set `MONGODB_URI` and `JWT_SECRET` before using persistent rooms.

### 2. Configure the frontend

In another terminal:

```bash
cd bingo-react
cp .env.example .env
npm ci
npm run dev
```

Open the URL printed by Vite. Override `VITE_BACKEND_URL` when the backend runs on another host or port.

## Quality checks

Run these commands before opening a pull request:

```bash
cd backend && npm test -- --runInBand
cd ../bingo-react && npm test && npm run lint && npm run build
```

GitHub Actions runs the same backend and frontend checks for pushes to `main` and pull requests targeting `main`.

## Repository map

| Area | Purpose |
| --- | --- |
| `backend/routes` | HTTP API routes |
| `backend/services` | Reusable business logic |
| `backend/socket` | Socket.IO events and handlers |
| `backend/tests` | Backend unit and integration tests |
| `bingo-react/src/components` | Player, organizer, TV, and game UI |
| `bingo-react/src/context` | Game and socket state providers/hooks |
| `bingo-react/src/components/**/*.test.jsx` | Frontend component tests |
| `.github/workflows/ci.yml` | Automated quality checks |

## Current quality baseline

- Backend Jest suite: 41 tests passing.
- Frontend Vitest suite: 2 tests passing.
- Frontend ESLint: 0 errors and 0 warnings.
- Production frontend build: passing.

Known follow-up work includes increasing frontend coverage, reducing large production chunks, and reviewing npm audit findings before a production deployment.
