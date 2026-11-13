# The Dark Sparrow Eats

A static site for recipes you type in yourself, hosted on Cloudflare (moved from GitHub Pages). No build step and no framework.

## Open the site

From this folder, start a static file server and open the address it prints.

```bash
cd /workspace/recipe-site
python3 -m http.server 8000
```

Then visit http://localhost:8000 . Stop the server with Ctrl+C when you are done.

Use a local server rather than opening `index.html` as a file. Some browsers block scripts on `file://` pages.

## Add a recipe in recipes.js

Edit `recipes.js`. Every recipe is one object inside `window.RECIPES`. The array starts empty, so the site shows an empty journal until you add one.

Copy this object into the array, then change the text. Keep a comma between recipes. `id` is the link: lowercase words separated by hyphens, and unique for each recipe.

```js
window.RECIPES = [
  {
    id: "weeknight-tomato-soup",
    title: "Weeknight tomato soup",
    category: "Soups",
    tags: ["vegetarian", "quick"],
    timeMinutes: 35,
    servings: 4,
    image: "",
    ingredients: [
      "2 tbsp olive oil",
      "1 onion, diced",
      "2 cans crushed tomatoes"
    ],
    steps: [
      "Warm the oil and soften the onion.",
      "Add the tomatoes and simmer for 20 minutes.",
      "Season and serve."
    ],
    notes: "Better the next day."
  }
];
```

Save the file, then open `index.html` and raise the number in `recipes.js?v=8` (to `v=9`, `v=10`, and so on). That makes browsers fetch the new list right away instead of showing an older copy. Do the same for any other file you change.

The easier way is **Add a recipe** on the site itself (next section); it needs no file editing.

- `image` is a URL, a relative path such as `images/soup.jpg`, or `""` if there is no photo.
- Use `null` for `timeMinutes` or `servings` when you do not want them shown.
- `category` fills the category menu. `tags` are the small labels on each card.
- Search checks the title, category, tags, ingredients, steps, and notes.

## Add a recipe from a link (on the site)

Click **Add a recipe** at the top of any page. Paste a link to a recipe page and click **Get recipe**: the title, ingredients, method, time, and servings fill in for you to check. Click **Type a recipe in instead** for family recipes with no link. Click **Save recipe** (you need to be signed in; see Contributor accounts). It shows on the site right away for everyone.

How it works: most recipe sites publish their recipe in a standard format (schema.org "Recipe") for Google. `worker/index.js` runs on Cloudflare at `/api/import`, reads that data from the page you link to, and hands it back to the form. Some sites block this; the form then keeps the link and you type the rest in.

Recipes added this way are saved in the Supabase table `public.recipes`, not in `recipes.js`. Both kinds appear together on the site.

- **One-time setup:** in Supabase open **SQL Editor**, paste `supabase/add-recipes-table.sql`, change `CHANGE-THIS-CODE` near the bottom to your own owner code, and click **Run**.
- The owner code is switched off once `add-accounts.sql` has been run; saving then needs a contributor account.
- **Hide or remove a saved recipe:** Supabase → **Table Editor** → **recipes**. Set **hidden** to `true` to take it off the site, or delete the row.
- **Fix a typo in a saved recipe:** edit the row in the same table. Ingredients and steps are lists; each line is one item.
- Photos: the form leaves the photo link empty on purpose, because pictures on other sites belong to their owners. Paste a link to your own photo (it must start with `https://`).
Uploading a photo: on the Add a recipe form, click **Upload a photo** to take one with your phone or pick one from your computer. It's shrunk in the browser (longest side 1600 px, JPEG) and saved in the Supabase storage bucket `recipe-photos` when you click Save recipe. Uploading needs a contributor sign-in, just like saving.
- One-time setup: in Supabase open SQL Editor, paste supabase/add-photo-uploads.sql, and click Run. Until then the form says photo uploads aren't switched on, and photo links still work.
- Delete an uploaded photo: Supabase → Storage → recipe-photos → open the folder → pick the file → Delete. Then clear the recipe's image in Table Editor → recipes, or its card will simply show no photo.
- Copied method steps are the original cook's words. Rewriting them in your own words is good practice; the source link is always credited as "Adapted from" on the recipe page.

## Read a recipe from a photo (on the site)

On **Add a recipe**, under **Recipe card or cookbook page**, click **Choose photos**. On a phone you can take the picture right there. Up to 3 photos make one recipe, for example the front and back of a card. Click **Read recipe**. After about 10–60 seconds the form fills in. **Check every line against the card**, because handwriting can be misread. Anything the reader wasn't sure of is marked `[?]` and listed above the form. Then click **Save recipe** as usual.

