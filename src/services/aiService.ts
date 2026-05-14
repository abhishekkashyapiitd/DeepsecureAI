import { performAnalysis } from '../lib/gemini';

export interface AnalysisResult {
  decision: 'REAL' | 'FORGED';
  confidence: number;
  localization: string;
  details: string;
  summary: string;
  manipulatedRegions?: {
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
    label: string;
  }[];
}

export async function analyzeImage(base64Image: string): Promise<AnalysisResult> {
  try {
    console.log("Starting frontend image analysis via Gemini AI...");
    const result = await performAnalysis(base64Image);
    console.log("Analysis completed successfully on frontend");
    return result;
  } catch (error: any) {
    console.error("Analysis service error:", error);
    throw new Error(error instanceof Error ? error.message : "Analysis failed");
  }
}
