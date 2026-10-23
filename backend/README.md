# RafflesGo Backend

Fastify-based Node.js API server for RafflesGo, built with TypeScript, TypeBox schema validation, Firebase Admin, and code-first OpenAPI spec generation.

## Architecture

This backend uses a **feature-oriented layered architecture** for the main survey-walk domains:

```
Request -> Route -> Controller/Handler -> Service -> Repository -> Firebase / External Services
```

### Directory Structure

```
src/
├── app.ts                        # Fastify app setup and route registration
├── index.ts                      # Server entry point
├── config.ts                     # Application config (admin bootstrap emails, roles)
├── container.ts                  # Shared dependency injection container
├── generate-spec.ts              # OpenAPI generation entry point
│
├── modules/
│   ├── walks/                    # Walk CRUD and lifecycle transitions
│   ├── participation/            # Sign-up, withdrawal, participants, submitter transfer
│   ├── sightings/                # Walk-scoped sightings CRUD and submission
│   └── export/                   # Admin CSV export
│
├── routes/                       # Shared/system routes (health, hello, users, image uploads)
├── handlers/                     # Handlers for shared/system routes
├── services/                     # Cross-cutting services (email, reminders, authz, uploads)
├── repositories/                 # Shared data access (currently user repository)
├── middleware/                   # Auth and authorization middleware
├── plugins/                      # Fastify plugins
├── schemas/                      # Shared TypeBox schemas
├── lib/                          # Firebase Admin wiring and shared helpers
├── types/                        # Type utilities
├── entities/                     # Shared domain entities
└── test/                         # Unit and integration tests
```

The current codebase mixes two patterns:
- `src/modules/*` contains the main domain workflows for walks, participation, sightings, and export.
- `src/routes` + `src/handlers` contains shared endpoints such as health checks, current-user onboarding, and admin user management.

### Layer Responsibilities

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Route** | URL mapping, schema definition, middleware assignment | `POST /api/walks/:id/start` with `verifyToken` |
| **Controller / Handler** | Parse request, call service, format response | Extract `walkId`, call walk or user service |
| **Service** | Business logic, orchestration | Enforce participation rules, walk lifecycle, export formatting |
| **Repository** | Data access, Firebase calls | Firestore reads/writes, Auth user lookups |

### Plugins vs Middleware

| Type | When it runs | Purpose | Example |
|------|-------------|---------|---------|
| **Plugin** | Once at startup | Extend Fastify, decorate request/reply | `auth.plugin.ts` - declares `request.user` |
| **Middleware** | Every request (or per-route) | Request-level auth / authorization logic | `verifyToken` - validates Firebase ID tokens |

## Type Safety with Typebox

