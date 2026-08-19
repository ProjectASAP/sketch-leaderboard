import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import AccuracyVsCost from "./pages/AccuracyVsCost";
import ResultDetails from "./pages/ResultDetails";
import Throughput from "./pages/Throughput";
import Visualization from "./pages/Visualization";
import DecisionSupport from "./pages/DecisionSupport";
import { BenchmarkDataProvider } from "./context/BenchmarkDataContext";
import DataHealthGate from "./components/DataHealthGate";

function App() {
  return (
    <BenchmarkDataProvider>
      <Navbar />

      {/* Inside the provider so it can read the load result, and around the
          routes rather than inside each page: a bad all.jsonl is a property of
          the data, not of whichever page happens to be open. Navbar stays
          outside so the app is still navigable while the panel is up. */}
      <DataHealthGate>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/results" element={<ResultTable />} />
          <Route path="/results/:index" element={<ResultDetails />} />
          <Route path="/accuracy-vs-cost" element={<AccuracyVsCost />} />
          <Route path="/throughput" element={<Throughput />} />
          <Route path="/visualization" element={<Visualization />} />
          <Route path="/decision" element={<DecisionSupport />} />
        </Routes>
      </DataHealthGate>
    </BenchmarkDataProvider>
  );
}

export default App;
