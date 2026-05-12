import { Close, ExpandMore } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Chip,
  Drawer,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SharedIngredient { key: string; score: number; }
interface DiffIngredient { key: string; scoreA: number; scoreB: number; }

interface FarthestTwin {
  cityA: string; cityB: string;
  km: number; cosine_sim: number;
  latA: number; lngA: number; latB: number; lngB: number;
  colorA: string; colorB: string;
  shared_ingredients?: SharedIngredient[];
  diff_ingredients?: DiffIngredient[];
}

interface LonelyCuisine {
  city: string; avg_neighbor_similarity: number; continent: string; color: string;
}

interface Crossroads {
  city: string; continents_covered: number; top_neighbors: string[]; color: string;
}

interface DiverseCountry {
  countryCode: string; city_count: number; hue_std_deg: number;
}

interface FlavorFamily {
  cluster_id: number; label: string; top_ingredients: string[];
  city_count: number; continents: string[]; color: string;
}

interface InsightsData {
  farthest_twins: FarthestTwin[];
  lonely_cuisines: LonelyCuisine[];
  crossroads: Crossroads[];
  diverse_countries: DiverseCountry[];
  flavor_families: FlavorFamily[];
}

// ── Farthest Twins accordion ───────────────────────────────────────────────────

function ingredientLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function FarthestTwinsAccordion({ data }: { data: FarthestTwin[] }) {
  const [expanded, setExpanded] = useState<number | false>(false);

  if (!data.length) {
    return (
      <Typography variant="caption" color="text.secondary">No data</Typography>
    );
  }

  return (
    <Box>
      {data.map((d, idx) => (
        <Accordion
          key={idx}
          expanded={expanded === idx}
          onChange={(_, isOpen) => setExpanded(isOpen ? idx : false)}
          disableGutters
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px !important',
            mb: 0.75,
            '&:before': { display: 'none' },
            '&.Mui-expanded': { mt: 0 },
          }}
        >
          {/* Always-visible header */}
          <AccordionSummary
            expandIcon={<ExpandMore sx={{ fontSize: 16 }} />}
            sx={{ minHeight: 44, px: 1.5, py: 0 }}
          >
            <Stack direction="row" alignItems="center" gap={1} width="100%">
              <Box
                sx={{
                  width: 10, height: 10, borderRadius: '50%',
                  bgcolor: d.colorA, flexShrink: 0,
                }}
              />
              <Typography variant="body2" fontWeight={600} fontSize={12} noWrap>
                {d.cityA}
              </Typography>
              <Typography variant="caption" color="text.disabled">↔</Typography>
              <Box
                sx={{
                  width: 10, height: 10, borderRadius: '50%',
                  bgcolor: d.colorB, flexShrink: 0,
                }}
              />
              <Typography variant="body2" fontWeight={600} fontSize={12} noWrap flex={1}>
                {d.cityB}
              </Typography>
              <Stack direction="column" alignItems="flex-end" flexShrink={0} mr={0.5}>
                <Typography variant="caption" color="text.secondary" fontSize={10}>
                  {(d.km / 1000).toFixed(0)}k km
                </Typography>
                <Typography variant="caption" color="success.main" fontSize={10} fontWeight={700}>
                  {(d.cosine_sim * 100).toFixed(0)}% similar
                </Typography>
              </Stack>
            </Stack>
          </AccordionSummary>

          {/* Expanded: ingredient breakdown */}
          <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
            {d.shared_ingredients && d.shared_ingredients.length > 0 && (
              <Box mb={1}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  Shared cuisine base
                </Typography>
                <Stack gap={0.4}>
                  {d.shared_ingredients.slice(0, 6).map((ing) => (
                    <Stack key={ing.key} direction="row" alignItems="center" gap={1}>
                      <Typography variant="caption" sx={{ minWidth: 96, fontSize: 11 }}>
                        {ingredientLabel(ing.key)}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ing.score * 100}
                        sx={{
                          flex: 1, height: 4, borderRadius: 2,
                          bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 2 },
                        }}
                      />
                      <Typography variant="caption" color="text.disabled" fontSize={10} sx={{ minWidth: 28, textAlign: 'right' }}>
                        {(ing.score * 100).toFixed(0)}%
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {d.diff_ingredients && d.diff_ingredients.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  What sets them apart
                </Typography>
                <Stack gap={0.4}>
                  {d.diff_ingredients.slice(0, 4).map((ing) => {
                    const aMore = ing.scoreA > ing.scoreB;
                    return (
                      <Stack key={ing.key} direction="row" alignItems="center" gap={1}>
                        <Typography variant="caption" sx={{ minWidth: 96, fontSize: 11 }}>
                          {ingredientLabel(ing.key)}
                        </Typography>
                        <Box
                          sx={{
                            flex: 1, height: 4, borderRadius: 2,
                            bgcolor: 'action.hover', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {/* cityA bar */}
                          <Box sx={{
                            position: 'absolute', top: 0, left: 0,
                            width: `${ing.scoreA * 100}%`, height: '100%',
                            bgcolor: d.colorA, borderRadius: 2, opacity: 0.85,
                          }} />
                        </Box>
                        <Box
                          sx={{
                            flex: 1, height: 4, borderRadius: 2,
                            bgcolor: 'action.hover', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {/* cityB bar */}
                          <Box sx={{
                            position: 'absolute', top: 0, left: 0,
                            width: `${ing.scoreB * 100}%`, height: '100%',
                            bgcolor: d.colorB, borderRadius: 2, opacity: 0.85,
                          }} />
                        </Box>
                        <Typography
                          variant="caption"
                          fontSize={10}
                          color={aMore ? undefined : 'text.disabled'}
                          sx={{ minWidth: 28, textAlign: 'right' }}
                        >
                          {aMore
                            ? `${d.cityA.split(' ')[0]} ↑`
                            : `${d.cityB.split(' ')[0]} ↑`}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

// ── ECharts option builders ────────────────────────────────────────────────────

function lonelyCuisinesOption(data: LonelyCuisine[]) {
  const vals = data.map((d) => d.avg_neighbor_similarity);
  const minVal = Math.max(0, Math.min(...vals) - 0.02);
  const maxVal = Math.min(1, Math.max(...vals) + 0.01);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = data[params[0]?.dataIndex ?? 0];
        return d
          ? `<b>${d.city}</b><br/>${d.continent}<br/>Avg similarity to neighbors: ${(d.avg_neighbor_similarity * 100).toFixed(1)}%`
          : '';
      },
    },
    grid: { left: 76, right: 48, top: 8, bottom: 16 },
    xAxis: {
      type: 'value',
      min: minVal,
      max: maxVal,
      axisLabel: {
        fontSize: 9,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.city),
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: data.map((d) => ({
        value: d.avg_neighbor_similarity,
        itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right',
        formatter: (p: any) => `${(p.value * 100).toFixed(1)}%`,
        fontSize: 9, color: '#555',
      },
    }],
  };
}

function crossroadsOption(data: Crossroads[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = data[params[0]?.dataIndex ?? 0];
        return d ? `<b>${d.city}</b><br/>Neighbors on ${d.continents_covered} continents` : '';
      },
    },
    grid: { left: 76, right: 48, top: 8, bottom: 16 },
    xAxis: {
      type: 'value', min: 0, max: 6, interval: 1,
      axisLabel: { fontSize: 9 },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.city),
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar', barMaxWidth: 18,
      data: data.map((d) => ({
        value: d.continents_covered,
        itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right',
        formatter: (p: any) => `${p.value} cont.`,
        fontSize: 9, color: '#555',
      },
    }],
  };
}

function diverseCountriesOption(data: DiverseCountry[]) {
  const colors = ['#e85c3a', '#f0a500', '#2e8b57', '#4a9bdf', '#9f6ad1'];
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = data[params[0]?.dataIndex ?? 0];
        return d ? `<b>${d.countryCode}</b><br/>${d.city_count} cities<br/>Hue spread: ${d.hue_std_deg.toFixed(0)}°` : '';
      },
    },
    grid: { left: 36, right: 12, top: 8, bottom: 32 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.countryCode),
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, formatter: (v: number) => `${v}°` },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: 'bar', barMaxWidth: 36,
      data: data.map((d, i) => ({
        value: d.hue_std_deg,
        itemStyle: { color: colors[i % colors.length], borderRadius: [4, 4, 0, 0] },
      })),
      label: {
        show: true, position: 'top',
        formatter: (p: any) => `${p.value.toFixed(0)}°`,
        fontSize: 9, color: '#555',
      },
    }],
  };
}

function flavorFamiliesOption(data: FlavorFamily[]) {
  const sorted = [...data].sort((a, b) => b.city_count - a.city_count);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = sorted[params[0]?.dataIndex ?? 0];
        return d ? `<b>${d.label}</b><br/>${d.city_count} cities<br/>${d.top_ingredients.join(', ')}` : '';
      },
    },
    grid: { left: 80, right: 48, top: 8, bottom: 16 },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 9 },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((d) => d.label),
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar', barMaxWidth: 18,
      data: sorted.map((d) => ({
        value: d.city_count,
        itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right',
        formatter: (p: any) => p.value,
        fontSize: 9, color: '#555',
      },
    }],
  };
}

// ── Card wrapper ───────────────────────────────────────────────────────────────

function InsightCard({
  title,
  subtitle,
  children,
  tags,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  tags?: string[];
}) {
  return (
    <Card
      sx={{
        minWidth: 300,
        maxWidth: 340,
        flexShrink: 0,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 'none',
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: 3 },
      }}
    >
      <CardContent sx={{ pb: '12px !important', pt: 2, px: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} fontSize={13} mb={0.25}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={tags ? 0.75 : 1}>
          {subtitle}
        </Typography>
        {tags && (
          <Stack direction="row" gap={0.5} mb={1} flexWrap="wrap">
            {tags.map((t) => (
              <Chip key={t} label={t} size="small" sx={{ fontSize: 10, height: 20 }} />
            ))}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

// ── Dashboard drawer ───────────────────────────────────────────────────────────

interface DashboardProps {
  open: boolean;
  onClose: () => void;
}

export const Dashboard = ({ open, onClose }: DashboardProps) => {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open || insights || loadError) return;
    fetch('/data/insights.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInsights(d as InsightsData))
      .catch(() => setLoadError(true));
  }, [open, insights, loadError]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          height: '68vh',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          pb: '88px',
          overflow: 'hidden',
          bgcolor: 'background.paper',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          pt: 2,
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box flex={1}>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
            Discover
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Data-driven culinary insights from 6500+ cities
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* Loading / error */}
      {!insights && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80%' }}>
          <Typography color="text.secondary" variant="body2">
            {loadError
              ? 'Run make build-clusters to generate insights.'
              : 'Loading insights…'}
          </Typography>
        </Box>
      )}

      {/* Cards */}
      {insights && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            px: 2.5,
            py: 1.5,
            overflowX: 'auto',
            overflowY: 'hidden',
            height: 'calc(100% - 64px)',
            alignItems: 'flex-start',
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'action.hover' },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          }}
        >
          {/* Farthest Twins — accordion */}
          <InsightCard
            title="Farthest Flavor Twins"
            subtitle="Culinarily identical cities at maximum geographic distance"
          >
            <FarthestTwinsAccordion data={insights.farthest_twins} />
          </InsightCard>

          <InsightCard
            title="Lonely Cuisines"
            subtitle="Cities whose food culture stands most apart from neighbors"
          >
            <ReactECharts
              option={lonelyCuisinesOption(insights.lonely_cuisines)}
              style={{ height: 180 }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </InsightCard>

          <InsightCard
            title="Crossroads Kitchens"
            subtitle="Cities whose cuisine neighbors span the most continents"
          >
            <ReactECharts
              option={crossroadsOption(insights.crossroads)}
              style={{ height: 180 }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </InsightCard>

          <InsightCard
            title="Most Diverse Countries"
            subtitle="Highest intra-country culinary hue spread"
          >
            <ReactECharts
              option={diverseCountriesOption(insights.diverse_countries)}
              style={{ height: 180 }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </InsightCard>

          <InsightCard
            title="Flavor Families"
            subtitle="8 auto-detected global culinary clusters"
            tags={insights.flavor_families
              .sort((a, b) => b.city_count - a.city_count)
              .slice(0, 4)
              .map((f) => f.label)}
          >
            <ReactECharts
              option={flavorFamiliesOption(insights.flavor_families)}
              style={{ height: 180 }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </InsightCard>
        </Box>
      )}
    </Drawer>
  );
};
