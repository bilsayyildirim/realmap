import { Box } from '@mui/material';
import './App.css';
import { Map } from './components/Map';

export const App = () => {
  return (
    <div className="app">
      <Box sx={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <Map center={[0, 20]} zoom={1.5} />
      </Box>
    </div>
  );
};
