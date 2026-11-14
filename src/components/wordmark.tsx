export function Wordmark({
  variant = "nav",
  onHome,
  label = "Home",
}: {
  variant?: "hero" | "nav";
  onHome?: () => void;
  label?: string;
}) {
  if (variant === "hero") {
    return (
      <img src="/brand/logo.png" alt="Bund House" className="logo-reveal mx-auto h-[42vh] max-h-80 w-auto" />
    );
  }

  const img = <img src="/brand/logo.png" alt="" className="h-11 w-auto" />;
  if (!onHome) return <div className="flex items-center">{img}</div>;
  return (
    <button type="button" onClick={onHome} aria-label={label} className="rounded-md">
      {img}
    </button>
  );
}
