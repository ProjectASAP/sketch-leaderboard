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

      <Link to="/throughput" style={{ color: "white", textDecoration: "none" }}>
        Throughput
      </Link>
    </nav>
  );
}

export default Navbar;
