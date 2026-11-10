# Buyer marketplace upgrade

The Buyer site keeps the existing Supabase authentication, catalog, cart and role checks. Seller, Worker, Admin and Owner permissions are unchanged. No products, accounts, orders or discounts are seeded by this upgrade.

## Activate wishlist and order history

After the existing `admin-console.sql` upgrade, run **all** of [supabase/buyer-experience.sql](supabase/buyer-experience.sql) in the same project's Supabase SQL Editor. It is transactional and safe to rerun. It adds a private wishlist table and two authenticated RPCs; existing products and orders are preserved.

- `lk_buyer_wishlist` lists, adds and removes the signed-in Buyer's saved products. Admin/Owner accounts can use their own Buyer wishlist too. Direct table access is revoked, RLS is enabled, and the RPC validates account status and product availability.
- `lk_my_orders` returns only orders belonging to the current account, including when the account is an Admin or Owner. It does not enable checkout or payment processing.
- If the migration is missing, the pages explain that setup is needed instead of showing fake records.

## Prices and deals

The existing product and order amounts remain **USD** in storage. Buyer prices show **approximate LKR conversions** using ExchangeRate-API's public USD endpoint. A recent quote is cached in the browser, requests omit credentials, and a 1.5-second request timeout prevents a currency outage from holding up the catalog indefinitely. The footer identifies the rate date and provider. If no recent quote is available, correctly labeled USD prices remain visible.

Price filters use the displayed currency. Saved filter URLs include their currency and refuse to silently apply an LKR range as USD after a conversion failure. Seller editing and accounting amounts retain their existing USD units.

Original prices and discount badges are displayed only when the real catalog contains an `originalPrice` or `compareAtPrice` higher than the current price. Existing products without an original price have no discount badge. The Deals page shows only qualifying products; it may be empty. This update does not invent offers or change the existing seller price editor.

## Browsing and account features

- The hero rotates through up to four actual in-stock catalog products. It pauses on hover/focus, hidden tabs, explicit pause, and reduced-motion preferences.
- The top search preserves live keyboard-accessible suggestions and separate search results with brand/category/price filters.
- Quick view, product links, cart controls, wishlist, notifications, orders and theme selection use real handlers and existing account access.
- Recommendations rank the actual catalog by recently viewed categories on this browser. History contains only product IDs, is limited to 40 items and is isolated by account. It falls back to catalog order when no history is available.
- Category shortcuts infer technology collections from product names and existing categories without rewriting the database taxonomy.

## Verification

Use Node.js to run `tests/marketplace.test.cjs`, `tests/buyer-experience-database.test.cjs`, `tests/supabase-store.test.cjs`, `tests/profile-theme.test.cjs`, `tests/search-navigation.test.cjs`, and `tests/storefront-flows.test.cjs`. The database test uses the existing isolated PGlite setup; no live accounts are required.

`python tests/marketplace-browser.test.py` uses headless Chrome plus Python's `websocket-client` package. Set `BROWSER_EXECUTABLE` if Chrome is installed elsewhere. It serves in-memory fixtures on localhost, writes screenshots under `.qa`, and checks responsive widths, themes, search, wishlist failure recovery, cart, notifications, orders, deals and product navigation. These fixtures never reach Supabase or published assets.
