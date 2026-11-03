# File-backed accounts for LK Tech Store

The two websites now use a PHP API instead of demo accounts, browser account records, or a sample catalog. They start with no users, sellers, products, or orders.

## Where registrations are saved

The private GitHub repository is:

https://github.com/scorpion7788ghost-web/lk-tech-store-data

With GitHub storage enabled, each completed registration commits a separate private JSON file:

- `users/customer_<id>.json`
- `users/seller_<id>.json`
- `stores/seller_<id>.json` after store details, products, or drafts are saved
- `carts/customer_<id>.json` after a signed-in customer saves their cart

Registration files contain the submitted name, username, optional email, role, timestamps, and a password hash. Passwords are never saved as readable text. Public account responses omit password hashes and session versions. Customer registration emails are not copied into public seller profiles.

Seller store records hold the store profile, owned products, and saved drafts. Public storefronts show only active products. Ownership is checked by the PHP backend for every mutation; the browser cannot choose another seller's account ID. No sample orders are created; checkout and order processing are not connected yet.

## Start the working websites on this computer

From this workspace in PowerShell:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start-sites.ps1 -Storage GitHub -UseGitCredentialManager
```

- Customer website: http://127.0.0.1:8080/
- Seller Site: http://127.0.0.1:8081/

The startup script uses the existing GitHub sign-in to pass a token directly to the two backend processes. It never writes that token into website files, JSON records, command arguments, or browser storage. Servers run hidden in the background. Stop them with:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./stop-sites.ps1
```

Create a new account through the correct website. There are no predefined logins. The first successful registration creates the first user JSON record in the private repository. Starting the sites does not create test users or products.

## Hosting online

GitHub Pages can serve the frontend files but cannot execute the PHP API or write registration files. The public Pages URLs therefore show a connection message until an API is hosted. Do not put a GitHub token in JavaScript to bypass this requirement.

For online registration, deploy the PHP API and frontend to PHP hosting, with separate customer and seller virtual hosts. Both virtual hosts use the same private GitHub data repository. Route `/api/*` to `server/public/index.php`, preserving the URI. The local `server/router.php` demonstrates this setup and serves only allowlisted frontend pages/assets; it blocks access to private files, source code, and the other website's files.

Configure these **server-only** environment variables:

```
LK_PORTAL=customer                    # seller on the Seller Site host
LK_STORAGE_DRIVER=github
LK_GITHUB_REPOSITORY=scorpion7788ghost-web/lk-tech-store-data
LK_GITHUB_BRANCH=main
LK_GITHUB_TOKEN=<server secret with Contents read/write on the private data repository>
LK_STORAGE_DIR=/private/runtime/path
LK_ALLOWED_HOSTS=shop.example.com     # seller.example.com on the seller host
LK_CUSTOMER_URL=https://shop.example.com/
LK_SELLER_URL=https://seller.example.com/
```

Use HTTPS in hosting so session cookies are Secure. Configure PHP's trusted CA bundle, or set `LK_CA_BUNDLE` to a trusted PEM bundle; certificate verification is never disabled. The Windows startup script can use the trusted CA bundle already bundled with the installed pip.

`LK_STORAGE_DIR` holds private PHP sessions, local request throttles, and runtime logs in GitHub mode, not mirrored user registration records. Keep it outside the web root, keep backups of persistent records, and exclude all runtime data and tokens from source control. These paths are ignored by Git and excluded from the Pages build.

## Temporary file storage, later database migration

The `Commerce` service uses a storage adapter:

- `GitHubStore`: private per-record JSON files in GitHub, written through Git blobs, trees, and commits. Non-fast-forward ref updates are rejected to avoid overwriting concurrent registrations. A conflicting request fails without claiming success and can be retried.
- `FileStore`: equivalent private filesystem records with `flock`, write flushing, and atomic file replacement. Use `-Storage Local` for offline development or automated tests.

GitHub-backed files are a temporary, low-volume solution: API rate limits, latency, and repository growth still apply. The storage boundary is designed to be replaced with a database without changing the frontends' API contract.

## Authentication and access

Customer and seller cookies/sessions are separate. Passwords use PHP `password_hash` / `password_verify`. Registration and login are rate limited. Mutations require a CSRF token, same-origin requests, and the appropriate authenticated role. Password changes invalidate previous sessions. Sessions are HttpOnly, SameSite=Lax, and expire after inactivity. User data is never bootstrapped into public JavaScript fixtures.

## Checks

```
python tests/check-pages.py
python tests/http-storage.test.py
```

`tests/file-storage.test.php` is run with a temporary storage-directory argument and the PHP extensions from `.php/conf.d`. It also tests the GitHub adapter against an isolated transport double; tests never create fake users in the live private repository. HTTP tests create temporary records in an isolated directory, then remove that directory.
