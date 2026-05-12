import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Typography,
} from '@mui/material';
import {
  CookingMethodsSchema,
  IngredientsSchema,
} from '@realmap/shared/client';
import { City, Country, ICity } from 'country-state-city';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';

// Only get the actual ingredient and cooking method keys
const INGREDIENT_KEYS = Object.keys(IngredientsSchema.properties);
const COOKING_METHOD_KEYS = Object.keys(CookingMethodsSchema.properties);

// Constants for item sizes
const COLLAPSED_HEIGHT = 48;
const EXPANDED_HEIGHT = 400;

interface FeatureManagementDrawerProps {
  open: boolean;
  onClose: () => void;
}

// Memoized Slider Component
const MemoizedSlider = memo(({ label }: { label: string }) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="body2" gutterBottom>
      {label.replace(/([A-Z])/g, ' $1').trim()}
    </Typography>
    <Slider
      size="small"
      defaultValue={0}
      min={0}
      max={100}
      valueLabelDisplay="auto"
    />
  </Box>
));

MemoizedSlider.displayName = 'MemoizedSlider';

// Memoized Accordion Details Component
const AccordionDetailsContent = memo(() => (
  <>
    <Typography variant="subtitle2" gutterBottom>
      Ingredients
    </Typography>
    {INGREDIENT_KEYS.map((ingredient) => (
      <MemoizedSlider key={ingredient} label={ingredient} />
    ))}
    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
      Cooking Methods
    </Typography>
    {COOKING_METHOD_KEYS.map((method) => (
      <MemoizedSlider key={method} label={method} />
    ))}
  </>
));

AccordionDetailsContent.displayName = 'AccordionDetailsContent';

// Memoized City Accordion Component
const CityAccordion = memo(
  ({
    city,
    selectedCountry,
    expandedCity,
    onCityChange,
  }: {
    city: ICity;
    selectedCountry: string;
    expandedCity: string | null;
    onCityChange: (
      cityId: string,
    ) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
  }) => {
    const cityId = `${city.name}-${selectedCountry}`;

    return (
      <Accordion
        expanded={expandedCity === cityId}
        onChange={onCityChange(cityId)}
        TransitionProps={{ timeout: 0 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>{city.name}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <AccordionDetailsContent />
        </AccordionDetails>
      </Accordion>
    );
  },
);

CityAccordion.displayName = 'CityAccordion';

export default function FeatureManagementDrawer({
  open,
  onClose,
}: FeatureManagementDrawerProps) {
  // Memoize countries, sorted by name
  const countries = useMemo(
    () =>
      Country.getAllCountries().sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Selected country code
  const [selectedCountry, setSelectedCountry] = useState<string>(
    countries[0]?.isoCode || '',
  );
  // Cities for the selected country
  const [cities, setCities] = useState<ICity[]>([]);
  // Loading state for cities
  const [loadingCities, setLoadingCities] = useState(false);
  // Only one city accordion open at a time
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  // Reference to the list for forcing updates
  const listRef = useRef<List>(null);

  // Load cities when selectedCountry changes
  useEffect(() => {
    if (!selectedCountry) return;
    setLoadingCities(true);
    setCities([]);
    setExpandedCity(null);
    const loadedCities = City.getCitiesOfCountry(selectedCountry) || [];
    setCities(loadedCities);
    setLoadingCities(false);
  }, [selectedCountry]);

  // Handle country dropdown change
  const handleCountryChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedCountry(event.target.value as string);
    },
    [],
  );

  // Handle city accordion change
  const handleCityChange = useCallback(
    (cityId: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedCity(isExpanded ? cityId : null);
      // Force list to recalculate after state update
      setTimeout(() => {
        if (listRef.current) {
          // Force a re-render by updating the key
          const newKey = Math.random().toString();
          listRef.current.props.itemKey?.(0, newKey);
        }
      }, 0);
    },
    [],
  );

  // Memoized row renderer for react-window
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const city = cities[index];
      return (
        <div style={style}>
          <CityAccordion
            city={city}
            selectedCountry={selectedCountry}
            expandedCity={expandedCity}
            onCityChange={handleCityChange}
          />
        </div>
      );
    },
    [cities, selectedCountry, expandedCity, handleCityChange],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 400, maxWidth: '100%' } }}
    >
      <Box
        sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Typography variant="h6" gutterBottom>
          Feature Management
        </Typography>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="country-select-label">Country</InputLabel>
          <Select
            labelId="country-select-label"
            value={selectedCountry}
            label="Country"
            onChange={handleCountryChange}
          >
            {countries.map((country) => (
              <MenuItem key={country.isoCode} value={country.isoCode}>
                {country.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {loadingCities ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ flex: 1 }}>
            <AutoSizer>
              {({ height, width }) => (
                <List
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={cities.length}
                  itemSize={expandedCity ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT}
                  itemKey={(index) =>
                    `${cities[index]?.name}-${selectedCountry}-${expandedCity}`
                  }
                >
                  {Row}
                </List>
              )}
            </AutoSizer>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
