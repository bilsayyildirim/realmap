import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { Box, Chip, IconButton, InputBase, Slide, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { ItemCatalog } from '../utils/filterUtils';

interface DiscoverDrawerProps {
  open: boolean;
  onClose: () => void;
  catalog: ItemCatalog;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  matchCount: number;
}

const humanize = (k: string) => k.replace(/_/g, ' ');

export const DiscoverDrawer = ({
  open, onClose, catalog, selected, onToggle, onClear, matchCount,
}: DiscoverDrawerProps) => {
  const [query, setQuery] = useState('');

  const filter = (items: { key: string; count: number }[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.key.toLowerCase().includes(q));
  };

  const filteredIngredients = useMemo(() => filter(catalog.ingredients), [catalog, query]);
  const filteredMethods = useMemo(() => filter(catalog.methods), [catalog, query]);

  const hasSelection = selected.size > 0;
  const selectedKey = hasSelection ? [...selected][0] : '';

  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'fixed',
          left: 0, right: 0, bottom: 0,
          zIndex: 1200,
          bgcolor: 'rgba(14,14,22,0.96)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.10)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          color: '#eee',
          maxHeight: hasSelection ? 'unset' : '55vh',
          transition: 'max-height 220ms ease',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.45)',
        }}
      >
        <Box sx={{ px: 2.5, pt: 1.5, pb: hasSelection ? 1.5 : 0 }}>
          {/* Drag handle */}
          <Box sx={{
            width: 38, height: 4, borderRadius: 2,
            bgcolor: 'rgba(255,255,255,0.18)',
            mx: 'auto', mb: 1.2,
          }} />

          {hasSelection ? (
            <SelectedView
              itemKey={selectedKey}
              matchCount={matchCount}
              onClear={onClear}
              onClose={onClose}
            />
          ) : (
            <BrowserHeader onClose={onClose} />
          )}

          {!hasSelection && (
            <Box sx={{
              display: 'flex', alignItems: 'center',
              bgcolor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 2, px: 1.25, py: 0.5, mb: 1.25,
            }}>
              <SearchIcon sx={{ color: '#666', fontSize: 18, mr: 1 }} />
              <InputBase
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ingredients & methods..."
                sx={{ color: '#eee', fontSize: 13, flex: 1 }}
              />
            </Box>
          )}
        </Box>

        {!hasSelection && (
          <Box sx={{ overflowY: 'auto', px: 2.5, pb: 2 }}>
            <Section
              icon={<RestaurantIcon sx={{ fontSize: 14 }} />}
              title="Ingredients"
              items={filteredIngredients}
              selected={selected}
              onToggle={onToggle}
            />
            <Box sx={{ height: 10 }} />
            <Section
              icon={<LocalFireDepartmentIcon sx={{ fontSize: 14 }} />}
              title="Cooking methods"
              items={filteredMethods}
              selected={selected}
              onToggle={onToggle}
            />
          </Box>
        )}
      </Box>
    </Slide>
  );
};

const BrowserHeader = ({ onClose }: { onClose: () => void }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
    <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1 }}>
      Discover
    </Typography>
    <IconButton size="small" onClick={onClose} sx={{ color: '#888', '&:hover': { color: '#fff' } }}>
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>
);

interface SelectedViewProps {
  itemKey: string;
  matchCount: number;
  onClear: () => void;
  onClose: () => void;
}

const SelectedView = ({ itemKey, matchCount, onClear, onClose }: SelectedViewProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Chip
      label={humanize(itemKey)}
      onDelete={onClear}
      deleteIcon={<CloseIcon sx={{ fontSize: 16 }} />}
      sx={{
        fontSize: 13,
        height: 32,
        bgcolor: 'rgba(167,139,250,0.22)',
        color: '#e9d5ff',
        border: '1px solid rgba(167,139,250,0.45)',
        '& .MuiChip-label': { px: 1.4, textTransform: 'capitalize' },
        '& .MuiChip-deleteIcon': {
          color: 'rgba(233,213,255,0.7)',
          '&:hover': { color: '#fff' },
        },
      }}
    />
    <Typography sx={{ fontSize: 12, color: '#888', flex: 1 }}>
      {matchCount.toLocaleString()} cities
    </Typography>
    <IconButton size="small" onClick={onClose} sx={{ color: '#888', '&:hover': { color: '#fff' } }}>
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>
);

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  items: { key: string; count: number }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}

const Section = ({ icon, title, items, selected, onToggle }: SectionProps) => {
  if (items.length === 0) return null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8, color: '#666' }}>
        {icon}
        <Typography sx={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
          color: '#666', ml: 0.6, fontWeight: 600,
        }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {items.map(({ key }) => {
          const isSel = selected.has(key);
          return (
            <Chip
              key={key}
              label={humanize(key)}
              onClick={() => onToggle(key)}
              size="small"
              sx={{
                fontSize: 11.5,
                height: 26,
                px: 0.4,
                bgcolor: isSel ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.04)',
                color: isSel ? '#e9d5ff' : '#bbb',
                border: '1px solid',
                borderColor: isSel ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.06)',
                '&:hover': {
                  bgcolor: isSel ? 'rgba(167,139,250,0.30)' : 'rgba(255,255,255,0.08)',
                },
                '& .MuiChip-label': { px: 1.1, textTransform: 'capitalize' },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};
