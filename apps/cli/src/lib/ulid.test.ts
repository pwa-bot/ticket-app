import { describe, expect, it } from "vitest";
import { displayId, generateTicketId, shortId } from "./ulid.js";

describe("ulid helpers", () => {
  it("generates 26-char uppercase ids", () => {
    const id = generateTicketId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("derives short and display ids", () => {
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    expect(shortId(id)).toBe("01ARZ3ND");
    expect(displayId(id)).toBe("TK-01ARZ3ND");
  });
});
