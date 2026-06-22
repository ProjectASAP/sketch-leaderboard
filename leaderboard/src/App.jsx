import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultTable from "./pages/ResultTable";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<ResultTable />} />
      </Routes>
    </>
  );
}

export default App;


// import { useEffect, useState } from "react";

// function App() {
//   const [results, setResults] = useState([]);

//   useEffect(() => {
//     async function loadData() {
//       try {
//         const response = await fetch("/data/all.jsonl");
//         const text = await response.text();

//         const parsed = text
//           .trim()
//           .split("\n")
//           .map((line) => JSON.parse(line));

//         setResults(parsed);
//       } catch (err) {
//         console.error(err);
//       }
//     }

//     loadData();
//   }, []);

//   return (
//     <div style={{ padding: "20px" }}>
//       <h1>Sketch Leaderboard</h1>

//       <h3>Total Records: {results.length}</h3>

//       {results.slice(0, 5).map((item, index) => (
//         <div
//           key={index}
//           style={{
//             border: "1px solid gray",
//             marginBottom: "10px",
//             padding: "10px",
//           }}
//         >
//           <p>
//             <strong>Sketch:</strong> {item.sketch}
//           </p>

//           <p>
//             <strong>Implementation:</strong> {item.impl}
//           </p>

//           <p>
//             <strong>Language:</strong> {item.language}
//           </p>
//         </div>
//       ))}
//     </div>
//   );
// }

// export default App;