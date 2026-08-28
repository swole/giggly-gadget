import {
  linkedRecipeCandidates,
  balancedJson,
  captionTracksFrom,
  captionsJson3ToText,
  captionsXmlToText,
  detectVideo,
  extractPlayerResponse,
  firstUrlIn,
  pickCaptionTrack,
  tiktokDetailFrom,
} from "./video";

describe("detectVideo", () => {
  test("youtube watch / short / shorts / embed / mobile / music", () => {
    const id = "dQw4w9WgXcQ";
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/watch?feature=share&v=${id}&t=12s`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtube.com/embed/${id}`,
      `https://music.youtube.com/watch?v=${id}`,
    ]) {
      const v = detectVideo(u);
      expect(v).toEqual({ platform: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` });
    }
  });
  test("youtube channel / playlist pages are not videos", () => {
    expect(detectVideo("https://www.youtube.com/@somechannel")).toBeNull();
    expect(detectVideo("https://www.youtube.com/playlist?list=PL123")).toBeNull();
  });
  test("tiktok canonical and short links", () => {
    expect(detectVideo("https://www.tiktok.com/@cook/video/7312345678901234567?lang=en")).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@cook/video/7312345678901234567?lang=en",
      short: false,
    });
    expect(detectVideo("https://vm.tiktok.com/ZSabc123/")?.platform).toBe("tiktok");
    expect(detectVideo("https://vt.tiktok.com/ZSabc123/")).toMatchObject({ platform: "tiktok", short: true });
    expect(detectVideo("https://www.tiktok.com/t/ZTabc/")).toMatchObject({ platform: "tiktok", short: true });
  });
  test("instagram reels / posts are recognised (so we can explain), facebook reels too", () => {
    expect(detectVideo("https://www.instagram.com/reel/Cx12345/")?.platform).toBe("instagram");
    expect(detectVideo("https://www.instagram.com/p/Cx12345/?igsh=1")?.platform).toBe("instagram");
    expect(detectVideo("https://www.instagram.com/somechef/")).toBeNull();
    expect(detectVideo("https://www.facebook.com/reel/123456")?.platform).toBe("facebook");
  });
  test("ordinary pages and garbage", () => {
    expect(detectVideo("https://www.seriouseats.com/mapo-tofu-recipe")).toBeNull();
    expect(detectVideo("not a url")).toBeNull();
  });
});

describe("firstUrlIn", () => {
  test("finds the link inside share-sheet text and trims trailing punctuation", () => {
    expect(firstUrlIn("Look at this! https://youtu.be/dQw4w9WgXcQ.")).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(firstUrlIn("Easy dinner #fyp https://vm.tiktok.com/ZSabc/ via TikTok")).toBe("https://vm.tiktok.com/ZSabc/");
    expect(firstUrlIn("no link here")).toBeNull();
    expect(firstUrlIn(null)).toBeNull();
  });
});

describe("player response parsing", () => {
  const player = {
    videoDetails: { title: "Mapo Tofu", author: "Chef", shortDescription: "Recipe:\n300 g tofu\n{not json}", lengthSeconds: "512" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=zh", languageCode: "zh", kind: "asr", name: { simpleText: "Chinese (auto)" } },
          { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en", languageCode: "en", kind: "asr", name: { runs: [{ text: "English (auto-generated)" }] } },
          { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en-GB", languageCode: "en-GB", name: { simpleText: "English" } },
        ],
      },
    },
  };
  const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var other = {a:1};</script></html>`;

  test("extractPlayerResponse finds the balanced object even with braces inside strings", () => {
    const p = extractPlayerResponse(html);
    expect((p?.videoDetails as { title: string }).title).toBe("Mapo Tofu");
    expect((p?.videoDetails as { shortDescription: string }).shortDescription).toContain("{not json}");
    expect(extractPlayerResponse("<html>nothing</html>")).toBeNull();
  });
  test("balancedJson", () => {
    expect(balancedJson('x = {"a":{"b":"}"}} tail', 4)).toBe('{"a":{"b":"}"}}');
    expect(balancedJson("{unterminated", 0)).toBeNull();
  });
  test("caption tracks: human English beats auto English beats others", () => {
    const tracks = captionTracksFrom(player);
    expect(tracks).toHaveLength(3);
    expect(pickCaptionTrack(tracks)?.languageCode).toBe("en-GB");
    expect(pickCaptionTrack(tracks.slice(0, 2))?.languageCode).toBe("en");
    expect(pickCaptionTrack(tracks.slice(0, 1))?.languageCode).toBe("zh");
    expect(pickCaptionTrack([])).toBeNull();
    expect(captionTracksFrom(null)).toEqual([]);
  });
  test("captions xml and json3 to text", () => {
    const xml = `<?xml version="1.0"?><transcript><text start="0" dur="1.2">first bit &amp; more</text><text start="1.2" dur="2">second&#39;s line</text></transcript>`;
    expect(captionsXmlToText(xml)).toBe("first bit & more second's line");
    const j3 = JSON.stringify({ events: [{ segs: [{ utf8: "hello " }, { utf8: "there" }] }, { segs: [{ utf8: "\n" }] }, { segs: [{ utf8: " friend" }] }] });
    expect(captionsJson3ToText(j3)).toBe("hello there friend");
    expect(captionsJson3ToText("nope")).toBe("");
  });
});

describe("tiktokDetailFrom", () => {
  test("reads caption and author from the rehydration JSON", () => {
    const data = {
      __DEFAULT_SCOPE__: {
        "webapp.video-detail": { itemInfo: { itemStruct: { id: "7312", desc: "Full caption with #tags and 200g tofu", author: { nickname: "Cook" } } } },
      },
    };
    const html = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></html>`;
    expect(tiktokDetailFrom(html)).toEqual({ desc: "Full caption with #tags and 200g tofu", author: "Cook", id: "7312" });
    expect(tiktokDetailFrom("<html></html>")).toBeNull();
  });
});

describe("linkedRecipeCandidates", () => {
  test("prefers the 'Get the recipe' line, skips social/merch/youtube links, dedupes, max 3", () => {
    const d = [
      "Subscribe: http://bit.ly/2xOQ7zs",
      "Follow me https://www.instagram.com/marionskitchen/ and https://www.tiktok.com/@marionskitchen",
      "Shop https://www.amazon.com/shop/marion",
      "Get the recipe: https://www.marionskitchen.com/mapo-tofu/",
      "More: https://www.marionskitchen.com/ https://www.marionskitchen.com/mapo-tofu/",
      "https://example.com/a https://example.com/b https://example.com/c",
    ].join("\n");
    const c = linkedRecipeCandidates(d);
    expect(c[0]).toBe("https://www.marionskitchen.com/mapo-tofu/");
    expect(c).toHaveLength(3);
    expect(c.some((u) => /instagram|tiktok|amazon|bit\.ly/.test(u))).toBe(false);
    expect(linkedRecipeCandidates(null)).toEqual([]);
  });
});

import { isPrivateHost, jsonLdImage, extractRecipeJsonLd, isoDurationToMinutes, flattenInstructions } from "./fetch-page";

describe("fetch-page helpers", () => {
  test("private hosts are refused", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.5", "169.254.169.254", "[::1]", "fd00::1", "printer.local", "db.internal", "100.64.0.1"]) {
      expect(isPrivateHost(h)).toBe(true);
    }
    for (const h of ["www.marionskitchen.com", "8.8.8.8", "172.32.0.1", "youtube.com"]) expect(isPrivateHost(h)).toBe(false);
  });
  test("jsonLdImage handles string / array / ImageObject and drops http", () => {
    expect(jsonLdImage("https://x/a.jpg")).toBe("https://x/a.jpg");
    expect(jsonLdImage(["http://x/a.jpg", "https://x/b.jpg"])).toBe("https://x/b.jpg");
    expect(jsonLdImage({ "@type": "ImageObject", url: "https://x/c.jpg" })).toBe("https://x/c.jpg");
    expect(jsonLdImage(null)).toBeNull();
  });
  test("jsonld recipe found inside @graph; durations; instructions flatten", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"X","recipeIngredient":["1 egg"],"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Crack."},{"@type":"HowToStep","text":"Fry."}]}]}]}</script>`;
    const j = extractRecipeJsonLd(html);
    expect(j?.name).toBe("X");
    expect(flattenInstructions(j?.recipeInstructions)).toEqual(["Crack.", "Fry."]);
    expect(isoDurationToMinutes("PT1H30M")).toBe(90);
    expect(isoDurationToMinutes("P1DT2H")).toBe(1560);
    expect(isoDurationToMinutes(undefined)).toBeNull();
  });
});
