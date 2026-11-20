/** Deployment and CI files: recognised by marker only (what they build or deploy is stated only in scripts). */
import type { EcosystemPack } from "../types";

export const markersOnly: EcosystemPack = {
  id: "markers",
  label: "Recognised by marker only",
  markers: [
    { kind: "Docker image", pattern: "Dockerfile", matches: (f) => f === "Dockerfile", priority: 90 },
    { kind: "Jenkins pipeline", pattern: "Jenkinsfile", matches: (f) => f === "Jenkinsfile", priority: 100 },
    { kind: "Terraform", pattern: "*.tf", matches: (f) => f.endsWith(".tf"), priority: 110 },
  ],
};