Schemas are defined using [Typebox](https://github.com/sinclairzx81/typebox) which provides:
- JSON Schema for Fastify validation and OpenAPI docs
- TypeScript types derived from the same schema

```typescript
// schemas/user.schema.ts
import { Type, Static } from '@sinclair/typebox';

export const UserSchema = Type.Object({
  uid: Type.String(),
  email: Type.Optional(Type.String()),
  role: RoleSchema,
});

// TypeScript type derived from schema - they can never diverge!
export type User = Static<typeof UserSchema>;
```

### Using Types in Handlers

```typescript
// handlers/users.handler.ts
import { FastifyRequestTypeBox, FastifyReplyTypeBox } from '../types/fastify';

const ListUsersSchema = {
  response: { 200: ListUsersResponseSchema },
};

export async function listUsersHandler(
  request: FastifyRequestTypeBox<typeof ListUsersSchema>,
  reply: FastifyReplyTypeBox<typeof ListUsersSchema>
) {
  // request.body, request.params, etc. are fully typed
  // return type is validated against schema
}
```

## Dependency Injection

Dependencies are constructed in `container.ts` and accessed via `getContainer()`:

```typescript
// container.ts
export function createContainer(): Container {
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  return { userRepository, userService };
}

// In handlers
const { userService } = getContainer();
```

Benefits:
- Easy to mock for testing
- Clear dependency graph
- No module-level side effects

## Authentication & Authorization

### Auth Flow

1. **Plugin** (`auth.plugin.ts`) - Declares `request.user` exists
2. **Middleware** (`auth.middleware.ts`) - Verifies token, populates `request.user`

### Available Middleware

| Middleware | Purpose |
|------------|---------|
| `verifyToken` | Validates Firebase JWT, populates `request.user` |
| `requireAdminEmail` | Allows users with admin claims or bootstrap admin emails |
| `requireRole(...)` | Generic role guard available for routes that need it |

### Usage in Routes

```typescript
fastify.get('/api/users', {
  schema: {
    security: [{ bearerAuth: [] }],  // For Swagger docs
    // ...
  },
  preHandler: [verifyToken, requireAdminEmail],
}, listUsersHandler);
```

### Admin Configuration

The `adminEmails` list in `config.ts` provides **bootstrap and fallback admin access** for routes protected by `requireAdminEmail`:

```typescript
export const config = {
  adminEmails: ['admin@example.com'],
  // ...
};
```

#### Why is this needed?

This solves the chicken-and-egg problem: *How does the first admin get admin role if only admins can assign roles?*

#### How it works

| Route type | Middleware | Access |
|------------|------------|--------|
| Admin routes guarded by `requireAdminEmail` | `requireAdminEmail` | Users with `role: 'admin'` in Firebase custom claims **OR** email in `adminEmails` |
| Non-admin authenticated routes | `verifyToken` | Any authenticated, non-deactivated user |

In the current codebase, `requireAdminEmail` is used by:
- admin user-management routes
- admin walk create / update / delete routes
- the CSV export route

#### Bootstrapping your first admin

1. Add your email to `adminEmails` in `config.ts`
2. Sign in to the app
3. Call `POST /api/users/change-role` with:
   ```json
   { "email": "your-email@example.com", "role": "admin" }
   ```
4. **Sign out and back in** to get a fresh token with the admin claim
5. Optionally remove your email from `adminEmails` once the claim has been set and verified

> **Important**: The frontend uses the Firebase role claim to decide whether to render admin-only views. After changing a role, the user must get a fresh token (sign out/in or wait for auto-refresh) before the admin UI appears.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `backend/.env` from the example file and fill in the required values:
   ```bash
   cp .env.example .env
   ```

   Required:
   - `GOOGLE_APPLICATION_CREDENTIALS=./svc-account-key.json`
   - `FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com`

   Optional:
   - SMTP settings for sign-up confirmations, walk reminders, and cancellation emails
   - `APP_BASE_URL` so email links point back to the frontend

3. Download your Firebase service account key and save it as:
   ```text
   backend/svc-account-key.json
   ```

4. Run in development mode:
   ```bash
   npm run dev
   ```

5. Open API documentation:
   ```
   http://localhost:3000/docs
   ```

From the repository root, the equivalent commands are `make install`, `make dev-backend`, and `make generate`.

## Extending the API

For new work, prefer these patterns:

1. Add new survey-walk domain features under `src/modules/<feature>/` with route, controller, service, and repository files together.
2. Add shared or system endpoints under `src/routes/` and `src/handlers/`.
3. Define request / response schemas with TypeBox so validation and OpenAPI stay in sync.
4. Register the route module in `src/app.ts`.
5. Regenerate the spec with:
   ```bash
   npm run generate-spec
   ```

## API Surface

The generated Swagger docs at `/docs` are the source of truth for request / response details. The main route groups are:

| Area | Representative endpoints |
|------|--------------------------|
| System | `GET /api/health`, `GET /api/hello/:name` |
| Users | `GET /api/users/me`, `GET /api/users`, `GET /api/users/stats`, `POST /api/users/change-role`, `PATCH /api/users/:uid/disabled` |
| Walks | `POST /api/walks`, `GET /api/walks`, `GET /api/walks/:id`, `PATCH /api/walks/:id`, `DELETE /api/walks/:id`, `POST /api/walks/:id/start`, `POST /api/walks/:id/end` |
| Participation | `POST /api/walks/:walkId/participate`, `DELETE /api/walks/:walkId/participate`, `GET /api/walks/:walkId/participants`, `PATCH /api/walks/:walkId/designated-submitter`, `GET /api/users/me/walks` |
| Sightings | `POST /api/walks/:walkId/sightings`, `GET /api/walks/:walkId/sightings`, `PATCH /api/walks/:walkId/sightings/:sightingId`, `DELETE /api/walks/:walkId/sightings/:sightingId`, `POST /api/walks/:walkId/sightings/:sightingId/submit` |
| Image uploads | `POST /api/walks/:walkId/sightings/:sightingId/upload-url`, `POST /api/walks/:walkId/sightings/:sightingId/images` |
| Export | `GET /api/admin/export` |

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install backend dependencies |
| `npm run dev` | Start the Fastify server with hot reload |
| `npm run build` | Generate OpenAPI spec and compile TypeScript |
| `npm run test` | Run backend unit tests |
| `npm run test:integration` | Run Firebase emulator-backed integration tests |
| `npm run generate-spec` | Regenerate `openapi/spec.json` |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run emulator` | Start Firebase emulators for local integration work |

If you are working from the repository root, the root `Makefile` wraps the most common backend tasks.

## Firestore Indexes

When your Firestore queries use multiple fields for filtering/ordering, you'll need composite indexes. Define them in `firestore.indexes.json` and deploy with:

```bash
make deploy-indexes PROJECT=<your-project-id>
```

If you run a query that requires an index you haven't deployed, Firestore will return an error with a direct link to create it in the Firebase Console.

See the [Firestore indexes documentation](https://firebase.google.com/docs/firestore/query-data/indexing) for details.
