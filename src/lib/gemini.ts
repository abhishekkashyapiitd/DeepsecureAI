import { GoogleGenAI, Type } from "@google/genai";

export async function performAnalysis(base64Image: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Gemini API key is missing or empty in your Environment Variables. Please add GEMINI_API_KEY to your Settings > Secrets.");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const base64Data = base64Image.split(",")[1] || base64Image;
  const mimeType = base64Image.split(";")[0].split(":")[1] || "image/jpeg";

  const prompt = `Act as an expert image forensic analyst. Analyze the provided image for any signs of forgery, deepfake, or digital manipulation.
  
  Analyze:
  1. Binary detection (REAL vs FORGED)
  2. Frequency-domain and noise pattern analysis.
  3. Identification of characteristic AI artifacts (blurring, inconsistent textures).
  4. If FORGED: Detect specific regions of manipulation and provide their bounding boxes [ymin, xmin, ymax, xmax] in normalized coordinates (0-1000).

  Return a TECHNICAL forensic report in JSON format.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            decision: {
              type: Type.STRING,
              enum: ["REAL", "FORGED"],
            },
            confidence: {
              type: Type.NUMBER,
            },
            localization: {
              type: Type.STRING,
            },
            details: {
              type: Type.STRING,
            },
            summary: {
              type: Type.STRING,
            },
            manipulatedRegions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                  },
                  label: { type: Type.STRING }
                },
              }
            }
          },
          required: ["decision", "confidence", "localization", "details", "summary"]
        } as any
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini AI");
    }
    return JSON.parse(responseText);
  } catch (error: any) {
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("400")) {
      throw new Error("Invalid Gemini API Key. Please check your GEMINI_API_KEY in the Settings > Secrets panel.");
    }
    throw error;
  }
}
