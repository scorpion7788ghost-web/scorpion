# Admin Console

The existing `admin.html` now contains ten sections: Dashboard, Account Management,
Seller Verification, Product Management, Order Management, Analytics & Reports,
Notifications, Customer Support, Security & Activity Logs, and Settings.
The Buyer website and separate Seller Site retain their existing layouts and login flows.

## Activate the database upgrade

1. In the existing Supabase project, open **SQL Editor**.
2. Confirm the previous `community-tools.sql`, `owner-access.sql`, and
   `admin-portals.sql` upgrades have been applied. Do not rerun `schema.sql` on an
   existing database.
3. Copy and run the **entire** [admin-console.sql](supabase/admin-console.sql) file.
4. Reload `admin.html` and sign in with an existing authorized Admin or Owner.

The upgrade is transactional and safe to rerun. It adds management tables and two
columns (`account_active` and product `moderation`), replaces the relevant guarded
functions, and installs audit triggers. It creates no example accounts, products,
orders or messages. Existing users remain active and existing products remain
approved. Existing category definitions are retained.

No new Edge Function deployment, secret browser key, or change to the website's
Supabase configuration is required. Existing account creation/deletion continues
using the deployed admin Edge Function. The new operations use authenticated SQL
RPCs. Until the upgrade is installed, the panel explains activation and keeps the
existing account tools and customer chat available.

## What is connected

| Section | Data and behavior |
| --- | --- |
| Dashboard | Real profile/product/order totals, pending applications, recent orders and recorded activity; interactive sales/growth chart. |
| Accounts | Existing create/edit/delete flows, name/username/email search, role/status filters, server-side sorting/pagination, details and activation/deactivation. |
| Verification | Pending/approved/rejected sellers, profile details, approval/rejection reason and history. Existing Worker approvals are also recorded going forward. |
| Products | All stores' product metadata, category/status/search filters, editing, moderation and removal from the storefront. Removal archives the original record for audit. |
| Orders | Database-backed order details, customer/seller names, date/status filters, tracking and valid status transitions. |
| Analytics | Daily/weekly/monthly UTC reports, paid sales less recorded refunds, growth and product/order statistics, selectable chart metrics and CSV export. |
| Notifications | In-app announcements to all users, Buyers, Sellers, Workers or an individual account; paginated history. Recipients read announcements from their profile dropdown. No email/SMS is sent. |
| Support | Existing private customer chat, unresolved ticket list, replies and open/in-progress/resolved status. A new customer message reopens a resolved ticket. |
| Activity | Admin/user sign-in successes, profile/product/permission database changes and administrative actions after activation. |
| Settings | Existing profile/password page, Owner-controlled Admin permissions and configuration, product moderation policy, Admin workspace name, support email record and per-Admin dashboard notices. |

Category availability is applied to the Seller product editor. Disabling a category
does not delete existing listings. Optional moderation applies to future non-Admin
seller changes; sellers cannot publish a rejected listing by changing its status.
Buyer cart saves also reject moderated or inactive-seller products.

Account type remains the existing Buyer/Seller/Worker login identity. Admin access
is an additional permission, granted/revoked only by the Owner. This upgrade does
not silently migrate identities between login namespaces. The Owner's identity,
credentials and permissions remain immutable, including on the profile page.

## Current integration boundaries

- **Checkout/payments:** the existing store has no checkout/payment provider.
  `lk_orders` starts empty. Only trusted server code can ingest orders; Admins
  cannot invent revenue through the browser. `service_role` can write this table
  for a future checkout integration. Keep that key on a server only.
- **Refunds/cancellations:** recorded refunds contribute to reports. Issuing a
  payment refund is unavailable until a provider is integrated. Only unpaid,
  processing orders can be cancelled here. Shipped orders can become delivered;
  completed/cancelled orders cannot be reopened through the Admin UI.
- **Documents:** the existing seller registration form has no document upload.
  The review displays “No documents submitted” unless a trusted integration has
  populated the private `lk_seller_documents` table. The Admin detail view can
  display image documents using the existing safe-image validator. Uploading and
  validating new identity documents is a separate seller-flow integration.
- **History:** new event and seller decision history begins at activation; the UI
  does not invent past reviews. Existing account-audit records are preserved.
  Auth-service account creation/deletion events without a user JWT are attributed
  to System. Failed-login/IP/provider alerts remain in Supabase Auth logs.
- **Configuration:** the Admin workspace name and support email are management
  settings, not a global rebrand of existing Buyer/Seller page copy. Product
  moderation is enforced by the backend immediately for subsequent changes.
- **Other providers:** the new console requires Supabase; the legacy PHP/file
  backend's existing features are preserved but do not implement these new RPCs.

## Security

All new tables have RLS enabled and browser table grants revoked. Every elevated
read or command rechecks `auth.uid()` against the current approved, active Admin
membership. No service-role key is added to browser files. SQL functions use an
empty `search_path` and qualified object names, following
[Supabase's function security guidance](https://supabase.com/docs/guides/database/functions).

Account suspension denies data access even for previously issued tokens. Only the
Owner may manage other Admins or change the moderation configuration. Direct calls
cannot edit/suspend the Owner or grant Admin rights as a regular Admin/Worker.
Profile ownership, seller isolation and chat privacy remain enforced in SQL.
New private messages and audit events are rendered as text, not HTML.

## Verification

`tests/admin-console-database.test.cjs` applies the actual SQL twice in isolated
PostgreSQL, checks every section, protected roles, input errors, suspension,
moderation, categories, order transitions, report totals, recipient privacy,
notification retry deduplication, support reopening and audit/login records.

`tests/admin-console-ui.test.cjs` runs the real Admin HTML and scripts against a DOM
and transport double. Existing account, authentication, profile/theme, adapter,
chat and storefront suites remain regression checks. No test creates live accounts.

The stylesheet has desktop, tablet and mobile layouts, collapsible navigation,
scrollable tables, native dialogs and reduced-motion support. Automated browser
rendering is not available in the current development session; final visual
checks at 1440px, 1024px and 390px remain a manual verification step.
