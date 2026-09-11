import { freshSeafoodHint } from "./fresh";

describe("freshSeafoodHint", () => {
  it("marks fish and seafood the shopper buys", () => {
    expect(freshSeafoodHint("salmon fillet", "protein")).toMatch(/^Buy fresh\./);
    expect(freshSeafoodHint("prawn", "protein")).toBeTruthy();
    expect(freshSeafoodHint("mackerel", "protein")).toBeTruthy();
    expect(freshSeafoodHint("sotong", "protein")).toBeTruthy();
  });
  it("stays quiet for the pantry forms and for everything else", () => {
    expect(freshSeafoodHint("fish sauce", "pantry")).toBeNull();
    expect(freshSeafoodHint("oyster sauce", "pantry")).toBeNull();
    expect(freshSeafoodHint("fish balls", "protein")).toBeNull();
    expect(freshSeafoodHint("ikan bilis", "protein")).toBeNull();
    expect(freshSeafoodHint("dried shrimp", "pantry")).toBeNull();
    expect(freshSeafoodHint("chicken breast", "protein")).toBeNull();
    expect(freshSeafoodHint("", null)).toBeNull();
  });
});
