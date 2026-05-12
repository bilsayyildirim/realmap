# Comprehensive Ingredient & Cooking Method Mapping Plan

## Analysis Summary
- **Total Ingredients**: 728 unique keys in IngredientsSchema.full.ts
- **Total Cooking Methods**: 346 unique keys in CookingMethodsSchema.full.ts
- **Goal**: Create tight, normalized schema while preserving clustering quality and cultural distinctions

## Mapping Strategy Principles

### ✅ DO Map (Safe Consolidations)
1. **Plural → Singular**: Clear duplicates (apples → apple)
2. **Spelling Variants**: Same ingredient, different spelling (black-eyed_peas → black_eyed_peas)
3. **Regional Name Variants**: Same ingredient, different regional names (aubergine → eggplant)
4. **Generic Categories**: When specific types don't add clustering value
   - All flours → flour (unless culturally significant)
   - All oils → oil (unless culturally significant like olive_oil)
   - Generic fish types → fish
   - Generic meat types → meat

### ❌ DON'T Map (Preserve for Clustering)
1. **Culturally Distinct Items**: Even if similar, preserve if culturally significant
   - Keep specific cheeses separate (feta_cheese, halloumi, paneer)
   - Keep specific breads separate (injera, tortilla, naan)
   - Keep specific noodles separate (ramen_noodles, rice_noodles)
2. **Culinary Techniques**: Different preparation methods
   - smoked_fish vs fish
   - fermented_beans vs beans
3. **Specific Varieties**: When they indicate different cuisines
   - Keep regional dumpling types IF they're culturally distinct enough

## Ingredient Mapping Categories

### Category 1: Plural → Singular (High Priority)
All plurals should map to singular for consistency:
- almonds → almond
- anchovies → anchovy
- apples → apple (already mapped)
- apricots → apricot (already mapped)
- artichokes → artichoke
- bamboo_shoots → bamboo_shoot (already mapped)
- bananas → banana (already mapped)
- barberries → barberry (already mapped)
- beans → bean (already mapped)
- beets → beet
- berries → berry
- blueberries → blueberry (already mapped)
- carrots → carrot (already mapped)
- cashew_nuts → cashew
- cherries → cherry (already mapped)
- chestnuts → chestnut (already mapped)
- chickpeas → chickpea (already mapped)
- chokecherries → chokecherry
- clams → clam
- cloudberries → cloudberry
- cranberries → cranberry (already mapped)
- cucumbers → cucumber (already mapped)
- dates → date (already mapped)
- eggs → egg (already mapped)
- figs → fig (already mapped)
- fruits → fruit (already mapped)
- grapes → grape (already mapped)
- green_bananas → green_banana (already mapped)
- groundnuts → groundnut (already mapped)
- hazelnuts → hazelnut (already mapped)
- huckleberries → huckleberry
- leeks → leek (already mapped)
- lemons → lemon (already mapped)
- limes → lime (already mapped)
- lingonberries → lingonberry (already mapped)
- macadamia_nuts → macadamia
- macadamias → macadamia
- melons → melon (already mapped)
- mulberries → mulberry (already mapped)
- mussels → mussel (already mapped)
- olives → olive (already mapped)
- onions → onion (already mapped)
- peanuts → peanut (already mapped)
- pears → pear (already mapped)
- peas → pea
- pecans → pecan
- peaches → peach (already mapped)
- pistachios → pistachio (already mapped)
- plantains → plantain (already mapped)
- plums → plum (already mapped)
- pomegranates → pomegranate
- potatoes → potato (already mapped)
- prawns → prawn
- preserved_lemons → preserved_lemon
- prunes → prune (already mapped)
- raisins → raisin (already mapped)
- sweet_potatoes → sweet_potato (already mapped)
- tomatoes → tomato (already mapped)
- turnips → turnip
- walnuts → walnut (already mapped)
- yams → yam

### Category 2: Compound Ingredients - Flours
Map all flour variants to "flour" (unless culturally significant):
- algarrobo_flour → flour
- barley_flour → flour
- buckwheat_flour → flour
- chickpea_flour → flour
- gram_flour → flour
- lentil_flour → flour
- manioc_flour → flour
- potato_starch → flour
- rice_flour → flour
- takoyaki_flour → flour
- tempura_flour → flour
- wheat_flour → flour
- corn_starch → flour

