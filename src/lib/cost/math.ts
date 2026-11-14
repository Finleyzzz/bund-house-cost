import type { CostVersion, Dish, Ingredient, Material, MenuOption } from "./types";

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function lineAmount(price: number | null, baseUnit: number | null, usage: number) {
  if (price == null || baseUnit == null || !(baseUnit > 0) || !Number.isFinite(usage)) return null;
  return round2((price / baseUnit) * usage);
}

export function findMaterial(line: Pick<Ingredient, "materialId" | "name">, materials: Material[]) {
  if (line.materialId) {
    const hit = materials.find((item) => item.id === line.materialId);
    if (hit) return hit;
  }
  const name = line.name.trim().toLowerCase();
  if (!name) return null;
  return materials.find((item) => item.name.trim().toLowerCase() === name) ?? null;
}

export function recipeCost(lines: Ingredient[], materials: Material[]) {
  let sum = 0;
  let any = false;
  for (const line of lines) {
    const mat = findMaterial(line, materials);
    const amount = lineAmount(mat?.price ?? null, mat?.baseUnit ?? null, line.usage);
    if (amount == null) continue;
    sum += amount;
    any = true;
  }
  return any ? round2(sum) : null;
}

export function saleFrom(cost: number | null, margin: number | null) {
  if (cost == null || margin == null || !(margin >= 0) || margin >= 1) return null;
  return round2(cost / (1 - margin));
}

export function parseMargin(text: string) {
  const n = parseNum(text.replace(/%/g, ""));
  if (n == null) return null;
  const rate = n > 1 ? n / 100 : n;
  if (!(rate >= 0) || rate >= 1) return null;
  return rate;
}

export function marginRate(sale: number, cost: number) {
  if (!(sale > 0)) return null;
  return (sale - cost) / sale;
}

export type VersionStats = {
  cost: number | null;
  sale: number | null;
  profit: number | null;
  margin: number | null;
  foodCost: number | null;
  known: boolean;
};

export function versionCost(version: CostVersion, materials: Material[]): number | null {
  if (version.enteredCost != null && Number.isFinite(version.enteredCost)) return round2(version.enteredCost);
  return recipeCost(version.lines, materials);
}

export function versionStats(version: CostVersion, materials: Material[]): VersionStats {
  const cost = versionCost(version, materials);
  const margin = typeof version.margin === "number" ? version.margin : null;
  const sale =
    version.enteredSale != null && Number.isFinite(version.enteredSale)
      ? round2(version.enteredSale)
      : saleFrom(cost, margin);
  if (cost == null || sale == null || margin == null) {
    return { cost, sale, profit: null, margin, foodCost: null, known: false };
  }
  const profit = round2(sale - cost);
  const foodCost = sale > 0 ? cost / sale : null;
  return { cost, sale, profit, margin, foodCost, known: true };
}

export function latestVersion(dish: Dish) {
  return dish.versions[dish.versions.length - 1];
}

export function primaryOptionIndex(options: Pick<MenuOption, "size">[]) {
  const large = options.findIndex((option) => option.size === "L");
  return large >= 0 ? large : 0;
}

export type MarginTone = "good" | "watch" | "tight" | "none";

export function marginTone(rate: number | null): MarginTone {
  if (rate == null) return "none";
  if (rate >= 0.65) return "good";
  if (rate >= 0.55) return "watch";
  return "tight";
}

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "Rp 0";
  const neg = n < 0;
  return `${neg ? "−" : ""}Rp ${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;
}

export function formatPct(rate: number | null) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatPts(points: number) {
  if (!Number.isFinite(points) || Math.abs(points) < 0.05) return "0";
  const sign = points > 0 ? "+" : "−";
  return `${sign}${Math.abs(points).toFixed(1)}`;
}

export function formatUnitPrice(n: number) {
  return formatMoney(n);
}

export function formatQty(n: number) {
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatStamp(s: string) {
  const [date, time] = s.split("T");
  const [y, m, d] = (date ?? "").split("-");
  if (!y || !m || !d) return s;
  const day = `${y}.${m}.${d}`;
  return time ? `${day} ${time}` : day;
}

export function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Rupiah. "1.688.000", "1688000", "528k" and "1.5jt" all work. A single dot is a decimal. */
export function parseNum(s: string) {
  const t = s.trim().replace(/\s/g, "").replace(/^rp\.?/i, "");
  if (!t) return null;
  const short = t.toLowerCase().match(/^(\d+(?:[.,]\d+)?)(jt|juta|k|rb|ribu)$/);
  if (short) {
    const n = Number(short[1].replace(",", "."));
    const mult = short[2] === "jt" || short[2] === "juta" ? 1_000_000 : 1_000;
    return Number.isFinite(n) ? Math.round(n * mult) : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function costSignature(margin: number, lines: Ingredient[], entered: number | null) {
  return JSON.stringify({
    margin,
    entered,
    lines: lines.map((line) => ({
      materialId: line.materialId,
      name: line.name.trim(),
      usage: round4(line.usage),
    })),
  });
}
