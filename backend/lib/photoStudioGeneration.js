import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-2026-04-21";

const openAIImageTimeoutMs = Number(
  process.env.OPENAI_IMAGE_TIMEOUT_MS || 300000,
);

const referenceFetchTimeoutMs = Number(
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
    maxRetries: 2,
    timeout: openAIImageTimeoutMs,
  });
}

async function fetchImageAsReference(url, fileName) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(referenceFetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch required image: ${fileName}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0] || "image/webp";

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error(`Required image is empty: ${fileName}`);
  }

  let metadata;

  try {
    metadata = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new Error(`Could not inspect required image: ${fileName}`);
  }

  const width = metadata.autoOrient?.width || metadata.width;

  const height = metadata.autoOrient?.height || metadata.height;

  if (!width || !height) {
    throw new Error(`Required image has no usable dimensions: ${fileName}`);
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

function getEnvironmentOutputSize(width, height) {
  const aspectRatio = width / height;

  if (aspectRatio > 3 || aspectRatio < 1 / 3) {
    throw new Error(
      "Environment image aspect ratio must be between 1:3 and 3:1",
    );
  }

  const longEdge = 1536;

  let outputWidth;
  let outputHeight;

  if (aspectRatio >= 1) {
    outputWidth = longEdge;
    outputHeight = roundToMultipleOf16(longEdge / aspectRatio);
  } else {
    outputHeight = longEdge;
    outputWidth = roundToMultipleOf16(longEdge * aspectRatio);
  }

  return `${outputWidth}x${outputHeight}`;
}

function buildPhotoStudioPrompt() {
  return `
TASK: FOOD REPLACEMENT COMPOSITE

You have been given two images.

IMAGE 1 = KNOWLEDGEIMAGE (MASTER ENVIRONMENT)

IMAGE 2 = FOODIMAGE (FOOD SOURCE)

The KNOWLEDGEIMAGE is the master image and must remain the environment of the final photograph.

Use the KNOWLEDGEIMAGE for:

* Table
* Background
* Props
* Lighting
* Composition
* Camera angle
* Account atmosphere

Use the FOODIMAGE for:

* Food
* Plate / serving vessel

CRITICAL RULE

The final image must be:

KNOWLEDGEIMAGE environment
+
FOODIMAGE food

Do NOT use:

* The table from FOODIMAGE
* The background from FOODIMAGE
* The lighting from FOODIMAGE
* The composition from FOODIMAGE
* The environment from FOODIMAGE

The FOODIMAGE food and its original plate/serving vessel should be transferred into the 

KNOWLEDGEIMAGE environment.

FOOD PRESERVATION

Preserve the FOODIMAGE food as closely as possible:

* Same food item
* Same ingredients
* Same arrangement
* Same colours
* Same textures
* Same proportions
* Same portion size

Do not:

* Replace the food
* Redesign the food
* Add ingredients
* Remove ingredients
* Add garnish
* Add sauces
* Add decorations
* Add extra food items

ENVIRONMENT PRESERVATION

Preserve the KNOWLEDGEIMAGE environment.

Do not:

* Generate a new account
* Generate a new table
* Generate a new plate
* Change the composition
* Change the camera angle
* Replace the environment

INTEGRATION

Place the FOODIMAGE food together with its original plate/serving vessel naturally into the KNOWLEDGEIMAGE environment.

Match:

* Perspective
* Scale
* Lighting
* Contact shadows
* Reflections
* Focus

SUCCESS CRITERIA

The final image should look like the FOODIMAGE food was genuinely photographed inside the KNOWLEDGEIMAGE environment.

Environment = KNOWLEDGEIMAGE

Food = FOODIMAGE

If any environment elements from FOODIMAGE appear in the final image, the result is incorrect.
    `.trim();
}

export async function generatePhotoStudioComposite({
  environmentImageUrl,
  sourceImageUrl,
  userId,
}) {
  const client = getOpenAIClient();

  const [environmentReference, sourceReference] = await Promise.all([
    fetchImageAsReference(environmentImageUrl, "master-environment.webp"),
    fetchImageAsReference(sourceImageUrl, "source-dish.webp"),
  ]);

  const outputSize = getEnvironmentOutputSize(
    environmentReference.width,
    environmentReference.height,
  );

  const clientRequestId = crypto.randomUUID();
  const startedAt = Date.now();

  const response = await client.images.edit(
    {
      model: imageModel,
      image: [environmentReference.file, sourceReference.file],
      prompt: buildPhotoStudioPrompt(),
      quality: "high",
      size: outputSize,
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

  console.info("Photo Studio OpenAI request completed", {
    clientRequestId,
    openAIRequestId: response._request_id || null,
    model: imageModel,
    durationMs: Date.now() - startedAt,
  });

  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI did not return an image");
  }

  return imageBase64;
}
