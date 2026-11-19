"use client";
import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
export function DataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map());
  return (
    <SWRConfig
      value={{
        provider: () => cache,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
        dedupingInterval: 1000,
        errorRetryInterval: 30000,
        errorRetryCount: 2,
        refreshWhenHidden: false,
        refreshWhenOffline: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
