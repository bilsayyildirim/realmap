import CloseIcon from '@mui/icons-material/Close';
import { Box, Chip, Divider, IconButton, Slide, Typography } from '@mui/material';
import { Country } from 'country-state-city';
import { useEffect, useMemo } from 'react';
// @ts-ignore
import type { Place } from '@realmap/shared';
import { usePlaces } from '../hooks/usePlaces';
import { getCityColor } from '../utils/colorUtils';

interface Props {
  cityName: string | null;
  onClose: () => void;
}

function countryFlag(code: string): string {
  try {
    return code.toUpperCase().replace(/./g, (c) =>
      String.fromCodePoint(c.charCodeAt(0) + 127397)
    );
  } catch {
    return '';
  }
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Convert euclidean distance to 0-100 similarity score.
// Scale: dist=0 → 100%, dist=35 → ~0%. Typical same-region dist: 2-10, cross-region: 15-30.
function distToScore(dist: number): number {
  return Math.max(3, Math.min(99, Math.round((1 - dist / 35) * 100)));
}

export const CityDrawer = ({ cityName, onClose }: Props) => {
  const { places } = usePlaces();

  const city = useMemo(
    () => (cityName ? places.find((p) => p.name === cityName) ?? null : null),
    [cityName, places]
  );

  const data = useMemo(() => {
    if (!city) return null;

    const emb = Array.isArray((city as any).embedding) ? (city as any).embedding as number[] : null;
    const ingredients = (city as any).ingredients as Record<string, number> | undefined;
    const cookingMethods = (city as any).cookingMethods as Record<string, number> | undefined;

    const cityColor = emb ? getCityColor(city as any) : '#888';

    const topIngredients = ingredients
      ? Object.entries(ingredients).sort((a, b) => b[1] - a[1]).slice(0, 8)
      : [];

    const topMethods = cookingMethods
      ? Object.entries(cookingMethods).sort((a, b) => b[1] - a[1]).slice(0, 6)
      : [];

    const cityCC = (city as any).countryCode ?? '';

    // Similar cities: nearest by Euclidean distance in embedding space, excluding same country.
    // Cross-country comparison is more interesting than listing same-country variants.
    const similarCities = !emb ? [] : places
      .filter((p) => p.name !== city.name && (p as any).countryCode !== cityCC)
      .flatMap((p) => {
        const pe = Array.isArray((p as any).embedding) ? (p as any).embedding as number[] : null;
        if (!pe || pe.length !== emb.length) return [];
        const dist = euclidean(emb, pe);
        return [{ place: p, dist, similarity: distToScore(dist) }];
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 7);

    // What defines this city: ingredients significantly above the neighbor average
    const neighborAvg: Record<string, number> = {};
    if (similarCities.length > 0) {
      for (const { place: p } of similarCities) {
        const ni = (p as any).ingredients as Record<string, number> | undefined;
        if (!ni) continue;
        for (const [k, v] of Object.entries(ni)) {
          neighborAvg[k] = (neighborAvg[k] ?? 0) + v / similarCities.length;
        }
      }
    }
    const uniqueIngredients = topIngredients
      .map(([k, v]) => ({ k, v, diff: v - (neighborAvg[k] ?? 0) }))
      .filter(({ diff }) => diff > 0.15)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 5);

    return { cityColor, topIngredients, topMethods, similarCities, uniqueIngredients };
  }, [city, places]);

  const open = !!city && !!data;
  const cc = (city as any)?.countryCode ?? '';
  const countryName = Country.getCountryByCode(cc)?.name ?? cc;
  const flag = countryFlag(cc);
  const pop = (city as any)?.population;
  const continent = (city as any)?.continent ?? '';
  const maxIngVal = data?.topIngredients[0]?.[1] ?? 1;
  const cityColor = data?.cityColor ?? '#888';

  // Esc key closes the drawer
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
    {/* Backdrop: click-to-close with city color tint */}
    {open && (
      <Box
        onClick={onClose}
        sx={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at right, ${cityColor}18, transparent 70%)`,
          zIndex: 998,
          cursor: 'default',
        }}
      />
    )}
    <Slide direction="left" in={open} mountOnEnter unmountOnExit timeout={240}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: { xs: '100%', sm: 420 },
          bgcolor: '#12121f',
          color: '#eee',
          zIndex: 999,
          overflowY: 'auto',
          overflowX: 'hidden',
          boxShadow: '-6px 0 40px rgba(0,0,0,0.55)',
          borderLeft: '1px solid #222',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', system-ui, sans-serif",
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: '#1a1a2e' },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 2 },
        }}
      >
        {/* ── Header ── */}
        <Box
          sx={{
            background: `linear-gradient(135deg, ${cityColor}22, transparent)`,
            borderLeft: `4px solid ${cityColor}`,
            px: 2,
            pt: 2,
            pb: 1.5,
            position: 'relative',
          }}
        >
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8, color: '#666', '&:hover': { color: '#eee' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, pr: 4 }}>
            <Box
              sx={{
                width: 12, height: 12, borderRadius: '50%',
                bgcolor: cityColor,
                boxShadow: `0 0 10px ${cityColor}`,
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {city?.name}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: '#777' }}>
            {flag} {countryName}
            {continent ? ` · ${continent}` : ''}
            {pop ? ` · ${Number(pop).toLocaleString()} people` : ''}
          </Typography>
        </Box>

        {/* ── Signature Ingredients ── */}
        {(data?.topIngredients.length ?? 0) > 0 && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#555', mb: 1 }}>
              Signature ingredients
            </Typography>
            {data!.topIngredients.map(([k, v]) => {
              const pct = Math.round((v / maxIngVal) * 100);
              return (
                <Box key={k} sx={{ mb: 0.8 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: '2px' }}>
                    <Typography sx={{ fontSize: 12, color: '#ccc', textTransform: 'capitalize' }}>
                      {k.replace(/_/g, ' ')}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: '#666' }}>
                      {Math.round(v * 100)}%
                    </Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#2a2a3e', borderRadius: 1, height: 4, overflow: 'hidden' }}>
                    <Box sx={{ bgcolor: cityColor, height: 4, width: `${pct}%`, borderRadius: 1, transition: 'width 0.6s ease' }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {/* ── Cooking Methods ── */}
        {(data?.topMethods.length ?? 0) > 0 && (
          <>
            <Divider sx={{ borderColor: '#1e1e30' }} />
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#555', mb: 1 }}>
                Cooking character
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                {data!.topMethods.map(([k]) => (
                  <Chip
                    key={k}
                    label={k.replace(/_/g, ' ')}
                    size="small"
                    sx={{
                      bgcolor: '#1e1e30',
                      color: '#aaa',
                      fontSize: 11,
                      height: 24,
                      textTransform: 'capitalize',
                      '& .MuiChip-label': { px: 1.2 },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </>
        )}

        {/* ── Defines this cuisine ── */}
        <Divider sx={{ borderColor: '#1e1e30' }} />
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#555', mb: 1 }}>
            Defines this cuisine
          </Typography>
          {(data?.uniqueIngredients.length ?? 0) > 0 ? (
            data!.uniqueIngredients.map(({ k, diff }) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.7 }}>
                <Typography sx={{ color: cityColor, fontSize: 13, lineHeight: 1 }}>▲</Typography>
                <Typography sx={{ fontSize: 12, color: '#ccc', textTransform: 'capitalize', flex: 1 }}>
                  {k.replace(/_/g, ' ')}
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#666' }}>
                  +{Math.round(diff * 100)}% vs neighbors
                </Typography>
              </Box>
            ))
          ) : (
            <Typography sx={{ fontSize: 12, color: '#555' }}>
              Balanced — no single standout ingredient
            </Typography>
          )}
        </Box>

        {/* ── Similar Food Cultures ── */}
        {(data?.similarCities.length ?? 0) > 0 && (
          <>
            <Divider sx={{ borderColor: '#1e1e30' }} />
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#555', mb: 1 }}>
                Most similar food cultures
              </Typography>
              {data!.similarCities.map(({ place: p, similarity }) => {
                const pcc = (p as any).countryCode ?? '';
                const col = getCityColor(p as any);
                const pFlag = countryFlag(pcc);
                const pCountry = Country.getCountryByCode(pcc)?.name ?? pcc;
                return (
                  <Box key={p.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
                    <Box sx={{
                      width: 9, height: 9, borderRadius: '50%', bgcolor: col,
                      boxShadow: `0 0 6px ${col}99`, flexShrink: 0,
                    }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography component="span" sx={{ fontSize: 12, fontWeight: 500, color: '#ddd' }}>
                        {p.name}
                      </Typography>
                      <Typography component="span" sx={{ fontSize: 11, color: '#555', ml: 0.8 }}>
                        {pFlag} {pCountry}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexShrink: 0 }}>
                      <Box sx={{ width: 48, bgcolor: '#2a2a3e', borderRadius: 1, height: 3 }}>
                        <Box sx={{ bgcolor: col, height: 3, width: `${similarity}%`, borderRadius: 1 }} />
                      </Box>
                      <Typography sx={{ fontSize: 11, color: '#666', minWidth: 28, textAlign: 'right' }}>
                        {similarity}%
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        {/* ── Footer ── */}
        <Box sx={{ mt: 'auto', borderTop: '1px solid #1e1e30', px: 2, py: 1.2 }}>
          <Box
            component="a"
            href={`https://www.google.com/search?q=${encodeURIComponent(`${city?.name ?? ''} ${countryName} cuisine food`)}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#555', textDecoration: 'none', fontSize: 11, '&:hover': { color: '#888' } }}
          >
            <span style={{ fontSize: 13 }}>🔍</span>
            Explore {city?.name} cuisine
          </Box>
        </Box>
      </Box>
    </Slide>
    </>
  );
};
