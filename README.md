# StoreRate

StoreRate is a role-based store discovery and ratings website. The React/Vite interface is served by an Express API, and PostgreSQL stores accounts, stores, ratings, and login sessions. A single origin keeps session cookies straightforward in production.

## How it works

- Visitors create customer accounts or sign in. Passwords are hashed with bcrypt; the server authenticates requests using an HTTP-only session cookie stored in PostgreSQL.
- Customers browse/search stores and can create or update one 1–5 star rating per store.
- Store owners see the stores assigned to their account and their customer ratings.
- Administrators see system metrics, search users/stores, add accounts/stores, assign an existing store-owner account to a store, and inspect user profiles.
- The API enforces roles and validates inputs on the server. The UI is not the security boundary.
- On first server start, database tables and five sample Himalayan cafe listings are created. The initial admin is only created when admin environment variables are configured.

## Deploy to Render

1. Push this repository to GitHub and sign in to Render.
2. In Render, choose **New → Blueprint**, connect `Sonali-Motkar/StoreRate`, and select `render.yaml`.
3. The blueprint provisions a Node web service and PostgreSQL database in Singapore. Enter `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` when prompted. The password must be 8–16 characters and include an uppercase letter and a special character. Do not commit secrets to GitHub.
4. Review the paid service/database plans and costs shown by Render before confirming creation. Render builds the Vite frontend, starts Express, and deploys on later pushes to the connected branch.
5. After deploy, open the service URL and verify `/api/health` returns `{"status":"ok"}`. Sign in with the configured initial admin email/password, create a store-owner account, assign it to a store, then test customer signup and ratings.

The blueprint uses persistent PostgreSQL and non-free service plans; a production website needs a database that persists beyond a temporary trial. The service serves the UI and API together; GitHub Pages alone cannot run the Express API or PostgreSQL-backed sessions.

## Run in development

Requires Node.js 22+ and PostgreSQL. Create a local database and set `DATABASE_URL` and `SESSION_SECRET` in an untracked `.env` file. To create the first administrator, also set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

```sh
npm install
npm run dev:api
```

In a second terminal:

```sh
npm run dev
```

Vite proxies `/api` requests to `http://127.0.0.1:3000`. The database is required; the app does not use browser-local storage as its backend.

## Useful commands

```sh
npm run build
npm start
```
