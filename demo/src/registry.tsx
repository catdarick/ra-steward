import { Box, Link, List, ListItem, ListItemText, Tooltip, Typography, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { CellComponent, WidgetComponent } from "ra-steward";

interface SalesPoint {
  day: string;
  total: number;
}

/** The widget `component @"SalesChart"`: sales by day, as bars. */
export const SalesChart: WidgetComponent = ({ data }) => {
  const points = (data as SalesPoint[]) ?? [];
  const max = Math.max(1, ...points.map((p) => p.total));
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Sales
      </Typography>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 160 }}>
        {points.map((p) => (
          <Box
            key={p.day}
            title={`${p.day}: ${p.total}`}
            sx={{ flex: 1, height: `${(p.total / max) * 100}%`, bgcolor: "primary.main", borderRadius: "2px 2px 0 0", opacity: 0.8 }}
          />
        ))}
      </Box>
    </Box>
  );
};

/** The widget `component @"OrderTimeline"`: the events of an order. */
export const OrderTimeline: WidgetComponent = ({ data }) => (
  <Box>
    <Typography variant="h6">Timeline</Typography>
    <List dense>
      {((data as string[]) ?? []).map((e, i) => (
        <ListItem key={i}>
          <ListItemText primary={e} />
        </ListItem>
      ))}
    </List>
  </Box>
);

/** The cell `customKind @"MapPoint"`: a position, linked to a map. */
export const MapPoint: CellComponent = ({ value, props }) => {
  const p = value as { lat: number; lon: number };
  const zoom = (props as { zoom?: number })?.zoom ?? 12;
  return (
    <Link href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=${zoom}/${p.lat}/${p.lon}`} target="_blank" rel="noopener">
      {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
    </Link>
  );
};

/** An option of an experiment and its share of the traffic, as the server sends them. */
interface Share {
  name: string;
  percent: number;
}

// The categorical slots of the reference palette, light and dark stepped apart.
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

const useSeries = () => SERIES[useTheme().palette.mode];

/** FNV-1a: a name's number, the same on every page and every load. */
const hash = (name: string) => {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0;
  return h;
};

/**
 * The slots of the options of a bar: an option's color follows its name, whatever row, page or
 * filter it is shown in. Two names of one bar never share a color: the later one takes the next
 * free slot.
 */
export const slotsOf = (names: string[], slots: number): number[] => {
  const taken = new Set<number>();
  return names.map((n) => {
    let slot = hash(n) % slots;
    for (let i = 0; i < slots && taken.has(slot); i++) slot = (slot + 1) % slots;
    taken.add(slot);
    return slot;
  });
};

/** Dark ink on a light fill, white on a dark one. */
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b0b0b" : "#ffffff";
};

const Swatch = ({ color }: { color: string }) => <Box component="span" sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: color, flex: "none" }} />;

const CHAR = 6.5;

/**
 * The cell `customKind @"SplitBar"`: the options as segments of one bar, in their order, by their
 * shares, 2px apart, each in the color of its name.
 * A segment says its option and share inside when they fit, its share alone when only that fits,
 * and both on hover. With `{legend: true}` the bar is a thin one, without text, over a legend.
 */
export const SplitBar: CellComponent = ({ value, props }) => {
  const series = useSeries();
  const shares = (value as Share[]) ?? [];
  const colors = slotsOf(
    shares.map((s) => s.name),
    series.length,
  ).map((slot) => series[slot]);
  const legend = (props as { legend?: boolean } | null)?.legend ?? false;
  const bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!bar.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(bar.current);
    return () => observer.disconnect();
  }, []);
  const total = shares.reduce((t, s) => t + s.percent, 0) || 1;
  const room = width - 2 * Math.max(0, shares.length - 1);
  return (
    <Box sx={{ minWidth: 200 }}>
      <Box ref={bar} sx={{ display: "flex", gap: "2px", height: legend ? 8 : 20 }}>
        {shares.map((s, i) => {
          const color = colors[i];
          const px = (room * s.percent) / total;
          const full = `${s.name} ${s.percent}%`;
          const text = legend ? "" : full.length * CHAR + 10 <= px ? full : `${s.percent}%`.length * CHAR + 8 <= px ? `${s.percent}%` : "";
          return (
            <Tooltip key={s.name} title={full} disableInteractive>
              <Box
                sx={{
                  flex: `${s.percent} 1 0`,
                  minWidth: 2,
                  bgcolor: color,
                  color: inkOn(color),
                  borderRadius: `${i === 0 ? 4 : 0}px ${i === shares.length - 1 ? 4 : 0}px ${i === shares.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
                  py: legend ? 0 : undefined,
                  fontSize: 11,
                  lineHeight: "20px",
                  fontWeight: 500,
                  px: "5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {text}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      {legend && (
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.25, mt: 0.75 }}>
          {shares.map((s, i) => (
            <Box key={s.name} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 12 }}>
              <Swatch color={colors[i]} />
              <Box component="span" sx={{ color: "text.primary" }}>
                {s.name}
              </Box>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {s.percent}%
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
