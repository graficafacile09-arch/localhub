/**
 * Provider Groq condiviso da Pino, con paracadute OpenRouter.
 *
 * Pino usa Groq come provider AI primario per testo/JSON e Function Calling.
 * Se Groq risponde 429 (rate limit), 5xx, va in timeout o fallisce a livello di
 * rete, e `OPENROUTER_API_KEY` è configurata, la stessa richiesta viene ripetuta
 * su OpenRouter. Senza chiave OpenRouter il comportamento resta identico a prima.
 * Il provider restituisce piani e invocazioni: non accede al catalogo e non
 * esegue strumenti. Ricerca, validazione, filtri e dati restano deterministici.
 */

export type GroqHistoryMessage = {
  role: "user" | "model";
  content: string;
};

export type CallGroqTextParams = {
  systemPrompt: string;
  userPrompt: string;
  history?: GroqHistoryMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Istante assoluto (Date.now()) oltre il quale la chiamata non può più partire. */
  deadlineMs?: number;
  /** Segnale esterno (es. scadenza della route): interrompe la fetch in corso. */
  signal?: AbortSignal;
};

export type GroqToolDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema: unknown;
};

export type GroqFunctionCallingParams = {
  systemPrompt: string;
  userPrompt: string;
  history?: GroqHistoryMessage[];
  declarations: GroqToolDeclaration[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
};

type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string | Record<string, unknown> };
      }>;
    };
  }>;
};

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
/** Paracadute: stesso contratto OpenAI-compatible, attivo solo con OPENROUTER_API_KEY. */
const ENDPOINT_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const MODELLO_OPENROUTER_FALLBACK = "openai/gpt-oss-120b";
/**
 * Modello primario per le risposte discorsive. GPT-OSS consuma token di
 * reasoning nascosto prima del testo e può troncare le risposte; Llama 3.3 70B
 * scrive direttamente il testo. `GROQ_MODEL`, se impostato, ha la precedenza.
 */
const MODELLO_FALLBACK = "openai/gpt-oss-120b";
const TIMEOUT_DEFAULT_MS = 12_000;
const MODELLI_CON_REASONING = /gpt-oss|qwen|deepseek/i;
/**
 * GPT-OSS consuma token di reasoning prima del testo. Il tetto minimo evita
 * risposte JSON troncate; resta configurabile tramite GROQ_MODEL.
 */
const MAX_TOKENS_MINIMO = 700;

function messaggiUtente(
  history: GroqHistoryMessage[] = [],
  userPrompt: string
): GroqMessage[] {
  return [
    ...history.map((message) => ({
      role: message.role === "model" ? "assistant" as const : "user" as const,
      content: message.content,
    })),
    { role: "user", content: userPrompt },
  ];
}

type OpzioniCompletamento = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
  json?: boolean;
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }>;
};

function costruisciCorpo(
  messages: GroqMessage[],
  options: OpzioniCompletamento,
  model: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_completion_tokens: Math.max(options.maxTokens ?? 0, MAX_TOKENS_MINIMO),
    stream: false,
  };
  if (options.json) body.response_format = { type: "json_object" };
  // reasoning_format serve solo ai modelli con reasoning (GPT-OSS, Qwen, DeepSeek).
  if ((options.json || options.tools?.length) && MODELLI_CON_REASONING.test(model)) {
    body.reasoning_format = "hidden";
  }
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = "auto";
    // Il modello GPT-OSS 120B non supporta tool call parallele.
    body.parallel_tool_calls = false;
  }
  return body;
}

/** Esegue una singola richiesta di completamento su un provider OpenAI-compatible. */
async function inviaRichiesta(params: {
  endpoint: string;
  apiKey: string;
  provider: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<GroqCompletion> {
  const { endpoint, apiKey, provider, body, timeoutMs } = params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Il segnale esterno (scadenza della route) interrompe la fetch in corso.
  const abortaSeSegnale = () => controller.abort();
  if (params.signal?.aborted) controller.abort();
  params.signal?.addEventListener("abort", abortaSeSegnale, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Non leggere né registrare il body: gli errori del provider possono
      // contenere dettagli interni. Lo status basta per la diagnostica.
      const error = new Error(`Errore ${provider} (HTTP ${response.status}).`);
      Object.assign(error, { status: response.status });
      throw error;
    }

    return await response.json() as GroqCompletion;
  } catch (caught: unknown) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      const error = new Error(`Timeout chiamata ${provider} (${Math.round(timeoutMs / 1000)}s).`);
      Object.assign(error, { timeout: true });
      throw error;
    }
    throw caught;
  } finally {
    clearTimeout(timeoutId);
    params.signal?.removeEventListener("abort", abortaSeSegnale);
  }
}

/**
 * Il paracadute scatta solo per guasti transitori: rate limit (429), errori
 * del provider (5xx), timeout o errore di rete. Un 4xx di merito (chiave o
 * richiesta non valida) resta un errore Groq da correggere, non un fallback.
 */
