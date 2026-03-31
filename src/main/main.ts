import {
  CLAUDE_DEFAULT_MODEL,
  GEMINI_DEFAULT_MODEL,
  GEMINI_FREE_DEFAULT_MODEL,
  getDefaultModelSelection,
  getLanguageByCode,
  getProviderById,
  isAIProvider,
  isLanguageSupportedByProvider,
  LANGUAGES,
  OPENAI_DEFAULT_MODEL,
  SOURCE_AUTO_VALUE,
  type LanguageOption,
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

const STORAGE_KEY = 'variable-translation-settings';
const MAX_TARGET_LANGUAGES = 10;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEEPL_PROXY_ENDPOINT =
  import.meta.env.VITE_DEEPL_PROXY_URL?.trim() || 'http://127.0.0.1:8787/deepl/translate';
const DEEPL_PROXY_IS_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(DEEPL_PROXY_ENDPOINT);
const DEEPL_PROXY_UNAVAILABLE_MESSAGE =
  DEEPL_PROXY_IS_LOCAL
    ? 'DeepL proxy is not reachable. Start it with "npm run deepl-proxy" before using DeepL in Figma.'
    : 'DeepL proxy is not reachable. Check your deployed proxy URL and make sure the service is online.';
type JsonResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};
const DEFAULT_SETTINGS: StoredSettings = {
  provider: 'openai',
  apiKeys: {},
  openAiModel: OPENAI_DEFAULT_MODEL,
  providerModelSelections: {
    openai: OPENAI_DEFAULT_MODEL,
    gemini: GEMINI_DEFAULT_MODEL,
    'gemini-free': GEMINI_FREE_DEFAULT_MODEL,
    claude: CLAUDE_DEFAULT_MODEL,
  },
  providerCustomModels: {},
  collectionId: null,
  sourceModeId: null,
  sourceLanguage: SOURCE_AUTO_VALUE,
  targetLanguages: ['ja'],
  deepLFormality: 'default',
};

let uiReady = false;

export default function () {
  figma.showUI(__html__, {
    width: 312,
    height: 640,
    themeColors: true,
  });

  figma.ui.onmessage = (message: UIToMainMessage) => {
    void handleMessage(message);
  };
}

async function handleMessage(message: UIToMainMessage): Promise<void> {
  try {
    if (message.type === 'ui-ready') {
      uiReady = true;
      await postBootstrap();
      return;
    }

    if (message.type === 'reload') {
      await postBootstrap();
      return;
    }

    if (message.type === 'close') {
      figma.closePlugin();
      return;
    }

    if (message.type === 'translate') {
      await translateCollection(message.payload);
    }
  } catch (error) {
    const description = getErrorMessage(error);
    figma.notify(description, { error: true });
    postToUI({ type: 'error', message: description });
  }
}

async function postBootstrap(): Promise<void> {
  const [collections, settings] = await Promise.all([
    getCollectionSummaries(),
    loadSettings(),
  ]);

  postToUI({
    type: 'bootstrap',
    collections,
    settings: normalizeSettings(settings, collections),
  });
}

async function getCollectionSummaries(): Promise<CollectionSummary[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const summaries = await Promise.all(collections.map((collection) => summarizeCollection(collection)));
  return summaries.filter((summary) => summary.stringVariableCount > 0);
}

async function summarizeCollection(collection: VariableCollection): Promise<CollectionSummary> {
  const variables = await Promise.all(
    collection.variableIds.map((variableId) => figma.variables.getVariableByIdAsync(variableId)),
  );

  const modeValueCounts: Record<string, number> = {};
  for (const mode of collection.modes) {
    modeValueCounts[mode.modeId] = 0;
  }

  let stringVariableCount = 0;
  let ignoredVariableCount = 0;

  for (const variable of variables) {
    if (!variable) {
      continue;
    }

    if (variable.resolvedType !== 'STRING') {
      ignoredVariableCount += 1;
      continue;
    }

    stringVariableCount += 1;

    for (const mode of collection.modes) {
      if (typeof variable.valuesByMode[mode.modeId] === 'string') {
        modeValueCounts[mode.modeId] += 1;
      }
    }
  }

  return {
    id: collection.id,
    name: collection.name,
    defaultModeId: collection.defaultModeId,
    stringVariableCount,
    ignoredVariableCount,
    modeValueCounts,
    modes: collection.modes.map((mode) => ({
      id: mode.modeId,
      name: mode.name,
      isDefault: mode.modeId === collection.defaultModeId,
    })),
  };
}

