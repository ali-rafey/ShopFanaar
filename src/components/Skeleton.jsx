// Placeholder tiles shown for the one round trip a first-time visitor waits
// for the catalog.
export function GridSkeleton({ count = 6 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div className="card-skel" key={i}>
          <div className="card-skel-media" />
          <div className="card-skel-line" />
          <div className="card-skel-line short" />
        </div>
      ))}
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className="pd" aria-busy="true" aria-label="Loading product">
      <div className="pd-media">
        <div className="card-skel-media pd-skel-media" />
      </div>
      <div className="pd-panel">
        <div className="pd-panel-inner">
          <div className="pd-top">
            <div className="card-skel-line short" />
            <div className="card-skel-line" style={{ height: 30, margin: "18px 0 12px" }} />
            <div className="card-skel-line short" />
          </div>
        </div>
      </div>
    </div>
  );
}
