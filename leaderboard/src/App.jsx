import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import ResultDetails from "./pages/ResultDetails";
import Throughput from "./pages/Throughput";
import Visualization from "./pages/Visualization";
import DecisionSupport from "./pages/DecisionSupport";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route path="/results/:index" element={<ResultDetails />} />
        <Route path="/throughput" element={<Throughput />} />
        <Route path="/visualization" element={<Visualization />} />
        <Route path="/decision" element={<DecisionSupport />} />
      </Routes>
    </>
  );
}

export default App;
