/* Recipes now live in the database (Supabase, table public.recipes).
   Add and edit them on the site: sign in, then use "Add a recipe" or a
   recipe's Edit button.

   The 12 recipes that used to be written here were moved there by
   supabase/move-recipes-js.sql (November 2026). Their old text is still in
   this file's history on GitHub.

   This list is kept, empty, so the site keeps working the same way. A recipe
   placed here would still show up (and one with hidden: true would show
   only to the site owner), but the database is the place for them now. */
window.RECIPES = [];
