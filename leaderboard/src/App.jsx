import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import SketchDetails from "./pages/SketchDetails";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route path="/sketch" element={<SketchDetails />} />
      </Routes>
    </>
  );
}

export default App;
