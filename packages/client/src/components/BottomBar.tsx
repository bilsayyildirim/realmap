import { BubbleChart, Explore, Grain } from '@mui/icons-material';
import { Divider, IconButton, Paper, Tooltip } from '@mui/material';

interface BottomBarProps {
  dashboardOpen: boolean;
  onDashboardToggle: () => void;
  layerMode: 'scatter' | 'heatmap';
  onLayerModeToggle: () => void;
  foodSpaceOpen: boolean;
  onFoodSpaceToggle: () => void;
}

export const BottomBar = ({
  dashboardOpen,
  onDashboardToggle,
  layerMode,
  onLayerModeToggle,
  foodSpaceOpen,
  onFoodSpaceToggle,
}: BottomBarProps) => {
  const isHeatmap = layerMode === 'heatmap';

  const btnSx = (active: boolean) => ({
    color: active ? '#90caf9' : 'rgba(255,255,255,0.5)',
    bgcolor: active ? 'rgba(144,202,249,0.12)' : 'transparent',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  });

  return (
    <Paper elevation={0} sx={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      borderRadius: '999px',
      backdropFilter: 'blur(16px)',
      backgroundColor: 'rgba(10,10,22,0.85)',
      border: '1px solid rgba(255,255,255,0.09)',
      display: 'flex', alignItems: 'center',
      px: 1, py: 0.5,
      zIndex: 1200,
    }}>
      <Tooltip title={isHeatmap ? 'Scatter view' : 'Heatmap view'} placement="top">
        <IconButton onClick={onLayerModeToggle} size="medium" sx={btnSx(isHeatmap)}>
          <Grain />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

      <Tooltip title="Food culture space" placement="top">
        <IconButton onClick={onFoodSpaceToggle} size="medium" sx={btnSx(foodSpaceOpen)}>
          <BubbleChart />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

      <Tooltip title="Discover" placement="top">
        <IconButton onClick={onDashboardToggle} size="medium" sx={btnSx(dashboardOpen)}>
          <Explore />
        </IconButton>
      </Tooltip>
    </Paper>
  );
};
