export type ScanControls = { stop(): void };
export type CameraPort = {
  requestStream(): Promise<MediaStream>;
  decode(
    stream: MediaStream,
    video: HTMLVideoElement,
    onCode: (code: string) => void,
    signal: AbortSignal,
  ): Promise<ScanControls>;
};

type Run = {
  stream?: MediaStream;
  controls?: ScanControls;
  consumed: boolean;
  abort: AbortController;
};

// Owns one camera session; safe even if permission/decoder resolves after exit.
// No domain state or repository is reachable here.
export class CameraSession {
  private run: Run | null = null;
  constructor(private readonly port: CameraPort) {}

  stop() {
    const run = this.run;
    this.run = null;
    if (run) this.release(run);
  }

  private release(run: Run) {
    run.abort.abort();
    try {
      run.controls?.stop();
    } finally {
      run.stream?.getTracks().forEach((track) => track.stop());
    }
  }

  async start(video: HTMLVideoElement, onCode: (code: string) => void) {
    this.stop();
    const run: Run = { consumed: false, abort: new AbortController() };
    this.run = run;
    try {
      run.stream = await this.port.requestStream();
      if (this.run !== run) {
        this.release(run);
        return;
      }
      run.controls = await this.port.decode(
        run.stream,
        video,
        (code) => {
          if (this.run !== run || run.consumed) return;
          run.consumed = true;
          this.stop();
          onCode(code);
        },
        run.abort.signal,
      );
      if (this.run !== run) this.release(run);
    } catch (error) {
      // A cancelled session must not update an unmounted screen or stop a new one.
      if (this.run !== run) {
        this.release(run);
        return;
      }
      this.stop();
      throw error;
    }
  }
}

export type CameraFailure =
  "secure" | "unsupported" | "denied" | "missing" | "busy" | "failed";
export function cameraFailure(error: unknown): CameraFailure {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : "";
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  )
    return "denied";
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError"
  )
    return "missing";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  return "failed";
}

export const browserCamera: CameraPort = {
  requestStream: () =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }),
  async decode(stream, video, onCode, signal) {
    // Keep the decoder out of the initial bundle; never load a scanned URL.
    const [{ BrowserCodeReader }, { productCodeReader }] = await Promise.all([
      import("@zxing/browser"),
      import("./decoder"),
    ]);
    signal.throwIfAborted();
    const reader = new BrowserCodeReader(productCodeReader(), undefined, {
      delayBetweenScanAttempts: 200,
      delayBetweenScanSuccess: 500,
    });
    const detach = () => {
      // An old session must never detach the preview of a newer one.
      if (video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
    };
    let onAbort: () => void = () => {};
    try {
      video.srcObject = stream;
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => {
          detach();
          reject(new DOMException("Scan cancelled", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      await Promise.race([video.play(), cancelled]);
      signal.throwIfAborted();
      signal.removeEventListener("abort", onAbort);
      const controls = reader.scan(video, (result) => {
        // NotFound/Checksum/Format on a frame are normal scan misses.
        if (result) onCode(result.getText());
      });
      return {
        stop() {
          controls.stop();
          detach();
        },
      };
    } catch (error) {
      signal.removeEventListener("abort", onAbort);
      detach();
      throw error;
    }
  },
};