### Category 3: Compound Ingredients - Oils
Map generic oils to "oil", but preserve culturally significant ones:
- argan_oil → oil
- cottonseed_oil → oil
- dendê_oil → oil
- groundnut_oil → oil
- palm_oil → oil (maybe keep separate? culturally significant)
- peanut_oil → oil
- pumpkin_seed_oil → oil
- sheanut_oil → oil
- sunflower_oil → oil
- tea_oil → oil
- tea_seed_oil → oil
- vegetable_oil → oil
- sesame_oil → oil (maybe keep? culturally significant)
- olive_oil → KEEP SEPARATE (culturally significant)
- chili_oil → KEEP SEPARATE (culturally significant)

### Category 4: Compound Ingredients - Sauces
Map generic sauces to "sauce", but preserve culturally significant ones:
- barbecue_sauce → sauce
- hot_sauce → sauce
- oyster_sauce → sauce (maybe keep? culturally significant)
- plum_sauce → sauce
- shacha_sauce → sauce
- tomato_sauce → sauce
- soy_sauce → KEEP SEPARATE (culturally significant)
- fish_sauce → KEEP SEPARATE (culturally significant)

### Category 5: Compound Ingredients - Pastes
Map all pastes to "paste":
- bean_paste → paste
- broad_bean_paste → paste
- red_bean_paste → paste
- shrimp_paste → paste
- soybean_paste → paste

### Category 6: Compound Ingredients - Cheeses
Preserve culturally significant cheeses, map generic ones:
- artisanal_cheese → cheese
- cheddar_cheese → cheese
- cottage_cheese → cheese
- dried_cheese → cheese
- fermented_cheese → cheese
- goat_cheese → cheese
- sheep_cheese → cheese
- buffalo_mozzarella → mozzarella
- feta_cheese → KEEP SEPARATE
- halloumi → KEEP SEPARATE
- paneer → KEEP SEPARATE
- brocciu → KEEP SEPARATE
- nabulsi_cheese → KEEP SEPARATE
- kajmak → KEEP SEPARATE
- quark → KEEP SEPARATE
- skyr → KEEP SEPARATE
- pecorino → KEEP SEPARATE
- pecorino_romano → pecorino (already mapped)
- fontina → KEEP SEPARATE
- gorgonzola → KEEP SEPARATE
- brie → KEEP SEPARATE
- taleggio → KEEP SEPARATE

### Category 7: Compound Ingredients - Breads
Preserve culturally significant breads:
- baguette → bread
- chapati → bread
- cornbread → bread
- flatbread → bread
- hot_dog_bun → bread
- injera → KEEP SEPARATE (culturally significant)
- khubz → bread
- pide → bread
- piadina → bread
- pita → bread
- pretzels → pretzel (keep separate - culturally significant)
- rye_bread → bread
- tortilla → KEEP SEPARATE (culturally significant)

