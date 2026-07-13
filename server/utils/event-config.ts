import type { EventConfig } from "#shared/types/event";
import config from "../../config/event.json";

// Static config, imported once and shared across server routes via auto-import.
export const eventConfig = config as EventConfig;
