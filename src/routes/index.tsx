import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { HouseApp } from "@/components/house-app";
import { GateScreen, IntroScreen } from "@/components/opening";
import { useCostStore, useHydrated } from "@/lib/cost/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [introKey, setIntroKey] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const hydrated = useHydrated();
  const session = useCostStore((s) => s.session);
  const signOut = useCostStore((s) => s.signOut);
  const skip = useCallback(() => setIntroDone(true), []);

  if (!introDone) {
    return <IntroScreen key={introKey} onSkip={skip} />;
  }

  if (!hydrated) {
    return <main className="min-h-dvh bg-void" />;
  }

  if (!session) {
    return <GateScreen />;
  }

  return (
    <HouseApp
      onSignOut={signOut}
      onReplay={() => {
        setIntroDone(false);
        setIntroKey((k) => k + 1);
      }}
    />
  );
}
