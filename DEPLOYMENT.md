# Deploy the two websites on Render

The GitHub Pages address cannot run the account server. This deployment hosts the existing customer website and Seller Site as **two separate PHP web services**. Each website calls its own `/api`, so login cookies remain on the correct domain. Both services store real account and product JSON files in the same private GitHub repository.

## Deploy

1. Open [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fscorpion7788ghost-web%2Fscorpion). Sign in or create your Render account and review the Blueprint.
2. The Blueprint creates `lk-tech-customer` and `lk-tech-seller`. Both explicitly use the **Free** plan; no paid disks or databases are included. Review Render's current plan terms before creating the services.
3. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new) owned by `scorpion7788ghost-web`, restricted to the private **lk-tech-store-data** repository. Give it **Repository permissions → Contents → Read and write**. Choose an expiration you can manage. Metadata read access is included by GitHub. Do not grant access to unrelated repositories.
4. Paste that token into the **LK_GITHUB_TOKEN** secret field for **each** service in Render. Keep it in Render only; do not add it to source files or send it in chat.
5. Create the Blueprint and wait until both services are **Live**. Open each service's actual `https://…onrender.com` URL from its dashboard. Render supplies the assigned URLs automatically; the seller website's customer link follows the customer service's URL.
6. Use the **Render customer URL** to browse and register customers, and the **Render seller URL** to register sellers. The old GitHub Pages URL remains a static preview and will still show the storage connection error. Replace bookmarks and shared links with the Render URLs.

There are no preloaded accounts or products. Creating your own first account saves its real record in the private data repository. Passwords are hashed before storage. A new seller can publish products from Seller Site; active products then appear in the customer website.

## Verify the deployment

- Visit `/api/bootstrap` on each Render URL: it should return JSON, with `portal` set to `customer` or `seller`, and no storage error. Do not share the session's CSRF token.
- Register your actual account, then sign out and sign in again. In the private repository, check for `users/customer_<id>.json` or `users/seller_<id>.json`.
- Save real seller details or a product and check that a corresponding `stores/seller_<id>.json` is committed. Another seller must see only their own management workspace.
- `/server/storage/`, `/server/src/Commerce.php`, and `/.git/config` must return 404.

`/healthz` checks that the PHP application is running. It deliberately does not call GitHub on every hosting health probe; use `/api/bootstrap` to verify private storage connectivity.

## Free hosting behavior

Render's Free services sleep after 15 minutes without traffic and can take about a minute to wake up. Free instance hours are shared across the workspace, including these two services. See [Render's Free service limits](https://render.com/docs/free). Use this configuration to preview the deployment; review a suitable paid plan before running a production store.

Accounts, products, drafts, and signed-in carts are committed to GitHub and survive a Render restart. Sessions and request throttles live on each service's temporary filesystem, so a restart, redeploy, or idle shutdown can sign users out and reset throttles. No registration records rely on that filesystem. Keep one instance per portal with this temporary architecture. For durable sessions, use paid persistent storage or migrate to the planned database/session service.

Automatic deployment is off. After pushing later code changes, select **Manual Deploy → Deploy latest commit** for both services. When changing Blueprint configuration, sync the Blueprint too. Renew the token in both services' Environment settings before it expires.

## Troubleshooting

- **Connection banner on `github.io`:** open the new Render customer or seller URL. The PHP service is hosted there.
- **Storage service unavailable:** check that both services have the token, that it has Contents read/write access to the private repository, and that `main` exists. Read the server logs for the HTTP status; never post tokens or account records.
- **Hostname or origin rejected:** keep Render's supplied URL settings, or set `LK_ALLOWED_HOSTS` and the relevant `LK_CUSTOMER_URL` / `LK_SELLER_URL` to your actual custom domains. Configure HTTPS at the host. The API uses those server settings for Secure cookies and origin checks; it does not trust arbitrary forwarding headers.
- **Build failure:** inspect the Render build log. The Docker build verifies that curl, fileinfo, mbstring, and OpenSSL are available. No Composer, Laravel, Node, or database setup is needed.

## Deployment files and local checks

`render.yaml` describes the services. `Dockerfile` packages only the required frontend and PHP source. Apache serves a single PHP entry point; the router allows frontend pages/assets and API requests while blocking backend source and private files. `.dockerignore` excludes everything except the required build inputs, including all local credentials and runtime records.

Run `python tests/http-storage.test.py`, `python tests/hosting.test.py`, and `python tests/check-pages.py` to check the application. The hosting check simulates HTTPS termination at a reverse proxy and verifies origin enforcement, Secure cookies, and file access restrictions. Tests use temporary local storage and never add sample users to the live repository.

Docker is not installed on the development computer, so the image has not been built locally. The first Render build is the remaining container validation step. See the official [Docker deployment guide](https://render.com/docs/docker) and [Blueprint reference](https://render.com/docs/blueprint-spec).
