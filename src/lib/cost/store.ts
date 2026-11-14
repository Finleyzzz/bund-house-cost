import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import { nowStamp, recipeCost, round2, round4, saleFrom } from "./math";
import { createSeed } from "./seed";
import type { Account, Category, Dish, Ingredient, Material, Session } from "./types";

const seed = createSeed();

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export type NewVersionInput = {
  name: string;
  nameEn: string;
  categoryId: string;
  margin: number;
  note: string;
  lines: Ingredient[];
  enteredCost: number | null;
  enteredSale: number | null;
};

export function nextMaterialCode(category: string, materials: { category: string; code: string }[]) {
  let best: { prefix: string; width: number; n: number } | null = null;
  for (const item of materials) {
    if (item.category !== category) continue;
    const match = item.code.trim().match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const n = Number(match[2]);
    if (!Number.isFinite(n)) continue;
    if (!best || n > best.n) best = { prefix: match[1], width: match[2].length, n };
  }
  if (!best) return "";
  return best.prefix + String(best.n + 1).padStart(best.width, "0");
}

const admin: Account = { id: "admin", name: "admin", code: "bh888" };

type HouseState = {
  session: Session | null;
  accounts: Account[];
  categories: Category[];
  dishes: Dish[];
  materials: Material[];
  materialCategories: string[];
  signIn: (id: string) => void;
  signOut: () => void;
  addAccount: (name: string, password: string) => boolean;
  addMaterialCategory: (name: string) => boolean;
  renameMaterialCategory: (from: string, to: string) => boolean;
  removeMaterialCategory: (name: string) => boolean;
  addMaterial: (input: { category: string; name: string; code?: string; baseUnit: number | null; price: number | null }) => boolean;
  updateMaterial: (id: string, patch: Partial<Pick<Material, "category" | "name" | "code" | "baseUnit" | "price">>) => void;
  removeMaterial: (id: string) => void;
  addCategory: (name: string, en: string) => boolean;
  renameCategory: (id: string, name: string, en: string) => void;
  removeCategory: (id: string) => boolean;
  addDish: (input: NewVersionInput) => string;
  saveNewVersion: (dishId: string, input: NewVersionInput) => void;
  updateDishMeta: (dishId: string, meta: { name: string; nameEn: string; categoryId: string }) => void;
  removeDish: (dishId: string) => void;
  setListed: (dishId: string, listed: boolean) => void;
  resetDemo: () => void;
};

