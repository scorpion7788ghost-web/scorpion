# Activate directories, Admin editing, and support chat

Run the entire [supabase/community-tools.sql](supabase/community-tools.sql) file in your project's [Supabase SQL Editor](https://supabase.com/dashboard/project/sukeowjxzqgszdvbpves/sql/new). It follows the existing Worker upgrade, is safe to rerun, and preserves all accounts, products and seller approvals. No Edge Function redeployment is needed.

The migration provides:

- A paginated, searchable directory of every Seller and Worker, including pending sellers. Workers can view names, usernames, roles, verification status and registration date. Customer lists and contact emails remain Admin-only.
- An Admin directory and editing action. An Admin can edit another account's display name, contact email and Admin access. Removing Admin access restores its existing Buyer, Seller or Worker role; it does not convert a store account or change its username/login. Permission changes are serialized, checked on the server and audited. Admins cannot change their own access through this action. No new Admin is granted by this migration.
- Private customer conversations on Contact Me, an Admin inbox, message history, manual refresh and polling while visible. Messages are text-only, limited to 2,000 characters and 12 sends per minute per sender. Retrying the same send does not duplicate the message. Customers read only their own conversation; Workers and Sellers have no chat access unless explicitly granted Admin access. There are no automated or sample replies.

Verify activation by calling `lk_community_status` using the existing public browser configuration: it returns `{"version":1}`. The SQL regression tests in `tests/community-database.test.cjs` use an isolated PostgreSQL database, not the live project.

After running the SQL, refresh the website and verify with your own accounts: browse the Worker directory, edit another account from Admin → Admins, send a customer message through Contact Me, then reply from Admin → Messages. The original four themes remain, with Black Primary and White Primary added. Theme preferences are browser-specific and shared across both GitHub Pages sites. Decorative animated backgrounds appear only on customer pages and stop when reduced motion is requested.

## Owner protection upgrade

After installing [OWNER-SETUP.md](OWNER-SETUP.md), only the pinned Scorpion Owner may grant/remove Admin access or edit Admin accounts. The Owner itself is immutable. Regular Admins manage ordinary Buyer, Seller and Worker accounts. Apply `owner-access.sql` after the community migration; do not reinstall older permission migrations on their own.
