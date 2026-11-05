# Owner sample tech products

## Additional collection

Run the complete [owner-more-products.sql](../owner-more-products.sql) in Supabase SQL Editor to add three more sample products to the existing protected Owner's store:

| Product | Sample price | Stock |
| --- | ---: | ---: |
| Everyday Creator Laptop (Sample) | $699.99 | 8 |
| Everyday Smartwatch (Sample) | $89.99 | 20 |
| Creator Digital Camera (Sample) | $449.99 | 6 |

These records include embedded JPEGs, categories, summaries, prices, stock, and the Newly Added flag. Repeating this import skips existing IDs/SKUs and preserves product edits. It does not change any access functions, policies, Admin permissions, or Owner account details. It assumes the existing Owner setup/catalog access has already been activated. Manage these products from the Owner's Seller dashboard after `admin-portals.sql` is active.

Photo credits: [Chris Ried — laptop](https://unsplash.com/photos/silver-laptop-computer-on-white-surface-LfG7RwMM6g8), [Jozsef Hocza — smartwatch](https://unsplash.com/photos/white-and-black-digital-watch-h1MnFsRI-_I), [Fujiphilm — camera](https://unsplash.com/photos/a-camera-in-the-dark-on-a-black-background-GEWP1mOeXvo). Photos are illustrative; sample prices and names do not advertise the pictured brand or model. Rebuild with `python tools/build-owner-samples.py --additional`.

## Original collection

These four sample products were explicitly requested by the store owner. They belong to the pinned **Scorpion Owner account**, not a new seller or demo account.

Run the complete [owner-sample-products.sql](../owner-sample-products.sql) in the project's Supabase SQL Editor after `owner-access.sql`. The Results panel should list four active products. Refresh the Buyer website while signed in; they appear in Newly Added Products, Recommended for You, search, and their individual product pages.

The import creates an Owner storefront only if missing. It never edits the Owner profile or role, grants seller access, replaces existing products, or changes other sellers' records. Re-running it preserves imported product edits and avoids duplicates. The catalog read policies recognize the pinned Owner as well as approved sellers; pending sellers and signed-out visitors remain blocked. The Owner can manage these listings in the Seller dashboard once the separate `admin-portals.sql` upgrade is active.

Names, USD prices ($79.99, $59.99, $29.99, $49.99), and stock quantities are sample values. Product titles and descriptions disclose this. Images are illustrative, not a claim that the pictured brands are offered at these prices.

## Photos

Downloaded JPEG renditions are embedded in the import, so catalog rendering does not depend on an external image host. Sources are free photos under the [Unsplash License](https://unsplash.com/license); product records retain their credit and source URL.

- [Headphones — Totte Annerbrink](https://unsplash.com/photos/black-wireless-headphones-NehdOHCXsjs)
- [Keyboard — Christian Wiediger](https://unsplash.com/photos/closeup-photo-of-computer-keyboard-WkfDrhxDMC8)
- [Mouse — Pascal M.](https://unsplash.com/photos/black-cordless-computer-mouse-on-black-surface-4PchFKrUw84)
- [Speaker — Andres Jasso](https://unsplash.com/photos/white-bluetooth-speaker-iVcd6fyPIFE)

To rebuild after changing the source data: `python tools/build-owner-samples.py`.
