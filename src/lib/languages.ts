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

// What the assistant replies in: a fixed language, or "auto" (the language of
// the question).
export type ReplyLanguage = LanguageCode | "auto";

export const REPLY_LANGUAGES: Record<ReplyLanguage, string> = {
  auto: "Same as my question",
  ...LANGUAGES,
};

export function isReplyLanguage(value: unknown): value is ReplyLanguage {
  return value === "auto" || isLanguage(value);
}

// BCP-47 tags for browser speech APIs (Nigerian variants where they exist).
export const SPEECH_TAGS: Record<LanguageCode, string> = {
  en: "en-NG",
  ha: "ha-NG",
  ig: "ig-NG",
  yo: "yo-NG",
};

// Rough guess of which of the four languages a text is in, from letters and
// common words unique to each. Used to label replies when the language is
// "auto", so they're read aloud with the right voice.
const LETTERS: Partial<Record<LanguageCode, RegExp>> = {
  ha: /[ƙɗɓƴƘƊƁ]/g,
  ig: /[ịụṅỊỤṄ]/g,
  yo: /[ẹṣẸṢ]|[àáèéìíòóùú]/g,
};

const WORDS: Record<LanguageCode, string[]> = {
  en: ["the", "and", "is", "are", "to", "of", "your", "you", "for", "it", "with", "this", "that", "be", "have", "how", "what", "my", "farm", "much", "many"],
  ha: ["da", "ne", "ce", "ba", "shi", "su", "wannan", "kuma", "don", "za", "cikin", "sosai", "kaji", "abinci", "yana", "suna", "zai", "amma", "kamar", "ina", "son", "yadda", "take", "gona", "nawa", "mene", "yaya", "ake", "akwai", "nake"],
  ig: ["nke", "bụ", "ga", "ndị", "gị", "dị", "nwere", "maka", "site", "ihe", "anụ", "ọkụkọ", "nri", "ka", "ma", "ya", "ha", "kwesịrị", "nwee", "kedu", "gịnị", "ole", "ugbo", "anyị", "enwere", "ugbu", "chọrọ", "ọ", "ị", "nwa", "nkezi"],
  yo: ["ni", "ati", "ti", "awọn", "mo", "si", "fun", "pe", "wa", "rẹ", "kan", "naa", "bi", "jẹ", "ṣe", "lati", "ko", "yin", "adiẹ", "ounjẹ", "o", "wọn", "bawo", "báwo", "kini", "kí", "melo", "oko", "mi"],
};

export function detectLanguage(text: string): LanguageCode {
  const lower = text.normalize("NFC").toLowerCase();
  const words = lower.split(/[^\p{L}']+/u).filter(Boolean);
  const scores = { en: 0, ha: 0, ig: 0, yo: 0 } as Record<LanguageCode, number>;
  for (const code of Object.keys(scores) as LanguageCode[]) {
    const set = new Set(WORDS[code]);
    scores[code] += words.filter((w) => set.has(w)).length;
    const letters = LETTERS[code];
    if (letters) scores[code] += (lower.match(letters)?.length ?? 0) * 2;
  }
  // ọ is shared by Igbo and Yoruba; it only tips a tie.
  const o = lower.match(/ọ/g)?.length ?? 0;
  if (scores.ig === scores.yo && o) scores.yo += 0.5;
  const best = (Object.keys(scores) as LanguageCode[]).reduce((a, b) => (scores[b] > scores[a] ? b : a), "en");
  return scores[best] > 0 ? best : "en";
}
