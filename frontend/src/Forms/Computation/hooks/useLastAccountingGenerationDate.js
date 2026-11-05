import { useEffect, useState } from "react";
import { getApiBase } from "../../../globals";

export function useLastAccountingGenerationDate(authAxios) {
    const [generationDate, setGenerationDate] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!authAxios) {
            setGenerationDate(null);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);

        authAxios
            .get(`${getApiBase()}/CVRLookups/last-accounting-generation-date`)
            .then(({ data }) => {
                if (cancelled) return;
                const raw = data?.generationDate ?? data?.GenerationDate ?? null;
                setGenerationDate(raw || null);
            })
            .catch(() => {
                if (!cancelled) setGenerationDate(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [authAxios]);

    return { generationDate, loading };
}
