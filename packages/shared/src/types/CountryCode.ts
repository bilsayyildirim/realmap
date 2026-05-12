import { Static, Type } from '@sinclair/typebox';
import { countries } from 'countries-list';

// Get all valid country codes from the library
const countryCodes = Object.keys(countries) as Array<keyof typeof countries>;

// Create a TypeBox enum from all country codes
export const CountryCodeSchema = Type.Union(
  countryCodes.map((code) => Type.Literal(code)),
);

export type CountryCode = Static<typeof CountryCodeSchema>;

// Helper map for looking up country details
export const countriesByCodeMap: Record<
  keyof typeof countries,
  (typeof countries)[keyof typeof countries]
> = countryCodes.reduce(
  (acc, code) => {
    acc[code] = countries[code];
    return acc;
  },
  {} as Record<
    keyof typeof countries,
    (typeof countries)[keyof typeof countries]
  >,
);
