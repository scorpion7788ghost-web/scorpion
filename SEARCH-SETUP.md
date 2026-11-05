# Buyer advanced search

The Buyer homepage keeps one search bar in the header. Typing shows up to six product suggestions with pictures and prices. Arrow keys navigate suggestions; Enter selects one, Escape closes the dropdown, and the Search button searches the typed query. Both routes open `search.html`; selecting a suggestion scopes the results to that product. Product cards continue to open the single-product page.

The search results page combines category, brand, and inclusive minimum/maximum USD price filters above a responsive product grid. Text searches names, summaries, descriptions, categories, and brands. Filters are stored in the URL for refreshing, bookmarking, and sharing. Clear filters preserves the submitted query; Browse all products removes the query too. Invalid or reversed price ranges show an explanatory message. Existing products with no brand are available under **Brand not specified**; brands are never guessed from names or photographs. The homepage retains its category tabs for browsing recommendations but has no duplicate text search or advanced filter panel.

## Enable brands in Seller product forms

Run the complete [supabase/product-brands.sql](supabase/product-brands.sql) in Supabase SQL Editor, then refresh the Seller Add Product or Edit Product page. The optional Brand field appears only when the backend reports that brand storage is available. Buyer filters work before this upgrade; existing items simply have no specified brand.

The upgrade replaces the product and draft save functions, preserving their seller ownership, approval, and validation checks. It does not modify existing product records or permissions. It is safe to run again. Sellers can enter up to 60 characters; older clients that omit the field preserve a saved product's brand. New projects using the updated `schema.sql` already include this support.

This capability is implemented for the live Supabase deployment. The legacy PHP backend keeps its existing product fields and does not expose Brand editing.

Checks: `tests/search-navigation.test.cjs`, `tests/catalog-search.test.cjs`, `tests/storefront-flows.test.cjs`, and `tests/product-brands.test.cjs`. Tests use isolated product data and PostgreSQL, never live account credentials.
