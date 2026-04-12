export type LLMProvider = "anthropic" | "openai" | "minimax";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMCallOptions {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  system?: string;
}

async function callAnthropic(options: LLMCallOptions): Promise<ReadableStream> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const model = process.env.LLM_MODEL || "claude-sonnet-4-20250514";

  // Build messages array
  const allMessages = [...options.messages];

  const body: Record<string, unknown> = {
    model,
    messages: allMessages,
    stream: true,
  };

  if (options.system) {
    body.system = options.system;
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

async function callOpenAI(options: LLMCallOptions): Promise<ReadableStream> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const allMessages = [...options.messages];

  const body: Record<string, unknown> = {
    model,
    messages: allMessages,
    stream: true,
  };

  if (options.system) {
    (allMessages as Array<{ role: string; content: string }>).unshift({
      role: "system",
      content: options.system,
    });
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

export async function callLLM(options: LLMCallOptions): Promise<ReadableStream> {
  const provider = (process.env.LLM_PROVIDER || "anthropic") as LLMProvider;

  switch (provider) {
    case "anthropic":
      return callAnthropic(options);
    case "openai":
      return callOpenAI(options);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
