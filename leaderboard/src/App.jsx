import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import AccuracyVsCost from "./pages/AccuracyVsCost";
import ResultDetails from "./pages/ResultDetails";
import Throughput from "./pages/Throughput";
import Visualization from "./pages/Visualization";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route path="/results/:index" element={<ResultDetails />} />
        <Route path="/accuracy-vs-cost" element={<AccuracyVsCost />} />
        <Route path="/throughput" element={<Throughput />} />
        <Route path="/visualization" element={<Visualization />} />
      </Routes>
    </>
  );
}

export default App;
