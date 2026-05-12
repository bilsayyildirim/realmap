import { useCallback, useState } from 'react';

// 1. Extract only async methods
type AsyncMethodKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<any> ? K : never;
}[keyof T];

// 2. Generate a hook for each method
type HookForMethod<Fn extends (...args: any[]) => Promise<any>> = () => {
  data: Awaited<ReturnType<Fn>> | null;
  loading: boolean;
  error: any;
  fetch: (...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>;
};

// 3. Map service methods to hooks
type HooksForService<T> = {
  [K in AsyncMethodKeys<T> as `use${Capitalize<string & K>}`]: HookForMethod<
    Extract<T[K], (...args: any[]) => Promise<any>>
  >;
};

export function useService<T extends Record<string, any>>(
  ServiceClass: new () => T,
): HooksForService<T> {
  const service = new ServiceClass();
  const hooks: Partial<HooksForService<T>> = {};

  const proto = Object.getPrototypeOf(service);

  (Object.getOwnPropertyNames(proto) as (keyof T)[])
    .filter(
      (key) => key !== 'constructor' && typeof service[key] === 'function',
    )
    .forEach((methodName) => {
      const hookName =
        `use${capitalize(methodName as string)}` as keyof HooksForService<T>;

      // Create the hook function
      hooks[hookName] = (function () {
        return function () {
          const [data, setData] = useState<any>(null);
          const [loading, setLoading] = useState(false);
          const [error, setError] = useState<any>(null);

          const fetch = useCallback(async (...fetchArgs: any[]) => {
            setLoading(true);
            setError(null);
            try {
              const result = await (service[methodName] as Function)(
                ...fetchArgs,
              );
              setData(result);
              return result;
            } catch (err) {
              setError(err);
              throw err;
            } finally {
              setLoading(false);
            }
          }, []);

          return { data, loading, error, fetch };
        };
      })() as any;
    });

  return hooks as unknown as HooksForService<T>;
}

function capitalize<S extends string>(str: S): Capitalize<S> {
  return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<S>;
}
