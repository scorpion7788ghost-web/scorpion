# LK Tech Store

The customer store and **Seller Site** are separate websites with separate customer/seller login access. There are no demo accounts or sample products.

## Shared storage directly from GitHub Pages

The new [Supabase setup](SUPABASE-SETUP.md) uses hosted authentication and database records without PHP or Render. Create the project, run `supabase/schema.sql`, configure username authentication, and enter its Project URL and public publishable key in both copies of `assets/store-config.js`. The project is not connected yet; the browser reports missing configuration until those values are supplied.

The existing local PHP/GitHub-file option remains available below. Existing records are not automatically moved between backends.

## Alternative: PHP hosting on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fscorpion7788ghost-web%2Fscorpion)

This creates two separate PHP web services using the Free preview plan. Enter a private-repository GitHub token into each service's **LK_GITHUB_TOKEN** secret field in Render. The token must have Contents read/write access to `lk-tech-store-data` only. Never commit the token.

Follow [the deployment guide](DEPLOYMENT.md) for setup, limits, and verification. With this PHP option, open the customer and seller URLs assigned by Render. For registration on the `github.io` URLs instead, connect the Supabase option above.

## Run locally

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start-sites.ps1 -Storage GitHub -UseGitCredentialManager
```

- Customer store: http://127.0.0.1:8080/
- Seller Site: http://127.0.0.1:8081/

See [account storage and architecture](SELLER-SITE.md) for details and test commands.