async function translateCollection(request: TranslateRequest): Promise<void> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(request.collectionId ?? '');
  if (!collection) {
    throw new Error('The selected variable collection could not be loaded.');
  }

  const sourceModeId = request.sourceModeId ?? collection.defaultModeId;
  const sourceMode = collection.modes.find((mode) => mode.modeId === sourceModeId);
  if (!sourceMode) {
    throw new Error('The selected source mode could not be found.');
  }

  let detectedSourceLanguage: LanguageOption | undefined;
  const sourceLanguage =
    request.sourceLanguage === SOURCE_AUTO_VALUE
      ? undefined
      : getLanguageByCode(request.sourceLanguage);

  const translatableEntries: Array<{ variable: Variable; text: string }> = [];
  let skippedCount = 0;

  const variables = await Promise.all(
    collection.variableIds.map((variableId) => figma.variables.getVariableByIdAsync(variableId)),
  );

  for (const variable of variables) {
    if (!variable || variable.resolvedType !== 'STRING') {
      continue;
    }

    const sourceValue = variable.valuesByMode[sourceModeId];
    if (typeof sourceValue !== 'string') {
      skippedCount += 1;
      continue;
    }

    translatableEntries.push({ variable, text: sourceValue });
  }

  if (translatableEntries.length === 0) {
    throw new Error(`No string values were found in the "${sourceMode.name}" mode.`);
  }

  if (!sourceLanguage) {
    detectedSourceLanguage = await detectSourceLanguage(
      translatableEntries
        .map((entry) => entry.text)
        .filter((text) => text.trim().length > 0),
      {
        provider: request.provider,
        apiKey: request.apiKey.trim(),
        openAiModel: resolveProviderModel(request),
        targetLanguage: getLanguageByCode(request.targetLanguages[0] ?? '') ?? LANGUAGES[0],
        deepLFormality: request.deepLFormality,
      },
    );
  }

  const effectiveInputLanguage = sourceLanguage ?? detectedSourceLanguage;
  const targetLanguages = [...new Set(request.targetLanguages)]
    .map((code) => getLanguageByCode(code))
    .filter((language): language is LanguageOption => Boolean(language));
  const filteredTargetLanguages = effectiveInputLanguage
    ? targetLanguages.filter((language) => language.code !== effectiveInputLanguage.code)
    : targetLanguages;

  if (filteredTargetLanguages.length === 0) {
    throw new Error('Choose at least one output language before starting the translation.');
  }

  if (filteredTargetLanguages.length > MAX_TARGET_LANGUAGES) {
    throw new Error(`You can translate to up to ${MAX_TARGET_LANGUAGES} languages at once.`);
  }

  for (const targetLanguage of filteredTargetLanguages) {
    if (!isLanguageSupportedByProvider(targetLanguage.code, request.provider)) {
      const provider = getProviderById(request.provider);
      throw new Error(
        `${targetLanguage.label} is not available for ${provider?.label ?? 'the selected provider'}.`,
      );
    }
  }

  if (!request.apiKey.trim()) {
    throw new Error('Add an API key before starting the translation.');
  }

  const selectedModel = resolveProviderModel(request);
  if (isAIProvider(request.provider) && !selectedModel) {
    throw new Error('Select a valid model before starting the translation.');
  }

  postProgress({ stage: 'Preparing string variables', completed: 0, total: 1 });

  const successfulTranslations: Array<{
    targetLanguage: LanguageOption;
    targetModeName: string;
    translatedCount: number;
    skippedCount: number;
    createdMode: boolean;
  }> = [];
  let firstTranslationError: string | null = null;

  for (let languageIndex = 0; languageIndex < filteredTargetLanguages.length; languageIndex += 1) {
    const targetLanguage = filteredTargetLanguages[languageIndex];

    try {
      const result = await translateCollectionToLanguage({
        collection,
        sourceModeId,
        translatableEntries,
        baseSkippedCount: skippedCount,
        request,
        selectedModel,
        sourceLanguage: effectiveInputLanguage,
        targetLanguage,
        languageIndex,
        languageTotal: filteredTargetLanguages.length,
      });

      successfulTranslations.push({
        targetLanguage,
        targetModeName: result.targetModeName,
        translatedCount: result.translatedCount,
        skippedCount: result.skippedCount,
        createdMode: result.createdMode,
      });
    } catch (error) {
      firstTranslationError ??= getErrorMessage(error);
    }
  }

  if (successfulTranslations.length === 0) {
    throw new Error(firstTranslationError ?? 'The provider could not translate any selected language.');
  }

  const translatedCount = successfulTranslations.reduce((sum, item) => sum + item.translatedCount, 0);
  const skippedTotal = successfulTranslations.reduce((sum, item) => sum + item.skippedCount, 0);
  const createdModeCount = successfulTranslations.filter((item) => item.createdMode).length;
  const effectiveSourceLanguage =
    effectiveInputLanguage ??
    (shouldAutoRenameSourceMode(sourceMode.name)
      ? await detectSourceLanguage(
          translatableEntries
            .map((entry) => entry.text)
            .filter((text) => text.trim().length > 0),
          {
            provider: request.provider,
            apiKey: request.apiKey.trim(),
            openAiModel: selectedModel,
            targetLanguage: successfulTranslations[0].targetLanguage,
            deepLFormality: request.deepLFormality,
          },
        )
      : undefined);
  const sourceModeName =
    maybeRenameSourceMode(collection, sourceModeId, effectiveSourceLanguage) ?? sourceMode.name;

  await saveSettings(request);

  const provider = getProviderById(request.provider);
  const result: TranslationResult = {
    collectionName: collection.name,
    sourceModeName,
    targetModeNames: successfulTranslations.map((item) => item.targetModeName),
    translatedCount,
    skippedCount: skippedTotal,
    createdModeCount,
    completedLanguageCount: successfulTranslations.length,
    failedLanguageCount: filteredTargetLanguages.length - successfulTranslations.length,
    providerLabel: provider?.label ?? request.provider,
  };

  const successLabel =
    createdModeCount > 0
      ? `Created ${createdModeCount} mode${createdModeCount > 1 ? 's' : ''}`
      : `Updated ${successfulTranslations.length} mode${successfulTranslations.length > 1 ? 's' : ''}`;
  figma.notify(
    skippedTotal > 0 || result.failedLanguageCount > 0
      ? `${successLabel}: ${translatedCount} translated, ${skippedTotal} skipped${result.failedLanguageCount > 0 ? `, ${result.failedLanguageCount} failed` : ''}.`
      : `${successLabel} with ${translatedCount} translated variables.`,
  );

  postToUI({
    type: 'translation-complete',
    result,
    collections: await getCollectionSummaries(),
  });
}

