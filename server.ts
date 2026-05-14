import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors()); // Enable CORS for all routes
  
  // Request logging middleware
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Server] ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers)}`);
    next();
  });

  // Increase limit for image uploads
  app.use(express.json({ limit: '50mb' })); // Increased to 50MB for very large forensics images

  // API Health Check
  app.get("/api/health", (req, res) => {
    console.log("[Server] Health check requested");
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      time: new Date().toISOString(),
      routes: ["/api/health", "/api/analyze"]
    });
  });

  // AI Analysis Endpoint
  app.post("/api/analyze", async (req, res) => {
    console.log("[Server] Received POST /api/analyze");
    const { base64Image } = req.body;
    
    if (!base64Image) {
      console.error("[Server] Bad Request: Missing base64Image");
      return res.status(400).json({ error: "Missing base64Image in request body" });
    }
    console.log(`[Server] Image received (length: ${base64Image.length})`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[Server] GEMINI_API_KEY missing");
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      console.log("[Server] Initializing Gemini 1.5 Flash...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              decision: {
                type: SchemaType.STRING,
                enum: ["REAL", "FORGED"],
              },
              confidence: {
                type: SchemaType.NUMBER,
              },
              localization: {
                type: SchemaType.STRING,
              },
              details: {
                type: SchemaType.STRING,
              },
              summary: {
                type: SchemaType.STRING,
              },
              manipulatedRegions: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    box_2d: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.NUMBER },
                    },
                    label: { type: SchemaType.STRING }
                  },
                }
              }
            },
            required: ["decision", "confidence", "localization", "details", "summary"]
          } as any
        }
      });

      const prompt = `Act as an expert image forensic analyst. Analyze the provided image for any signs of forgery, deepfake, or digital manipulation.
  
      Analyze:
      1. Binary detection (REAL vs FORGED)
      2. Frequency-domain and noise pattern analysis.
      3. Identification of characteristic AI artifacts (blurring, inconsistent textures).
      4. If FORGED: Detect specific regions of manipulation and provide their bounding boxes [ymin, xmin, ymax, xmax] in normalized coordinates (0-1000).
    
      Return a TECHNICAL forensic report in JSON format.`;

      const base64Data = base64Image.split(",")[1] || base64Image;
      const mimeType = base64Image.split(";")[0].split(":")[1] || "image/jpeg";

      console.log("[Server] Sending request to Gemini...");
      
      const resultPromise = model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ]);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Gemini AI request timed out")), 55000)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]) as any;

      console.log("[Server] Gemini response received");
      const responseText = result.response.text();
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("[Server] Gemini error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Analysis failed",
        code: error.code || 'UNKNOWN'
       });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
