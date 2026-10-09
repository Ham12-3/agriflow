"use client";

import { Maximize2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useImperativeHandle, useState, type Ref } from "react";
import { ChatView, LanguageSelect, useChat } from "./chat";

export type AskAIHandle = { ask: (question: string) => void };

export function AskAIPanel({ ref }: { ref: Ref<AskAIHandle> }) {
  const [open, setOpen] = useState(false);
  // Lives outside the drawer so the conversation survives closing it.
  const chat = useChat();

  // The header search bar opens the panel (and optionally asks) through this handle.
  useImperativeHandle(ref, () => ({
    ask(question: string) {
      setOpen(true);
      void chat.loadPrefs();
      if (question) void chat.send(question);
    },
  }));

  const onClose = () => setOpen(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 print:hidden" onClick={onClose}>
      <section
        role="dialog"
        aria-label="Ask Agriflow AI"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-card shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-white">
            <Sparkles className="size-4" />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Agriflow AI</h2>
            <p className="text-xs text-muted">Powered by N-ATLaS</p>
          </div>
          <LanguageSelect chat={chat} />
          <Link
            href="/ai"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-background"
            aria-label="Open the AI page"
            title="Open the AI page"
          >
            <Maximize2 className="size-4" />
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-background"
            aria-label="Close assistant"
          >
            <X className="size-5" />
          </button>
        </header>
        <ChatView chat={chat} />
      </section>
    </div>
  );
}
