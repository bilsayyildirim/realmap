import CloseIcon from '@mui/icons-material/Close';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { Autocomplete, Box, CircularProgress, IconButton, InputBase, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
// @ts-ignore
import type { Place } from '@realmap/shared';
import { useDiscoveries } from '../hooks/useDiscoveries';
import { citiesForIngredient, findCulinaryPath } from '../utils/discoveryStats';
import { getCityColor } from '../utils/colorUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  onCitySelect: (cityId: string) => void;
}

// "GB" → "United Kingdom"
const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
function countryName(code?: string): string {
  if (!code) return '';
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}
function flag(cc?: string): string {
  if (!cc) return '';
  try { return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397)); } catch { return ''; }
}

const TABS = ['Twins', 'Lonely', 'Diverse', 'Atlas', 'Path'] as const;

export function DiscoveriesPanel({ open, onClose, onCitySelect }: Props) {
  const [tab, setTab] = useState<number>(0);
  const { stats, loading } = useDiscoveries(open);

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        height: open ? '62vh' : 0,
        bgcolor: 'rgba(14,14,24,0.97)',
        backdropFilter: 'blur(28px)',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
        transition: 'height 0.28s cubic-bezier(.4,0,.2,1)',
        zIndex: 1100,
        overflow: 'hidden',
        color: '#eee',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pt: 1.5, pb: 0.5, position: 'relative' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: 0.3 }}>
          Discoveries
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#666', ml: 1.5 }}>
          Things hidden in the data
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 6, right: 8, color: '#666', '&:hover': { color: '#eee' } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          px: 1, minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, fontSize: 12, color: '#666', textTransform: 'none', minWidth: 0, px: 1.8, py: 0.5 },
          '& .Mui-selected': { color: '#fff' },
          '& .MuiTabs-indicator': { bgcolor: '#fff', height: 1.5 },
        }}
      >
        {TABS.map((t) => <Tab key={t} label={t} />)}
      </Tabs>

      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 2.5, py: 1.5,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 2 },
      }}>
        {loading || !stats ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 1.5 }}>
            <CircularProgress size={20} sx={{ color: '#888' }} />
            <Typography sx={{ fontSize: 12, color: '#666' }}>computing world-scale discoveries…</Typography>
          </Box>
        ) : (
          <>
            {tab === 0 && <TwinsTab stats={stats} onCitySelect={onCitySelect} />}
            {tab === 1 && <LonelyTab stats={stats} onCitySelect={onCitySelect} />}
            {tab === 2 && <DiverseTab stats={stats} />}
            {tab === 3 && <AtlasTab stats={stats} onCitySelect={onCitySelect} />}
            {tab === 4 && <PathTab stats={stats} onCitySelect={onCitySelect} />}
          </>
        )}
      </Box>
    </Box>
  );
}

// ─── TWINS ───────────────────────────────────────────────────────────────────
function TwinsTab({ stats, onCitySelect }: { stats: any; onCitySelect: (id: string) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 11, color: '#888', mb: 1.2, lineHeight: 1.5 }}>
        Pairs of cities far apart geographically but eating like cousins. Historical trade routes,
        migrations and parallel climates made visible.
      </Typography>
      {stats.twins.slice(0, 20).map((t: any, i: number) => (
        <TwinRow key={i} a={t.a} b={t.b} geoKm={t.geoKm} dist={t.embeddingDist} onCitySelect={onCitySelect} />
      ))}
    </>
  );
}

function TwinRow({ a, b, geoKm, dist, onCitySelect }:
  { a: Place; b: Place; geoKm: number; dist: number; onCitySelect: (id: string) => void }) {
  const colA = getCityColor(a as any);
  const colB = getCityColor(b as any);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', py: 0.7, borderBottom: '1px solid #1a1a2a', gap: 1 }}>
      <CityChip place={a} color={colA} onClick={() => onCitySelect((a as any).id)} />
      <SwapHorizIcon sx={{ color: '#444', fontSize: 14 }} />
      <CityChip place={b} color={colB} onClick={() => onCitySelect((b as any).id)} />
      <Box sx={{ ml: 'auto', textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontSize: 10, color: '#777', lineHeight: 1.2 }}>{Math.round(geoKm).toLocaleString()} km apart</Typography>
        <Typography sx={{ fontSize: 10, color: '#444', lineHeight: 1.2 }}>Δ {dist.toFixed(2)}</Typography>
      </Box>
    </Box>
  );
}

