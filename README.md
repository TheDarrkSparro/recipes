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

Click **Add a recipe** at the top of any page. Paste a link to a recipe page and click **Get recipe**: the title, ingredients, method, time, and servings fill in for you to check. Click **Type a recipe in instead** for family recipes with no link. Enter your **owner code** and click **Save recipe**. It shows on the site right away for everyone.

How it works: most recipe sites publish their recipe in a standard format (schema.org "Recipe") for Google. `worker/index.js` runs on Cloudflare at `/api/import`, reads that data from the page you link to, and hands it back to the form. Some sites block this; the form then keeps the link and you type the rest in.

Recipes added this way are saved in the Supabase table `public.recipes`, not in `recipes.js`. Both kinds appear together on the site.

- **One-time setup:** in Supabase open **SQL Editor**, paste `supabase/add-recipes-table.sql`, change `CHANGE-THIS-CODE` near the bottom to your own owner code, and click **Run**.
- **Change the owner code:** run the last statement in that file again with the new code.
- **Hide or remove a saved recipe:** Supabase → **Table Editor** → **recipes**. Set **hidden** to `true` to take it off the site, or delete the row.
- **Fix a typo in a saved recipe:** edit the row in the same table. Ingredients and steps are lists; each line is one item.
- Photos: the form leaves the photo link empty on purpose, because pictures on other sites belong to their owners. Paste a link to your own photo (it must start with `https://`).
Uploading a photo: on the Add a recipe form, click **Upload a photo** to take one with your phone or pick one from your computer. It's shrunk in the browser (longest side 1600 px, JPEG) and saved in the Supabase storage bucket `recipe-photos` when you click Save recipe. Uploading needs your owner code, just like saving.
- One-time setup: in Supabase open SQL Editor, paste supabase/add-photo-uploads.sql, and click Run. Until then the form says photo uploads aren't switched on, and photo links still work.
- Delete an uploaded photo: Supabase → Storage → recipe-photos → open the folder → pick the file → Delete. Then clear the recipe's image in Table Editor → recipes, or its card will simply show no photo.
- Copied method steps are the original cook's words. Rewriting them in your own words is good practice; the source link is always credited as "Adapted from" on the recipe page.

## Hosting on Cloudflare

The site is served by **Cloudflare Workers**: the files are served as they are, and one small Worker script handles `/api/import`. These files control it:

| File | What it does |
|---|---|
| `wrangler.jsonc` | Names the Cloudflare project (`dark-sparrow-eats`) and tells Cloudflare to publish this folder as-is. |
| `.assetsignore` | Keeps `README.md`, `wrangler.jsonc`, `.gitignore` and other behind-the-scenes files off the public site. |
| `_headers` | Adds security headers. It lists the only outside sites the page may use: Google Fonts and the Supabase reviews project. |
| `worker/` | The small Cloudflare Worker behind **Add a recipe** (reads recipe links). Not published as files. |
| `supabase/` | The SQL that creates the saved-recipes table. Run it once in Supabase. Not published. |
| `_redirects` | Sends old `/recipes/...` links (from the GitHub Pages days) to the right page. |
| `docs/` | A "we've moved" page for the old GitHub Pages address. Not published on Cloudflare. |

### First-time setup (one time only)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. Go to **Workers & Pages** → **Create** → **Import a repository**, connect GitHub, and pick the **recipes** repository.
3. Leave the build command **empty**. The deploy command is `npx wrangler deploy` (the default). Root directory: `/`.
4. Click **Deploy**. In about a minute the site is live at `https://dark-sparrow-eats.<your-account>.workers.dev`.
5. Open the site, check that recipes, fonts, and ratings all show, and post a test review.

From then on, every change you push to GitHub is published automatically.

**Using Cloudflare Pages instead?** That works too: choose **Pages** → **Connect to Git**, framework preset **None**, build command empty, build output directory `/`. Pages reads `_headers` and `_redirects` the same way. It ignores `wrangler.jsonc` and `.assetsignore`, so `README.md` and `docs/` will be publicly visible there. That does no harm.

### Own domain (optional)

In the Cloudflare project go to **Settings** → **Domains & Routes** → **Add** → **Custom domain** and enter the domain. If the domain is registered elsewhere, Cloudflare shows the DNS change to make there.

### Retire the GitHub Pages copy

Do this only after the Cloudflare site works. People with the old `thedarrksparro.github.io/recipes/` link get forwarded to the new address, including links to a single recipe.

1. Open `docs/index.html` and `docs/404.html`. In each, replace `https://dark-sparrow-eats.YOUR-ACCOUNT.workers.dev` (it appears twice) with the real Cloudflare address. Commit.
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
