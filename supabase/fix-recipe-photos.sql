-- The Dark Sparrow Eats: add photos to the 27 recipes that have none (Nov 2026)
-- -------------------------------------------------------------------------
-- HOW TO RUN: open the dark-sparrow-eats project in Supabase, go to the
-- SQL Editor, paste ALL of this, and click Run.
--
-- SAFE & IDEMPOTENT: each recipe only gets a photo if it does not already
-- have one, so this never overwrites a photo you've added yourself, and
-- re-running it changes nothing.
--
-- The photos are free-licensed images hosted on Wikimedia Commons, served
-- through the stable Special:FilePath URL (it redirects to a cached ~1000px
-- copy, so it loads reliably - unlike a raw /thumb/ URL). All 27 were checked
-- and load. To change any one later, use the recipe's Edit button on the site
-- or edit its URL below. (These are mostly CC-BY/CC-BY-SA images; if you want
-- a visible photo credit, that's a separate small addition - just ask.)

update public.recipes as r
set image = v.image
from (values
  ('grandma-bingham-s-baking-powder-biscuits',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Buttermilk_biscuits_(6340812760).jpg?width=1000'),  -- Baking-powder Biscuits
  ('grandma-bingham-s-german-stollen',
   'https://commons.wikimedia.org/wiki/Special:FilePath/2014_Dresdner_Christstollen_f%C3%BCr_den_Export.jpg?width=1000'),  -- German Stollen
  ('grandma-bingham-s-pumpkin-nut-bread',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Pumpkin_bread_3.jpg?width=1000'),  -- Pumpkin Nut Bread
  ('grandma-bingham-s-tea-scones',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Scones_Jam_Cream.jpg?width=1000'),  -- Tea Scones
  ('best-sourdough-pancakes-overnight-or-same-day',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Pancakes_with_Berries_(Unsplash).jpg?width=1000'),  -- Best Sourdough Pancakes
  ('grandma-bingham-s-coffee-cake',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Cake_plum_cake_streusel_cake_bake_homemade_tradition_plums_coffee-549588.jpg?width=1000'),  -- Coffee Cake
  ('grandma-bingham-s-everyday-waffles',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Waffle%2C_Baytree_Waffle_House%2C_Remerton.jpg?width=1000'),  -- Everyday Waffles
  ('grandma-bingham-s-favorite-pancakes',
   'https://commons.wikimedia.org/wiki/Special:FilePath/PancakesWithSyrup.jpg?width=1000'),  -- Favorite Pancakes
  ('grandma-bingham-s-hungry-boy-s-casserole',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Hotdish.jpg?width=1000'),  -- Hungry Boy's Casserole
  ('grandma-bingham-s-pastitsio',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Pastitsio_homemade.jpg?width=1000'),  -- Pastitsio
  ('basque-cheesecake-recipe',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Basque-style_cheesecake_in_Pepito%2C_Tokyo.jpg?width=1000'),  -- Basque Cheesecake
  ('grandma-bingham-s-chocolate-pudding-cake',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Chocolate_Molten_Cake_Pint.jpg?width=1000'),  -- Chocolate Pudding Cake
  ('grandma-bingham-s-hello-dolly-cookies',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Layered_bar.jpg?width=1000'),  -- Hello Dolly Cookies
  ('grandma-bingham-s-peanut-butter-fudge',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Peanut_Butter_Fudge_(15651232319).jpg?width=1000'),  -- Peanut-Butter Fudge
  ('grandma-bingham-s-shortcake',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Shortcake_slice.jpg?width=1000'),  -- Shortcake
  ('grandma-bingham-s-uncooked-coconut-balls',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Coconut_macaroon.jpg?width=1000'),  -- Uncooked Coconut Balls
  ('pumpkin-pie-mix',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Pumpkin-Pie-Slice.jpg?width=1000'),  -- Pumpkin Pie Mix
  ('best-homemade-sloppy-joes',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Sloppy_joe_sandwich_with_French_fries.jpg?width=1000'),  -- Best Homemade Sloppy Joes
  ('instant-pot-best-blue-ribbon-chili',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Chili_con_carne_(4431800858).jpg?width=1000'),  -- Instant Pot Blue Ribbon Chili
  ('quick-and-easy-paella',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Seafood_paella_red.jpg?width=1000'),  -- Quick and Easy Paella
  ('classic-spaghetti-bolognese',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Liat_Portal_for_Foodie_Disorder_-_Spaghetti_Bolognese_with_peas_and_broccoli.jpg?width=1000'),  -- Classic Spaghetti Bolognese
  ('dirty-spaghetti',
   'https://commons.wikimedia.org/wiki/Special:FilePath/04666_Polish_spaghetti_pasta_with_sauce_made_of_pork_meat%2C_tomatoes%2C_garlic_and_olive.JPG?width=1000'),  -- Dirty Spaghetti
  ('texas-brisket-burnt-ends-summer-sausage',
   'https://commons.wikimedia.org/wiki/Special:FilePath/A_larger_summer_sausage..jpg?width=1000'),  -- Texas Brisket Burnt Ends Summer Sausage
  ('cowboy-baked-beans-recipe-oven-or-slow-cooker',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Brown_sugar_baked_beans_with_bacon.jpg?width=1000'),  -- Cowboy Baked Beans
  ('salsa-esplendidamente-caliente',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Molcajete_con_salsa_roja_mexicana_-_1.jpg?width=1000'),  -- Salsa Esplendidamente Caliente
  ('steal-and-score-salsa',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Salsa_mexicana.jpg?width=1000'),  -- Steal and Score Salsa
  ('basque-red-bean-chorizo-soup',
   'https://commons.wikimedia.org/wiki/Special:FilePath/Argentine_Red_Bean_Stew_with_Chorizo_and_Bacon_(94523).jpg?width=1000')  -- Basque Red Bean Chorizo Soup
) as v(id, image)
where r.id = v.id
  and (r.image is null or btrim(r.image) = '');

-- Check: every row below should show has_image = true.
select id, title,
       (image is not null and btrim(image) <> '') as has_image
from public.recipes
where id in (
  'grandma-bingham-s-baking-powder-biscuits',
  'grandma-bingham-s-german-stollen',
  'grandma-bingham-s-pumpkin-nut-bread',
  'grandma-bingham-s-tea-scones',
  'best-sourdough-pancakes-overnight-or-same-day',
  'grandma-bingham-s-coffee-cake',
  'grandma-bingham-s-everyday-waffles',
  'grandma-bingham-s-favorite-pancakes',
  'grandma-bingham-s-hungry-boy-s-casserole',
  'grandma-bingham-s-pastitsio',
  'basque-cheesecake-recipe',
  'grandma-bingham-s-chocolate-pudding-cake',
  'grandma-bingham-s-hello-dolly-cookies',
  'grandma-bingham-s-peanut-butter-fudge',
  'grandma-bingham-s-shortcake',
  'grandma-bingham-s-uncooked-coconut-balls',
  'pumpkin-pie-mix',
  'best-homemade-sloppy-joes',
  'instant-pot-best-blue-ribbon-chili',
  'quick-and-easy-paella',
  'classic-spaghetti-bolognese',
  'dirty-spaghetti',
  'texas-brisket-burnt-ends-summer-sausage',
  'cowboy-baked-beans-recipe-oven-or-slow-cooker',
  'salsa-esplendidamente-caliente',
  'steal-and-score-salsa',
  'basque-red-bean-chorizo-soup'
)
order by title;