async function translateCollectionToLanguage(input: {
  collection: VariableCollection;
  sourceModeId: string;
  translatableEntries: Array<{ variable: Variable; text: string }>;
  baseSkippedCount: number;
  request: TranslateRequest;
  selectedModel: string;
  sourceLanguage?: LanguageOption;
  targetLanguage: LanguageOption;
  languageIndex: number;
  languageTotal: number;
}): Promise<{ targetModeName: string; translatedCount: number; skippedCount: number; createdMode: boolean }> {
  const { collection, sourceModeId, translatableEntries, baseSkippedCount, request, selectedModel, sourceLanguage, targetLanguage, languageIndex, languageTotal } = input;

  const { modeId: targetModeId, modeName: targetModeName, createdMode } = ensureTargetMode(
    collection,
    sourceModeId,
    targetLanguage,
  );

  const copiedEntries = translatableEntries.filter((entry) => entry.text.trim().length === 0);
  const apiEntries = translatableEntries.filter((entry) => entry.text.trim().length > 0);
  const translationMap = new Map<string, string>();
  let skippedCount = baseSkippedCount;
  let appliedApiCount = 0;
  let firstTranslationError: string | null = null;

  try {
    const uniqueTexts = [...new Set(apiEntries.map((entry) => entry.text))];
    const chunks = chunkTexts(uniqueTexts, request.provider === 'openai' ? 20 : 40, 5000);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      postProgress({
        stage: `${targetLanguage.label} · batch ${index + 1} of ${chunks.length} (${languageIndex + 1}/${languageTotal})`,
        completed: index,
        total: chunks.length,
      });

      try {
        const translatedChunk = await translateTexts(chunk, {
          provider: request.provider,
          apiKey: request.apiKey.trim(),
          openAiModel: selectedModel,
          sourceLanguage,
          targetLanguage,
          deepLFormality: request.deepLFormality,
        });

        chunk.forEach((sourceText, chunkIndex) => {
          translationMap.set(sourceText, translatedChunk[chunkIndex] ?? sourceText);
        });
      } catch (error) {
        firstTranslationError ??= getErrorMessage(error);
        skippedCount += chunk.length;
      }
    }

    if (apiEntries.length > 0 && translationMap.size === 0) {
      throw new Error(firstTranslationError ?? `The provider could not translate ${targetLanguage.label}.`);
    }

    for (const entry of copiedEntries) {
      entry.variable.setValueForMode(targetModeId, entry.text);
    }

    for (const entry of apiEntries) {
      const translated = translationMap.get(entry.text);
      if (!translated) {
        skippedCount += 1;
        continue;
      }

      entry.variable.setValueForMode(targetModeId, translated);
      appliedApiCount += 1;
    }
  } catch (error) {
    if (createdMode) {
      collection.removeMode(targetModeId);
    }

    throw error;
  }

  return {
    targetModeName,
    translatedCount: copiedEntries.length + appliedApiCount,
    skippedCount,
    createdMode,
  };
}

