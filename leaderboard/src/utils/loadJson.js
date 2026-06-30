export async function loadBenchmarkData() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/all.jsonl`);
  const text = await response.text();

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
