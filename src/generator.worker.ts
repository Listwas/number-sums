import { generate, type Difficulty } from "./core/puzzle";
self.onmessage = ({
  data,
}: {
  data: { difficulty: Difficulty; seed: string };
}) => {
  try {
    self.postMessage({ puzzle: generate(data.difficulty, data.seed) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Could not prepare a puzzle.",
    });
  }
};