### Category 8: Compound Ingredients - Noodles/Pasta
Map all noodles to "pasta" (they're all pasta):
- buckwheat_noodles → pasta
- champon_noodles → pasta
- egg_noodles → pasta
- glass_noodles → pasta
- ramen_noodles → pasta
- rice_noodles → pasta
- sara_udon → pasta
- wheat_noodles → pasta
- spaghetti → pasta
- noodles → pasta

### Category 9: Compound Ingredients - Fish
Map generic fish types to "fish", preserve specific ones:
- cold_water_fish → fish
- flat_fish → fish
- flying_fish → fish
- freshwater_fish → fish
- river_fish → fish
- whitefish → fish
- dried_fish → fish
- dry_fish → fish
- fermented_fish → fish
- salt_fish → fish
- saltfish → salt_fish (already mapped)
- smoked_fish → fish
- fish_head → fish
- KEEP SEPARATE: salmon, tuna, cod, haddock, halibut, trout, arctic_char, char, barramundi, tilapia, catfish, smoked_catfish, sturgeon, swordfish, walleye, pollock, herring, pacu, paiche, pirarucu

### Category 10: Compound Ingredients - Meat
Map generic meat types to "meat", preserve specific ones:
- game_meat → meat
- bush_meat → meat
- smoked_meat → meat
- meat_preserves → meat
- camel_meat → meat
- goat_meat → meat
- horse_meat → meat
- llama_meat → meat
- reindeer_meat → meat
- seal_meat → meat
- yak_meat → meat
- zebu_beef → beef
- KEEP SEPARATE: beef, pork, lamb, mutton, goat, chicken, duck, goose, turkey, poultry, venison, elk, moose, caribou, reindeer, bison, kangaroo, camel, horse, seal, whale, pilot_whale, zebu

### Category 11: Compound Ingredients - Vegetables
Map generic vegetables:
- foraged_vegetables → vegetable
- organic_vegetables → vegetable
- pickled_vegetables → vegetable
- preserved_vegetables → vegetable
- root_vegetables → vegetable
- canned_veg → vegetable
- vegetables → vegetable
- vegatables → vegetable (typo fix)

### Category 12: Compound Ingredients - Fruits
Map generic fruits:
- dried_fruits → fruit
- dry_fruits → fruit
- tropical_fruits → tropical_fruit (already mapped)
- wild_fruits → fruit
- fruits → fruit (already mapped)
- stone_fruit → fruit

### Category 13: Compound Ingredients - Mushrooms
Map all mushrooms to "mushroom":
- morel_mushrooms → mushroom
- wild_mushrooms → mushroom
- wood_ear_mushrooms → mushroom
- shiitake → mushroom
- mushrooms → mushroom
- truffles → mushroom
- white_truffles → mushroom

### Category 14: Compound Ingredients - Herbs/Spices
Map generic herbs/spices:
- dried_herbs → herb
- mountain_herbs → herb
- wild_herbs → herb
- herbal_plants → herb
- herbs → herb
- curry_spices → spice
- bean_spices → spice
- spices → spice

### Category 15: Compound Ingredients - Greens
Map generic greens:
- collard_greens → green
- leafy_greens → green
- mustard_greens → green
- wild_greens → green
- greens → green

### Category 16: Compound Ingredients - Wine/Beer
Map wine variants to "wine", preserve specific ones:
- barolo_wine → wine
- malbec_grapes → wine
- rice_wine → wine
- shaoxing_wine → wine
- vineyard_grapes → wine
- wine_grapes → wine
- highland_barley_beer → beer
- beer → KEEP SEPARATE

### Category 17: Compound Ingredients - Tea
Map tea variants to "tea":
- black_tea → tea
- butter_tea → tea
- longjing_tea → tea
- pu_er_tea → tea
- rooibos_tea → tea
- tea_leaves → tea
- tea → KEEP SEPARATE

### Category 18: Compound Ingredients - Milk
Map milk variants to "milk":
- camel_milk → milk
- powdered_milk → milk
- yak_milk → milk
- buttermilk → milk
- milk → KEEP SEPARATE

### Category 19: Compound Ingredients - Butter
Map butter variants to "butter":
- ghee → butter (already mapped)
- spiced_butter → butter
- yak_butter → butter
- shea_butter → butter
- butter → KEEP SEPARATE

### Category 20: Compound Ingredients - Vinegar
Map vinegar variants to "vinegar":
- balsamic_vinegar → vinegar
- rice_vinegar → vinegar
- vinegar → KEEP SEPARATE

### Category 21: Compound Ingredients - Sugar/Sweeteners
Map sweeteners to "sugar":
- brown_sugar → sugar
- jaggery → sugar
- maple_syrup → sugar
- molasses → sugar
- palm_sugar → sugar
- honey → KEEP SEPARATE (culturally significant)
- dulce_de_leche → sugar
- sugar → KEEP SEPARATE

### Category 22: Specific Ingredient Variants
- aloo_potatoes → potato
- black_cabbage → cabbage
- black_eyed_peas → bean (they're beans)
- black_lime → lime
- black_pepper → pepper
- blue_corn → corn
- cherry_tomato → tomato
- green_barley → barley
- green_beans → bean
- green_chili → pepper
- green_onions → onion
- green_peas → pea
- heirloom_tomatoes → tomato
- native_lemon → lemon
- pickled_bamboo → bamboo_shoot
- pickled_cabbage → cabbage
- pickled_hot_peppers → pepper
- pickled_longbeans → bean
- pickled_mustard → mustard
- pickled_turnip → turnip
- pickles → pickle
- preserved_lemon → lemon
- red_chili → pepper
- red_chili_powder → pepper
- san_marzano_tomatoes → tomato
- smoked_bacon → bacon
- smoked_catfish → catfish
- smoked_pork → pork
- smoked_salmon → salmon
- sour_cream → cream
- wild_bamboo_shoots → bamboo_shoot
- wild_berries → berry
- wild_onions → onion

### Category 23: Seeds/Nuts
- cashew_nuts → cashew
- chia_seeds → chia_seed
- hickory_nuts → hickory_nut
- macadamia_nuts → macadamia
- macadamias → macadamia
- pine_nuts → pine_nut
- pinon_nuts → pine_nut
- poppy_seeds → poppy_seed
- pumpkin_seed_oil → oil
- rape_seeds → rape_seed
- sesame_seeds → sesame
- sunflower_oil → oil
- wattle_seeds → wattle_seed

### Category 24: Leaves/Herbs
- bay_leaves → bay_leaf
- curry_leaves → curry_leaf
- grape_leaves → grape_leaf
- kaffir_lime_leaves → lime
- taro_leaves → taro

### Category 25: Other Variants
- beets → beetroot (or beetroot → beet)
- beetroot → beet
- beets → beet
- berries → berry
- bush_meat → meat
- bush_mint → mint
- bush_onion → onion
- bush_plum → plum
- bush_tomato → tomato
- bush_tucker_berries → berry
- canned_goods → canned_good
- citrus → citrus
- cocoa → chocolate (or chocolate → cocoa)
- cacao → cocoa
- chocolate → cocoa
- coconut_milk → coconut
- crayfish_powder → crayfish
- dairy → dairy
- dried_cheese → cheese
- dried_fish → fish
- dried_fruits → fruit
- dried_herbs → herb
- dry_fish → fish
- dry_fruits → fruit
- fermented_beans → bean
- fermented_black_beans → bean
- fermented_cheese → cheese
- fermented_fish → fish
- fermented_lamb → lamb
- fish_head → fish
- flowers → flower
- game → game_meat
- game_meat → meat
- legumes → legume
- locust_beans → bean
- mung_beans → bean
- nuts → nut
- offal → offal
- poultry → poultry
- seafood → seafood
- shellfish → seafood
- tubers → tuber

## Cooking Methods Mapping

### Category 1: Typos (Already Mapped)
- rosting → roasting (already mapped)
- strewing → stewing (already mapped)

### Category 2: Similar Methods
- sauteing → sautéing
- sautéing → sautéing (keep as canonical)
- broiling → grilling (or keep separate?)
- barbecuing → grilling
- braai → grilling

### Category 3: Generic vs Specific
- bread_making → baking
- broth_making → soup_making
- noodle_making → pasta
- ramen_making → pasta
- pasta → pasta (keep)
- pilaf_cooking → rice_cooking
- pilaf_making → rice_cooking
- rice_cooking → rice_cooking (keep)
- rice_pilaf → rice_cooking

### Category 4: Regional Dish Names → Generic Methods
Many regional dish names should map to their cooking method:
- arancini → frying (or keep separate?)
- cannoli → baking
- carbonara → pasta
- cacio_e_pepe → pasta
- amatriciana → pasta
- paella → rice_cooking
- risotto → rice_cooking
- polenta → boiling
- gnocchi → boiling
- spätzle → boiling
- dumpling_steaming → steaming
- double_steaming → steaming

### Category 5: Preservation Methods
- canning → preserving
- curing → preserving
- drying → preserving
- sun_drying → preserving
- freezing → preserving
- freezing_raw → preserving
- preserving → preserving (keep)

### Category 6: Fermentation/Brewing
- fermenting → fermenting (keep)
- brewing → brewing (keep)
- distilling → distilling (keep)
- wine_making → brewing
- wine_cooking → cooking (or keep separate?)

## Implementation Priority

1. **Phase 1: High-Confidence Mappings** (Plural→Singular, Clear Duplicates)
2. **Phase 2: Compound Ingredients** (Flours, Oils, Sauces - generic ones)
3. **Phase 3: Cooking Methods** (Typos, Similar Methods)
4. **Phase 4: Review & Validate** (Check clustering impact)

## Clustering Quality Considerations

- **Preserve Cultural Distinctions**: Don't merge items that are culturally significant
- **Balance**: Too aggressive = lose cultural info, too conservative = noisy features
- **Test Impact**: After mapping, check if clustering quality improves
- **Global Perspective**: Mappings should work globally, not favor one cuisine