Only a signed-in contributor can use it. The sign-in is checked before the photo is sent anywhere.

How it works: `worker/read-photo.js` runs on Cloudflare at `/api/read-photo`. It checks the contributor's sign-in with Supabase (`public.contributor_photo_read_ticket`), then sends the photo to the **Claude API**, which reads the recipe and hands the fields back to the form. The photo itself isn't kept. If you also want a picture of the finished dish, add it with **Upload a photo** in the form.

Each read costs a little on your Claude API account: a few cents at most with the default model. To limit spending:

- The site allows at most **50 photo reads a day**. Change the `50` in `supabase/add-photo-reading.sql` and run it again to change that.
- Set a monthly spend limit for the account at https://platform.claude.com (Settings → Limits).
- In `wrangler.jsonc`, change `PHOTO_MODEL` from `claude-sonnet-5-5` to `claude-haiku-5-5` for a cheaper reader. It's a bit less sure with messy handwriting.

### One-time setup

1. **Supabase:** open **SQL Editor**, paste `supabase/add-photo-reading.sql`, and click **Run**. Do this after `add-recipes-table.sql`, because it uses the same owner code.
2. **Claude API key:** sign in at https://platform.claude.com, open **API Keys**, and create a key named `dark-sparrow-eats`. Copy it; it's shown only once.
3. **Give the key to Cloudflare as a secret:** in the Cloudflare dashboard open **Workers & Pages** → **dark-sparrow-eats** → **Settings** → **Variables and Secrets** → **Add**. Choose type **Secret**, name it `ANTHROPIC_API_KEY`, paste the key, and deploy. Never put this key in any file in the repo; it's private, unlike the Supabase key.
4. Push this version to GitHub so Cloudflare publishes it, then try a recipe card.

Until steps 1–3 are done, the form says reading photos isn't switched on yet. Everything else keeps working.

## Edit a recipe (on the site)

Open the recipe and click **Edit this recipe** at the bottom of the page. The form opens already filled in. Change anything, including the photo (upload a new one, or click **Remove photo**). Click **Save changes** (you need to be signed in). Visitors see the changes the next time they open the recipe.

While you're signed in, an **Edit** button also appears next to **Print** at the top of every recipe.

Any recipe can be edited this way, including the ones written in `recipes.js`. For those, the edited version is saved in Supabase under the same id and shown instead of the copy in `recipes.js`. That means a later change typed into `recipes.js` won't show for a recipe you've already edited on the site; make further changes to it on the site instead.

**One-time setup:** in Supabase open **SQL Editor**, paste `supabase/add-recipe-editing.sql`, and click **Run**. Until then, saving changes says editing isn't switched on yet.

## Barcelona tile

The site's paving pattern is an original drawing in the spirit of Barcelona's *panot de flor* sidewalk tile. It appears tone-on-tone in the red header, as a tile bed behind the home page photo, and as a sidewalk strip above the footer. The tiles are small SVG files in `img/` (`panot-red.svg`, `panot-sand.svg`), placed by `styles.css`. To change their colors, edit the `COLORWAYS` in `img/make-panot.py` and run `python3 img/make-panot.py img`.

## Family album

Family photos live in `img/family/` and are listed in `family.js`, newest first. They show on the **Family album** page (`#/family`, linked in the top bar and footer). The first photo marked `feature: true` also replaces the stock photo beside the search box on the home page.

To add one: put the JPG in `img/family/` (about 1200 to 1600 pixels wide), copy an entry in `family.js` to the top of the list, fill in `src`, `width`, `height`, `alt` and `caption`, then raise `family.js?v=1` in `index.html`. Move `feature: true` to the new photo if it should go on the home page.

## Meal plan and shopping list

Anyone can plan the week's meals and make a shopping list. People who aren't signed in keep them on that device only (`localStorage`). **Signed-in contributors have them saved to their account**, so they can plan on a laptop and shop with a phone: changes go up within a second, each device picks up the latest when the page is opened or the tab is switched back to, and ticks made with no signal are sent once the phone is back online. Signing out clears that device's copy; it stays in the account. The first time someone signs in on a device, anything already planned there is added to their account.

**One-time setup for saving to accounts:** in Supabase open **SQL Editor**, paste `supabase/add-meal-plan-sync.sql`, and click **Run**. It creates the `meal_plans` table (one row per account, readable only by that account) and `save_meal_plan()`, which merges only the days and weeks that changed.

