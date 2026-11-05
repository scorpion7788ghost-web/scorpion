# Activate the Scorpion Owner account

## Owner-created Admins and access to all three sites

After the original Owner setup below, run all of [supabase/admin-portals.sql](supabase/admin-portals.sql) in the same Supabase SQL Editor. It can be rerun and preserves existing accounts and products. No Edge Function redeployment is required.

The Owner can choose **Admin** in **Add account**. This creates a Buyer identity and then grants Admin access using the existing Owner-authorized database function. If the grant fails, the UI reports that the Buyer was created and directs the Owner to **Edit → Role → Admin**, without repeating account creation. Existing users can also be promoted through Edit. Regular Admins cannot grant Admin permissions; the database independently enforces this rule.

Approved Admins and the Owner can use the same username/password on the Buyer, Seller, and Admin login pages. On the current GitHub Pages sites, they also share a sign-in session and can switch using the profile menu. The account's original identity and role remain unchanged. Ordinary users retain their existing separate login access. If identical usernames/passwords exist in different account types, the login page prioritizes its native account type; sign in through the Admin's original portal before switching sites.

An Admin's first Seller visit opens or creates only their own shop. Product edits, drafts, store settings, and cart writes still check the authenticated identity on the backend. Admin access does not permit modifying another seller's inventory. Removing Admin access immediately removes cross-role database privileges, while preserving the original account's normal access and stored data. The protected Owner remains uneditable. Shared logout clears the staff session across both current sites; deploying the sites on different origins would require signing in on each origin.

Checks: `tests/admin-portals-database.test.cjs`, `tests/supabase-store.test.cjs`, and `tests/admin-ui.test.cjs` cover cross-role access, ordinary/pending-user denials, immediate revocation, private inventory, Owner-only grants, and partial creation recovery.

## Original Owner setup

Run the complete [supabase/owner-access.sql](supabase/owner-access.sql) in [Supabase SQL Editor](https://supabase.com/dashboard/project/sukeowjxzqgszdvbpves/sql/new), after the existing community-tools upgrade. This is safe to rerun. No accounts or products are created or removed. The existing `rapid-handler` Edge Function does not need redeployment.

The migration pins ownership to the Auth ID of the existing **customer account with username `scorpion`**. Display names, editable contact emails, other portals with the same username, browser flags and Auth user metadata cannot claim ownership. The private Owner table explicitly enables Row Level Security and revokes direct access from browser and service roles; only the protected database functions access it.

If SQL Editor still shows the earlier warning about missing RLS, cancel and replace the entire editor contents with the updated SQL file. A destructive-operations warning can remain because the migration replaces triggers and defines guarded account-management functions containing DELETE statements. Running the migration does not delete existing accounts or products. Run the whole file and check the Results pane for success; a confirmation-dialog click alone does not establish that the transaction succeeded.

| Action | Owner | Regular Admin |
| --- | --- | --- |
| Manage Buyer, Seller and Worker accounts | Yes | Yes |
| Promote an account to Admin or remove Admin access | Yes | No |
| Edit another Admin's details | Yes | No |
| Edit, delete, demote or replace the Owner | No | No |

As requested, the Owner account is immutable: its profile, identity, credentials, metadata and permissions cannot be edited through the website or Auth endpoints, even by the Owner. My Account is read-only for this account. Normal sign-in timestamps and session/token maintenance remain allowed. Future credential or ownership maintenance requires deliberate action by the trusted Supabase project operator; the website exposes no bypass.

The existing account service protects all Admin accounts from deletion. To remove another Admin, the Owner first removes their Admin access, then uses the existing typed-username deletion confirmation. The Owner itself cannot be demoted or deleted. Database triggers also block direct Owner Auth deletion, cascade deletion, profile edits, credential changes and unauthorized Admin membership changes.

Ownership is an additional permission on the existing account; `scorpion` keeps its username, password, Buyer account, store access and Admin features. Existing Admins remain Admins, with the restricted permissions above. Account changes continue to use the existing audit trail.

Verification: `tests/owner-database.test.cjs` executes the migration twice in isolated PostgreSQL and checks promotions, demotions, direct Auth/profile deletion, metadata spoofing, credential protection, normal sign-in updates and ordinary account deletion. `tests/admin-ui.test.cjs` checks the matching UI restrictions. `lk_owner_status` returns `{"version":1}` once installed. Real-account sign-in and browser rendering should also be checked after activation.
