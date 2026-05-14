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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const fetchUrl = "/api/analyze";
    console.log(`Starting image analysis request to: ${window.location.origin}${fetchUrl}`);
    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base64Image }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        if (response.status === 404) {
          errorData = { error: "Analysis API not found (404). This usually means the backend server is not running or the route is not configured correctly." };
        } else {
          errorData = { error: `Server error: ${response.status} ${response.statusText}` };
        }
      }
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Analysis completed successfully");
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error("Analysis request timed out after 60s");
      throw new Error("Analysis timed out. The image might be too large or the server is busy.");
    }
    console.error("Analysis service error:", error);
    throw new Error(error instanceof Error ? error.message : "Analysis failed");
  }
}
