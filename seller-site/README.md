# Seller Site

A separate seller website for LK Tech Store, connected to a PHP API with real file-backed account and product storage.

There are no demo accounts, sample products, or hardcoded orders. Register a new seller account to start an empty store. Each seller has a unique public page, inventory management, product editing, server-saved drafts, store settings, and account settings.

The frontend expects the PHP API at `/api`. The API saves registration and seller JSON files in a separate private GitHub repository, or in private local files when configured for local development. GitHub credentials stay only on the backend.

GitHub Pages can serve these frontend files but cannot run the PHP API. To register users online, host the API on PHP hosting. The complete backend, Windows startup scripts, setup documentation, and automated tests are in the customer/source repository:

https://github.com/scorpion7788ghost-web/scorpion

See `SELLER-SITE.md` there for setup. Do not add a GitHub access token to browser JavaScript.
