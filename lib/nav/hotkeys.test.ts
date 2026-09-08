import { hotkeyAction, hotkeyDigit, isTypingTarget } from "./hotkeys";

describe("hotkeyAction", () => {
  const press = (key: string, shiftKey = false) => ({ key, shiftKey });

  it("maps digits onto a planner's five tabs, then the person button", () => {
    expect(hotkeyAction(press("1"), 5)).toEqual({ kind: "tab", index: 0 });
    expect(hotkeyAction(press("5"), 5)).toEqual({ kind: "tab", index: 4 });
    expect(hotkeyAction(press("6"), 5)).toEqual({ kind: "person" });
    expect(hotkeyAction(press("7"), 5)).toBeNull();
  });

  it("shifts the numbering for the helper's three tabs", () => {
    expect(hotkeyAction(press("3"), 3)).toEqual({ kind: "tab", index: 2 });
    expect(hotkeyAction(press("4"), 3)).toEqual({ kind: "person" });
    expect(hotkeyAction(press("5"), 3)).toBeNull();
  });

  it("opens help on ?, however the keyboard reports it", () => {
    expect(hotkeyAction(press("?"), 5)).toEqual({ kind: "help" });
    expect(hotkeyAction(press("/", true), 5)).toEqual({ kind: "help" });
    expect(hotkeyAction(press("/"), 5)).toBeNull(); // bare slash stays free
  });

  it("ignores everything else", () => {
    expect(hotkeyAction(press("0"), 5)).toBeNull();
    expect(hotkeyAction(press("!", true), 5)).toBeNull(); // Shift+1 stays free
    expect(hotkeyAction(press("k"), 5)).toBeNull();
    expect(hotkeyAction(press("Enter"), 5)).toBeNull();
  });
});

describe("hotkeyDigit", () => {
  it("prints 1-9 and nothing past that", () => {
    expect(hotkeyDigit(0)).toBe("1");
    expect(hotkeyDigit(8)).toBe("9");
    expect(hotkeyDigit(9)).toBeNull();
    expect(hotkeyDigit(-1)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({
    tagName,
    getAttribute: () => null,
    ...extra,
  });

  it("catches the fields you type numbers into", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
  });

  it("lets plain page chrome through", () => {
    expect(isTypingTarget(el("BODY"))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
