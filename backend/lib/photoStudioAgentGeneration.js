import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

export const PHOTO_STUDIO_AGENT_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const requestTimeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 300000);

const referenceTimeoutMs = Number(
  process.env.PHOTO_STUDIO_REFERENCE_TIMEOUT_MS || 30000,
);

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Image generation is not configured");
    error.code = "STUDIO_NOT_CONFIGURED";
    throw error;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: requestTimeoutMs,
    maxRetries: 2,
  });
}

async function fetchImageReference(imageUrl, fileName) {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(referenceTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${fileName}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0] || "image/png";

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error(`${fileName} is empty`);
  }

  let metadata;

  try {
    metadata = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new Error(`${fileName} is not a valid image`);
  }

  const width = metadata.autoOrient?.width || metadata.width;

  const height = metadata.autoOrient?.height || metadata.height;

  if (!width || !height) {
    throw new Error(`${fileName} has no usable dimensions`);
  }

  return {
    file: await toFile(buffer, fileName, {
      type: contentType,
    }),
    width,
    height,
  };
}

function roundToMultipleOf16(value) {
  return Math.max(16, Math.round(value / 16) * 16);
}

function outputSizeForEnvironment(width, height) {
  const aspectRatio = width / height;

  if (aspectRatio > 3 || aspectRatio < 1 / 3) {
    throw new Error("Environment aspect ratio must be between 1:3 and 3:1");
  }

  const longEdge = 1536;

  if (aspectRatio >= 1) {
    return `${longEdge}x` + roundToMultipleOf16(longEdge / aspectRatio);
  }

  return `${roundToMultipleOf16(longEdge * aspectRatio)}x${longEdge}`;
}

function buildAgentPrompt({ instruction, retryPrompt, hasPreviousImage }) {
  const revisionSection = hasPreviousImage
    ? `
  IMAGE 3 is the previous polished result.
 
  Use IMAGE 3 as the starting point for the requested
  revision, but continue treating IMAGE 1 as the source of
  truth for the environment and IMAGE 2 as the source of
  truth for the food.
  `
    : "";

  const instructionSection = instruction
    ? `
  USER REVISION REQUEST
 
  ${instruction}
 
  Follow this request only when it is compatible with
  preserving the identity of the dish and the account
  environment.
  `
    : "";
  const retrySection = retryPrompt
    ? `
  QUALITY-CONTROL CORRECTION
 
  The previous internal attempt had this problem:
 
  ${retryPrompt}
 
  Correct that problem in this attempt.
  `
    : "";

  return `
  TASK: CREATE A POLISHED RESTAURANT FOOD PHOTOGRAPH
 
  IMAGE 1 is the account environment.
  IMAGE 2 is the original food photograph.
  ${revisionSection}
 
  The final result must look like the dish was genuinely
  photographed in IMAGE 1.
 
  ENVIRONMENT
 
  Preserve from IMAGE 1:
 
  - The table and background
  - Props and account atmosphere
  - Camera position and composition
  - Perspective and depth of field
  - Direction and character of the lighting
 
  FOOD
 
  Preserve from IMAGE 2:
 
  - The identity of the dish
  - Ingredients
  - Portion size
  - Arrangement
  - Colours and textures
  - Recognisable serving style
 
  NATURAL INTEGRATION
 
  Do not paste the food into the environment unchanged.
 
  Adapt the presentation naturally to the new scene:
 
  - Correct perspective
  - Believable scale
  - Lighting colour and direction
  - Contact shadows
  - Ambient shadows
  - Reflections
  - Depth of field
  - Edge transitions
  - Plate placement
  - Exposure and colour balance
 
  The plate or serving vessel may be subtly adapted when
  needed to fit the account environment, but the dish
  must remain recognisably the same dish.
 
  Do not:
 
  - Add or remove ingredients
  - Invent garnish
  - Change the dish into another dish
  - Rebuild the account environment
  - Import the food photograph's original background
  - Make the result look like a cut-out or pasted layer
  - Add text, captions, logos, watermarks or borders
 
  ${instructionSection}
  ${retrySection}
 
  Return one finished photograph only.
    `.trim();
}
export async function generatePhotoStudioAgentImage({
  environmentImageUrl,
  sourceImageUrl,
  previousImageUrl = null,
  instruction = null,
  retryPrompt = null,
  userId,
}) {
  const client = getOpenAIClient();

  const [environmentReference, sourceReference] = await Promise.all([
    fetchImageReference(environmentImageUrl, "account-environment.webp"),
    fetchImageReference(sourceImageUrl, "original-dish.webp"),
  ]);

  const imageReferences = [environmentReference.file, sourceReference.file];
  if (previousImageUrl) {
    const previousReference = await fetchImageReference(
      previousImageUrl,
      "previous-result.png",
    );

    imageReferences.push(previousReference.file);
  }

  const clientRequestId = crypto.randomUUID();

  const result = await client.images.edit(
    {
      model: PHOTO_STUDIO_AGENT_IMAGE_MODEL,
      image: imageReferences,
      prompt: buildAgentPrompt({
        instruction,
        retryPrompt,
        hasPreviousImage: Boolean(previousImageUrl),
      }),
      quality: "high",
      size: outputSizeForEnvironment(
        environmentReference.width,
        environmentReference.height,
      ),
      output_format: "png",
      background: "opaque",
      user: String(userId),
    },
    {
      headers: {
        "X-Client-Request-Id": clientRequestId,
      },
    },
  );

  const imageBase64 = result.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("The image provider did not return an image");
  }

  return {
    imageBase64,
    model: PHOTO_STUDIO_AGENT_IMAGE_MODEL,
    requestId: result._request_id || null,
    clientRequestId,
  };
}
