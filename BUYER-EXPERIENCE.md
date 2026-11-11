# Buyer marketplace upgrade

The Buyer site keeps the existing Supabase authentication, catalog, cart and role checks. Seller, Worker, Admin and Owner permissions are unchanged. No products, accounts, orders or discounts are seeded by this upgrade.

## Activate wishlist and order history

After the existing `admin-console.sql` upgrade, run **all** of [supabase/buyer-experience.sql](supabase/buyer-experience.sql) in the same project's Supabase SQL Editor. It is transactional and safe to rerun. It adds a private wishlist table and two authenticated RPCs; existing products and orders are preserved.

- `lk_buyer_wishlist` lists, adds and removes the signed-in Buyer's saved products. Admin/Owner accounts can use their own Buyer wishlist too. Direct table access is revoked, RLS is enabled, and the RPC validates account status and product availability.
- `lk_my_orders` returns only orders belonging to the current account, including when the account is an Admin or Owner. COD checkout is enabled separately by the upgrade below.
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

## Cash on Delivery checkout

Run all of [supabase/cod-checkout.sql](supabase/cod-checkout.sql) after `admin-console.sql` and `buyer-experience.sql`. Existing records are retained, the order status constraint gains `pending`, and private checkout/delivery tables use default-deny RLS. If the older console migration is rerun, rerun this upgrade last to restore its guarded COD wrappers.

As the Owner, open **Admin Panel > Settings > Delivery districts & fees**. Add each supported district, its actual fee in **USD**, and whether it is charged once per checkout or separately for each seller. Disable a district to stop accepting new orders there. No fees or districts are invented by the migration. Checkout stays unavailable until a district is configured. Checkout, receipts and COD order totals show the exact USD amount payable; approximate homepage LKR conversion is never used for settlement.

Customers proceed from Cart to `checkout.html`, enter delivery details, review a server-calculated quote, and place a Cash on Delivery order. No card, bank transfer or online payment methods exist. A quote expires after 15 minutes. Prices, seller availability, product moderation and stock are rechecked under row locks; any cart, price or fee change requires a fresh quote. The client cannot choose prices, customer identity or payment status.

One checkout creates a separate `lk_orders` record per seller. Each starts **Pending / Unpaid / COD**. Stock decrement, checkout persistence, all seller orders, and cart clearing commit together or all roll back. A single per-checkout delivery fee is allocated to the first seller order in deterministic seller-ID order; per-seller fees apply to each seller order. Order sums always equal the checkout total. Product/price/image/SKU and address snapshots remain available after catalog changes. This catalog has no product-variation selection model; no variations are invented.

The quote UUID is the idempotency key and remains in the checkout URL. A retry returns the original receipt. A server-locked resume endpoint resolves unknown outcomes after a network interruption before allowing another quote. Different tabs use the same customer cart lock; an already-consumed cart cannot create another order. No delivery information is saved in browser storage. A confirmed order is privately available at `order-confirmation.html?id=...`, with a link from My Orders.

Admins use Order Management to move COD orders Pending > Processing > Shipped > Delivered, record tracking, and confirm actual cash collection. The backend permits paid status only on delivered orders. Unpaid Pending/Processing orders can be cancelled with a reason; reserved stock is restored once. Old Admin clients also pass through the COD cancellation guard. Cash refunds are not implemented. Sellers can view only their own order lines and delivery details on Seller Site > Orders; fulfillment and collection controls remain Admin-only.

`tests/cod-checkout-database.test.cjs` verifies real isolated PostgreSQL price/stock validation, input validation, idempotency, stale/expired quotes, multi-seller fees, rollback, cancellation/restocking, payment collection, private reads and RLS. The existing browser suite covers responsive checkout, empty carts, form validation, failed saves, duplicate clicks, confirmation persistence and lost-response recovery. Its fixtures never touch live accounts or orders.

## Product reviews

Run the full [supabase/product-reviews.sql](supabase/product-reviews.sql) after `admin-console.sql` to enable product ratings and reviews. The migration is rerunnable, preserves existing records, and inserts no reviews. Every current and future product uses the same product details page and review endpoints.

Reviews require a signed-in Buyer (including an Admin using Buyer access) and a matching paid, non-cancelled order in `lk_orders`. The order must belong to that account and the product's seller, and contain a positive integer `quantity` plus the exact product ID in `productId`, `product_id`, or `id`. Name-only items cannot establish ownership. Fully refunded orders do not qualify. COD orders qualify only after an Admin confirms cash collection. Other eligible orders must come from trusted order ingestion.

The server adds the Verified Purchase label when creating a review. Customers can subsequently edit or delete their own review, including after a refund. A product/customer unique constraint prevents duplicates. Owners cannot review their own products. Titles accept 1–100 characters; descriptions accept 1–3000; whitespace-only content and ratings outside 1–5 are rejected. Content is rendered as plain text.

The review table uses default-deny RLS with direct browser table access revoked. Authenticated RPCs validate active accounts, visible products, purchase eligibility and review ownership. Writes never accept a customer ID or verification flag. Updates/deletes require the last observed update timestamp, preventing stale tabs from silently changing a newer review. Reviewer responses contain display names and dates, not emails or authentication IDs. Deleted products/accounts cascade only to their corresponding reviews.

The interface includes averages and rating distributions over all reviews, four server-side sorting options, ten reviews per page, edit/delete controls, confirmation dialogs and retryable errors. Reviews do not delay the product, cart or hero scripts.

Run `tests/product-reviews-database.test.cjs` for isolated PostgreSQL validation of purchase checks, ownership, RLS, duplicate prevention, persistence, editing/deletion, aggregates, sorting and pagination. The browser test below additionally exercises the review form and responsive layouts using localhost fixtures.

## Verification commands

Use Node.js to run `tests/marketplace.test.cjs`, `tests/buyer-experience-database.test.cjs`, `tests/supabase-store.test.cjs`, `tests/profile-theme.test.cjs`, `tests/search-navigation.test.cjs`, and `tests/storefront-flows.test.cjs`. The database test uses the existing isolated PGlite setup; no live accounts are required.

`python tests/marketplace-browser.test.py` uses headless Chrome plus Python's `websocket-client` package. Set `BROWSER_EXECUTABLE` if Chrome is installed elsewhere. It serves in-memory fixtures on localhost, writes screenshots under `.qa`, and checks responsive widths, themes, search, wishlist failure recovery, cart, notifications, orders, deals and product navigation. These fixtures never reach Supabase or published assets.
