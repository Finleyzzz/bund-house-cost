export type Category = {
  id: string;
  name: string;
  en: string;
  order: number;
};

export type Material = {
  id: string;
  category: string;
  code: string;
  name: string;
  /** Price is for this much. 1000 means the price is per 1000g. */
  baseUnit: number | null;
  price: number | null;
};

export type Ingredient = {
  id: string;
  materialId: string | null;
  name: string;
  /** Amount used before yield. */
  usage: number;
};

export type CostVersion = {
  id: string;
  version: number;
  date: string;
  note: string;
  /** Gross margin, 0.7 means 70%. Sale price is cost ÷ (1 − margin). */
  margin: number;
  salePrice: number;
  lines: Ingredient[];
  /** Typed cost. When set, this is the cost, even if ingredient lines are empty. */
  enteredCost?: number | null;
  /** Typed sale price. When set, this is the price on the menu. */
  enteredSale?: number | null;
  /** Prices at the time of this version. Missing on older rows means "use the dish's current prices". */
  options?: MenuOption[];
};

export type MenuOption = {
  size: "L" | "S" | null;
  zh: string;
  en: string;
  note: string;
  price: number;
};

export type MenuUnit = "dish" | "pcs" | "person" | "portion" | "100g";

export type Dish = {
  id: string;
  categoryId: string;
  sub: string;
  subEn: string;
  name: string;
  nameEn: string;
  description: string;
  unit: MenuUnit;
  photo: string;
  tags: string[];
  options: MenuOption[];
  ways: { zh: string; en: string }[];
  /** False means taken off the menu. Missing means still for sale. */
  listed?: boolean;
  versions: CostVersion[];
};

export type Account = {
  id: string;
  name: string;
  code: string;
};

export type Session = Account;

export type DraftLine = {
  id: string;
  materialId: string | null;
  name: string;
  usage: string;
};

export const UNITS = ["克", "毫升", "个", "只", "条", "片", "张", "份"] as const;
