# Forge account and GitHub save backend (Cloudflare Workers)

Forge users sign up with **username + password**; they never sign into GitHub and do not need email or Supabase. The Worker holds a repository-scoped GitHub token as a secret. Do not place it in the website.

## Setup
1. Create a Cloudflare Worker and deploy `cloudflare/worker.js` (module syntax).
2. In Worker **Settings → Variables and Secrets**, set:
   - Secret `GITHUB_TOKEN`: fine-grained GitHub token with Contents read/write permission **only** for the private `etahroll5/forge-game-saves` repository.
   - Secret `SESSION_SECRET`: long, random secret (at least 32 random bytes).
   - `GITHUB_OWNER`: `etahroll5`
   - `GITHUB_REPO`: `forge-game-saves`
   - `ALLOWED_ORIGIN`: exact Forge website origin (e.g. `https://example.com`; comma-separated for more).
3. In the Forge website, configure `forge-config.json` with `{"apiUrl":"https://YOUR-WORKER.workers.dev"}`. This is a public endpoint URL, **not a secret**.
4. Redeploy the website. The account UI will only work once the Worker is live.

Accounts are stored at `accounts/<sha256(normalized-username)>.json` with salted PBKDF2 password hashes. Saves are stored at `users/<account-uuid>/projects/<project-uuid>.json`. The Worker verifies signed session tokens and derives the user folder from the token, never from user input.

Security notes: Before a public launch, add rate limiting to registration/login at Cloudflare, abuse protection, and a password reset/recovery flow. Without email or another recovery method, forgotten passwords cannot be recovered. GitHub Contents API is not intended as a high-volume database and is subject to rate limits. Back up the private repository.
