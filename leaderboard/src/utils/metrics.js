// Shared derivations for benchmark records (one line of all.jsonl).

export function formatConfig(item) {
  const params = item.sketch_config?.params;
  if (!params || Object.keys(params).length === 0) return "—";
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

export function insertMops(item) {
  const ins = item.insert_throughput_items_per_sec?.mean;
  return ins ? ins / 1e6 : null;
}

export function queryMops(item) {
  const q = item.query_throughput_items_per_sec?.mean;
  return q ? q / 1e6 : null;
}

export function fmtMemory(bytes) {
  if (bytes == null) return "—";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Accuracy fields differ per sketch family; return a labelled list so the
// detail view can render whatever applies to this record.
export function accuracyRows(item) {
  const acc = item.accuracy;
  if (!acc) return [];
  switch (item.sketch) {
    case "hll":
      return [{ label: "Relative error", value: acc.relative_error }];
    case "kll":
      return [
        { label: "Mean rank error", value: acc.mean_rank_err },
        { label: "Max rank error", value: acc.max_rank_err },
      ];
    case "cms":
    case "countsketch":
      return [
        { label: "Rel. error (mean)", value: acc.relative_error_mean },
        { label: "Rel. error (p99)", value: acc.relative_error_p99 },
        { label: "L1 error", value: acc.l1_err },
        { label: "L2 error", value: acc.l2_err },
        { label: "Probes", value: acc.probes },
        { label: "Filtered out", value: acc.filtered_out },
        { label: "Min true count", value: acc.min_true_count },
      ];
    default:
      return Object.entries(acc).map(([k, v]) => ({ label: k, value: v }));
  }
}
