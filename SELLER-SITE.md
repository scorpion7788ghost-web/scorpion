# LK Tech Store and Seller Site

The customer website and Seller Site are separate deployments and repositories. The customer Pages build excludes the `seller-site` source directory. The previous customer `add-product.html` and editor script have been removed.

- Customer website: https://scorpion7788ghost-web.github.io/scorpion/
- Customer sign-in: https://scorpion7788ghost-web.github.io/scorpion/login.html
- Seller Site: https://scorpion7788ghost-web.github.io/seller-site/
- Example seller pages: `shop.html?id=nova-tech` and `shop.html?id=orbit-supply` on Seller Site.

## Demo access

| Site | Username | Password |
| --- | --- | --- |
| Seller Site / Nova Tech | nova | SellerDemo123! |
| Seller Site / Orbit Supply | orbit | SellerDemo123! |
| Customer site / Alex | alex | CustomerDemo123! |

Both sites support creating additional **demo accounts**. Use made-up details and a password you do not use elsewhere. Registration, password changes, store profiles, products, inventory, and order-status changes are saved in this browser only. Sessions are separate for seller and customer roles. Customer carts are keyed by customer ID; seller products, profiles, and drafts are keyed by seller ID.

## Seller features

Overview statistics; searchable inventory; active/draft/archived product states; add/edit products; stock quantities; SKU uniqueness per store; photo upload and compression; live product preview; seller-specific drafts; store profile and contact details; stable seller-page URLs; account details and demo password changes; hardcoded sample orders scoped to the seller; JSON catalog export.

Only active products appear on public seller pages and in the customer catalog. Archiving is reversible. The ownership checks in `assets/demo-core.js` reject writes to a different seller's store or products within the normal demo flows.

## Hardcoded data and limitations

As requested, no database or backend was created. `assets/demo-data.js` and `seller-site/assets/demo-data.js` contain the shared hardcoded fixtures. Demo passwords are intentionally documented; their fixture verifiers and registered-account verifiers use PBKDF2 rather than saving plaintext passwords.

This is **not production authentication or server-enforced isolation**. Browser records and scripts can be inspected or changed. Different visitors/devices do not share new accounts or edits. Sites deployed beneath the same `scorpion7788ghost-web.github.io` origin can read the same browser records, so a seller's changes appear in the customer demo on that browser. Different origins have separate records. Do not use this prototype for real credentials, customer data, orders, or payments.

No checkout, real payment processing, email delivery, or automatic cross-device publishing is implemented.

## Update the hardcoded catalog for other visitors

1. In Seller Site, sign in and open Products > Export store data.
2. Validate the exported file:
   `python tools/sync-demo-catalog.py path/to/seller-catalog.json`
3. Apply it with `--apply`. The script replaces only the exported seller's public profile/products and preserves other sellers and account records.
4. Commit the changes and deploy both websites.

## Local preview

Run `python -m http.server 8080 --bind 127.0.0.1` from the workspace. Open the customer demo at `http://127.0.0.1:8080/` and Seller Site at `http://127.0.0.1:8080/seller-site/`. HTTPS or localhost is required for browser password hashing. Serve files over HTTP rather than opening `file://` URLs.

## Publishing

Customer: push `master` to `origin`.

Seller: publish the `seller-site` subtree to the separate Seller Site repository:

```
git subtree split --prefix seller-site -b seller-publish
git push https://github.com/scorpion7788ghost-web/seller-site.git seller-publish:master
```

For subsequent updates, run `git subtree split --prefix seller-site` and push its returned commit to `master`. Both Pages sources use `master` and `/`.

## Checks

Run `node tests/demo-model.test.cjs` for role, ownership, account, catalog, and storage checks. Run `python tests/check-pages.py` for both sites' links, assets, labels, and deployment separation. Visual browser checks require an available browser session.
