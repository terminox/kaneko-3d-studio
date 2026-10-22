// One OpenSCAD invocation: write files into a fresh work directory, run the
// command line, read back the named outputs. Implementations: the Node build
// (tests and scripts) and the browser worker (the app).

export type RunFiles = Record<string, string | Uint8Array>;

export type RunRequest = {
  /** Paths relative to the work directory, e.g. "model.scad", "uploads/logo.svg". */
  files: RunFiles;
  args: string[];
  /** Output paths (relative to the work directory) to read back after the run. */
  outputs: string[];
};

export type RunResult = {
  exitCode: number;
  /** Missing when OpenSCAD wrote nothing, e.g. because the geometry was empty. */
  outputs: Record<string, Uint8Array | undefined>;
  log: string[];
};

export interface OpenScadRunner {
  run(request: RunRequest): Promise<RunResult>;
}

/** Lines OpenSCAD prints on every run that only add noise to the console. */
export function isNoise(line: string): boolean {
  return /^(Could not initialize localization|Fontconfig error|Geometries in cache|Geometry cache size|CGAL Polyhedrons in cache|CGAL cache size)/.test(
    line.trim(),
  );
}
