import { ICity } from 'country-state-city';

export const getCityId = (city: ICity) => {
  return `${city.name}-${city.stateCode}-${city.countryCode}`;
};
