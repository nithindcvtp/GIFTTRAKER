# Kurikalyanam – GitHub Pages + Google Sheets

Website (HTML/CSS/JS) is hosted free on **GitHub Pages**. Data is stored in a **Google Sheet** through a small **Google Apps Script** (JavaScript) backend.

```
index.html, style.css, app.js, config.js   -> upload to GitHub
apps-script/Code.gs                        -> paste into Google Apps Script
```

## 1. Create the Google Sheet
1. Go to https://sheets.google.com and create a blank sheet named **Kurikalyanam Data**.
2. Leave it empty. The tabs *People*, *Gifts* and *Occasions* are created automatically the first time you open the site.

## 2. Add the backend code (Apps Script)
1. In the sheet: **Extensions → Apps Script**.
2. Delete the sample code, then paste everything from `apps-script/Code.gs`.
3. Change `const SECRET = 'change-this-passcode';` to your own passcode. Save (Ctrl+S).
4. Click **Deploy → New deployment → ⚙ Select type → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, then **Authorize access** (choose your account → Advanced → Go to project → Allow).
6. Copy the **Web app URL** (ends in `/exec`).

> Whenever you edit `Code.gs` later: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same.

## 3. Put the URL in the website
Open `config.js` and replace `PASTE_YOUR_WEB_APP_URL_HERE` with the URL from step 2.

## 4. Host on GitHub Pages
1. Create a GitHub account, then **New repository** (e.g. `kurikalyanam`). Public is fine; Pages on private repos needs a paid plan.
2. **Add file → Upload files**: upload `index.html`, `style.css`, `app.js`, `config.js` (you may also upload the `apps-script` folder as a backup copy). Commit.
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)` → **Save**.
4. After about a minute your site is live at `https://YOUR-USERNAME.github.io/kurikalyanam/`.

## 5. First use
Open the site, enter the passcode from step 2.3 when asked (it is remembered on that device), and add your first gift. Open the Google Sheet to see the data.

## Notes
- The repository and website are public, so **never put the passcode in the repo** (it is only in Apps Script). Anyone without the passcode sees an empty app and cannot read or change data.
- Edit data in the Sheet only carefully: keep the header row and the `id` column intact. Don't sort rows in the *Gifts* tab and leave `user_id` unchanged.
- Apps Script handles one request at a time, so saves take about 1–2 seconds.
- To test locally: run `python3 -m http.server` in the folder and open http://localhost:8000.
