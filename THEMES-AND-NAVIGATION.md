# Themes and profile navigation

All customer, seller, Admin, Worker, registration, and waiting pages share four themes: Plum Dark, Ocean Dark, Black Primary, and White Primary. Saved Plum Light and Ocean Light preferences automatically switch to Plum Dark and Ocean Dark respectively.

The choice is saved under `lk-store-theme-v1` in browser local storage. Both deployed GitHub Pages sites have the same origin, so they share the preference and synchronize changes across open tabs. Preferences remain browser-specific. When storage is blocked, selection works for the current page and the picker explains that it cannot persist it. `theme.js` runs before the page paints; `tools/build-themes.py` generates the shared palette variables for all existing stylesheets. Product image files are unchanged.

Profile navigation:

| Page | Destinations |
| --- | --- |
| Administrator | Seller, Worker (seller reviews), Buyer |
| Worker | Buyer, Seller; Admin Panel only with a server-confirmed administrator grant |
| Seller | Buyer Site |
| Buyer | Become a Seller; Admin Panel for the authorized administrator |

All signed-in menus also include My Account, Appearance and Logout. Public sign-in/registration pages include Sign In and Appearance. Moving between sites uses the existing separate role sessions: it does not create an account, copy credentials or bypass approval. Administrators open the seller review workspace directly through the Worker link, using their existing administrator permission.

The existing `scorpion` administrator remains authorized by its immutable Auth ID in `lk_admins`. Editable contact email, display name, browser storage and URL parameters cannot confer administrator access. The UI checks `lk_is_admin`; the Edge Function independently checks that permission before listing or managing accounts. An explicitly authorized Worker can use `admin.html?portal=worker` with their own session. A normal Worker receives an access denial even when visiting that URL directly. This change creates no new administrator grants and requires no SQL migration or Edge Function redeployment.

Verification: `tests/profile-theme.test.cjs`, `tests/access.test.cjs`, `tests/auth-flows.test.cjs`, `tests/admin-function.test.cjs`, and `python tests/check-pages.py`. Browser visual inspection requires an available browser connection.

The community upgrade adds an Admin side panel, read-only Worker directory, and private customer support messages. See [COMMUNITY-SETUP.md](COMMUNITY-SETUP.md) for the SQL activation and access rules. The initial scorpion Admin may explicitly grant or remove Admin access for other existing accounts; no account receives that permission automatically.

The [Owner upgrade](OWNER-SETUP.md) pins Scorpion as Owner and limits Admin permission changes to that account. Profile menus and the account directory show the server-confirmed Owner label.
