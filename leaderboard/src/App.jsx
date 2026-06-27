import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import AccuracyVsCost from "./pages/AccuracyVsCost";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route
          path="/accuracy-vs-cost"
          element={<AccuracyVsCost />}
        />
      </Routes>
    </>
  );
}

export default App;