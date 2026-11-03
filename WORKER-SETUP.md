# Activate Workers, public registration, and seller verification

This upgrade uses the existing Supabase project **sukeowjxzqgszdvbpves**. Apply the backend changes before publishing the matching customer and seller pages. It preserves existing users, stores and products, and adds no example data.

## 1. Run the new database upgrade

Open [SQL Editor](https://supabase.com/dashboard/project/sukeowjxzqgszdvbpves/sql/new), paste the entire contents of [supabase/worker-verification.sql](supabase/worker-verification.sql), and run it. The existing `schema.sql` and `admin-access.sql` have already been applied to this project; **do not rerun them**. This new upgrade is safe to run again.

Existing sellers stay approved. Every seller created after this upgrade starts pending, including a seller added through the admin panel. A buyer can use the customer store immediately after registration. Workers can only be created by the Administrator.

## 2. Update the existing Edge Function

Open [Edge Functions](https://supabase.com/dashboard/project/sukeowjxzqgszdvbpves/functions), then open the existing function displayed as **store-admin**. Its actual endpoint is **rapid-handler**.

In its code editor, replace `index.ts` with the complete contents of [supabase/functions/store-admin/index.ts](supabase/functions/store-admin/index.ts) and deploy the update. Keep the current `rapid-handler` endpoint. Keep **Verify JWT with legacy secret** off; the function verifies each user's session and administrator membership itself. The existing private server secrets and website origin remain the same.

This update lets the admin create Worker accounts, filter Workers, and see seller verification status. Worker approval uses database functions that independently require Worker or Administrator access. Workers cannot use the account-creation/deletion service.

## 3. Enable buyer and seller registration

In **Authentication → Sign In / Providers**, turn **Allow new users to sign up ON**. In the **Email** provider, leave Email enabled and turn **Confirm email OFF**, then save. This replaces the earlier administrator-only signup setting.

The store signs in with usernames, using internal `.invalid` email identifiers. These cannot receive confirmation email. Contact emails are stored separately. The registration page checks these settings before submitting a new account. [Supabase documents these settings here](https://supabase.com/docs/guides/auth/general-configuration).

## 4. Publish and use the updated pages

Publish the root customer website and the `seller-site` subtree to their existing GitHub Pages repositories after steps 1–3. Then refresh the sites.

| Task | Page |
| --- | --- |
| Buyer registration | https://scorpion7788ghost-web.github.io/scorpion/register.html |
| Seller registration | https://scorpion7788ghost-web.github.io/seller-site/register.html |
| Admin: create a Worker | https://scorpion7788ghost-web.github.io/scorpion/admin.html → Add account → Worker |
| Worker sign-in | https://scorpion7788ghost-web.github.io/scorpion/worker-login.html |
| Admin: approve sellers | https://scorpion7788ghost-web.github.io/scorpion/seller-reviews.html |

Workers land on their pending-seller queue and have their own account/password page. An Administrator can also open **Verify sellers** from the admin navigation. Open **Review seller**, inspect the details, then **Approve seller**. Approval records who approved the seller and when. Leaving the dialog with **Keep pending** grants no access.

An unapproved seller sees **“Please wait, we will verify you.”** after registration or a correct-password sign-in attempt. The waiting page checks every 15 seconds while visible and includes Check status and Sign out. Approval opens the seller dashboard automatically; signing in again from another device also checks the stored status.

## Access rules and checks

- Public registration accepts Customer and Seller only. Worker creation requires the administrator's server-verified session. User-editable metadata cannot grant a Worker role or approval.
- A pending seller has a limited authentication session only to read their own approval status and sign out. Database policies deny catalog, store, draft and cart reads; seller mutation functions also reject pending accounts. The storefront never loads until approval.
- Workers can list pending sellers and approve them. They cannot list customers, create/delete accounts, or edit sellers' products. Deleting a Worker removes their access even if an old session token has not yet expired.
- The legacy local PHP backend does not implement this upgrade. Use the hosted Supabase backend, or explicitly select `provider: 'supabase'` when testing these pages locally.

`tests/worker-database.test.cjs` executes the actual migrations in an isolated in-memory PostgreSQL engine (PGlite), with simulated Supabase Auth roles and no network calls. It checks migration reruns, public signup, forged Worker roles/approval, pending-seller reads and writes, Worker restrictions, audited approval, ownership, and revoked access. It expects `@electric-sql/pglite` under ignored `.qa/pglite/package/dist/index.cjs`, or a module path supplied through `LK_PGLITE_MODULE`.

Also run `tests/supabase-store.test.cjs`, `tests/access.test.cjs`, `tests/auth-flows.test.cjs`, `tests/admin-function.test.cjs`, and `python tests/check-pages.py`. These checks do not replace a live signup/approval check using your real accounts; no test accounts are created in your live project.