function meritaFallbackOpenRouter(caught: unknown): boolean {
  if (!(caught instanceof Error)) return false;
  const status = (caught as { status?: unknown }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  if ((caught as { timeout?: boolean }).timeout === true) return true;
  // fetch lancia TypeError quando la rete non risponde o la connessione cade.
  return caught instanceof TypeError;
}

async function completaGroq(
  messages: GroqMessage[],
  options: OpzioniCompletamento = {}
): Promise<GroqCompletion> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Chiave API Groq mancante. Configura GROQ_API_KEY nelle variabili d'ambiente.");
  }

  const model = process.env.GROQ_MODEL?.trim() || MODELLO_FALLBACK;
  const restanteMs = options.deadlineMs === undefined ? Infinity : options.deadlineMs - Date.now();
  if (restanteMs <= 0) {
    throw new Error("Timeout chiamata Groq (budget esaurito).");
  }
  const timeoutMs = Math.min(options.timeoutMs ?? TIMEOUT_DEFAULT_MS, restanteMs);

  try {
    return await inviaRichiesta({
      endpoint: ENDPOINT,
      apiKey,
      provider: "Groq",
      body: costruisciCorpo(messages, options, model),
      timeoutMs,
      signal: options.signal,
    });
  } catch (caught: unknown) {
    const chiaveOpenRouter = process.env.OPENROUTER_API_KEY?.trim();
    // Senza chiave, con segnale esterno già scaduto o senza budget residuo il
    // comportamento resta esattamente quello di prima.
    if (!chiaveOpenRouter || options.signal?.aborted || !meritaFallbackOpenRouter(caught)) {
      throw caught;
    }
    const budgetResiduo =
      options.deadlineMs === undefined ? Infinity : options.deadlineMs - Date.now();
    if (budgetResiduo <= 0) throw caught;

    const modelloOpenRouter =
      process.env.OPENROUTER_CHAT_MODEL?.trim() || MODELLO_OPENROUTER_FALLBACK;
    const corpoOpenRouter = costruisciCorpo(messages, options, modelloOpenRouter);
    // Parametri specifici di Groq: OpenRouter li rifiuterebbe.
    delete corpoOpenRouter.reasoning_format;
    // OpenRouter accetta max_tokens, non max_completion_tokens.
    if (corpoOpenRouter.max_completion_tokens !== undefined) {
      corpoOpenRouter.max_tokens = corpoOpenRouter.max_completion_tokens;
      delete corpoOpenRouter.max_completion_tokens;
    }

    try {
      return await inviaRichiesta({
        endpoint: ENDPOINT_OPENROUTER,
        apiKey: chiaveOpenRouter,
        provider: "OpenRouter",
        body: corpoOpenRouter,
        timeoutMs: Math.min(options.timeoutMs ?? TIMEOUT_DEFAULT_MS, budgetResiduo),
        signal: options.signal,
      });
    } catch {
      // Se anche il paracadute cade, l'errore utile è quello originale di Groq.
      throw caught;
    }
  }
}

/** Generazione testuale o JSON strutturato tramite Groq. */
export async function callGroqText(params: CallGroqTextParams): Promise<string> {
  const messages: GroqMessage[] = [
    ...(params.systemPrompt.trim()
      ? [{ role: "system" as const, content: params.systemPrompt.trim() }]
      : []),
    ...messaggiUtente(params.history, params.userPrompt),
  ];
  const result = await completaGroq(messages, params);
  const content = result.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Risposta Groq vuota.");
  return content;
}

/**
 * Function Calling OpenAI-compatible. Restituisce chiamate normalizzate
 * {name,args}; l'allowlist e l'esecuzione restano nel livello Pino.
 */
export async function callGroqFunctionCalling(
  params: GroqFunctionCallingParams
): Promise<{ calls: unknown; text: string }> {
  const messages: GroqMessage[] = [
    ...(params.systemPrompt.trim()
      ? [{ role: "system" as const, content: params.systemPrompt.trim() }]
      : []),
    ...messaggiUtente(params.history, params.userPrompt),
  ];
  const tools = params.declarations.map((declaration) => ({
    type: "function" as const,
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: declaration.parametersJsonSchema,
    },
  }));
  const result = await completaGroq(messages, {
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    timeoutMs: params.timeoutMs,
    deadlineMs: params.deadlineMs,
    signal: params.signal,
    tools,
  });
  const message = result.choices?.[0]?.message;
  const calls = (message?.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name;
    const rawArgs = call.function?.arguments;
    if (typeof name !== "string" || !name.trim()) return [];
    let args: unknown = rawArgs;
    if (typeof rawArgs === "string") {
      try { args = JSON.parse(rawArgs); } catch { return []; }
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) return [];
    return [{ name: name.trim(), args }];
  });
  return {
    calls,
    text: typeof message?.content === "string" ? message.content.trim() : "",
  };
}
