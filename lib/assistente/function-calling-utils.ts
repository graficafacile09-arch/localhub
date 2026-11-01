export type FunctionCallingRawResponse = {
  functionCalls?: Array<{ name?: string | null; args?: unknown } | null> | null;
  text?: string | null;
};

export type NormalizedFunctionCallingSelection<TParams> = {
  tools: Array<{ tool: string; params: TParams }>;
  directReply: string | null;
};

/**
 * Normalizza la risposta Gemini senza eseguire strumenti.
 * Gli strumenti non dichiarati vengono ignorati e il numero di invocazioni è limitato.
 */
export function estraiSelezioneFunctionCalling<TParams>(
  response: FunctionCallingRawResponse,
  allowedTools: ReadonlySet<string>,
  cleanParams: (raw: unknown) => TParams,
  maxTools = 3
): NormalizedFunctionCallingSelection<TParams> {
  const tools: Array<{ tool: string; params: TParams }> = [];
  const limit = Number.isFinite(maxTools) ? Math.max(0, Math.floor(maxTools)) : 3;

  for (const call of response.functionCalls ?? []) {
    if (tools.length >= limit) break;
    if (!call || !call.name || !allowedTools.has(call.name)) continue;
    tools.push({ tool: call.name, params: cleanParams(call.args) });
  }

  const directReply =
    tools.length === 0 && typeof response.text === "string"
      ? response.text.trim() || null
      : null;

  return { tools, directReply };
}


/**
 * Una risposta vuota del modello non è una selezione riuscita per una query
 * concreta: in quel caso l'orchestratore deve poter usare il fallback searchAll.
 * Per messaggi generic/conversazionali, invece, evita una ricerca inventata.
 */
export function functionCallingSelectionIsComplete<TParams>(
  selection: NormalizedFunctionCallingSelection<TParams>,
  isGenericIntent: boolean
): boolean {
  return selection.tools.length > 0 || Boolean(selection.directReply) || isGenericIntent;
}