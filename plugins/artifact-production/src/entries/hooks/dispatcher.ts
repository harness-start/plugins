import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { main as runDiagram } from "../../domains/diagram/entries/hooks/diagram-production.js";
import { main as runLogo } from "../../domains/logo/entries/hooks/brand-logo-production.js";
import { main as runMusic } from "../../domains/music/entries/hooks/music-production.js";
import { main as runPoster } from "../../domains/poster/entries/hooks/poster-production.js";
import { main as runPresentation } from "../../domains/presentation/entries/hooks/presentation-production.js";
import { main as runPrint } from "../../domains/print/entries/hooks/print-publication-production.js";
import { main as runTraining } from "../../domains/training/entries/hooks/training-program-design.js";
import { main as runVideo } from "../../domains/video/entries/hooks/video-production.js";

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "diagram:diagram-production": ownerHookHandler(runDiagram),
  "logo:brand-logo-production": ownerHookHandler(runLogo),
  "music:music-production": ownerHookHandler(runMusic),
  "poster:poster-production": ownerHookHandler(runPoster),
  "presentation:presentation-production": ownerHookHandler(runPresentation),
  "print:print-publication-production": ownerHookHandler(runPrint),
  "training:training-program-design": ownerHookHandler(runTraining),
  "video:video-production": ownerHookHandler(runVideo),
});
