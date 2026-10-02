export type PdfBounds = { top: number; bottom: number };

/** Partition a capture without cutting bounded rows or label/bar groups. */
export function paginateReport(height: number, capacity: number, bounds: PdfBounds[]) {
  if (!(capacity > 0) || !Number.isFinite(height)) throw new Error("Invalid PDF dimensions");
  const protectedBounds = bounds.filter(b => b.bottom > b.top && b.bottom - b.top <= capacity);
  const pages: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < height) {
    let end = Math.min(height, start + capacity);
    // Moving a boundary may cross another item in the adjacent column.
    while (end < height) {
      const crossing = protectedBounds.filter(b => b.top < end && b.bottom > end);
      if (!crossing.length) break;
      if (crossing.some(b => b.top <= start)) {
        // Adjacent columns can form an inseparable chain longer than a page.
        // Keep it together; the renderer fits this page within the same margins.
        end = Math.min(height, start + capacity);
        while (true) {
          const connected = protectedBounds.filter(b => b.top < end && b.bottom > end);
          if (!connected.length) break;
          end = Math.max(...connected.map(b => b.bottom));
        }
        break;
      }
      end = Math.min(...crossing.map(b => b.top));
    }
    pages.push({ start, end });
    start = end;
  }
  return pages;
}
