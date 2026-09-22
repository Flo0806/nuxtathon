import { Box, Column, Document, Image, Page, Positioned, Row, Svg, Text } from "@jasy/pdf";
import type { Award, EventConfig, LeaderboardEntry } from "#shared/types/event";
import { formatWindow } from "./og-image";

// Certificate palette, same tokens as the site.
const C = {
  base: "#04100B",
  line: "#1C4A38",
  primary: "#00DC82",
  mint: "#80EEC0",
  amber: "#FFB020",
  fg: "#D7FCEC",
  muted: "#6FA891",
};

// A4 landscape in points.
const W = 841.89;
const H = 595.28;

const NUXT_MARK =
  "M281.44 397.667H438.32C443.326 397.667 448.118 395.908 452.453 393.427C456.789 390.946 461.258 387.831 463.76 383.533C466.262 379.236 468.002 374.36 468 369.399C467.998 364.437 466.266 359.563 463.76 355.268L357.76 172.947C355.258 168.65 352.201 165.534 347.867 163.053C343.532 160.573 337.325 158.813 332.32 158.813C327.315 158.813 322.521 160.573 318.187 163.053C313.852 165.534 310.795 168.65 308.293 172.947L281.44 219.587L227.733 129.13C225.229 124.834 222.176 120.307 217.84 117.827C213.504 115.346 208.713 115 203.707 115C198.701 115 193.909 115.346 189.573 117.827C185.238 120.307 180.771 124.834 178.267 129.13L46.8267 355.268C44.3208 359.563 44.0022 364.437 44 369.399C43.9978 374.36 44.3246 379.235 46.8267 383.533C49.3288 387.83 53.7979 390.946 58.1333 393.427C62.4688 395.908 67.2603 397.667 72.2667 397.667H171.2C210.401 397.667 238.934 380.082 258.827 346.787L306.88 263.4L332.32 219.587L410.053 352.44H306.88L281.44 397.667ZM169.787 352.44H100.533L203.707 174.36L256 263.4L221.361 323.784C208.151 345.387 193.089 352.44 169.787 352.44Z";

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${NUXT_MARK}" fill="${C.primary}"/></svg>`;

