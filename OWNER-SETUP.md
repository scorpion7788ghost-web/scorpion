# Activate the Scorpion Owner account

Run the complete [supabase/owner-access.sql](supabase/owner-access.sql) in [Supabase SQL Editor](https://supabase.com/dashboard/project/sukeowjxzqgszdvbpves/sql/new), after the existing community-tools upgrade. This is safe to rerun. No accounts or products are created or removed. The existing `rapid-handler` Edge Function does not need redeployment.

The migration pins ownership to the Auth ID of the existing **customer account with username `scorpion`**. Display names, editable contact emails, other portals with the same username, browser flags and Auth user metadata cannot claim ownership. The private Owner record has no browser-accessible write path.

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
