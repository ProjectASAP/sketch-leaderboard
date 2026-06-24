import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import ResultDetails from "./pages/ResultDetails";
import Throughput from "./pages/Throughput";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route path="/results/:index" element={<ResultDetails />} />
        <Route path="/throughput" element={<Throughput />} />
      </Routes>
    </>
  );
}

export default App;
