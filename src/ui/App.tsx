import { startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import backIcon from '../assets/icons/back.svg';
import chevronDownIcon from '../assets/icons/chevron-down.svg';
import filterIcon from '../assets/icons/filter.svg';
import helpIcon from '../assets/icons/help.svg';
import playIcon from '../assets/icons/play.svg';
import updateIcon from '../assets/icons/update.svg';
import {
  CUSTOM_MODEL_VALUE,
  DEEPL_FORMALITY_OPTIONS,
  getDefaultModelSelection,
  isAIProvider,
  isLanguageSupportedByProvider,
  LANGUAGES,
  OPENAI_DEFAULT_MODEL,
  PROVIDER_MODEL_OPTIONS,
  PROVIDERS,
  SOURCE_AUTO_VALUE,
  type AIProviderId,
  type ProviderId,
} from '../shared/languages';
import type {
  CollectionSummary,
  MainToUIMessage,
  StoredSettings,
  TranslateRequest,
  TranslationProgress,
  TranslationResult,
  UIToMainMessage,
} from '../shared/messages';

const DEFAULT_FORM: StoredSettings = {
  provider: 'openai',
  apiKeys: {},
  openAiModel: OPENAI_DEFAULT_MODEL,
  providerModelSelections: {
    openai: OPENAI_DEFAULT_MODEL,
    gemini: 'gemini-3.1-flash-lite-preview',
    'gemini-free': 'gemini-3.1-flash-lite-preview',
    claude: 'claude-sonnet-4-20250514',
  },
  providerCustomModels: {},
  collectionId: null,
  sourceModeId: null,
  sourceLanguage: SOURCE_AUTO_VALUE,
  targetLanguages: ['ja'],
  deepLFormality: 'default',
};

type Page = 'main' | 'settings';
type StatusTone = 'neutral' | 'ready' | 'success' | 'error' | 'progress';
const MAX_TARGET_LANGUAGES = 10;
const DEEPL_PROXY_URL =
  import.meta.env.VITE_DEEPL_PROXY_URL?.trim() || 'http://127.0.0.1:8787/deepl/translate';
const DEEPL_PROXY_IS_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(DEEPL_PROXY_URL);
const DEEPL_PROXY_HINT_MESSAGE = DEEPL_PROXY_IS_LOCAL
  ? 'DeepL is configured. Make sure "npm run deepl-proxy" is running before you translate.'
  : 'DeepL is configured. Ready to translate through your hosted proxy.';

const controlClassName =
  'vt-control h-9 w-full rounded-md border px-3 text-[11px] text-[var(--vt-text)] outline-none transition placeholder:text-[var(--vt-placeholder)]';

export default function App() {
  const [page, setPage] = useState<Page>('main');
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [form, setForm] = useState<StoredSettings>(DEFAULT_FORM);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [openTooltip, setOpenTooltip] = useState<'api-key' | 'formality' | null>(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: MainToUIMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }

      if (message.type === 'bootstrap') {
        startTransition(() => {
          setCollections(message.collections);
          setForm(normalizeForm(message.settings, message.collections));
        });
        setBootstrapped(true);
        setError(null);
        setProgress(null);
        return;
      }

      if (message.type === 'progress') {
        setProgress(message.progress);
        setError(null);
        setResult(null);
        setIsTranslating(true);
        return;
      }

      if (message.type === 'translation-complete') {
        startTransition(() => {
          setCollections(message.collections);
          setForm((previous) => normalizeForm(previous, message.collections));
        });
        setResult(message.result);
        setProgress(null);
        setError(null);
        setIsTranslating(false);
        setPage('main');
        return;
      }

      if (message.type === 'error') {
        setError(message.message);
        setProgress(null);
        setIsTranslating(false);
        setPage('main');
      }
    };

    window.addEventListener('message', handleMessage);
    sendMessage({ type: 'ui-ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!languageMenuRef.current) {
        return;
      }

      if (!languageMenuRef.current.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedCollection =
    collections.find((collection) => collection.id === form.collectionId) ?? collections[0];
  const selectedMode =
    selectedCollection?.modes.find((mode) => mode.id === form.sourceModeId) ??
    selectedCollection?.modes[0];
  const currentApiKey = form.apiKeys[form.provider] ?? '';
  const availableLanguages = LANGUAGES.filter((language) =>
    isLanguageSupportedByProvider(language.code, form.provider),
  );
  const providerDetails = PROVIDERS.find((provider) => provider.id === form.provider);
  const hasValidCollections = collections.length > 0;
  const explicitSourceLanguage =
    form.sourceLanguage === SOURCE_AUTO_VALUE ? null : LANGUAGES.find((language) => language.code === form.sourceLanguage) ?? null;
  const selectedTargetLanguages = availableLanguages.filter((language) =>
    form.targetLanguages.includes(language.code),
  );
  const translatableCount =
    selectedCollection && selectedMode
      ? selectedCollection.modeValueCounts[selectedMode.id] ?? 0
      : 0;
  const canReload = Boolean(result || error);
  const providerApiUrl = getProviderApiUrl(form.provider);
  const providerApiHelpLabel = getProviderApiHelpLabel(form.provider);
  const providerApiHelpCopy = getProviderApiHelpCopy(form.provider);
  const providerApiPlaceholder = getProviderApiPlaceholder(form.provider);
  const activeModelSelection = getActiveModelSelection(form);
  const activeCustomModel = form.providerCustomModels[form.provider] ?? '';
  const settingsValidation = getSettingsValidation(form);
  const canTranslate =
    Boolean(selectedCollection) &&
    Boolean(selectedMode) &&
    selectedTargetLanguages.length > 0 &&
    translatableCount > 0 &&
    !isTranslating &&
    settingsValidation.tone === 'success';

  const status = getStatusState({
    page,
    progress,
    error,
    result,
    currentApiKey,
    hasValidCollections,
    translatableCount,
    selectedLanguageCount: selectedTargetLanguages.length,
    providerLabel: providerDetails?.label ?? 'your provider',
    settingsValidation,
  });

  function updateForm(nextValue: Partial<StoredSettings>) {
    setForm((previous) => normalizeForm({ ...previous, ...nextValue }, collections));
  }

  function handleCollectionChange(collectionId: string) {
    const collection = collections.find((entry) => entry.id === collectionId);
    updateForm({
      collectionId,
      sourceModeId: collection?.defaultModeId ?? null,
    });
  }

  function handleProviderChange(provider: ProviderId) {
    const filteredTargets = form.targetLanguages.filter((code) =>
      isLanguageSupportedByProvider(code, provider),
    );
    const supportedTargets =
      filteredTargets.length > 0 ? filteredTargets : [availableFallbackLanguage(provider)];

    updateForm({
      provider,
      targetLanguages: explicitSourceLanguage
        ? supportedTargets.filter((code) => code !== explicitSourceLanguage.code)
        : supportedTargets,
    });
  }

  function handleApiKeyChange(value: string) {
    updateForm({
      apiKeys: {
        ...form.apiKeys,
        [form.provider]: value,
      },
    });
  }

  function handleReload() {
    setResult(null);
    setError(null);
    setProgress(null);
    sendMessage({ type: 'reload' });
  }

  function handleTranslate() {
    const cleanedTargetLanguages =
      explicitSourceLanguage
        ? form.targetLanguages.filter((code) => code !== explicitSourceLanguage.code)
        : form.targetLanguages;

    const payload: TranslateRequest = {
      ...form,
      collectionId: selectedCollection?.id ?? null,
      sourceModeId: selectedMode?.id ?? null,
      targetLanguages: cleanedTargetLanguages,
      openAiModel: resolveProviderModel(form),
      apiKey: currentApiKey.trim(),
    };

    setError(null);
    setResult(null);
    setProgress(null);
    setIsTranslating(true);
    sendMessage({ type: 'translate', payload });
  }

  function toggleTargetLanguage(languageCode: string) {
    if (explicitSourceLanguage?.code === languageCode) {
      return;
    }

    const alreadySelected = form.targetLanguages.includes(languageCode);

    if (alreadySelected) {
      updateForm({
        targetLanguages: form.targetLanguages.filter((code) => code !== languageCode),
      });
      return;
    }

    if (form.targetLanguages.length >= MAX_TARGET_LANGUAGES) {
      setError(`You can translate to up to ${MAX_TARGET_LANGUAGES} languages at once.`);
      return;
    }

    updateForm({
      targetLanguages: [...form.targetLanguages, languageCode],
    });
  }

  return (
    <main className="vt-shell">
      <div className="vt-window">
        {page === 'main' ? (
          <>
            <div className="vt-scroll vt-scroll-main">
              <div className="vt-page-body">
                <InstructionsBlock />

                <section className="vt-section-fields">
                  <Field label="Collection to translate">
                    <SelectControl
                      value={selectedCollection?.id ?? ''}
                      onChange={(event) => handleCollectionChange(event.target.value)}
                      disabled={!bootstrapped || !hasValidCollections}
                    >
                      {!hasValidCollections ? (
                        <option value="">No valid collection found</option>
                      ) : (
                        collections.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            {collection.name}
                          </option>
                        ))
                      )}
                    </SelectControl>
                  </Field>

                  {hasValidCollections ? (
                    <>
                      <Field label="Source Mode">
                        <SelectControl
                          value={selectedMode?.id ?? ''}
                          onChange={(event) => updateForm({ sourceModeId: event.target.value })}
                          disabled={!selectedCollection}
                        >
                          {selectedCollection?.modes.map((mode) => (
                            <option key={mode.id} value={mode.id}>
                              {mode.name}
                              {mode.isDefault ? ' · Default' : ''}
                            </option>
                          ))}
                        </SelectControl>
                      </Field>

                      <Field label="Input language">
                        <SelectControl
                          value={form.sourceLanguage}
                          onChange={(event) => updateForm({ sourceLanguage: event.target.value })}
                        >
                          <option value={SOURCE_AUTO_VALUE}>Detect Language</option>
                          {LANGUAGES.map((language) => (
                            <option key={language.code} value={language.code}>
                              {language.label}
                            </option>
                          ))}
                        </SelectControl>
                      </Field>

                      <Field label="Output languages">
                        <div className="vt-multiselect" ref={languageMenuRef}>
                          <button
                            type="button"
                            className={`${controlClassName} vt-multiselect-trigger text-left`}
                            onClick={() => setIsLanguageMenuOpen((current) => !current)}
                            aria-expanded={isLanguageMenuOpen}
                          >
                            <span className="vt-multiselect-summary">
                              {selectedTargetLanguages.length > 0
                                ? `${selectedTargetLanguages.length} language${selectedTargetLanguages.length > 1 ? 's' : ''} selected`
                                : 'Choose output languages'}
                            </span>
                            <span className="vt-select-chevron" aria-hidden="true">
                              <IconAsset src={chevronDownIcon} alt="" />
                            </span>
                          </button>

                          {isLanguageMenuOpen ? (
                            <div className="vt-multiselect-menu">
                              {availableLanguages.map((language) => {
                                const checked = form.targetLanguages.includes(language.code);
                                const disabled = explicitSourceLanguage?.code === language.code;

                                return (
                                  <label
                                    key={language.code}
                                    className={`vt-multiselect-option ${disabled ? 'is-disabled' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disabled}
                                      onChange={() => toggleTargetLanguage(language.code)}
                                    />
                                    <span>
                                      {language.label}
                                      {disabled ? ' · Source language' : ''}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        {selectedTargetLanguages.length > 0 ? (
                          <div className="vt-chip-list">
                            {selectedTargetLanguages.map((language) => (
                              <button
                                key={language.code}
                                type="button"
                                className="vt-chip"
                                onClick={() => toggleTargetLanguage(language.code)}
                              >
                                <span>{language.label}</span>
                                <span aria-hidden="true">×</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </Field>
                    </>
                  ) : null}
                </section>
              </div>

              <div className="vt-status-slot">
                <StatusBanner tone={status.tone}>{status.message}</StatusBanner>
              </div>
            </div>

            <footer className="vt-footer">
              <div className="vt-actions">
                <button
                  type="button"
                  className="vt-icon-button"
                  onClick={() => setPage('settings')}
                  aria-label="Open settings"
                >
                  <IconAsset src={filterIcon} alt="" />
                </button>

                <div className="vt-button-row">
                  <button
                    type="button"
                    className="vt-secondary-button"
                    onClick={handleReload}
                    disabled={isTranslating || !canReload}
                  >
                    <IconAsset src={updateIcon} alt="" />
                    <span>Reload</span>
                  </button>

                  <button
                    type="button"
                    className="vt-primary-button"
                    onClick={handleTranslate}
                    disabled={
                      !canTranslate
                    }
                  >
                    <IconAsset src={playIcon} alt="" />
                    <span>{isTranslating ? 'Translating…' : 'Translate Variables'}</span>
                  </button>
                </div>
              </div>

              <CreditBar />
            </footer>
          </>
        ) : (
          <>
            <div className="vt-scroll vt-scroll-main">
              <div className="vt-page-body">
                <section className="vt-section-fields">
                  <div className="vt-settings-topbar">
                    <button
                      type="button"
                      className="vt-inline-back"
                      onClick={() => setPage('main')}
                    >
                      <IconAsset src={backIcon} alt="" />
                      <span>Back</span>
                    </button>
                  </div>

                  <Field label="Translation Provider">
                    <div className="vt-provider-grid">
                      {PROVIDERS.map((provider) => {
                        const active = provider.id === form.provider;

                        return (
                          <button
                            key={provider.id}
                            type="button"
                            className={`vt-provider-chip ${active ? 'is-active' : ''}`}
                            onClick={() => handleProviderChange(provider.id)}
                            aria-pressed={active}
                          >
                            {provider.id === 'deepl-free' ? 'DeepL' : provider.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="API Key">
                    <div className="vt-input-with-icon">
                      <input
                        className={`${controlClassName} pr-8`}
                        type="password"
                        placeholder={providerApiPlaceholder}
                        value={currentApiKey}
                        onChange={(event) => handleApiKeyChange(event.target.value)}
                      />
                      <InfoTooltipButton
                        icon={helpIcon}
                        placement="input"
                        message="Your key is stored locally on this machine only."
                        isOpen={openTooltip === 'api-key'}
                        onOpen={() => setOpenTooltip('api-key')}
                        onClose={() =>
                          setOpenTooltip((current) => (current === 'api-key' ? null : current))
                        }
                      />
                    </div>
                  </Field>

                  <div className="vt-help-block">
                    <a
                      href={providerApiUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="vt-link"
                    >
                      {providerApiHelpLabel}
                    </a>
                    <p className="vt-help-copy">{providerApiHelpCopy}</p>
                  </div>

                  {isAIProvider(form.provider) ? (
                    <>
                      <Field label={getProviderModelLabel(form.provider)}>
                        <SelectControl
                          value={activeModelSelection}
                          onChange={(event) =>
                            updateForm({
                              providerModelSelections: {
                                ...form.providerModelSelections,
                                [form.provider]: event.target.value,
                              },
                            })
                          }
                        >
                          {PROVIDER_MODEL_OPTIONS[form.provider].map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectControl>
                      </Field>

                      {activeModelSelection === CUSTOM_MODEL_VALUE ? (
                        <Field label="Custom Model">
                          <input
                            className={controlClassName}
                            type="text"
                            placeholder={getProviderCustomModelPlaceholder(form.provider)}
                            value={activeCustomModel}
                            onChange={(event) =>
                              updateForm({
                                providerCustomModels: {
                                  ...form.providerCustomModels,
                                  [form.provider]: event.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      ) : null}
                    </>
                  ) : form.provider === 'deepl-free' || form.provider === 'deepl-pro' ? (
                    <Field label="Formality">
                      <div className="vt-input-with-double-icons">
                        <SelectControl
                          value={form.deepLFormality}
                          onChange={(event) =>
                            updateForm({
                              deepLFormality: event.target.value as StoredSettings['deepLFormality'],
                            })
                          }
                        >
                          {DEEPL_FORMALITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectControl>
                        <InfoTooltipButton
                          icon={helpIcon}
                          placement="input-help"
                          message="Formality controls the tone of translations for German, French, Italian, Spanish, Dutch, Polish, Portuguese, Japanese, and Russian. For other languages, DeepL will fall-back to the default tone when formality is not supported."
                          isOpen={openTooltip === 'formality'}
                          onOpen={() => setOpenTooltip('formality')}
                          onClose={() =>
                            setOpenTooltip((current) => (current === 'formality' ? null : current))
                          }
                        />
                      </div>
                    </Field>
                  ) : null}
                </section>
              </div>

              <div className="vt-status-slot">
                <StatusBanner tone={status.tone}>{status.message}</StatusBanner>
              </div>
            </div>

            <footer className="vt-footer vt-footer-settings">
              <CreditBar />
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function normalizeForm(incoming: StoredSettings, collections: CollectionSummary[]): StoredSettings {
  const collection = collections.find((entry) => entry.id === incoming.collectionId) ?? collections[0];
  const sourceModeId =
    collection?.modes.find((mode) => mode.id === incoming.sourceModeId)?.id ??
    collection?.defaultModeId ??
    null;
  const filteredTargetLanguages = incoming.targetLanguages.filter((code) =>
    isLanguageSupportedByProvider(code, incoming.provider),
  );
  const explicitSourceLanguage =
    incoming.sourceLanguage === SOURCE_AUTO_VALUE ? null : incoming.sourceLanguage;
  const targetLanguages =
    filteredTargetLanguages.length > 0
      ? filteredTargetLanguages
          .filter((code) => !explicitSourceLanguage || code !== explicitSourceLanguage)
          .slice(0, MAX_TARGET_LANGUAGES)
      : [availableFallbackLanguage(incoming.provider)];

  return {
    ...DEFAULT_FORM,
    ...incoming,
    collectionId: collection?.id ?? null,
    sourceModeId,
    targetLanguages,
  };
}

function availableFallbackLanguage(provider: ProviderId): string {
  return LANGUAGES.find((language) => isLanguageSupportedByProvider(language.code, provider))?.code ?? 'en';
}

function sendMessage(message: UIToMainMessage) {
  parent.postMessage({ pluginMessage: message }, '*');
}

function getStatusState(input: {
  page: Page;
  progress: TranslationProgress | null;
  error: string | null;
  result: TranslationResult | null;
  currentApiKey: string;
  hasValidCollections: boolean;
  translatableCount: number;
  selectedLanguageCount: number;
  providerLabel: string;
  settingsValidation: { tone: StatusTone; message: string };
}): { tone: StatusTone; message: string } {
  if (input.page === 'settings') {
    return input.settingsValidation;
  }

  if (input.progress) {
    return {
      tone: 'progress',
      message: `${input.progress.stage} (${Math.min(input.progress.completed + 1, input.progress.total)}/${input.progress.total})`,
    };
  }

  if (input.error) {
    return {
      tone: 'error',
      message: input.error,
    };
  }

  if (input.result) {
    return {
      tone: 'success',
      message: `${input.result.completedLanguageCount} mode${input.result.completedLanguageCount > 1 ? 's' : ''} translated · ${input.result.translatedCount} variables${input.result.skippedCount > 0 ? ` · ${input.result.skippedCount} skipped` : ''}${input.result.failedLanguageCount > 0 ? ` · ${input.result.failedLanguageCount} failed` : ''}`,
    };
  }

  if (!input.hasValidCollections) {
    return {
      tone: 'neutral',
      message: 'Make sure to have a collection with only String values.',
    };
  }

  if (input.settingsValidation.tone === 'error') {
    return input.settingsValidation;
  }

  if (input.selectedLanguageCount === 0) {
    return {
      tone: 'neutral',
      message: 'Choose at least one output language to continue.',
    };
  }

  if (!input.currentApiKey.trim()) {
    return {
      tone: 'neutral',
      message: `Configure ${input.providerLabel} in settings to continue.`,
    };
  }

  return {
    tone: 'ready',
    message: `${input.translatableCount} variables ready for ${input.selectedLanguageCount} output language${input.selectedLanguageCount > 1 ? 's' : ''} using ${input.providerLabel}`,
  };
}

function getActiveModelSelection(form: StoredSettings): string {
  return form.providerModelSelections[form.provider] ?? getDefaultModelSelection(form.provider);
}

function resolveProviderModel(form: StoredSettings): string {
  if (!isAIProvider(form.provider)) {
    return form.openAiModel.trim() || OPENAI_DEFAULT_MODEL;
  }

  const selection = getActiveModelSelection(form);
  if (selection === CUSTOM_MODEL_VALUE) {
    return form.providerCustomModels[form.provider]?.trim() ?? '';
  }

  return selection;
}

function getSettingsValidation(form: StoredSettings): { tone: StatusTone; message: string } {
  const providerLabel = getProviderDisplayName(form.provider);
  const apiKey = form.apiKeys[form.provider]?.trim() ?? '';

  if (!apiKey) {
    return {
      tone: 'neutral',
      message: `Add your ${providerLabel} API key.`,
    };
  }

  const keyValidation = validateApiKey(form.provider, apiKey);
  if (!keyValidation.valid) {
    return {
      tone: 'error',
      message: keyValidation.message,
    };
  }

  if (form.provider === 'deepl-free' || form.provider === 'deepl-pro') {
    return {
      tone: 'success',
      message: DEEPL_PROXY_HINT_MESSAGE,
    };
  }

  if (isAIProvider(form.provider)) {
    const resolvedModel = resolveProviderModel(form);
    if (!resolvedModel) {
      return {
        tone: 'error',
        message: `Add a custom ${getProviderModelLabel(form.provider).toLowerCase()} to continue.`,
      };
    }
  }

  if (form.targetLanguages.length === 0) {
    return {
      tone: 'neutral',
      message: 'Choose at least one output language.',
    };
  }

  if (form.targetLanguages.length > MAX_TARGET_LANGUAGES) {
    return {
      tone: 'error',
      message: `You can translate to up to ${MAX_TARGET_LANGUAGES} languages at once.`,
    };
  }

  return {
    tone: 'success',
    message: `${providerLabel} is configured. Ready to translate.`,
  };
}

function validateApiKey(provider: ProviderId, apiKey: string): { valid: boolean; message: string } {
  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-proj-')
        ? { valid: true, message: '' }
        : { valid: false, message: 'OpenAI key format looks invalid.' };
    case 'gemini':
    case 'gemini-free':
      return /^[A-Za-z0-9_-]{24,}$/.test(apiKey)
        ? { valid: true, message: '' }
        : { valid: false, message: 'Gemini key format looks invalid.' };
    case 'claude':
      return apiKey.startsWith('sk-ant-api')
        ? { valid: true, message: '' }
        : { valid: false, message: 'Claude key format looks invalid.' };
    case 'deepl-free':
    case 'deepl-pro':
      return apiKey.length >= 12
        ? { valid: true, message: '' }
        : { valid: false, message: 'DeepL key format looks invalid.' };
    default:
      return { valid: true, message: '' };
  }
}

function InstructionsBlock() {
  return (
    <section className="vt-instructions">
      <p className="vt-copy">
        Please select a variable collection that only contains String variables.
      </p>
      <a
        className="vt-link"
        href="https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma"
        target="_blank"
        rel="noreferrer"
      >
        Learn more about Figma Variables ↗
      </a>
    </section>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="vt-field">
      <span className="vt-label">{props.label}</span>
      {props.children}
    </label>
  );
}

function SelectControl(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode },
) {
  const { children, className, ...rest } = props;

  return (
    <div className="vt-select-wrap">
      <select className={`${controlClassName} ${className ?? ''}`.trim()} {...rest}>
        {children}
      </select>
      <span className="vt-select-chevron" aria-hidden="true">
        <IconAsset src={chevronDownIcon} alt="" />
      </span>
    </div>
  );
}

function StatusBanner(props: { tone: StatusTone; children: ReactNode }) {
  return <div className={`vt-status is-${props.tone}`}>{props.children}</div>;
}

function InfoTooltipButton(props: {
  icon: string;
  message: string;
  isOpen: boolean;
  placement?: 'input' | 'input-help';
  onOpen: () => void;
  onClose: () => void;
}) {
  const placementClassName =
    props.placement === 'input-help' ? 'vt-input-icon vt-input-icon-help' : 'vt-input-icon';

  return (
    <button
      type="button"
      className={`${placementClassName} vt-info-button`}
      aria-label="Show help information"
      aria-expanded={props.isOpen}
      onMouseEnter={props.onOpen}
      onMouseLeave={props.onClose}
      onFocus={props.onOpen}
      onBlur={props.onClose}
      onClick={() => (props.isOpen ? props.onClose() : props.onOpen())}
    >
      <IconAsset src={props.icon} alt="" />
      {props.isOpen ? <span className="vt-tooltip">{props.message}</span> : null}
    </button>
  );
}

function CreditBar() {
  return (
    <div className="vt-credit-bar">
      <span>Built by mrstev3n</span>
    </div>
  );
}

function IconAsset(props: { src: string; alt: string }) {
  return (
    <img className="vt-icon-asset" src={props.src} alt={props.alt} />
  );
}

function getProviderApiPlaceholder(provider: ProviderId): string {
  switch (provider) {
    case 'deepl-free':
      return 'DeepL Free key';
    case 'deepl-pro':
      return 'DeepL Pro key';
    case 'gemini':
    case 'gemini-free':
      return 'AlfsdfERFdsfSDf4dsFs2df3dSdfS-FewD4Sa6';
    case 'claude':
      return 'sk-ant-api03-XXX';
    case 'openai':
    default:
      return 'sk-proj-XXX';
  }
}

function getProviderDisplayName(provider: ProviderId): string {
  switch (provider) {
    case 'deepl-free':
      return 'DeepL';
    case 'deepl-pro':
      return 'DeepL Pro';
    case 'gemini':
      return 'Gemini';
    case 'gemini-free':
      return 'Gemini Free';
    case 'claude':
      return 'Claude';
    case 'openai':
    default:
      return 'OpenAI';
  }
}

function getProviderModelLabel(provider: AIProviderId): string {
  switch (provider) {
    case 'gemini':
    case 'gemini-free':
      return 'Gemini Model';
    case 'claude':
      return 'Anthropic Model';
    case 'openai':
    default:
      return 'OpenAI Model';
  }
}

function getProviderCustomModelPlaceholder(provider: AIProviderId): string {
  switch (provider) {
    case 'gemini':
    case 'gemini-free':
      return 'gemini-2.5-flash-exp';
    case 'claude':
      return 'claude-custom-model';
    case 'openai':
    default:
      return 'gpt-custom-model';
  }
}

function getProviderApiUrl(provider: ProviderId): string {
  switch (provider) {
    case 'deepl-free':
    case 'deepl-pro':
      return 'https://www.deepl.com/pro#developer';
    case 'gemini':
    case 'gemini-free':
      return 'https://aistudio.google.com/app/apikey';
    case 'claude':
      return 'https://console.anthropic.com/settings/keys';
    case 'openai':
    default:
      return 'https://platform.openai.com/api-keys';
  }
}

function getProviderApiHelpLabel(provider: ProviderId): string {
  switch (provider) {
    case 'deepl-free':
      return 'Get your own DeepL free API Key ↗';
    case 'deepl-pro':
      return 'Get your own DeepL Pro API Key ↗';
    case 'gemini':
    case 'gemini-free':
      return 'Create your Gemini API Key ↗';
    case 'claude':
      return 'Create your Claude API Key ↗';
    case 'openai':
    default:
      return 'Create your OpenAI API Key ↗';
  }
}

function getProviderApiHelpCopy(provider: ProviderId): string {
  switch (provider) {
    case 'deepl-free':
      return DEEPL_PROXY_IS_LOCAL
        ? `You'll be directed to DeepL to sign up for a free API key. Select "DeepL API Free" and follow the steps. Then start the local proxy with "npm run deepl-proxy".`
        : 'You are using a hosted DeepL proxy. Add your DeepL Free key here and the proxy will forward the translation request securely.';
    case 'deepl-pro':
      return DEEPL_PROXY_IS_LOCAL
        ? 'Create or retrieve a DeepL API Pro key, then paste it here. Then start the local proxy with "npm run deepl-proxy".'
        : 'You are using a hosted DeepL proxy. Add your DeepL Pro key here and the proxy will forward the translation request securely.';
    case 'gemini':
      return 'Create a Gemini Developer API key in Google AI Studio, then paste it here to enable Gemini translations.';
    case 'gemini-free':
      return 'Create a Gemini Developer API key in Google AI Studio and use the free-tier limits to run Gemini translations.';
    case 'claude':
      return 'Create an Anthropic API key in the Claude console, then paste it here to enable Claude translations.';
    case 'openai':
    default:
      return 'Generate a secret key in your OpenAI dashboard, then paste it here to enable translations.';
  }
}
