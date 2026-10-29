import { describe, expect, it } from "vitest";
import { yearSpan } from "./privacy";

describe("yearSpan", () => {
  it("只留年份", () => {
    expect(yearSpan(["2024-03-05", "2024-03-09"])).toBe("2024");
    expect(yearSpan(["2024-12-30", "2025-01-02", "2024-12-31"])).toBe(
      "2024–2025",
    );
    expect(yearSpan([])).toBe("");
  });
});
