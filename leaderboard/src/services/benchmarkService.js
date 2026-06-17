// Reads a .jsonl file and returns an array of JavaScript objects

export async function loadBenchmarkData() {
  try {
    const response = await fetch("/data/all.jsonl");

    if (!response.ok) {
      throw new Error("Failed to load benchmark data");
    }

    const text = await response.text();

    // Split into lines and remove empty ones
    const lines = text.split("\n").filter(line => line.trim() !== "");

    // Convert every line into a JSON object
    const data = lines.map(line => JSON.parse(line));

    return data;

  } catch (error) {
    console.error(error);
    return [];
  }
}