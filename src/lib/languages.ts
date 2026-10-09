// Languages N-ATLaS supports. Safe to import from client components.

export const LANGUAGES = {
  en: "English",
  ha: "Hausa",
  ig: "Igbo",
  yo: "Yoruba",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export function isLanguage(value: unknown): value is LanguageCode {
  return typeof value === "string" && value in LANGUAGES;
}

// BCP-47 tags for browser speech APIs (Nigerian variants where they exist).
export const SPEECH_TAGS: Record<LanguageCode, string> = {
  en: "en-NG",
  ha: "ha-NG",
  ig: "ig-NG",
  yo: "yo-NG",
};