function ensureTargetMode(
  collection: VariableCollection,
  sourceModeId: string,
  targetLanguage: LanguageOption,
): { modeId: string; modeName: string; createdMode: boolean } {
  const normalizedTargetName = normalizeModeName(targetLanguage.label);

  const existingMode = collection.modes.find(
    (mode) => normalizeModeName(mode.name) === normalizedTargetName,
  );

  if (existingMode) {
    if (existingMode.modeId === sourceModeId) {
      throw new Error('The source mode already matches the target language. Choose another mode or language.');
    }

    return {
      modeId: existingMode.modeId,
      modeName: existingMode.name,
      createdMode: false,
    };
  }

  try {
    const modeId = collection.addMode(targetLanguage.label);
    return {
      modeId,
      modeName: targetLanguage.label,
      createdMode: true,
    };
  } catch (error) {
    throw new Error(getModeCreationErrorMessage(error, collection.modes.length, targetLanguage.label));
  }
}

function maybeRenameSourceMode(
  collection: VariableCollection,
  sourceModeId: string,
  sourceLanguage?: LanguageOption,
): string | null {
  if (!sourceLanguage) {
    return null;
  }

  const desiredName = sourceLanguage.label;
  const normalizedDesiredName = normalizeModeName(desiredName);
  const sourceMode = collection.modes.find((mode) => mode.modeId === sourceModeId);

  if (!sourceMode) {
    return null;
  }

  if (normalizeModeName(sourceMode.name) === normalizedDesiredName) {
    return sourceMode.name;
  }

  const conflictingMode = collection.modes.find(
    (mode) => mode.modeId !== sourceModeId && normalizeModeName(mode.name) === normalizedDesiredName,
  );

  if (conflictingMode) {
    return sourceMode.name;
  }

  collection.renameMode(sourceModeId, desiredName);
  return desiredName;
}

function shouldAutoRenameSourceMode(modeName: string): boolean {
  const normalized = normalizeModeName(modeName);
  return /^mode\s*\d+$/.test(normalized) || normalized === 'mode' || normalized === 'default';
}

async function translateTexts(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    openAiModel: string;
    sourceLanguage?: LanguageOption;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  if (options.provider === 'openai') {
    return translateWithOpenAI(texts, options);
  }

  if (options.provider === 'gemini' || options.provider === 'gemini-free') {
    return translateWithGemini(texts, options);
  }

  if (options.provider === 'claude') {
    return translateWithClaude(texts, options);
  }

  return translateWithDeepL(texts, options);
}

