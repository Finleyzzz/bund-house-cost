import { ChevronLeft, Copy as CopyIcon, Plus, Search, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Wordmark } from "@/components/wordmark";
import { LangToggle } from "@/components/opening";
import { cn } from "@/lib/cn";
import {
  costSignature,
  findMaterial,
  formatMoney,
  formatPct,
  formatPts,
  formatQty,
  formatStamp,
  latestVersion,
  lineAmount,
  marginTone,
  parseMargin,
  parseNum,
  recipeCost,
  round2,
  round4,
  saleFrom,
  versionCost,
  versionStats,
  type MarginTone,
  type VersionStats,
} from "@/lib/cost/math";
import { nextMaterialCode, uid, useCostStore, type NewVersionInput } from "@/lib/cost/store";
import { buildCostRows, downloadCostWorkbook, isListed, readCostWorkbook } from "@/lib/cost/excel";
import { clearAllFiles, clearDishFiles } from "@/lib/cost/files";
import { DishFiles } from "@/components/dish-files";
import type {
  Category,
  CostVersion,
  Dish,
  DraftLine,
  Ingredient,
  Material,
} from "@/lib/cost/types";
import { useTheme } from "@/lib/theme";
import { useLang, type Copy, type Lang } from "@/lib/lang";

const toneText: Record<MarginTone, string> = {
  good: "text-good",
  watch: "text-tan",
  tight: "text-bad",
  none: "text-muted",
};

function shownName(zh: string, en: string, lang: Lang) {
  return lang === "en" ? en || zh : zh || en;
}

function errText(code: string | null, t: Copy) {
  if (!code || code === "unchanged") return null;
  if (code === "name") return t.errName;
  if (code === "margin") return t.errMargin;
  if (code === "lineName") return t.errLine;
  if (code === "unitPrice") return t.errUnit;
  if (code === "qty") return t.errQty;
  if (code === "cost") return t.errCost;
  if (code === "cannot") return t.cannot;
  return code;
}

type StudioState = { mode: "dish"; dishId: string } | { mode: "new"; categoryId: string };

