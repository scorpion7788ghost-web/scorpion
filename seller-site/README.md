# Seller Site

A separate seller website for LK Tech Store, with shared online accounts and product storage.

There are no demo accounts, sample products, or hardcoded orders. Register a new seller account to start an empty store. Each seller has a unique public page, inventory management, product editing, server-saved drafts, store settings, and account settings.

This website connects directly to Supabase from GitHub Pages using the same project as the customer website. The Project URL and public publishable key are configured in `assets/store-config.js`, and the public catalog responds successfully. Username registration requires the Email provider to be enabled with **Confirm email off**. Never add a Supabase secret or service_role key to browser JavaScript.

Follow the [Supabase setup guide](https://github.com/scorpion7788ghost-web/scorpion/blob/master/SUPABASE-SETUP.md) in the customer/source repository. The original PHP API and private GitHub JSON storage remain available for local development or PHP hosting:

https://github.com/scorpion7788ghost-web/scorpion

See `SELLER-SITE.md` there for the PHP alternative. Do not add a GitHub access token to browser JavaScript.
