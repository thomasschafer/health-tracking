import { describe, expect, it } from "vitest";
import { toggleNoteSuggestion } from "./ReviewStep.tsx";

describe("toggleNoteSuggestion", () => {
  it("adds and removes phrases, keeping what was typed", () => {
    expect(toggleNoteSuggestion("", "Stressed")).toBe("Stressed");
    expect(toggleNoteSuggestion("Slept badly", "Stressed")).toBe("Slept badly, Stressed");
    expect(toggleNoteSuggestion("Slept badly, Stressed", "Stressed")).toBe("Slept badly");
    expect(toggleNoteSuggestion(" Stressed ,", "Stressed")).toBe("");
  });
});
