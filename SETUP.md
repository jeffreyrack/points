# Points — setup

Files:

- `Code.gs` — the Google Apps Script that reads/writes the sheet and serves JSON.
- `index.html` — the phone app.
- `icon.png` — home screen icon (180×180).

## 1. Create the sheet + script

1. Make a new Google Sheet (name it whatever, e.g. "Points").
2. **Extensions → Apps Script**. Delete the placeholder `myFunction` code.
3. Paste in all of `Code.gs`, then save.
4. In the function dropdown pick **`setup`** and click **Run**. Approve the
   permissions prompt (it's your own script; click *Advanced → Go to … (unsafe)*
   if Google warns about an unverified app).

That creates three tabs, seeded:

| Users | | | Rewards | | | Log |
|---|---|---|---|---|---|---|
| Jake | 25 | | Ice Cream | 30 | 🍦 | *(written automatically)* |
| Luke | 25 | | Extra book | 5 | 📚 | |

## 2. Pick how the HTML gets served

You **cannot** just open `index.html` from the phone's filesystem. iOS Safari
won't load `file://` URLs, and tapping an `.html` file in the Files app gives a
Quick Look preview whose share sheet has no *Add to Home Screen* — that action
only exists in Safari. So the page has to come over `https://`. Two ways:

### Option A — let Apps Script serve it (no hosting, no extra accounts)

1. In the Apps Script editor: **Files → + → HTML**, name it **`Page`**.
2. Delete its contents and paste in all of `index.html`.
3. Deploy (step 3 below). Opening the `/exec` URL in a browser now returns the
   app itself.

The script substitutes its own URL into the page, so **there's nothing to
configure on the phone** — open the link and it's already connected.

Tradeoff: Apps Script wraps your page in its own frame, so iOS treats Google's
wrapper as the page. You get Safari's toolbars instead of true full-screen, and
the home screen icon and name come from that wrapper rather than `icon.png`.

### Option B — host `index.html` yourself (nicer on the phone)

Already done — this repo is published at:

**https://jeffreyrack.github.io/points/**

Open that in Safari on the phone. Because it's a real origin, iOS honors the
meta tags: full-screen launch, "Points" as the name, and the star icon. Pushing
to `main` redeploys it within a minute or so.

You paste the Web App URL into the app once per phone; it's kept in that
browser's local storage. **The URL is the only secret — publishing `index.html`
publicly is fine, since the URL isn't in the file.**

A public repo is therefore the simplest choice, and on a free GitHub account
it's the only one: Pages serves private repos only on Pro/Team/Enterprise. Note
that a private repo still produces a *publicly reachable* site — hiding the site
itself needs Enterprise Cloud. Cloudflare Pages and Netlify both deploy from
private repos on their free tiers if you want the source closed.

Don't hardcode your `/exec` URL into `index.html` to skip the paste step — that
turns the file into a secret. Use Option A if you want zero configuration.

Don't bother with iCloud Drive or Dropbox share links — they serve a preview
page, not the raw HTML.

## 3. Deploy the Web App

In the Apps Script editor (**Extensions → Apps Script** from the Sheet):

1. **Deploy** (top right) → **New deployment**.
2. Click the **⚙ gear** next to "Select type" → **Web app**.
3. Execute as: **Me**. Who has access: **Anyone**.
4. Deploy, approve, and copy the **Web app URL** — it ends in `/exec`.

### Finding the URL again

**Deploy → Manage deployments** → click the active deployment → copy the Web app
URL. Or run the `showUrl` function from the editor's dropdown and read the
execution log.

Two things that look like the URL but aren't:

- The editor's own address bar (`script.google.com/home/projects/…/edit`) — that's
  the editor, not the API.
- **Deploy → Test deployments** gives a `/dev` URL. It only works for accounts
  with edit access to the script, so it'll work on your phone and fail on
  everyone else's. Always use `/exec`.

None of this involves Google Cloud or App Engine — Apps Script is self-contained.

"Anyone" means anyone with the URL can read and change the points, so treat that
URL like a password. There's no login on the app itself.

## 4. Put it on the iPhone home screen

1. In **Safari**, open https://jeffreyrack.github.io/points/
2. Tap **Share** (the box with the up arrow, center of the bottom toolbar) →
   scroll down → **Add to Home Screen**. If that action is missing, tap
   **Edit Actions…** and enable it.
3. The name pre-fills as "Points". Tap **Add**.
4. **Launch it from the icon, and paste the `/exec` URL there** — not in Safari
   first. A home screen web app can get its own storage container separate from
   Safari's, so a URL saved in Safari may not carry over.

Under Option B it opens full-screen with no browser chrome. Under Option A you'll
see Safari's toolbars, because Apps Script serves the page inside its own frame.

Repeat on the second phone; you'll paste the Web App URL again on that device.
Keep the URL somewhere you can find it — a password manager or a note.

If the app ever forgets the URL, tap **⚙** and paste it again.

## Using it

- Tap **Jake** or **Luke** to select them; the card highlights.
- The −5 / −1 / … / +1 / +5 row awards or removes points, and asks what for.
- Tap a reward to spend. Rewards you can't afford are greyed out.
- Everything lands in the **Log** tab with a timestamp and running balance.
- **↻** re-reads the sheet. **⚙** lets you re-enter the Web App URL.

There's no live sync — if two phones have it open, tap **↻** to pick up changes
made elsewhere.

## Changing rewards and users

Edit the sheet directly, then hit **↻** in the app.

- **Rewards** tab: add a row with `Reward | Cost | Emoji`. The emoji column is
  optional — blank falls back to 🎁. Rewards sort cheapest-first in the app.
- **Users** tab: add a row with `Name | Points`. The app lays users out two per
  row, so a third user just wraps onto the next line.

No redeploy needed for sheet edits. If you change `Code.gs` or `Page.html`, you
do need **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** —
that keeps the same URL.

## Notes

- The app calls the script with JSONP (a `<script>` tag) rather than `fetch`, so
  it works from any origin without CORS configuration.
- Redeems and adjustments take a script lock, so two phones tapping at the same
  moment can't spend the same points twice.
- Balances can't go below zero; a −5 on a 3-point balance lands on 0.
