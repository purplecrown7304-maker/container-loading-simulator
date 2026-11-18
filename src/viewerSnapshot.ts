/**
 * Exports ask the live 3D viewer for a picture through this registry.
 *
 * The viewer renders on demand and does not preserve its WebGL drawing buffer, so a
 * canvas read from outside the render loop returns an empty (white) image once the
 * last frame has been presented. The registered provider renders a frame and copies
 * the canvas in the same task instead.
 */
export type ViewerSnapshotProvider = () => Promise<Blob | null>;

const providers: ViewerSnapshotProvider[] = [];

export function registerViewerSnapshot(provider: ViewerSnapshotProvider) {
  providers.push(provider);
  return () => {
    const index = providers.indexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}

/** Picture of the most recently mounted viewer, or null when no viewer is mounted. */
export function captureViewerSnapshot(): Promise<Blob | null> | null {
  const provider = providers[providers.length - 1];
  return provider ? provider() : null;
}
