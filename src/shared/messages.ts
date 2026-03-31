import type { DeepLFormalityOption, LanguageCode, ProviderId } from './languages';

export type CollectionModeSummary = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type CollectionSummary = {
  id: string;
  name: string;
  defaultModeId: string;
  stringVariableCount: number;
  ignoredVariableCount: number;
  modeValueCounts: Record<string, number>;
  modes: CollectionModeSummary[];
};

export type StoredSettings = {
  provider: ProviderId;
  apiKeys: Partial<Record<ProviderId, string>>;
  openAiModel: string;
  providerModelSelections: Partial<Record<ProviderId, string>>;
  providerCustomModels: Partial<Record<ProviderId, string>>;
  collectionId: string | null;
  sourceModeId: string | null;
  sourceLanguage: LanguageCode | 'auto';
  targetLanguages: LanguageCode[];
  deepLFormality: DeepLFormalityOption;
};

export type TranslateRequest = StoredSettings & {
  apiKey: string;
};

export type TranslationProgress = {
  stage: string;
  completed: number;
  total: number;
};

export type TranslationResult = {
  collectionName: string;
  sourceModeName: string;
  targetModeNames: string[];
  translatedCount: number;
  skippedCount: number;
  createdModeCount: number;
  completedLanguageCount: number;
  failedLanguageCount: number;
  providerLabel: string;
};

export type UIToMainMessage =
  | { type: 'ui-ready' }
  | { type: 'close' }
  | { type: 'reload' }
  | { type: 'translate'; payload: TranslateRequest };

export type MainToUIMessage =
  | { type: 'bootstrap'; collections: CollectionSummary[]; settings: StoredSettings }
  | { type: 'progress'; progress: TranslationProgress }
  | { type: 'error'; message: string }
  | { type: 'translation-complete'; result: TranslationResult; collections: CollectionSummary[] };