// Full-bleed grid as one path of explicit lines (jasy's SVG has no <pattern>),
// vector so it stays crisp in print.
function gridSvg(step = 28): string {
  const d: string[] = [];
  for (let x = step; x < W; x += step) d.push(`M${x} 0V${H}`);
  for (let y = step; y < H; y += step) d.push(`M0 ${y}H${W}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d.join("")}" fill="none" stroke="${C.line}" stroke-opacity="0.45" stroke-width="0.6"/></svg>`;
}

export interface CertificateInput {
  config: EventConfig;
  entry: LeaderboardEntry;
  // Present for an award certificate; the participation one has none.
  award?: Award & { iconBody: string };
  totalContributors: number;
  finalizedAt: string;
  signedBy: string;
  // GitHub avatar bytes, already fetched. Optional so a fetch failure still
  // yields a certificate.
  avatar?: Uint8Array;
  fonts: { display: Uint8Array; mono: Uint8Array; monoBold: Uint8Array; script: Uint8Array };
}

const mono = (text: string, size: number, color: string, extra: object = {}) =>
  Text(text, { font: "JetBrains Mono", size, color, ...extra });

// Phosphor "fill" glyph as its own SVG, sized by the caller. The bodies use
// currentColor, which has no meaning outside a document, so it is substituted.
const iconSvg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body.replaceAll("currentColor", color)}</svg>`;

// Shared page: background, frames, header, recipient, signature. The variant
// only fills the headline and the achievement block. `width` on the text
// blocks matters: a Positioned child shrink-wraps, so without it long lines
// never wrap.
function certificatePage(
  input: CertificateInput,
  headline: string,
  body: ReturnType<typeof Column>,
) {
  const { config, entry, finalizedAt, signedBy, avatar, award } = input;
  const textWidth = W - 200;

  return Page({ size: { width: W, height: H }, margin: 0 }, [
    Box({ relative: true, bg: C.base, width: W, height: H, overflow: "hidden" }, [
      Positioned({ top: 0, left: 0 }, Svg(gridSvg(), { width: W, height: H })),
      Positioned(
        { top: 28, left: 28 },
        Box({ width: W - 56, height: H - 56, border: C.line, borderWidth: 1 }, []),
      ),
      Positioned(
        { top: 34, left: 34 },
        Box(
          { width: W - 68, height: H - 68, border: award ? C.amber : C.primary, borderWidth: 0.5 },
          [],
        ),
      ),

      Positioned({ h: "center", top: 62 }, Svg(logoSvg, { width: 44, height: 44 })),
      Positioned(
        { h: "center", top: 118 },
        mono(`${config.title.toUpperCase()}  ·  ${config.eyebrow.toUpperCase()}`, 9.5, C.amber, {
          letterSpacing: 3,
        }),
      ),
      Positioned(
        { h: "center", top: 142 },
        Text(headline, { font: "Chakra Petch", size: 30, color: C.mint, letterSpacing: 4 }),
      ),

      Positioned(
        { h: "center", top: 200 },
        mono(award ? "IS AWARDED TO" : "THIS IS TO CERTIFY THAT", 8.5, C.muted, {
          letterSpacing: 3,
        }),
      ),
      Positioned(
        { h: "center", top: 224 },
        Row({ gap: 18, align: "center" }, [
          ...(avatar ? [Image(avatar, { width: 64, height: 64, fit: "cover", radius: 32 })] : []),
          Column({ gap: 4 }, [
            Text(entry.name || entry.login, { font: "Chakra Petch", size: 34, color: C.fg }),
            mono(`@${entry.login}`, 12, C.primary),
          ]),
        ]),
      ),

      Positioned({ h: "center", top: 318 }, Box({ width: textWidth }, [body])),

      // Signature sits ON the rule, like a signed line; the printed name stays
      // below it. Placeholder handwriting until the organizer sends a real one.
      Positioned(
        { bottom: 64, left: 96 },
        Column({ gap: 6 }, [
          Box({ relative: true, width: 200, borderBottom: C.muted, borderWidth: 0.8, height: 1 }, [
            Positioned(
              { h: "start", bottom: 4, left: 6 },
              Text(signedBy, { font: "Caveat", size: 26, color: C.mint }),
            ),
          ]),
          mono(signedBy, 9, C.fg),
          mono("Organizer", 7.5, C.muted, { letterSpacing: 2 }),
        ]),
      ),
      Positioned(
        { bottom: 64, right: 96 },
        Column({ gap: 6, align: "end" }, [
          Box({ width: 200, borderBottom: C.muted, borderWidth: 0.8, height: 1 }, []),
          mono(finalizedAt.slice(0, 10), 9, C.fg),
          mono("Date", 7.5, C.muted, { letterSpacing: 2 }),
        ]),
      ),
      Positioned(
        { h: "center", bottom: 40 },
        mono("nuxtathon.live", 7.5, C.muted, { letterSpacing: 3 }),
      ),
    ]),
  ]);
}

function finish(input: CertificateInput, kind: string, page: ReturnType<typeof Page>) {
  const { config, entry, fonts } = input;
  const doc = Document(
    { meta: { title: `${config.title} - ${kind} - ${entry.login}`, author: config.title } },
    [page],
  );
  doc.addFont("Chakra Petch", fonts.display);
  doc.addFont("Caveat", fonts.script);
  doc.addFont("JetBrains Mono", { normal: fonts.mono, bold: fonts.monoBold });
  return doc;
}

export function participationCertificate(input: CertificateInput) {
  const { config, entry, totalContributors } = input;
  const count = entry.score;
  const body = Column({ gap: 8, align: "center" }, [
    mono(
      `took part in ${config.title} ${config.eyebrow}, the Nuxt community hackathon, and closed ${count} ${count === 1 ? "issue" : "issues"} in nuxt/nuxt during ${formatWindow(config)}.`,
      11,
      C.fg,
      { align: "center", lineHeight: 1.5 },
    ),
    mono(`One of ${totalContributors} contributors who made it happen. Thank you.`, 10, C.muted, {
      align: "center",
    }),
  ]);
  return finish(
    input,
    "Certificate of Participation",
    certificatePage(input, "CERTIFICATE OF PARTICIPATION", body),
  );
}

export function awardCertificate(
  input: CertificateInput & { award: Award & { iconBody: string } },
) {
  const { config, award } = input;
  const body = Column({ gap: 10, align: "center" }, [
    Svg(iconSvg(award.iconBody, C.amber), { width: 40, height: 40 }),
    Text(award.title, { font: "Chakra Petch", size: 22, color: C.amber, align: "center" }),
    ...(award.text ? [mono(award.text, 11, C.fg, { align: "center", lineHeight: 1.5 })] : []),
    mono(`${config.title} ${config.eyebrow}  ·  ${formatWindow(config)}`, 9, C.muted, {
      align: "center",
      letterSpacing: 1,
    }),
  ]);
  return finish(input, "Award", certificatePage(input, "AWARD", body));
}
