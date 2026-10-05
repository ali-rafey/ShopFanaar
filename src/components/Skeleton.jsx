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
    <div className="wrap pdp" aria-busy="true" aria-label="Loading product">
      <div className="pdp-media">
        <div className="card-skel-media" style={{ aspectRatio: "2 / 3" }} />
      </div>
      <div className="pdp-info">
        <div className="card-skel-line short" />
        <div className="card-skel-line" style={{ height: 36, margin: "18px 0" }} />
        <div className="card-skel-line short" />
      </div>
    </div>
  );
}
