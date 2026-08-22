import { devicer } from "devicer-suite";

type StoredFingerprint = devicer.StoredFingerprint;

type FingerprintStorage = {
  getAllFingerprints: () => Promise<StoredFingerprint[]>;
};

function getConfidence(left: StoredFingerprint, right: StoredFingerprint): number {
  return devicer.calculateConfidence(left.fingerprint, right.fingerprint);
}

export async function clusterFingerprints(
  storage: FingerprintStorage,
  distanceThreshold = 0.15,
  minClusterSize = 2,
): Promise<[StoredFingerprint[][], StoredFingerprint[]]> {
  const fingerprints = await storage.getAllFingerprints();
  return clusterStoredFingerprints(fingerprints, distanceThreshold, minClusterSize);
}

export function clusterStoredFingerprints(
  fingerprints: StoredFingerprint[],
  distanceThreshold = 0.15,
  minClusterSize = 2,
): [StoredFingerprint[][], StoredFingerprint[]] {
  if (fingerprints.length === 0) {
    return [[], []];
  }

  const similarityThreshold = Math.max(0, Math.min(1, 1 - distanceThreshold)) * 100;
  const visited = new Set<string>();
  const clusters: StoredFingerprint[][] = [];
  const uniques: StoredFingerprint[] = [];

  for (const seed of fingerprints) {
    if (visited.has(seed.id)) {
      continue;
    }

    const cluster: StoredFingerprint[] = [seed];
    visited.add(seed.id);

    for (const candidate of fingerprints) {
      if (visited.has(candidate.id)) {
        continue;
      }

      const confidence = getConfidence(seed, candidate);
      if (confidence >= similarityThreshold) {
        cluster.push(candidate);
        visited.add(candidate.id);
      }
    }

    if (cluster.length >= minClusterSize) {
      clusters.push(cluster);
    } else {
      uniques.push(...cluster);
    }
  }

  return [clusters, uniques];
}
