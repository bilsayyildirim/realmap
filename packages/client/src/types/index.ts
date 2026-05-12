export interface Place {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city: string;
  country: string;
  countryCode: string;
  region?: string;
  latitude: number;
  longitude: number;
  ingredients: Record<string, number>;
  cookingMethods: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  clusters?: {
    all: number;
    allValue: number;
    color: string;
  };
  embedding?: [number, number];
}

export interface PlaceFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    name: string;
    city: string;
    country: string;
    ingredients: Record<string, number>;
    cookingMethods: Record<string, number>;
    clusters?: {
      all: number;
      allValue: number;
      color: string;
    };
    embedding?: [number, number];
  };
}

export interface PlaceFeatures {
  ingredients?: Record<string, number>;
  cookingMethods?: Record<string, number>;
}

export interface PlaceUpdate {
  placeId: string;
  ingredients?: Record<string, number>;
  cookingMethods?: Record<string, number>;
}

export interface GroupedPlaces {
  [country: string]: {
    [city: string]: Place[];
  };
}
