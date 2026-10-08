import Typography from '@mui/material/Typography';
import { useLocation } from 'react-router-dom';

const LocationProbe = () => {
  const location = useLocation();
  return <Typography data-testid="location">{location.pathname}</Typography>;
};

export default LocationProbe;
