// Food image lookup for recipes. Pexels API is the source — broad coverage
// of cuisines (Korean, Bahamian, niche Western dishes) and accurate keyword
// search where TheMealDB's ~300-recipe set fell apart.
//
// Strategy:
//   1. Search Pexels with the recipe title (Pexels ranks by relevance)
//   2. Search Pexels with cuisine + "food" as fallback
//   3. Return null — UI uses the cuisine-themed gradient placeholder
//
// Used by lib/notion-sync.ts (auto-enrich on every sync) and the on-demand
// /api/enrich-images endpoint.

type PexelsPhoto = {
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
  alt?: string;
};

type PexelsResponse = {
  photos?: PexelsPhoto[];
};

async function searchPexels(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
      query
    )}&per_page=3&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: key } });
    if (!r.ok) return null;
    const j = (await r.json()) as PexelsResponse;
    if (j.photos && j.photos.length > 0) {
      return j.photos[0].src.large;
    }
  } catch {}
  return null;
}

export async function findRecipeImage(
  title: string,
  cuisine: string | null
): Promise<string | null> {
  const direct = await searchPexels(title);
  if (direct) return direct;

  if (cuisine) {
    const cuisinePhoto = await searchPexels(`${cuisine.toLowerCase()} food`);
    if (cuisinePhoto) return cuisinePhoto;
  }

  return null;
}
