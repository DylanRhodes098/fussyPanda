import OpenAI from "openai";

const qaModel = process.env.OPENAI_QA_MODEL || "gpt-5.5";

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Image generation is not configured");
    error.code = "STUDIO_NOT_CONFIGURED";
    throw error;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function evaluateGeneratedFoodImage({
  knowledgeImageUrl,
  sourceImageUrl,
  generatedImageUrl,
}) {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: qaModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Evaluate this account food composite. Return only JSON with: passed boolean, score number 0-100, issues array, retryPrompt string. Image 1 is environment, Image 2 is source food, Image 3 is generated result. Pass only if Image 3 preserves Image 1 environment and Image 2 food.",
          },
          { type: "input_image", image_url: knowledgeImageUrl, detail: "high" },
          { type: "input_image", image_url: sourceImageUrl, detail: "high" },
          { type: "input_image", image_url: generatedImageUrl, detail: "high" },
        ],
      },
    ],
  });

  const parsed = safeParseJson(response.output_text);

  if (!parsed) {
    return {
      passed: false,
      score: 0,
      issues: ["QA response was not valid JSON"],
      retryPrompt:
        "Regenerate with stronger environment preservation and food matching.",
    };
  }

  return parsed;
}
