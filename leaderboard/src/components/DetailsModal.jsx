import "./DetailsModal.css";
function DetailsModal({ data, onClose }) {
  if (!data) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>

        <h2>Benchmark Details</h2>

        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}

export default DetailsModal;