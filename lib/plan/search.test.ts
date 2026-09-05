import { matchesSearch, normalizeSearch, searchWords } from "./search";

const salmon = { title: "Crisp-Skin Salmon with Charred Lime", cuisine: "Other", tags: ["Heart Healthy", "Quick", "Date Night"] };
const beans = { title: "Smoky Garlic Black Beans", cuisine: "Mexican", tags: ["Vegan", "Heart Healthy", "Quick"] };
const brulee = { title: "Crème Brûlée", cuisine: "French", tags: ["Date Night"] };

describe("normalizeSearch", () => {
  it("lower-cases, strips accents and turns punctuation into spaces", () => {
    expect(normalizeSearch("Crisp-Skin Salmon")).toBe("crisp skin salmon");
    expect(normalizeSearch("Crème Brûlée")).toBe("creme brulee");
    expect(normalizeSearch("  Beef & Onion  ")).toBe("beef onion");
  });
});

describe("searchWords", () => {
  it("splits on whitespace and punctuation and drops empties", () => {
    expect(searchWords("crisp-skin")).toEqual(["crisp", "skin"]);
    expect(searchWords("   ")).toEqual([]);
  });
});

describe("matchesSearch", () => {
  it("a word anywhere in the title matches: 'salmon' finds Crisp-Skin Salmon", () => {
    expect(matchesSearch(salmon, searchWords("salmon"))).toBe(true);
    expect(matchesSearch(beans, searchWords("salmon"))).toBe(false);
  });
  it("hyphens and spaces are interchangeable", () => {
    expect(matchesSearch(salmon, searchWords("crisp skin"))).toBe(true);
    expect(matchesSearch(salmon, searchWords("crisp-skin"))).toBe(true);
    expect(matchesSearch(salmon, searchWords("crispskin"))).toBe(false);
  });
  it("every typed word must hit, in any order", () => {
    expect(matchesSearch(salmon, searchWords("lime salmon"))).toBe(true);
    expect(matchesSearch(salmon, searchWords("salmon beans"))).toBe(false);
  });
  it("cuisine and tags count as searchable text", () => {
    expect(matchesSearch(beans, searchWords("mexican"))).toBe(true);
    expect(matchesSearch(beans, searchWords("vegan quick"))).toBe(true);
    expect(matchesSearch(salmon, searchWords("vegan"))).toBe(false);
  });
  it("accents are ignored both ways", () => {
    expect(matchesSearch(brulee, searchWords("creme brulee"))).toBe(true);
    expect(matchesSearch(brulee, searchWords("Brûlée"))).toBe(true);
  });
  it("an empty query matches everything", () => {
    expect(matchesSearch(beans, [])).toBe(true);
  });
});
