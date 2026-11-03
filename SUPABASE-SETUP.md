# Shared online storage with Supabase

**Current access model:** Both stores require sign-in, and accounts are created by an administrator. Follow [ADMIN-SETUP.md](ADMIN-SETUP.md) to upgrade the existing Supabase project and enable the `scorpion` administrator. The initial setup instructions below describe the earlier self-registration model; the admin upgrade supersedes it.

This option keeps both websites on GitHub Pages. Supabase provides managed password authentication and a hosted Postgres database; no PHP host, Render service, Docker build, or private GitHub write token is required.

Both website configurations now point to the same Supabase project. The live public catalog is reachable. Username registration also requires the Authentication settings in step 3; a valid URL and key alone do not enable it. There are no sample users or products. Existing PHP/GitHub records are not automatically migrated; keep any existing data until a deliberate migration is complete.

## 1. Create a project

Open https://supabase.com/dashboard and create a project. Choose a plan and region appropriate to your needs. Keep its database password private. Wait until the project is ready.

## 2. Create the tables and access rules

In the project's **SQL Editor**, start a new query. Copy the entire contents of [supabase/schema.sql](supabase/schema.sql) and run it once. It creates empty account, store, product, cart, and draft tables; it does not create example records.

Use a dedicated project for this store. This is first-time setup, not a script to rerun over existing tables. A failure rolls back the whole setup transaction. Do not switch off Row Level Security or grant browser users unrestricted writes to solve a permissions error.

For a database-level check, run [supabase/verify-access.sql](supabase/verify-access.sql) in SQL Editor afterward. It checks role separation, public visibility, and rejected seller edits inside a transaction and rolls back all its temporary records.

## 3. Configure username sign-in

In **Authentication → Sign In / Providers → Email**, enable the Email provider and turn **Confirm email off**. Keep new user signups enabled. Set a password minimum of at least 12 characters if your project's password settings offer it.

Supabase natively authenticates email/password or phone/password accounts. To preserve this website's requested **username/password** interface, the adapter derives an internal login identifier: `<username>@customer.lk-store.invalid` or `<username>@seller.lk-store.invalid`. These reserved `.invalid` addresses are account identifiers, not contact addresses, demo accounts, or deliverable email inboxes. The submitted optional contact email is kept separately in the private profile table.

Confirmation must be off because no confirmation email can be delivered to those identifiers. Password changes require the current password. Email-based password recovery is not implemented with this username scheme; do not enable recovery emails to the internal addresses. If you later need verified emails or email recovery, migrate to real email sign-in or a dedicated username authentication endpoint.

Customer and seller accounts have separate login identifiers and immutable database roles. The same username can exist once for each role. Changing browser state or Auth user metadata cannot change an existing database role or grant ownership of another seller's products.

## 4. Connect the two websites

Find your **Project URL** and **publishable key** in the project's **Connect** dialog or API settings. A legacy **anon** key also works. These are public browser configuration values. Never provide a **secret**, **service_role** key, or database password.

Paste the URL and key into these two files, with identical values:

- `assets/store-config.js`
- `seller-site/assets/store-config.js`

When connecting a different project, update `supabaseUrl` and `supabaseKey` in both files. Use the project root URL, such as `https://your-project.supabase.co`, without `/rest/v1/` or `/auth/v1/`. Keep `provider` as configured: GitHub Pages uses Supabase; the local PHP sites continue using their existing backend. To test Supabase locally, explicitly set `provider: 'supabase'` in your local configuration. Both websites must use the same Supabase project to share the catalog.

Alternatively, send the **Project URL and publishable/anon key** to the coding agent after completing steps 1–3 so it can connect and publish the configuration. Do not send private credentials.

Push the updated customer and seller sources to their GitHub repositories. After Pages finishes deploying, open:

- Customer store: https://scorpion7788ghost-web.github.io/scorpion/
- Seller Site: https://scorpion7788ghost-web.github.io/seller-site/

Create your actual accounts through those pages. In Supabase, Auth users appear in **Authentication → Users**; contact details appear in **Table Editor → lk_profiles**. Products, shops, drafts, and carts have their own tables. Passwords are handled by Supabase Auth; application tables never contain plaintext passwords or password hashes.

## Access and persistence

Public visitors can read public shop profiles and active product listings. Each signed-in user can read only their own private account profile, drafts, and cart. Seller functions check the authenticated database identity before editing records. Draft/archived products are visible to their owner only. A seller's registration email stays private unless that seller separately publishes it in their store contact information.

Only authentication session tokens are stored in browser storage, under separate customer/seller keys for this project. Account records and products stay online. Clearing browser storage signs you out without deleting your online records. Sign in on another device to access the same saved records. Guest carts remain specific to their browser until signed-in cart handling is used.

Supabase applies its own authentication and API limits. Public-key access is protected by the SQL grants, Row Level Security, and owner-checking functions, not by hiding the key. Configure provider abuse protection and monitor usage for a production store. Checkout/order processing remains unconnected.

## Validation limits

The adapter has local protocol/error/session tests, and the page, cart, seller editor, and PHP checks pass. Live read-only checks confirmed that the configured Supabase project serves the public catalog and rejects anonymous access to private profiles. No test users or products were added to the live database. Authenticated registration, saving, and cross-seller isolation still need live verification with real accounts. `supabase/verify-access.sql` supplies the database check; local mocked responses do not prove hosted security or connectivity.

Official documentation: [Auth signup](https://supabase.com/docs/reference/javascript/auth-signup), [profile triggers](https://supabase.com/docs/guides/auth/managing-user-data), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [public versus secret keys](https://supabase.com/docs/guides/api/api-keys).
