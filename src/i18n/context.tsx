import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { translations } from './locales';
import type { Locale } from './locales';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// 检测浏览器语言
const detectLocale = (): Locale => {
  const browserLang = navigator.language || (navigator as any).userLanguage;
  const lang = browserLang.toLowerCase().split('-')[0];
  
  // 如果是中文（zh, zh-CN, zh-TW等），返回中文，否则返回英文
  if (lang === 'zh') {
    return 'zh';
  }
  return 'en';
};

// 从 localStorage 获取保存的语言设置
const getStoredLocale = (): Locale | null => {
  try {
    const stored = localStorage.getItem('chain-neural-locale');
    if (stored === 'zh' || stored === 'en') {
      return stored;
    }
    return null;
  } catch (error) {
    console.warn('localStorage not available', error);
    return null;
  }
};

// 获取嵌套对象的属性值
const getNestedValue = (obj: any, path: string): string => {
  try {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        console.warn(`Translation key not found: ${path}`);
        return path; // 如果找不到，返回原始路径
      }
    }
    return typeof value === 'string' ? value : path;
  } catch (error) {
    console.error(`Error getting translation for key: ${path}`, error);
    return path;
  }
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 优先使用保存的语言设置，否则检测浏览器语言
  const [locale, setLocaleState] = useState<Locale>(() => {
    return getStoredLocale() || detectLocale();
  });

  // 保存语言设置到 localStorage
  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('chain-neural-locale', newLocale);
    } catch (error) {
      console.warn('Failed to save locale to localStorage', error);
    }
  };

  // 翻译函数 - 使用 useCallback 确保稳定性
  const t = useCallback((key: string): string => {
    const translation = translations[locale];
    return getNestedValue(translation, key);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};