- **Meal plan** (`#/plan`, in the header): breakfast, lunch and dinner for each day, Sunday to Saturday, with arrows for other weeks. Pick a recipe or write a note ("Leftovers") for any meal; leave the rest empty. Recipe pages have an **Add to meal plan** button: choose the meal (breakfast recipes start on Breakfast, others on Dinner) and a day in the next 14 days.
- **Shopping list** (`#/shopping`): every ingredient from that week's planned meals, grouped by ingredient with each recipe's amount shown side by side (amounts aren't added up, since units often differ). Tick **already have** items, add your own items, then **Print** or **Copy list**. Both leave out what's already ticked.

Files: `planner.js` (pages and storage), `ingredients.js` (splits "1 medium onion, diced" into amount "1 medium" and ingredient "onion" so matching ingredients group together). If two recipes write the same thing differently ("kosher salt" vs "salt"), they show as separate lines.

## Contributor accounts

Reading recipes and leaving reviews need no account. **Adding and editing recipes, uploading dish photos, and reading recipe cards need a contributor account.** Accounts are invite-only, and people sign in with their email and a password. The owner code is no longer used.

### One-time setup in Supabase

1. **Turn off open sign-ups.** In the dark-sparrow-eats project open **Authentication**, then the sign-in settings (**Sign In / Providers**), and switch off **Allow new users to sign up**. Leave the **Email** provider on. (Even if this were left on, an account that wasn't invited can't save anything.)
2. **Tell Supabase the site's address.** Open **Authentication → URL Configuration**. Set **Site URL** to `https://recipes.the-dark-sparro.workers.dev` and add the same address under **Redirect URLs**. Invitation and password-reset emails link back here.
3. **Run the SQL.** Open **SQL Editor**, paste `supabase/add-accounts.sql`, and click **Run**. This adds the sign-in checks and switches the owner code off.
4. **Invite yourself first.** Open **Authentication → Users → Add user → Send invitation**, enter your email, and send. Open the email, click the link, and choose a password on the site.

### Invite, remove, or reset someone

- **Invite:** Authentication → Users → **Add user → Send invitation**. Only invited accounts can add or edit recipes. Use "Send invitation", not "Create new user", or the account won't count as invited.
- **Remove:** Authentication → Users → the person's row → **Delete user** (or ban them). They can't save anything from then on.
- **Forgotten password:** they click **Forgot your password?** on the sign-in page, or you can send a reset from their row in Users.

Supabase's built-in email sends only a few emails an hour, so invite people a few at a time. To send more, connect your own email service under **Authentication → Emails → SMTP Settings**. You can reword the invitation under **Authentication → Emails → Invite user**.

To bring the owner code back (alongside accounts or instead of them), run `supabase/restore-owner-code.sql`.

How it works: `auth.js` signs people in with Supabase Auth and keeps them signed in on that device. Saves send the sign-in to the `contributor_*` functions in `supabase/add-accounts.sql`, which check that the person is signed in with an invited account that hasn't been deleted or banned. The photo reader (`worker/read-photo.js`) passes the sign-in to Supabase the same way before calling Claude.

## Contributor guide

`guide/index.html` is a step-by-step page for people who add and edit recipes, at `/guide/` on the site. It's linked from the **Add a recipe** page and from the footer of every page. The screenshots are in `guide/img/`. To change the wording, edit `guide/index.html`; its styles are in `styles.css` under "Contributor guide".

## Hosting on Cloudflare

The site is served by **Cloudflare Workers**: the files are served as they are, and one small Worker script handles `/api/import`. These files control it:

| File | What it does |
|---|---|
| `wrangler.jsonc` | Names the Cloudflare project (`dark-sparrow-eats`) and tells Cloudflare to publish this folder as-is. |
| `.assetsignore` | Keeps `README.md`, `wrangler.jsonc`, `.gitignore` and other behind-the-scenes files off the public site. |
| `_headers` | Adds security headers. It lists the only outside sites the page may use: Google Fonts and the Supabase reviews project. |
| `worker/` | The small Cloudflare Worker behind **Add a recipe** (reads recipe links and recipe photos). Not published as files. |
| `supabase/` | The SQL for saved recipes, editing, photo uploads, and photo reading. Run each file once in Supabase. Not published. |
| `_redirects` | Sends old `/recipes/...` links (from the GitHub Pages days) to the right page. |
| `docs/` | A "we've moved" page for the old GitHub Pages address. Not published on Cloudflare. |

### First-time setup (one time only)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. Go to **Workers & Pages** → **Create** → **Import a repository**, connect GitHub, and pick the **recipes** repository.
3. Leave the build command **empty**. The deploy command is `npx wrangler deploy` (the default). Root directory: `/`.
4. Click **Deploy**. In about a minute the site is live. Ours is at `https://recipes.the-dark-sparro.workers.dev`.
5. Open the site, check that recipes, fonts, and ratings all show, and post a test review.

From then on, every change you push to GitHub is published automatically.

**Using Cloudflare Pages instead?** That works too: choose **Pages** → **Connect to Git**, framework preset **None**, build command empty, build output directory `/`. Pages reads `_headers` and `_redirects` the same way. It ignores `wrangler.jsonc` and `.assetsignore`, so `README.md` and `docs/` will be publicly visible there. That does no harm.

### Own domain (optional)

In the Cloudflare project go to **Settings** → **Domains & Routes** → **Add** → **Custom domain** and enter the domain. If the domain is registered elsewhere, Cloudflare shows the DNS change to make there.

### Retire the GitHub Pages copy

Do this only after the Cloudflare site works. People with the old `thedarrksparro.github.io/recipes/` link get forwarded to the new address, including links to a single recipe.

1. Open `docs/index.html` and `docs/404.html`. Both already point to `https://recipes.the-dark-sparro.workers.dev`; if the address ever changes, replace it there (it appears twice in each file) and commit.
2. On GitHub, open the repository → **Settings** → **Pages**. Under **Branch**, keep `main` but change the folder from `/ (root)` to `/docs`, and click **Save**.

Until you finish step 1, the page shows a "has moved" note and doesn't forward anyone.

### Test locally the Cloudflare way (optional)

The `python3 -m http.server` method above is still the easiest. To preview with Cloudflare's own headers and redirects, install Node.js and run `npx wrangler dev` in this folder, then open http://localhost:8787 .

## Home page

The home page shows one tile per category with that category's top-rated recipe (highest average, then most reviews, then title). Categories with no ratings yet show their first recipe by title. Each tile has a **See all** button that opens the full list for that category. Typing in search or picking a category also shows the full matching list, and **Top picks** goes back.

The same example is commented out at the top of `recipes.js`. Removing the `// ` at the start of those lines is valid JavaScript, but the page only shows objects inside `window.RECIPES`.

## Ratings and comments

Visitors can leave a 1–5 star rating with an optional name and comment on any recipe page. No sign-in is needed, but they must enter the **review code**, which you give out. Recipe cards on the home page show the average and the count.

Reviews are stored in a free Supabase project called **dark-sparrow-eats**:

- Table `public.reviews` holds every review (`recipe_id`, `rating`, `name`, `comment`, `created_at`, `hidden`).
- View `public.review_stats` gives the average rating and count per recipe, skipping hidden reviews.
- Visitors post through the database function `public.submit_review`, which checks the review code before saving. They cannot write to the table directly.
- `config.js` has the project URL and the public (publishable) key. The same URL is listed in `_headers`; if the Supabase project ever changes, update both. That key is safe in the browser. Never put a secret or `service_role` key in this site.
- The `recipe_id` saved with a review is the recipe's `id` in `recipes.js`. If you change an `id`, its old reviews stop showing.

Spam protection: visitors can only add reviews, never edit or delete them. The database rejects links in names and comments, and accepts at most 3 reviews per recipe and 10 site-wide per minute. The form also has a hidden honeypot field that bots tend to fill in.

### The review code

The code is checked by the database, not the browser, and is never stored in this repo. Only a bcrypt hash of it is kept in `private.review_code`, which visitors can't read. A visitor's browser remembers a correct code so they don't have to retype it.

To change the code, open **SQL Editor** in the Supabase project and run (replace `NEW_CODE`):

```sql
update private.review_code
set code_hash = extensions.crypt('NEW_CODE', extensions.gen_salt('bf')), updated_at = now();
```

If 20 wrong codes are tried across the site within 10 minutes, all review posting pauses until that window passes. This stops anyone guessing the code. Failed tries are logged in `private.review_code_failures`.

### Hide a bad comment

1. Sign in at https://supabase.com/dashboard and open the **dark-sparrow-eats** project.
2. Go to **Table Editor** and pick the **reviews** table.
3. Find the row, set **hidden** to `true`, and save.

The review disappears from the site and from the averages on the next page load. Set it back to `false` to show it again, or delete the row to remove it for good.
