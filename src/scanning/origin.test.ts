import { expect, it } from "vitest";
import { isAllowedOrigin } from "../../server/origin";

it("requires an explicit exact HTTPS origin for phone API requests", () => {
  expect(isAllowedOrigin("http://127.0.0.1:5173")).toBe(true);
  expect(isAllowedOrigin("https://localhost:5173")).toBe(true);
  const phone = "https://192.168.1.20:5173";
  expect(isAllowedOrigin(phone)).toBe(false);
  expect(isAllowedOrigin(phone, phone)).toBe(true);
  expect(isAllowedOrigin("https://192.168.1.21:5173", phone)).toBe(false);
  expect(
    isAllowedOrigin("http://192.168.1.20:5173", "http://192.168.1.20:5173"),
  ).toBe(false);
  expect(isAllowedOrigin("https://evil.example")).toBe(false);
});
