import type { BatchEntry, BatchVerificationResponse, VerificationOutcome } from "./types.js";

export interface BatchProgress {
  completed: number;
  total: number;
}

export interface BatchRunOptions {
  signal: AbortSignal;
  chunkSize?: number;
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
}

export type ChunkVerifier = (
  entries: BatchEntry[],
  signal: AbortSignal,
) => Promise<BatchVerificationResponse>;

export function chunkEntries(entries: BatchEntry[], size = 5): BatchEntry[][] {
  const chunks: BatchEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
}

export async function processBrowserBatch(
  entries: BatchEntry[],
  verify: ChunkVerifier,
  options: BatchRunOptions,
): Promise<VerificationOutcome[]> {
  const chunks = chunkEntries(entries, options.chunkSize ?? 5);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, chunks.length || 1));
  const output = new Array<VerificationOutcome>(entries.length);
  let nextChunk = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (options.signal.aborted) throw new DOMException("Batch cancelled", "AbortError");
      const chunkIndex = nextChunk;
      nextChunk += 1;
      if (chunkIndex >= chunks.length) return;
      const chunk = chunks[chunkIndex]!;
      const offset = chunkIndex * (options.chunkSize ?? 5);
      try {
        const response = await verify(chunk, options.signal);
        response.items.forEach((item) => {
          output[offset + item.index] = item.result;
        });
      } catch (error) {
        if (options.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          throw error;
        }
        chunk.forEach((entry, itemIndex) => {
          output[offset + itemIndex] = {
            outcome: "UNABLE_TO_VERIFY",
            referenceId: entry.application.referenceId,
            filename: entry.image.name,
            error: {
              code: "BATCH_REQUEST_FAILED",
              message: error instanceof Error ? error.message : "This group could not be processed.",
              retryable: true,
            },
            processingMs: 0,
          };
        });
      }
      completed += chunk.length;
      options.onProgress?.({ completed, total: entries.length });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return output;
}
