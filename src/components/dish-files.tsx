import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addDishFiles, listDishFiles, removeDishFile } from "@/lib/cost/files";
import { useLang } from "@/lib/lang";
import { cn } from "@/lib/cn";

function fileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function DishFiles({ dishId }: { dishId: string }) {
  const { t } = useLang();
  const [rows, setRows] = useState<{ id: string; name: string; type: string; size: number; url: string }[]>([]);
  const [over, setOver] = useState(false);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    const files = await listDishFiles(dishId);
    for (const url of urls.current) URL.revokeObjectURL(url);
    const next = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file.blob),
    }));
    urls.current = next.map((row) => row.url);
    setRows(next);
  }, [dishId]);

  useEffect(() => {
    void load();
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [load]);

  const take = async (list: FileList | File[]) => {
    const files = [...list];
    if (files.length === 0) return;
    await addDishFiles(dishId, files);
    await load();
  };

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-fg">{t.files}</h2>
      <p className="mt-1 text-sm text-muted">{t.filesHint}</p>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        className={cn(
          "mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted",
          over ? "border-fg bg-bg-soft" : "border-line",
        )}
      >
        <input
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void take(e.target.files);
            e.target.value = "";
          }}
        />
        {t.drop}
      </label>
      {rows.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {rows.map((file) => {
            const ext = file.name.includes(".") ? file.name.split(".").pop()?.slice(0, 4).toUpperCase() : "FILE";
            return (
              <li key={file.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg-elev p-2">
                {file.type.startsWith("image/") ? (
                  <img src={file.url} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-md bg-bg-soft text-xs text-muted">{ext}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{file.name}</p>
                  <p className="text-xs text-faint">{fileSize(file.size)}</p>
                </div>
                <a href={file.url} download={file.name} className="shrink-0 text-sm text-muted">
                  {t.openFile}
                </a>
                <button
                  type="button"
                  aria-label={t.removeFile}
                  onClick={() => {
                    void removeDishFile(file.id).then(load);
                  }}
                  className="grid size-11 shrink-0 place-items-center text-faint"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
