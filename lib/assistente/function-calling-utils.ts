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

  for (const call of response.functionCalls ?? []) {
    if (!call || !call.name || !allowedTools.has(call.name)) continue;
    tools.push({ tool: call.name, params: cleanParams(call.args) });
    if (tools.length >= maxTools) break;
  }

  const directReply =
    tools.length === 0 && typeof response.text === "string"
      ? response.text.trim() || null
      : null;

  return { tools, directReply };
}
