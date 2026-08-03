// Local face detection (runs BEFORE the paid Perfect Corp call) so we can:
//   1. reject a no-face upload instantly with a clear message (0 wait, 0 unit),
//   2. crop precisely to the real face wherever it sits in the frame.
//
// Uses face-api's tinyFaceDetector on the tfjs WASM backend — no native build
// (tfjs-node's prebuilt addon fails to load on Node 24), works in the serverless
// route. Model weights ship inside the @vladmandic/face-api package. The backend
// + model load once per process (memoized).

import * as tf from "@tensorflow/tfjs";
import * as wasm from "@tensorflow/tfjs-backend-wasm";
// The .node-wasm build uses the injected @tensorflow/tfjs (no tfjs-node).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dist path has a sibling .d.ts but TS can't always resolve it
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import sharp from "sharp";

export interface FaceBox { x: number; y: number; width: number; height: number; }

const cwd = () => process.cwd().replace(/\\/g, "/");

let ready: Promise<void> | null = null;
function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      wasm.setWasmPaths(`${cwd()}/node_modules/@tensorflow/tfjs-backend-wasm/dist/`);
      await tf.setBackend("wasm");
      await tf.ready();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(`${cwd()}/node_modules/@vladmandic/face-api/model`);
    })();
  }
  return ready;
}

// Returns the largest detected face box, or null if no face is present.
// Throws only if the detector itself can't initialize (caller may then fall
// back to a heuristic crop rather than rejecting a possibly-valid photo).
export async function detectFace(buffer: Buffer): Promise<FaceBox | null> {
  await init();
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
  try {
    // face-api bundles its own tfjs-core types; the tensor type won't line up
    // across the two copies, so pass it through as an opaque net input.
    const det = await faceapi.detectSingleFace(
      t as unknown as Parameters<typeof faceapi.detectSingleFace>[0],
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
    );
    if (!det) return null;
    const b = det.box;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } finally {
    t.dispose();
  }
}
