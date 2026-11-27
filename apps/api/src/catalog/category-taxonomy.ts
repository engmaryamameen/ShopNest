/** ShopNest owns this vocabulary. Supplier taxonomies only map into it. */
export type MarketplaceCategory = {
  slug: string;
  name: string;
  parentSlug: string | null;
  position: number;
  imageAsset?: string;
};
const definitions: MarketplaceCategory[] = [];
function department(
  slug: string,
  name: string,
  imageAsset: string,
  groups: Array<[string, string, Array<[string, string]>?]>,
) {
  definitions.push({
    slug,
    name,
    parentSlug: null,
    position: definitions.filter((c) => !c.parentSlug).length,
    imageAsset,
  });
  groups.forEach(([groupSlug, groupName, children = []], position) => {
    definitions.push({ slug: groupSlug, name: groupName, parentSlug: slug, position });
    children.forEach(([childSlug, childName], childPosition) =>
      definitions.push({
        slug: childSlug,
        name: childName,
        parentSlug: groupSlug,
        position: childPosition,
      }),
    );
  });
}
department('electronics', 'Electronics', 'electronics.png', [
  [
    'computers',
    'Computers & Accessories',
    [
      ['laptops', 'Laptops'],
      ['desktop-computers', 'Desktop Computers'],
      ['computer-accessories', 'Computer Accessories'],
    ],
  ],
  [
    'phones-tablets',
    'Phones & Tablets',
    [
      ['smartphones', 'Smartphones'],
      ['tablets', 'Tablets'],
      ['mobile-accessories', 'Mobile Accessories'],
    ],
  ],
  [
    'audio',
    'Audio',
    [
      ['headphones', 'Headphones'],
      ['speakers', 'Speakers'],
      ['microphones', 'Microphones'],
    ],
  ],
  ['cameras', 'Cameras & Photography', [['camera-accessories', 'Camera Accessories']]],
  [
    'tv-video',
    'TV & Video',
    [
      ['televisions', 'Televisions'],
      ['projectors', 'Projectors'],
      ['tv-accessories', 'TV Accessories'],
    ],
  ],
  ['gaming', 'Gaming', [['gaming-accessories', 'Gaming Accessories']]],
  ['power-batteries', 'Power & Batteries'],
]);
department('fashion', 'Fashion & Accessories', 'clothing.png', [
  [
    'clothing',
    'Clothing',
    [
      ['mens-clothing', 'Men’s Clothing'],
      ['womens-clothing', 'Women’s Clothing'],
      ['unisex-clothing', 'Unisex Clothing'],
      ['kids-clothing', 'Kids’ Clothing'],
    ],
  ],
  [
    'shoes',
    'Footwear',
    [
      ['mens-shoes', 'Men’s Footwear'],
      ['womens-shoes', 'Women’s Footwear'],
      ['unisex-shoes', 'Unisex Footwear'],
      ['kids-shoes', 'Kids’ Footwear'],
    ],
  ],
  [
    'watches',
    'Watches',
    [
      ['mens-watches', 'Men’s Watches'],
      ['womens-watches', 'Women’s Watches'],
      ['unisex-watches', 'Unisex Watches'],
      ['kids-watches', 'Kids’ Watches'],
    ],
  ],
  ['fashion-accessories', 'Fashion Accessories'],
  ['bags-luggage', 'Bags & Luggage'],
  ['jewellery', 'Jewellery'],
  ['scarves-hats', 'Scarves & Hats'],
  ['sunglasses', 'Sunglasses'],
  ['wallets', 'Wallets'],
]);
department('home-furniture', 'Home & Furniture', 'home_&_garden.png', [
  [
    'furniture',
    'Furniture',
    [
      ['sofas', 'Sofas'],
      ['chairs', 'Chairs'],
      ['beds', 'Beds & Bed Frames'],
      ['tables-desks', 'Tables & Desks'],
      ['cabinets-shelves', 'Cabinets & Shelves'],
    ],
  ],
  ['kitchen-dining', 'Kitchen & Dining'],
  ['bedding-bath', 'Bedding & Bath'],
  ['home-decoration', 'Home Decor'],
  ['lighting', 'Lighting'],
  ['home-storage', 'Home Storage'],
  ['garden', 'Garden & Outdoor Living'],
  ['household-cleaning', 'Household Cleaning'],
]);
department('appliances', 'Appliances', 'kitchen-accessories.png', [
  [
    'kitchen-appliances',
    'Kitchen Appliances',
    [
      ['coffee-makers', 'Coffee Makers'],
      ['food-preparation-appliances', 'Blenders & Food Preparation'],
    ],
  ],
  [
    'laundry-cleaning-appliances',
    'Laundry & Cleaning Appliances',
    [['vacuum-cleaners', 'Vacuum Cleaners']],
  ],
  ['heating-cooling', 'Heating & Cooling'],
  ['water-appliances', 'Water Appliances'],
  ['major-appliances', 'Major Appliances'],
]);
department('beauty', 'Beauty & Personal Care', 'beauty.png', [
  [
    'skincare',
    'Skin Care',
    [
      ['face-care', 'Face Care'],
      ['body-care', 'Body Care'],
      ['sun-care', 'Sun Care'],
    ],
  ],
  [
    'hair-care',
    'Hair Care',
    [
      ['shampoos', 'Shampoos'],
      ['hair-conditioners', 'Hair Conditioners'],
      ['hair-styling', 'Hair Styling & Treatments'],
    ],
  ],
  ['makeup', 'Makeup'],
  ['nail-care', 'Nail Care'],
  ['fragrances', 'Fragrances'],
  [
    'shaving-hair-removal',
    'Shaving & Hair Removal',
    [
      ['aftershaves', 'Aftershave'],
      ['shaving-foam-gel', 'Shaving Foam & Gel'],
      ['razors', 'Razors & Blades'],
    ],
  ],
  ['bath-body', 'Bath & Shower'],
  ['oral-care', 'Oral Care'],
  ['personal-hygiene', 'Personal Hygiene'],
  ['beauty-tools', 'Beauty Tools & Accessories'],
]);
department('groceries', 'Groceries', 'groceries.png', [
  [
    'drinks',
    'Drinks',
    [
      ['water', 'Water'],
      ['juices', 'Juices'],
      ['soft-drinks', 'Soft Drinks'],
      ['plant-based-drinks', 'Plant-Based Drinks'],
      ['tea-coffee', 'Tea & Coffee'],
    ],
  ],
  [
    'dairy-eggs',
    'Dairy & Eggs',
    [
      ['milk', 'Milk'],
      ['cheese', 'Cheese'],
      ['yogurts', 'Yogurts & Dairy Desserts'],
      ['butter-cream', 'Butter & Cream'],
    ],
  ],
  [
    'bakery-breakfast',
    'Bakery & Breakfast',
    [
      ['bread', 'Bread'],
      ['biscuits-cookies', 'Biscuits & Cookies'],
      ['breakfast-cereal', 'Breakfast Cereals'],
      ['cakes', 'Cakes & Pastries'],
    ],
  ],
  [
    'snacks-sweets',
    'Snacks & Sweets',
    [
      ['chocolate', 'Chocolate & Confectionery'],
      ['savoury-snacks', 'Savoury Snacks'],
      ['snack-bars', 'Snack Bars'],
    ],
  ],
  [
    'pantry',
    'Pantry',
    [
      ['spreads', 'Spreads'],
      ['sauces', 'Sauces & Condiments'],
      ['grains-pasta', 'Grains, Pasta & Pulses'],
      ['baking-ingredients', 'Baking Ingredients'],
      ['nuts-dried-fruit', 'Nuts & Dried Fruit'],
    ],
  ],
  [
    'fresh-frozen',
    'Fresh & Frozen Food',
    [
      ['fruit-vegetables', 'Fruit & Vegetables'],
      ['meat-fish', 'Meat & Fish'],
    ],
  ],
]);
department('baby-kids', 'Baby & Kids', 'baby-kids', [
  [
    'baby-feeding',
    'Baby Feeding',
    [
      ['baby-food', 'Baby Food'],
      ['baby-formula', 'Baby Formula'],
    ],
  ],
  ['baby-care', 'Baby Care'],
  ['toys-games', 'Toys & Games'],
  ['learning', 'Learning & Education'],
]);
department('sports-outdoors', 'Sports & Outdoors', 'sports-accessories.png', [
  ['fitness', 'Fitness & Exercise'],
  ['camping', 'Camping & Hiking'],
  ['sports-equipment', 'Sports Equipment'],
  ['musical-instruments', 'Musical Instruments'],
]);
department('automotive-tools', 'Automotive & Tools', 'vehicle.png', [
  ['automotive', 'Automotive Accessories'],
  ['tools', 'Tools'],
  ['home-improvement', 'Home Improvement'],
]);
department('books-stationery', 'Books & Stationery', 'books.png', [
  ['books', 'Books'],
  ['stationery', 'Stationery'],
  ['office-supplies', 'Office Supplies'],
]);
department('pet-supplies', 'Pet Supplies', 'pet-supplies', [
  ['pet-food', 'Pet Food'],
  ['pet-care', 'Pet Care & Accessories'],
]);
export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] = definitions;

