# RafflesGo

RafflesGo is a full-stack volunteer coordination platform for conservation survey walks. It helps admins plan routes and recurring walks, lets volunteers sign up and track their assignments, and supports sighting capture and export for downstream analysis.

## Project Structure

```text
RafflesGo/
├── backend/          # Fastify + TypeScript API server
├── frontend/         # React + Vite + TypeScript SPA
├── openapi/          # Auto-generated OpenAPI spec
└── Makefile          # Root-level task runner
```

## Current Feature Set

- Google sign-in with role-aware admin and volunteer views
- Single and recurring walk creation
- Volunteer sign-up and "My Walks" tracking
- Designated submitter workflow for recording group sightings
- Offline sighting capture with automatic sync when connectivity returns
- Admin CSV export for survey data
- Admin user search plus deactivate/reactivate controls

## Prerequisites

Install these tools before getting started:

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) or `nvm install 18` |
| npm | 9+ | Comes with Node.js |
| jq | 1.6+ | `apt install jq` / `brew install jq` / `pacman -S jq` |
| make | any | Usually pre-installed on Linux/macOS |

Verify installation:

```bash
node --version
npm --version
jq --version
make --version
```

Firebase setup is required. Follow the shared setup document first:

[Firebase Setup](https://docs.google.com/document/d/1HxVM2J8SDZg8KkwlwWnVGyiYuarz6IhqiSVXtwJOz0I)

## Quick Start

Before running the app, complete the Firebase Console and service-account steps from the setup document. `make setup-all` helps generate the local files, but it does not replace those manual Firebase project steps.

```bash
# 1. Set up Firebase project, web app, and local env files
make setup-all PROJECT=YOUR_PROJECT_ID APP_NAME=YOUR_WEB_APP_NAME

# 2. Install all dependencies (backend, frontend, root)
make install

# 3. Generate the OpenAPI spec and typed frontend client
make generate

# 4. Start the backend
make dev-backend

# 5. In a second terminal, start the frontend
make dev-frontend
```

After both servers are running:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Swagger docs: `http://localhost:3000/docs`

## Required Local Configuration

`make setup-all` helps create the local config files, but there are still a few values to check manually:

### Frontend

- `frontend/.env.local` is generated from your Firebase web app config.

### Backend

- `backend/.env` is created from `backend/.env.example` during setup if it does not already exist.
- `backend/svc-account-key.json` must be downloaded from your Firebase project's service account page.
- `GOOGLE_APPLICATION_CREDENTIALS=./svc-account-key.json` must point to that file.
- `FIREBASE_STORAGE_BUCKET` must match your Firebase Storage bucket if you want sighting image uploads to work.

### Optional Email Notifications

These values are optional. Set them only if you want email-based reminders and notifications during local testing:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `APP_BASE_URL`

## Adding an Admin Email

For local evaluation, the simplest way to give someone admin access is to add their email to `adminEmails` in `backend/src/config.ts`.

Example:

```ts
adminEmails: [
  "your-email@example.com",
]
```

Then:

1. Restart the backend.
2. Sign in through the frontend with Google using that email.
3. The app will treat that account as an admin and unlock the admin UI and admin-only API endpoints.

This bootstrap list is the simplest local admin-management path for the application. The frontend does not expose role assignment UI.

If you also want to set the Firebase custom claim explicitly, the backend exposes `POST /api/users/change-role` with the body below after you authenticate:

```json
{
  "email": "your-email@example.com",
  "role": "admin"
}
```

After calling that endpoint, sign out and sign back in so Firebase refreshes the ID token.

## Minimal Walkthroughs

These are the shortest paths to the main implemented user flows after setup.

### 1. Create a Walk as an Admin

1. Add your email to `backend/src/config.ts` as described above.
2. Sign in at `http://localhost:5173`.
3. Open `Create Walk`.
4. Enter a name, date/time, max slots, and route waypoints.
5. Optionally enable recurring creation to batch-create weekly walks.
6. Submit and confirm the new walk appears in `Manage walks`.

### 2. Join a Walk as a Volunteer

1. Sign in with a non-admin Google account.
2. Open `Browse walks`.
3. Pick an upcoming walk and sign up.
4. Open `My Walks` to confirm the registration.
5. Open the walk detail page to view route details, participants, and sightings for that walk.

### 3. Record a Sighting and Test Offline Sync

1. Join a walk with a volunteer account that is the designated submitter.
2. Open that walk's detail page.
3. If the scheduled time has passed, start the walk from the detail page.
4. Record a sighting while online to confirm the normal flow.
5. In browser DevTools, switch the browser to offline mode.
6. Record or edit another sighting. The offline banner should indicate it was saved locally.
7. Restore connectivity and wait for the sync banner to confirm the pending sighting was uploaded.

### 4. Export Survey Data and Manage Users

1. Sign in with an admin account.
2. Open `Manage walks` and use the export action to download the current survey data as CSV.
3. Open `Manage users` to search accounts, inspect basic activity stats, and deactivate or reactivate volunteer accounts.

## Current Scope Notes

- The login UI currently supports Google sign-in.
- Admin role assignment is documented above through the backend bootstrap configuration, not through a frontend settings screen.
- The built-in export flow currently downloads CSV.
- Email notifications depend on the optional SMTP configuration.

## Development Workflow

The backend is the source of truth for the API contract. When backend routes or schemas change, regenerate the OpenAPI spec and frontend client before continuing work.

Typical flow:

1. Update or add backend route logic and schemas.
2. Run `make generate` from the repo root.
3. Start or restart the backend with `make dev-backend`.
4. Start or restart the frontend with `make dev-frontend`.
5. Run linting, type-checking, tests, and builds before finalizing changes.

Code-first API flow:

```text
Backend routes and schemas
  -> backend/src/generate-spec.ts
  -> openapi/spec.json
  -> frontend/src/api
  -> type-safe frontend API usage
```

## Available Commands

Use these commands from the repository root:

### Root

| Command | Description |
|---------|-------------|
| `make setup-all PROJECT=<project-id> APP_NAME=<app-name>` | Generate local config files and print the Firebase setup steps |
| `make install` | Install root, backend, and frontend dependencies |
| `make generate` | Regenerate the backend OpenAPI spec and frontend API client |
| `make dev-backend` | Start the backend development server |
| `make dev-frontend` | Start the frontend development server |
| `make lint` | Run ESLint in backend and frontend |
| `make typecheck` | Run TypeScript type-checking in backend and frontend |
| `make build` | Build backend and frontend |
| `make test` | Run backend and frontend unit tests |
| `make test-integration` | Run backend integration tests against the Firebase emulator |
| `make test-all` | Run unit and integration tests |
| `make emulator` | Start Firebase emulators from the backend project |

### Backend

Run these from `backend/` when working on the API directly:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Fastify backend with the local dev workflow |
| `npm run generate-spec` | Generate `openapi/spec.json` from backend schemas and routes |
| `npm run build` | Generate the spec and compile TypeScript |
| `npm run lint` | Run ESLint on backend source files |
| `npm run test` | Run backend unit tests |
| `npm run test:integration` | Run backend integration tests against the Firebase emulator |
| `npm run emulator` | Start the Firebase emulator suite |

### Frontend

Run these from `frontend/` when working on the client directly:

| Command | Description |
|---------|-------------|
| `npm run dev` | Generate the client from the current OpenAPI spec and start Vite |
| `npm run generate-api` | Regenerate the typed frontend API client |
| `npm run build` | Regenerate the client, type-check, and build the production bundle |
| `npm run lint` | Run ESLint on frontend source files |
| `npm run test` | Run frontend tests |
| `npm run preview` | Preview the production build locally |

## Architecture

### Backend

```text
backend/src/
├── app.ts             # App setup and route registration
├── index.ts           # Server entry point
├── generate-spec.ts   # OpenAPI spec generator
├── handlers/          # HTTP handlers
├── middleware/        # Auth and authorization middleware
├── modules/           # Walks, sightings, participation, export
├── repositories/      # Data access layer
├── routes/            # Route modules
└── services/          # Shared business logic
```

### Frontend

```text
frontend/src/
├── api/               # Auto-generated API client
├── components/        # Shared UI components
├── contexts/          # Auth and UI state providers
├── hooks/             # Custom hooks
├── lib/               # Firebase, API auth, offline sync helpers
├── pages/             # Route-level pages
├── test/              # Frontend test utilities
└── assets/            # Images and styles
```

## Git Hooks

Pre-commit hooks are managed by [Husky](https://typicode.github.io/husky/). After `make install`, commits run the repo quality checks automatically.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript |
| Backend | Fastify, Node.js, TypeScript |
| Auth / Data | Firebase Authentication, Firestore, Firebase Storage |
| API Spec | OpenAPI 3.0 (code-generated) |
| API Client | openapi-typescript-codegen |
| Testing | Vitest, React Testing Library |
