# Existing marketplace upgrade

This work extends the current buildless HTML/CSS/JavaScript application in place. GitHub Pages, Supabase Auth/RPC/RLS, the Seller deployment, and the protected Owner identity remain the foundations. No existing records are reset or seeded.

## Architecture and sequence

- Customer pages use `store-api.js` and `supabase-store.js` for authenticated data, `site.js` for shared cards/cart, `shop.js` for shopping interactions, and `search.js` for search.
- Seller pages reuse the cloud adapter and have their own dashboard/editor/order controls.
- Admin uses the existing console, audited RPCs, role checks, and Owner protection. Worker verification remains separate.
- Existing migrations cover accounts, verification, Owner protection, administration, private chat, wishlist/orders, reviews, and authoritative COD checkout.
- `assets/store-config.js` has pre-existing local changes and must not be included in this upgrade's commits.

## Phase checklist

1. Design foundation: existing premium homepage, real-product hero, categories, deals, rankings, brands, cards, cart preview and responsive navigation are retained. Remaining: configurable promotional schedules/banners, verified-review highlights, newsletter and editable policies/guarantees. Rankings require `homepage-collections.sql` to be applied; live activation is not confirmed.
2. Shopping: comparison and recently viewed tools now extend the existing shared cards and profile dropdown. Existing cart, wishlist, search, details, and COD checkout remain. Remaining: server-paginated search (current search still uses the bootstrapped catalog), category-specific filters, gallery/specification editor, saved-for-later, alerts, bundles, authoritative coupons, saved addresses and secure guest checkout.
3. Customer experience: existing private orders, reviews, notifications and support chat retained. Remaining: consolidated dashboard, tracking timeline, refund-request workflow, invoices, unread notification state and richer ticket management.
4. Seller platform: existing store, products, stock and permitted fulfillment tools retained. Remaining: inventory audit UI, shipping management, reports, commissions and richer storefronts. Updated seller COD RPC deployment needs confirmation.
5. Admin: existing ten-section console, verification, moderation, account management, support and audit tools retained. Remaining: promotions/coupons/commission configuration and the backend extensions that support them.
6. Optimization: verify each increment before release. Remaining: full security regression, SEO metadata/sitemap, public-indexing decision for the authenticated catalog, image pipeline, pagination and final cross-device/accessibility audit.

## Current increment: comparisons and browsing history

- Compare 2–4 currently available catalog products from compatible categories; remove individually or clear all.
- Price, brand, category, availability, warranty and scalar `specifications` values are shown from actual catalog records. Missing values are explicitly unspecified. No warranty or specifications are invented.
- Different rows are highlighted. Product links retain the existing product page.
- Profile shortcuts open keyboard-accessible dialogs; comparison uses a horizontally scrollable table on narrow screens.
- Recently Viewed reuses the existing account-scoped history and product card component, with clear-history support.
- Only IDs are saved in browser storage per account. These preferences do not sync across devices. Current details always come from the catalog. No database migration or external credentials are required for this increment.
- Backend permissions and authoritative checkout totals are unchanged. Existing catalog bootstrap still loads the full catalog; server pagination remains pending, not claimed complete.

## External activation

Online payment, transactional email and push providers are not configured by this increment. COD remains the only operational checkout method. Adding those services requires secure server credentials and verified server callbacks before they can be enabled. Newsletter delivery, branded assets, legal policies and store guarantees must use actual configured store information.

## Verification

Use `tests/marketplace.test.cjs` for comparison limits, category compatibility, storage failure and account isolation, and `tests/marketplace-browser.test.py` for browser interactions and existing shopping regression. Browser fixtures are local-only; they do not create live orders or accounts. Record actual test outcomes in the delivery summary; this checklist is not evidence that all master-prompt features are complete.
