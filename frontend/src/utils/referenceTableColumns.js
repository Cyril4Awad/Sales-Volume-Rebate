import React from "react";

import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "./mobileTableCells";



const display = (v) => (v != null && v !== "" ? v : "");

const newRowStyle = { backgroundColor: "#d1e7dd" };

const isNew = (row) => row.targetReferenceId == null;



const cell = (content, row) => (

    <div

        className="w-100 h-100 d-flex align-items-center px-2"

        style={isNew(row) ? newRowStyle : undefined}

    >

        {content}

    </div>

);



const labeledCell = (label, value, row) => {

    const content = mobileDualCell(display(value), mobileLabeledRow(label, display(value)));

    return cell(content, row);

};



export function buildProductGroupColumns({ onRemove }) {

    return [

        {

            Header: "Product Group Code",

            accessor: "grpCode",

            width: 110,

            Cell: (c) => labeledCell("Product Group Code", c.original.grpCode, c.original),

        },

        {

            Header: "Product Group Description",

            accessor: "grpDesc",

            minWidth: 160,

            Cell: (c) => labeledCell("Product Group Description", c.original.grpDesc, c.original),

        },

        {

            Header: "Dept. Code",

            accessor: "itCode",

            width: 100,

            Cell: (c) => labeledCell("Dept. Code", c.original.itCode, c.original),

        },

        {

            Header: "Dept. Description",

            accessor: "itDesc",

            minWidth: 160,

            Cell: (c) => labeledCell("Dept. Description", c.original.itDesc, c.original),

        },

        {

            Header: "",

            accessor: "targetReferenceId",

            width: 88,

            Cell: (c) => (

                <div

                    className="w-100 h-100 d-flex align-items-center px-2"

                    style={isNew(c.original) ? newRowStyle : undefined}

                >

                    {mobileActionRow(

                        <span

                            className="hyperlink-text"

                            style={{ fontSize: 12 }}

                            onClick={() => onRemove(c.original)}

                        >

                            Remove

                        </span>

                    )}

                </div>

            ),

        },

    ];

}



export function buildStockItemColumns({ onRemove }) {

    return [

        {

            Header: "Reference",

            accessor: "stkRef",

            width: 120,

            Cell: (c) => labeledCell("Reference", c.original.stkRef, c.original),

        },

        {

            Header: "Description",

            accessor: "stkDesc",

            minWidth: 180,

            Cell: (c) => labeledCell("Description", c.original.stkDesc, c.original),

        },

        {

            Header: "Barcode",

            accessor: "dbarBarcode",

            width: 130,

            Cell: (c) => labeledCell("Barcode", c.original.dbarBarcode, c.original),

        },

        {

            Header: "Unit",

            accessor: "stkUnit",

            width: 72,

            Cell: (c) => labeledCell("Unit", c.original.stkUnit, c.original),

        },

        {

            Header: "",

            accessor: "targetReferenceId",

            width: 88,

            Cell: (c) => (

                <div

                    className="w-100 h-100 d-flex align-items-center px-2"

                    style={isNew(c.original) ? newRowStyle : undefined}

                >

                    {mobileActionRow(

                        <span

                            className="hyperlink-text"

                            style={{ fontSize: 12 }}

                            onClick={() => onRemove(c.original)}

                        >

                            Remove

                        </span>

                    )}

                </div>

            ),

        },

    ];

}



export function buildUnifiedReferenceColumns({ onRemove }) {

    return buildStockItemColumns({ onRemove });

}

