import moment from "moment";

export function shiftDateByYears(date, years) {
    if (!date) return null;
    const m = moment(date);
    if (!m.isValid()) return null;
    return m.add(years, "year").toDate();
}

export function shiftResolvedForSimulation(resolved, yearOffset = 0) {
    if (!resolved || !yearOffset) return resolved;

    const contract = resolved.contract ?? {};
    return {
        ...resolved,
        contract: {
            ...contract,
            StartDate: shiftDateByYears(contract.StartDate ?? contract.CTR_StartDate, yearOffset),
            EndDate: shiftDateByYears(contract.EndDate ?? contract.CTR_EndDate, yearOffset),
        },
        targets: (resolved.targets ?? []).map((t) => ({
            ...t,
            fromDate: shiftDateByYears(t.fromDate ?? t.FromDate, yearOffset),
            toDate: shiftDateByYears(t.toDate ?? t.ToDate, yearOffset),
        })),
    };
}

/** For retrospective simulation (year offset), evaluate after all shifted periods have ended. */
export function resolveSimulationAsOf(previewResolved, targets = [], yearOffset = 0) {
    if (!yearOffset) return null;

    const endMoments = (targets ?? [])
        .map((t) => t.toDate ?? t.ToDate)
        .filter(Boolean)
        .map((d) => moment(d).endOf("day"));

    const contract = previewResolved?.contract ?? {};
    const contractEnd = contract.EndDate ?? contract.CTR_EndDate ?? contract.endDate;
    if (contractEnd) {
        endMoments.push(moment(contractEnd).endOf("day"));
    }

    if (!endMoments.length) return null;
    return moment.max(endMoments);
}
