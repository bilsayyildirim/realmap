import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { Box, ClickAwayListener, InputBase, List, ListItemButton, Paper, Typography } from '@mui/material';
import maplibregl from 'maplibre-gl';
// @ts-ignore
import type { Place } from '@realmap/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCityColor } from '../utils/colorUtils';
import { usePlaces } from '../hooks/usePlaces';

interface Props {
  map: maplibregl.Map;
  onCitySelect: (cityId: string) => void;
}

// "GB" → "United Kingdom", "CA" → "Canada", etc. Falls back to the code itself.
const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
function countryName(code?: string): string {
  if (!code) return '';
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}

export function SearchBar({ map, onCitySelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { places } = usePlaces();

  const results = useMemo(() => {
    if (!query.trim() || !places.length) return [];
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(query);
    return (places as any[])
      .filter((p) =>
        (p.name && norm(p.name).includes(q)) ||
        (p.countryCode && norm(countryName(p.countryCode)).includes(q)) ||
        (p.continent && norm(p.continent).includes(q))
      )
      .slice(0, 8);
  }, [query, places]);

  const expand = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const collapse = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIdx(0);
  }, []);

  const select = useCallback((place: any) => {
    map.flyTo({ center: [place.longitude, place.latitude], zoom: 10, duration: 1600, essential: true });
    onCitySelect(place.id ?? '');
    collapse();
  }, [map, onCitySelect, collapse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open && (e.key === '/' || (e.metaKey && e.key === 'k'))) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); expand(); }
      } else if (open && e.key === 'Escape') {
        collapse();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, expand, collapse]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) select(results[activeIdx]);
  };

  return (
    <Box sx={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1400,
      width: open ? { xs: '92vw', sm: 480 } : 'auto',
      transition: 'width 0.18s ease',
    }}>
      {!open ? (
        <Paper onClick={expand} elevation={0} sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.9,
          bgcolor: 'rgba(12,12,24,0.82)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: '999px',
          cursor: 'pointer', whiteSpace: 'nowrap',
          '&:hover': { bgcolor: 'rgba(20,20,40,0.92)', borderColor: 'rgba(255,255,255,0.16)' },
          transition: 'all 0.15s',
        }}>
          <SearchIcon sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 17 }} />
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.38)', fontSize: 13 }}>
            Search cities…
          </Typography>
          <Box component="kbd" sx={{
            ml: 0.5, fontSize: 11, px: 0.75, py: 0.2,
            bgcolor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1, color: 'rgba(255,255,255,0.28)', fontFamily: 'inherit',
          }}>/</Box>
        </Paper>
      ) : (
        <ClickAwayListener onClickAway={collapse}>
          <Paper elevation={0} sx={{
            bgcolor: 'rgba(10,10,22,0.96)', backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, gap: 1.5 }}>
              <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 19, flexShrink: 0 }} />
              <InputBase
                inputRef={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search cities or countries…"
                fullWidth
                sx={{ color: 'white', fontSize: 14, '& input::placeholder': { color: 'rgba(255,255,255,0.3)' } }}
              />
              <CloseIcon
                onClick={collapse}
                sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', flexShrink: 0, '&:hover': { color: 'rgba(255,255,255,0.65)' } }}
              />
            </Box>
            {results.length > 0 && (
              <>
                <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.06)' }} />
                <List dense disablePadding sx={{ py: 0.5 }}>
                  {results.map((place: any, i: number) => {
                    const country = countryName(place.countryCode);
                    const subtitle = [country, place.continent].filter(Boolean).join(' · ');
                    return (
                      <ListItemButton
                        key={place.id ?? `${place.name}-${place.latitude}-${place.longitude}`}
                        selected={i === activeIdx}
                        onClick={() => select(place)}
                        onMouseEnter={() => setActiveIdx(i)}
                        sx={{
                          px: 2, py: 0.85, gap: 1.5,
                          '&.Mui-selected, &:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                        }}
                      >
                        <Box sx={{
                          width: 9, height: 9, borderRadius: '50%',
                          bgcolor: getCityColor(place), flexShrink: 0,
                          boxShadow: `0 0 4px ${getCityColor(place)}66`,
                        }} />
                        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
                          <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>
                            {place.name}
                          </Typography>
                          {subtitle && (
                            <Typography sx={{
                              color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 1.4,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {subtitle}
                            </Typography>
                          )}
                        </Box>
                      </ListItemButton>
                    );
                  })}
                </List>
              </>
            )}
          </Paper>
        </ClickAwayListener>
      )}
    </Box>
  );
}