/** Explicit product-type groups, not substring guesses on supplier labels. */
export const ABO_CATEGORY_GROUPS: Record<string, string> = {
  laptops: 'NOTEBOOK_COMPUTER',
  computers: 'COMPUTER PERSONAL_COMPUTER',
  'computer-accessories':
    'COMPUTER_ADD_ON COMPUTER_COMPONENT COMPUTER_INPUT_DEVICE COMPUTER_INPUT_DEVICE_ACCESSORY FLASH_MEMORY INPUT_MOUSE INPUT_PEN KEYBOARDS MULTIPORT_HUB BLANK_MEDIA',
  'mobile-accessories':
    'CELLULAR_PHONE_CASE PHONE_ACCESSORY SCREEN_PROTECTOR PORTABLE_ELECTRONIC_DEVICE_COVER PORTABLE_ELECTRONIC_DEVICE_MOUNT WIRELESS_ACCESSORY',
  headphones: 'HEADPHONES',
  speakers: 'SPEAKERS PORTABLE_AUDIO',
  microphones: 'MICROPHONE SOUND_AND_RECORDING_EQUIPMENT',
  cameras: 'CAMCORDER',
  'camera-accessories': 'CAMERA_LENS_FILTERS CAMERA_OTHER_ACCESSORIES',
  televisions: 'TELEVISION',
  projectors: 'VIDEO_PROJECTOR',
  'tv-accessories': 'ANTENNA FLAT_SCREEN_DISPLAY_MOUNT',
  'gaming-accessories': 'VIDEO_GAME_ACCESSORIES',
  'power-batteries':
    'BATTERY CHARGING_ADAPTER ELECTRONIC_ADAPTER POWER_BANK POWER_STRIP POWER_SUPPLIES_OR_PROTECTION',
  watches: 'WATCH',
  shoes: 'BOOT SANDAL SHOES TECHNICAL_SPORT_SHOE SHOE_INSERT',
  clothing: 'SALWAR_SUIT_SET',
  'fashion-accessories': 'ACCESSORY EYEWEAR',
  'bags-luggage': 'BACKPACK HANDBAG LUGGAGE SUITCASE TOTE_BAG',
  jewellery:
    'BRACELET CHARM EARRING FASHIONEARRING FASHIONNECKLACEBRACELETANKLET FASHIONRING FINEEARRING FINENECKLACEBRACELETANKLET FINEOTHER FINERING JEWELRY_SET NECKLACE RING',
  'scarves-hats': 'EARMUFF HAT',
  wallets: 'WALLET',
  furniture: 'FURNITURE',
  sofas: 'SOFA OTTOMAN',
  chairs: 'BEAN_BAG_CHAIR BENCH CHAIR STOOL_SEATING',
  beds: 'BED BED_FRAME HEADBOARD',
  'tables-desks': 'DESK TABLE',
  'cabinets-shelves': 'CABINET DRESSER SHELF',
  'kitchen-dining':
    'BAKING_PAN BAKING_PAPER BOTTLE_RACK CASSEROLES DISHWARE_PLACE_SETTING DISHWARE_PLATE DRINKING_CUP DUTCH_OVENS FLATWARE FOOD_PREPARATION_MOLD JAR KITCHEN KITCHEN_KNIFE MEAL_HOLDER PLACEMAT SAUTE_FRY_PAN SHEET_PAN WHEEL_CUTTER',
  'bedding-bath':
    'AIR_MATTRESS FLAT_SHEET HOME_BED_AND_BATH PILLOW TOILET_PAPER_HOLDER TOOTHBRUSH_HOLDER TOWEL_HOLDER',
  'home-decoration':
    'CANDLE CANDLE_HOLDER CLOCK CURTAIN FURNITURE_COVER HOME_FURNITURE_AND_DECOR HOME_MIRROR INCENSE PICTURE_FRAME RUG VASE WALL_ART WINDOW_SHADE',
  lighting:
    'HOME_LIGHTING_ACCESSORY HOME_LIGHTING_AND_LAMPS LAMP LIGHT_BULB LIGHT_FIXTURE STRING_LIGHT',
  'home-storage':
    'BASKET CLOTHES_HANGER CLOTHES_RACK HOME_ORGANIZERS_AND_STORAGE LAUNDRY_HAMPER STORAGE_BAG STORAGE_BOX STORAGE_HOOK UTILITY_CART_WAGON JEWELRY_STORAGE',
  garden: 'ABIS_LAWN_AND_GARDEN OUTDOOR_LIVING PLANTER WILDLIFE_FEEDER',
  'household-cleaning':
    'AREA_DEODORIZER BUCKET CLEANING_AGENT CLEANING_BRUSH DISHWASHER_DETERGENT DRYING_RACK JANITORIAL_SUPPLY LAUNDRY_DETERGENT TRASH_CAN WASTE_BAG',
  'coffee-makers': 'COFFEE_MAKER',
  'food-preparation-appliances': 'FOOD_BLENDER FOOD_SLICER VACUUM_SEALER_MACHINE',
  'vacuum-cleaners': 'VACUUM_CLEANER',
  'heating-cooling': 'AIR_CONDITIONER DEHUMIDIFIER ELECTRIC_FAN',
  'water-appliances': 'ELECTRIC_WATER_BOILER WATER_PURIFICATION_UNIT',
  'major-appliances': 'MAJOR_HOME_APPLIANCES',
  beauty: 'ABIS_BEAUTY BEAUTY',
  'hair-care': 'HAIR_CLEANER_CONDITIONER',
  shampoos: 'SHAMPOO',
  makeup: 'EYELID_COLOR',
  skincare: 'SKIN_MOISTURIZER',
  'bath-body': 'BATHWATER_ADDITIVE SKIN_CLEANING_AGENT',
  'personal-hygiene': 'FACIAL_TISSUE SKIN_CLEANING_WIPE',
  'oral-care': 'MOUTHWASH',
  razors: 'RAZOR_BLADE_CARTRIDGE',
  'sun-care': 'SUNSCREEN',
  'beauty-tools': 'COSMETIC_BRUSH COSMETIC_CASE HAIR_COMB',
  'baby-care': 'BABY_PRODUCT',
  'toys-games': 'TOY_BUILDING_BLOCK TOY_FIGURE TOY_SLIME TOYS_AND_GAMES',
  learning: 'TEACHING_EQUIPMENT',
  fitness: 'BARBELL EXERCISE_BAND EXERCISE_MAT MUSCLE_ROLLER',
  camping: 'FREESTANDING_SHELTER OUTDOOR_RECREATION_PRODUCT PORTABLE_STOVE SLEEPING_BAG',
  'sports-equipment': 'SPORTING_GOODS',
  'musical-instruments':
    'INSTRUMENT_PARTS_AND_ACCESSORIES PERCUSSION_INSTRUMENTS STRINGED_INSTRUMENTS',
  automotive:
    'AUTO_ACCESSORY AUTO_OIL AUTO_PART CARGO_STRAP STEERING_WHEEL_COVER VEHICLE_SEAT_COVER',
  tools:
    'DRILL_BITS FASTENER_DRIVE_BIT LADDER PAINT_BRUSH PLIERS SAW_BLADE SCREWDRIVER TOOLS WRENCH',
  'home-improvement':
    'ABIS_HOME_IMPROVEMENT BUILDING_MATERIAL DOORSTOP ELECTROMECHANICAL_GAUGE FAUCET HARDWARE HARDWARE_HANDLE HARDWARE_TUBING LOCK MECHANICAL_COMPONENTS PLUMBING_FIXTURE SAFETY_SUPPLY SECURITY_ELECTRONICS',
  stationery:
    'FILE_FOLDER LABEL PRINT_COPY_PAPER STAPLER STICKER_DECAL STORAGE_BINDER WRITING_BOARD WRITING_INSTRUMENT',
  'office-supplies': 'OFFICE_PRODUCTS OFFICE_ELECTRONICS SHIPPING_BOX',
  'pet-care': 'PET_SUPPLIES',
  groceries: 'GROCERY',
  bread: 'BREAD',
  'breakfast-cereal': 'BREAKFAST_CEREAL',
  'biscuits-cookies': 'COOKIE CRACKER',
  cakes: 'CAKE',
  'butter-cream': 'DAIRY_BASED_BUTTER NON_DAIRY_CREAM',
  cheese: 'DAIRY_BASED_CHEESE',
  'dairy-eggs': 'DAIRY_BASED_DRINK',
  'soft-drinks': 'DRINK_FLAVORED',
  juices: 'JUICE_AND_JUICE_DRINK',
  'tea-coffee': 'COFFEE TEA',
  'baking-ingredients': 'BAKING_MIX EDIBLE_OIL_VEGETABLE FLOUR HERB',
  'meat-fish': 'FISH JERKY MEAT',
  'fruit-vegetables': 'FRUIT VEGETABLE',
  'nuts-dried-fruit': 'NUTS',
  'grains-pasta': 'LEGUME NOODLE',
  spreads: 'HONEY NUT_BUTTER',
  sauces: 'SALAD_DRESSING SAUCE',
  'savoury-snacks': 'SNACK_CHIP_AND_CRISP SNACK_MIX',
  'snack-bars': 'SNACK_FOOD_BAR',
  'snacks-sweets': 'FRUIT_SNACK',
  water: 'WATER',
};
export const FOOD_CATEGORY_GROUPS: Record<string, string> = {
  groceries: 'foods',
  drinks: 'beverages unsweetened-beverages',
  water: 'waters mineral-waters natural-mineral-waters table-waters',
  juices: 'juices fruit-juices fruit-nectars',
  'soft-drinks': 'sodas soft-drinks sweetened-beverages',
  'plant-based-drinks': 'plant-based-beverages plant-milks',
  'tea-coffee': 'teas coffees herbal-teas',
  'dairy-eggs': 'dairies dairy-products eggs',
  milk: 'milks',
  cheese: 'cheeses cheese-spreads',
  yogurts: 'yogurts fermented-dairy-desserts skyrs',
  'butter-cream': 'butters creams',
  'bakery-breakfast': 'bakery-products biscuits-and-cakes',
  bread: 'breads crispbreads',
  'biscuits-cookies': 'biscuits cookies wafers crackers shortbread-cookies',
  'breakfast-cereal': 'breakfast-cereals',
  cakes: 'cakes pastries',
  'snacks-sweets': 'snacks sweet-snacks sweets desserts',
  chocolate: 'chocolates chocolate-bars confectioneries',
  'savoury-snacks': 'salty-snacks crisps appetizers',
  'snack-bars': 'cereal-bars fruit-bars',
  pantry: 'groceries dried-products soups cereals-and-their-products',
  spreads: 'spreads sweet-spreads salted-spreads nut-butters honeys',
  sauces: 'sauces condiments seasonings',
  'grains-pasta': 'cereals cereal-grains pastas legumes',
  'baking-ingredients': 'baking-ingredients sugars flours raising-agents vegetable-oils',
  'nuts-dried-fruit': 'nuts dried-fruits',
  'fresh-frozen': 'frozen-foods',
  'fruit-vegetables': 'fruits vegetables',
  'meat-fish': 'meats fishes seafood',
  'baby-food': 'baby-foods biscuits-for-babies cereals-for-babies',
  'baby-formula': 'baby-milks infant-formulas',
  'pet-food': 'pet-foods',
};
export const BEAUTY_CATEGORY_GROUPS: Record<string, string> = {
  beauty: 'beauty-products',
  skincare: 'skin-care moisturizing-creams moisturising-creams lotion',
  'face-care':
    'face facial-creams face-lotions moisturising anti-ageing anti-aging-face-care-products anti-wrinkles-creams cleansers cleansing-waters micellar-water nose-strips lip-balms eye-contour-creams',
  'body-care':
    'body body-creams body-milks body-oils hand-creams foot-creams body-balms-and-butters moisturizing-body-creams petroleum-jellies leg-care-products body-gels body-powders bust',
  'sun-care': 'suncare sunscreen self-tanner tan-preparers in-sun-protections',
  'hair-care': 'hair hair-care',
  shampoos: 'shampoos shampoos-conditioners shampoos-shower-gels',
  'hair-conditioners': 'hair-conditioners',
  'hair-styling': 'hair-styling-products hair-dyes hair-masks hair-straightening hair-gel',
  makeup: 'makeup eyes eyes-makeup face-makeup lip-makeup coloured flavoured',
  'nail-care': 'nail-products nail-makeup manicure-glues nail-hardener',
  fragrances:
    'perfumes men-perfumes women-perfumes kids-perfumes eau-de-toilette cologne body-mists',
  'shaving-hair-removal':
    'shaving hair-removal depilatory-wax post-epilation-lotion pre-shave-products',
  aftershaves: 'aftershaves aftershave-balms aftershave-lotions',
  'shaving-foam-gel': 'shaving-foam shaving-gel shaving-soaps',
  razors: 'razors razor-blades',
  'bath-body':
    'showers-and-baths soaps shower-gels shower-creams shower-oils bubble-baths bath-salts',
  'oral-care': 'toothpastes mouthwash',
  'personal-hygiene':
    'hygiene intimate-hygiene deodorants anti-perspirants moist-wipes tampons cotton-buds hydro-alcoholic-gels condoms personal-lubricants',
  'beauty-tools': 'accessories',
  'baby-care': 'baby-wipes shampoos-for-babies',
};
export type SupplierCategoryNode = {
  id: string;
  name: string;
  parents: string[];
  aliases?: string[];
};
export function categoryRules(groups: Record<string, string>, prefix = '') {
  return new Map(
    Object.entries(groups).flatMap(([target, values]) =>
      values
        .split(' ')
        .filter(Boolean)
        .map((id) => [prefix + id, target] as const),
    ),
  );
}
export function taxonomyPath(slug: string): string[] {
  const bySlug = new Map(MARKETPLACE_CATEGORIES.map((category) => [category.slug, category]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = bySlug.get(slug);
  while (current && !seen.has(current.slug)) {
    seen.add(current.slug);
    path.unshift(current.slug);
    current = current.parentSlug ? bySlug.get(current.parentSlug) : undefined;
  }
  return path;
}
export function commonCategory(slugs: string[]): string | null {
  const paths = [...new Set(slugs)].map(taxonomyPath);
  const first = paths[0] ?? [];
  return first.filter((slug, index) => paths.every((path) => path[index] === slug)).at(-1) ?? null;
}
export function deriveCategoryMappings(nodes: SupplierCategoryNode[], rules: Map<string, string>) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, { categorySlug: string | null; sourceDepth: number }>();
  function resolve(
    id: string,
    seen = new Set<string>(),
  ): { categorySlug: string | null; sourceDepth: number } {
    const cached = cache.get(id);
    if (cached) return cached;
    if (seen.has(id)) return { categorySlug: null, sourceDepth: 0 };
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const parents = (byId.get(id)?.parents ?? []).map((parent) => resolve(parent, nextSeen));
    const direct = rules.get(id);
    const result = {
      categorySlug:
        direct ??
        commonCategory(
          parents.flatMap((parent) => (parent.categorySlug ? [parent.categorySlug] : [])),
        ),
      sourceDepth: parents.length
        ? Math.max(...parents.map((parent) => parent.sourceDepth)) + 1
        : 0,
    };
    cache.set(id, result);
    return result;
  }
  return nodes.map((node) => ({ ...node, ...resolve(node.id) }));
}

export type CategoryAudience = 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS';
/** Only explicit supplier statements; colour, brand and appearance are never evidence. */
export function explicitAudience(values: string[]): CategoryAudience | undefined {
  const text = values.join(' ').toLowerCase();
  if (/\b(kids?|children|boys?|girls?)\b/.test(text)) return 'KIDS';
  const men = /\b(men(?:[’']?s)?|male)\b/.test(text);
  const women = /\b(women(?:[’']?s)?|female)\b/.test(text);
  if (/\bunisex\b/.test(text) || (men && women)) return 'UNISEX';
  if (women) return 'WOMEN';
  if (men) return 'MEN';
  return undefined;
}
export function audienceCategory(slug: string, audience?: CategoryAudience) {
  if (!audience || !['watches', 'shoes', 'clothing'].includes(slug)) return slug;
  return `${{ MEN: 'mens', WOMEN: 'womens', UNISEX: 'unisex', KIDS: 'kids' }[audience]}-${slug}`;
}
