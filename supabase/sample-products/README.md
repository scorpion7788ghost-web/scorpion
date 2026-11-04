# Owner sample tech products

These four sample products were explicitly requested by the store owner. They belong to the pinned **Scorpion Owner account**, not a new seller or demo account.

Run the complete [owner-sample-products.sql](../owner-sample-products.sql) in the project's Supabase SQL Editor after `owner-access.sql`. The Results panel should list four active products. Refresh the Buyer website while signed in; they appear in Newly Added Products, Recommended for You, search, and their individual product pages.

The import creates an Owner storefront only if missing. It never edits the Owner profile or role, grants seller access, replaces existing products, or changes other sellers' records. Re-running it preserves imported product edits and avoids duplicates. The catalog read policies recognize the pinned Owner as well as approved sellers; pending sellers and signed-out visitors remain blocked. This import does not add a Seller dashboard to the Owner's customer login. Manage these seeded records through Supabase until an Owner product-management interface is added.

Names, USD prices ($79.99, $59.99, $29.99, $49.99), and stock quantities are sample values. Product titles and descriptions disclose this. Images are illustrative, not a claim that the pictured brands are offered at these prices.

## Photos

Downloaded JPEG renditions are embedded in the import, so catalog rendering does not depend on an external image host. Sources are free photos under the [Unsplash License](https://unsplash.com/license); product records retain their credit and source URL.

- [Headphones — Totte Annerbrink](https://unsplash.com/photos/black-wireless-headphones-NehdOHCXsjs)
- [Keyboard — Christian Wiediger](https://unsplash.com/photos/closeup-photo-of-computer-keyboard-WkfDrhxDMC8)
- [Mouse — Pascal M.](https://unsplash.com/photos/black-cordless-computer-mouse-on-black-surface-4PchFKrUw84)
- [Speaker — Andres Jasso](https://unsplash.com/photos/white-bluetooth-speaker-iVcd6fyPIFE)

To rebuild after changing the source data: `python tools/build-owner-samples.py`.
