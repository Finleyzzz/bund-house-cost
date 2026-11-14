import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { useCostStore } from "@/lib/cost/store";
import { expectedPassword, faceAvailable, faceEnrolled, passwordsMatch, registerFace, unlockToday, unlockedToday, verifyFace } from "@/lib/cost/lock";
import type { Account } from "@/lib/cost/types";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex h-11 items-center rounded-md border border-line bg-bg-elev p-1 text-sm">
      <button
        type="button"
        aria-pressed={lang === "zh"}
        onClick={() => setLang("zh")}
        className={lang === "zh" ? "h-9 rounded bg-fg px-2.5 text-ink" : "h-9 rounded px-2.5 text-muted"}
      >
        中文
      </button>
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
        className={lang === "en" ? "h-9 rounded bg-fg px-2.5 text-ink" : "h-9 rounded px-2.5 text-muted"}
      >
        EN
      </button>
    </div>
  );
}

export function IntroScreen({ onSkip }: { onSkip: () => void }) {
  const { t } = useLang();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onSkip, reduce ? 400 : 1600);
    return () => window.clearTimeout(timer);
  }, [onSkip]);

  return (
    <main className="night relative grid min-h-dvh place-items-center overflow-hidden bg-black px-6">
      <div className="logo-stage is-playing">
        <img
          src="/brand/logo.png"
          alt="Bund House"
          width={480}
          height={480}
          decoding="async"
          className="logo-reveal mx-auto h-[34vh] max-h-64 w-auto"
        />
      </div>
      <button type="button" className="skip-intro" onClick={onSkip}>
        {t.skip}
      </button>
    </main>
  );
}

export function GateScreen() {
  const { t } = useLang();
  const accounts = useCostStore((s) => s.accounts);
  const signIn = useCostStore((s) => s.signIn);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Account | null>(null);
  const [password, setPassword] = useState("");
  const [faceReady, setFaceReady] = useState(false);

  useEffect(() => {
    void faceAvailable().then(setFaceReady);
  }, []);

  const enter = (account: Account) => {
    unlockToday(account.id);
    signIn(account.id);
  };

  const openAccount = (account: Account) => {
    if (unlockedToday(account.id)) {
      signIn(account.id);
      return;
    }
    setPicked(account);
    setPassword("");
    setError(null);
  };

  return (
    <main className="night rise-in flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark />
        <LangToggle />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        {picked ? (
          <form
            className="w-full max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              if (!passwordsMatch(password, expectedPassword(picked))) {
                setError(t.wrongPassword);
                return;
              }
              enter(picked);
            }}
          >
            <button type="button" onClick={() => setPicked(null)} className="text-sm text-muted">
              {t.back}
            </button>
            <h1 className="mt-4 text-3xl font-semibold text-fg">{picked.name}</h1>
            <p className="mt-1 text-sm text-muted">{t.onceToday}</p>
            <Input
              className="mt-6"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.password}
              aria-label={t.password}
              autoFocus
            />
            {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
            <Button type="submit" className="mt-3 w-full">
              {t.enterWord}
            </Button>
            {faceReady && faceEnrolled(picked.id) ? (
              <Button
                type="button"
                variant="line"
                className="mt-2 w-full"
                onClick={() => {
                  void verifyFace(picked.id).then((ok) => {
                    if (ok) enter(picked);
                    else setError(t.faceFailed);
                  });
                }}
              >
                {t.faceId}
              </Button>
            ) : null}
            {faceReady && !faceEnrolled(picked.id) ? (
              <Button
                type="button"
                variant="line"
                className="mt-2 w-full"
                onClick={() => {
                  if (!passwordsMatch(password, expectedPassword(picked))) {
                    setError(t.wrongPassword);
                    return;
                  }
                  void registerFace(picked).finally(() => enter(picked));
                }}
              >
                {t.enableFace}
              </Button>
            ) : null}
          </form>
        ) : (
          <>
            <div className="flex max-w-3xl flex-wrap items-start justify-center gap-8">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => openAccount(account)}
                  className="group flex w-28 flex-col items-center gap-3 sm:w-36"
                  aria-label={account.name}
                >
                  <span className="grid size-28 place-items-center rounded-md border border-transparent bg-bg-soft font-display text-5xl text-fg transition-[border-color,transform] duration-150 group-hover:border-fg group-active:scale-[0.96] sm:size-36 sm:text-6xl">
                    {account.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-lg text-muted transition-colors group-hover:text-fg">{account.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}