async function detectSourceLanguage(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    openAiModel: string;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<LanguageOption | undefined> {
  const sampleTexts = texts
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .slice(0, 8);

  if (sampleTexts.length === 0) {
    return undefined;
  }

  try {
    if (options.provider === 'deepl-free' || options.provider === 'deepl-pro') {
      return detectSourceLanguageWithDeepL(sampleTexts, options);
    }

    return detectSourceLanguageWithAI(sampleTexts, options);
  } catch {
    return undefined;
  }
}

async function detectSourceLanguageWithDeepL(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<LanguageOption | undefined> {
  if (!options.targetLanguage.deeplTargetCode) {
    return undefined;
  }

  const endpoint =
    options.provider === 'deepl-free'
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

  const payload: Record<string, unknown> = {
    text: texts,
    target_lang: options.targetLanguage.deeplTargetCode,
    preserve_formatting: true,
  };

  if (options.deepLFormality !== 'default') {
    payload.formality = options.deepLFormality;
  }

  const response = await fetch(DEEPL_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint,
      apiKey: options.apiKey,
      payload,
    }),
  });

  const data = (await readJsonResponse(response)) as {
    translations?: Array<{ detected_source_language?: string }>;
  };

  const detectedCode = data.translations?.[0]?.detected_source_language;
  return getLanguageByDeepLSourceCode(detectedCode);
}

async function detectSourceLanguageWithAI(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    openAiModel: string;
  },
): Promise<LanguageOption | undefined> {
  const languageList = LANGUAGES.map((language) => `${language.code}=${language.label}`).join(', ');
  const systemPrompt = [
    'Identify the source language of UI strings.',
    'Return JSON only with this exact shape: {"language":"en"}.',
    `Use only one of these codes: ${languageList}.`,
    'Choose the dominant source language across all strings.',
  ].join(' ');
  const userPayload = { strings: texts };

  if (options.provider === 'openai') {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.openAiModel,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(userPayload) }] },
        ],
      }),
    });

    const data = (await readJsonResponse(response)) as Record<string, unknown>;
    if (!response.ok) {
      return undefined;
    }

    const parsed = parseJsonPayload(extractOpenAIText(data)) as { language?: unknown };
    return typeof parsed.language === 'string' ? getLanguageByCode(parsed.language) : undefined;
  }

  if (options.provider === 'gemini' || options.provider === 'gemini-free') {
    const model =
      options.openAiModel.trim() ||
      (options.provider === 'gemini-free' ? GEMINI_FREE_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL);

    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            responseMimeType: 'application/json',
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(userPayload) }],
            },
          ],
        }),
      },
    );

    const data = (await readJsonResponse(response)) as Record<string, unknown>;
    if (!response.ok) {
      return undefined;
    }

    const parsed = parseJsonPayload(extractGeminiText(data)) as { language?: unknown };
    return typeof parsed.language === 'string' ? getLanguageByCode(parsed.language) : undefined;
  }

  if (options.provider === 'claude') {
    const response = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.openAiModel.trim() || CLAUDE_DEFAULT_MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(userPayload),
          },
        ],
      }),
    });

    const data = (await readJsonResponse(response)) as Record<string, unknown>;
    if (!response.ok) {
      return undefined;
    }

    const parsed = parseJsonPayload(extractClaudeText(data)) as { language?: unknown };
    return typeof parsed.language === 'string' ? getLanguageByCode(parsed.language) : undefined;
  }

  return undefined;
}

function getLanguageByDeepLSourceCode(code?: string): LanguageOption | undefined {
  if (!code) {
    return undefined;
  }

  const normalizedCode = code.trim().toUpperCase();
  return LANGUAGES.find((language) => language.deeplSourceCode === normalizedCode);
}

async function translateWithDeepL(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    sourceLanguage?: LanguageOption;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<string[]> {
  if (!options.targetLanguage.deeplTargetCode) {
    throw new Error(`${options.targetLanguage.label} is not supported by DeepL.`);
  }

  const endpoint =
    options.provider === 'deepl-free'
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

  const payload: Record<string, unknown> = {
    text: texts,
    target_lang: options.targetLanguage.deeplTargetCode,
    preserve_formatting: true,
  };

  if (options.sourceLanguage?.deeplSourceCode) {
    payload.source_lang = options.sourceLanguage.deeplSourceCode;
  }

  if (options.deepLFormality !== 'default') {
    payload.formality = options.deepLFormality;
  }

  let response: JsonResponse;
  try {
    response = await fetch(DEEPL_PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        apiKey: options.apiKey,
        payload,
      }),
    });
  } catch (error) {
    throw new Error(getProviderRequestErrorMessage(options.provider, error));
  }

  const data = (await readJsonResponse(response)) as {
    message?: string;
    detail?: string;
    translations?: Array<{ text?: string }>;
  };

  if (!response.ok) {
    throw new Error(extractDeepLError(data, response.status));
  }

  const translations = data.translations?.map((entry) => entry.text ?? '');
  if (!translations || translations.length !== texts.length) {
    throw new Error('DeepL returned an unexpected number of translations.');
  }

  return translations;
}

