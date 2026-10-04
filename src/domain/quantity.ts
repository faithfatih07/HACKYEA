export const roundKg = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;
export function parseQuantity(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number > 0 && number <= 1_000_000
    ? number
    : null;
}
export const isQuantity = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1_000_000 &&
  Math.abs(roundKg(value) - value) < 0.0000001;

// A physical count may be zero; consumption amounts must remain strictly positive.
export function parseCountQuantity(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return isQuantity(number) ? number : null;
}
