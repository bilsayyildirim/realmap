import { Settings as SettingsIcon } from '@mui/icons-material';
import { Box, CircularProgress, IconButton } from '@mui/material';
import { Suspense, useState } from 'react';
import FeatureManagementDrawer from './FeatureManagementDrawer';
export const LazyFeatureManagementDrawer = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <CircularProgress />
        </Box>
      }
    >
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          backgroundColor: 'white',
          borderRadius: '50%',
          boxShadow: 2,
        }}
      >
        <IconButton onClick={() => setDrawerOpen(true)}>
          <SettingsIcon />
        </IconButton>
      </Box>
      <FeatureManagementDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </Suspense>
  );
};
