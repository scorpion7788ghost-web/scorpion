# Enable the connected store and administrator panel

The customer and seller websites share your existing Supabase project. Both require sign-in. Customers use the profile icon to open My Account, Become a Seller, or Sign Out. Become a Seller opens the separate Seller Site login; administrators create seller accounts. There is no public registration form.

The administrator panel is at https://scorpion7788ghost-web.github.io/scorpion/admin.html and its login is at https://scorpion7788ghost-web.github.io/scorpion/admin-login.html. Sign in with the **customer** username **scorpion** and its existing password after completing the following setup.

## 1. Apply the database upgrade

In the existing Supabase project, open **SQL Editor**. Copy the entire contents of [supabase/admin-access.sql](supabase/admin-access.sql), then run it.

This upgrade preserves accounts and products. It enables administrator access for the existing customer `scorpion`, rejects new accounts not provisioned through the server's Auth admin API, and removes anonymous access to store data. If `scorpion` is missing, the transaction stops without changing anything. Do not rerun the original `schema.sql` on this existing database.

In **Authentication → Sign In / Providers**, turn **Allow new users to sign up** off. Keep the Email provider on. Account creation through the administrator service still works because it uses the server-side Auth admin API and confirms the internal username identifier itself.

The SQL upgrade also rejects direct browser signup independently of this setting. Existing accounts remain usable. Administrator membership is stored in a protected table; changing browser storage, profile text, or Auth user metadata cannot grant administrator access.

## 2. Deploy the administrator service

In the project's **Edge Functions**, choose **Deploy a new function → Via Editor**. Name it exactly **store-admin**. Replace `index.ts` with the complete contents of [supabase/functions/store-admin/index.ts](supabase/functions/store-admin/index.ts), and deploy it.

In this function's settings, turn **Verify JWT with legacy secret** off, if that option is shown. The function verifies the caller's bearer session with Supabase Auth and then checks `lk_admins` on every request. This verification must remain in the function code.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the hosted function. The service key stays in that server environment. **Do not paste it into `assets/store-config.js`, GitHub, or chat.** The default allowed website origin is `https://scorpion7788ghost-web.github.io`, covering both repositories. For a future custom domain, set the function secret `STORE_ALLOWED_ORIGINS` to a comma-separated list of exact allowed origins.

If the Supabase CLI is already installed and authenticated, the equivalent deployment from this repository is:

```powershell
supabase functions deploy store-admin --project-ref sukeowjxzqgszdvbpves --no-verify-jwt
```

## 3. Check real accounts

Open the admin login and sign in as `scorpion`. The directory lists registered customers and sellers, with username search, role filters, and pagination.

- **Add account** creates a customer or seller with a name, username, optional private contact email, and initial password. Share the credentials privately. New sellers automatically receive their own store.
- **Delete** requires typing the exact username. Deleting a seller also removes their store, products, and drafts. Deleting a customer removes their saved cart. Administrator accounts are protected from this action.
- Users can change their passwords from My Account. Customer and seller sessions remain separate, even when their usernames match. Administrators manage access without inheriting any seller's editing session.

For database checks, [supabase/verify-access.sql](supabase/verify-access.sql) verifies access rules in a transaction and rolls back every temporary test record. It is a verification script, not demo data.

## Deployment and verification boundaries

GitHub Pages serves the HTML/CSS/JavaScript shell. Supabase controls access to account and catalog records. Hiding a page or removing a registration button alone does not secure the database: **the database upgrade and Edge Function deployment above are required**.

Local automated checks exercise page access, administrator authorization, spoofed privileges, account API calls, protected deletion, input limits, and existing cart/seller behavior. They do not replace a live check with your own accounts. The old PHP development backend now blocks public registration and guest catalog access; administrator provisioning uses the hosted Supabase panel.

Official references: [Supabase authentication settings](https://supabase.com/docs/guides/auth/general-configuration), [server-side user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [server-side user deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), and [Edge Function authentication](https://supabase.com/docs/guides/functions/auth).
