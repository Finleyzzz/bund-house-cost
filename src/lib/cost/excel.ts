import * as XLSX from "xlsx";
import { findMaterial, latestVersion, lineAmount, parseMargin, parseNum, recipeCost, saleFrom } from "@/lib/cost/math";
import type { Category, Dish, Material } from "@/lib/cost/types";

export type CostRow = {
  category: string;
  dish: string;
  nameEn: string;
  listed: boolean;
  material: string;
  materialCat: string;
  baseUnit: number | null;
  price: number | null;
  usage: number | null;
  amount: number | null;
  cost: number | null;
  margin: number | null;
  sale: number | null;
};

const HEADS = ["大类", "菜名", "英文名", "状态", "物料", "物料品类", "基本单位", "单价", "用量", "金额", "总成本", "毛利率", "售价"] as const;

export function isListed(dish: { listed?: boolean }) {
  return dish.listed !== false;
}

export function buildCostRows(dishes: Dish[], categories: Category[], materials: Material[]): CostRow[] {
  const rows: CostRow[] = [];
  for (const dish of dishes) {
    const version = latestVersion(dish);
    if (!version) continue;
    const category = categories.find((item) => item.id === dish.categoryId)?.name ?? "";
    const cost = version.enteredCost != null ? version.enteredCost : recipeCost(version.lines, materials);
    const sale = saleFrom(cost, version.margin);
    const lines = version.lines.length ? version.lines : [null];
    for (const line of lines) {
      const material = line ? findMaterial(line, materials) : undefined;
      const amount = line ? lineAmount(material?.price ?? null, material?.baseUnit ?? null, line.usage) : null;
      rows.push({
        category,
        dish: dish.name,
        nameEn: dish.nameEn,
        listed: isListed(dish),
        material: line?.name ?? "",
        materialCat: material?.category ?? "",
        baseUnit: material?.baseUnit ?? null,
        price: material?.price ?? null,
        usage: line?.usage ?? null,
        amount,
        cost,
        margin: version.margin,
        sale,
      });
    }
  }
  return rows;
}

export function sheetRecords(rows: CostRow[]) {
  return rows.map((row) => ({
    大类: row.category,
    菜名: row.dish,
    英文名: row.nameEn,
    状态: row.listed ? "售卖中" : "已下架",
    物料: row.material,
    物料品类: row.materialCat,
    基本单位: row.baseUnit ?? "",
    单价: row.price ?? "",
    用量: row.usage ?? "",
    金额: row.amount ?? "",
    总成本: row.cost ?? "",
    毛利率: row.margin == null ? "" : Math.round(row.margin * 1000) / 10,
    售价: row.sale ?? "",
  }));
}

export function downloadCostWorkbook(rows: CostRow[], filename = "bund-house-cost.xlsx") {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRecords(rows), { header: [...HEADS] });
  sheet["!cols"] = HEADS.map((head) => ({ wch: Math.max(head.length * 2, 12) }));
  XLSX.utils.book_append_sheet(book, sheet, "菜品成本");
  XLSX.writeFile(book, filename);
}

function cell(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value == null) return "";
  return String(value).trim();
}

function listedFrom(text: string) {
  const value = text.replace(/\s/g, "").toLowerCase();
  if (!value) return true;
  return !["已下架", "下架", "停售", "off", "delisted"].includes(value);
}

export function rowsFromSheet(records: Record<string, unknown>[]): CostRow[] {
  return records
    .map((record) => {
      const marginText = cell(record, "毛利率");
      return {
        category: cell(record, "大类"),
        dish: cell(record, "菜名"),
        nameEn: cell(record, "英文名"),
        listed: listedFrom(cell(record, "状态")),
        material: cell(record, "物料"),
        materialCat: cell(record, "物料品类"),
        baseUnit: parseNum(cell(record, "基本单位")),
        price: parseNum(cell(record, "单价")),
        usage: parseNum(cell(record, "用量")),
        amount: parseNum(cell(record, "金额")),
        cost: parseNum(cell(record, "总成本")),
        margin: marginText ? parseMargin(marginText) : null,
        sale: parseNum(cell(record, "售价")),
      };
    })
    .filter((row) => row.dish);
}

export async function readCostWorkbook(file: File) {
  const data = await file.arrayBuffer();
  const book = XLSX.read(data, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromSheet(records);
}
