# Personal portfolio

Laravel portfolio using Blade, CSS, and JavaScript. No Node build is needed for the portfolio page.

From PowerShell in this folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Open http://127.0.0.1:8000. Stop the server with Ctrl+C.

Edit `config/portfolio.php` to set your name, role, introduction, biography, skills, projects, and real email address. The contact link appears when email is configured. The projects are explicitly labeled sample concepts; replace them with your actual work. Update the hero heading in `resources/views/portfolio.blade.php` to change its two-line composition. Styles live in `public/css/portfolio.css`, and project filtering and dialogs in `public/js/portfolio.js`.

`serve.ps1` loads the workspace's `.php/conf.d` extension settings for the installed Windows PHP. For Artisan or Composer commands in a PowerShell session, set:

```powershell
$env:PHP_INI_SCAN_DIR = (Resolve-Path ..\.php\conf.d).Path
php artisan test
```

The project uses SQLite locally. Keep `.env` and the database private. For deployment, use a PHP-compatible Laravel host, configure production environment values, disable debug output, and set the web root to `public`. The CSS uses Google Fonts with system font fallbacks.
