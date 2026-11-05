import { map, sortBy } from 'lodash';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Table } from 'react-virtualized';
import { useStateWithCallback } from '../../CustomHooks/useStateWithCallback';
import { customTableSearch } from '../../utils/functions';
import './virtualTable.css'
import InputTextComp from '../InputTextComponent/InputTextComp';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import { LanguageContext } from '../../ContextProvider/LanguageContext';
import { mobileDevicesWidth } from '../../globals';

export default function VirtualTable({
    data = [], id,
    classname, width, height,
    headerHeight, rowHeight, gridClassName, headerRowRenderer,
    rowClassName = null, rowClassOverrideFn, columns, enableSearch, changeParentValues, columsNotToBeFiltered, columsToBeFiltered = null, globalFilter = "",
    isDropEnabled = false, onDragEnd, toggleDropdown, ...props }) {
    const STATE = useRef({
        filterText: '',
        dataArrayFiltered: [],
        dataArray: [],
        sortByKey: props.sortByKey ? props.sortByKey : '',
        sortDirection: props.sortDirection ? props.sortDirection : 'ASC',
        sortedList: [],
        globalFilter: "",
    })

    const [state, setState] = useStateWithCallback(STATE.current);

    const { language } = useContext(LanguageContext)
    const [languageUsedFiltration, setLanguageUsedFiltration] = useState(language)

    useEffect(() => {
        fetch("languageUsed.json").then(
            function (res) {
                return res.json()
            }).then(function (languageUsed) {
                setLanguageUsedFiltration(languageUsed.filtrationBar[0])
            }).catch(
                function (err) {
                    console.log(err, ' error')
                }
            )
    }, []);

    useEffect(() => {
        if (document.getElementsByClassName(gridClassName)[0])
            document.getElementsByClassName(gridClassName)[0].addEventListener("scroll", onScroll);
        return () => {
            if (document.getElementsByClassName("ReactVirtualized__Grid")[0])
                document.getElementsByClassName("ReactVirtualized__Grid")[0].removeEventListener("scroll", onScroll);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setState(prv => {
            return {
                ...prv,
                dataArray: data,
                dataArrayFiltered: data
            }
        }, (nextState, SetNextState) => {

            customsearch(nextState.filterText)
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columns, data])

    const _sortList = (params) => {
        let sortByKey = params.sortBy;
        // let sortDirection = params.sortDirection
        let newList = sortBy(state.dataArrayFiltered, [sortByKey]);

        if (state.sortDirection === 'DESC') {
            newList.reverse();
        }
        return newList;
    };

    const _sort = ({ sortBy, sortDirection }) => {
        // let sortByKey = params.sortBy;
        const sortedList = _sortList({ sortBy, sortDirection });
        setState(prv => { return { ...prv, dataArrayFiltered: sortedList, sortDirection: state.sortDirection === 'ASC' ? 'DESC' : 'ASC', sortByKey: sortBy } });
        if (changeParentValues) changeParentValues(sortedList, state.sortDirection === 'ASC' ? 'DESC' : 'ASC', sortBy)
    };

    const onScroll = useCallback(() => {
        let ReactVirtualizedGrid = document.getElementsByClassName(gridClassName)
        let ReactVirtualizedTable = document.getElementById(id)
        let ReactVirtualizedTableHeader = ReactVirtualizedTable.childNodes[0]
        ReactVirtualizedTableHeader.scrollLeft = ReactVirtualizedGrid[0].scrollLeft
        //the following line closes the popover of the "see more" button in the "GeneralLabResults" and "GeneralRadResults" components
        if (toggleDropdown) toggleDropdown(false)
    }, [gridClassName, id]);

    const cols = useRef([]);
    useLayoutEffect(() => {
        cols.current = columns?.map((v, i) => { return { ...v, key: i } })
    }, [columns])

    const rowClass = useCallback(({ index }) => {
        if (index < 0) {
            return rowClassName;
        } else {
            return index % 2 === 0 ? rowClassName + " odd" : rowClassName;
        }
    }, []);

    const colorRows = useCallback(({ index }) => {
        if (index < 0) {
            return null;
        } else {
            return index % 2 === 0 ? "odd" : null;
        }
    }, []);

    useEffect(() => {
        if (state.globalFilter !== globalFilter) {
            customsearch(globalFilter);
            setState(prv => {
                return {
                    ...prv,
                    globalFilter: globalFilter
                }
            })
        }
    }, [globalFilter])

    const customsearch = useCallback((value) => {
        setState(prv => {
            let columnsToFilter = columsToBeFiltered ?? [];
            if (!columsToBeFiltered && columns) {
                map(columns, eachElem => {
                    columnsToFilter.push(eachElem.props.dataKey)
                })
            }
            else {
                columnsToFilter = [...columnsToFilter]
            }

            return {
                ...prv,
                filterText: value,
                dataArrayFiltered: customTableSearch(value, prv.dataArray, columnsToFilter)
            }
        },
            (nextState, setNextState) => {
                // if (triggerPaging && !isTriggeredOnStateChange) {

                //     let mappedFiltration = nextState.OriginalFilter.map(e => {
                //         return {
                //             ...e,
                //             isSelected:
                //                 nextState.selectedFilterOptions.findIndex(e1 => e.columnName === e1.value) > -1
                //         }
                //     }).filter(e => e.isSelected);

                //     let searchOptions = extractSearchOptionsFromState(nextState);

                //     triggerPaging(value.toLowerCase(), mappedFiltration, searchOptions);
                // }
            })

    }, [setState, columns, columsToBeFiltered])

    const handleFilterTextChange = useCallback((value) => {
        customsearch(value);
    }, [customsearch])

    const isMobileSearchBar = typeof window !== 'undefined' && window.innerWidth <= mobileDevicesWidth;

    return (
        <>
            {enableSearch ?
                <>
                    {/* <div className={`${state.dataArrayFiltered?.length > 0 ? "col-12 offset-lg-8 col-lg-4" : "offset-lg-8 col-lg-4"}`}> */}
                    <div
                        style={
                            isMobileSearchBar
                                ? {
                                    width: '100%',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                    float: 'none',
                                    clear: 'both',
                                    padding: '8px 25px 4px',
                                    margin: 0,
                                }
                                : { width: "35%", justifySelf: "right", paddingBottom: '5px' }
                        }
                    >
                        {/* <input type="text" className="form-control form-control-sm " value={state.filterText}
                            onChange={handleFilterTextChange} placeholder="Search ..." /> */}
                        <InputTextComp
                            name="filterText"
                            value={state.filterText}
                            className="form-control"
                            placeholder={languageUsedFiltration.searchPlaceholder ? languageUsedFiltration.searchPlaceholder[language] : 'Search'}
                            handleChange={handleFilterTextChange}
                            style={
                                isMobileSearchBar
                                    ? { fontSize: '15px', margin: '5px 0', borderRadius: '10px', width: '100%', boxSizing: 'border-box' }
                                    : { fontSize: '15px', margin: '5px 0' }
                            }
                        />
                    </div>
                </>
                :
                null
            }
            {(() => {
                const tableTree = (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="columns" direction="horizontal" isDropDisabled={!isDropEnabled}>
                            {
                                (provided) => (
                                    <div ref={provided.innerRef} {...provided.droppableProps}>
                                        <Table
                                            id={id}
                                            gridClassName={gridClassName}
                                            className={classname}
                                            width={width}
                                            height={height}
                                            headerHeight={headerHeight}
                                            rowHeight={rowHeight}
                                            rowCount={state.dataArrayFiltered.length}
                                            rowGetter={({ index }) => state.dataArrayFiltered[index]}
                                            rowClassName={rowClassOverrideFn ?? (rowClassName ? rowClass : colorRows)}
                                            sort={_sort}
                                            sortBy={state.sortByKey}
                                            sortDirection={state.sortDirection}
                                            headerRowRenderer={headerRowRenderer}
                                            deferredMeasurementCache={props.deferredMeasurementCache}
                                        >
                                            {cols.current.length > 0 ? cols.current : null}
                                        </Table>
                                        {provided.placeholder}
                                    </div>

                                )
                            }
                        </Droppable >
                    </DragDropContext>
                );
                if (enableSearch && isMobileSearchBar) {
                    return (
                        <div style={{ clear: 'both', width: '100%', minWidth: 0 }}>
                            {tableTree}
                        </div>
                    );
                }
                return tableTree;
            })()}
        </>
    )

}