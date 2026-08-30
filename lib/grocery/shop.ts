// Where in Singapore the helper buys an item. Wet market for fresh produce, fish,
// tofu and herbs; supermarket for anything dry, canned, frozen, dairy or packaged;
// "either" for the handful of staples sold well in both places.
//
// Input is the parsed ingredient name (lower-case, as the parser emits) plus its
// category from lib/ingredients/categorize.ts.

export type Shop = "wet_market" | "supermarket" | "either";

export const SHOP_LABEL: Record<Shop, string> = {
  wet_market: "Wet market",
  supermarket: "Supermarket",
  either: "Either",
};

export const SHOP_ORDER: Shop[] = ["wet_market", "supermarket", "either"];

// Names that read as produce/protein but are packaged goods → supermarket.
const PACKAGED_RE =
  /\b(frozen|canned|tinned|tin of|can of|jars?|dried|dry|smoked|cured|bacon|sausages?|ham|cheese|yogh?urt|milk|butter|nuttelex|margarine|seeds?|nuts?|walnuts?|cashews?|peanuts?|almonds?|hemp|chia|flour|starch(?:es)?|powder|pastes?|sauces?|oils?|vinegars?|stock|broth|extract|hummus|edamame|chickpeas?|lentils?|beans?|soybeans?|tofu skin|wonton skins?|noodles?|bread|rolls?|sourdough|chapatis?|tortillas?|oats|barley|millet|quinoa|freekeh|farro|rice|pasta|kombu|wakame|nori|hijiki|miso|gochujang|doubanjiang|gochugaru|ponzu|harissa|tamarind|belacan|cocoa|syrup|honey|sugar|salt|pepper|spices?|cumin|turmeric|paprika|cinnamon|masala|sumac|shichimi|peppercorns?|sesame)\b/i;

// Fresh items that live at the wet market even though the category dictionary may
// file them under "other" or "protein".
const WET_MARKET_RE =
  /\b(tofu|tau ?kwa|tau ?pok|beancurd|tempeh|bean sprouts?|choy sum|chye sim|kai ?lan|gai lan|bok choy|xiao bai cai|spinach|kale|long beans?|brinjal|okra|daikon|bitter ?gourd|capsicum|courgette|cucumber|tomato|cherry tomato|onion|shallot|garlic|ginger|galangal|lemongrass|turmeric root|fresh turmeric|chilli|chili|coriander|mint|basil|parsley|dill|spring onion|scallion|curry leaf|curry leaves|daun kesum|laksa leaf|torch ginger|lime|lemon|banana|apple|avocado|mushroom|shiitake|enoki|king oyster|black fungus|water chestnut|potato|sweet potato|carrot|celery|broccoli|cauliflower|cabbage|napa|mizuna|rocket|lettuce|corn|baby corn|snow peas?|sweetcorn|fish|salmon|mackerel|saba|sardine|seabass|snapper|stingray|cod|tuna|prawn|shrimp|squid|clam|mussel|crab|scallop|chicken|pork|beef|lamb|egg)\b/i;

// Things both shops carry well. Anchored to the whole name (with an optional simple
// qualifier) so "spring onion" stays wet market and only plain "onion" is "either".
const EITHER_RE =
  /^(?:(?:red|white|brown|whole|large|small|sweet|baby|cherry|fresh)\s+)?(eggs?|egg whites?|lemons?|limes?|onions?|potato(?:es)?|carrots?|tomato(?:es)?|cucumbers?|garlic|ginger|bananas?|apples?)$/i;

export function shopFor(name: string | null | undefined, category: string | null | undefined): Shop {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return "supermarket";

  // Frozen/dried/packaged forms of fresh things are supermarket buys (frozen edamame, dried shiitake, canned tomatoes).
  if (/\b(frozen|canned|tinned|dried|dry|smoked|cured)\b/.test(n)) return "supermarket";

  if (EITHER_RE.test(n)) return "either";

  if (WET_MARKET_RE.test(n) && !PACKAGED_RE.test(n.replace(WET_MARKET_RE, ""))) return "wet_market";

  if (category === "produce" || category === "protein") {
    return PACKAGED_RE.test(n) ? "supermarket" : "wet_market";
  }
  return "supermarket";
}
