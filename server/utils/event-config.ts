import type { EventConfig } from "#shared/types/event";
import config from "../../config/event.json";

// Static config, imported once and shared across server routes via auto-import.
export const eventConfig = config as EventConfig;

// Absolute site origin for links that leave the page (og image, api, buttons).
// Falls back to production, because a relative url is useless to a consumer.
export const publicSiteUrl = (): string =>
  useRuntimeConfig().public.siteUrl || "https://nuxtathon.live";
