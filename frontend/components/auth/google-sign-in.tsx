"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void;
  renderButton: (element: HTMLElement, options: { theme: string; size: string; shape: string; text: string; width: number }) => void;
  disableAutoSelect: () => void;
};
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

export function GoogleSignIn({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled: boolean }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const button = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const busy = useRef(disabled);
  useEffect(() => { callback.current = onCredential; busy.current = disabled; }, [onCredential, disabled]);
  useEffect(() => {
    let active = true;
    api<{ googleClientId: string | null }>("/api/auth/config").then(data => {
      if (active) {
        setClientId(data.googleClientId);
        if (!data.googleClientId) setError("Google sign-in is currently unavailable. You can use email below.");
      }
    }).catch(() => { if (active) setError("Google sign-in couldn’t load. You can use email below."); });
    return () => { active = false; };
  }, []);

  function render() {
    if (!clientId || !window.google || !button.current) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      callback: ({ credential }) => { if (!busy.current) callback.current(credential); },
    });
    window.google.accounts.id.renderButton(button.current, {
      theme: "outline", size: "large", shape: "pill", text: "continue_with",
      width: Math.min(360, button.current.clientWidth),
    });
  }

  return <div className="mb-6">
    {clientId && <Script src="https://accounts.google.com/gsi/client" onReady={render} onError={() => setError("Google sign-in couldn’t load. You can use email below.")} />}
    <div ref={button} inert={disabled} className="flex min-h-1 justify-center" />
    {error && <p className="text-center text-xs leading-5 text-[#1f1f1f]/65">{error}</p>}
    {clientId && <div className="mt-6 flex items-center gap-3 text-xs text-[#1f1f1f]/55"><span className="h-px flex-1 bg-[#1f1f1f]/15" />or use email<span className="h-px flex-1 bg-[#1f1f1f]/15" /></div>}
  </div>;
}
