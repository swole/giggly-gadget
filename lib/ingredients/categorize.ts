export type Category =
  | "produce"
  | "protein"
  | "dairy"
  | "pantry"
  | "spice"
  | "grain"
  | "other";

const DICT: Record<string, Category> = {};

const add = (cat: Category, names: string[]) => {
  for (const n of names) DICT[n.toLowerCase()] = cat;
};

add("protein", [
  "chicken", "chicken thigh", "chicken breast", "beef", "ground beef",
  "pork", "pork belly", "bacon", "ham", "sausage", "lamb",
  "fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "anchovies",
  "shrimp", "prawn", "prawns", "squid", "octopus", "scallop", "scallops",
  "tofu", "tempeh", "seitan", "egg", "eggs",
]);

add("produce", [
  "onion", "red onion", "shallot", "scallion", "scallions", "spring onion", "leek",
  "garlic", "ginger", "lemongrass", "galangal",
  "tomato", "cherry tomato", "carrot", "celery", "potato", "sweet potato",
  "bell pepper", "pepper", "chili", "chili pepper", "jalapeno", "jalapeño",
  "cucumber", "zucchini", "eggplant", "cabbage", "napa cabbage", "bok choy", "kale",
  "spinach", "lettuce", "arugula", "broccoli", "cauliflower", "asparagus",
  "mushroom", "mushrooms", "shiitake", "enoki", "oyster mushroom",
  "lemon", "lime", "orange", "apple", "pear", "avocado",
  "cilantro", "coriander", "parsley", "basil", "thai basil", "mint", "dill", "chive", "chives",
  "corn",
]);

add("dairy", [
  "milk", "whole milk", "cream", "heavy cream", "sour cream", "yogurt", "greek yogurt",
  "butter", "ghee", "cheese", "parmesan", "mozzarella", "cheddar", "feta", "ricotta", "cream cheese",
]);

add("pantry", [
  "soy sauce", "light soy sauce", "dark soy sauce", "tamari", "fish sauce", "oyster sauce",
  "hoisin", "hoisin sauce", "sesame oil", "olive oil", "vegetable oil", "canola oil", "neutral oil",
  "vinegar", "rice vinegar", "balsamic", "balsamic vinegar", "apple cider vinegar",
  "sugar", "brown sugar", "honey", "maple syrup", "mirin", "sake", "shaoxing wine",
  "cornstarch", "corn starch", "flour", "all-purpose flour", "baking soda", "baking powder",
  "tomato paste", "canned tomatoes", "coconut milk", "coconut cream",
  "broth", "stock", "vegetable stock", "beef stock",
  "tahini", "miso", "gochujang", "sambal", "sriracha", "chili oil", "chili crisp",
  "peanut butter", "almond butter",
]);

add("spice", [
  "salt", "kosher salt", "sea salt", "pepper", "black pepper", "white pepper",
  "paprika", "smoked paprika", "cumin", "coriander seed", "turmeric", "cinnamon",
  "nutmeg", "cardamom", "cloves", "star anise", "bay leaf", "bay leaves",
  "oregano", "thyme", "rosemary", "sage", "tarragon",
  "red pepper flakes", "chili flakes", "cayenne", "msg", "five-spice",
  "sichuan peppercorn", "sichuan peppercorns",
]);

add("grain", [
  "rice", "jasmine rice", "basmati rice", "brown rice", "sushi rice", "arborio rice",
  "pasta", "spaghetti", "penne", "fettuccine", "linguine", "rigatoni",
  "noodle", "noodles", "ramen", "udon", "soba", "rice noodle", "rice noodles", "egg noodle",
  "bread", "tortilla", "tortillas", "wrap", "pita", "panko", "breadcrumbs",
  "quinoa", "couscous", "oats",
]);

// Add wine, water, and a few more pantry/produce items missed in V1
add("pantry", ["wine", "red wine", "white wine", "water", "stock", "broth"]);
add("produce", [
  "lime juice", "lemon juice", "orange juice",
  "shiitake mushroom", "button mushroom",
  "ginger paste", "garlic paste",
]);

function singularize(word: string): string {
  // crude but effective for the common food plurals in this dataset
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y"; // berries -> berry
  if (word.endsWith("ves") && word.length > 4) return word.slice(0, -3) + "f"; // leaves -> leaf
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);       // tomatoes -> tomato
  if (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes") || word.endsWith("sses")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function categorize(name: string | null | undefined): Category {
  if (!name) return "other";
  const n = name.trim().toLowerCase();
  if (DICT[n]) return DICT[n];

  const sing = singularize(n);
  if (sing !== n && DICT[sing]) return DICT[sing];

  const words = n.split(/\s+/);
  // Try progressive suffixes of the full name (singularized too)
  for (let i = 0; i < words.length; i++) {
    const sub = words.slice(i).join(" ");
    if (DICT[sub]) return DICT[sub];
    const subSing = singularize(sub);
    if (subSing !== sub && DICT[subSing]) return DICT[subSing];
  }
  // Try individual words (singularized)
  for (const w of words) {
    if (DICT[w]) return DICT[w];
    const ws = singularize(w);
    if (ws !== w && DICT[ws]) return DICT[ws];
  }
  return "other";
}