// ─── LONELY ──────────────────────────────────────────────────────────────────
function LonelyTab({ stats, onCitySelect }: { stats: any; onCitySelect: (id: string) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 11, color: '#888', mb: 1.2, lineHeight: 1.5 }}>
        The world's most singular cuisines — cities whose closest culinary match anywhere on Earth is
        still very different. These cuisines stand alone.
      </Typography>
      {stats.loneliest.slice(0, 20).map((l: any, i: number) => {
        const col = getCityColor(l.place as any);
        return (
          <Box key={(l.place as any).id ?? i} sx={{ display: 'flex', alignItems: 'center', py: 0.7, borderBottom: '1px solid #1a1a2a', gap: 1 }}>
            <Typography sx={{ fontSize: 11, color: '#555', minWidth: 22, textAlign: 'right' }}>#{i + 1}</Typography>
            <CityChip place={l.place} color={col} onClick={() => onCitySelect((l.place as any).id)} />
            <Box sx={{ ml: 'auto', textAlign: 'right', flexShrink: 0 }}>
              <Typography sx={{ fontSize: 10, color: '#777', lineHeight: 1.2 }}>
                isolation Δ {l.nearestDist.toFixed(2)}
              </Typography>
              <Typography sx={{ fontSize: 10, color: '#444', lineHeight: 1.2 }}>
                nearest: {l.nearestCity?.name}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </>
  );
}

// ─── COUNTRY DIVERSITY ───────────────────────────────────────────────────────
function DiverseTab({ stats }: { stats: any }) {
  const max = stats.countryDiversity[0]?.meanIntraDistance ?? 1;
  return (
    <>
      <Typography sx={{ fontSize: 11, color: '#888', mb: 1.2, lineHeight: 1.5 }}>
        Countries with the greatest internal culinary diversity — where each city's food differs
        most from its national neighbours. The most culturally polyphonic kitchens on Earth.
      </Typography>
      {stats.countryDiversity.slice(0, 30).map((c: any, i: number) => {
        const pct = (c.meanIntraDistance / max) * 100;
        return (
          <Box key={c.countryCode} sx={{ py: 0.6, borderBottom: '1px solid #1a1a2a' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.3, gap: 1 }}>
              <Typography sx={{ fontSize: 11, color: '#555', minWidth: 22, textAlign: 'right' }}>#{i + 1}</Typography>
              <Typography sx={{ fontSize: 13 }}>{flag(c.countryCode)}</Typography>
              <Typography sx={{ fontSize: 12, color: '#ddd', flex: 1 }}>
                {countryName(c.countryCode)}
              </Typography>
              <Typography sx={{ fontSize: 10, color: '#666' }}>{c.cityCount} cities</Typography>
              <Typography sx={{ fontSize: 10, color: '#999', minWidth: 36, textAlign: 'right' }}>
                Δ {c.meanIntraDistance.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ bgcolor: '#1e1e30', borderRadius: 1, height: 3, ml: 4 }}>
              <Box sx={{ bgcolor: '#888', height: 3, width: `${pct}%`, borderRadius: 1 }} />
            </Box>
          </Box>
        );
      })}
    </>
  );
}

// ─── INGREDIENT ATLAS ────────────────────────────────────────────────────────
function AtlasTab({ stats, onCitySelect }: { stats: any; onCitySelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('olive_oil');

  const filteredIngs = useMemo(() => {
    if (!query) return stats.globalIngredients.slice(0, 40);
    const q = query.toLowerCase();
    return stats.globalIngredients.filter((k: string) => k.toLowerCase().includes(q)).slice(0, 40);
  }, [query, stats.globalIngredients]);

  const cities = useMemo(
    () => citiesForIngredient(stats.validPlaces, selected, 25),
    [selected, stats.validPlaces],
  );

  return (
    <>
      <Typography sx={{ fontSize: 11, color: '#888', mb: 1.2, lineHeight: 1.5 }}>
        Pick an ingredient — see where on Earth it dominates the local cuisine. Click any city to fly there.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <InputBase
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find ingredient…"
          sx={{
            color: '#ddd', fontSize: 12, bgcolor: '#1a1a2a', borderRadius: 1,
            border: '1px solid #2a2a3e', px: 1.2, py: 0.4, flex: 1,
            '& input::placeholder': { color: '#555' },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5, maxHeight: 80, overflowY: 'auto' }}>
        {filteredIngs.map((k: string) => (
          <Box
            key={k}
            onClick={() => setSelected(k)}
            sx={{
              px: 1, py: 0.3, borderRadius: '999px', fontSize: 10.5, cursor: 'pointer',
              bgcolor: k === selected ? 'rgba(255,255,255,0.15)' : '#1a1a2a',
              color: k === selected ? '#fff' : '#aaa',
              border: '1px solid', borderColor: k === selected ? 'rgba(255,255,255,0.25)' : '#2a2a3e',
              textTransform: 'capitalize',
              '&:hover': { color: '#fff' },
            }}
          >
            {k.replace(/_/g, ' ')}
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: 10, color: '#666', mb: 0.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        Top cities for {selected.replace(/_/g, ' ')}
      </Typography>
      {cities.map(({ place, score }, i) => {
        const col = getCityColor(place as any);
        return (
          <Box key={(place as any).id ?? i} sx={{ display: 'flex', alignItems: 'center', py: 0.55, borderBottom: '1px solid #1a1a2a', gap: 1 }}>
            <Typography sx={{ fontSize: 11, color: '#555', minWidth: 22, textAlign: 'right' }}>#{i + 1}</Typography>
            <CityChip place={place} color={col} onClick={() => onCitySelect((place as any).id)} />
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 50, bgcolor: '#1e1e30', height: 3, borderRadius: 1 }}>
                <Box sx={{ bgcolor: col, height: 3, width: `${Math.round(score * 100)}%`, borderRadius: 1 }} />
              </Box>
              <Typography sx={{ fontSize: 10, color: '#666', minWidth: 26, textAlign: 'right' }}>
                {Math.round(score * 100)}%
              </Typography>
            </Box>
          </Box>
        );
      })}
    </>
  );
}

// ─── PATH ────────────────────────────────────────────────────────────────────
function PathTab({ stats, onCitySelect }: { stats: any; onCitySelect: (id: string) => void }) {
  const allCities = stats.validPlaces;
  const [from, setFrom] = useState<Place | null>(allCities.find((p: any) => p.name === 'Tokyo') ?? null);
  const [to, setTo] = useState<Place | null>(allCities.find((p: any) => p.name === 'Lima') ?? null);

  const path = useMemo(() => {
    if (!from || !to) return null;
    const fromId = (from as any).id;
    const toId = (to as any).id;
    return findCulinaryPath(stats, fromId, toId);
  }, [from, to, stats]);

  return (
    <>
      <Typography sx={{ fontSize: 11, color: '#888', mb: 1.2, lineHeight: 1.5 }}>
        Six degrees of cuisine — the shortest hop-path between any two food cultures, jumping through
        intermediate cities each more similar than the last.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
        <Autocomplete
          options={allCities}
          getOptionLabel={(p: any) => p.name ?? ''}
          value={from}
          onChange={(_, v) => setFrom(v)}
          isOptionEqualToValue={(o, v) => (o as any).id === (v as any).id}
          renderInput={(params) => (
            <TextField {...params} placeholder="From" size="small"
              sx={{ '& .MuiInputBase-root': { color: '#ddd', fontSize: 12, bgcolor: '#1a1a2a' } }} />
          )}
          sx={{ flex: 1, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a3e' } }}
        />
        <SwapHorizIcon sx={{ color: '#555' }} />
        <Autocomplete
          options={allCities}
          getOptionLabel={(p: any) => p.name ?? ''}
          value={to}
          onChange={(_, v) => setTo(v)}
          isOptionEqualToValue={(o, v) => (o as any).id === (v as any).id}
          renderInput={(params) => (
            <TextField {...params} placeholder="To" size="small"
              sx={{ '& .MuiInputBase-root': { color: '#ddd', fontSize: 12, bgcolor: '#1a1a2a' } }} />
          )}
          sx={{ flex: 1, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a3e' } }}
        />
      </Box>

      {path == null ? (
        <Typography sx={{ fontSize: 11, color: '#555', textAlign: 'center', mt: 3 }}>
          {(!from || !to) ? 'Pick two cities to find the culinary path.' : 'No culinary path found between these cuisines.'}
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: 10, color: '#666', mb: 0.5, textTransform: 'uppercase', letterSpacing: 1 }}>
            Path · {path.length - 1} hops
          </Typography>
          {path.map((hop: any, i: number) => {
            const col = getCityColor(hop.place as any);
            return (
              <Box key={(hop.place as any).id ?? i} sx={{ display: 'flex', alignItems: 'center', py: 0.6, borderBottom: '1px solid #1a1a2a', gap: 1 }}>
                <Typography sx={{ fontSize: 11, color: '#555', minWidth: 22, textAlign: 'right' }}>{i}</Typography>
                <CityChip place={hop.place} color={col} onClick={() => onCitySelect((hop.place as any).id)} />
                {i > 0 && (
                  <Typography sx={{ fontSize: 10, color: '#555', ml: 'auto' }}>
                    Δ {hop.hopDist.toFixed(2)}
                  </Typography>
                )}
              </Box>
            );
          })}
        </>
      )}
    </>
  );
}

// ─── shared city chip ────────────────────────────────────────────────────────
function CityChip({ place, color, onClick }: { place: Place; color: string; onClick: () => void }) {
  const cc = (place as any).countryCode ?? '';
  return (
    <Box onClick={onClick} sx={{ display: 'flex', alignItems: 'center', gap: 0.7, cursor: 'pointer', flex: 1, minWidth: 0, '&:hover .city-name': { color: '#fff' } }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 6px ${color}88`, flexShrink: 0 }} />
      <Typography className="city-name" sx={{ fontSize: 12, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
        {place.name}
      </Typography>
      <Typography sx={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{flag(cc)}</Typography>
    </Box>
  );
}