async function translateWithOpenAI(
  texts: string[],
  options: {
    apiKey: string;
    openAiModel: string;
    sourceLanguage?: LanguageOption;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<string[]> {
  const systemPrompt = [
    'You translate UI strings for Figma variable modes.',
    'Return JSON only with this exact shape: {"translations":["..."]}.',
    'Keep the same array length and order.',
    'Preserve placeholders, markup, punctuation, line breaks, emojis, and surrounding whitespace.',
    'Do not add commentary.',
  ].join(' ');

  const userPayload = {
    sourceLanguage: options.sourceLanguage?.openAiLabel ?? 'Auto-detect',
    targetLanguage: options.targetLanguage.openAiLabel,
    strings: texts,
  };

  let response: JsonResponse;
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.openAiModel,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: JSON.stringify(userPayload) }],
          },
        ],
      }),
    });
  } catch (error) {
    throw new Error(getProviderRequestErrorMessage('openai', error));
  }

  const data = (await readJsonResponse(response)) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(extractApiError(data, response.status));
  }

  const rawText = extractOpenAIText(data);
  const parsed = parseJsonPayload(rawText);
  const translations = Array.isArray(parsed)
    ? parsed
    : (parsed as { translations?: unknown }).translations;

  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('OpenAI returned an unexpected translation payload.');
  }

  return translations.map((value) => {
    if (typeof value !== 'string') {
      throw new Error('OpenAI returned a non-string translation.');
    }

    return value;
  });
}

async function translateWithGemini(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    openAiModel: string;
    sourceLanguage?: LanguageOption;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<string[]> {
  const model =
    options.openAiModel.trim() ||
    (options.provider === 'gemini-free' ? GEMINI_FREE_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL);
  const systemPrompt = [
    'You translate UI strings for Figma variable modes.',
    'Return JSON only with this exact shape: {"translations":["..."]}.',
    'Keep the same array length and order.',
    'Preserve placeholders, markup, punctuation, line breaks, emojis, and surrounding whitespace.',
    'Do not add commentary.',
  ].join(' ');

  const userPayload = {
    sourceLanguage: options.sourceLanguage?.openAiLabel ?? 'Auto-detect',
    targetLanguage: options.targetLanguage.openAiLabel,
    strings: texts,
  };

  let response: JsonResponse;
  try {
    response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            responseMimeType: 'application/json',
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(userPayload) }],
            },
          ],
        }),
      },
    );
  } catch (error) {
    throw new Error(getProviderRequestErrorMessage(options.provider, error));
  }

  const data = (await readJsonResponse(response)) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(extractGeminiError(data, response.status));
  }

  const rawText = extractGeminiText(data);
  const parsed = parseJsonPayload(rawText);
  const translations = Array.isArray(parsed)
    ? parsed
    : (parsed as { translations?: unknown }).translations;

  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('Gemini returned an unexpected translation payload.');
  }

  return translations.map((value) => {
    if (typeof value !== 'string') {
      throw new Error('Gemini returned a non-string translation.');
    }

    return value;
  });
}

async function translateWithClaude(
  texts: string[],
  options: {
    provider: ProviderId;
    apiKey: string;
    openAiModel: string;
    sourceLanguage?: LanguageOption;
    targetLanguage: LanguageOption;
    deepLFormality: StoredSettings['deepLFormality'];
  },
): Promise<string[]> {
  const systemPrompt = [
    'You translate UI strings for Figma variable modes.',
    'Return JSON only with this exact shape: {"translations":["..."]}.',
    'Keep the same array length and order.',
    'Preserve placeholders, markup, punctuation, line breaks, emojis, and surrounding whitespace.',
    'Do not add commentary.',
  ].join(' ');

  const userPayload = {
    sourceLanguage: options.sourceLanguage?.openAiLabel ?? 'Auto-detect',
    targetLanguage: options.targetLanguage.openAiLabel,
    strings: texts,
  };

  let response: JsonResponse;
  try {
    response = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.openAiModel.trim() || CLAUDE_DEFAULT_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(userPayload),
          },
        ],
      }),
    });
  } catch (error) {
    throw new Error(getProviderRequestErrorMessage('claude', error));
  }

  const data = (await readJsonResponse(response)) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(extractApiError(data, response.status));
  }

  const rawText = extractClaudeText(data);
  const parsed = parseJsonPayload(rawText);
  const translations = Array.isArray(parsed)
    ? parsed
    : (parsed as { translations?: unknown }).translations;

  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('Claude returned an unexpected translation payload.');
  }

  return translations.map((value) => {
    if (typeof value !== 'string') {
      throw new Error('Claude returned a non-string translation.');
    }

    return value;
  });
}

