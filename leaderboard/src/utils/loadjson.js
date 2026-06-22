export async function loadBenchmarkData() {
  const response = await fetch("/data/all.jsonl");
  const text = await response.text();

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}