# Seller Site

**Access update:** Sellers can register themselves. New accounts display ?Please wait, we will verify you.? until a Worker or Administrator approves them. Follow the [Worker setup guide](https://github.com/scorpion7788ghost-web/scorpion/blob/master/WORKER-SETUP.md) before publishing this upgrade.

A separate seller website for LK Tech Store, with shared online accounts and product storage.

There are no demo accounts, sample products, or hardcoded orders. Sellers register with an empty pending store; Administrators can also create seller accounts. Each seller has a unique public page, inventory management, product editing, server-saved drafts, store settings, and account settings.

This website connects directly to Supabase from GitHub Pages using the same project as the customer website. The Project URL and public publishable key are configured in `assets/store-config.js`, and approved, signed-in users share the catalog. Username registration requires the Email provider to be enabled with **Confirm email off**. Never add a Supabase secret or service_role key to browser JavaScript.

Follow the [Supabase setup guide](https://github.com/scorpion7788ghost-web/scorpion/blob/master/SUPABASE-SETUP.md) in the customer/source repository. The original PHP API and private GitHub JSON storage remain available for local development or PHP hosting:

https://github.com/scorpion7788ghost-web/scorpion

See `SELLER-SITE.md` there for the PHP alternative. Do not add a GitHub access token to browser JavaScript.
