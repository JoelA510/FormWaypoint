# Setup & Development Guide

This guide covers how to set up the Shipping Document Generator for local development, testing, and production deployment.

## Prerequisites

*   **Node.js**: v18 or higher
*   **npm**: v9 or higher
*   **Docker**: (Optional, for running database/redis locally)
*   **PostgreSQL**: v14+ (If not using Docker)
*   **Redis**: v6+ (If not using Docker)

---

## 1. Local Development Setup

The project is structured as a monorepo with two main applications:
*   `apps/api`: Backend (Express, Prisma)
*   `apps/web`: Frontend (React, Vite)

### Step 1: Clone & Install

```bash
git clone https://github.com/JoelA510/Shipping-Doc-Gen.git
cd Shipping-Doc-Gen
```

### Step 2: Backend Setup

1.  Navigate to the API directory:
    ```bash
    cd apps/api
    npm install
    ```

2.  Configure Environment Variables:
    Copy `.env.example` to `.env` (create one if it doesn't exist) and populate it:
    ```bash
    PORT=3001
    DATABASE_URL="postgresql://user:password@localhost:5432/shipping_db"
    REDIS_URL="redis://localhost:6379"
    JWT_SECRET="dev-secret"
    # Add Carrier Credentials (see API_PROCUREMENT.md)
    ```

3.  Run Database Migrations:
    ```bash
    npx prisma migrate dev
    ```

4.  Start the Development Server:
    ```bash
    npm run dev
    ```
    The API will be available at `http://localhost:3001`.

### Step 3: Frontend Setup

1.  Open a new terminal and navigate to the Web directory:
    ```bash
    cd apps/web
    npm install
    ```

2.  Start the Development Server:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

---

## 2. Testing

### Backend Tests
Run unit and integration tests for the API:

```bash
cd apps/api
npm test
```

### Frontend Tests
Run unit tests for React components:

```bash
cd apps/web
npm test
```

Run End-to-End (E2E) tests with Playwright:

```bash
cd apps/web
npm run test:e2e
```

---

## 3. Production Build

### Frontend Build
To build the React application for production (static files):

```bash
cd apps/web
npm run build
```
The output will be in `apps/web/dist`. These files can be served by Nginx, Vercel, or Netlify.

### Backend Build (Docker)
To containerize the backend API:

1.  Navigate to the project root.
2.  Build the Docker image:
    ```bash
    docker build -t shipping-api -f apps/api/Dockerfile .
    ```
3.  Run the container:
    ```bash
    docker run -p 3001:3001 --env-file apps/api/.env shipping-api
    ```

---

## 4. Troubleshooting

*   **Database Connection**: Ensure Postgres is running and the `DATABASE_URL` is correct.
*   **CORS Errors**: If the frontend cannot talk to the backend, check the `cors` configuration in `apps/api/src/index.js`.
*   **Carrier API Errors**: Verify your credentials in `apps/api/.env` against the `API_PROCUREMENT.md` guide.
