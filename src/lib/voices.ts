// YarnGPT voices for spoken replies, clearest and most stable first.
// Safe to import from client components. Keep in sync with scripts/tts_server.py.

import type { LanguageCode } from "./languages";

export type Voice = { id: string; label: string };

export const VOICES: Record<LanguageCode, Voice[]> = {
  en: [
    { id: "idera", label: "Idera (female)" },
    { id: "chinenye", label: "Chinenye (female)" },
    { id: "zainab", label: "Zainab (female)" },
    { id: "jude", label: "Jude (male)" },
    { id: "osagie", label: "Osagie (male)" },
  ],
  ha: [
    { id: "hausa_female1", label: "Female voice 1" },
    { id: "hausa_female2", label: "Female voice 2" },
    { id: "hausa_male2", label: "Male voice" },
  ],
  ig: [
    { id: "igbo_female2", label: "Female voice 1" },
    { id: "igbo_male2", label: "Male voice" },
    { id: "igbo_female1", label: "Female voice 2" },
  ],
  yo: [
    { id: "yoruba_male2", label: "Male voice" },
    { id: "yoruba_female2", label: "Female voice 1" },
    { id: "yoruba_female1", label: "Female voice 2" },
  ],
};

export type VoiceChoice = Record<LanguageCode, string>;

export const DEFAULT_VOICES: VoiceChoice = {
  en: VOICES.en[0].id,
  ha: VOICES.ha[0].id,
  ig: VOICES.ig[0].id,
  yo: VOICES.yo[0].id,
};

export function isVoice(language: LanguageCode, id: unknown): id is string {
  return VOICES[language].some((v) => v.id === id);
}

export function sanitizeVoices(value: unknown): VoiceChoice {
  const given = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_VOICES };
  for (const lang of Object.keys(out) as LanguageCode[]) {
    if (isVoice(lang, given[lang])) out[lang] = given[lang] as string;
  }
  return out;
}

// Short lines for trying a voice on the AI page.
export const VOICE_SAMPLES: Record<LanguageCode, string> = {
  en: "Good morning. Your broiler batch is growing well this week.",
  ha: "Barka da safiya. Kajin ku suna girma sosai a wannan makon.",
  ig: "Ụtụtụ ọma. Ọkụkọ gị na-eto nke ọma n'izu a.",
  yo: "Ẹ káàárọ̀. Àwọn adìyẹ yín ń dàgbà dáadáa ní ọ̀sẹ̀ yìí.",
};
