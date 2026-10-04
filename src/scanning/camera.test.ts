import { describe, expect, it, vi } from "vitest";
import { CameraSession, cameraFailure } from "./camera";
import type { CameraPort, ScanControls } from "./camera";

const video = {} as HTMLVideoElement;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const trackStop = vi.fn(),
    decoderStop = vi.fn();
  const stream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;
  let callback!: (code: string) => void;
  const port: CameraPort = {
    requestStream: vi.fn(async () => stream),
    decode: vi.fn(async (_, __, onCode) => {
      callback = onCode;
      return { stop: decoderStop };
    }),
  };
  return {
    session: new CameraSession(port),
    port,
    stream,
    trackStop,
    decoderStop,
    code: (code: string) => callback(code),
  };
}

describe("camera lifecycle without hardware or network", () => {
  it("does not request permission before explicitly starting", () => {
    const f = fixture();
    expect(f.port.requestStream).not.toHaveBeenCalled();
    f.session.stop();
    expect(f.port.requestStream).not.toHaveBeenCalled();
  });
  it("handles just one code, stops tracks, and ignores repeated callbacks", async () => {
    const f = fixture(),
      onCode = vi.fn();
    await f.session.start(video, onCode);
    f.code("DEMO");
    f.code("DEMO");
    f.code("OTHER");
    expect(onCode).toHaveBeenCalledExactlyOnceWith("DEMO");
    expect(f.trackStop).toHaveBeenCalled();
    expect(f.decoderStop).toHaveBeenCalled();
  });
  it("stops the camera on exit and ignores late decoder callbacks", async () => {
    const f = fixture(),
      onCode = vi.fn();
    await f.session.start(video, onCode);
    f.session.stop();
    f.code("DEMO");
    expect(onCode).not.toHaveBeenCalled();
    expect(f.trackStop).toHaveBeenCalled();
    expect(f.decoderStop).toHaveBeenCalled();
  });
  it("stops a stream whose permission resolves after leaving the page", async () => {
    const f = fixture(),
      permission = deferred<MediaStream>();
    f.port.requestStream = () => permission.promise;
    const start = f.session.start(video, vi.fn());
    f.session.stop();
    permission.resolve(f.stream);
    await start;
    expect(f.trackStop).toHaveBeenCalled();
    expect(f.port.decode).not.toHaveBeenCalled();
  });
  it("stops controls that arrive after exit and aborts pending decoding", async () => {
    const f = fixture(),
      controls = deferred<ScanControls>();
    let signal!: AbortSignal;
    f.port.decode = async (_, __, ___, abortSignal) => {
      signal = abortSignal;
      return controls.promise;
    };
    const start = f.session.start(video, vi.fn());
    await Promise.resolve();
    f.session.stop();
    expect(signal.aborted).toBe(true);
    controls.resolve({ stop: f.decoderStop });
    await start;
    expect(f.trackStop).toHaveBeenCalled();
    expect(f.decoderStop).toHaveBeenCalled();
  });
  it("releases the stream if the decoder fails to start", async () => {
    const f = fixture();
    f.port.decode = async () => {
      throw new Error("Decoder failed");
    };
    await expect(f.session.start(video, vi.fn())).rejects.toThrow(
      "Decoder failed",
    );
    expect(f.trackStop).toHaveBeenCalled();
  });
  it("permission rejection propagates without making a camera or a result", async () => {
    const f = fixture();
    f.port.requestStream = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
    await expect(f.session.start(video, vi.fn())).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(f.port.decode).not.toHaveBeenCalled();
  });
  it("an old permission result does not stop a new session", async () => {
    const f = fixture(),
      permission = deferred<MediaStream>();
    const oldStop = vi.fn();
    const oldStream = {
      getTracks: () => [{ stop: oldStop }],
    } as unknown as MediaStream;
    f.port.requestStream = vi
      .fn()
      .mockReturnValueOnce(permission.promise)
      .mockResolvedValue(f.stream);
    const old = f.session.start(video, vi.fn());
    const onCode = vi.fn();
    await f.session.start(video, onCode);
    permission.resolve(oldStream);
    await old;
    expect(oldStop).toHaveBeenCalled();
    expect(f.trackStop).not.toHaveBeenCalled();
    f.code("NEW");
    expect(onCode).toHaveBeenCalledExactlyOnceWith("NEW");
  });
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "missing"],
    ["OverconstrainedError", "missing"],
    ["NotReadableError", "busy"],
    ["UnknownError", "failed"],
  ])("classifies %s without displaying raw error content", (name, expected) => {
    expect(cameraFailure({ name, message: "private browser details" })).toBe(
      expected,
    );
  });
});