export const useCostStore = create<HouseState>()(
  persist(
    (set, get) => ({
      session: null,
      accounts: [admin],
      materials: seed.materials,
      materialCategories: seed.materialCategories,
      categories: seed.categories,
      dishes: seed.dishes,
      signIn: (id) => {
        const account = get().accounts.find((item) => item.id === id);
        if (account) set({ session: account });
      },
      signOut: () => set({ session: null }),
      addAccount: (name, password) => {
        const trimmed = name.trim();
        const code = password.trim();
        if (!trimmed || !code) return false;
        if (get().accounts.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) return false;
        set({ accounts: [...get().accounts, { id: uid("who"), name: trimmed, code }] });
        return true;
      },
      addMaterialCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (get().materialCategories.includes(trimmed)) return false;
        set({ materialCategories: [...get().materialCategories, trimmed] });
        return true;
      },
      renameMaterialCategory: (from, to) => {
        const prev = from.trim();
        const next = to.trim();
        if (!prev || !next) return false;
        if (next === prev) return true;
        if (get().materialCategories.includes(next)) return false;
        set({
          materialCategories: get().materialCategories.map((item) => (item === prev ? next : item)),
          materials: get().materials.map((item) => (item.category === prev ? { ...item, category: next } : item)),
        });
        return true;
      },
      removeMaterialCategory: (name) => {
        const trimmed = name.trim();
        const rest = get().materialCategories.filter((item) => item !== trimmed);
        if (rest.length === get().materialCategories.length || rest.length === 0) return false;
        const fallback = rest[0];
        set({
          materialCategories: rest,
          materials: get().materials.map((item) =>
            item.category === trimmed ? { ...item, category: fallback } : item,
          ),
        });
        return true;
      },
      addMaterial: (input) => {
        const name = input.name.trim();
        if (!name) return false;
        if (get().materials.some((item) => item.name.toLowerCase() === name.toLowerCase())) return false;
        const category = input.category.trim() || "其他";
        const categories = get().materialCategories.includes(category)
          ? get().materialCategories
          : [...get().materialCategories, category];
        const code = nextMaterialCode(category, get().materials) || input.code?.trim() || "";
        set({
          materialCategories: categories,
          materials: [
            ...get().materials,
            {
              id: uid("mat"),
              category,
              code,
              name,
              baseUnit: input.baseUnit,
              price: input.price,
            },
          ],
        });
        return true;
      },
      updateMaterial: (id, patch) => {
        set({
          materials: get().materials.map((item) =>
            item.id === id ? { ...item, ...patch, name: (patch.name ?? item.name).trim() } : item,
          ),
        });
      },
      removeMaterial: (id) => {
        set({ materials: get().materials.filter((item) => item.id !== id) });
      },
      addCategory: (name, en) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (get().categories.some((c) => c.name === trimmed)) return false;
        const order = get().categories.reduce((max, c) => Math.max(max, c.order), -1) + 1;
        set({
          categories: [
            ...get().categories,
            { id: uid("cat"), name: trimmed, en: en.trim(), order },
          ],
        });
        return true;
      },
      renameCategory: (id, name, en) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          categories: get().categories.map((c) =>
            c.id === id ? { ...c, name: trimmed, en: en.trim() } : c,
          ),
        });
      },
      removeCategory: (id) => {
        const rest = get().categories.filter((c) => c.id !== id);
        const hasDishes = get().dishes.some((d) => d.categoryId === id);
        const fallback = rest[0];
        if (hasDishes && !fallback) return false;
        set({
          categories: rest,
          dishes: fallback
            ? get().dishes.map((d) => (d.categoryId === id ? { ...d, categoryId: fallback.id } : d))
            : get().dishes,
        });
        return true;
      },
      addDish: (input) => {
        const id = uid("dish");
        const dish: Dish = {
          id,
          categoryId: input.categoryId,
          sub: "",
          subEn: "",
          name: input.name.trim(),
          nameEn: input.nameEn.trim(),
          description: "",
          unit: "dish",
          photo: "",
          tags: [],
          options: [],
          ways: [],
          versions: [
            {
              id: uid("v"),
              version: 1,
              date: nowStamp(),
              note: input.note.trim(),
              margin: input.margin,
              salePrice: priceOf(get, input),
              lines: input.lines.map(cleanLine),
              enteredCost: input.enteredCost,
              enteredSale: input.enteredSale,
            },
          ],
        };
        set({ dishes: [...get().dishes, dish] });
        return id;
      },
      saveNewVersion: (dishId, input) => {
        set({
          dishes: get().dishes.map((dish) => {
            if (dish.id !== dishId) return dish;
            const next = dish.versions.length + 1;
            const versions = dish.versions.map((version) => version);
            return {
              ...dish,
              name: input.name.trim(),
              nameEn: input.nameEn.trim(),
              categoryId: input.categoryId,
              versions: [
                ...versions,
                {
                  id: uid("v"),
                  version: next,
                  date: nowStamp(),
                  note: input.note.trim(),
                  margin: input.margin,
                  salePrice: priceOf(get, input),
                  lines: input.lines.map(cleanLine),
                  enteredCost: input.enteredCost,
                  enteredSale: input.enteredSale,
                },
              ],
            };
          }),
        });
      },
      updateDishMeta: (dishId, meta) => {
        set({
          dishes: get().dishes.map((dish) =>
            dish.id === dishId
              ? {
                  ...dish,
                  name: meta.name.trim(),
                  nameEn: meta.nameEn.trim(),
                  categoryId: meta.categoryId,
                  options: dish.options,
                }
              : dish,
          ),
        });
      },
      removeDish: (dishId) => {
        set({ dishes: get().dishes.filter((d) => d.id !== dishId) });
      },
      setListed: (dishId, listed) => {
        set({
          dishes: get().dishes.map((dish) => (dish.id === dishId ? { ...dish, listed } : dish)),
        });
      },
      resetDemo: () => {
        const next = createSeed();
        set({
          categories: next.categories,
          dishes: next.dishes,
          materials: next.materials,
          materialCategories: next.materialCategories,
        });
      },
    }),
    {
      name: "bund-house-cost-v3",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      partialize: (s) => ({
        session: s.session,
        accounts: s.accounts,
        materials: s.materials,
        materialCategories: s.materialCategories,
        categories: s.categories,
        dishes: s.dishes,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<HouseState> & {
          session?: { id?: string; name?: string; code?: string; account?: string } | null;
        };
        const raw = saved.session;
        const session: Session | null = raw?.name ? { id: "admin", name: "admin", code: "bh888" } : null;
        const accounts = [admin];
        const categories = (saved.categories?.length ? saved.categories : current.categories).filter(
          (category) => category.name.replace(/\s/g, "") !== "一二三",
        );
        const dropped = new Set(
          (saved.categories ?? [])
            .filter((category) => category.name.replace(/\s/g, "") === "一二三")
            .map((category) => category.id),
        );
        const fallbackId = categories[0]?.id;
        const dishes = (saved.dishes?.length ? saved.dishes : current.dishes).map((dish) =>
          dropped.has(dish.categoryId) && fallbackId ? { ...dish, categoryId: fallbackId } : dish,
        );
        const materialCategories = (saved.materialCategories?.length ? saved.materialCategories : current.materialCategories).filter(
          (name) => name.replace(/\s/g, "") !== "一二三",
        );
        const materialFallback = materialCategories[0] ?? "其他";
        const materials = (saved.materials?.length ? saved.materials : current.materials).map((item) =>
          item.category.replace(/\s/g, "") === "一二三" ? { ...item, category: materialFallback } : item,
        );
        return { ...current, ...saved, session, accounts, categories, dishes, materialCategories, materials };
      },
    },
  ),
);

function cleanLine(line: Ingredient): Ingredient {
  return {
    id: line.id || uid("l"),
    materialId: line.materialId,
    name: line.name.trim(),
    usage: round4(line.usage),
  };
}

function priceOf(
  get: () => { materials: Material[] },
  input: NewVersionInput,
) {
  const cost = input.enteredCost != null ? round2(input.enteredCost) : recipeCost(input.lines, get().materials);
  if (input.enteredSale != null) return round2(input.enteredSale);
  return saleFrom(cost, input.margin) ?? 0;
}

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useCostStore.persist.onFinishHydration(finish);
    if (useCostStore.persist.hasHydrated()) finish();
    const backup = window.setTimeout(finish, 1500);
    return () => {
      unsub();
      window.clearTimeout(backup);
    };
  }, []);
  return hydrated;
}
