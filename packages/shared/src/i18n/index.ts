import { en } from "./locales/en";
import { ko } from "./locales/ko";

export type SupportedLang = "en" | "ko";
export type TranslationKey = keyof typeof en;

const locales: Record<SupportedLang, typeof en> = { en, ko };

let currentLang: SupportedLang = "en";

export function setLang(lang: SupportedLang) {
  currentLang = lang;
}

export function getLang(): SupportedLang {
  return currentLang;
}

export function t(key: TranslationKey, ...args: any[]): string {
  const value = locales[currentLang][key];
  if (typeof value === "function") {
    return (value as (...a: any[]) => string)(...args);
  }
  return value as string;
}

export { en, ko };
