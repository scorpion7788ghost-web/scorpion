# Seller Site

A standalone seller workspace for the LK Tech Store browser demo. Deploy this directory as its own website, separately from the customer storefront.

- Nova Tech demo: `nova` / `SellerDemo123!`
- Orbit Supply demo: `orbit` / `SellerDemo123!`
- Create additional seller demo accounts from the sign-in page.

Features: seller-specific dashboard, product CRUD, inventory/status controls, image upload, live card preview, draft saving, store settings, unique seller pages, account settings, sample order management, and scoped catalog exports.

The fixtures live in `assets/demo-data.js`. Changes are stored only in this browser, with separate records per seller. This prototype has no database, server-enforced authorization, real payments, or cross-device synchronization. Do not use real credentials or personal information.

Serve over HTTPS or localhost. Use `shop.html?id=nova-tech` and `shop.html?id=orbit-supply` to preview the distinct public seller pages.