function extractOpenAIText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  const output = data.output;
  if (!Array.isArray(output)) {
    throw new Error('OpenAI returned no output.');
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const fragment of content) {
      if (!fragment || typeof fragment !== 'object') {
        continue;
      }

      const typedFragment = fragment as { type?: unknown; text?: unknown };
      if (typedFragment.type === 'output_text' && typeof typedFragment.text === 'string') {
        parts.push(typedFragment.text);
      }
    }
  }

  const combined = parts.join('\n').trim();
  if (!combined) {
    throw new Error('OpenAI returned an empty response.');
  }

  return combined;
}

function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini returned no candidates.');
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate || typeof firstCandidate !== 'object') {
    throw new Error('Gemini returned an invalid candidate.');
  }

  const content = (firstCandidate as { content?: unknown }).content;
  if (!content || typeof content !== 'object') {
    throw new Error('Gemini returned no content.');
  }

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    throw new Error('Gemini returned no content parts.');
  }

  const text = parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }

      return typeof (part as { text?: unknown }).text === 'string'
        ? ((part as { text?: string }).text ?? '')
        : '';
    })
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return text;
}

function extractClaudeText(data: Record<string, unknown>): string {
  const content = data.content;
  if (!Array.isArray(content)) {
    throw new Error('Claude returned no content.');
  }

  const text = content
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }

      const typedPart = part as { type?: unknown; text?: unknown };
      return typedPart.type === 'text' && typeof typedPart.text === 'string'
        ? typedPart.text
        : '';
    })
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Claude returned an empty response.');
  }

  return text;
}

function parseJsonPayload(payload: string): unknown {
  const trimmed = payload.trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(withoutFence);
}

function extractApiError(data: Record<string, unknown>, status: number): string {
  const error = data.error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  if (typeof data.message === 'string') {
    return data.message;
  }

  return `Request failed with status ${status}.`;
}

function extractDeepLError(
  data: { message?: string; detail?: string },
  status: number,
): string {
  const message = data.message ?? data.detail ?? '';
  if (message) {
    return message;
  }

  return `DeepL request failed with status ${status}.`;
}

function extractGeminiError(data: Record<string, unknown>, status: number): string {
  const error = data.error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return `Gemini request failed with status ${status}.`;
}

async function readJsonResponse(response: JsonResponse): Promise<Record<string, unknown>> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getProviderRequestErrorMessage(provider: ProviderId, error: unknown): string {
  if (provider === 'deepl-free' || provider === 'deepl-pro') {
    return DEEPL_PROXY_UNAVAILABLE_MESSAGE;
  }

  const providerLabel = getProviderById(provider)?.label ?? provider;
  const message = error instanceof Error ? error.message.trim() : '';
  if (message) {
    return `${providerLabel} request failed before the API responded. ${message}`;
  }

  return `${providerLabel} request failed before the API responded. Check your network connection and API settings.`;
}

function getModeCreationErrorMessage(
  error: unknown,
  currentModeCount: number,
  targetLabel: string,
): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (/limited to \d+ modes/i.test(message) || /pricing tier/i.test(message)) {
    return `Figma blocked the creation of "${targetLabel}" because this file has reached its mode limit. This file currently has ${currentModeCount} mode${currentModeCount > 1 ? 's' : ''}. Move the file to a Pro, Education, or paid team workspace to create more modes.`;
  }

  if (message) {
    return message;
  }

  return `Figma could not create the "${targetLabel}" mode.`;
}

function normalizeModeName(name: string): string {
  return name.trim().toLowerCase();
}

