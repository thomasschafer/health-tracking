import { describe, expect, it } from "vitest";
import { importSessionId, parseCsv, parseSheet } from "./sheet-import.ts";

const pad = (cells: string[]) => [...cells, ...Array<string>(16 - cells.length).fill("")].join(",");

const HEADER = [
  pad(["Averages"]),
  pad(["Systolic", "AM", "125.00"]),
  pad(["Diastolic", "AM", "75.00"]),
  pad(["Systolic", "PM", "130.00"]),
  pad(["Diastolic", "PM", "80.00"]),
  pad(["Date", "Time", "", "Average", "", "1", "", "2", "", "3"]),
  [
    "",
    "",
    "",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Datetime",
    "Avg Systolic AM",
    "Avg Diastolic AM",
    "Avg Systolic PM",
    "Avg Diastolic PM",
  ].join(","),
];

const sheet = (...rows: string[][]) => [...HEADER, ...rows.map(pad)].join("\r\n") + "\r\n";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b,""c"""\r\n1,2\n')).toEqual([
      ["a", 'b,"c"'],
      ["1", "2"],
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('"abc')).toThrow("Unterminated");
  });
});

describe("parseSheet", () => {
  it("imports AM and PM slots, inheriting the date for PM rows", () => {
    const result = parseSheet(
      sheet(
        ["2026/1/15", "AM", "08:40", "125.67", "71.33", "122", "71", "126", "72", "129", "71"],
        ["", "PM", "21:05", "132.00", "76.00", "132", "76"],
        ["2026/1/16", "AM"],
        ["", "PM"],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.emptySlots).toBe(2);
    expect(result.sessions).toEqual([
      {
        id: importSessionId("2026-01-15", "AM"),
        takenAt: "2026-01-15T08:40:00.000Z",
        note: null,
        readings: [
          { systolic: 122, diastolic: 71, heartRate: null },
          { systolic: 126, diastolic: 72, heartRate: null },
          { systolic: 129, diastolic: 71, heartRate: null },
        ],
      },
      {
        id: importSessionId("2026-01-15", "PM"),
        takenAt: "2026-01-15T21:05:00.000Z",
        note: null,
        readings: [{ systolic: 132, diastolic: 76, heartRate: null }],
      },
    ]);
    expect(result.summary).toEqual([
      { label: "Systolic AM", sheetValue: 125 },
      { label: "Diastolic AM", sheetValue: 75 },
      { label: "Systolic PM", sheetValue: 130 },
      { label: "Diastolic PM", sheetValue: 80 },
    ]);
  });

  it("converts summer times from BST", () => {
    const result = parseSheet(sheet(["2026/7/15", "AM", "08:00", "120.00", "80.00", "120", "80"]));
    expect(result.sessions[0]?.takenAt).toBe("2026-07-15T07:00:00.000Z");
  });

  it("files PM readings after midnight on the next calendar day", () => {
    const result = parseSheet(
      sheet(["2026/1/15", "AM"], ["", "PM", "00:30", "120.00", "80.00", "120", "80"]),
    );
    expect(result.sessions[0]?.takenAt).toBe("2026-01-16T00:30:00.000Z");
  });

  it.each([
    [["", "PM", "11:55", "120.00", "80.00", "120", "80"], "doesn't look like a PM reading"],
    [["", "PM", "21:00", "121.00", "80.00", "120", "80"], "doesn't match the readings"],
    [["", "PM", "21:00", "120.00", "80.00", "120", ""], "incomplete"],
    [["", "PM", "", "120.00", "80.00", "120", "80"], "no time"],
    [["", "PM", "21:00", "", "", "", "", "120", "80"], "follows an empty reading"],
    [["", "PM", "21:00", "80.00", "90.00", "80", "90"], "Systolic must be higher than diastolic"],
  ])("reports %j for review instead of importing it", (row, problem) => {
    const result = parseSheet(sheet(["2026/1/15", "AM"], row));
    expect(result.sessions).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.row).toBe(9);
    expect(result.issues[0]?.problem).toContain(problem);
  });

  it("applies resolutions", () => {
    const csv = sheet(
      ["2026/1/15", "AM", "21:24", "120.00", "80.00", "120", "80"],
      ["", "PM"],
      ["2026/1/16", "AM", "08:00", "999.00", "80.00", "120", "80"],
      ["", "PM", "11:55", "130.00", "85.00", "130", "85"],
    );
    const result = parseSheet(csv, [
      { row: 8, action: "fix", label: "PM" },
      { row: 10, action: "skip" },
      { row: 11, action: "fix", time: "23:55" },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.sessions.map((s) => s.takenAt)).toEqual([
      "2026-01-15T21:24:00.000Z",
      "2026-01-16T23:55:00.000Z",
    ]);
  });

  it("rejects resolutions that make two rows the same slot", () => {
    const csv = sheet(
      ["2026/1/15", "AM", "21:24", "120.00", "80.00", "120", "80"],
      ["", "PM", "21:55", "130.00", "85.00", "130", "85"],
    );
    expect(() => parseSheet(csv, [{ row: 8, action: "fix", label: "PM" }])).toThrow(
      "same day and slot",
    );
  });

  it("rejects resolutions for rows that don't exist", () => {
    expect(() => parseSheet(sheet(["2026/1/15", "AM"]), [{ row: 99, action: "skip" }])).toThrow(
      "aren't in the sheet",
    );
  });

  it("fails loudly if the layout changes", () => {
    expect(() => parseSheet(sheet().replace("Averages", "Summary"))).toThrow("Header row 1");
    expect(() => parseSheet(sheet(["2026/1/15", "AM"], ["2026/1/17", "AM"]))).toThrow(
      "doesn't follow",
    );
    expect(() => parseSheet(`${HEADER.join("\n")}\na,b\n`)).toThrow("columns");
  });
});