export function HouseApp({ onSignOut, onReplay }: { onSignOut: () => void; onReplay: () => void }) {
  const categories = useCostStore((s) => s.categories);
  const dishes = useCostStore((s) => s.dishes);
  const materials = useCostStore((s) => s.materials);
  const updateDishMeta = useCostStore((s) => s.updateDishMeta);
  const setListed = useCostStore((s) => s.setListed);
  const updateMaterial = useCostStore((s) => s.updateMaterial);
  const saveNewVersion = useCostStore((s) => s.saveNewVersion);
  const resetDemo = useCostStore((s) => s.resetDemo);
  const { lang, t } = useLang();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"dish" | "material">("dish");
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [matCatsOpen, setMatCatsOpen] = useState(false);
  const [shelf, setShelf] = useState<"on" | "off" | "all">("on");
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const ordered = useMemo(() => sortCategories(categories), [categories]);

  const cards = useMemo(() => {
    return dishes
      .map((dish) => {
        const version = latestVersion(dish);
        if (!version) return null;
        const stats = versionStats(version, materials);
        const category = categories.find((c) => c.id === dish.categoryId);
        return { dish, version, stats, category };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [dishes, categories, materials]);

  const q = query.trim().toLowerCase();
  const visible = cards.filter((row) => {
    const on = isListed(row.dish);
    if (shelf === "on" && !on) return false;
    if (shelf === "off" && on) return false;
    if (!q || searchMode !== "dish") return true;
    const blob =
      `${row.dish.name} ${row.dish.nameEn} ${row.dish.sub} ${row.dish.subEn} ${row.category?.name ?? ""} ${row.category?.en ?? ""}`.toLowerCase();
    return blob.includes(q);
  });

  const materialHits = useMemo(() => {
    if (searchMode !== "material" || !q) return [];
    return materials
      .filter((item) => `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((material) => {
        const name = material.name.trim().toLowerCase();
        const dishesUsing = cards.flatMap((row) => {
          const line = row.version.lines.find(
            (item) => item.materialId === material.id || item.name.trim().toLowerCase() === name,
          );
          return line ? [{ row, usage: line.usage }] : [];
        });
        return { material, dishesUsing };
      });
  }, [searchMode, q, materials, cards]);

  const known = cards.filter((row) => row.stats.known && row.stats.margin != null);
  const avg =
    known.length === 0
      ? null
      : known.reduce((sum, row) => sum + (row.stats.margin ?? 0), 0) / known.length;
  const uncosted = cards.filter((row) => !row.stats.known).length;

  const watched = visible
    .filter((row) => row.stats.known && row.stats.margin != null && row.stats.margin < 0.65)
    .sort((a, b) => (a.stats.margin ?? 0) - (b.stats.margin ?? 0));

  const commitPrice = (row: CardRow, costRaw: string, saleRaw: string) => {
    const cost = parseNum(costRaw);
    const sale = parseNum(saleRaw);
    if (cost == null || sale == null || !(sale > cost) || !(sale > 0)) return;
    const sameCost = row.stats.cost != null && Math.round(row.stats.cost) === Math.round(cost);
    const sameSale = row.stats.sale != null && Math.round(row.stats.sale) === Math.round(sale);
    if (sameCost && sameSale) return;
    const lineCost = recipeCost(row.version.lines, materials);
    saveNewVersion(row.dish.id, {
      name: row.dish.name,
      nameEn: row.dish.nameEn,
      categoryId: row.dish.categoryId,
      margin: (sale - cost) / sale,
      note: row.version.note,
      lines: row.version.lines,
      enteredCost:
        lineCost != null && Math.round(lineCost) === Math.round(cost) ? null : round2(cost),
      enteredSale: round2(sale),
    });
  };

  const [homeKey, setHomeKey] = useState(0);
  /** The top-left logo: back to the home page — 菜品, on sale, first category, top of the page, nothing open. */
  const goHome = () => {
    setStudio(null);
    setCatsOpen(false);
    setLibraryOpen(false);
    setMatCatsOpen(false);
    setQuery("");
    setSearchMode("dish");
    setShelf("on");
    setHomeKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onImport = async (file: File) => {
    const rows = await readCostWorkbook(file);
    const byDish = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byDish.get(row.dish) ?? [];
      list.push(row);
      byDish.set(row.dish, list);
    }
    let updated = 0;
    for (const [name, group] of byDish) {
      const dish = useCostStore.getState().dishes.find((item) => item.name.trim() === name.trim());
      const version = dish ? latestVersion(dish) : undefined;
      if (!dish || !version) continue;
      setListed(dish.id, group[0].listed);
      for (const row of group) {
        if (!row.material) continue;
        const material = findMaterial(
          { materialId: null, name: row.material },
          useCostStore.getState().materials,
        );
        if (!material) continue;
        const patch: { price?: number | null; baseUnit?: number | null } = {};
        if (row.price != null && row.price !== material.price) patch.price = row.price;
        if (row.baseUnit != null && row.baseUnit !== material.baseUnit)
          patch.baseUnit = row.baseUnit;
        if (patch.price != null || patch.baseUnit != null) updateMaterial(material.id, patch);
      }
      const fresh = useCostStore.getState().dishes.find((item) => item.id === dish.id);
      const current = fresh ? latestVersion(fresh) : version;
      if (!current) continue;
      const margin = group.find((row) => row.margin != null)?.margin ?? current.margin;
      const nextLines = current.lines.map((line) => ({ ...line }));
      let linesTouched = false;
      for (const row of group) {
        if (!row.material || row.usage == null) continue;
        const material = findMaterial(
          { materialId: null, name: row.material },
          useCostStore.getState().materials,
        );
        const index = nextLines.findIndex((line) => line.name.trim() === row.material.trim());
        if (index >= 0) {
          if (nextLines[index].usage !== row.usage) {
            nextLines[index] = {
              ...nextLines[index],
              usage: row.usage,
              materialId: material?.id ?? nextLines[index].materialId,
            };
            linesTouched = true;
          }
        } else {
          nextLines.push({
            id: uid("l"),
            materialId: material?.id ?? null,
            name: row.material,
            usage: row.usage,
          });
          linesTouched = true;
        }
      }
      if (linesTouched || Math.abs(current.margin - margin) > 0.0005) {
        saveNewVersion(dish.id, {
          name: dish.name,
          nameEn: dish.nameEn,
          categoryId: dish.categoryId,
          margin,
          note: current.note,
          lines: nextLines,
          enteredCost: current.enteredCost ?? null,
          enteredSale: current.enteredSale ?? null,
        });
      }
      updated += 1;
    }
    setToast(updated ? t.imported(updated) : t.importNone);
  };

  return (
    <div className="rise-in min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Wordmark onHome={goHome} label={t.home} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LangToggle />
            <ThemeToggle />
            <ProfileMenu
              onCategories={() => setCatsOpen(true)}
              onLibrary={() => setLibraryOpen(true)}
              onReset={() => {
                resetDemo();
                void clearAllFiles();
                setToast(t.reloaded);
              }}
              onReplay={onReplay}
              onSignOut={onSignOut}
            />
          </div>
        </div>
        <div className="px-4 pb-3 sm:px-8">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.5}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchMode === "dish" ? t.searchPh : t.searchMatPh}
              className="pl-10"
              aria-label={t.search}
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setSearchMode("dish")}
              className={
                searchMode === "dish"
                  ? "h-9 rounded-md bg-fg px-3 text-sm text-ink"
                  : "h-9 rounded-md border border-line px-3 text-sm text-muted"
              }
            >
              {t.searchDish}
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("material")}
              className={
                searchMode === "material"
                  ? "h-9 rounded-md bg-fg px-3 text-sm text-ink"
                  : "h-9 rounded-md border border-line px-3 text-sm text-muted"
              }
            >
              {t.searchMaterial}
            </button>
          </div>
        </div>
      </header>

      {searchMode === "material" || q ? (
        <section className="px-4 pt-6 sm:px-8">
          <h1 className="font-display text-3xl text-fg sm:text-4xl">
            {searchMode === "material" ? t.library : t.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {searchMode === "material" ? t.libraryHint : t.blurb}
          </p>
          {searchMode === "material" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => setLibraryOpen(true)}>
                {t.openLibrary}
              </Button>
              <Button variant="line" size="lg" onClick={() => setMatCatsOpen(true)}>
                {t.editMatCats}
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => downloadCostWorkbook(buildCostRows(dishes, categories, materials))}
                >
                  {t.exportExcel}
                </Button>
                <Button variant="line" onClick={() => fileRef.current?.click()}>
                  {t.importExcel}
                </Button>
              </div>
              <div className="mt-3 flex gap-2">
                {(
                  [
                    ["on", t.onSale],
                    ["off", t.offShelf],
                    ["all", t.allDishes],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setShelf(id)}
                    className={
                      shelf === id
                        ? "h-9 rounded-md bg-fg px-3 text-sm text-ink"
                        : "h-9 rounded-md border border-line px-3 text-sm text-muted"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line">
                <Stat label={t.avg} value={formatPct(avg)} tone={marginTone(avg)} />
                <Stat label={t.dishes} value={String(cards.length)} />
                <Stat label={t.noCost} value={String(uncosted)} />
              </div>
            </>
          )}
        </section>
      ) : null}

      {searchMode === "material" && !q ? (
        <p className="mt-8 px-4 text-sm text-muted sm:px-8">{t.searchMatPh}</p>
      ) : q && searchMode === "material" ? (
        <section className="mt-8 px-4 sm:px-8">
          <h2 className="text-xl font-semibold">{t.results}</h2>
          {materialHits.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t.noMaterial}</p>
          ) : (
            materialHits.map(({ material, dishesUsing }) => (
              <div key={material.id} className="mt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-fg">{material.name}</h3>
                  <p className="text-sm tabular-nums text-fg">
                    {material.price == null ? "—" : formatMoney(material.price)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {material.category}
                  {" · "}
                  {material.baseUnit ?? "—"}
                  {" · "}
                  {t.usedIn(dishesUsing.length)}
                </p>
                {dishesUsing.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">{t.notUsed}</p>
                ) : (
                  <div className="mt-2">
                    {dishesUsing.map(({ row, usage }) => (
                      <DishLine
                        key={row.dish.id}
                        row={row}
                        note={`${t.qty} ${formatQty(usage)}`}
                        onOpen={() => setStudio({ mode: "dish", dishId: row.dish.id })}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      ) : q ? (
        <section className="mt-8 px-4 sm:px-8">
          <h2 className="text-xl font-semibold">{t.results}</h2>
          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t.none}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <div className="min-w-[36rem]">
                <LineHead />
                {visible.map((row) => (
                  <DishLine
                    key={row.dish.id}
                    row={row}
                    categories={ordered}
                    onOpen={() => setStudio({ mode: "dish", dishId: row.dish.id })}
                    onMove={(categoryId) =>
                      updateDishMeta(row.dish.id, {
                        name: row.dish.name,
                        nameEn: row.dish.nameEn,
                        categoryId,
                      })
                    }
                    onPrice={(cost, sale) => commitPrice(row, cost, sale)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      ) : cards.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted sm:px-8">{t.empty}</p>
      ) : (
        <CategoryBoard
          key={homeKey}
          groups={[
            ...(watched.length > 0
              ? [{ id: "watch", title: t.watch, sub: "", rows: watched, canAdd: false }]
              : []),
            ...ordered
              .filter((category) => category.name !== "辅料")
              .map((category) => ({
                id: category.id,
                title: shownName(category.name, category.en, lang),
                sub: lang === "en" ? category.name : category.en,
                rows: visible.filter((row) => row.dish.categoryId === category.id),
                canAdd: true,
              })),
          ]}
          shelf={shelf}
          onShelf={setShelf}
          onOpen={(dishId) => setStudio({ mode: "dish", dishId })}
          onNew={(categoryId) => setStudio({ mode: "new", categoryId })}
          onAddCat={() => setCatsOpen(true)}
          onLibrary={() => setLibraryOpen(true)}
          onExport={() => downloadCostWorkbook(buildCostRows(dishes, categories, materials))}
          onImport={() => fileRef.current?.click()}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onImport(file);
        }}
      />

      <footer className="px-4 py-8 text-xs text-faint sm:px-8">Bund House</footer>

      {catsOpen && <CategoryManager onClose={() => setCatsOpen(false)} />}
      {matCatsOpen && <MaterialCatEditor onClose={() => setMatCatsOpen(false)} />}
      {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      {studio && (
        <Studio
          state={studio}
          onClose={() => setStudio(null)}
          onSaved={(message) => {
            setToast(message);
            if (studio.mode === "new") setStudio(null);
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-bg-elev px-4 py-3 text-sm text-fg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "none",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MarginTone;
}) {
  return (
    <div className="bg-bg-elev px-3 py-4">
      <p className="text-xs text-faint">{label}</p>
      <p
        className={cn(
          "mt-1 font-sans text-2xl font-semibold tabular-nums tracking-normal",
          toneText[tone],
        )}
      >
        {value}
        {hint && <span className="ml-1 font-sans text-sm text-faint">{hint}</span>}
      </p>
    </div>
  );
}

function sortCategories(list: Category[]) {
  return [...list].sort((a, b) => {
    if (a.name === "辅料") return 1;
    if (b.name === "辅料") return -1;
    return a.order - b.order;
  });
}

type CardRow = {
  dish: Dish;
  version: CostVersion;
  stats: ReturnType<typeof versionStats>;
  category: Category | undefined;
};

function DishLine({
  row,
  onOpen,
  categories,
  onMove,
  onPrice,
  note,
}: {
  row: CardRow;
  onOpen: () => void;
  categories?: Category[];
  onMove?: (categoryId: string) => void;
  onPrice?: (cost: string, sale: string) => void;
  note?: string;
}) {
  const { lang, t } = useLang();
  const [cost, setCost] = useState(
    row.stats.cost == null ? "" : String(Math.round(row.stats.cost)),
  );
  const [sale, setSale] = useState(
    row.stats.sale == null ? "" : String(Math.round(row.stats.sale)),
  );
  useEffect(() => {
    setCost(row.stats.cost == null ? "" : String(Math.round(row.stats.cost)));
    setSale(row.stats.sale == null ? "" : String(Math.round(row.stats.sale)));
  }, [row.version.id, row.stats.cost, row.stats.sale]);
  return (
    <div className={lineGrid}>
      <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-sm text-fg">
        {shownName(row.dish.name, row.dish.nameEn, lang)}
        {row.dish.listed === false ? (
          <span className="ml-2 text-xs text-bad">{t.offShelf}</span>
        ) : null}
        {note ? <span className="ml-2 text-xs text-muted">{note}</span> : null}
      </button>
      <Input
        value={cost}
        aria-label={t.cost}
        inputMode="decimal"
        className="h-9 px-2 text-right text-sm tabular-nums"
        onChange={(e) => setCost(e.target.value)}
        onBlur={() => onPrice?.(cost, sale)}
      />
      <Input
        value={sale}
        aria-label={t.price}
        inputMode="decimal"
        className="h-9 px-2 text-right text-sm tabular-nums"
        onChange={(e) => setSale(e.target.value)}
        onBlur={() => onPrice?.(cost, sale)}
      />
      <span
        className={cn("text-right text-xs tabular-nums", toneText[marginTone(row.stats.margin)])}
      >
        {formatPct(row.stats.margin)}
      </span>
      {categories && onMove ? (
        <Select
          value={row.dish.categoryId}
          aria-label={t.moveTo}
          className="h-9 px-2 text-xs"
          onChange={(e) => onMove(e.target.value)}
        >
          {categories
            .filter((category) => category.name !== "辅料")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {shownName(category.name, category.en, lang)}
              </option>
            ))}
        </Select>
      ) : (
        <span />
      )}
    </div>
  );
}

const ingredientGrid =
  "grid grid-cols-[5.5rem_minmax(8rem,1.4fr)_5rem_7rem_7rem] items-center gap-2 border-b border-line py-2";
const lineGrid =
  "grid grid-cols-[minmax(7rem,1.4fr)_6.5rem_6.5rem_4rem_6.5rem] items-center gap-2 border-b border-line py-1.5";

function LineHead() {
  const { t } = useLang();
  return (
    <div className={`${lineGrid} text-xs text-faint`}>
      <span>{t.dishName}</span>
      <span className="text-right">{t.cost}</span>
      <span className="text-right">{t.price}</span>
      <span className="text-right">{t.margin}</span>
      <span>{t.moveTo}</span>
    </div>
  );
}

function ProfileMenu({
  onCategories,
  onLibrary,
  onReset,
  onReplay,
  onSignOut,
}: {
  onCategories: () => void;
  onLibrary: () => void;
  onReset: () => void;
  onReplay: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [armReset, setArmReset] = useState(false);
  const { t } = useLang();
  const session = useCostStore((s) => s.session);
  const letter = (session?.name || "M").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node | null;
      if (!node) return;
      const root = document.getElementById("mia-menu");
      if (root && !root.contains(node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div id="mia-menu" className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t.accountMenu}
        onClick={() => {
          setOpen((v) => !v);
          setArmReset(false);
        }}
        className="grid size-11 place-items-center rounded-md border border-line bg-bg-soft font-display text-lg text-tan"
      >
        {letter}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-bg-elev p-2">
          <p className="px-3 py-2 text-sm font-semibold text-fg">{session?.name}</p>
          <MenuButton
            onClick={() => {
              setOpen(false);
              onCategories();
            }}
          >
            {t.categories}
          </MenuButton>
          <MenuButton
            onClick={() => {
              setOpen(false);
              onLibrary();
            }}
          >
            {t.library}
          </MenuButton>
          <MenuButton
            onClick={() => {
              setOpen(false);
              onReplay();
            }}
          >
            {t.replay}
          </MenuButton>
          <MenuButton
            onClick={() => {
              if (!armReset) {
                setArmReset(true);
                return;
              }
              onReset();
              setOpen(false);
              setArmReset(false);
            }}
          >
            {armReset ? t.reloadConfirm : t.reload}
          </MenuButton>
          <MenuButton
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {t.signOut}
          </MenuButton>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLang();
  return (
    <div className="flex h-11 items-center rounded-md border border-line bg-bg-elev p-1 text-sm">
      <button
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
        className={cn("h-9 rounded px-2.5", theme === "light" ? "bg-fg text-ink" : "text-muted")}
      >
        {t.light}
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
        className={cn("h-9 rounded px-2.5", theme === "dark" ? "bg-fg text-ink" : "text-muted")}
      >
        {t.dark}
      </button>
    </div>
  );
}

function moneyOrDash(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatMoney(n);
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center rounded-md px-3 text-left text-sm text-fg hover:bg-bg-soft"
    >
      {children}
    </button>
  );
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const categories = useCostStore((s) => s.categories);
  const dishes = useCostStore((s) => s.dishes);
  const addCategory = useCostStore((s) => s.addCategory);
  const renameCategory = useCostStore((s) => s.renameCategory);
  const removeCategory = useCostStore((s) => s.removeCategory);
  const [name, setName] = useState("");
  const [en, setEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();
  const ordered = [...categories].sort((a, b) => a.order - b.order);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-void/70 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="cat-title"
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-xl border border-line bg-bg-elev p-4 sm:max-w-md sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cat-title" className="text-2xl font-semibold">
              {t.categories}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="grid size-11 place-items-center"
          >
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{t.sameMenu}</p>
        <ul className="mt-4">
          {ordered.map((cat) => (
            <CatRow
              key={cat.id}
              cat={cat}
              count={dishes.filter((d) => d.categoryId === cat.id).length}
              fallback={ordered.find((item) => item.id !== cat.id) ?? null}
              onRename={renameCategory}
              onRemove={(id) => {
                const ok = removeCategory(id);
                if (!ok) setError(t.catHasDishes);
              }}
            />
          ))}
        </ul>
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = addCategory(name, en);
            if (!ok) {
              setError(name.trim() ? t.catExists : t.needName);
              return;
            }
            setName("");
            setEn("");
            setError(null);
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.newCat}
            aria-label={t.newCat}
          />
          <Input
            value={en}
            onChange={(e) => setEn(e.target.value)}
            placeholder={t.catEn}
            aria-label={t.catEn}
          />
          <Button type="submit">{t.addCat}</Button>
        </form>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}

function CatRow({
  cat,
  count,
  fallback,
  onRename,
  onRemove,
}: {
  cat: Category;
  count: number;
  fallback: Category | null;
  onRename: (id: string, name: string, en: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const label = shownName(cat.name, cat.en, lang);
  const [name, setName] = useState(cat.name);
  const [en, setEn] = useState(cat.en);
  const [ask, setAsk] = useState(false);
  const commit = () => {
    const next = name.trim();
    if (!next) {
      setName(cat.name);
      return;
    }
    onRename(cat.id, next, en);
  };
  const fallbackName = fallback ? shownName(fallback.name, fallback.en, lang) : "";
  return (
    <li className="border-b border-line py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            aria-label={t.catName(label)}
            className="w-full bg-transparent text-fg outline-none"
          />
          <input
            value={en}
            onChange={(e) => setEn(e.target.value)}
            onBlur={commit}
            aria-label={t.catEnLabel(label)}
            className="w-full bg-transparent text-xs text-faint outline-none"
          />
        </div>
        <span className="text-xs text-faint tabular-nums">{t.count(count)}</span>
        <button
          type="button"
          aria-label={t.deleteCat(label)}
          onClick={() => setAsk(true)}
          className="grid size-11 place-items-center rounded-md border border-line text-faint"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {ask ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-sm">
          <span className="text-muted">
            {t.confirmDeleteQ(label)}
            {count > 0 && fallback ? ` ${t.moveDishes(count, fallbackName)}` : ""}
            {count > 0 && !fallback ? ` ${t.catHasDishes}` : ""}
          </span>
          {count === 0 || fallback ? (
            <button
              type="button"
              className="h-9 rounded-md border border-bad px-3 text-sm text-bad"
              onClick={() => onRemove(cat.id)}
            >
              {t.yesDelete}
            </button>
          ) : null}
          <button
            type="button"
            className="h-9 rounded-md border border-line px-3 text-sm text-muted"
            onClick={() => setAsk(false)}
          >
            {t.cancel}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Studio({
  state,
  onClose,
  onSaved,
}: {
  state: StudioState;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dishes = useCostStore((s) => s.dishes);
  const materials = useCostStore((s) => s.materials);
  const categories = useCostStore((s) => s.categories);
  const addDish = useCostStore((s) => s.addDish);
  const saveNewVersion = useCostStore((s) => s.saveNewVersion);
  const updateDishMeta = useCostStore((s) => s.updateDishMeta);
  const removeDish = useCostStore((s) => s.removeDish);
  const setListed = useCostStore((s) => s.setListed);
  const { lang, t } = useLang();

  const dish = state.mode === "dish" ? dishes.find((d) => d.id === state.dishId) : undefined;
  const creating = state.mode === "new";

  const [versionIndex, setVersionIndex] = useState(() =>
    dish ? Math.max(0, dish.versions.length - 1) : 0,
  );
  const [editing, setEditing] = useState(creating);
  const [name, setName] = useState(dish?.name ?? "");
  const [nameEn, setNameEn] = useState(dish?.nameEn ?? "");
  const [categoryId, setCategoryId] = useState(
    dish?.categoryId ?? (state.mode === "new" ? state.categoryId : (categories[0]?.id ?? "")),
  );
  const [marginText, setMarginText] = useState(() => {
    const v = dish ? latestVersion(dish) : undefined;
    return v ? String(Math.round(v.margin * 1000) / 10) : "70";
  });
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  const addDraftLine = () => {
    const line = blankLine();
    setLines((curr) => [...curr, line]);
    setFocusLine(line.id);
  };
  useEffect(() => {
    if (!focusLine) return;
    const row = document.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    setFocusLine(null);
  }, [focusLine, lines]);
  const [costText, setCostText] = useState("");
  const [saleText, setSaleText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askLine, setAskLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(lockBodyScroll, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const index = dish ? Math.min(versionIndex, dish.versions.length - 1) : 0;
  const viewed = dish?.versions[index];
  const viewedId = viewed?.id ?? "";

  useEffect(() => {
    if (editing || !viewedId) return;
    const current = useCostStore.getState().dishes.find((item) => item.id === dish?.id);
    const version = current?.versions.find((item) => item.id === viewedId);
    if (!version) return;
    const stats = versionStats(version, useCostStore.getState().materials);
    setCostText(stats.cost == null ? "" : String(Math.round(stats.cost)));
    setMarginText(String(Math.round(version.margin * 1000) / 10));
    setSaleText(stats.sale == null ? "" : String(Math.round(stats.sale)));
  }, [viewedId, editing, dish?.id]);

  if (!creating && !dish) {
    return null;
  }
  const ordered = [...categories].sort((a, b) => a.order - b.order);
  const viewStats = viewed ? versionStats(viewed, materials) : null;
  const showDraft = editing || creating;
  const draftLines = showDraft ? lines : viewed ? toDraft(viewed) : [];
  const marginNow = parseMargin(marginText);
  const savedCostText = viewStats?.cost != null ? String(Math.round(viewStats.cost)) : "";
  const savedSaleText = viewStats?.sale != null ? String(Math.round(viewStats.sale)) : "";
  const costDirty = !showDraft && costText.trim() !== savedCostText;
  const saleDirty = !showDraft && saleText.trim() !== savedSaleText;
  const marginDirty =
    !showDraft &&
    viewed != null &&
    marginNow != null &&
    Math.abs(marginNow - viewed.margin) > 0.0005;
  const live = liveStats(materials, marginNow, draftLines, costText);
  const activeStats = showDraft || costDirty || marginDirty ? live : viewStats;
  const analysis = showDraft
    ? analyzeDraft({
        name,
        nameEn,
        categoryId,
        marginText,
        note,
        lines,
        cost: costText,
        materials,
        base: creating ? null : (viewed ?? null),
        baseMeta: dish
          ? { name: dish.name, nameEn: dish.nameEn, categoryId: dish.categoryId }
          : null,
      })
    : null;
  const footerHint = errText(error || analysis?.error || null, t);

  const beginEdit = () => {
    if (!dish || !viewed) return;
    setName(dish.name);
    setNameEn(dish.nameEn);
    setCategoryId(dish.categoryId);
    setMarginText(String(Math.round(viewed.margin * 1000) / 10));
    setNote("");
    setLines(toDraft(viewed));
    setCostText(viewed.enteredCost != null ? String(Math.round(viewed.enteredCost)) : "");
    setEditing(true);
    setError(null);
    setConfirmDelete(false);
  };

  const save = () => {
    if (!analysis?.parsed) {
      setError(analysis?.error ?? "cannot");
      return;
    }
    if (analysis.error) {
      setError(analysis.error);
      return;
    }
    const parsed = analysis.parsed;
    if (creating) {
      addDish(parsed);
      onSaved(t.added);
      return;
    }
    if (!dish) return;
    if (analysis.costChanged) {
      const next = dish.versions.length + 1;
      saveNewVersion(dish.id, parsed);
      setVersionIndex(dish.versions.length);
      setEditing(false);
      setError(null);
      onSaved(t.savedVersion(next));
      return;
    }
    updateDishMeta(dish.id, parsed);
    setEditing(false);
    setError(null);
    onSaved(t.saved);
  };

  const saveCost = () => {
    if (!dish || !viewed) return;
    const resolved = resolveCost(costText, viewed.lines, materials);
    if (resolved.error) {
      setError(resolved.error);
      return;
    }
    const saleN = parseNum(saleText);
    const enteredSale = saleN != null && saleN > 0 ? round2(saleN) : null;
    const fromMargin = parseMargin(marginText) ?? viewed.margin;
    const margin =
      enteredSale != null && resolved.effective != null && enteredSale > resolved.effective
        ? (enteredSale - resolved.effective) / enteredSale
        : fromMargin;
    const next = dish.versions.length + 1;
    saveNewVersion(dish.id, {
      name: dish.name,
      nameEn: dish.nameEn,
      categoryId: dish.categoryId,
      margin,
      note: viewed.note,
      lines: viewed.lines,
      enteredCost: resolved.enteredCost,
      enteredSale,
    });
    setVersionIndex(dish.versions.length);
    setError(null);
    onSaved(t.savedVersion(next));
  };

  const shownLines = editing || creating ? lines : (viewed?.lines ?? []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center gap-1 text-sm text-muted"
        >
          <ChevronLeft className="size-5" strokeWidth={1.5} />
          {t.back}
        </button>
        <p className="text-xs text-faint">
          {creating ? t.newDish : t.version(viewed?.version ?? 1)}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {editing || creating ? (
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-faint">{t.dishName}</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.dishName}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-faint">{t.nameEn}</span>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={t.optional}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-faint">{t.categories}</span>
                <Select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label={t.categories}
                >
                  {ordered.map((c) => (
                    <option key={c.id} value={c.id}>
                      {shownName(c.name, c.en, lang)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          ) : (
            dish && (
              <>
                <p className="text-sm text-muted">
                  {[
                    shownName(
                      ordered.find((c) => c.id === dish.categoryId)?.name ?? "",
                      ordered.find((c) => c.id === dish.categoryId)?.en ?? "",
                      lang,
                    ),
                    shownName(dish.sub, dish.subEn, lang),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <h1 className="mt-1 text-3xl font-semibold text-fg">
                  {shownName(dish.name, dish.nameEn, lang)}
                </h1>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={dish.listed === false ? "text-sm text-bad" : "text-sm text-good"}
                  >
                    {dish.listed === false ? t.offShelf : t.onSale}
                  </span>
                  <Button
                    variant="line"
                    size="sm"
                    onClick={() => setListed(dish.id, dish.listed === false)}
                  >
                    {dish.listed === false ? t.putUp : t.takeDown}
                  </Button>
                </div>
                {lang === "en" && dish.name && dish.name !== dish.nameEn ? (
                  <p className="mt-1 text-sm text-muted">{dish.name}</p>
                ) : null}
                {lang === "zh" && dish.nameEn ? (
                  <p className="mt-1 text-sm text-muted">{dish.nameEn}</p>
                ) : null}
                {dish.description && <p className="mt-2 text-sm text-muted">{dish.description}</p>}
                {dish.tags.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {dish.tags.map((tag) => t.tags[tag as keyof typeof t.tags] ?? tag).join(" · ")}
                  </p>
                )}
              </>
            )
          )}

          <label className="mt-6 block">
            <span className="mb-1 block text-sm text-fg">{t.marginRate}</span>
            <Input
              value={marginText}
              onChange={(e) => {
                const next = e.target.value;
                setMarginText(next);
                const cost = parseNum(costText);
                const sale = saleFrom(cost, parseMargin(next));
                if (sale != null) setSaleText(String(Math.round(sale)));
                setError(null);
              }}
              placeholder={t.marginPh}
              inputMode="decimal"
              aria-label={t.marginRate}
            />
          </label>
          <p className="mt-1 text-sm text-muted">{t.saleFromMargin}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-fg">{t.cost}</span>
              <Input
                value={costText}
                onChange={(e) => {
                  const next = e.target.value;
                  setCostText(next);
                  const cost = parseNum(next);
                  const margin = parseMargin(marginText);
                  const sale = saleFrom(cost, margin);
                  if (sale != null) setSaleText(String(Math.round(sale)));
                  setError(null);
                }}
                placeholder={t.costPh}
                inputMode="decimal"
                aria-label={t.cost}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg">{t.price}</span>
              <Input
                value={saleText}
                onChange={(e) => {
                  const next = e.target.value;
                  setSaleText(next);
                  const cost = parseNum(costText);
                  const sale = parseNum(next);
                  if (cost != null && sale != null && sale > cost) {
                    setMarginText(String(Math.round(((sale - cost) / sale) * 1000) / 10));
                  }
                  setError(null);
                }}
                placeholder={t.price}
                inputMode="decimal"
                aria-label={t.price}
              />
            </label>
          </div>
          <p className="mt-1 text-sm text-muted">{t.costHint}</p>
          {costDirty || marginDirty || saleDirty ? (
            <Button className="mt-3" onClick={saveCost}>
              {t.save}
            </Button>
          ) : null}
          {dish && !creating ? (
            <DishFiles dishId={dish.id} />
          ) : (
            <p className="mt-4 text-sm text-muted">{t.filesAfterSave}</p>
          )}

          {!creating && dish && (
            <div className="row-scroll mt-6 flex gap-2 overflow-x-auto pb-1">
              {dish.versions.map((version, i) => {
                const stats = versionStats(version, materials);
                const prev = i > 0 ? versionStats(dish.versions[i - 1], materials) : null;
                const pts =
                  prev && stats.margin != null && prev.margin != null
                    ? (stats.margin - prev.margin) * 100
                    : null;
                const selected = i === index && !editing;
                return (
                  <button
                    key={version.id}
                    type="button"
                    disabled={editing}
                    onClick={() => {
                      setVersionIndex(i);
                      setConfirmDelete(false);
                    }}
                    className={cn(
                      "w-36 shrink-0 rounded-xl border p-3 text-left",
                      selected ? "border-tan bg-bg-soft" : "border-line",
                    )}
                  >
                    <p className="text-sm text-fg">{t.version(version.version)}</p>
                    <p className="mt-1 text-xs text-faint">{formatStamp(version.date)}</p>
                    <p className="mt-2 text-sm tabular-nums">{moneyOrDash(stats.cost)}</p>
                    <p className={cn("text-sm tabular-nums", toneText[marginTone(stats.margin)])}>
                      {formatPct(stats.margin)}
                    </p>
                    {pts != null && (
                      <p className={cn("text-xs tabular-nums", pts < 0 ? "text-bad" : "text-good")}>
                        {formatPts(pts)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(editing || creating) && <p className="mt-4 text-sm text-muted">{t.editHint}</p>}

          {viewed && !editing && viewed.note && (
            <p className="mt-4 text-sm text-muted">{viewed.note}</p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-4">
            <Kpi label={t.cost} value={moneyOrDash(activeStats?.cost ?? null)} />
            <Kpi label={t.price} value={moneyOrDash(activeStats?.sale ?? null)} />
            <Kpi label={t.profit} value={moneyOrDash(activeStats?.profit ?? null)} />
            <Kpi
              label={t.marginRate}
              value={
                <span className={toneText[marginTone(activeStats?.margin ?? null)]}>
                  {formatPct(activeStats?.margin ?? null)}
                </span>
              }
            />
          </div>
          {dish && dish.ways.length > 0 && !editing && (
            <p className="mt-2 text-sm text-muted">
              {t.ways}{" "}
              {dish.ways
                .map((way) => (lang === "en" ? way.en || way.zh : way.zh))
                .join(lang === "en" ? ", " : "、")}
            </p>
          )}

          <div className="mt-8 flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">{t.ingredients}</h2>
            {(editing || creating) && (
              <Button variant="line" size="sm" onClick={addDraftLine}>
                <Plus className="size-4" strokeWidth={1.5} />
                {t.addLine}
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{t.amountRule}</p>

          <div className="mt-3 overflow-x-auto">
            <ul className={editing || creating ? "mt-3" : "mt-3 min-w-[36rem]"}>
              <li
                className={`${ingredientGrid} text-xs text-faint${editing || creating ? " hidden" : ""}`}
              >
                <span>{t.code}</span>
                <span>{t.ingredients}</span>
                <span className="text-right">{t.qty}</span>
                <span className="text-right">{t.unitPrice}</span>
                <span className="text-right">{t.amount}</span>
              </li>
              {(editing || creating ? lines : shownLines).map((line) => {
                const draft = editing || creating ? (line as DraftLine) : null;
                const name = draft ? draft.name : (line as Ingredient).name;
                const materialId = draft ? draft.materialId : (line as Ingredient).materialId;
                const usage = draft ? parseNum(draft.usage) : (line as Ingredient).usage;
                const linked = findMaterial({ materialId, name }, materials);
                const amt = lineAmount(
                  linked?.price ?? null,
                  linked?.baseUnit ?? null,
                  usage ?? Number.NaN,
                );
                const missing =
                  Boolean(name.trim()) &&
                  (!linked || linked.price == null || !(linked.baseUnit && linked.baseUnit > 0));
                if (draft) {
                  return (
                    <li
                      key={draft.id}
                      data-line={draft.id}
                      className="mt-3 rounded-xl border border-line p-3"
                    >
                      <div className="flex items-start gap-2">
                        <label className="block min-w-0 flex-1">
                          <span className="mb-1 block text-xs text-faint">{t.ingredient}</span>
                          {linked?.code ? (
                            <span className="mb-1 block text-xs tabular-nums text-muted">
                              {linked.code}
                            </span>
                          ) : null}
                          <Input
                            value={draft.name}
                            list="material-names"
                            onChange={(e) => {
                              const next = e.target.value;
                              const hit = findMaterial({ materialId: null, name: next }, materials);
                              updateLine(setLines, draft.id, {
                                name: next,
                                materialId: hit?.id ?? null,
                              });
                            }}
                            placeholder={t.ingredient}
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={t.removeLine}
                          onClick={() => setAskLine(draft.id)}
                          className="mt-5 grid size-11 shrink-0 place-items-center rounded-md border border-line text-faint"
                        >
                          <X className="size-4" strokeWidth={1.5} />
                        </button>
                      </div>
                      {askLine === draft.id ? (
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-sm">
                          <span className="text-muted">
                            {t.confirmDeleteQ(draft.name || t.ingredient)}
                          </span>
                          <button
                            type="button"
                            className="h-9 rounded-md border border-bad px-3 text-sm text-bad"
                            onClick={() => {
                              setLines((curr) => curr.filter((row) => row.id !== draft.id));
                              setAskLine(null);
                            }}
                          >
                            {t.yesDelete}
                          </button>
                          <button
                            type="button"
                            className="h-9 rounded-md border border-line px-3 text-sm text-muted"
                            onClick={() => setAskLine(null)}
                          >
                            {t.cancel}
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-1 block text-xs text-faint">{t.qty}</span>
                          <Input
                            value={draft.usage}
                            inputMode="decimal"
                            onChange={(e) =>
                              updateLine(setLines, draft.id, { usage: e.target.value })
                            }
                          />
                        </label>
                        <div>
                          <p className="mb-1 text-xs text-faint">{t.unitPrice}</p>
                          <p className="flex h-11 items-center text-sm tabular-nums text-fg">
                            {linked?.price != null ? formatMoney(linked.price) : "—"}
                            <span className="ml-2 text-muted">/ {linked?.baseUnit ?? "—"}</span>
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-right text-sm text-muted tabular-nums">
                        {missing
                          ? t.checkName
                          : `${t.amount} ${amt == null ? "—" : formatMoney(amt)}`}
                      </p>
                    </li>
                  );
                }
                const fixed = line as Ingredient;
                return (
                  <li key={fixed.id} className={ingredientGrid}>
                    <span className="truncate text-xs tabular-nums text-muted">
                      {linked?.code || "—"}
                    </span>
                    <span className="truncate text-sm text-fg">{fixed.name}</span>
                    <span className="text-right text-sm tabular-nums">
                      {usage == null ? "—" : formatQty(usage)}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {linked?.price != null ? formatMoney(linked.price) : "—"}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {amt == null ? "—" : formatMoney(amt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {shownLines.length === 0 && !editing && !creating && (
            <p className="mt-3 text-sm text-muted">{t.noIngredients}</p>
          )}
          {(editing || creating) && lines.length > 0 ? (
            <button
              type="button"
              onClick={addDraftLine}
              className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line text-sm text-muted hover:border-fg hover:text-fg"
            >
              <Plus className="size-4" strokeWidth={1.5} />
              {t.addLine}
            </button>
          ) : null}
          <datalist id="material-names">
            {materials.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>

          {(editing || creating) && (
            <label className="mt-6 block">
              <span className="mb-1 block text-xs text-faint">{t.note}</span>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.notePh}
              />
            </label>
          )}

          {!creating && !editing && dish && (
            <div className="mt-8">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={() => {
                      void clearDishFiles(dish.id);
                      removeDish(dish.id);
                      onSaved(t.removed(shownName(dish.name, dish.nameEn, lang)));
                      onClose();
                    }}
                  >
                    {t.confirmRemove}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    {t.cancel}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-sm text-faint"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t.removeDish}
                </button>
              )}
            </div>
          )}
          <div className="h-6" />
        </div>
      </div>

      <footer className="shrink-0 border-t border-line bg-bg px-4 py-3 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {footerHint && <p className="text-sm text-bad">{footerHint}</p>}
          {!footerHint && analysis?.error === "unchanged" && (
            <p className="text-sm text-muted">{t.unchanged}</p>
          )}
          <div className="flex gap-2">
            {creating || editing ? (
              <>
                {!creating && (
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                    }}
                  >
                    {t.discard}
                  </Button>
                )}
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={save}
                  disabled={Boolean(analysis?.error)}
                >
                  {creating
                    ? t.save
                    : analysis?.costChanged
                      ? t.saveVersion((dish?.versions.length ?? 0) + 1)
                      : t.save}
                </Button>
              </>
            ) : (
              <Button className="w-full" size="lg" onClick={beginEdit}>
                {t.edit}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-bg px-3 py-4">
      <p className="text-xs text-faint">{label}</p>
      <div className="mt-1 text-lg font-semibold text-fg tabular-nums">{value}</div>
    </div>
  );
}

function blankLine(): DraftLine {
  return { id: uid("l"), materialId: null, name: "", usage: "" };
}

function toDraft(version: CostVersion): DraftLine[] {
  return version.lines.map((line) => ({
    id: line.id,
    materialId: line.materialId,
    name: line.name,
    usage: String(line.usage),
  }));
}

function updateLine(
  setLines: Dispatch<SetStateAction<DraftLine[]>>,
  id: string,
  patch: Partial<DraftLine>,
) {
  setLines((curr) => curr.map((line) => (line.id === id ? { ...line, ...patch } : line)));
}

function draftIngredients(lines: DraftLine[], materials: Material[]): Ingredient[] {
  return lines
    .filter((line) => line.name.trim() || line.usage.trim())
    .map((line) => {
      const hit = findMaterial({ materialId: line.materialId, name: line.name }, materials);
      return {
        id: line.id,
        materialId: hit?.id ?? line.materialId,
        name: line.name.trim(),
        usage: parseNum(line.usage) ?? 0,
      };
    });
}

function liveStats(
  materials: Material[],
  margin: number | null,
  lines: DraftLine[],
  costStr: string,
): VersionStats {
  const parsed = draftIngredients(lines, materials);
  const resolved = resolveCost(costStr, parsed, materials);
  const cost = resolved.effective;
  const sale = saleFrom(cost, margin);
  if (cost == null || sale == null || margin == null) {
    return { cost, sale, profit: null, margin, foodCost: null, known: false };
  }
  return {
    cost,
    sale,
    profit: round2(sale - cost),
    margin,
    foodCost: sale > 0 ? cost / sale : null,
    known: true,
  };
}

function resolveCost(
  text: string,
  lines: Ingredient[],
  materials: Material[],
): { error: "cost" | null; enteredCost: number | null; effective: number | null } {
  const lineCost = recipeCost(lines, materials);
  if (!text.trim()) return { error: null, enteredCost: null, effective: lineCost };
  const n = parseNum(text);
  if (n == null || n < 0) return { error: "cost", enteredCost: null, effective: null };
  const typed = round2(n);
  if (lineCost != null && typed === lineCost)
    return { error: null, enteredCost: null, effective: lineCost };
  return { error: null, enteredCost: typed, effective: typed };
}

function analyzeDraft(args: {
  name: string;
  nameEn: string;
  categoryId: string;
  marginText: string;
  note: string;
  lines: DraftLine[];
  cost: string;
  materials: Material[];
  base: CostVersion | null;
  baseMeta: { name: string; nameEn: string; categoryId: string } | null;
}): {
  error: string | null;
  costChanged: boolean;
  metaChanged: boolean;
  parsed: NewVersionInput | null;
} {
  const name = args.name.trim();
  const fail = (error: string) => ({ error, costChanged: false, metaChanged: false, parsed: null });
  if (!name) return fail("name");
  const margin = parseMargin(args.marginText);
  if (margin == null) return fail("margin");
  const lines = draftIngredients(args.lines, args.materials);
  if (lines.some((line) => !line.name)) return fail("lineName");
  const resolved = resolveCost(args.cost, lines, args.materials);
  if (resolved.error) return fail(resolved.error);
  const parsed: NewVersionInput = {
    name,
    nameEn: args.nameEn.trim(),
    categoryId: args.categoryId,
    margin,
    note: args.note.trim(),
    lines,
    enteredCost: resolved.enteredCost,
    enteredSale: null,
  };
  const metaChanged =
    !args.baseMeta ||
    name !== args.baseMeta.name ||
    parsed.nameEn !== args.baseMeta.nameEn ||
    args.categoryId !== args.baseMeta.categoryId;
  const prevCost = args.base ? versionCost(args.base, args.materials) : null;
  const costChanged =
    !args.base ||
    prevCost !== resolved.effective ||
    Math.abs((args.base.margin ?? 0) - margin) > 0.0005 ||
    costSignature(margin, lines, resolved.enteredCost) !==
      costSignature(args.base.margin, args.base.lines, args.base.enteredCost ?? null);
  if (!costChanged && !metaChanged) return { error: "unchanged", costChanged, metaChanged, parsed };
  return { error: null, costChanged, metaChanged, parsed };
}

function MaterialCatEditor({ onClose }: { onClose: () => void }) {
  const cats = useCostStore((s) => s.materialCategories);
  const addMaterialCategory = useCostStore((s) => s.addMaterialCategory);
  const renameMaterialCategory = useCostStore((s) => s.renameMaterialCategory);
  const removeMaterialCategory = useCostStore((s) => s.removeMaterialCategory);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const { t } = useLang();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-void/70 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="mat-cat-title"
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-xl border border-line bg-bg-elev sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 p-4 pb-0">
          <h2 id="mat-cat-title" className="text-2xl font-semibold">
            {t.editMatCats}
          </h2>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="grid size-11 place-items-center"
          >
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-2">
          <p className="mt-2 text-sm text-muted">{t.matCatsHint}</p>
          <ul className="mt-4">
            {cats.map((cat) => (
              <MaterialCatRow
                key={cat}
                name={cat}
                asking={ask === cat}
                onAsk={() => setAsk(cat)}
                onCancel={() => setAsk(null)}
                onRename={(next) => {
                  const ok = renameMaterialCategory(cat, next);
                  if (!ok) setError(t.catExists);
                  else setError(null);
                  return ok;
                }}
                onRemove={() => {
                  const ok = removeMaterialCategory(cat);
                  if (!ok) setError(t.cannot);
                  setAsk(null);
                }}
              />
            ))}
          </ul>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const ok = addMaterialCategory(name);
              if (!ok) {
                setError(name.trim() ? t.catExists : t.needName);
                return;
              }
              setName("");
              setError(null);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.newCat}
              aria-label={t.newCat}
            />
            <Button type="submit">{t.addOne}</Button>
          </form>
          {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function MaterialCatRow({
  name,
  asking,
  onAsk,
  onCancel,
  onRename,
  onRemove,
}: {
  name: string;
  asking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onRename: (next: string) => boolean;
  onRemove: () => void;
}) {
  const { t } = useLang();
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <li className="border-b border-line py-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          aria-label={name}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (!onRename(value)) setValue(name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button
          type="button"
          aria-label={t.deleteCat(name)}
          onClick={onAsk}
          className="grid size-11 shrink-0 place-items-center text-faint"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {asking ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{t.confirmDeleteQ(name)}</span>
          <button
            type="button"
            className="h-9 rounded-md border border-bad px-3 text-sm text-bad"
            onClick={onRemove}
          >
            {t.yesDelete}
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-line px-3 text-sm text-muted"
            onClick={onCancel}
          >
            {t.cancel}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function LibraryPanel({ onClose }: { onClose: () => void }) {
  const materials = useCostStore((s) => s.materials);
  const dishes = useCostStore((s) => s.dishes);
  const cats = useCostStore((s) => s.materialCategories);
  const addMaterial = useCostStore((s) => s.addMaterial);
  const updateMaterial = useCostStore((s) => s.updateMaterial);
  const removeMaterial = useCostStore((s) => s.removeMaterial);
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(cats[0] ?? "");
  const [editingCats, setEditingCats] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [base, setBase] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const catList = useRef(cats);
  useEffect(() => {
    if (!cat || cats.includes(cat)) {
      catList.current = cats;
      return;
    }
    const index = catList.current.indexOf(cat);
    setCat(cats[index] ?? cats[0] ?? "");
    catList.current = cats;
  }, [cats, cat]);
  const suggestedCode = nextMaterialCode(cat, materials);
  const shown = materials.filter((item) => {
    if (cat && item.category !== cat) return false;
    if (!query) return true;
    return `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(query);
  });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center gap-1 text-sm text-muted"
        >
          <ChevronLeft className="size-5" strokeWidth={1.5} />
          {t.back}
        </button>
        <p className="text-sm text-fg">{t.library}</p>
        <Button variant="line" size="sm" onClick={() => setEditingCats(true)}>
          {t.editMatCats}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm text-muted">{t.libraryHint}</p>
          <Input
            className="mt-4"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchMatPh}
            aria-label={t.search}
          />
          <div className="row-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
            {cats.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCat(item)}
                className={
                  item === cat
                    ? "h-9 shrink-0 rounded-md bg-fg px-3 text-sm text-ink"
                    : "h-9 shrink-0 rounded-md border border-line px-3 text-sm text-muted"
                }
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[42rem]">
              <p className="pb-2 text-sm text-fg">{t.insertMaterial}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const category = cat.trim();
                  if (!name.trim()) {
                    setError(t.needName);
                    return;
                  }
                  const ok = addMaterial({
                    category,
                    name,
                    code,
                    baseUnit: parseNum(base),
                    price: parseNum(price),
                  });
                  if (!ok) {
                    setError(t.nameTaken);
                    return;
                  }
                  setName("");
                  setCode("");
                  setBase("");
                  setPrice("");
                  setError(null);
                }}
              >
                <div className={materialGrid}>
                  <Input
                    value={suggestedCode || code}
                    readOnly={Boolean(suggestedCode)}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t.code}
                    aria-label={t.code}
                    className="tabular-nums"
                  />
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.material}
                    aria-label={t.material}
                  />
                  <Select
                    value={cat}
                    onChange={(e) => setCat(e.target.value)}
                    aria-label={t.materialCat}
                  >
                    {cats.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    placeholder={t.baseUnit}
                    inputMode="decimal"
                    aria-label={t.baseUnit}
                    className="text-right tabular-nums"
                  />
                  <Input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={t.unitPrice}
                    inputMode="decimal"
                    aria-label={t.unitPrice}
                    className="text-right tabular-nums"
                  />
                  <Button type="submit" className="px-2 text-sm" aria-label={t.insert}>
                    {t.insert}
                  </Button>
                </div>
              </form>
              {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
              <div className={`${materialGrid} mt-4 pb-2 text-xs text-faint`}>
                <span>{t.code}</span>
                <span>{t.material}</span>
                <span>{t.materialCat}</span>
                <span className="text-right">{t.baseUnit}</span>
                <span className="text-right">{t.unitPrice}</span>
                <span />
              </div>
              <ul>
                {shown.map((item) => (
                  <MaterialRow
                    key={item.id}
                    item={item}
                    cats={cats}
                    used={dishesUsing(item, dishes)}
                    onChange={updateMaterial}
                    onRemove={removeMaterial}
                  />
                ))}
              </ul>
            </div>
          </div>
          {shown.length === 0 && <p className="mt-4 text-sm text-muted">{t.none}</p>}
        </div>
      </div>
      {editingCats ? <MaterialCatEditor onClose={() => setEditingCats(false)} /> : null}
    </div>
  );
}

