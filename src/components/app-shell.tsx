"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/lib/auth";
import type { Notification } from "@/lib/notifications";
import { AskAIPanel, type AskAIHandle } from "./ai/ask-ai-panel";
import { AskAISearch, Header, type ShellFarm } from "./header";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

// Lets any page open the Agriflow AI panel with a question.
const AskAIContext = createContext<(question: string) => void>(() => {});
export const useAskAI = () => useContext(AskAIContext);

export function AppShell({
  farm,
  farms,
  user,
  role,
  notifications,
  children,
}: {
  farm: ShellFarm;
  farms: ShellFarm[];
  user: { name: string; email: string };
  role: Role;
  notifications: Notification[];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const aiRef = useRef<AskAIHandle>(null);
  const ask = (question: string) => aiRef.current?.ask(question);

  return (
    <AskAIContext value={ask}>
      <div className="flex min-h-screen">
        <Sidebar farmName={farm.name} role={role} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            farm={farm}
            farms={farms}
            user={user}
            notifications={notifications}
            onMenu={() => setMenuOpen(true)}
            onAsk={ask}
          />
          {/* Bottom padding clears the phone tab bar. */}
          <main className="flex-1 p-4 pb-24 sm:p-6 md:pb-6 print:p-0">
            <AskAISearch
              onAsk={ask}
              className="mb-4 md:hidden print:hidden [&_input]:border [&_input]:border-line [&_input]:bg-card"
            />
            {children}
          </main>
        </div>
        <MobileNav role={role} />
        <AskAIPanel ref={aiRef} />
      </div>
    </AskAIContext>
  );
}
