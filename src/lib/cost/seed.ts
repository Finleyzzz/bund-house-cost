import library from "./library.json";
import type { Category, Dish, Material } from "./types";

export function createSeed(): {
  categories: Category[];
  materialCategories: string[];
  materials: Material[];
  dishes: Dish[];
} {
  return {
    categories: library.categories as Category[],
    materialCategories: library.materialCategories,
    materials: library.materials as Material[],
    dishes: library.dishes as Dish[],
  };
}