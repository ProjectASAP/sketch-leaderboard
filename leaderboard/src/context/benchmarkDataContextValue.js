import { createContext } from "react";

// Single in-memory struct for all.jsonl, shared by every page via
// useBenchmarkData(). See BenchmarkDataContext.jsx for the provider
// that loads the data.
//
// Filename intentionally doesn't share a base name with
// BenchmarkDataContext.jsx (differing only in case) — Windows'
// case-insensitive filesystem resolves bare imports to whichever
// file it finds first, which silently picked this file over the
// .jsx provider.
export const BenchmarkDataContext = createContext(null);