function chunkTexts(texts: string[], maxItems: number, maxCharacters: number): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const text of texts) {
    const nextLength = currentLength + text.length;
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxItems || nextLength > maxCharacters)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(text);
    currentLength += text.length;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function loadSettings(): Promise<StoredSettings> {
  const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (!saved || typeof saved !== 'object') {
    return DEFAULT_SETTINGS;
  }

  const value = saved as Partial<StoredSettings>;
  return {
    provider: value.provider ?? DEFAULT_SETTINGS.provider,
    apiKeys: value.apiKeys ?? {},
    openAiModel: value.openAiModel ?? DEFAULT_SETTINGS.openAiModel,
    providerModelSelections: value.providerModelSelections ?? DEFAULT_SETTINGS.providerModelSelections,
    providerCustomModels: value.providerCustomModels ?? DEFAULT_SETTINGS.providerCustomModels,
    collectionId: value.collectionId ?? DEFAULT_SETTINGS.collectionId,
    sourceModeId: value.sourceModeId ?? DEFAULT_SETTINGS.sourceModeId,
    sourceLanguage: value.sourceLanguage ?? DEFAULT_SETTINGS.sourceLanguage,
    targetLanguages:
      Array.isArray((value as { targetLanguages?: unknown }).targetLanguages)
        ? ((value as { targetLanguages?: string[] }).targetLanguages ?? DEFAULT_SETTINGS.targetLanguages)
        : typeof (value as { targetLanguage?: unknown }).targetLanguage === 'string'
          ? [((value as { targetLanguage?: string }).targetLanguage ?? DEFAULT_SETTINGS.targetLanguages[0])]
          : DEFAULT_SETTINGS.targetLanguages,
    deepLFormality: value.deepLFormality ?? DEFAULT_SETTINGS.deepLFormality,
  };
}

async function saveSettings(request: TranslateRequest): Promise<void> {
  const current = await loadSettings();
  const apiKeys = {
    ...current.apiKeys,
    [request.provider]: request.apiKey,
  };

  const nextSettings: StoredSettings = {
    provider: request.provider,
    apiKeys,
    openAiModel: request.openAiModel.trim() || OPENAI_DEFAULT_MODEL,
    providerModelSelections: request.providerModelSelections,
    providerCustomModels: request.providerCustomModels,
    collectionId: request.collectionId,
    sourceModeId: request.sourceModeId,
    sourceLanguage: request.sourceLanguage,
    targetLanguages: request.targetLanguages,
    deepLFormality: request.deepLFormality,
  };

  await figma.clientStorage.setAsync(STORAGE_KEY, nextSettings);
}

function normalizeSettings(settings: StoredSettings, collections: CollectionSummary[]): StoredSettings {
  const fallbackCollection = collections[0];
  const selectedCollection =
    collections.find((collection) => collection.id === settings.collectionId) ?? fallbackCollection;

  const sourceModeId =
    selectedCollection?.modes.find((mode) => mode.id === settings.sourceModeId)?.id ??
    selectedCollection?.defaultModeId ??
    null;

  return {
    ...settings,
    providerModelSelections: {
      ...DEFAULT_SETTINGS.providerModelSelections,
      ...settings.providerModelSelections,
    },
    providerCustomModels: settings.providerCustomModels ?? {},
    collectionId: selectedCollection?.id ?? null,
    sourceModeId,
    targetLanguages: Array.isArray(settings.targetLanguages) && settings.targetLanguages.length > 0
      ? settings.targetLanguages.filter((code) => {
          const language = getLanguageByCode(code);
          return Boolean(language) && isLanguageSupportedByProvider(code, settings.provider);
        })
      : DEFAULT_SETTINGS.targetLanguages,
  };
}

function resolveProviderModel(settings: StoredSettings): string {
  if (!isAIProvider(settings.provider)) {
    return settings.openAiModel.trim() || OPENAI_DEFAULT_MODEL;
  }

  const selectedValue =
    settings.providerModelSelections[settings.provider] ?? getDefaultModelSelection(settings.provider);

  if (selectedValue === 'custom') {
    return settings.providerCustomModels[settings.provider]?.trim() ?? '';
  }

  return selectedValue;
}

function postProgress(progress: TranslationProgress): void {
  postToUI({ type: 'progress', progress });
}

function postToUI(message: MainToUIMessage): void {
  if (!uiReady) {
    return;
  }

  figma.ui.postMessage(message);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return 'An unexpected error occurred.';
}
