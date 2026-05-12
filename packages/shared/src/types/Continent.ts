import { Static, Type } from '@sinclair/typebox';

export const ContinentSchema = Type.Enum({
  Africa: 'Africa',
  Antarctica: 'Antarctica',
  Asia: 'Asia',
  Europe: 'Europe',
  NorthAmerica: 'North America',
  Oceania: 'Oceania',
  SouthAmerica: 'South America',
});

export type Continent = Static<typeof ContinentSchema>;
