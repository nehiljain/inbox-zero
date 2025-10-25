"use client";

import { env } from "@/env";
import Script from "next/script";

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  return (
    <Script
      src="/vendor/lemon/affiliate.js"
      defer
      onError={(e) => {
        console.error("Failed to load Lemon Squeezy affiliate script:", e);
      }}
      onLoad={() => {
        if (!window) return;

        (
          window as {
            lemonSqueezyAffiliateConfig?: unknown;
            createLemonSqueezyAffiliate?: () => void;
          }
        ).lemonSqueezyAffiliateConfig = {
          store: env.NEXT_PUBLIC_LEMON_STORE_ID,
          debug: true,
        };

        const windowWithLemon = window as {
          createLemonSqueezyAffiliate?: () => void;
        };
        if (windowWithLemon.createLemonSqueezyAffiliate)
          windowWithLemon.createLemonSqueezyAffiliate();
      }}
    />
  );
}
