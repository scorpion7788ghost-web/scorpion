# LK Tech Store

The customer store and **Seller Site** are separate websites with separate customer/seller login access. Real registrations, store details, products, and carts are saved as JSON files in the private `lk-tech-store-data` GitHub repository through a PHP backend. There are no demo accounts or sample products.

## Host the working websites

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fscorpion7788ghost-web%2Fscorpion)

This creates two separate PHP web services using the Free preview plan. Enter a private-repository GitHub token into each service's **LK_GITHUB_TOKEN** secret field in Render. The token must have Contents read/write access to `lk-tech-store-data` only. Never commit the token.

Follow [the deployment guide](DEPLOYMENT.md) for setup, limits, and verification. After deployment, open the customer and seller URLs assigned by Render. The `github.io` URLs are static previews and cannot run registration or login.

## Run locally

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start-sites.ps1 -Storage GitHub -UseGitCredentialManager
```

- Customer store: http://127.0.0.1:8080/
- Seller Site: http://127.0.0.1:8081/

See [account storage and architecture](SELLER-SITE.md) for details and test commands.
