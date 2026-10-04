// Local calendar date, not UTC. Seeded appointments are fictional demo records.
export function nextMonday(today = new Date()): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