function MaterialRow({
  item,
  cats,
  used,
  onChange,
  onRemove,
}: {
  item: Material;
  cats: string[];
  used: number;
  onChange: (
    id: string,
    patch: Partial<Pick<Material, "category" | "name" | "code" | "baseUnit" | "price">>,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(item.name);
  const [code, setCode] = useState(item.code);
  const [base, setBase] = useState(item.baseUnit == null ? "" : String(item.baseUnit));
  const [price, setPrice] = useState(item.price == null ? "" : String(item.price));
  const [ask, setAsk] = useState(false);
  return (
    <li className="border-b border-line py-2">
      <div className={materialGrid}>
        <Input
          value={code}
          aria-label={t.code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => onChange(item.id, { code })}
          className="tabular-nums"
        />
        <Input
          value={name}
          aria-label={t.material}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onChange(item.id, { name })}
        />
        <Select
          value={item.category}
          aria-label={t.materialCat}
          onChange={(e) => onChange(item.id, { category: e.target.value })}
        >
          {cats.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
        <Input
          value={base}
          aria-label={t.baseUnit}
          inputMode="decimal"
          onChange={(e) => setBase(e.target.value)}
          onBlur={() => onChange(item.id, { baseUnit: parseNum(base) })}
          className="text-right tabular-nums"
        />
        <Input
          value={price}
          aria-label={t.unitPrice}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => onChange(item.id, { price: parseNum(price) })}
          className="text-right tabular-nums"
        />
        <button
          type="button"
          aria-label={t.removeLine}
          onClick={() => setAsk(true)}
          className="grid size-11 place-items-center rounded-md border border-line text-faint"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {ask ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-sm">
          <span className="text-muted">
            {t.confirmDeleteQ(name || item.name)}
            {used > 0 ? ` ${t.usedIn(used)}` : ""}
          </span>
          <button
            type="button"
            className="h-9 rounded-md border border-bad px-3 text-sm text-bad"
            onClick={() => onRemove(item.id)}
          >
            {t.yesDelete}
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-line px-3 text-sm text-muted"
            onClick={() => setAsk(false)}
          >
            {t.cancel}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function dishesUsing(material: Material, dishes: Dish[]) {
  const name = material.name.trim().toLowerCase();
  return dishes.filter((dish) => {
    const version = latestVersion(dish);
    return version?.lines.some(
      (line) => line.materialId === material.id || line.name.trim().toLowerCase() === name,
    );
  }).length;
}

const materialGrid =
  "grid grid-cols-[6.5rem_minmax(8rem,1.4fr)_7.5rem_5.5rem_6.5rem_4.5rem] items-center gap-2";

type BoardGroup = { id: string; title: string; sub: string; rows: CardRow[]; canAdd: boolean };

/**
 * One recipe line: 食材 | 单位 | 单价 | 用量 | 金额 | ×.
 * On a phone it is two rows (name, delete / unit, price, usage, amount). Nothing in a card scrolls.
 */
const boardGrid =
  "grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,1.1fr)_1.75rem] items-center gap-x-1 border-b border-line/70 py-0.5 sm:grid-cols-[minmax(0,1fr)_3.5rem_6rem_3.5rem_5.5rem_1.75rem]";

const toneBorder: Record<MarginTone, string> = {
  good: "border-l-good",
  watch: "border-l-tan",
  tight: "border-l-bad",
  none: "border-l-line",
};

const toneBadge: Record<MarginTone, string> = {
  good: "bg-good/10 text-good",
  watch: "bg-tan/10 text-tan",
  tight: "bg-bad/10 text-bad",
  none: "bg-bg-soft text-muted",
};

function plainNum(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("id-ID");
}

// Ref-counted page scroll lock for full-screen panels. Always clears the
// inline style once the last panel closes, so the page can never stay stuck.
let scrollLocks = 0;
function lockBodyScroll() {
  scrollLocks += 1;
  document.body.style.overflow = "hidden";
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.removeProperty("overflow");
  };
}

function useHeaderHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setHeight(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

type BoardSort = "default" | "marginLow" | "marginHigh" | "costHigh" | "name";

function CategoryBoard({
  groups,
  shelf,
  onShelf,
  onOpen,
  onNew,
  onAddCat,
  onLibrary,
  onExport,
  onImport,
}: {
  groups: BoardGroup[];
  shelf: "on" | "off" | "all";
  onShelf: (next: "on" | "off" | "all") => void;
  onOpen: (dishId: string) => void;
  onNew: (categoryId: string) => void;
  onAddCat: () => void;
  onLibrary: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const { lang, t } = useLang();
  const materials = useCostStore((s) => s.materials);
  const [pick, setPick] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [sort, setSort] = useState<BoardSort>("default");
  const topRef = useRef<HTMLDivElement>(null);
  const headerH = useHeaderHeight();
  const active =
    groups.find((group) => group.id === pick) ??
    groups.find((group) => group.id !== "watch" && group.rows.length > 0) ??
    groups[0];

  const choose = (id: string) => {
    setPick(id);
    setFind("");
    const box = topRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + window.scrollY - headerH - 8;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  };

  if (!active) return null;

  const needle = find.trim().toLowerCase();
  const rows = active.rows
    .filter((row) => {
      if (!needle) return true;
      const blob = `${row.dish.name} ${row.dish.nameEn} ${row.version.lines.map((line) => line.name).join(" ")}`;
      return blob.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (sort === "marginLow") return (a.stats.margin ?? 9) - (b.stats.margin ?? 9);
      if (sort === "marginHigh") return (b.stats.margin ?? -9) - (a.stats.margin ?? -9);
      if (sort === "costHigh") return (b.stats.cost ?? 0) - (a.stats.cost ?? 0);
      if (sort === "name") return a.dish.name.localeCompare(b.dish.name, "zh");
      return 0;
    });

  const items = active.rows.reduce((sum, row) => sum + row.version.lines.length, 0);
  const priced = active.rows.filter((row) => row.stats.margin != null);
  const avgMargin = priced.length
    ? priced.reduce((sum, row) => sum + (row.stats.margin ?? 0), 0) / priced.length
    : null;
  const costed = active.rows.filter((row) => row.stats.cost != null);
  const avgCost = costed.length
    ? costed.reduce((sum, row) => sum + (row.stats.cost ?? 0), 0) / costed.length
    : null;

  const navItem = (selected: boolean) =>
    cn(
      "flex h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm whitespace-nowrap",
      selected ? "bg-bg-soft font-semibold text-fg" : "text-muted hover:bg-bg-soft hover:text-fg",
    );

  return (
    <div
      ref={topRef}
      className="px-4 pt-6 sm:px-8 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8"
    >
      <aside
        className="md:sticky md:top-(--side-top) md:max-h-(--side-max) md:self-start md:overflow-y-auto md:pr-1 md:[scrollbar-width:thin]"
        style={
          {
            "--side-top": `${headerH + 16}px`,
            "--side-max": `calc(100dvh - ${headerH + 32}px)`,
          } as CSSProperties
        }
      >
        <p className="px-3 text-xs text-faint max-md:hidden">{t.workbench}</p>
        <button
          type="button"
          onClick={onLibrary}
          className={cn(navItem(false), "mt-1 max-md:hidden")}
        >
          <span>{t.library}</span>
        </button>
        <p className="mt-5 px-3 text-xs text-faint max-md:hidden">{t.dishCats}</p>
        <nav aria-label={t.dishCats} className="mt-1 flex flex-wrap gap-2 md:block md:space-y-0.5">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-current={group.id === active.id ? "true" : undefined}
              onClick={() => choose(group.id)}
              className={cn(
                navItem(group.id === active.id),
                "max-md:h-9 max-md:w-auto max-md:border max-md:border-line",
                group.id === active.id && "max-md:border-fg",
                group.id === "watch" && group.id !== active.id && "text-bad",
              )}
            >
              <span>{group.title}</span>
              <span className="text-xs font-normal tabular-nums text-faint">
                {group.rows.length}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onAddCat}
            className={cn(navItem(false), "max-md:h-9 max-md:w-auto justify-start text-faint")}
          >
            <Plus className="size-4" strokeWidth={1.5} />
            {t.addCat}
          </button>
        </nav>
      </aside>

      <section className="mt-6 min-w-0 md:mt-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">
              {active.title}
              {active.sub ? (
                <span className="ml-3 font-sans text-sm font-normal text-faint">{active.sub}</span>
              ) : null}
            </h1>
            <p className="mt-2 text-sm text-muted tabular-nums">
              {t.catSummary(active.rows.length, items, formatPct(avgMargin), moneyOrDash(avgCost))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="line" onClick={onImport}>
              {t.importExcel}
            </Button>
            <Button onClick={onExport}>{t.exportExcel}</Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg-elev p-3">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.5}
            />
            <Input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={t.searchInCat}
              aria-label={t.searchInCat}
              className="h-10 pl-9"
            />
          </label>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as BoardSort)}
            aria-label={t.sortDefault}
            className="h-10 w-auto"
          >
            <option value="default">{t.sortDefault}</option>
            <option value="marginLow">{t.sortMarginLow}</option>
            <option value="marginHigh">{t.sortMarginHigh}</option>
            <option value="costHigh">{t.sortCostHigh}</option>
            <option value="name">{t.sortName}</option>
          </Select>
          <Select
            value={shelf}
            onChange={(e) => onShelf(e.target.value as "on" | "off" | "all")}
            aria-label={t.onSale}
            className="h-10 w-auto"
          >
            <option value="on">{t.onSale}</option>
            <option value="off">{t.offShelf}</option>
            <option value="all">{t.allDishes}</option>
          </Select>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-good" />
              ≥65%
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-tan" />
              55–65%
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-bad" />
              &lt;55%
            </span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {active.canAdd ? (
              <Button onClick={() => onNew(active.id)}>
                <Plus className="size-4" strokeWidth={1.5} />
                {t.addDishBtn}
              </Button>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-muted">{needle ? t.none : t.noDishesHere}</p>
        ) : (
          <div className="mt-5 grid items-start gap-5 min-[1400px]:grid-cols-2">
            {rows.map((row) => (
              <RecipeCard
                key={row.dish.id}
                row={row}
                onOpen={() => onOpen(row.dish.id)}
                lang={lang}
              />
            ))}
          </div>
        )}
        <datalist id="board-materials">
          {materials.map((item) => (
            <option key={item.id} value={item.name}>
              {item.code}
            </option>
          ))}
        </datalist>
      </section>
    </div>
  );
}

function RecipeCard({ row, onOpen, lang }: { row: CardRow; onOpen: () => void; lang: Lang }) {
  const { t } = useLang();
  const materials = useCostStore((s) => s.materials);
  const editVersion = useCostStore((s) => s.editVersion);
  const updateMaterial = useCostStore((s) => s.updateMaterial);
  const addMaterial = useCostStore((s) => s.addMaterial);
  const addDish = useCostStore((s) => s.addDish);
  const removeDish = useCostStore((s) => s.removeDish);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const [askDish, setAskDish] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [marginText, setMarginText] = useState("");
  const [noteText, setNoteText] = useState(row.version.note);
  const lines = row.version.lines;
  const { stats } = row;
  const tone = marginTone(stats.margin);

  useEffect(() => {
    setMarginText(stats.margin == null ? "" : String(round2(stats.margin * 100)));
  }, [stats.margin]);
  useEffect(() => {
    setNoteText(row.version.note);
  }, [row.version.note]);

  const save = (next: Ingredient[]) => {
    setNote(null);
    editVersion(row.dish.id, { lines: next });
  };
  const patchLine = (id: string, patch: Partial<Ingredient>) =>
    save(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const matFor = (line: Ingredient) => findMaterial(line, materials);

  const ensureMaterial = (line: Ingredient, patch: { price?: number; baseUnit?: number }) => {
    const mat = matFor(line);
    if (mat) {
      updateMaterial(mat.id, patch);
      if (line.materialId !== mat.id) patchLine(line.id, { materialId: mat.id });
      else setNote(null);
      return;
    }
    if (!line.name.trim()) return;
    addMaterial({
      category: "其他",
      name: line.name,
      baseUnit: patch.baseUnit ?? 1,
      price: patch.price ?? null,
    });
    const key = line.name.trim().toLowerCase();
    const created = useCostStore
      .getState()
      .materials.find((item) => item.name.trim().toLowerCase() === key);
    if (created) patchLine(line.id, { materialId: created.id });
  };

  const setCode = (line: Ingredient, text: string) => {
    const code = text.trim();
    if (!code) return;
    const mat = matFor(line);
    const hit = materials.find((item) => item.code.trim().toLowerCase() === code.toLowerCase());
    if (hit && hit.id !== mat?.id) {
      patchLine(line.id, { materialId: hit.id, name: hit.name });
      return;
    }
    if (mat) {
      updateMaterial(mat.id, { code });
      return;
    }
    setNote(t.codeMissing);
  };

  const setName = (line: Ingredient, text: string) => {
    const name = text.trim();
    if (!name) return;
    const hit = findMaterial({ materialId: null, name }, materials);
    patchLine(line.id, { name, materialId: hit?.id ?? null });
  };

  const setUsage = (line: Ingredient, text: string) => {
    const n = parseNum(text);
    if (n == null || n < 0) return;
    patchLine(line.id, { usage: n });
  };

  const setUnit = (line: Ingredient, text: string) => {
    const n = parseNum(text);
    if (n == null || !(n > 0)) return;
    ensureMaterial(line, { baseUnit: n });
  };

  const setPrice = (line: Ingredient, text: string) => {
    const n = parseNum(text);
    if (n == null || n < 0) return;
    ensureMaterial(line, { price: n });
  };

  const setAmount = (line: Ingredient, text: string) => {
    const amount = parseNum(text);
    if (amount == null || !(amount > 0)) return;
    const mat = matFor(line);
    if (mat?.price && mat.baseUnit && mat.baseUnit > 0) {
      patchLine(line.id, { usage: round4((amount * mat.baseUnit) / mat.price) });
      return;
    }
    if (mat?.price && line.usage > 0) {
      updateMaterial(mat.id, { baseUnit: round4((mat.price * line.usage) / amount) });
      return;
    }
    if (line.usage > 0) {
      ensureMaterial(line, { price: round4(amount / line.usage), baseUnit: 1 });
      return;
    }
    setNote(t.checkName);
  };

  const addLine = (text: string) => {
    const name = text.trim();
    setAdding(false);
    if (!name) return;
    const hit = findMaterial({ materialId: null, name }, materials);
    save([
      ...lines,
      { id: uid("l"), materialId: hit?.id ?? null, name: hit?.name ?? name, usage: 0 },
    ]);
  };

  const commitMargin = () => {
    const rate = parseMargin(marginText);
    if (rate == null) {
      setMarginText(stats.margin == null ? "" : String(round2(stats.margin * 100)));
      return;
    }
    if (stats.margin != null && Math.abs(rate - stats.margin) < 0.00005) return;
    editVersion(row.dish.id, { margin: rate });
  };

  const setSale = (text: string) => {
    const sale = parseNum(text);
    if (sale == null || stats.cost == null || !(sale > stats.cost)) return;
    editVersion(row.dish.id, { margin: round4(1 - stats.cost / sale) });
  };

  const copyDish = () => {
    addDish({
      name: row.dish.name + t.copySuffix,
      nameEn: row.dish.nameEn ? row.dish.nameEn + " (copy)" : "",
      categoryId: row.dish.categoryId,
      margin: row.version.margin,
      note: row.version.note,
      lines: lines.map((line) => ({ ...line, id: uid("l") })),
      enteredCost: null,
      enteredSale: null,
    });
  };

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border border-l-4 border-line bg-bg-elev shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        toneBorder[tone],
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          title={t.details}
          className="min-w-0 flex-1 truncate text-left text-base font-semibold text-fg hover:underline"
        >
          {shownName(row.dish.name, row.dish.nameEn, lang)}
          {row.dish.listed === false ? (
            <span className="ml-2 text-xs font-normal text-bad">{t.offShelf}</span>
          ) : null}
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            toneBadge[tone],
          )}
        >
          {t.margin} {formatPct(stats.margin)}
        </span>
        <button
          type="button"
          onClick={copyDish}
          aria-label={t.copyDish}
          title={t.copyDish}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-faint hover:text-fg"
        >
          <CopyIcon className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setAskDish(true)}
          aria-label={t.removeDish}
          title={t.removeDish}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-faint hover:text-bad"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </header>
      {askDish ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-line bg-bg-soft px-4 py-2 text-sm">
          <span className="text-muted">{t.confirmDeleteQ(row.dish.name)}</span>
          <button
            type="button"
            className="h-8 rounded-md border border-bad px-3 text-sm text-bad"
            onClick={() => {
              void clearDishFiles(row.dish.id);
              removeDish(row.dish.id);
            }}
          >
            {t.yesDelete}
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-line px-3 text-sm text-muted"
            onClick={() => setAskDish(false)}
          >
            {t.cancel}
          </button>
        </div>
      ) : null}

      <div className="px-3 pt-2">
        <div className={`${boardGrid} text-xs text-faint sm:hidden`}>
          <span className="px-1 text-right">{t.colUnit}</span>
          <span className="px-1 text-right">{t.colPrice}</span>
          <span className="px-1 text-right">{t.qtyShort}</span>
          <span className="px-1 text-right">{t.colAmount}</span>
          <span />
        </div>
        <div className={`${boardGrid} border-line text-xs text-faint max-sm:hidden`}>
          <span className="px-2">{t.ingredient}</span>
          <span className="px-2 text-right">{t.colUnit}</span>
          <span className="px-2 text-right">{t.colPrice}</span>
          <span className="px-2 text-right">{t.qtyShort}</span>
          <span className="px-2 text-right">{t.colAmount}</span>
          <span />
        </div>
        {lines.map((line) => {
          const mat = matFor(line);
          const amount = lineAmount(mat?.price ?? null, mat?.baseUnit ?? null, line.usage);
          if (ask === line.id) {
            return (
              <div
                key={line.id}
                className="flex flex-wrap items-center justify-end gap-3 border-b border-line/70 px-2 py-1.5 text-sm"
              >
                <span className="text-muted">{t.confirmDeleteQ(line.name || t.ingredient)}</span>
                <button
                  type="button"
                  className="h-8 rounded-md border border-bad px-3 text-sm text-bad"
                  onClick={() => {
                    setAsk(null);
                    save(lines.filter((item) => item.id !== line.id));
                  }}
                >
                  {t.yesDelete}
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-line px-3 text-sm text-muted"
                  onClick={() => setAsk(null)}
                >
                  {t.cancel}
                </button>
              </div>
            );
          }
          return (
            <div key={line.id} className={boardGrid}>
              <div className="flex min-w-0 items-center max-sm:order-1 max-sm:col-span-4">
                <EditCell
                  value={line.name}
                  list="board-materials"
                  onSave={(text) => setName(line, text)}
                  className="min-w-0 flex-1"
                >
                  <span className="truncate">{line.name || "—"}</span>
                  {!mat && line.name ? (
                    <span className="ml-2 shrink-0 text-xs text-bad">{t.noMatch}</span>
                  ) : null}
                </EditCell>
                <EditCell
                  value={mat?.code ?? ""}
                  onSave={(text) => setCode(line, text)}
                  className="shrink-0 px-1 text-[0.7rem] text-faint"
                >
                  {mat?.code || t.code}
                </EditCell>
              </div>
              <EditCell
                value={mat?.baseUnit == null ? "" : String(mat.baseUnit)}
                inputMode="decimal"
                align="right"
                onSave={(text) => setUnit(line, text)}
                className="max-sm:order-3 max-sm:px-1 max-sm:text-xs"
              >
                {plainNum(mat?.baseUnit)}
              </EditCell>
              <EditCell
                value={mat?.price == null ? "" : String(mat.price)}
                inputMode="decimal"
                align="right"
                onSave={(text) => setPrice(line, text)}
                className="max-sm:order-4 max-sm:px-1 max-sm:text-xs"
              >
                <span className="truncate">{plainNum(mat?.price)}</span>
              </EditCell>
              <EditCell
                value={formatQty(line.usage)}
                inputMode="decimal"
                align="right"
                onSave={(text) => setUsage(line, text)}
                className="max-sm:order-5 max-sm:px-1 max-sm:text-xs"
              >
                {formatQty(line.usage)}
              </EditCell>
              <EditCell
                value={amount == null ? "" : String(amount)}
                inputMode="decimal"
                align="right"
                onSave={(text) => setAmount(line, text)}
                className="max-sm:order-6 max-sm:px-1 max-sm:text-xs"
              >
                {amount == null ? (
                  <span className="truncate text-xs text-bad">{line.name ? t.noPrice : "—"}</span>
                ) : (
                  <span className="truncate">{plainNum(amount)}</span>
                )}
              </EditCell>
              <button
                type="button"
                aria-label={t.removeLine}
                onClick={() => setAsk(line.id)}
                className="grid size-7 place-items-center rounded-md text-faint hover:bg-bg-soft hover:text-bad max-sm:order-2"
              >
                <X className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
        {adding ? (
          <div className="border-b border-line/70 py-1">
            <EditCell
              value=""
              list="board-materials"
              autoEdit
              onSave={addLine}
              onCancel={() => setAdding(false)}
            >
              {""}
            </EditCell>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="my-2 flex h-9 w-full items-center justify-center gap-1 rounded-md border border-dashed border-line text-sm text-muted hover:border-fg hover:text-fg"
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {t.addFood}
        </button>
        {note ? <p className="pb-2 text-xs text-bad">{note}</p> : null}
      </div>

      <footer className="rounded-b-xl border-t border-line bg-bg-soft/50 px-4 pt-3 pb-2">
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0">
            <p className="text-xs text-faint">{t.totalCost}</p>
            <p className="truncate text-xl font-semibold text-fg tabular-nums">
              {moneyOrDash(stats.cost)}
            </p>
          </div>
          <label className="block text-center max-sm:order-3 max-sm:col-span-2 max-sm:flex max-sm:items-center max-sm:gap-3 max-sm:text-left">
            <span className="text-xs text-faint">{t.marginRate}</span>
            <span className="relative mt-1 block max-sm:mt-0">
              <Input
                value={marginText}
                inputMode="decimal"
                aria-label={t.marginRate}
                onChange={(e) => setMarginText(e.target.value)}
                onBlur={commitMargin}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="h-9 w-24 pr-7 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-faint">
                %
              </span>
            </span>
          </label>
          <div className="min-w-0 text-right max-sm:order-2">
            <p className="text-xs text-faint">{t.suggestedPrice}</p>
            <EditCell
              value={stats.sale == null ? "" : String(Math.round(stats.sale))}
              inputMode="decimal"
              align="right"
              onSave={setSale}
              className="h-9 px-0 text-xl font-semibold text-good sm:text-2xl"
            >
              <span className="truncate">{moneyOrDash(stats.sale)}</span>
            </EditCell>
          </div>
        </div>
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => {
            if (noteText.trim() !== row.version.note.trim())
              editVersion(row.dish.id, { note: noteText.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={t.cardNotePh}
          aria-label={t.cardNotePh}
          className="mt-2 h-8 w-full rounded-md bg-transparent px-0 text-xs text-muted outline-none placeholder:text-faint focus:bg-bg-elev focus:px-2"
        />
      </footer>
    </article>
  );
}

function EditCell({
  value,
  children,
  onSave,
  onCancel,
  align = "left",
  list,
  inputMode,
  autoEdit = false,
  className,
}: {
  value: string;
  children: ReactNode;
  onSave: (text: string) => void;
  onCancel?: () => void;
  align?: "left" | "right";
  list?: string;
  inputMode?: "decimal" | "text";
  autoEdit?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const [editing, setEditing] = useState(autoEdit);
  const [text, setText] = useState(value);
  const closed = useRef(false);

  const start = (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setText(value);
    closed.current = false;
    setEditing(true);
  };
  const finish = (keep: boolean) => {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    if (keep && text.trim() !== value.trim()) onSave(text);
    else onCancel?.();
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        list={list}
        inputMode={inputMode}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-fg bg-bg px-2 text-sm text-fg outline-none",
          align === "right" && "text-right tabular-nums",
          className,
        )}
      />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      title={t.dblEdit}
      onDoubleClick={(e) => start(e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          start(e);
        }
      }}
      className={cn(
        "flex h-8 min-w-0 cursor-text touch-manipulation items-center overflow-hidden rounded-md px-2 text-sm whitespace-nowrap select-none hover:bg-bg-soft",
        align === "right" && "justify-end tabular-nums",
        className,
      )}
    >
      {children}
    </div>
  );
}
