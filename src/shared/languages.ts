export type ProviderId = 'deepl-free' | 'deepl-pro' | 'openai' | 'gemini-free' | 'gemini' | 'claude';
export type LanguageCode = string;
export type DeepLFormalityOption = 'default' | 'prefer_more' | 'prefer_less';
export type AIProviderId = 'openai' | 'gemini-free' | 'gemini' | 'claude';
export const CUSTOM_MODEL_VALUE = 'custom';

export type LanguageOption = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  openAiLabel: string;
  deeplSourceCode?: string;
  deeplTargetCode?: string;
};

export const SOURCE_AUTO_VALUE = 'auto';
export const OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
export const GEMINI_FREE_DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_LOW_COST_MODEL = 'claude-3-5-haiku-latest';
export const DEEPL_FORMALITY_OPTIONS: Array<{
  value: DeepLFormalityOption;
  label: string;
}> = [
  { value: 'default', label: 'Default' },
  { value: 'prefer_more', label: 'Prefer More Formal' },
  { value: 'prefer_less', label: 'Prefer Less Formal' },
];

export const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  description: string;
}> = [
  {
    id: 'deepl-free',
    label: 'DeepL Free',
    description: 'Uses api-free.deepl.com for personal or free-tier keys.',
  },
  {
    id: 'deepl-pro',
    label: 'DeepL Pro',
    description: 'Uses api.deepl.com for paid DeepL API keys.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Flexible AI translation with broader language coverage.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini Developer API with higher-capability default model.',
  },
  {
    id: 'gemini-free',
    label: 'Gemini Free',
    description: 'Google AI Studio / Gemini API free-tier oriented setup.',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Anthropic Claude Messages API for high-quality text translation.',
  },
];

export const PROVIDER_MODEL_OPTIONS: Record<
  AIProviderId,
  Array<{ value: string; label: string }>
> = {
  openai: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (Default)' },
    { value: 'gpt-5.4-nano', label: 'gpt-5.4-nano (Low cost)' },
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5-nano', label: 'gpt-5-nano' },
    { value: 'gpt-5.2', label: 'gpt-5.2' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-4.1', label: 'gpt-4.1' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: CUSTOM_MODEL_VALUE, label: 'Custom' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'gemini-3.1-flash-lite-preview (Default)' },
    { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (Low cost)' },
    { value: 'gemini-3.1-flash-preview', label: 'gemini-3.1-flash-preview' },
    { value: 'gemini-3.1-flash', label: 'gemini-3.1-flash' },
    { value: CUSTOM_MODEL_VALUE, label: 'Custom' },
  ],
  'gemini-free': [
    { value: 'gemini-3.1-flash-lite-preview', label: 'gemini-3.1-flash-lite-preview (Default)' },
    { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (Low cost)' },
    { value: 'gemini-3.1-flash-preview', label: 'gemini-3.1-flash-preview' },
    { value: CUSTOM_MODEL_VALUE, label: 'Custom' },
  ],
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4 (Default)' },
    { value: 'claude-3-5-haiku-latest', label: 'claude-3.5-haiku (Low cost)' },
    { value: CUSTOM_MODEL_VALUE, label: 'Custom' },
  ],
};

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', openAiLabel: 'English', deeplSourceCode: 'EN', deeplTargetCode: 'EN-US' },
  { code: 'fr', label: 'French', nativeLabel: 'Francais', openAiLabel: 'French', deeplSourceCode: 'FR', deeplTargetCode: 'FR' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Espanol', openAiLabel: 'Spanish', deeplSourceCode: 'ES', deeplTargetCode: 'ES' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', openAiLabel: 'German', deeplSourceCode: 'DE', deeplTargetCode: 'DE' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', openAiLabel: 'Italian', deeplSourceCode: 'IT', deeplTargetCode: 'IT' },
  { code: 'pt', label: 'Portuguese (Brazil)', nativeLabel: 'Portugues (Brasil)', openAiLabel: 'Brazilian Portuguese', deeplSourceCode: 'PT', deeplTargetCode: 'PT-BR' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', openAiLabel: 'Dutch', deeplSourceCode: 'NL', deeplTargetCode: 'NL' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', openAiLabel: 'Polish', deeplSourceCode: 'PL', deeplTargetCode: 'PL' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska', openAiLabel: 'Swedish', deeplSourceCode: 'SV', deeplTargetCode: 'SV' },
  { code: 'da', label: 'Danish', nativeLabel: 'Dansk', openAiLabel: 'Danish', deeplSourceCode: 'DA', deeplTargetCode: 'DA' },
  { code: 'nb', label: 'Norwegian', nativeLabel: 'Norsk', openAiLabel: 'Norwegian Bokmal', deeplSourceCode: 'NB', deeplTargetCode: 'NB' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi', openAiLabel: 'Finnish', deeplSourceCode: 'FI', deeplTargetCode: 'FI' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Cestina', openAiLabel: 'Czech', deeplSourceCode: 'CS', deeplTargetCode: 'CS' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Turkce', openAiLabel: 'Turkish', deeplSourceCode: 'TR', deeplTargetCode: 'TR' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Ukrainska', openAiLabel: 'Ukrainian', deeplSourceCode: 'UK', deeplTargetCode: 'UK' },
  { code: 'ja', label: 'Japanese', nativeLabel: 'Nihongo', openAiLabel: 'Japanese', deeplSourceCode: 'JA', deeplTargetCode: 'JA' },
  { code: 'ko', label: 'Korean', nativeLabel: 'Hangugeo', openAiLabel: 'Korean' },
  { code: 'zh-hans', label: 'Chinese (Simplified)', nativeLabel: 'Jian ti zhong wen', openAiLabel: 'Simplified Chinese', deeplSourceCode: 'ZH', deeplTargetCode: 'ZH-HANS' },
  { code: 'zh-hant', label: 'Chinese (Traditional)', nativeLabel: 'Fan ti zhong wen', openAiLabel: 'Traditional Chinese', deeplSourceCode: 'ZH', deeplTargetCode: 'ZH-HANT' },
];

export function getLanguageByCode(code: LanguageCode): LanguageOption | undefined {
  return LANGUAGES.find((language) => language.code === code);
}

export function getProviderById(providerId: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === providerId);
}

export function isLanguageSupportedByProvider(code: LanguageCode, providerId: ProviderId): boolean {
  const language = getLanguageByCode(code);
  if (!language) {
    return false;
  }

  if (providerId === 'openai' || providerId === 'gemini' || providerId === 'gemini-free' || providerId === 'claude') {
    return true;
  }

  return Boolean(language.deeplTargetCode);
}

export function isAIProvider(providerId: ProviderId): providerId is AIProviderId {
  return (
    providerId === 'openai' ||
    providerId === 'gemini' ||
    providerId === 'gemini-free' ||
    providerId === 'claude'
  );
}

export function getDefaultModelSelection(providerId: ProviderId): string {
  switch (providerId) {
    case 'openai':
      return OPENAI_DEFAULT_MODEL;
    case 'gemini':
      return GEMINI_DEFAULT_MODEL;
    case 'gemini-free':
      return GEMINI_DEFAULT_MODEL;
    case 'claude':
      return CLAUDE_DEFAULT_MODEL;
    default:
      return '';
  }
}
