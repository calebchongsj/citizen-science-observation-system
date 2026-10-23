# Core Concepts in RafflesGo

This document outlines the key software engineering and web development concepts introduced in this repository. Students can use this as a learning roadmap for modern full-stack development.

## Frontend Concepts (React + TypeScript)
- **Modern React (v19):** Building user interfaces using functional components and hooks (`useState`, `useEffect`) for state and lifecycle management.
- **TypeScript for UI:** Leveraging static typing to catch errors during development and define strict interfaces for component props.
- **Contract-First API Integration:** Using **OpenAPI (Swagger)** to automatically generate a type-safe API client, ensuring the frontend always aligns with backend specifications.
- **Authentication & Identity:** Integrating with **Firebase Auth** for Google Sign-in and managing user sessions via JWT (JSON Web Tokens).
- **Component-Scoped Styling:** Using **CSS Modules** to prevent style leakage and maintain modular, maintainable stylesheets.
- **Modern Build Tooling:** Using **Vite** for rapid development (Hot Module Replacement) and optimized production builds.
- **Testing Patterns:** Implementing component and unit tests using **Vitest** and **React Testing Library**.

## Backend Concepts (Fastify + Node.js)
- **High-Performance Web Framework:** Leveraging **Fastify** for its low overhead and powerful plugin-based architecture.
- **Layered Architecture:** Organizing code into distinct layers for better maintainability:
    - **Entities/Schemas:** Data definitions using **TypeBox** for runtime validation and type safety.
    - **Repositories:** Handling data persistence and external API interactions (e.g., Firebase Admin).
    - **Services:** Encapsulating core business logic independent of the transport layer.
    - **Handlers/Routes:** Managing HTTP request/response orchestration.
- **Automated API Documentation:** Generating **Swagger/OpenAPI** specs directly from code schemas to ensure documentation is always up-to-date.
- **Dependency Injection (DI):** Implementing a `Container` pattern to decouple components and facilitate easier unit testing through mocking.
- **Security & Middleware:** Implementing custom plugins for CORS, request logging, and JWT authentication verification.
- **Cloud Integration:** Utilizing the **Firebase Admin SDK** for server-side user management and Role-Based Access Control (RBAC) via Custom Claims.

## Infrastructure & DevOps
- **Containerization:** Using **Docker** to package the application for consistent behavior across development and production environments.
- **Task Automation:** Using **Makefiles** to streamline workflows like building the project, running tests, and generating API clients.
- **Monorepo Structure:** Managing multiple related projects (frontend/backend) in a single repository with shared contracts.
- **Environment Configuration:** Securely managing application settings using environment variables (`.env`).
