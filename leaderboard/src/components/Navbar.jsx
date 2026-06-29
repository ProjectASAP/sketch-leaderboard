import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav
      style={{
        background: "#222",
        padding: "15px",
        display: "flex",
        gap: "20px",
      }}
    >
      <Link to="/" style={{ color: "white", textDecoration: "none" }}>
        Home
      </Link>

      <Link to="/results" style={{ color: "white", textDecoration: "none" }}>
        Results
      </Link>

      <Link
        to="/accuracy-vs-cost"
        style={{ color: "white", textDecoration: "none" }}
      >
        Accuracy vs Cost
      </Link>

      <Link to="/throughput" style={{ color: "white", textDecoration: "none" }}>
        Throughput
      </Link>

      <Link
        to="/visualization"
        style={{ color: "white", textDecoration: "none" }}
      >
        Visualization
      </Link>

      <Link to="/decision" style={{ color: "white", textDecoration: "none" }}>
        Decision Support
      </Link>
    </nav>
  );
}

export default Navbar;
