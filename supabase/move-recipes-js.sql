-- The Dark Sparrow Eats: move the recipes from recipes.js into the database
-- Run this ONCE in Supabase, BEFORE merging the change that empties
-- recipes.js: open the dark-sparrow-eats project, go to SQL Editor, paste this
-- whole file, and click Run. It is safe to run again.
--
-- It copies the 12 recipes that were written in recipes.js into
-- public.recipes, with the same ids, so links, ratings, meal plans, hidden
-- settings and contributor names all stay attached.
--
-- A recipe that was already edited on the site keeps the edited version; only
-- its date is set back so it sorts with the others. Nothing is deleted.
--
-- At the end it lists all 12 recipes; each should say
-- in_database = true. If any says false, don't merge; send a screenshot instead.

insert into public.recipes
  (id, title, category, tags, time_minutes, servings, image, ingredients, steps, notes, source_url, created_at)
select r.id, r.title, r.category, r.tags, r.time_minutes, r.servings, r.image,
       r.ingredients, r.steps, r.notes, r.source_url, r.created_at
from jsonb_to_recordset($recipes$
[
 {
  "id": "grandma-style-white-sandwich-bread",
  "title": "Grandma-Style White Sandwich Bread",
  "category": "Bread",
  "tags": [
   "yeast bread",
   "loaf"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1598373182308-3270495d2f58?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "3½ to 4 cups (420 to 480 g) all-purpose flour or bread flour",
   "1 cup (240 ml) whole milk, warm",
   "¼ cup (60 ml) warm water",
   "2¼ teaspoons (1 packet) active dry yeast",
   "3 tablespoons sugar",
   "4 tablespoons unsalted butter, softened",
   "1½ teaspoons salt",
   "1 large egg"
  ],
  "steps": [
   "Activate the yeast: Combine warm water, warm milk, sugar, and yeast in a large bowl. Let sit for 5 to 10 minutes until foamy.",
   "Make the dough: Add the egg, softened butter, salt, and 3 cups of flour. Mix until a shaggy dough forms. Gradually add more flour until the dough is soft and slightly tacky but not sticky.",
   "Knead: Knead by hand for 8 to 10 minutes, or with a mixer for 5 to 6 minutes. The dough should become smooth and elastic.",
   "First rise: Place in a lightly greased bowl. Cover and let rise in a warm place for about 1 to 1½ hours, or until doubled.",
   "Shape: Punch down the dough. Flatten it into a rectangle, roll it up tightly, and place seam-side down in a greased 9 x 5-inch loaf pan.",
   "Second rise: Cover and let rise for 30 to 60 minutes until the dough crowns about 1 inch above the rim of the pan.",
   "Bake: Bake at 350°F (175°C) for 30 to 35 minutes. The loaf should be golden brown and sound hollow when tapped.",
   "Finish: Brush the top with a little melted butter while hot for a soft crust. Cool completely before slicing."
  ],
  "notes": "Makes 1 large loaf.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:00.000Z"
 },
 {
  "id": "smoky-mustard-pickles",
  "title": "Smoky Mustard Pickles",
  "category": "Pickles",
  "tags": [
   "pickles"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1621378580334-79a6845bb3e7?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "1 lb cucumbers",
   "1 cup white vinegar",
   "1 cup water",
   "2 tbsp sugar",
   "1 tbsp mustard seeds",
   "1 tsp smoked paprika",
   "2 tsp fine salt"
  ],
  "steps": [],
  "notes": "From a Primo Recipes card. The card lists ingredients only, with no steps.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:01.000Z"
 },
 {
  "id": "easy-beef-chili",
  "title": "Easy Beef Chili",
  "category": "Soups & Stews",
  "tags": [
   "beef",
   "beans"
  ],
  "time_minutes": null,
  "servings": "6-8",
  "image": "https://images.unsplash.com/photo-1658308766948-01c85ade2737?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "1 lb ground beef (80/20 or 85/15)",
   "1 medium onion, diced",
   "3 cloves garlic, minced",
   "1 bell pepper, diced (optional)",
   "2 tbsp chili powder",
   "1 tsp cumin",
   "1 tsp smoked paprika",
   "1/2 tsp oregano",
   "1/4 to 1/2 tsp cayenne pepper (optional, for heat)",
   "1 (28 oz) can crushed tomatoes",
   "1 (15 oz) can kidney beans, drained and rinsed",
   "1 (15 oz) can black beans or pinto beans, drained and rinsed",
   "1 cup beef broth or water",
   "1 tbsp tomato paste (optional, for richer flavor)",
   "Salt and pepper to taste"
  ],
  "steps": [
   "In a large pot or Dutch oven, brown the ground beef over medium-high heat. Drain excess fat if needed.",
   "Add onion and bell pepper. Cook 5 minutes until softened.",
   "Stir in garlic and cook 30 seconds.",
   "Add chili powder, cumin, paprika, oregano, and cayenne. Cook 1 minute to bloom the spices.",
   "Stir in crushed tomatoes, beans, broth, and tomato paste.",
   "Bring to a simmer, then reduce heat and cook uncovered for 30 to 45 minutes, stirring occasionally.",
   "Taste and adjust with salt, pepper, and extra chili powder if desired."
  ],
  "notes": "Optional upgrades: add 1 chipotle pepper in adobo sauce for smoky heat; stir in 1 square of dark chocolate near the end for depth; use a splash of beer instead of some of the broth; mix in corn during the last 10 minutes. Toppings: shredded cheddar, sour cream, green onions, diced avocado, cilantro, crushed tortilla chips. Chili is often even better the next day after the flavors have had time to meld.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:02.000Z"
 },
 {
  "id": "classic-french-toast",
  "title": "Classic French Toast",
  "category": "Breakfast",
  "tags": [
   "quick",
   "sweet"
  ],
  "time_minutes": null,
  "servings": "2-3",
  "image": "https://images.unsplash.com/photo-1595044643502-616eeebbdff3?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "4 slices of thick bread (brioche, challah, Texas toast, or regular sandwich bread)",
   "2 large eggs",
   "1/2 cup (120 ml) milk",
   "1 teaspoon vanilla extract",
   "1/2 teaspoon ground cinnamon (optional)",
   "1 tablespoon sugar (optional)",
   "Pinch of salt",
   "1 tablespoon butter for cooking"
  ],
  "steps": [
   "In a shallow bowl, whisk together the eggs, milk, vanilla, cinnamon, sugar, and salt.",
   "Dip each slice of bread into the mixture, coating both sides. Let it soak for a few seconds without becoming too soggy.",
   "Heat a skillet or griddle over medium heat and melt the butter.",
   "Add the bread slices and cook for 2 to 4 minutes per side, until golden brown.",
   "Serve warm with your favorite toppings."
  ],
  "notes": "Topping ideas: maple syrup, powdered sugar, fresh berries or sliced bananas, whipped cream, peanut butter or Nutella, toasted nuts. For extra-rich French toast, use brioche bread and substitute half of the milk with heavy cream.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:03.000Z"
 },
 {
  "id": "sourdough-banana-bread",
  "title": "Sourdough Banana Bread",
  "category": "Bread",
  "tags": [
   "sourdough discard",
   "quick bread",
   "sweet"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1569762404472-026308ba6b64?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "1 cup (240 g) sourdough discard (unfed is fine)",
   "3 very ripe bananas, mashed",
   "1/2 cup (115 g) melted butter",
   "3/4 cup (150 g) brown sugar",
   "2 large eggs",
   "1 teaspoon vanilla extract",
   "1 1/2 cups (190 g) all-purpose flour",
   "1 teaspoon baking soda",
   "1/2 teaspoon salt",
   "1 teaspoon cinnamon (optional)",
   "1/2 cup chopped walnuts or chocolate chips (optional)"
  ],
  "steps": [
   "Heat oven to 350°F (175°C). Grease a 9x5-inch loaf pan or line it with parchment paper.",
   "In a large bowl, whisk together the mashed bananas, sourdough discard, melted butter, brown sugar, eggs, and vanilla.",
   "In a separate bowl, combine the flour, baking soda, salt, and cinnamon.",
   "Gently fold the dry ingredients into the wet ingredients until just combined. Do not overmix.",
   "Fold in walnuts or chocolate chips if using.",
   "Pour into the prepared loaf pan.",
   "Bake for 55 to 65 minutes, or until a toothpick inserted into the center comes out with just a few moist crumbs.",
   "Cool in the pan for 15 minutes, then transfer to a wire rack."
  ],
  "notes": "Favorite variation: before baking, sprinkle the top with 1 tablespoon turbinado sugar, a handful of chopped pecans, and a light dusting of cinnamon for a sweet, crunchy crust. Tip: this bread is better the next day. Wrap it tightly and let the flavors settle overnight if you can resist cutting into it.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:04.000Z"
 },
 {
  "id": "double-batch-sourdough-pancakes",
  "title": "Double Batch Sourdough Pancakes",
  "category": "Breakfast",
  "tags": [
   "sourdough discard",
   "pancakes"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1587339144367-f1cacbecac82?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "480 g sourdough discard (100% hydration)",
   "480 g milk",
   "2 large eggs (about 100 g without shells)",
   "56 g melted butter",
   "24 g sugar",
   "240 g all-purpose flour",
   "10 g baking powder (2 tsp)",
   "6 g baking soda (1 tsp)",
   "6 g salt"
  ],
  "steps": [
   "Whisk together the sourdough discard, milk, eggs, sugar, and melted butter.",
   "Stir in the flour and salt until just combined.",
   "Add the baking powder and baking soda, mixing gently.",
   "Let the batter rest for 5 to 10 minutes.",
   "Cook on a lightly greased skillet over medium heat until bubbles form on top, then flip and cook until golden brown."
  ],
  "notes": "Makes roughly 16 to 20 medium pancakes, depending on the size.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:05.000Z"
 },
 {
  "id": "homemade-herbes-de-provence",
  "title": "Homemade Herbes de Provence",
  "category": "Spice Blends",
  "tags": [
   "herbs",
   "pantry"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1566792720002-d52fdf3d050a?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "2 tablespoons dried thyme",
   "2 tablespoons dried rosemary, crushed",
   "2 tablespoons dried oregano",
   "1 tablespoon dried marjoram",
   "1 tablespoon dried savory (if available)",
   "1 tablespoon dried basil",
   "1 teaspoon dried tarragon",
   "1 teaspoon dried lavender buds (optional, for a more traditional floral note in some modern blends)"
  ],
  "steps": [
   "Mix all the herbs together.",
   "Store in an airtight jar for up to 6 months."
  ],
  "notes": "Use it in Herbes de Provence Roasted Potatoes, Herbes de Provence Grilled Chicken, and the Herbes de Provence BBQ Rub.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:06.000Z"
 },
 {
  "id": "herbes-de-provence-roasted-potatoes",
  "title": "Herbes de Provence Roasted Potatoes",
  "category": "Sides",
  "tags": [
   "potatoes",
   "herbes de provence"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1633959639799-6d3f66e05710?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "2 lbs potatoes",
   "2 tbsp olive oil",
   "1 tbsp Herbes de Provence",
   "Salt and pepper"
  ],
  "steps": [
   "Toss everything together.",
   "Roast at 425°F for 35 to 45 minutes."
  ],
  "notes": null,
  "source_url": null,
  "created_at": "2026-01-01T00:00:07.000Z"
 },
 {
  "id": "herbes-de-provence-grilled-chicken",
  "title": "Herbes de Provence Grilled Chicken",
  "category": "Mains",
  "tags": [
   "chicken",
   "grilling",
   "herbes de provence"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1777891258069-454e66f8bedc?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "Chicken",
   "Olive oil",
   "Salt and pepper",
   "1 to 2 teaspoons Herbes de Provence per pound of meat"
  ],
  "steps": [
   "Coat the chicken with olive oil.",
   "Season with salt, pepper, and 1 to 2 teaspoons Herbes de Provence per pound of meat.",
   "Grill or roast as usual."
  ],
  "notes": "Herbes de Provence is traditionally used on roasted chicken and other grilled meats.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:08.000Z"
 },
 {
  "id": "herbes-de-provence-bbq-rub",
  "title": "Herbes de Provence BBQ Rub",
  "category": "Spice Blends",
  "tags": [
   "bbq",
   "rub",
   "smoker"
  ],
  "time_minutes": null,
  "servings": null,
  "image": "https://images.unsplash.com/photo-1490026220125-b42f3d66abd6?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "1 tbsp Herbes de Provence",
   "1 tsp kosher salt",
   "½ tsp black pepper",
   "1 tsp garlic powder"
  ],
  "steps": [
   "Mix everything together."
  ],
  "notes": "Excellent on spatchcock chicken cooked on a pellet smoker. The rosemary and thyme complement smoke well without overpowering the meat.",
  "source_url": null,
  "created_at": "2026-01-01T00:00:09.000Z"
 },
 {
  "id": "swedish-pancakes-basic-batter",
  "title": "Swedish Pancakes (Basic Batter)",
  "category": "Breakfast",
  "tags": [
   "pancakes",
   "swedish",
   "thin pancakes"
  ],
  "time_minutes": null,
  "servings": "4",
  "image": "https://images.unsplash.com/photo-1771250248306-3da13dac0a50?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "2½ dl (about 1 cup) all-purpose flour",
   "½ tsp salt",
   "6 dl (about 2½ cups) milk",
   "3 eggs",
   "Butter, for frying",
   "Jam, berries, or fruit, for serving"
  ],
  "steps": [
   "Mix the flour and salt in a bowl.",
   "Whisk in half of the milk until the batter is smooth.",
   "Whisk in the rest of the milk and the eggs.",
   "Let the batter rest for about 10 minutes.",
   "Fry thin pancakes in a frying pan or pancake pan, using a little butter for each pancake.",
   "Serve with jam and cream, berries, or fruit."
  ],
  "notes": "Makes about 8 to 10 thin pancakes, depending on the size of your pan. Cup measurements are approximate conversions from the Swedish deciliters. Translated from ICA.se, \"Pannkakor – grundsmet\" (originally from Buffé no. 11, 1997).",
  "source_url": null,
  "created_at": "2026-01-01T00:00:10.000Z"
 },
 {
  "id": "crockpot-potato-soup",
  "title": "Crockpot Potato Soup",
  "category": "Soups & Stews",
  "tags": [
   "slow cooker",
   "potato",
   "comfort food"
  ],
  "time_minutes": 250,
  "servings": "6",
  "image": "https://images.unsplash.com/photo-1616501268826-ee9731c915d4?auto=format&fit=crop&w=1200&q=75",
  "ingredients": [
   "6 large potatoes, peeled and diced",
   "1 large onion, diced",
   "3 garlic cloves, minced",
   "4 cups chicken broth",
   "8 oz cream cheese, softened",
   "2 cups shredded cheddar cheese",
   "6 slices bacon, cooked and crumbled",
   "4 green onions, sliced (for garnish)",
   "Salt and pepper to taste"
  ],
  "steps": [
   "Chop the potatoes, onion and garlic.",
   "Add them to the crockpot with the broth, salt and pepper.",
   "Cook on low for 7–8 hours or on high for 4–5 hours.",
   "Blend half the soup with an immersion blender.",
   "Stir in the cream cheese until melted, then taste and adjust the seasoning.",
   "Serve topped with cheddar, bacon and green onions."
  ],
  "notes": "Total time shown is for cooking on high; allow 7–8 hours on low. Adapted from Be Centsational (https://becentsational.com/crockpot-potato-soup/).",
  "source_url": null,
  "created_at": "2026-01-01T00:00:11.000Z"
 }
]
$recipes$::jsonb) as r(
  id text, title text, category text, tags text[], time_minutes integer,
  servings text, image text, ingredients text[], steps text[], notes text,
  source_url text, created_at timestamptz
)
on conflict (id) do update
  set created_at = least(public.recipes.created_at, excluded.created_at);

-- Check: every recipe from the file is now in the database.
select v.id, exists (select 1 from public.recipes p where p.id = v.id) as in_database
from (values ('grandma-style-white-sandwich-bread'), ('smoky-mustard-pickles'), ('easy-beef-chili'), ('classic-french-toast'), ('sourdough-banana-bread'), ('double-batch-sourdough-pancakes'), ('homemade-herbes-de-provence'), ('herbes-de-provence-roasted-potatoes'), ('herbes-de-provence-grilled-chicken'), ('herbes-de-provence-bbq-rub'), ('swedish-pancakes-basic-batter'), ('crockpot-potato-soup')) as v(id)
order by v.id;
