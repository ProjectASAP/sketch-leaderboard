import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";
import ResultDetails from "./pages/ResultDetails";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
        <Route path="/results/:index" element={<ResultDetails />} />
      </Routes>
    </>
  );
}

export default App;
