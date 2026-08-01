import { useCallback, useEffect, useState } from "react";

/**
 * 列表型页面的通用加载态。
 * fetcher 必须由调用方用 useCallback 固定引用，否则每次渲染都会触发重新加载。
 */
export function useAsyncList<T>(fetcher: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setItems(await fetcher());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, loadError, load };
}
