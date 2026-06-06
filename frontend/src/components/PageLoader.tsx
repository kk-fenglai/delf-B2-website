/** Lightweight route fallback — no Ant Design import to keep the initial chunk small. */
export default function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-[40vh]"
      role="status"
      aria-label="Loading"
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-blue-700 border-t-transparent animate-spin"
      />
    </div>
  );
}
