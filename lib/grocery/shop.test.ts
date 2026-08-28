import { shopFor } from "./shop";

describe("shopFor", () => {
  test("fresh fish, tofu, greens, herbs → wet market", () => {
    expect(shopFor("soft tofu", "protein")).toBe("wet_market");
    expect(shopFor("tau kwa", "protein")).toBe("wet_market");
    expect(shopFor("raw prawn", "protein")).toBe("wet_market");
    expect(shopFor("fresh mackerel fillet", "protein")).toBe("wet_market");
    expect(shopFor("whole seabass or red snapper", "protein")).toBe("wet_market");
    expect(shopFor("choy sum", "produce")).toBe("wet_market");
    expect(shopFor("kailan", "produce")).toBe("wet_market");
    expect(shopFor("bean sprouts", "produce")).toBe("wet_market");
    expect(shopFor("coriander", "produce")).toBe("wet_market");
    expect(shopFor("spring onion", "produce")).toBe("wet_market");
    expect(shopFor("tempeh", "protein")).toBe("wet_market");
    expect(shopFor("long beans", "produce")).toBe("wet_market");
    expect(shopFor("brinjal", "produce")).toBe("wet_market");
  });

  test("packaged, dried, frozen, canned → supermarket even when the base word is fresh", () => {
    expect(shopFor("frozen edamame", "protein")).toBe("supermarket");
    expect(shopFor("dried shiitake", "produce")).toBe("supermarket");
    expect(shopFor("no-salt-added chopped tomatoes", "pantry")).toBe("supermarket");
    expect(shopFor("dried chilli", "produce")).toBe("supermarket");
    expect(shopFor("wonton skins", "grain")).toBe("supermarket");
    expect(shopFor("soba", "grain")).toBe("supermarket");
    expect(shopFor("light soy", "pantry")).toBe("supermarket");
    expect(shopFor("unsweetened soy milk", "pantry")).toBe("supermarket");
    expect(shopFor("chickpeas", "protein")).toBe("supermarket");
    expect(shopFor("red lentils", "protein")).toBe("supermarket");
    expect(shopFor("natural peanut butter", "protein")).toBe("supermarket");
    expect(shopFor("sesame seed", "spice")).toBe("supermarket");
    expect(shopFor("walnuts", "protein")).toBe("supermarket");
  });

  test("the shared basics → either", () => {
    expect(shopFor("egg", "protein")).toBe("either");
    expect(shopFor("egg whites", "protein")).toBe("either");
    expect(shopFor("lemon", "produce")).toBe("either");
    expect(shopFor("lime", "produce")).toBe("either");
    expect(shopFor("onion", "produce")).toBe("either");
    expect(shopFor("garlic", "produce")).toBe("either");
    expect(shopFor("cucumber", "produce")).toBe("either");
    expect(shopFor("sweet potato", "produce")).toBe("either");
  });

  test("category fallback", () => {
    expect(shopFor("mystery green", "produce")).toBe("wet_market");
    expect(shopFor("mystery thing", null)).toBe("supermarket");
    expect(shopFor("", "produce")).toBe("supermarket");
  });
});
