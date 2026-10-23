# RafflesGo Frontend

React + TypeScript single-page application for RafflesGo, with a generated API client from the backend OpenAPI spec.

## Directory Structure

| Directory | Description |
|-----------|-------------|
| `src/api/` | Auto-generated API client from OpenAPI spec (do not edit manually) |
| `src/assets/` | Static assets like images, fonts, and icons |
| `src/components/` | Shared UI pieces such as navigation, maps, dialogs, tags, and offline banners |
| `src/contexts/` | Global state for current user, theme, toasts, and view mode |
| `src/hooks/` | Custom React hooks for shared logic |
| `src/lib/` | Firebase setup, API auth wiring, offline storage, and sync utilities |
| `src/pages/` | Route-level pages such as login, dashboard, walks, walk detail, and admin user management |
| `src/styles/` | Shared style layers and design tokens used by newer UI pieces |
| `src/test/` | Test setup and utilities |

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `frontend/.env.local` from the example file:
   ```bash
   cp .env.example .env.local
   ```

   Fill in the Firebase web app values from your Firebase project. The Vite config validates these variables at startup.

3. Make sure the backend OpenAPI spec exists and the backend is available on `http://localhost:3000`.
   The frontend dev server proxies `/api` requests there.

4. Run in development mode (this auto-generates the API client first):
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

6. Run tests:
   ```bash
   npm run test
   ```

From the repository root, the equivalent commands are `make install`, `make dev-frontend`, and `make generate`.

## Current Route Surface

The app currently includes the following top-level routes:

- `/login`
- `/dashboard`
- `/walks`
- `/walks/create` (admin only)
- `/walks/:id`
- `/my-walks`
- `/admin/users` (admin only)

These pages cover the current volunteer and admin flows: authentication, walk browsing and sign-up, walk creation and management, sighting capture, offline sync, personal walk tracking, and admin user management.

## Using the Generated API Client

The API client is auto-generated from the backend's OpenAPI spec using `openapi-typescript-codegen`.

### Importing Services

```typescript
import { RafflesGoService } from './api';
```

### Making API Calls

The generated client provides type-safe methods for each endpoint:

```typescript
const me = await RafflesGoService.getCurrentUser();
console.log(me.role); // "user" or "admin"

const walks = await RafflesGoService.listWalks();
console.log(walks.length);

await RafflesGoService.signUpForWalk('walk-123');
```

### Using Types

You can also derive concrete response types directly from service methods:

```typescript
import { useState } from 'react';

type CurrentUser = Awaited<ReturnType<typeof RafflesGoService.getCurrentUser>>;

const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
```

### Error Handling

```typescript
import { RafflesGoService, ApiError } from './api';

try {
  const data = await RafflesGoService.listWalks();
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API Error: ${error.status} - ${error.message}`);
  }
}
```

The generated client is configured in `src/lib/api-auth.ts` so authenticated requests automatically include the Firebase ID token from the current user session.

## Testing

Tests use **Vitest** with **React Testing Library (RTL)** and **jsdom**.

### Running Tests

```bash
npm run test
```

### Current Test Setup

The current frontend tests live in `src/test/` and focus on:
- route protection and account-hydration behavior in `App.test.tsx`
- dashboard rendering behavior in `Dashboard.test.tsx`
- shared test wrappers in `test-utils.tsx`
- Firebase and browser API mocks in `setup.ts`

### Test Utilities

- `@testing-library/react` - Component rendering and queries
- `@testing-library/user-event` - User interaction simulation
- `@testing-library/jest-dom` - Custom DOM matchers (e.g., `toBeInTheDocument()`)
- `vitest` - Test runner with `vi.mock()` for mocking

## Regenerating the API Client

The API client is auto-generated on `dev` and `build`. To manually regenerate:

```bash
npm run generate-api
```

This command reads `../openapi/spec.json`, so regenerate the backend spec first if the API changed.

### What Gets Generated

```
src/api/
├── core/                 # Request utilities and OpenAPI client config
├── models/               # Generated TypeScript request / response models
├── services/             # Generated API methods on RafflesGoService
└── index.ts              # Re-exports everything
```

**Important:** Never edit files in `src/api/` manually - they will be overwritten.

## Styles

The current app primarily uses the global stylesheet imported in `src/main.tsx`:

```
src/assets/style/main.css
```

There is also a shared style layer in `src/styles/` for reusable tokens and base rules:

```
src/styles/
├── index.css       # Main entry point (imports all others)
├── variables.css   # CSS custom properties / design tokens
├── reset.css       # CSS reset / normalize
└── base.css        # Base element styles (buttons, links, etc.)
```

The current UI styling is mostly shared and global rather than heavily CSS-module-based. New component-specific styles can still use CSS Modules where that is the better fit.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install frontend dependencies |
| `npm run dev` | Regenerate API client and start the Vite dev server |
| `npm run build` | Regenerate API client and build the production bundle |
| `npm run preview` | Preview the built frontend locally |
| `npm run test` | Run Vitest |
| `npm run generate-api` | Regenerate the OpenAPI client from `../openapi/spec.json` |
| `npm run lint` | Run ESLint with auto-fix |

If you are working from the repository root, the root `Makefile` wraps the most common frontend tasks.
